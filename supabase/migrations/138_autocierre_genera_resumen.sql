-- El cierre automático por inactividad ya genera el resumen (migración 137) en vez de dejarlo
-- vacío hasta que alguien abra la visita. Mismo cuerpo que fn_cerrar_visitas_inactivas de la 135
-- más `resumen_texto = nullif(fn_resumen_visita_reglas(v.id), '')`.
create or replace function fn_cerrar_visitas_inactivas()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  horas integer;
  n integer;
begin
  select valor_numero into horas from ajustes_app where clave = 'visita_autocierre_horas' and valor;
  if horas is null then return 0; end if;

  with candidatas as (
    select v.id,
           greatest(
             v.ultima_actividad_en, v.en_curso_desde, v.actualizado_en,
             (select max(creado_en) from captura_libre where visita_id = v.id),
             (select max(creado_en) from hallazgo where visita_id = v.id),
             (select max(actualizado_en) from oportunidad where visita_origen_id = v.id),
             (select max(actualizado_en) from proximo_paso where visita_id = v.id)
           ) as ultima
      from visita v
     where v.estado_captura = 'en_curso'
       and (exists (select 1 from captura_libre where visita_id = v.id)
         or exists (select 1 from hallazgo where visita_id = v.id)
         or exists (select 1 from oportunidad where visita_origen_id = v.id)
         or exists (select 1 from proximo_paso where visita_id = v.id))
  )
  update visita v
     set estado_captura = 'consolidada',
         cerrada_en = c.ultima,
         cierre_automatico = true,
         resumen_origen = 'reglas',
         resumen_texto = nullif(fn_resumen_visita_reglas(v.id), '')
    from candidatas c
   where v.id = c.id and c.ultima < now() - make_interval(hours => horas);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function fn_cerrar_visitas_inactivas() from public, anon, authenticated;
grant execute on function fn_cerrar_visitas_inactivas() to service_role;
