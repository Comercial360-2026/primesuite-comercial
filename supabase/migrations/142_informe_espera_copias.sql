-- El informe web lleva enlaces a los originales/audios/documentos en SharePoint, que solo existen
-- cuando ya se han copiado: el informe espera a que la visita no tenga copias pendientes (las
-- agotadas tras 5 intentos no bloquean: ese archivo simplemente irá sin enlace). Además avisa de si
-- ya hubo un informe antes (una regeneración: el nombre lleva una marca para no chocar, porque
-- «Create file» de SharePoint no sobrescribe).
drop function fn_visitas_para_informe();
create function fn_visitas_para_informe()
returns table (visita_id uuid, cliente_id uuid, cliente_nombre text, proyecto_id uuid, proyecto_nombre text,
               fecha_visita timestamptz, cerrada_en timestamptz, falta_html boolean, falta_pdf boolean,
               copiado_antes boolean)
language sql security definer set search_path = public as $$
  select v.id, c.id, c.nombre, p.id, p.nombre, v.fecha, v.cerrada_en,
         v.informe_sharepoint_en is null, v.informe_pdf_sharepoint_en is null,
         (v.informe_sharepoint_ruta is not null or v.informe_pdf_sharepoint_ruta is not null)
    from visita v
    join cliente c on c.id = v.cliente_id
    join proyecto p on p.id = v.proyecto_id
   where v.estado_captura = 'consolidada'
     and v.cerrada_en is not null
     and (v.informe_sharepoint_en is null or v.informe_pdf_sharepoint_en is null)
     and v.informe_intentos < 5
     and (v.informe_intento_en is null or v.informe_intento_en < now() - interval '15 minutes')
     and not exists (
       select 1 from captura_libre cl
        where cl.visita_id = v.id
          and cl.tipo in ('foto', 'audio', 'documento')
          and cl.ubicacion_archivo = 'supabase'
          and cl.storage_path is not null
          and cl.ruta_sharepoint is null
          and cl.intentos_archivado < 5
     );
$$;
revoke all on function fn_visitas_para_informe() from public, anon, authenticated;
grant execute on function fn_visitas_para_informe() to service_role;
