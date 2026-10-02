-- Además del informe.html (139), el informe.pdf de la visita va a su carpeta de SharePoint (el PDF
-- se previsualiza en SharePoint/Teams; el HTML no). Cada formato tiene su propio estado: se confirman
-- por separado (captura_id 'informe:<visita>' = html, 'informe-pdf:<visita>' = pdf).
alter table visita
  add column informe_pdf_sharepoint_en timestamptz,
  add column informe_pdf_sharepoint_ruta text,
  add column informe_pdf_storage_path text;

create or replace function fn_visita_reabierta_reinicia_informe()
returns trigger language plpgsql as $$
begin
  if old.estado_captura = 'consolidada' and new.estado_captura <> 'consolidada' then
    new.informe_sharepoint_en := null;
    new.informe_pdf_sharepoint_en := null;
    new.informe_intento_en := null;
    new.informe_intentos := 0;
  end if;
  return new;
end;
$$;

drop function fn_visitas_para_informe();
create function fn_visitas_para_informe()
returns table (visita_id uuid, cliente_id uuid, cliente_nombre text, proyecto_id uuid, proyecto_nombre text,
               fecha_visita timestamptz, cerrada_en timestamptz, falta_html boolean, falta_pdf boolean)
language sql security definer set search_path = public as $$
  select v.id, c.id, c.nombre, p.id, p.nombre, v.fecha, v.cerrada_en,
         v.informe_sharepoint_en is null, v.informe_pdf_sharepoint_en is null
    from visita v
    join cliente c on c.id = v.cliente_id
    join proyecto p on p.id = v.proyecto_id
   where v.estado_captura = 'consolidada'
     and v.cerrada_en is not null
     and (v.informe_sharepoint_en is null or v.informe_pdf_sharepoint_en is null)
     and v.informe_intentos < 5
     and (v.informe_intento_en is null or v.informe_intento_en < now() - interval '15 minutes');
$$;

drop function fn_marcar_intento_informe(uuid, text);
create function fn_marcar_intento_informe(p_visita_id uuid, p_html_path text, p_pdf_path text)
returns void language sql security definer set search_path = public as $$
  update visita
     set informe_intento_en = now(), informe_intentos = informe_intentos + 1,
         informe_storage_path = coalesce(p_html_path, informe_storage_path),
         informe_pdf_storage_path = coalesce(p_pdf_path, informe_pdf_storage_path)
   where id = p_visita_id;
$$;

drop function fn_confirmar_informe_visita(uuid, text);
create function fn_confirmar_informe_visita(p_visita_id uuid, p_ruta_sharepoint text, p_formato text)
returns void language sql security definer set search_path = public as $$
  update visita
     set informe_sharepoint_en = case when p_formato = 'html' then now() else informe_sharepoint_en end,
         informe_sharepoint_ruta = case when p_formato = 'html' then p_ruta_sharepoint else informe_sharepoint_ruta end,
         informe_pdf_sharepoint_en = case when p_formato = 'pdf' then now() else informe_pdf_sharepoint_en end,
         informe_pdf_sharepoint_ruta = case when p_formato = 'pdf' then p_ruta_sharepoint else informe_pdf_sharepoint_ruta end,
         -- Con los dos confirmados se limpia el contador de intentos.
         informe_intentos = case when (case when p_formato = 'html' then true else informe_sharepoint_en is not null end)
                                  and (case when p_formato = 'pdf' then true else informe_pdf_sharepoint_en is not null end)
                                 then 0 else informe_intentos end,
         informe_intento_en = case when (case when p_formato = 'html' then true else informe_sharepoint_en is not null end)
                                    and (case when p_formato = 'pdf' then true else informe_pdf_sharepoint_en is not null end)
                                   then null else informe_intento_en end
   where id = p_visita_id;
$$;

revoke all on function fn_visitas_para_informe() from public, anon, authenticated;
revoke all on function fn_marcar_intento_informe(uuid, text, text) from public, anon, authenticated;
revoke all on function fn_confirmar_informe_visita(uuid, text, text) from public, anon, authenticated;
grant execute on function fn_visitas_para_informe() to service_role;
grant execute on function fn_marcar_intento_informe(uuid, text, text) to service_role;
grant execute on function fn_confirmar_informe_visita(uuid, text, text) to service_role;
