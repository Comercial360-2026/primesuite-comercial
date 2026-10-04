-- Dar de baja a un comercial: borrado real si no tiene NINGÚN historial, y si lo
-- tiene se conserva todo pero se libera su correo (anonimizado).
--
-- Antes la baja nunca borraba la cuenta de Auth: el correo quedaba ocupado para
-- siempre y un comercial dado de alta por error no se podía deshacer.
--
-- 1. `comercial.email_anterior`: el correo original de quien se dio de baja con
--    historial (en Auth pasa a ser un correo `.invalid`). Reactivar lo devuelve si
--    sigue libre.
-- 2. `fn_comercial_tiene_historial(id)`: ¿hay alguna fila de otras tablas que apunte
--    a este comercial (o a su usuario de Auth)? Recorre las claves foráneas EN VIVO,
--    así una tabla nueva con autoría entra sola sin tocar esta función.
--    Se ignoran lo personal y descartable: `item_hallazgo_hibernado`, sus propias
--    `solicitud_acceso` y las claves ON DELETE SET NULL (se pierden sin dañar nada).
--    Solo la llama la Edge Function `gestionar-comercial` (service_role).

alter table public.comercial add column if not exists email_anterior text;

comment on column public.comercial.email_anterior is
  'Correo original de un comercial dado de baja CON historial. En auth.users su correo se sustituye por uno .invalid para liberarlo; Reactivar lo restaura si sigue libre.';

create or replace function public.fn_comercial_tiene_historial(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  r record;
  v boolean;
begin
  for r in
    select k.conrelid::regclass::text as tabla, a.attname as col
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
     where k.contype = 'f'
       and c.relnamespace = 'public'::regnamespace
       and k.confrelid in ('public.comercial'::regclass, 'auth.users'::regclass)
       and k.confdeltype <> 'n'
       and c.relname <> 'item_hallazgo_hibernado'
       and not (c.relname = 'solicitud_acceso' and a.attname = 'comercial_id')
  loop
    execute format('select exists (select 1 from %s where %I = $1)', r.tabla, r.col) into v using p_id;
    if v then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

revoke all on function public.fn_comercial_tiene_historial(uuid) from public, anon, authenticated;
grant execute on function public.fn_comercial_tiene_historial(uuid) to service_role;
