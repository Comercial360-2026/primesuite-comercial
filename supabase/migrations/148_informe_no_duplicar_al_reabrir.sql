-- Reabrir y volver a cerrar una visita SIN cambiar nada duplicaba el informe en SharePoint (la reapertura
-- borraba las marcas «informe copiado» y el cierre generaba otro con la hora nueva). Ahora:
-- · la reapertura NO borra las marcas del informe;
-- · al cerrar de nuevo, las marcas solo se borran (y por tanto se genera un informe nuevo, «rev …») si el
--   contenido de la visita ha cambiado desde el informe: se compara una huella (informe_huella) guardada al
--   confirmarse el informe con la de ahora.
-- · veces_reabierta cuenta las reaperturas (control/auditoría).

alter table visita
  add column informe_huella text,
  add column veces_reabierta integer not null default 0;

-- Huella del CONTENIDO que entra en el informe. Solo columnas estables: las de archivado (ruta_sharepoint,
-- copiada_sharepoint_en, intentos…) cambian sin que cambie la visita y no cuentan.
create function fn_huella_visita(p_visita_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select md5(concat_ws('|',
    (select coalesce(resumen_texto, '') || '~' || coalesce(objetivo, '') from visita where id = p_visita_id),
    (select coalesce(string_agg(concat_ws('~', id, tipo, titulo, contenido_texto, zona_texto, ubicacion_id), ',' order by id), '')
       from captura_libre where visita_id = p_visita_id),
    (select coalesce(string_agg(h::text, ',' order by h.id), '') from hallazgo h where h.visita_id = p_visita_id),
    (select coalesce(string_agg(o::text, ',' order by o.id), '') from oportunidad o where o.visita_origen_id = p_visita_id),
    (select coalesce(string_agg(p::text, ',' order by p.id), '') from proximo_paso p where p.visita_id = p_visita_id)
  ));
$$;
revoke all on function fn_huella_visita(uuid) from public, anon, authenticated;
grant execute on function fn_huella_visita(uuid) to service_role;

-- Reapertura: ya no reinicia el informe (solo cuenta la reapertura).
create or replace function fn_visita_reabierta_reinicia_informe()
returns trigger language plpgsql as $$
begin
  if old.estado_captura = 'consolidada' and new.estado_captura <> 'consolidada' then
    new.veces_reabierta := old.veces_reabierta + 1;
  end if;
  return new;
end;
$$;

-- Cierre tras una reapertura: informe nuevo solo si el contenido cambió.
create function fn_cierre_regenera_informe_si_cambio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado_captura <> 'consolidada' and new.estado_captura = 'consolidada'
     and (new.informe_sharepoint_en is not null or new.informe_pdf_sharepoint_en is not null) then
    if new.informe_huella is distinct from fn_huella_visita(new.id) then
      new.informe_sharepoint_en := null;
      new.informe_pdf_sharepoint_en := null;
      new.informe_intento_en := null;
      new.informe_intentos := 0;
      new.informe_error := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_visita_cierre_regenera_informe
  before update on visita
  for each row execute function fn_cierre_regenera_informe_si_cambio();

-- La huella se guarda al confirmarse el informe (HTML o PDF): refleja el contenido que ya está en SharePoint.
-- Se añade a la función existente sin tocar su lógica.
create or replace function fn_confirmar_informe_visita(p_visita_id uuid, p_ruta_sharepoint text, p_formato text)
returns void language sql security definer set search_path = public as $$
  update visita
     set informe_sharepoint_en = case when p_formato = 'html' then now() else informe_sharepoint_en end,
         informe_sharepoint_ruta = case when p_formato = 'html' then p_ruta_sharepoint else informe_sharepoint_ruta end,
         informe_pdf_sharepoint_en = case when p_formato = 'pdf' then now() else informe_pdf_sharepoint_en end,
         informe_pdf_sharepoint_ruta = case when p_formato = 'pdf' then p_ruta_sharepoint else informe_pdf_sharepoint_ruta end,
         informe_huella = fn_huella_visita(p_visita_id),
         informe_intentos = case when (case when p_formato = 'html' then true else informe_sharepoint_en is not null end)
                                  and (case when p_formato = 'pdf' then true else informe_pdf_sharepoint_en is not null end)
                                 then 0 else informe_intentos end,
         informe_intento_en = case when (case when p_formato = 'html' then true else informe_sharepoint_en is not null end)
                                    and (case when p_formato = 'pdf' then true else informe_pdf_sharepoint_en is not null end)
                                   then null else informe_intento_en end
   where id = p_visita_id;
$$;

-- Visitas cuyo informe ya está copiado: su huella actual se da por buena (no han cambiado desde el informe).
update visita set informe_huella = fn_huella_visita(id)
 where informe_sharepoint_en is not null and informe_pdf_sharepoint_en is not null and estado_captura = 'consolidada';
