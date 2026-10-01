-- 134: control del archivado a SharePoint — que nada falle en silencio.
--
-- 1) Retención configurable: días tras el cierre antes de liberar el original
--    (ajustes_app 'archivado_dias_liberar', por defecto 30). Si preocupa tener la
--    copia en SharePoint como única, se sube sin desplegar nada.
-- 2) Copias con reintentos: si un archivo necesitó más de 1 intento, puede haber
--    quedado un duplicado "(reintento …)" en SharePoint (el flujo pudo subirlo y fallar
--    justo la confirmación). Se marca para que Dirección lo vea y lo limpie a mano.
-- 3) fn_estado_archivado(): lo que Dirección ve en Yo → Gestión (archivos sin copiar
--    tras más de 2 h, copias agotadas, posibles duplicados de los últimos 14 días).
-- 4) Los avisos de borrado cuentan los archivos que viven en SharePoint (el borrado
--    de una visita/cliente NO los borra allí).

insert into ajustes_app (clave, valor, valor_numero) values ('archivado_dias_liberar', false, 30) on conflict (clave) do nothing;

alter table captura_libre add column copia_con_reintentos boolean not null default false;

create or replace function fn_confirmar_copia_captura(p_captura_id uuid, p_ruta_sharepoint text)
returns void
language sql security definer set search_path = public as $$
  update captura_libre
     set ruta_sharepoint = p_ruta_sharepoint,
         copiada_sharepoint_en = now(),
         copia_con_reintentos = intentos_archivado > 1,
         intento_archivado_en = null,
         intentos_archivado = 0,
         error_archivado = null
   where id = p_captura_id;
$$;

create or replace function fn_capturas_para_liberar()
returns table (captura_id uuid, visita_id uuid, tipo text, storage_path text, storage_path_thumbnail text)
language sql security definer set search_path = public as $$
  select cl.id, cl.visita_id, cl.tipo, cl.storage_path, cl.storage_path_thumbnail
    from captura_libre cl
    join visita v on v.id = cl.visita_id
   where coalesce((select valor from ajustes_app where clave = 'archivado_liberar_activo'), false)
     and cl.tipo in ('foto', 'audio')
     and cl.ubicacion_archivo = 'supabase'
     and cl.ruta_sharepoint is not null
     and cl.storage_path is not null
     and cl.copiada_sharepoint_en < now() - interval '1 day'
     and v.estado_captura = 'consolidada'
     and v.cerrada_en is not null
     and v.cerrada_en < now() - make_interval(days => coalesce((select valor_numero from ajustes_app where clave = 'archivado_dias_liberar'), 30));
$$;

create function fn_estado_archivado()
returns table (sin_copiar bigint, agotadas bigint, posibles_duplicados bigint)
language sql stable security definer set search_path = public as $$
  select
    count(*) filter (where cl.ruta_sharepoint is null and cl.ubicacion_archivo = 'supabase' and cl.storage_path is not null
                       and cl.tipo in ('foto', 'audio', 'documento') and cl.intentos_archivado < 5
                       and v.cerrada_en < now() - interval '2 hours'),
    count(*) filter (where cl.ruta_sharepoint is null and cl.ubicacion_archivo = 'supabase' and cl.storage_path is not null
                       and cl.tipo in ('foto', 'audio', 'documento') and cl.intentos_archivado >= 5),
    count(*) filter (where cl.copia_con_reintentos and cl.copiada_sharepoint_en > now() - interval '14 days')
  from captura_libre cl
  join visita v on v.id = cl.visita_id
  where fn_rol_actual() = 'direccion_comercial'
    and v.estado_captura = 'consolidada' and v.cerrada_en is not null;
$$;

-- Avisos de borrado: archivos que se conservan en SharePoint.
drop function if exists public.previsualizar_borrado_visita(uuid);
create function public.previsualizar_borrado_visita(p_visita_id uuid)
 returns table(num_fotos integer, num_audios integer, num_notas integer, num_hallazgos integer, num_oportunidades integer, num_oportunidades_abiertas integer, num_proximos_pasos integer, rutas_storage text[], num_documentos integer, num_archivos_sharepoint integer)
 language plpgsql
as $function$
begin
  return query
  select
    (select count(*)::int from captura_libre where visita_id = p_visita_id and tipo = 'foto'),
    (select count(*)::int from captura_libre where visita_id = p_visita_id and tipo = 'audio'),
    (select count(*)::int from captura_libre where visita_id = p_visita_id and tipo = 'nota'),
    (select count(*)::int from hallazgo where visita_id = p_visita_id),
    (select count(*)::int from oportunidad where visita_origen_id = p_visita_id),
    (select count(*)::int from oportunidad where visita_origen_id = p_visita_id and etapa <> 'cerrada'),
    (select count(*)::int from proximo_paso where visita_id = p_visita_id),
    (select array_agg(storage_path) from captura_libre
      where visita_id = p_visita_id and storage_path is not null),
    (select count(*)::int from captura_libre where visita_id = p_visita_id and tipo = 'documento'),
    (select count(*)::int from captura_libre where visita_id = p_visita_id and ruta_sharepoint is not null);
end;
$function$;

drop function if exists public.previsualizar_borrado_cliente(uuid);
create function public.previsualizar_borrado_cliente(p_cliente_id uuid)
 returns table(num_visitas integer, num_fotos integer, num_audios integer, num_notas integer, num_hallazgos integer, num_oportunidades integer, num_proximos_pasos integer, num_ubicaciones integer, rutas_storage text[], num_documentos integer, num_archivos_sharepoint integer)
 language sql security definer set search_path to 'public'
as $function$
  select
    (select count(*) from visita where cliente_id = p_cliente_id)::int,
    (select count(*) from captura_libre cl join visita v on v.id = cl.visita_id
       where v.cliente_id = p_cliente_id and cl.tipo = 'foto')::int,
    (select count(*) from captura_libre cl join visita v on v.id = cl.visita_id
       where v.cliente_id = p_cliente_id and cl.tipo = 'audio')::int,
    (select count(*) from captura_libre cl join visita v on v.id = cl.visita_id
       where v.cliente_id = p_cliente_id and cl.tipo = 'nota')::int,
    (select count(*) from hallazgo h join visita v on v.id = h.visita_id
       where v.cliente_id = p_cliente_id)::int,
    (select count(*) from oportunidad where cliente_id = p_cliente_id)::int,
    (select count(*) from proximo_paso pp join visita v on v.id = pp.visita_id
       where v.cliente_id = p_cliente_id)::int,
    (select count(*) from ubicacion where cliente_id = p_cliente_id)::int,
    (select array_agg(cl.storage_path) from captura_libre cl join visita v on v.id = cl.visita_id
       where v.cliente_id = p_cliente_id and cl.storage_path is not null),
    (select count(*) from captura_libre cl join visita v on v.id = cl.visita_id
       where v.cliente_id = p_cliente_id and cl.tipo = 'documento')::int,
    (select count(*) from captura_libre cl join visita v on v.id = cl.visita_id
       where v.cliente_id = p_cliente_id and cl.ruta_sharepoint is not null)::int;
$function$;

-- Reintento manual desde Yo → Gestión (Dirección): vuelve a poner a 0 los intentos de
-- las copias agotadas; el cron (cada 10 min) las retoma solo.
create function fn_reintentar_archivado()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if fn_rol_actual() <> 'direccion_comercial' then
    raise exception 'Solo Dirección Comercial puede reintentar el archivado.';
  end if;
  update captura_libre
     set intentos_archivado = 0, error_archivado = null, intento_archivado_en = null
   where ruta_sharepoint is null and ubicacion_archivo = 'supabase' and intentos_archivado >= 5;
  get diagnostics n = row_count;
  return n;
end;
$$;
