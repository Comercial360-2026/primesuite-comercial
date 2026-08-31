-- Dirección Comercial pide a un comercial concreto que libere espacio.
-- El comercial lo ve como un aviso en la app hasta que abre "Mi espacio"
-- (ahí se marca atendido).

create table public.aviso_liberar_espacio (
  id uuid primary key default gen_random_uuid(),
  comercial_id uuid not null references public.comercial(id),
  pedido_por uuid not null references public.comercial(id),
  creado_en timestamptz not null default now(),
  atendido_en timestamptz
);

-- Como mucho un aviso sin atender por comercial: re-pedir no crea otro.
create unique index uq_aviso_liberar_espacio_pendiente
  on public.aviso_liberar_espacio (comercial_id)
  where atendido_en is null;

alter table public.aviso_liberar_espacio enable row level security;

-- El comercial ve los suyos; Dirección Comercial ve todos.
create policy pol_aviso_liberar_select on public.aviso_liberar_espacio
  for select
  using (
    comercial_id = auth.uid()
    or public.fn_rol_actual() = 'direccion_comercial'
  );

-- Solo Dirección Comercial crea, y siempre a nombre propio.
create policy pol_aviso_liberar_insert on public.aviso_liberar_espacio
  for insert
  with check (
    public.fn_rol_actual() = 'direccion_comercial'
    and pedido_por = auth.uid()
  );

-- El comercial marca atendido el suyo (o Dirección Comercial).
create policy pol_aviso_liberar_update on public.aviso_liberar_espacio
  for update
  using (
    comercial_id = auth.uid()
    or public.fn_rol_actual() = 'direccion_comercial'
  );
