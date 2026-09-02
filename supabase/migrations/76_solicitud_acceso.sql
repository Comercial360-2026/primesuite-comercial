-- Fase 6a — "He perdido el acceso" desde el login.
--
-- Un comercial que no puede entrar (contraseña perdida, enlace de alta
-- caducado) no tiene sesión, así que no puede escribir en ninguna tabla.
-- Deja constancia por la Edge Function `gestionar-comercial`
-- (accion 'solicitar_acceso', sin auth, con service role) y Dirección
-- Comercial la ve en la app y le regenera el enlace de acceso.

create table public.solicitud_acceso (
  id uuid primary key default gen_random_uuid(),
  comercial_id uuid not null references public.comercial(id) on delete cascade,
  email text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'resuelta')),
  creado_en timestamptz not null default now(),
  resuelto_por uuid references public.comercial(id),
  resuelto_en timestamptz
);

-- Como mucho una petición sin resolver por comercial: volver a pedirlo no
-- crea otra (mismo patrón que aviso_liberar_espacio).
create unique index uq_solicitud_acceso_pendiente
  on public.solicitud_acceso (comercial_id)
  where estado = 'pendiente';

alter table public.solicitud_acceso enable row level security;

-- Solo Dirección Comercial la ve y la marca resuelta. La creación la hace
-- la Edge Function con la clave de servicio (el solicitante no tiene
-- sesión), que salta RLS.
create policy pol_solicitud_acceso_select on public.solicitud_acceso
  for select
  using (public.fn_rol_actual() = 'direccion_comercial');

create policy pol_solicitud_acceso_update on public.solicitud_acceso
  for update
  using (public.fn_rol_actual() = 'direccion_comercial')
  with check (public.fn_rol_actual() = 'direccion_comercial');
