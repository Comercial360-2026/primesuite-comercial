-- Documentos colgados de una visita (PDF, Office, CSV, TXT…): misma tabla
-- captura_libre (tipo 'documento'), bucket privado propio y mismos permisos
-- que fotos y audios. Ver docs/diseno-documentos-visita.md.

-- 1) Tipo nuevo + metadatos del archivo original (para descargarlo con su nombre).
alter table public.captura_libre drop constraint captura_libre_tipo_check;
alter table public.captura_libre add constraint captura_libre_tipo_check
  check (tipo = any (array['foto','audio','nota','documento']));
alter table public.captura_libre
  add column if not exists nombre_original text,
  add column if not exists mime text,
  add column if not exists bytes bigint;

-- 2) Bucket privado, 25 MB, solo formatos de documento.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-visita', 'documentos-visita', false, 26214400, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv'
])
on conflict (id) do nothing;

-- 3) Permisos: copia exacta de los de audios-visita.
create policy pol_docs_visita_delete on storage.objects for delete using (
  bucket_id = 'documentos-visita' and (
    exists (select 1 from visita_participante vp
             where vp.visita_id::text = split_part(objects.name, '/', 1) and vp.comercial_id = auth.uid())
    or exists (select 1 from comercial c where c.id = auth.uid() and c.rol = 'direccion_comercial')
  )
);
create policy pol_storage_docs_delete on storage.objects for delete using (
  bucket_id = 'documentos-visita' and exists (
    select 1 from captura_libre cl where cl.storage_path = objects.name and cl.comercial_autor_id = auth.uid()
  )
);
create policy pol_storage_docs_insert on storage.objects for insert with check (
  bucket_id = 'documentos-visita' and fn_comercial_actual_activo()
);
create policy pol_storage_docs_select on storage.objects for select using (
  bucket_id = 'documentos-visita' and (
    owner = auth.uid()
    or fn_rol_lectura_ampliada()
    or fn_rol_actual() = 'direccion_comercial'
    or exists (
      select 1 from captura_libre cl
       where cl.storage_path = objects.name and (
         cl.comercial_autor_id = auth.uid()
         or exists (select 1 from visita v where v.id = cl.visita_id and v.estado_captura = 'consolidada')
         or exists (select 1 from visita_participante vp
                     where vp.visita_id = cl.visita_id and vp.comercial_id = auth.uid() and vp.estado = 'aceptado')
       )
    )
  )
);

-- 4) El espacio (cuota) tiene que contar también los documentos.
create or replace function public.fn_espacio_equipo()
 returns table(usado_total bigint, presupuesto bigint)
 language sql security definer set search_path to 'public'
as $function$
  select
    coalesce(sum((metadata->>'size')::bigint), 0)::bigint,
    ((1024 - 200) * 1024 * 1024)::bigint
  from storage.objects
  where bucket_id in ('fotos-visita', 'audios-visita', 'documentos-visita');
$function$;

create or replace function public.fn_espacio_storage_usado()
 returns bigint
 language sql security definer set search_path to 'public'
as $function$
  select coalesce(sum((metadata->>'size')::bigint), 0)
  from storage.objects
  where bucket_id in ('fotos-visita', 'audios-visita', 'documentos-visita')
    and exists (
      select 1 from comercial
      where id = auth.uid() and rol = 'direccion_comercial'
    );
$function$;

create or replace function public.fn_espacio_por_comercial()
 returns table(comercial_id uuid, nombre text, bytes bigint)
 language sql security definer set search_path to 'public'
as $function$
  select
    c.id as comercial_id,
    c.nombre,
    coalesce((
      select sum((o.metadata->>'size')::bigint)
      from visita v
      join visita_participante vp on vp.visita_id = v.id and vp.comercial_id = c.id and vp.rol = 'responsable'
      left join storage.objects o
        on o.bucket_id in ('fotos-visita', 'audios-visita', 'documentos-visita')
        and split_part(o.name, '/', 1) = v.id::text
    ), 0) as bytes
  from comercial c
  where c.activo = true
    and exists (
      select 1 from comercial c2
      where c2.id = auth.uid() and c2.rol = 'direccion_comercial'
    )
  order by bytes desc;
$function$;

create or replace function public.fn_mis_visitas_espacio()
 returns table(visita_id uuid, cliente_nombre text, creado_en timestamp with time zone, bytes bigint, oportunidades_abiertas bigint)
 language sql security definer set search_path to 'public'
as $function$
  select
    v.id as visita_id,
    cl.nombre as cliente_nombre,
    v.creado_en,
    coalesce(sum((o.metadata->>'size')::bigint), 0) as bytes,
    (
      select count(*) from oportunidad op
      where op.visita_origen_id = v.id and op.etapa <> 'cerrada'
    ) as oportunidades_abiertas
  from visita v
  join cliente cl on cl.id = v.cliente_id
  left join storage.objects o
    on o.bucket_id in ('fotos-visita', 'audios-visita', 'documentos-visita')
    and split_part(o.name, '/', 1) = v.id::text
  where exists (
    select 1 from visita_participante vp
    where vp.visita_id = v.id and vp.comercial_id = auth.uid()
  )
  group by v.id, cl.nombre, v.creado_en
  order by v.creado_en desc;
$function$;

create or replace function public.fn_visitas_liberables_proyecto(p_proyecto_id uuid)
 returns table(visita_id uuid, fecha timestamp with time zone, bytes bigint, oportunidades_abiertas bigint, rutas_storage text[], puede_liberarla boolean)
 language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_autorizado boolean;
begin
  select exists (
    select 1
    from proyecto p
    join cliente c on c.id = p.cliente_id
    where p.id = p_proyecto_id
      and (
        fn_rol_actual() = 'direccion_comercial'
        or c.responsable_id = auth.uid()
        or exists (
          select 1
          from visita v2
          join visita_participante vp on vp.visita_id = v2.id
          where v2.proyecto_id = p_proyecto_id and vp.comercial_id = auth.uid()
        )
      )
  ) into v_autorizado;

  if not v_autorizado then
    raise exception 'No tienes permiso para ver el espacio de este proyecto.';
  end if;

  return query
  select
    v.id,
    v.fecha,
    coalesce((
      select sum((o.metadata->>'size')::bigint)
      from storage.objects o
      where o.bucket_id in ('fotos-visita', 'audios-visita', 'documentos-visita')
        and split_part(o.name, '/', 1) = v.id::text
    ), 0)::bigint,
    (select count(*) from oportunidad op where op.visita_origen_id = v.id and op.etapa <> 'cerrada'),
    (select array_agg(cl.storage_path) from captura_libre cl where cl.visita_id = v.id and cl.storage_path is not null),
    exists (
      select 1 from visita_participante vp
      where vp.visita_id = v.id and vp.comercial_id = auth.uid() and vp.rol = 'responsable'
    ) or fn_rol_actual() = 'direccion_comercial'
  from visita v
  where v.proyecto_id = p_proyecto_id
    and v.estado_captura in ('consolidada', 'cerrada')
  order by v.fecha asc;
end;
$function$;

-- 5) Las confirmaciones de borrado tienen que decir cuántos documentos se van.
drop function if exists public.previsualizar_borrado_visita(uuid);
create function public.previsualizar_borrado_visita(p_visita_id uuid)
 returns table(num_fotos integer, num_audios integer, num_notas integer, num_hallazgos integer, num_oportunidades integer, num_oportunidades_abiertas integer, num_proximos_pasos integer, rutas_storage text[], num_documentos integer)
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
    (select count(*)::int from captura_libre where visita_id = p_visita_id and tipo = 'documento');
end;
$function$;

drop function if exists public.previsualizar_borrado_cliente(uuid);
create function public.previsualizar_borrado_cliente(p_cliente_id uuid)
 returns table(num_visitas integer, num_fotos integer, num_audios integer, num_notas integer, num_hallazgos integer, num_oportunidades integer, num_proximos_pasos integer, num_ubicaciones integer, rutas_storage text[], num_documentos integer)
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
       where v.cliente_id = p_cliente_id and cl.tipo = 'documento')::int;
$function$;
