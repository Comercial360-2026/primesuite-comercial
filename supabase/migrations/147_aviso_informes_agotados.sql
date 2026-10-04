-- Informe de la visita a SharePoint: tras 5 intentos fallidos (informe_intentos >= 5) la visita deja de
-- reintentarse y nadie lo sabía. Ahora:
-- 1) visita.informe_error guarda el motivo del último fallo.
-- 2) fn_estado_archivado() cuenta también los informes agotados (aviso «Copia a SharePoint» de Yo).
-- 3) fn_reintentar_archivado() también devuelve los informes agotados a la cola (5 intentos más).

alter table visita add column informe_error text;

drop function fn_marcar_intento_informe(uuid, text, text);
create function fn_marcar_intento_informe(p_visita_id uuid, p_html_path text, p_pdf_path text, p_error text default null)
returns void language sql security definer set search_path = public as $$
  update visita
     set informe_intento_en = now(), informe_intentos = informe_intentos + 1,
         informe_storage_path = coalesce(p_html_path, informe_storage_path),
         informe_pdf_storage_path = coalesce(p_pdf_path, informe_pdf_storage_path),
         informe_error = coalesce(left(p_error, 500), informe_error)
   where id = p_visita_id;
$$;
revoke all on function fn_marcar_intento_informe(uuid, text, text, text) from public, anon, authenticated;
grant execute on function fn_marcar_intento_informe(uuid, text, text, text) to service_role;

drop function fn_estado_archivado();
create function fn_estado_archivado()
returns table (sin_copiar bigint, agotadas bigint, posibles_duplicados bigint, informes_agotados bigint)
language sql stable security definer set search_path = public as $$
  select
    count(*) filter (where cl.ruta_sharepoint is null and cl.ubicacion_archivo = 'supabase' and cl.storage_path is not null
                       and cl.tipo in ('foto', 'audio', 'documento') and cl.intentos_archivado < 5
                       and v.cerrada_en < now() - interval '2 hours'),
    count(*) filter (where cl.ruta_sharepoint is null and cl.ubicacion_archivo = 'supabase' and cl.storage_path is not null
                       and cl.tipo in ('foto', 'audio', 'documento') and cl.intentos_archivado >= 5),
    count(*) filter (where cl.copia_con_reintentos and cl.copiada_sharepoint_en > now() - interval '14 days'),
    case when fn_rol_actual() = 'direccion_comercial' then (select count(*) from visita vi
      where vi.estado_captura = 'consolidada' and vi.cerrada_en is not null
        and (vi.informe_sharepoint_en is null or vi.informe_pdf_sharepoint_en is null)
        and vi.informe_intentos >= 5) else 0 end
  from captura_libre cl
  join visita v on v.id = cl.visita_id
  where fn_rol_actual() = 'direccion_comercial'
    and v.estado_captura = 'consolidada' and v.cerrada_en is not null;
$$;

create or replace function fn_reintentar_archivado()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; m integer;
begin
  if fn_rol_actual() <> 'direccion_comercial' then
    raise exception 'Solo Dirección Comercial puede reintentar el archivado.';
  end if;
  update captura_libre
     set intentos_archivado = 0, error_archivado = null, intento_archivado_en = null
   where ruta_sharepoint is null and ubicacion_archivo = 'supabase' and intentos_archivado >= 5;
  get diagnostics n = row_count;
  update visita
     set informe_intentos = 0, informe_intento_en = null, informe_error = null
   where estado_captura = 'consolidada' and cerrada_en is not null
     and (informe_sharepoint_en is null or informe_pdf_sharepoint_en is null)
     and informe_intentos >= 5;
  get diagnostics m = row_count;
  return n + m;
end;
$$;
