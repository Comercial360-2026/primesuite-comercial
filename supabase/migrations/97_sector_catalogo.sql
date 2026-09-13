-- Catálogo de sectores para la ficha de cliente. Antes `cliente.sector`
-- era texto libre sin editor en la UI (siempre vacío). Ahora se elige de
-- esta lista, que Dirección gestiona (añadir / renombrar / ocultar).
-- `cliente.sector` sigue siendo texto (no FK): renombrar aquí NO reescribe
-- los clientes ya guardados — es una lista de sugerencia, no una relación.

create table if not exists sector (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden int not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table sector enable row level security;

create policy "sector: lectura autenticada"
  on sector for select
  to authenticated
  using (true);

create policy "sector: gestion direccion insert"
  on sector for insert
  to authenticated
  with check (exists (select 1 from comercial c where c.id = auth.uid() and c.rol = 'direccion_comercial'));

create policy "sector: gestion direccion update"
  on sector for update
  to authenticated
  using (exists (select 1 from comercial c where c.id = auth.uid() and c.rol = 'direccion_comercial'))
  with check (exists (select 1 from comercial c where c.id = auth.uid() and c.rol = 'direccion_comercial'));

insert into sector (nombre, orden) values
  ('Industria', 10),
  ('Logística', 20),
  ('Hostelería', 30),
  ('Retail', 40),
  ('Sanidad', 50),
  ('Educación', 60),
  ('Administración', 70),
  ('Otro', 999)
on conflict (nombre) do nothing;
