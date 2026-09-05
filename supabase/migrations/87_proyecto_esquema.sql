-- Fase 1 del plan Cliente → Proyecto → Visita: tabla proyecto + columnas
-- proyecto_id (nullable de momento) en visita/hallazgo/oportunidad/proximo_paso
-- + triggers que las derivan automáticamente, para que la app actual (que
-- solo conoce cliente_id/visita_id) siga funcionando sin cambios. El backfill
-- de datos existentes y el NOT NULL final van en las dos migraciones siguientes.

create table public.proyecto (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.cliente(id),
  nombre text not null,
  estado text not null default 'activo' check (estado in ('activo', 'pausado', 'terminado')),
  es_general boolean not null default false,
  valor_estimado numeric,
  descripcion text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Un único "Proyecto General" por cliente (P9).
create unique index ux_proyecto_general_por_cliente
  on public.proyecto (cliente_id)
  where es_general;

create index ix_proyecto_cliente_id on public.proyecto (cliente_id);

alter table public.proyecto enable row level security;

-- Misma visibilidad que cliente (P2: proyecto hereda el modelo del cliente,
-- sin responsable propio) — cualquier comercial activo ve todos los
-- proyectos, igual que ve todos los clientes hoy. Fase 2 añade el resto de
-- políticas (insert/update/delete) cuando exista pantalla para gestionarlos.
create policy pol_proyecto_select on public.proyecto
  for select using (fn_comercial_actual_activo());

create trigger trg_proyecto_actualizado_en
  before update on public.proyecto
  for each row execute function fn_set_actualizado_en();

-- Todo cliente nuevo nace con su "Proyecto General" (P9) — SECURITY DEFINER
-- porque es un invariante del sistema, no una acción del usuario: debe
-- cumplirse pase lo que pase con la visibilidad RLS de quien da de alta el
-- cliente.
create function public.fn_crear_proyecto_general()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.proyecto (cliente_id, nombre, estado, es_general, creado_por)
  values (new.id, 'General', 'activo', true, new.creado_por);
  return new;
end;
$$;

create trigger trg_cliente_crear_proyecto_general
  after insert on public.cliente
  for each row execute function fn_crear_proyecto_general();

-- Columnas proyecto_id, nullable por ahora (se completan en el backfill y se
-- fijan NOT NULL en la migración siguiente).
alter table public.visita add column proyecto_id uuid references public.proyecto(id);
alter table public.oportunidad add column proyecto_id uuid references public.proyecto(id);
alter table public.hallazgo add column proyecto_id uuid references public.proyecto(id);
alter table public.proximo_paso add column proyecto_id uuid references public.proyecto(id);

-- visita: si quien inserta ya conoce proyecto_id (código futuro, Fase 3),
-- ese manda y se sincroniza cliente_id desde él. Si no (código actual, que
-- solo envía cliente_id), se usa el Proyecto General del cliente — así la
-- app de hoy sigue funcionando sin tocarla.
create function public.fn_set_proyecto_id_visita()
returns trigger
language plpgsql
as $$
begin
  if new.proyecto_id is not null then
    select cliente_id into new.cliente_id from public.proyecto where id = new.proyecto_id;
  else
    select id into new.proyecto_id from public.proyecto
      where cliente_id = new.cliente_id and es_general
      limit 1;
  end if;
  return new;
end;
$$;

create trigger trg_visita_proyecto_id
  before insert on public.visita
  for each row execute function fn_set_proyecto_id_visita();

-- hallazgo y proximo_paso: heredan proyecto_id de su visita, mismo patrón
-- que ya usa fn_set_cliente_id_desde_visita para cliente_id.
create function public.fn_set_proyecto_id_desde_visita()
returns trigger
language plpgsql
as $$
begin
  select proyecto_id into new.proyecto_id from public.visita where id = new.visita_id;
  return new;
end;
$$;

create trigger trg_hallazgo_proyecto_id
  before insert on public.hallazgo
  for each row execute function fn_set_proyecto_id_desde_visita();

create trigger trg_paso_proyecto_id
  before insert on public.proximo_paso
  for each row execute function fn_set_proyecto_id_desde_visita();

-- oportunidad: hereda proyecto_id de su visita_origen_id (no tiene columna
-- visita_id, por eso es una función aparte).
create function public.fn_set_proyecto_id_desde_visita_origen()
returns trigger
language plpgsql
as $$
begin
  select proyecto_id into new.proyecto_id from public.visita where id = new.visita_origen_id;
  return new;
end;
$$;

create trigger trg_oportunidad_proyecto_id
  before insert on public.oportunidad
  for each row execute function fn_set_proyecto_id_desde_visita_origen();
