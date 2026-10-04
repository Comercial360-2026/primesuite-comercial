-- Informe web (informe.html) de cada visita cerrada, copiado a SU carpeta de SharePoint con el
-- mismo flujo de Power Automate que las fotos (sin tocar el flujo): viaja como un archivo más del
-- webhook con captura_id = 'informe:<visita_id>' y la función confirmar-archivado-sharepoint lo
-- reconoce por ese prefijo. Estado en la propia visita. Interruptor APAGADO: sin él, nada cambia.
-- Una visita reabierta y vuelta a cerrar se vuelve a copiar (el nombre lleva la hora de cierre).
insert into ajustes_app (clave, valor) values ('archivado_informe_activo', false) on conflict (clave) do nothing;

alter table visita
  add column informe_sharepoint_en timestamptz,
  add column informe_sharepoint_ruta text,
  add column informe_storage_path text,
  add column informe_intento_en timestamptz,
  add column informe_intentos integer not null default 0;

create function fn_visita_reabierta_reinicia_informe()
returns trigger language plpgsql as $$
begin
  if old.estado_captura = 'consolidada' and new.estado_captura <> 'consolidada' then
    new.informe_sharepoint_en := null;
    new.informe_intento_en := null;
    new.informe_intentos := 0;
  end if;
  return new;
end;
$$;
create trigger trg_visita_reabierta_reinicia_informe
  before update on visita
  for each row execute function fn_visita_reabierta_reinicia_informe();

-- Visitas cerradas cuyo informe aún no está en SharePoint (sin agotar 5 intentos; 15 min entre intentos).
create function fn_visitas_para_informe()
returns table (visita_id uuid, cliente_id uuid, cliente_nombre text, proyecto_id uuid, proyecto_nombre text,
               fecha_visita timestamptz, cerrada_en timestamptz)
language sql security definer set search_path = public as $$
  select v.id, c.id, c.nombre, p.id, p.nombre, v.fecha, v.cerrada_en
    from visita v
    join cliente c on c.id = v.cliente_id
    join proyecto p on p.id = v.proyecto_id
   where v.estado_captura = 'consolidada'
     and v.cerrada_en is not null
     and v.informe_sharepoint_en is null
     and v.informe_intentos < 5
     and (v.informe_intento_en is null or v.informe_intento_en < now() - interval '15 minutes');
$$;

create function fn_marcar_intento_informe(p_visita_id uuid, p_storage_path text)
returns void language sql security definer set search_path = public as $$
  update visita
     set informe_intento_en = now(), informe_intentos = informe_intentos + 1, informe_storage_path = p_storage_path
   where id = p_visita_id;
$$;

create function fn_confirmar_informe_visita(p_visita_id uuid, p_ruta_sharepoint text)
returns void language sql security definer set search_path = public as $$
  update visita
     set informe_sharepoint_en = now(), informe_sharepoint_ruta = p_ruta_sharepoint,
         informe_intento_en = null, informe_intentos = 0
   where id = p_visita_id;
$$;

revoke all on function fn_visitas_para_informe() from public, anon, authenticated;
revoke all on function fn_marcar_intento_informe(uuid, text) from public, anon, authenticated;
revoke all on function fn_confirmar_informe_visita(uuid, text) from public, anon, authenticated;
grant execute on function fn_visitas_para_informe() to service_role;
grant execute on function fn_marcar_intento_informe(uuid, text) to service_role;
grant execute on function fn_confirmar_informe_visita(uuid, text) to service_role;
