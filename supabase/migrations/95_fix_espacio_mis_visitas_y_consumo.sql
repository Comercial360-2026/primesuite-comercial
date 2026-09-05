-- Fix 1: "Mi espacio" mostraba las visitas de TODO el equipo a cualquier
-- Dirección Comercial en vez de solo las propias (contradice el propio
-- título/ayuda de la pantalla: "cuánto ocupan TUS visitas"). Se quita la
-- excepción de rol; el filtro de participación real ya cubre a cualquiera,
-- dirección incluida, que sea participante de la visita.
create or replace function public.fn_mis_visitas_espacio()
returns table(visita_id uuid, cliente_nombre text, creado_en timestamp with time zone, bytes bigint)
language sql
security definer
set search_path to 'public'
as $$
  select
    v.id as visita_id,
    cl.nombre as cliente_nombre,
    v.creado_en,
    coalesce(sum((o.metadata->>'size')::bigint), 0) as bytes
  from visita v
  join cliente cl on cl.id = v.cliente_id
  left join storage.objects o
    on o.bucket_id in ('fotos-visita', 'audios-visita')
    and split_part(o.name, '/', 1) = v.id::text
  where exists (
    select 1 from visita_participante vp
    where vp.visita_id = v.id and vp.comercial_id = auth.uid()
  )
  group by v.id, cl.nombre, v.creado_en
  order by v.creado_en desc;
$$;

-- Fix 2: "Consumo por comercial" contaba el espacio de una visita para
-- CADA participante (responsable + acompañantes), duplicando el total: la
-- suma de todos los comerciales podía superar el total real del equipo.
-- Ahora cada visita se atribuye una única vez, a quien la dirige
-- (rol = 'responsable') — mismo criterio ya usado en
-- fn_actividad_por_comercial.
create or replace function public.fn_espacio_por_comercial()
returns table(comercial_id uuid, nombre text, bytes bigint)
language sql
security definer
set search_path to 'public'
as $$
  select
    c.id as comercial_id,
    c.nombre,
    coalesce((
      select sum((o.metadata->>'size')::bigint)
      from visita v
      join visita_participante vp on vp.visita_id = v.id and vp.comercial_id = c.id and vp.rol = 'responsable'
      left join storage.objects o
        on o.bucket_id in ('fotos-visita', 'audios-visita')
        and split_part(o.name, '/', 1) = v.id::text
    ), 0) as bytes
  from comercial c
  where c.activo = true
    and exists (
      select 1 from comercial c2
      where c2.id = auth.uid() and c2.rol = 'direccion_comercial'
    )
  order by bytes desc;
$$;
