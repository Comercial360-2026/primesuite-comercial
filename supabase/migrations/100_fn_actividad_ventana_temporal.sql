-- Actividad por comercial: ventana temporal opcional (recorrido §8).
--
-- Las dos RPC devolvían totales históricos sin rango de fechas, así que no
-- servían para "¿quién está activo ahora?". Se añade `p_desde timestamptz`
-- (default null = histórico completo, igual que antes). Con una fecha, cada
-- fuente de actividad se filtra por su propia marca de tiempo: la visita
-- por su `fecha`, y hallazgo / captura / oportunidad por su `creado_en`.
--
-- De paso, fn_actividad_por_comercial pasa a ordenar por actividad
-- descendente (antes era alfabético): quien más se mueve, arriba.
--
-- Se hace DROP + CREATE porque añadir un parámetro cambia la firma (un
-- CREATE OR REPLACE dejaría la versión de 0/1 args antigua como overload).

drop function if exists public.fn_actividad_por_comercial();
drop function if exists public.fn_actividad_comercial_por_proyecto(uuid);

create function public.fn_actividad_por_comercial(p_desde timestamptz default null)
returns table (
  comercial_id uuid,
  nombre text,
  num_visitas bigint,
  num_hallazgos bigint,
  num_fotos bigint,
  num_audios bigint,
  num_notas bigint,
  num_oportunidades_creadas bigint,
  num_oportunidades_en_curso bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    co.id as comercial_id,
    co.nombre,
    count(distinct v.id) as num_visitas,
    count(distinct h.id) as num_hallazgos,
    count(distinct cl.id) filter (where cl.tipo = 'foto') as num_fotos,
    count(distinct cl.id) filter (where cl.tipo = 'audio') as num_audios,
    count(distinct cl.id) filter (where cl.tipo = 'nota') as num_notas,
    count(distinct o.id) as num_oportunidades_creadas,
    count(distinct o.id) filter (where o.etapa <> all (array['ganada', 'perdida', 'descartada'])) as num_oportunidades_en_curso
  from comercial co
    left join visita_participante vp on vp.comercial_id = co.id and vp.rol = 'responsable'
    left join visita v on v.id = vp.visita_id and (p_desde is null or v.fecha >= p_desde)
    left join hallazgo h on h.comercial_autor_id = co.id and (p_desde is null or h.creado_en >= p_desde)
    left join captura_libre cl on cl.comercial_autor_id = co.id and (p_desde is null or cl.creado_en >= p_desde)
    left join oportunidad o on o.comercial_autor_id = co.id and (p_desde is null or o.creado_en >= p_desde)
  where co.activo = true
    and exists (select 1 from comercial c2 where c2.id = auth.uid() and c2.rol = 'direccion_comercial')
  group by co.id, co.nombre
  order by
    (count(distinct v.id) + count(distinct h.id) + count(distinct cl.id) + count(distinct o.id)) desc,
    co.nombre;
$$;

create function public.fn_actividad_comercial_por_proyecto(
  p_comercial_id uuid,
  p_desde timestamptz default null
)
returns table (
  proyecto_id uuid,
  proyecto_nombre text,
  es_general boolean,
  cliente_id uuid,
  cliente_nombre text,
  num_visitas bigint,
  num_hallazgos bigint,
  num_fotos bigint,
  num_audios bigint,
  num_notas bigint,
  num_oportunidades_creadas bigint,
  num_oportunidades_en_curso bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with visitas as (
    select v.proyecto_id, count(distinct vp.visita_id) as num_visitas
    from visita_participante vp
    join visita v on v.id = vp.visita_id
    where vp.comercial_id = p_comercial_id and vp.rol = 'responsable'
      and (p_desde is null or v.fecha >= p_desde)
    group by v.proyecto_id
  ),
  hallazgos as (
    select h.proyecto_id, count(distinct h.id) as num_hallazgos
    from hallazgo h
    where h.comercial_autor_id = p_comercial_id
      and (p_desde is null or h.creado_en >= p_desde)
    group by h.proyecto_id
  ),
  capturas as (
    select v.proyecto_id,
      count(distinct cl.id) filter (where cl.tipo = 'foto') as num_fotos,
      count(distinct cl.id) filter (where cl.tipo = 'audio') as num_audios,
      count(distinct cl.id) filter (where cl.tipo = 'nota') as num_notas
    from captura_libre cl
    join visita v on v.id = cl.visita_id
    where cl.comercial_autor_id = p_comercial_id
      and (p_desde is null or cl.creado_en >= p_desde)
    group by v.proyecto_id
  ),
  oportunidades as (
    select o.proyecto_id,
      count(distinct o.id) as num_oportunidades_creadas,
      count(distinct o.id) filter (where o.etapa <> all (array['ganada', 'perdida', 'descartada'])) as num_oportunidades_en_curso
    from oportunidad o
    where o.comercial_autor_id = p_comercial_id
      and (p_desde is null or o.creado_en >= p_desde)
    group by o.proyecto_id
  ),
  claves as (
    select proyecto_id from visitas
    union
    select proyecto_id from hallazgos
    union
    select proyecto_id from capturas
    union
    select proyecto_id from oportunidades
  )
  select
    k.proyecto_id,
    p.nombre as proyecto_nombre,
    p.es_general,
    p.cliente_id,
    c.nombre as cliente_nombre,
    coalesce(vi.num_visitas, 0) as num_visitas,
    coalesce(ha.num_hallazgos, 0) as num_hallazgos,
    coalesce(ca.num_fotos, 0) as num_fotos,
    coalesce(ca.num_audios, 0) as num_audios,
    coalesce(ca.num_notas, 0) as num_notas,
    coalesce(op.num_oportunidades_creadas, 0) as num_oportunidades_creadas,
    coalesce(op.num_oportunidades_en_curso, 0) as num_oportunidades_en_curso
  from claves k
    join proyecto p on p.id = k.proyecto_id
    join cliente c on c.id = p.cliente_id
    left join visitas vi on vi.proyecto_id = k.proyecto_id
    left join hallazgos ha on ha.proyecto_id = k.proyecto_id
    left join capturas ca on ca.proyecto_id = k.proyecto_id
    left join oportunidades op on op.proyecto_id = k.proyecto_id
  where exists (select 1 from comercial c2 where c2.id = auth.uid() and c2.rol = 'direccion_comercial')
  order by
    (coalesce(vi.num_visitas, 0) + coalesce(ha.num_hallazgos, 0) + coalesce(ca.num_fotos, 0)
      + coalesce(ca.num_audios, 0) + coalesce(ca.num_notas, 0) + coalesce(op.num_oportunidades_creadas, 0)) desc,
    p.nombre;
$$;
