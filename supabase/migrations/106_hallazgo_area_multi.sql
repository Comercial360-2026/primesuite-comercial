-- Prompt maestro 11, Fase 2 — el "área" de un hallazgo.
--
-- Antes: un hallazgo tenía UN `termino_id` (opcional) del catálogo de
-- vocabulario. El comercial solo podía bajar al término exacto; si no lo
-- sabía, no clasificaba.
--
-- Ahora: un hallazgo tiene VARIAS "áreas". Un área es o una CATEGORÍA del
-- catálogo ("Hardware", "Software", "Identificación"…) o un TÉRMINO
-- concreto ("MIFARE › DESFire EV2"). Categoría y término son marcas
-- independientes — se puede marcar "Hardware" y además "MIFARE" a la vez,
-- igual que hoy padre y modelo son tags independientes en el selector.
--
-- Tabla puente `hallazgo_area`: cada fila es UN área de UN hallazgo, con
-- exactamente una de las dos referencias (categoría XOR término) rellena.
-- `on delete cascade` en las tres FKs: si se borra el hallazgo, o el
-- término/categoría (borrado duro; hoy el catálogo solo hace borrado
-- blando con estado_gobierno='descartado'), sus filas de área se van con él.
--
-- `hallazgo.termino_id` se conserva de momento (lo leen los 2 informes PDF
-- hasta la Fase 4 y se retira en la Fase 5); el código de la app deja de
-- escribirlo desde esta fase.

create table public.hallazgo_area (
  id uuid primary key default gen_random_uuid(),
  hallazgo_id uuid not null references public.hallazgo (id) on delete cascade,
  categoria_id uuid references public.categoria_vocabulario (id) on delete cascade,
  termino_id uuid references public.termino (id) on delete cascade,
  creado_en timestamptz not null default now(),
  -- Exactamente una de las dos: o categoría, o término.
  constraint chk_hallazgo_area_una_referencia
    check (num_nonnulls(categoria_id, termino_id) = 1)
);

-- No repetir la misma área en un hallazgo (índices parciales: cada uno
-- cubre las filas de su tipo, donde la otra referencia es NULL).
create unique index uq_hallazgo_area_categoria
  on public.hallazgo_area (hallazgo_id, categoria_id)
  where categoria_id is not null;
create unique index uq_hallazgo_area_termino
  on public.hallazgo_area (hallazgo_id, termino_id)
  where termino_id is not null;

-- Lecturas: por hallazgo (ficha, listas), por término (ecosistema,
-- gobierno del vocabulario) y por categoría (ecosistema por área, Fase 4).
create index ix_hallazgo_area_hallazgo on public.hallazgo_area (hallazgo_id);
create index ix_hallazgo_area_termino
  on public.hallazgo_area (termino_id) where termino_id is not null;
create index ix_hallazgo_area_categoria
  on public.hallazgo_area (categoria_id) where categoria_id is not null;

-- Backfill: cada hallazgo con término hoy pasa a tener ese término como su
-- primera (y única) área.
insert into public.hallazgo_area (hallazgo_id, termino_id)
select id, termino_id
from public.hallazgo
where termino_id is not null;

-- RLS — espejo de `hallazgo`: una fila de área se ve / se toca si su
-- hallazgo se ve / se toca. La RLS de `hallazgo` ya filtra el subselect,
-- así que basta comprobar que el hallazgo padre es visible; para escribir,
-- se exige además ser el autor o Dirección Comercial (misma condición que
-- `pol_hallazgo_update`).
alter table public.hallazgo_area enable row level security;

create policy pol_hallazgo_area_select on public.hallazgo_area
  for select
  using (
    exists (
      select 1 from public.hallazgo h
      where h.id = hallazgo_area.hallazgo_id
    )
  );

create policy pol_hallazgo_area_write on public.hallazgo_area
  for all
  using (
    exists (
      select 1 from public.hallazgo h
      where h.id = hallazgo_area.hallazgo_id
        and (h.comercial_autor_id = auth.uid() or fn_rol_actual() = 'direccion_comercial')
    )
  )
  with check (
    exists (
      select 1 from public.hallazgo h
      where h.id = hallazgo_area.hallazgo_id
        and (h.comercial_autor_id = auth.uid() or fn_rol_actual() = 'direccion_comercial')
    )
  );

-- El "Ecosistema" de la ficha de cliente y el repaso pre-visita agrupan por
-- término. Pasa a leer los términos de la tabla puente en vez de
-- `hallazgo.termino_id`. Las áreas de solo-categoría (un hallazgo marcado
-- únicamente como "Hardware", sin término) no entran en esta vista todavía
-- — igual que hoy un hallazgo sin término no entra (ver migración 105);
-- mostrarlas como EcoTag de categoría es Fase 4.
--
-- Es una VISTA MATERIALIZADA (la refresca cada 10 min el cron
-- `refrescar-ecosistema-actual` con REFRESH ... CONCURRENTLY, que exige el
-- índice único `uq_vw_ecosistema_actual`). No admite `create or replace`:
-- se borra y se vuelve a crear con el mismo nombre — el cron la sigue
-- encontrando — y se rehacen índice único y permisos.
drop materialized view public.vw_ecosistema_actual_cliente;

create materialized view public.vw_ecosistema_actual_cliente as
select distinct on (cr.cliente_maestro_id, tr.termino_maestro_id)
  cr.cliente_maestro_id as cliente_id,
  tr.termino_maestro_id as termino_id,
  h.naturaleza,
  h.nota,
  h.ubicacion_id,
  h.estado_validacion,
  h.creado_en as fecha_hallazgo,
  h.id as hallazgo_id
from public.hallazgo h
  join public.hallazgo_area ha on ha.hallazgo_id = h.id and ha.termino_id is not null
  join public.vw_cliente_resuelto cr on cr.cliente_id = h.cliente_id
  join public.vw_termino_resuelto tr on tr.termino_id = ha.termino_id
order by cr.cliente_maestro_id, tr.termino_maestro_id, h.creado_en desc;

create unique index uq_vw_ecosistema_actual
  on public.vw_ecosistema_actual_cliente (cliente_id, termino_id);

grant select on public.vw_ecosistema_actual_cliente to anon, authenticated, service_role;
