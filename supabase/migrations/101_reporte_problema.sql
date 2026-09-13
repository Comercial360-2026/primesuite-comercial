-- "Reportar un problema" desde la pantalla "Yo" (recorrido de revisión,
-- §"Yo (comercial)").
--
-- Antes no había ninguna vía dentro de la app para avisar de que algo va
-- mal: el comercial tenía que pillar a Dirección por otro canal. Esta tabla
-- recoge esos partes. `contexto` guarda versión de la app, rol, plataforma
-- y URL para poder reproducir. `resuelto_en` NULL = pendiente; Dirección lo
-- marca visto desde su propia pantalla "Yo" (no hay pantalla aparte).

create table reporte_problema (
  id uuid primary key default gen_random_uuid(),
  comercial_id uuid not null references comercial (id) on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 1 and 2000),
  contexto jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  resuelto_por uuid references comercial (id) on delete set null
);

comment on table reporte_problema is
  'Partes de "algo va mal" que manda un comercial desde la pantalla "Yo". '
  'contexto = {version, build, rol, plataforma, url} para reproducir. '
  'resuelto_en NULL = pendiente; Direccion lo marca visto desde su propia pantalla "Yo".';

create index reporte_problema_pendientes_idx on reporte_problema (creado_en desc)
  where resuelto_en is null;

alter table reporte_problema enable row level security;

-- Cualquier comercial autenticado manda partes en su propio nombre.
create policy pol_reporte_insert on reporte_problema
  for insert to authenticated
  with check (comercial_id = auth.uid());

-- El autor ve los suyos; Direccion ve todos.
create policy pol_reporte_select on reporte_problema
  for select to authenticated
  using (comercial_id = auth.uid() or fn_rol_actual() = 'direccion_comercial');

-- Solo Direccion marca resuelto (o reabre).
create policy pol_reporte_update on reporte_problema
  for update to authenticated
  using (fn_rol_actual() = 'direccion_comercial')
  with check (fn_rol_actual() = 'direccion_comercial');
