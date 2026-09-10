-- Prompt maestro 11, Fase 4 — el "Ecosistema" también por CATEGORÍA.
--
-- Hasta ahora `vw_ecosistema_actual_cliente` solo listaba TÉRMINOS: un
-- hallazgo marcado únicamente con una categoría ("Hardware", sin bajar al
-- término exacto) no aparecía en el ecosistema de su cliente. Con "Anotar"
-- (PM11) ese es justo el caso normal: el comercial marca la categoría y
-- sigue, sin afinar.
--
-- Ahora la vista emite además UNA fila por cada categoría de solo-categoría,
-- con `termino_id` NULL y `categoria_id` / `categoria_nombre` rellenos.
-- Reglas acordadas (decisión (b) de Cesar):
--   - La fila de categoría se OMITE si el cliente ya tiene un término de esa
--     misma categoría en el ecosistema — el ecosistema se precisa solo y no
--     se muestra "Hardware" al lado de "MIFARE › DESFire EV2".
--   - Se EXCLUYEN los hallazgos archivados, para término y para categoría
--     (antes la vista NO los excluía — descuido previo).
--   - La categoría se pinta en gris tenue frente al término (front:
--     `<EcoTag tipo="categoria">`).
--
-- Sigue siendo VISTA MATERIALIZADA: el cron `refrescar-ecosistema-actual`
-- la refresca cada 10 min con REFRESH ... CONCURRENTLY, que exige un índice
-- único. No admite `create or replace`: se borra y se recrea con el mismo
-- nombre (el cron la sigue encontrando) y se rehacen índice y permisos.
--
-- `hallazgo.termino_id` / `hallazgo.naturaleza` se conservan todavía (los
-- retira la Fase 5); esta vista ya lee las áreas de la tabla puente
-- `hallazgo_area` desde la Fase 2.

drop materialized view public.vw_ecosistema_actual_cliente;

create materialized view public.vw_ecosistema_actual_cliente as
with term_areas as (
  -- Un término por (cliente maestro, término maestro): el hallazgo vivo más
  -- reciente que lo menciona. Igual que la vista anterior, pero excluyendo
  -- los hallazgos archivados.
  select distinct on (cr.cliente_maestro_id, tr.termino_maestro_id)
    cr.cliente_maestro_id as cliente_id,
    tr.termino_maestro_id as termino_id,
    null::uuid            as categoria_id,
    null::text            as categoria_nombre,
    h.naturaleza,
    h.nota,
    h.ubicacion_id,
    h.estado_validacion,
    h.creado_en           as fecha_hallazgo,
    h.id                  as hallazgo_id
  from public.hallazgo h
    join public.hallazgo_area ha on ha.hallazgo_id = h.id and ha.termino_id is not null
    join public.vw_cliente_resuelto cr on cr.cliente_id = h.cliente_id
    join public.vw_termino_resuelto tr on tr.termino_id = ha.termino_id
  where h.archivado_en is null
  order by cr.cliente_maestro_id, tr.termino_maestro_id, h.creado_en desc
),
cats_cubiertas as (
  -- Categorías que ya están representadas por un término en el ecosistema
  -- de cada cliente (para no duplicar la etiqueta de categoría).
  select distinct ta.cliente_id, tmaes.categoria_id
  from term_areas ta
    join public.termino tmaes on tmaes.id = ta.termino_id
  where tmaes.categoria_id is not null
),
cat_areas as (
  select distinct on (cr.cliente_maestro_id, cat.id)
    cr.cliente_maestro_id as cliente_id,
    null::uuid            as termino_id,
    cat.id               as categoria_id,
    cat.nombre           as categoria_nombre,
    h.naturaleza,
    h.nota,
    h.ubicacion_id,
    h.estado_validacion,
    h.creado_en           as fecha_hallazgo,
    h.id                  as hallazgo_id
  from public.hallazgo h
    join public.hallazgo_area ha on ha.hallazgo_id = h.id and ha.categoria_id is not null
    join public.vw_cliente_resuelto cr on cr.cliente_id = h.cliente_id
    join public.categoria_vocabulario cat on cat.id = ha.categoria_id
  where h.archivado_en is null
    and not exists (
      select 1 from cats_cubiertas cc
      where cc.cliente_id = cr.cliente_maestro_id
        and cc.categoria_id = ha.categoria_id
    )
  order by cr.cliente_maestro_id, cat.id, h.creado_en desc
)
select * from term_areas
union all
select * from cat_areas;

-- Índice único para REFRESH ... CONCURRENTLY. `nulls not distinct` (PG15+):
-- así (cliente, termino, NULL) es único de verdad. Las filas de término y
-- las de categoría nunca colisionan (una tiene categoria_id NULL, la otra
-- termino_id NULL) pero cada `distinct on` ya garantiza unicidad dentro de
-- su rama.
create unique index uq_vw_ecosistema_actual
  on public.vw_ecosistema_actual_cliente (cliente_id, termino_id, categoria_id) nulls not distinct;

grant select on public.vw_ecosistema_actual_cliente to anon, authenticated, service_role;
