-- anon no tiene ningún permiso en public (tenía todos, TRUNCATE incluido, sobre ~37 tablas) y las políticas pasan a TO authenticated.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
alter view public.vw_actividad_comercial set (security_invoker = true);
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and (roles && array['public'::name, 'anon'::name])
  loop
    execute format('alter policy %I on %I.%I to authenticated', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;
