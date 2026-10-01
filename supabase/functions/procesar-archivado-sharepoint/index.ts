// supabase/functions/procesar-archivado-sharepoint/index.ts
//
// Worker de archivado a SharePoint (migración 128). Lo llama pg_cron una vez
// al día (solo si hay algo que archivar), con `x-clave-worker` validada
// contra Vault (mismo patrón que procesar-briefings/procesar-consultas).
//
// Por cada visita cerrada hace más de 30 días con capturas sin archivar:
// genera una signed URL corta de Supabase Storage por archivo y llama al
// webhook de Power Automate ("Archivar visita a SharePoint") con todos los
// archivos de esa visita de una vez. No espera respuesta síncrona — Power
// Automate confirma archivo a archivo llamando a confirmar-archivado-
// sharepoint cuando termina de subirlo (puede tardar minutos). Si el webhook
// falla o Power Automate nunca confirma, intento_archivado_en queda puesto y
// la siguiente pasada (al día siguiente, pasados los 15 min de margen) lo
// reintenta — nunca se borra el original sin confirmación.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const URL_FIRMADA_SEGUNDOS = 60 * 60; // 1h: margen de sobra para que Power Automate descargue.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const BUCKET_POR_TIPO: Record<string, string> = { foto: 'fotos-visita', audio: 'audios-visita' };

// SharePoint no admite " * : < > ? / \ | en nombres de carpeta, ni acabar en punto o espacio.
function nombreCarpeta(nombre: string) {
  return nombre.replace(/[\\/:*?"<>|#%~&{}]/g, '-').trim().replace(/\.+$/, '');
}

// "Foto 14-32-05.jpg" / "Audio 14-32-05.m4a" (hora de Madrid). Si ya hubo un intento
// previo (Power Automate pudo dejar el archivo sin confirmar) se añade un sello:
// "Create file" de SharePoint no sobrescribe (409) y un reintento se atascaría.
function nombreArchivo(tipo: string, storagePath: string, creadoEn: string, reintento: boolean, usados: Set<string>) {
  const hora = new Date(creadoEn).toLocaleTimeString('es-ES', {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).replace(/:/g, '-');
  const ext = storagePath.includes('.') ? storagePath.slice(storagePath.lastIndexOf('.')) : '';
  const base = `${tipo === 'audio' ? 'Audio' : 'Foto'} ${hora}${reintento ? ` (reintento ${new Date().toISOString().replace(/\D/g, '').slice(8, 14)})` : ''}`;
  let nombre = `${base}${ext}`;
  for (let n = 2; usados.has(nombre); n++) nombre = `${base} (${n})${ext}`;
  usados.add(nombre);
  return nombre;
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: claveOk } = await admin.rpc('fn_clave_worker_valida', {
    p_clave: req.headers.get('x-clave-worker') ?? '',
  });
  if (claveOk !== true) return json({ error: 'No autorizado' }, 401);

  const [{ data: webhookUrl }, { data: secreto }] = await Promise.all([
    admin.rpc('fn_webhook_power_automate_archivar'),
    admin.rpc('fn_secreto_power_automate'),
  ]);
  if (!webhookUrl || !secreto) return json({ error: 'Falta configuración del webhook de archivado.' }, 500);

  const { data: visitas, error: errorVisitas } = await admin.rpc('fn_visitas_para_archivar');
  if (errorVisitas) return json({ error: errorVisitas.message }, 500);

  const resumen = { visitas: 0, archivos_enviados: 0, errores: 0 };

  for (const v of visitas ?? []) {
    const { data: capturas, error: errorCapturas } = await admin.rpc('fn_capturas_para_archivar', {
      p_visita_id: v.visita_id,
    });
    if (errorCapturas || !capturas?.length) continue;

    // creado_en e intento previo, leídos ANTES de marcar el intento nuevo.
    const { data: meta } = await admin
      .from('captura_libre')
      .select('id, creado_en, intento_archivado_en')
      .in('id', capturas.map((c: { captura_id: string }) => c.captura_id));
    const metaPorId = new Map((meta ?? []).map((m) => [m.id, m]));
    const usados = new Set<string>();

    const archivos = [];
    for (const c of capturas) {
      const bucket = BUCKET_POR_TIPO[c.tipo];
      const { data: firmada } = await admin.storage.from(bucket).createSignedUrl(c.storage_path, URL_FIRMADA_SEGUNDOS);
      if (!firmada) continue;
      archivos.push({
        captura_id: c.captura_id,
        tipo: c.tipo,
        nombre_archivo: nombreArchivo(
          c.tipo,
          c.storage_path,
          metaPorId.get(c.captura_id)?.creado_en ?? new Date().toISOString(),
          !!metaPorId.get(c.captura_id)?.intento_archivado_en,
          usados,
        ),
        url_origen: firmada.signedUrl,
      });
    }
    if (!archivos.length) continue;

    // Marcar "en proceso" ANTES de llamar al webhook: evita que una segunda
    // pasada del cron (o un reintento manual) coja la misma fila a la vez.
    await admin.rpc('fn_marcar_intento_archivado', { p_captura_ids: archivos.map((a) => a.captura_id) });

    // Carpetas legibles (migración 130): se fijan la primera vez y se reutilizan.
    const { data: carpetas, error: errorCarpetas } = await admin.rpc('fn_carpetas_archivado', {
      p_visita_id: v.visita_id,
    });
    if (errorCarpetas || !carpetas?.[0]) {
      console.error(`No se pudieron fijar las carpetas de la visita ${v.visita_id}`, errorCarpetas);
      resumen.errores++;
      continue;
    }

    try {
      const r = await fetch(webhookUrl as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secreto,
          visita_id: v.visita_id,
          cliente_id: v.cliente_id,
          cliente_nombre: nombreCarpeta(v.cliente_nombre),
          proyecto_id: v.proyecto_id,
          proyecto_nombre: nombreCarpeta(v.proyecto_nombre),
          // Solo la fecha: ":" y "+" del timestamp completo no valen en una carpeta de SharePoint.
          fecha_visita: String(v.fecha_visita).slice(0, 10),
          // Nombres de carpeta definitivos; el flujo de Power Automate los usa tal cual.
          carpeta_cliente: carpetas[0].carpeta_cliente,
          carpeta_proyecto: carpetas[0].carpeta_proyecto,
          carpeta_visita: carpetas[0].carpeta_visita,
          archivos,
        }),
      });
      if (!r.ok) throw new Error(`Power Automate respondió ${r.status}`);
      await r.body?.cancel();
      resumen.visitas++;
      resumen.archivos_enviados += archivos.length;
    } catch (e) {
      // No se marca error en la fila: intento_archivado_en ya quedó puesto y
      // la siguiente pasada (pasados los 15 min) la reintenta sola.
      console.error(`No se pudo archivar la visita ${v.visita_id}`, e);
      resumen.errores++;
    }
  }

  return json(resumen);
});
