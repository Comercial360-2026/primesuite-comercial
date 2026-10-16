-- Funciones propias de public con search_path fijo (las de la extensión pg_trgm se dejan).
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prokind='f'
             and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')
             and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;
