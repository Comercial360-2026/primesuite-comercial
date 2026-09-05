-- Actividad por comercial (Dirección Comercial): totales generales y
-- desglose por proyecto. Sustituye el uso directo de vw_actividad_comercial
-- (grant SELECT abierto a anon/authenticated, nunca consumida desde el
-- frontend) por RPCs SECURITY DEFINER que comprueban el rol internamente,
-- mismo patrón que fn_espacio_por_comercial.

create or replace function public.fn_actividad_por_comercial()
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
    count(distinct vp.visita_id) as num_visitas,
    count(distinct h.id) as num_hallazgos,
    count(distinct cl.id) filter (where cl.tipo = 'foto') as num_fotos,
    count(distinct cl.id) filter (where cl.tipo = 'audio') as num_audios,
    count(distinct cl.id) filter (where cl.tipo = 'nota') as num_notas,
    count(distinct o.id) as num_oportunidades_creadas,
    count(distinct o.id) filter (where o.etapa <> all (array['ganada', 'perdida', 'descartada'])) as num_oportunidades_en_curso
  from comercial co
    left join visita_participante vp on vp.comercial_id = co.id and vp.rol = 'responsable'
    left join hallazgo h on h.comercial_autor_id = co.id
    left join captura_libre cl on cl.comercial_autor_id = co.id
    left join oportunidad o on o.comercial_autor_id = co.id
  where co.activo = true
    and exists (select 1 from comercial c2 where c2.id = auth.uid() and c2.rol = 'direccion_comercial')
  group by co.id, co.nombre
  order by co.nombre;
$$;

create or replace function public.fn_actividad_comercial_por_proyecto(p_comercial_id uuid)
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
    group by v.proyecto_id
  ),
  hallazgos as (
    select h.proyecto_id, count(distinct h.id) as num_hallazgos
    from hallazgo h
    where h.comercial_autor_id = p_comercial_id
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
    group by v.proyecto_id
  ),
  oportunidades as (
    select o.proyecto_id,
      count(distinct o.id) as num_oportunidades_creadas,
      count(distinct o.id) filter (where o.etapa <> all (array['ganada', 'perdida', 'descartada'])) as num_oportunidades_en_curso
    from oportunidad o
    where o.comercial_autor_id = p_comercial_id
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

-- Hallazgo de seguridad encontrado de paso: vw_actividad_comercial tenía
-- SELECT abierto a anon/authenticated (cualquiera con la clave pública podía
-- leer la actividad de todos los comerciales), y nunca se consumía desde el
-- frontend. Se cierra el acceso; las RPCs de arriba la sustituyen.
revoke select on public.vw_actividad_comercial from anon, authenticated;
