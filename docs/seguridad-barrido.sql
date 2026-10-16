-- Barrido de seguridad de la BD: TODAS las filas deben salir vacías. Ejecutar tras cada migración (y antes de producción).
select 'anon tiene permisos sobre' as problema, table_name as objeto, string_agg(privilege_type, ',') as detalle
  from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' group by 1, 2
union all
select 'tabla sin RLS', relname, '' from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
union all
select 'vista sin security_invoker', relname, '' from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v' and coalesce(c.reloptions::text, '') not like '%security_invoker=true%'
union all
select 'función SECURITY DEFINER ejecutable por anon', p.oid::regprocedure::text, '' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
union all
select 'política abierta a public/anon', tablename || '.' || policyname, '' from pg_policies
  where schemaname = 'public' and (roles && array['public'::name, 'anon'::name])
union all
select 'bucket público', id, '' from storage.buckets where public;
