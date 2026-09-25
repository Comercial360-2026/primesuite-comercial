-- 120: la limpieza de backups-visita y exportaciones nunca ha funcionado.
--
-- Los jobs "limpiar-backups-visita" (fn_limpiar_backups_antiguos) y
-- "purgar-exportaciones-antiguas" hacían `delete from storage.objects`, que
-- Supabase bloquea (storage.protect_delete: "Use the Storage API instead").
-- Fallaban en cada ejecución desde el 22-08-2026 y los zips/PDF se
-- acumulaban para siempre.
--
-- Ahora: esta función solo DEVUELVE las rutas caducadas y las Edge Functions
-- que generan informes (generar-backup-visita, generar-informe-proyecto) las
-- borran con la Storage API al generar uno nuevo (_shared/limpiar-backups.ts).
-- El bucket "exportaciones" no lo usa ningún código y está vacío: se quita
-- su job sin sustituto.

select cron.unschedule('limpiar-backups-visita');
select cron.unschedule('purgar-exportaciones-antiguas');
drop function if exists fn_limpiar_backups_antiguos();

create or replace function fn_backups_caducados()
returns setof text
language sql
security definer
set search_path = public
as $$
  select name from storage.objects
   where bucket_id = 'backups-visita'
     and created_at < now() - interval '2 hours';
$$;

revoke all on function fn_backups_caducados() from public, anon, authenticated;
grant execute on function fn_backups_caducados() to service_role;
