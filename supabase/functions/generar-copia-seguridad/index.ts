// supabase/functions/generar-copia-seguridad/index.ts
//
// Copia de seguridad de las TABLAS (filas, no archivos) a SharePoint. La llama:
//  · pg_cron cada día a las 03:30 con `x-clave-worker`: solo actúa si no hay una copia confirmada
//    de hace < 7 días ni una enviada hace < 30 min (si el flujo falló, reintenta al día siguiente);
//  · Dirección desde Yo → «Hacer copia ahora» con su sesión (`forzar`: salta la comprobación).
// Lee todo con service_role (la copia hecha desde el navegador solo traía lo que veía quien pulsaba),
// sube el JSON a `backups-visita` (se borra a las 2 h) y lo manda por el MISMO webhook de Power
// Automate PROPIO de copias («PrimeSuite - Subir copia de seguridad», webhook en Vault como
// POWER_AUTOMATE_WEBHOOK_COPIA_URL): carpeta fija `PrimeNotes/Copias de seguridad/Base de datos/Últimas copias/`. El flujo
// confirma en confirmar-archivado-sharepoint (captura_id = 'copia:<registro_id>', compara tamaños).
// El JSON se cifra (híbrido AES-GCM + RSA-OAEP, _shared/cifrar-copia.ts) antes de salir del servidor.
// Desplegar con --no-verify-jwt (el cron no manda JWT); la autenticación es la de abajo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { limpiarBackupsCaducados } from '../_shared/limpiar-backups.ts';
import { cifrarCopia } from '../_shared/cifrar-copia.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-clave-worker',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// Tabla → columnas de orden (clave primaria): la paginación necesita un orden estable.
// No entran crm_* (se recargan a diario desde el CRM) ni consulta_ia.
const TABLAS: Record<string, string[]> = {
  cliente: ['id'],
  comercial: ['id'],
  visita: ['id'],
  visita_participante: ['id'],
  visita_interlocutor: ['visita_id', 'interlocutor_id'],
  interlocutor: ['id'],
  hallazgo: ['id'],
  captura_libre: ['id'],
  oportunidad: ['id'],
  oportunidad_visita_seguimiento: ['id'],
  oportunidad_area: ['id'],
  proximo_paso: ['id'],
  termino: ['id'],
  ubicacion: ['id'],
  proyecto: ['id'],
  hallazgo_area: ['id'],
  oportunidad_termino: ['oportunidad_id', 'termino_id', 'rol_en_oportunidad'],
  zona_visita: ['visita_id', 'zona_clave'],
  categoria_vocabulario: ['id'],
  sector: ['id'],
  briefing_visita: ['visita_id'],
  visita_solicitud_reapertura: ['id'],
  ajustes_app: ['clave'],
};
const PAGINA = 1000;
const DIAS_ENTRE_COPIAS = 7;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // --- Quién llama ---
  let creadoPor: string | null = null;
  let forzar = false;
  const claveWorker = req.headers.get('x-clave-worker');
  if (claveWorker) {
    const { data: ok } = await admin.rpc('fn_clave_worker_valida', { p_clave: claveWorker });
    if (ok !== true) return json({ error: 'No autorizado' }, 401);
  } else {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No autenticado' }, 401);
    const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u, error: eu } = await usuario.auth.getUser();
    if (eu || !u.user) return json({ error: 'Sesión no válida' }, 401);
    const { data: com } = await admin.from('comercial').select('rol').eq('id', u.user.id).single();
    if (com?.rol !== 'direccion_comercial') return json({ error: 'Solo Dirección puede hacer la copia.' }, 403);
    creadoPor = u.user.id;
    forzar = true;
  }

  // --- ¿Toca? (el cron pregunta cada día; el botón no pregunta) ---
  const ahora = Date.now();
  const { data: recientes } = await admin
    .from('registro_backup_completo')
    .select('estado, creado_en')
    .or(`and(estado.eq.confirmada,creado_en.gt.${new Date(ahora - DIAS_ENTRE_COPIAS * 864e5 + 3_600_000).toISOString()}),and(estado.eq.enviada,creado_en.gt.${new Date(ahora - 30 * 60_000).toISOString()})`)
    .limit(1);
  if (recientes?.length && !(forzar && recientes[0].estado === 'confirmada')) {
    return json({ ok: true, omitida: true });
  }
  // Las enviadas hace > 30 min sin confirmar no llegaron: se marcan fallidas (la UI las muestra).
  await admin
    .from('registro_backup_completo')
    .update({ estado: 'fallida', error: 'Sin confirmación de SharePoint tras 30 min' })
    .eq('estado', 'enviada')
    .lt('creado_en', new Date(ahora - 30 * 60_000).toISOString());

  const [{ data: webhookUrl }, { data: secreto }] = await Promise.all([
    admin.rpc('fn_webhook_power_automate_copia'),
    admin.rpc('fn_secreto_power_automate'),
  ]);
  if (!webhookUrl || !secreto) return json({ error: 'Falta configuración del webhook de archivado.' }, 500);
  // Sin clave pública no se sube nada: nunca una copia en claro.
  const clavePublica = Deno.env.get('COPIA_CLAVE_PUBLICA');
  if (!clavePublica) return json({ error: 'Falta COPIA_CLAVE_PUBLICA (cifrado de la copia).' }, 500);

  const { data: reg, error: errReg } = await admin
    .from('registro_backup_completo')
    .insert({ creado_por: creadoPor, origen: forzar ? 'manual' : 'automatica', estado: 'enviada' })
    .select('id')
    .single();
  if (errReg || !reg) return json({ error: errReg?.message ?? 'No se pudo registrar la copia' }, 500);
  const fallar = async (mensaje: string, status = 500) => {
    await admin.from('registro_backup_completo').update({ estado: 'fallida', error: mensaje }).eq('id', reg.id);
    return json({ error: mensaje }, status);
  };

  try {
    // --- Leer todo, por páginas (PostgREST corta en 1000 filas) ---
    // ponytail: todo el JSON en memoria; unas decenas de MB es el techo (límite del bucket: 50 MB).
    // Si se acerca, partir por tabla en varios archivos.
    const tablas: Record<string, unknown> = {};
    const filas: Record<string, number> = {};
    for (const [tabla, orden] of Object.entries(TABLAS)) {
      const todas: unknown[] = [];
      for (let desde = 0; ; desde += PAGINA) {
        let q = admin.from(tabla).select('*');
        for (const c of orden) q = q.order(c);
        const { data, error } = await q.range(desde, desde + PAGINA - 1);
        if (error) throw new Error(`${tabla}: ${error.message}`);
        todas.push(...(data ?? []));
        if ((data?.length ?? 0) < PAGINA) break;
      }
      tablas[tabla] = todas;
      filas[tabla] = todas.length;
    }

    const ahoraDate = new Date(ahora);
    const fecha = ahoraDate.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
    const hora = ahoraDate
      .toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false })
      .replace(':', '');
    const bytes = await cifrarCopia(
      new TextEncoder().encode(JSON.stringify({ generado_en: ahoraDate.toISOString(), filas, tablas })),
      clavePublica,
    );
    const storagePath = `copias/${reg.id}.json`;
    const { error: errSubida } = await admin.storage
      .from('backups-visita')
      .upload(storagePath, bytes, { contentType: 'application/octet-stream', upsert: true });
    if (errSubida) throw new Error(`Subida a Storage: ${errSubida.message}`);
    const { data: firmada } = await admin.storage.from('backups-visita').createSignedUrl(storagePath, 3600);
    if (!firmada) throw new Error('No se pudo firmar la URL del archivo');
    await admin
      .from('registro_backup_completo')
      .update({ storage_path: storagePath, tamano: bytes.length, filas })
      .eq('id', reg.id);

    // --- Al flujo PROPIO de copias («PrimeSuite - Subir copia de seguridad»): la carpeta de destino
    // (PrimeNotes/Copias de seguridad/Base de datos/Últimas copias) está fija en el flujo, no en
    // carpeta_*; esos campos se siguen mandando porque el flujo es copia del de visitas y su esquema los trae. ---
    const r = await fetch(webhookUrl as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secreto,
        visita_id: reg.id,
        carpeta_cliente: 'Copias de seguridad',
        // Sin efecto en la ruta (fija en el flujo). El flujo «PrimeSuite - Rotar copias de seguridad»
        // conserva las 8 más recientes por nombre (AAAA-MM-DD-HHMM) y borra el resto.
        carpeta_proyecto: 'Base de datos',
        carpeta_visita: 'Últimas copias',
        archivos: [
          {
            captura_id: `copia:${reg.id}`,
            tipo: 'copia',
            nombre_archivo: `primenotes-copia-${fecha}-${hora}.json.enc`,
            url_origen: firmada.signedUrl,
          },
        ],
      }),
    });
    if (!r.ok) throw new Error(`Power Automate respondió ${r.status}`);
    await r.body?.cancel();
  } catch (e) {
    console.error('Copia de seguridad fallida', e);
    return await fallar(e instanceof Error ? e.message : 'Error desconocido');
  } finally {
    await limpiarBackupsCaducados(admin);
  }
  return json({ ok: true, registro_id: reg.id });
});
