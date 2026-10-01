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

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const BUCKET_POR_TIPO: Record<string, string> = { foto: 'fotos-visita', audio: 'audios-visita' };

function igualesEnTiempoConstante(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

async function tamanoEnStorage(admin: SupabaseClient, bucket: string, ruta: string | null) {
  if (!ruta) return null;
  const i = ruta.lastIndexOf('/');
  const { data } = await admin.storage.from(bucket).list(i < 0 ? '' : ruta.slice(0, i), { search: ruta.slice(i + 1) });
  const f = data?.find((x) => x.name === ruta.slice(i + 1));
  const tam = f?.metadata?.size;
  return typeof tam === 'number' ? tam : null;
}

Deno.serve(async (req) => {
  let body: { secreto?: string; captura_id?: string; ruta_sharepoint?: string; tamano?: number | string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: secretoOk } = await admin.rpc('fn_secreto_power_automate');
  if (!body.secreto || !secretoOk || !igualesEnTiempoConstante(body.secreto, secretoOk)) {
    return json({ error: 'No autorizado' }, 401);
  }

  if (!body.captura_id || !body.ruta_sharepoint) {
    return json({ error: 'Faltan captura_id o ruta_sharepoint' }, 400);
  }

  // Integridad: el original solo se da por archivado si SharePoint guardó
  // exactamente los mismos bytes (mismo tamaño). Sin tamaño o distinto, NO se
  // confirma ni se borra nada: el original sigue en Supabase y el cron reintenta.
  const { data: origen } = await admin
    .from('captura_libre')
    .select('tipo, storage_path, ubicacion_archivo')
    .eq('id', body.captura_id)
    .maybeSingle();
  if (!origen) return json({ error: 'Captura no encontrada' }, 404);
  if (origen.ubicacion_archivo === 'sharepoint') return json({ ok: true, ya_archivada: true });
  const tamanoSubido = Number(body.tamano);
  const tamanoOriginal = await tamanoEnStorage(admin, BUCKET_POR_TIPO[origen.tipo], origen.storage_path);
  if (!tamanoSubido || tamanoOriginal === null || tamanoSubido !== tamanoOriginal) {
    const motivo = `Tamaño no coincide: subido=${body.tamano ?? 'sin dato'} original=${tamanoOriginal ?? 'desconocido'}`;
    await admin.from('captura_libre').update({ error_archivado: motivo }).eq('id', body.captura_id);
    return json({ error: motivo }, 409);
  }

  const { data: fila, error } = await admin.rpc('fn_confirmar_archivado_captura', {
    p_captura_id: body.captura_id,
    p_ruta_sharepoint: body.ruta_sharepoint,
  });
  if (error || !fila?.length) return json({ error: error?.message ?? 'Captura no encontrada' }, 404);

  const { tipo, storage_path_antiguo, storage_path_thumbnail_antiguo } = fila[0];
  // La miniatura no se sube a SharePoint (campo sin lectores hoy); se borra
  // también para no dejarla huérfana al limpiar su ruta en la fila.
  const rutasAntiguas = [storage_path_antiguo, storage_path_thumbnail_antiguo].filter(Boolean) as string[];
  if (rutasAntiguas.length) {
    const bucket = BUCKET_POR_TIPO[tipo];
    const { error: errorBorrado } = await admin.storage.from(bucket).remove(rutasAntiguas);
    // No se revierte el archivado si falla el borrado del original: el
    // archivo ya está a salvo en SharePoint, un huérfano en Supabase
    // Storage es solo un gasto de cuota, no una pérdida de datos.
    if (errorBorrado) console.error(`No se pudo borrar el original de ${bucket}/${storage_path_antiguo}`, errorBorrado);
  }

  return json({ ok: true });
});
