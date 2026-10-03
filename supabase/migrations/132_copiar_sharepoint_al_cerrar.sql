-- 132: el archivado a SharePoint pasa a dos fases (ver docs/archivado-sharepoint/diseno.md).
--
--   1. COPIAR al cerrar la visita (cron cada 10 min): el archivo se sube a SharePoint
--      y se confirma por tamaño, pero el ORIGINAL SE QUEDA en Supabase. La fila
--      sigue con ubicacion_archivo='supabase' (la app no cambia) y gana
--      ruta_sharepoint + copiada_sharepoint_en.
--   2. LIBERAR a los 30 días del cierre (y al menos 1 día después de copiar): se
--      borra el original de Supabase Storage y ubicacion_archivo pasa a 'sharepoint'.
--
-- Antes todo ocurría de golpe a los 30 días, y las capturas se exigían en
-- estado_subida='completado' — que la app NO ponía nunca (todo quedaba en
-- 'error'), así que no se habría archivado ninguna captura real. Aquí basta
-- con storage_path not null: solo se rellena tras subir el binario con éxito.
-- Los documentos (tipo 'documento', migración 131) entran igual que fotos y audios.

alter table captura_libre add column copiada_sharepoint_en timestamptz;
comment on column captura_libre.copiada_sharepoint_en is
  'Cuándo se confirmó la copia en SharePoint (original aún en Supabase). El original se libera a los 30 días del cierre.';

drop index if exists captura_libre_archivable;
create index captura_libre_sin_copiar on captura_libre (visita_id)
  where ubicacion_archivo = 'supabase' and storage_path is not null and ruta_sharepoint is null
    and tipo in ('foto', 'audio', 'documento');
create index captura_libre_para_liberar on captura_libre (visita_id)
  where ubicacion_archivo = 'supabase' and ruta_sharepoint is not null;

-- FASE 1 — visitas cerradas (a cualquier edad) con algo sin copiar y no "en proceso".
create function fn_visitas_para_copiar()
returns table (visita_id uuid, cliente_id uuid, cliente_nombre text, proyecto_id uuid, proyecto_nombre text, fecha_visita timestamptz)
language sql security definer set search_path = public as $$
  select distinct v.id, c.id, c.nombre, p.id, p.nombre, v.fecha
    from visita v
    join cliente c on c.id = v.cliente_id
    join proyecto p on p.id = v.proyecto_id
    join captura_libre cl on cl.visita_id = v.id
   where v.estado_captura = 'consolidada'
     and v.cerrada_en is not null
     and cl.ubicacion_archivo = 'supabase'
     and cl.storage_path is not null
     and cl.ruta_sharepoint is null
     and cl.tipo in ('foto', 'audio', 'documento')
     and (cl.intento_archivado_en is null or cl.intento_archivado_en < now() - interval '15 minutes');
$$;
revoke all on function fn_visitas_para_copiar() from public, anon, authenticated;
grant execute on function fn_visitas_para_copiar() to service_role;

create function fn_capturas_para_copiar(p_visita_id uuid)
returns table (captura_id uuid, tipo text, storage_path text, storage_path_thumbnail text)
language sql security definer set search_path = public as $$
  select cl.id, cl.tipo, cl.storage_path, cl.storage_path_thumbnail
    from captura_libre cl
   where cl.visita_id = p_visita_id
     and cl.ubicacion_archivo = 'supabase'
     and cl.storage_path is not null
     and cl.ruta_sharepoint is null
     and cl.tipo in ('foto', 'audio', 'documento')
     and (cl.intento_archivado_en is null or cl.intento_archivado_en < now() - interval '15 minutes');
$$;
revoke all on function fn_capturas_para_copiar(uuid) from public, anon, authenticated;
grant execute on function fn_capturas_para_copiar(uuid) to service_role;

-- Confirmación de copia (la llama confirmar-archivado-sharepoint tras comprobar el
-- tamaño). NO toca storage_path ni ubicacion_archivo: el original sigue en Supabase.
create function fn_confirmar_copia_captura(p_captura_id uuid, p_ruta_sharepoint text)
returns void
language sql security definer set search_path = public as $$
  update captura_libre
     set ruta_sharepoint = p_ruta_sharepoint,
         copiada_sharepoint_en = now(),
         intento_archivado_en = null,
         error_archivado = null
   where id = p_captura_id;
$$;
revoke all on function fn_confirmar_copia_captura(uuid, text) from public, anon, authenticated;
grant execute on function fn_confirmar_copia_captura(uuid, text) to service_role;

-- FASE 2 — originales listos para liberar: copia confirmada hace más de 1 día,
-- visita cerrada hace más de 30 días y AÚN cerrada (si se reabrió, no se toca).
-- Solo fotos y audios: la app abre los documentos siempre desde Supabase Storage
-- (aún no sabe abrir un documento archivado), así que sus originales se quedan
-- hasta que la app lo soporte. Su COPIA en SharePoint sí se hace (fase 1).
create function fn_capturas_para_liberar()
returns table (captura_id uuid, visita_id uuid, tipo text, storage_path text, storage_path_thumbnail text)
language sql security definer set search_path = public as $$
  select cl.id, cl.visita_id, cl.tipo, cl.storage_path, cl.storage_path_thumbnail
    from captura_libre cl
    join visita v on v.id = cl.visita_id
   where cl.tipo in ('foto', 'audio')
     and cl.ubicacion_archivo = 'supabase'
     and cl.ruta_sharepoint is not null
     and cl.storage_path is not null
     and cl.copiada_sharepoint_en < now() - interval '1 day'
     and v.estado_captura = 'consolidada'
     and v.cerrada_en is not null
     and v.cerrada_en < now() - interval '30 days';
$$;
revoke all on function fn_capturas_para_liberar() from public, anon, authenticated;
grant execute on function fn_capturas_para_liberar() to service_role;

-- Marca la captura como archivada (solo SharePoint) y devuelve las rutas viejas
-- para que la Edge Function las borre con la Storage API — nunca DELETE FROM
-- storage.objects por SQL (migración 120).
create function fn_liberar_original_captura(p_captura_id uuid)
returns table (tipo text, storage_path_antiguo text, storage_path_thumbnail_antiguo text)
language plpgsql security definer set search_path = public as $$
begin
  return query
    select cl.tipo, cl.storage_path, cl.storage_path_thumbnail
      from captura_libre cl where cl.id = p_captura_id and cl.ubicacion_archivo = 'supabase' and cl.ruta_sharepoint is not null;
  update captura_libre
     set ubicacion_archivo = 'sharepoint', storage_path = null, storage_path_thumbnail = null
   where id = p_captura_id and ubicacion_archivo = 'supabase' and ruta_sharepoint is not null;
end;
$$;
revoke all on function fn_liberar_original_captura(uuid) from public, anon, authenticated;
grant execute on function fn_liberar_original_captura(uuid) to service_role;

-- Cron: cada 10 min, y solo llama al worker si hay algo que copiar o liberar.
select cron.unschedule('procesar-archivado-sharepoint');
select cron.schedule('procesar-archivado-sharepoint', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://umrjzvpbcpzzqmkjahhn.supabase.co/functions/v1/procesar-archivado-sharepoint',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clave-worker', (select decrypted_secret from vault.decrypted_secrets where name = 'briefing_worker_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from fn_visitas_para_copiar())
     or exists (select 1 from fn_capturas_para_liberar());
$$);

-- Las tres funciones de la versión de un solo paso (128) ya no las llama nadie.
drop function fn_visitas_para_archivar();
drop function fn_capturas_para_archivar(uuid);
drop function fn_confirmar_archivado_captura(uuid, text, text);
