-- Categoría en Oportunidad, con el MISMO mecanismo que Hallazgo.
--
-- Hasta ahora Hallazgo clasificaba con un catálogo simple de categorías
-- (`hallazgo_area`, multi-selección con un toque) y Oportunidad clasificaba
-- con "Términos y soluciones" (`oportunidad_termino`, jerárquico, con
-- roles «lo que ya tiene» / «lo que le proponemos», buscador aparte) — dos
-- mecánicas distintas para la misma idea ("de qué va esto"), sin que hubiera
-- una razón de producto para que fueran diferentes (encontrado por Cesar:
-- "no es lógico que estén de diferente manera"). Se quitó el término/roles
-- de Oportunidad por no tener ningún uso real (0 filas en
-- oportunidad_termino). `oportunidad_area` es la réplica exacta de
-- `hallazgo_area` para que Oportunidad use el mismo selector simple.

create table oportunidad_area (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references oportunidad(id) on delete cascade,
  categoria_id uuid references categoria_vocabulario(id) on delete cascade,
  termino_id uuid references termino(id) on delete cascade,
  creado_en timestamptz not null default now(),
  constraint chk_oportunidad_area_una_referencia check (num_nonnulls(categoria_id, termino_id) = 1)
);

comment on table oportunidad_area is
  'Categorías/términos de una oportunidad — mismo patrón que hallazgo_area, para que Categoría se comporte igual en las dos pantallas.';

alter table oportunidad_area enable row level security;

create policy pol_oportunidad_area_select on oportunidad_area
  for select using (
    exists (select 1 from oportunidad o where o.id = oportunidad_area.oportunidad_id)
  );

create policy pol_oportunidad_area_write on oportunidad_area
  for all using (
    exists (
      select 1 from oportunidad o
      where o.id = oportunidad_area.oportunidad_id
        and (o.comercial_autor_id = auth.uid() or fn_rol_actual() = 'direccion_comercial')
    )
  )
  with check (
    exists (
      select 1 from oportunidad o
      where o.id = oportunidad_area.oportunidad_id
        and (o.comercial_autor_id = auth.uid() or fn_rol_actual() = 'direccion_comercial')
    )
  );
