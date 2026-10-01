-- Carpetas de SharePoint con nombres legibles (Cliente / Proyecto / AAAA-MM-DD Visita)
-- en vez de "<uuid> - <nombre>". El nombre se fija la PRIMERA vez que se archiva
-- y se reutiliza siempre: si luego se renombra el cliente/proyecto, su historial
-- no se parte en dos carpetas. Si dos comparten nombre, el segundo lleva (xxxx)
-- con las 4 primeras letras de su id.

alter table cliente  add column carpeta_sharepoint text;
alter table proyecto add column carpeta_sharepoint text;
alter table visita   add column carpeta_sharepoint text;

create unique index cliente_carpeta_sharepoint_uq  on cliente (lower(carpeta_sharepoint)) where carpeta_sharepoint is not null;
create unique index proyecto_carpeta_sharepoint_uq on proyecto (cliente_id, lower(carpeta_sharepoint)) where carpeta_sharepoint is not null;
create unique index visita_carpeta_sharepoint_uq   on visita (cliente_id, proyecto_id, lower(carpeta_sharepoint)) where carpeta_sharepoint is not null;

-- SharePoint no admite " * : < > ? / \ | # % ~ & { } en nombres, ni acabar en punto o espacio.
create function fn_nombre_carpeta(p_nombre text, p_defecto text)
returns text language sql immutable as $$
  select coalesce(nullif(regexp_replace(btrim(regexp_replace(coalesce(p_nombre, ''), '[\\/:*?"<>|#%~&{}]', '-', 'g')), '[. ]+$', ''), ''), p_defecto);
$$;

create function fn_carpetas_archivado(p_visita_id uuid)
returns table (carpeta_cliente text, carpeta_proyecto text, carpeta_visita text)
language plpgsql security definer set search_path = public as $$
declare
  v visita%rowtype;
  c text; p text; vi text; base text;
begin
  select * into v from visita where id = p_visita_id;
  if not found then raise exception 'Visita no encontrada'; end if;

  select carpeta_sharepoint into c from cliente where id = v.cliente_id;
  if c is null then
    select fn_nombre_carpeta(nombre, 'Cliente') into base from cliente where id = v.cliente_id;
    if exists (select 1 from cliente where id <> v.cliente_id and lower(carpeta_sharepoint) = lower(base)) then
      base := base || ' (' || left(v.cliente_id::text, 4) || ')';
    end if;
    update cliente set carpeta_sharepoint = base where id = v.cliente_id;
    c := base;
  end if;

  select carpeta_sharepoint into p from proyecto where id = v.proyecto_id;
  if p is null then
    select fn_nombre_carpeta(nombre, 'Proyecto') into base from proyecto where id = v.proyecto_id;
    if exists (select 1 from proyecto where cliente_id = v.cliente_id and id <> v.proyecto_id and lower(carpeta_sharepoint) = lower(base)) then
      base := base || ' (' || left(v.proyecto_id::text, 4) || ')';
    end if;
    update proyecto set carpeta_sharepoint = base where id = v.proyecto_id;
    p := base;
  end if;

  vi := v.carpeta_sharepoint;
  if vi is null then
    base := to_char(v.fecha at time zone 'Europe/Madrid', 'YYYY-MM-DD') || ' Visita';
    if exists (select 1 from visita where cliente_id = v.cliente_id and proyecto_id = v.proyecto_id and id <> v.id and lower(carpeta_sharepoint) = lower(base)) then
      base := base || ' (' || left(v.id::text, 4) || ')';
    end if;
    update visita set carpeta_sharepoint = base where id = v.id;
    vi := base;
  end if;

  return query select c, p, vi;
end;
$$;
revoke all on function fn_carpetas_archivado(uuid) from public, anon, authenticated;
grant execute on function fn_carpetas_archivado(uuid) to service_role;
