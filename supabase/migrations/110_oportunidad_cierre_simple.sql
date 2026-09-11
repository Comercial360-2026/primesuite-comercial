-- Simplifica el cierre de Oportunidad: Ganada/Perdida/Descartada + motivo
-- de cierre obligatorio no aportaba nada dentro de la app (el cierre real
-- se lleva en el CRM externo del comercial; ninguna vista ni informe
-- distinguía las tres para nada salvo un KPI "Oportunidades ganadas" del
-- PDF de proyecto, que pasa a contar "Oportunidades cerradas"). Se
-- sustituyen por una sola etapa 'cerrada', sin motivo. No había ninguna
-- fila con etapa ganada/perdida/descartada en el momento de este cambio.
-- Las columnas motivo_cierre/comentario_cierre se dejan (nullable, dejan
-- de usarse) en vez de borrarlas — sin motivo para un cambio irreversible.

alter table oportunidad drop constraint if exists chk_oportunidad_motivo_cierre_obligatorio;
alter table oportunidad drop constraint if exists oportunidad_etapa_check;
alter table oportunidad add constraint oportunidad_etapa_check
  check (etapa = any (array['latente', 'cualificada', 'en_propuesta', 'cerrada']));

-- Sin ningún consumidor en la app (comprobado): dependía de motivo_cierre,
-- que deja de rellenarse.
drop view if exists vw_motivos_perdida;

create or replace view vw_actividad_comercial as
 SELECT co.id AS comercial_id,
    co.nombre,
    count(DISTINCT vp.visita_id) AS num_visitas,
    count(DISTINCT h.id) AS num_hallazgos,
    count(DISTINCT cl.id) FILTER (WHERE (cl.tipo = 'foto'::text)) AS num_fotos,
    count(DISTINCT cl.id) FILTER (WHERE (cl.tipo = 'audio'::text)) AS num_audios,
    count(DISTINCT cl.id) FILTER (WHERE (cl.tipo = 'nota'::text)) AS num_notas,
    count(DISTINCT o.id) AS num_oportunidades_creadas,
    count(DISTINCT o.id) FILTER (WHERE (o.etapa <> 'cerrada'::text)) AS num_oportunidades_en_curso
   FROM ((((comercial co
     LEFT JOIN visita_participante vp ON (((vp.comercial_id = co.id) AND (vp.rol = 'responsable'::text))))
     LEFT JOIN hallazgo h ON ((h.comercial_autor_id = co.id)))
     LEFT JOIN captura_libre cl ON ((cl.comercial_autor_id = co.id)))
     LEFT JOIN oportunidad o ON ((o.comercial_autor_id = co.id)))
  GROUP BY co.id, co.nombre;

create or replace view vw_semaforo_cliente as
 SELECT cr.cliente_maestro_id AS cliente_id,
    cr.cliente_maestro_nombre AS cliente_nombre,
    max(v.fecha) AS ultima_visita,
    count(DISTINCT o.id) FILTER (WHERE (o.etapa <> 'cerrada'::text)) AS oportunidades_activas,
        CASE
            WHEN (count(DISTINCT o.id) FILTER (WHERE (o.etapa <> 'cerrada'::text)) > 0) THEN 'verde'::text
            WHEN (max(v.fecha) >= (now() - '90 days'::interval)) THEN 'amarillo'::text
            ELSE 'rojo'::text
        END AS semaforo
   FROM ((vw_cliente_resuelto cr
     LEFT JOIN visita v ON (((v.cliente_id = cr.cliente_id) AND (v.estado_captura <> 'agendada'::text))))
     LEFT JOIN oportunidad o ON ((o.cliente_id = cr.cliente_id)))
  GROUP BY cr.cliente_maestro_id, cr.cliente_maestro_nombre;

create or replace function public.fn_actividad_por_comercial(p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(comercial_id uuid, nombre text, num_visitas bigint, num_hallazgos bigint, num_fotos bigint, num_audios bigint, num_notas bigint, num_oportunidades_creadas bigint, num_oportunidades_en_curso bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    co.id as comercial_id,
    co.nombre,
    count(distinct v.id) as num_visitas,
    count(distinct h.id) as num_hallazgos,
    count(distinct cl.id) filter (where cl.tipo = 'foto') as num_fotos,
    count(distinct cl.id) filter (where cl.tipo = 'audio') as num_audios,
    count(distinct cl.id) filter (where cl.tipo = 'nota') as num_notas,
    count(distinct o.id) as num_oportunidades_creadas,
    count(distinct o.id) filter (where o.etapa <> 'cerrada') as num_oportunidades_en_curso
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
$function$;

create or replace function public.fn_actividad_comercial_por_proyecto(p_comercial_id uuid, p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(proyecto_id uuid, proyecto_nombre text, cliente_id uuid, cliente_nombre text, num_visitas bigint, num_hallazgos bigint, num_fotos bigint, num_audios bigint, num_notas bigint, num_oportunidades_creadas bigint, num_oportunidades_en_curso bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      count(distinct o.id) filter (where o.etapa <> 'cerrada') as num_oportunidades_en_curso
    from oportunidad o
    where o.comercial_autor_id = p_comercial_id
      and (p_desde is null or o.creado_en >= p_desde)
    group by o.proyecto_id
  ),
  claves as (
    select proyecto_id from visitas
    union select proyecto_id from hallazgos
    union select proyecto_id from capturas
    union select proyecto_id from oportunidades
  )
  select
    k.proyecto_id,
    p.nombre as proyecto_nombre,
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
$function$;
