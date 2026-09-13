-- Interruptor global "clasificación detallada": si está encendido, Hallazgo,
-- Oportunidad y Anotar dejan elegir categoría, término o modelo del catálogo
-- (SelectorAreas); si está apagado (por defecto), solo categoría entera
-- (SelectorCategorias). Vive en una tabla de ajustes de un solo uso por ahora
-- (clave/valor), en vez de una columna suelta en otra tabla: es un ajuste de
-- app, no un dato de negocio, y da sitio a futuros ajustes globales sin
-- migraciones nuevas de esquema.
create table ajustes_app (
  clave text primary key,
  valor boolean not null,
  actualizado_en timestamptz not null default now()
);

alter table ajustes_app enable row level security;

-- Todos los comerciales activos leen (lo necesitan los 3 formularios);
-- solo Dirección Comercial escribe — mismo patrón que categoria_vocabulario.
create policy pol_ajustes_select on ajustes_app
  for select using (fn_comercial_actual_activo());

create policy pol_ajustes_write on ajustes_app
  for all using (fn_rol_actual() = 'direccion_comercial')
  with check (fn_rol_actual() = 'direccion_comercial');

insert into ajustes_app (clave, valor) values ('clasificacion_detallada', false);
