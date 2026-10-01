// supabase/functions/confirmar-archivado-sharepoint/index.ts
//
// Llamada por el flujo de Power Automate "Archivar visita a SharePoint",
// una vez por archivo subido (dentro de su "Apply to each"), con el mismo
// `secreto` compartido que valida el trigger del flujo (campo del payload,
// no cabecera — así no hace falta tocar el flujo ya construido).
//
// IMPORTANTE para quien configure/revise el flujo: este endpoint confía en
// el campo "secreto" del cuerpo, igual que el trigger — si se audita el
// flujo y se decide añadir también una cabecera, este endpoint no la exige
// hoy.
//
// Regla no negociable (ver diseño): el original de Supabase Storage solo se
// borra AQUÍ, tras la confirmación de éxito — nunca antes. Y siempre con la
// Storage API (`admin.storage...remove`), nunca `DELETE FROM
// storage.objects` por SQL (Supabase lo bloquea, migración 120).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const BUCKET_POR_TIPO: Record<string, string> = { foto: 'fotos-visita', audio: 'audios-visita' };

Deno.serve(async (req) => {
  let body: { secreto?: string; captura_id?: string; ruta_sharepoint?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: secretoOk } = await admin.rpc('fn_secreto_power_automate');
  if (!body.secreto || body.secreto !== secretoOk) return json({ error: 'No autorizado' }, 401);

  if (!body.captura_id || !body.ruta_sharepoint) {
    return json({ error: 'Faltan captura_id o ruta_sharepoint' }, 400);
  }

  const { data: fila, error } = await admin.rpc('fn_confirmar_archivado_captura', {
    p_captura_id: body.captura_id,
    p_ruta_sharepoint: body.ruta_sharepoint,
  });
  if (error || !fila?.length) return json({ error: error?.message ?? 'Captura no encontrada' }, 404);

  const { tipo, storage_path_antiguo } = fila[0];
  if (storage_path_antiguo) {
    const bucket = BUCKET_POR_TIPO[tipo];
    const { error: errorBorrado } = await admin.storage.from(bucket).remove([storage_path_antiguo]);
    // No se revierte el archivado si falla el borrado del original: el
    // archivo ya está a salvo en SharePoint, un huérfano en Supabase
    // Storage es solo un gasto de cuota, no una pérdida de datos.
    if (errorBorrado) console.error(`No se pudo borrar el original de ${bucket}/${storage_path_antiguo}`, errorBorrado);
  }

  return json({ ok: true });
});
