// supabase/functions/procesar-archivado-sharepoint/index.ts
//
// Worker de archivado a SharePoint (migraciones 128-132). Lo llama pg_cron cada
// 10 min (solo si hay algo que hacer), con `x-clave-worker` validada contra
// Vault (mismo patrón que procesar-briefings/procesar-consultas). Dos fases:
//
// 1. COPIAR (visitas cerradas, a cualquier edad): por cada visita con archivos
//    sin copiar, genera una signed URL corta de Supabase Storage por archivo y
//    llama al webhook de Power Automate ("Archivar visita a SharePoint") con
//    todos los archivos de esa visita. No espera respuesta síncrona — Power
//    Automate confirma archivo a archivo en confirmar-archivado-sharepoint
//    (que comprueba el tamaño y anota la copia, SIN borrar el original). Si
//    el webhook falla o no confirma, intento_archivado_en queda puesto y la
//    siguiente pasada (pasados 15 min) lo reintenta.
// 2. LIBERAR (cierre > 30 días y copia confirmada hace > 1 día): borra el
//    original de Supabase Storage y deja la captura solo en SharePoint.
//
// Cuerpo opcional { visita_id } para procesar solo esa visita (pruebas y
// reintento manual).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const URL_FIRMADA_SEGUNDOS = 60 * 60; // 1h: margen de sobra para que Power Automate descargue.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const BUCKET_POR_TIPO: Record<string, string> = {
  foto: 'fotos-visita',
  audio: 'audios-visita',
  documento: 'documentos-visita',
};

// SharePoint no admite " * : < > ? / \ | en nombres de carpeta, ni acabar en punto o espacio.
function nombreCarpeta(nombre: string) {
  return nombre.replace(/[\\/:*?"<>|#%~&{}]/g, '-').trim().replace(/\.+$/, '');
}

// "Foto 14-32-05.jpg" / "Audio 14-32-05.m4a" (hora de Madrid); un documento
// conserva su nombre original. Si ya hubo un intento previo (Power Automate
// pudo dejar el archivo sin confirmar) se añade un sello: "Create file" de
// SharePoint no sobrescribe (409) y un reintento se atascaría.
function nombreArchivo(
  tipo: string,
  storagePath: string,
  creadoEn: string,
  reintento: boolean,
  usados: Set<string>,
  nombreOriginal?: string | null
) {
  const sello = reintento ? ` (reintento ${new Date().toISOString().replace(/\D/g, '').slice(8, 14)})` : '';
  let base: string;
  let ext: string;
  if (tipo === 'documento' && nombreOriginal) {
    const limpio = nombreCarpeta(nombreOriginal);
    const i = limpio.lastIndexOf('.');
    base = `${i > 0 ? limpio.slice(0, i) : limpio}${sello}`;
    ext = i > 0 ? limpio.slice(i) : '';
  } else {
    const hora = new Date(creadoEn).toLocaleTimeString('es-ES', {
      timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).replace(/:/g, '-');
    base = `${tipo === 'audio' ? 'Audio' : tipo === 'documento' ? 'Documento' : 'Foto'} ${hora}${sello}`;
    ext = storagePath.includes('.') ? storagePath.slice(storagePath.lastIndexOf('.')) : '';
  }
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

  let soloVisita: string | null = null;
  let forzarInforme = false;
  try {
    const cuerpo = await req.json();
    soloVisita = cuerpo?.visita_id ?? null;
    // Solo con visita_id: prueba o reintento manual del informe aunque el interruptor esté apagado.
    forzarInforme = cuerpo?.informe === true;
  } catch {
    /* sin cuerpo: se procesa todo */
  }

  const { data: visitas, error: errorVisitas } = await admin.rpc('fn_visitas_para_copiar');
  if (errorVisitas) return json({ error: errorVisitas.message }, 500);

  const resumen = { visitas: 0, archivos_enviados: 0, errores: 0, originales_liberados: 0, informes_enviados: 0 };

  for (const v of (visitas ?? []).filter((x: { visita_id: string }) => !soloVisita || x.visita_id === soloVisita)) {
    const { data: capturas, error: errorCapturas } = await admin.rpc('fn_capturas_para_copiar', {
      p_visita_id: v.visita_id,
    });
    if (errorCapturas || !capturas?.length) continue;

    // creado_en e intento previo, leídos ANTES de marcar el intento nuevo.
    const { data: meta } = await admin
      .from('captura_libre')
      .select('id, creado_en, intento_archivado_en, nombre_original')
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
          metaPorId.get(c.captura_id)?.nombre_original
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

  // FASE 1b — informe.html de la visita cerrada a su carpeta (interruptor `archivado_informe_activo`).
  // Viaja por el MISMO webhook como un archivo más con captura_id = 'informe:<visita_id>'; el flujo
  // de Power Automate no lo distingue y confirmar-archivado-sharepoint lo reconoce por el prefijo.
  const { data: ajusteInforme } = await admin
    .from('ajustes_app')
    .select('valor')
    .eq('clave', 'archivado_informe_activo')
    .maybeSingle();
  if (ajusteInforme?.valor === true || (!!soloVisita && forzarInforme)) {
    const { data: sinInforme, error: errorInformes } = await admin.rpc('fn_visitas_para_informe');
    if (errorInformes) console.error('No se pudo listar los informes pendientes', errorInformes);
    // Un informe con fotos pesa decenas de MB: pocos por pasada (2 visitas, cada una con PDF y HTML) para no pasarse del tiempo de la función.
    const informesDeEstaPasada = (sinInforme ?? [])
      .filter((x: { visita_id: string }) => !soloVisita || x.visita_id === soloVisita)
      .slice(0, 2);
    for (const v of informesDeEstaPasada) {
      // El intento se cuenta aunque la generación falle antes de llegar al webhook (memoria, tiempo, 5xx): sin esto
      // `informe_intentos` no avanzaba y esa visita se reintentaba cada 10 min para siempre, ocupando una de las 2 plazas.
      let intentoMarcado = false;
      try {
        // Qué formatos faltan: HTML (mapa de fotos, solo se ve descargándolo) y PDF (se previsualiza
        // en SharePoint/Teams). Cada uno se confirma por separado.
        const pedirInforme = async (formato: 'html' | 'pdf') => {
          const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generar-backup-visita`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // El gateway exige un JWT válido; la función se identifica con la clave del worker.
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'x-clave-worker': req.headers.get('x-clave-worker') ?? '',
            },
            body: JSON.stringify({ visitaId: v.visita_id, formato, enSharepoint: true }),
          });
          if (!r.ok) throw new Error(`generar-backup-visita (${formato}) respondió ${r.status}`);
          return (await r.json()) as { url: string; ruta: string };
        };
        // Miniaturas primero (cada llamada tiene presupuesto de CPU): hasta que no quede ninguna pendiente.
        if (v.falta_html || v.falta_pdf) {
          for (let i = 0; i < 8; i++) {
            const rm = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generar-backup-visita`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'x-clave-worker': req.headers.get('x-clave-worker') ?? '',
              },
              body: JSON.stringify({ visitaId: v.visita_id, formato: 'miniaturas' }),
            });
            if (!rm.ok) break; // sin miniaturas el informe va con los originales: más pesado, pero va
            const { pendientes } = (await rm.json()) as { pendientes: number };
            if (!pendientes) break;
          }
        }
        const html = v.falta_html ? await pedirInforme('html') : null;
        const pdf = v.falta_pdf ? await pedirInforme('pdf') : null;

        const { data: carpetas } = await admin.rpc('fn_carpetas_archivado', { p_visita_id: v.visita_id });
        if (!carpetas?.[0]) throw new Error('No se pudieron fijar las carpetas');

        // El nombre lleva la hora de cierre: si la visita se reabre y se cierra otra vez, no choca
        // con el anterior ("Create file" de SharePoint no sobrescribe).
        const cierre = new Date(v.cerrada_en);
        const dia = cierre.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
        const hora = cierre
          .toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false })
          .replace(':', '-');
        // Regeneración de un informe ya copiado: marca de la hora actual para no chocar con el anterior.
        const ahora = new Date()
          .toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
          .replace(/:/g, '');
        const nombreBase = `Informe de la visita (cerrada ${dia} ${hora})${v.copiado_antes ? ` (rev ${ahora})` : ''}`;

        const archivos = [
          ...(pdf
            ? [{ captura_id: `informe-pdf:${v.visita_id}`, tipo: 'informe', nombre_archivo: `${nombreBase}.pdf`, url_origen: pdf.url }]
            : []),
          ...(html
            ? [{ captura_id: `informe:${v.visita_id}`, tipo: 'informe', nombre_archivo: `${nombreBase}.html`, url_origen: html.url }]
            : []),
        ];

        await admin.rpc('fn_marcar_intento_informe', {
          p_visita_id: v.visita_id,
          p_html_path: html?.ruta ?? null,
          p_pdf_path: pdf?.ruta ?? null,
        });
        intentoMarcado = true;
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
            fecha_visita: String(v.fecha_visita).slice(0, 10),
            carpeta_cliente: carpetas[0].carpeta_cliente,
            carpeta_proyecto: carpetas[0].carpeta_proyecto,
            carpeta_visita: carpetas[0].carpeta_visita,
            archivos,
          }),
        });
        if (!r.ok) throw new Error(`Power Automate respondió ${r.status}`);
        await r.body?.cancel();
        resumen.informes_enviados += archivos.length;
      } catch (e) {
        // Se reintenta pasados 15 min, hasta 5 veces (fn_visitas_para_informe).
        console.error(`No se pudo archivar el informe de la visita ${v.visita_id}`, e);
        if (!intentoMarcado) {
          await admin.rpc('fn_marcar_intento_informe', { p_visita_id: v.visita_id, p_html_path: null, p_pdf_path: null, p_error: String(e) });
        } else {
          // Intento ya contado antes de llamar al flujo (p. ej. Power Automate respondió 5xx): solo se anota el motivo.
          await admin.from('visita').update({ informe_error: String(e).slice(0, 500) }).eq('id', v.visita_id);
        }
        resumen.errores++;
      }
    }
  }

  // FASE 2 — liberar los originales cuya copia lleva > 1 día y cuya visita se
  // cerró hace > 30 días. Primero se marca la fila (solo SharePoint) y después
  // se borra el archivo con la Storage API: si el borrado falla queda un
  // huérfano (gasto de cuota), nunca una pérdida de datos.
  const { data: aLiberar, error: errorLiberar } = await admin.rpc('fn_capturas_para_liberar');
  if (errorLiberar) console.error('No se pudo listar lo que liberar', errorLiberar);
  for (const c of (aLiberar ?? []).filter((x: { visita_id: string }) => !soloVisita || x.visita_id === soloVisita)) {
    const { data: fila, error: errorFila } = await admin.rpc('fn_liberar_original_captura', { p_captura_id: c.captura_id });
    if (errorFila || !fila?.length) continue;
    const rutas = [fila[0].storage_path_antiguo, fila[0].storage_path_thumbnail_antiguo].filter(Boolean) as string[];
    if (rutas.length) {
      const bucket = BUCKET_POR_TIPO[fila[0].tipo];
      const { error: errorBorrado } = await admin.storage.from(bucket).remove(rutas);
      if (errorBorrado) console.error(`No se pudo borrar el original de ${bucket}/${rutas[0]}`, errorBorrado);
    }
    resumen.originales_liberados++;
  }

  return json(resumen);
});
