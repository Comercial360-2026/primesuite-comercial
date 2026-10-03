-- 128: archivado automático de fotos/audios de visitas cerradas a SharePoint
-- (hot/cold storage). Diseño cerrado en docs/archivado-sharepoint/diseno.md.
--
-- Nunca se borra la fila de captura_libre — solo migra el binario, 30 días
-- después de cerrarse la visita que la contiene. `ubicacion_archivo` dice
-- dónde vive AHORA el archivo; storage_path/storage_path_thumbnail se limpian al
-- confirmar el archivado (ya no apuntan a nada, libera el nombre para
-- fn_visitas_liberables_proyecto, migración 116).
--
-- Flujo (cron diario, mismo patrón que procesar-briefings/procesar-consultas,
-- 122/126): `procesar-archivado-sharepoint` selecciona visitas cerradas hace
-- más de 30 días con capturas sin archivar, marca intento_archivado_en (evita
-- que dos pasadas cojan la misma fila) y llama al webhook de Power Automate
-- por visita. Power Automate sube cada archivo y llama de vuelta a
-- `confirmar-archivado-sharepoint` por archivo (no hay respuesta síncrona:
-- archivos grandes pueden tardar más que el timeout de una Edge Function).
-- Regla no negociable: no se borra el original de Supabase Storage hasta
-- tener confirmación de éxito — si Power Automate no confirma, la fila queda
-- con ubicacion_archivo='supabase' e intento_archivado_en vencido (>15 min) y el
-- cron del día siguiente la reintenta.

alter table captura_libre
  add column ubicacion_archivo text not null default 'supabase' check (ubicacion_archivo in ('supabase', 'sharepoint')),
  add column ruta_sharepoint text,
  add column ruta_sharepoint_thumbnail text,
  add column intento_archivado_en timestamptz,
  add column error_archivado text;

comment on column captura_libre.ubicacion_archivo is 'Dónde vive el binario ahora: supabase (storage_path) o sharepoint (ruta_sharepoint).';

-- Solo fotos/audios completos y aún en Supabase pueden archivarse (las notas
-- no tienen binario; 'nota' no entra nunca en estas consultas).
create index captura_libre_archivable on captura_libre (visita_id)
  where ubicacion_archivo = 'supabase' and storage_path is not null and tipo in ('foto', 'audio') and estado_subida = 'completado';

-- Secreto compartido que valida el flujo de Power Automate (campo "secreto"
-- del payload). NO se crea aquí: un valor en el repo es un secreto filtrado.
-- Se crea a mano en Vault con el nombre 'power_automate_shared_secret' y el
-- mismo valor que llevan configurados los dos flujos.

create function fn_secreto_power_automate()
returns text
language sql security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'power_automate_shared_secret';
$$;
revoke all on function fn_secreto_power_automate() from public, anon, authenticated;
grant execute on function fn_secreto_power_automate() to service_role;

create function fn_webhook_power_automate_archivar()
returns text
language sql security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'POWER_AUTOMATE_WEBHOOK_URL';
$$;
revoke all on function fn_webhook_power_automate_archivar() from public, anon, authenticated;
grant execute on function fn_webhook_power_automate_archivar() to service_role;

create function fn_webhook_power_automate_enlace()
returns text
language sql security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'POWER_AUTOMATE_LINK_WEBHOOK_URL';
$$;
revoke all on function fn_webhook_power_automate_enlace() from public, anon, authenticated;
grant execute on function fn_webhook_power_automate_enlace() to service_role;

-- Visitas con algo pendiente de archivar: cerradas (consolidada + cerrada_en)
-- hace más de 30 días, con al menos una captura archivable (índice de arriba)
-- que no esté "en proceso" (intento_archivado_en reciente, <15 min).
create function fn_visitas_para_archivar()
returns table (
  visita_id uuid,
  cliente_id uuid,
  cliente_nombre text,
  proyecto_id uuid,
  proyecto_nombre text,
  fecha_visita timestamptz
)
language sql security definer set search_path = public as $$
  select distinct v.id, c.id, c.nombre, p.id, p.nombre, v.fecha
    from visita v
    join cliente c on c.id = v.cliente_id
    join proyecto p on p.id = v.proyecto_id
    join captura_libre cl on cl.visita_id = v.id
   where v.estado_captura = 'consolidada'
     and v.cerrada_en is not null
     and v.cerrada_en < now() - interval '30 days'
     and cl.ubicacion_archivo = 'supabase'
     and cl.storage_path is not null
     and cl.tipo in ('foto', 'audio')
     and cl.estado_subida = 'completado'
     and (cl.intento_archivado_en is null or cl.intento_archivado_en < now() - interval '15 minutes');
$$;
revoke all on function fn_visitas_para_archivar() from public, anon, authenticated;
grant execute on function fn_visitas_para_archivar() to service_role;

create function fn_capturas_para_archivar(p_visita_id uuid)
returns table (
  captura_id uuid,
  tipo text,
  storage_path text,
  storage_path_thumbnail text
)
language sql security definer set search_path = public as $$
  select cl.id, cl.tipo, cl.storage_path, cl.storage_path_thumbnail
    from captura_libre cl
   where cl.visita_id = p_visita_id
     and cl.ubicacion_archivo = 'supabase'
     and cl.storage_path is not null
     and cl.tipo in ('foto', 'audio')
     and cl.estado_subida = 'completado'
     and (cl.intento_archivado_en is null or cl.intento_archivado_en < now() - interval '15 minutes');
$$;
revoke all on function fn_capturas_para_archivar(uuid) from public, anon, authenticated;
grant execute on function fn_capturas_para_archivar(uuid) to service_role;

create function fn_marcar_intento_archivado(p_captura_ids uuid[])
returns void
language sql security definer set search_path = public as $$
  update captura_libre set intento_archivado_en = now(), error_archivado = null
   where id = any(p_captura_ids);
$$;
revoke all on function fn_marcar_intento_archivado(uuid[]) from public, anon, authenticated;
grant execute on function fn_marcar_intento_archivado(uuid[]) to service_role;

-- Llamada por confirmar-archivado-sharepoint cuando Power Automate confirma
-- un archivo subido. Devuelve las rutas viejas de Supabase Storage (y el
-- tipo, para saber el bucket) para que la Edge Function las borre con la
-- Storage API — nunca DELETE FROM storage.objects por SQL (migración 120).
create function fn_confirmar_archivado_captura(p_captura_id uuid, p_ruta_sharepoint text, p_ruta_sharepoint_thumbnail text default null)
returns table (tipo text, storage_path_antiguo text, storage_path_thumbnail_antiguo text)
language plpgsql security definer set search_path = public as $$
begin
  return query
    select cl.tipo, cl.storage_path, cl.storage_path_thumbnail
      from captura_libre cl where cl.id = p_captura_id;

  update captura_libre
     set ubicacion_archivo = 'sharepoint',
         ruta_sharepoint = p_ruta_sharepoint,
         ruta_sharepoint_thumbnail = p_ruta_sharepoint_thumbnail,
         storage_path = null,
         storage_path_thumbnail = null,
         intento_archivado_en = null,
         error_archivado = null
   where id = p_captura_id;
end;
$$;
revoke all on function fn_confirmar_archivado_captura(uuid, text, text) from public, anon, authenticated;
grant execute on function fn_confirmar_archivado_captura(uuid, text, text) to service_role;
