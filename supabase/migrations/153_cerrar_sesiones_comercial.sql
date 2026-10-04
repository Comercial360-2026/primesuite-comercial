-- Dar de baja a un comercial le cierra también las sesiones abiertas.
--
-- Bloquear (ban) impide iniciar sesión nuevas y refrescar, pero una sesión ya abierta
-- seguía viva hasta que su token caducara. Borrar sus filas de `auth.sessions` mata la
-- sesión (los refresh_tokens y mfa_amr_claims caen en cascada): en cuanto el token de
-- acceso caduque (de 5 min a 1 h, según el proyecto) la app lo manda al login.
-- Solo la llama la Edge Function `gestionar-comercial` (service_role).

create or replace function public.fn_cerrar_sesiones(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  n integer;
begin
  delete from auth.sessions where user_id = p_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.fn_cerrar_sesiones(uuid) from public, anon, authenticated;
grant execute on function public.fn_cerrar_sesiones(uuid) to service_role;
