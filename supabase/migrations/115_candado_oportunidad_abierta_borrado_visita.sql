-- INCIDENTE 2026-09-12: SAPA se borró con 2 oportunidades abiertas por
-- "Borrar esta visita" (detalle-visita-cerrada.tsx) — un camino que nunca
-- comprobaba oportunidades. El candado que se había añadido para
-- "Descargar y liberar espacio" y para el borrado por lotes de Mi espacio
-- era solo de cliente (JS): se podía saltar por CUALQUIER otro sitio que
-- llame a eliminar_visita_completa (hay al menos 6: detalle-visita-cerrada,
-- panel-visitas-abiertas, agenda-del-dia, ficha-proyecto, y las de agenda.tsx
-- /detalle-visita-planificada.tsx aunque esas solo tocan 'agendada' que no
-- puede tener oportunidad).
--
-- Fix real: el candado se pone en el propio eliminar_visita_completa
-- (SECURITY DEFINER, punto único por el que pasan TODOS los caminos, incluido
-- eliminar_cliente_completo que lo llama en bucle). Ya no es un aviso que se
-- pueda saltar — la fila de la visita ni se llega a tocar.
create or replace function public.eliminar_visita_completa(p_visita_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = 'public', 'pg_temp'
as $function$
declare
  v_autorizado boolean;
  v_oportunidades_abiertas int;
begin
  select exists (
    select 1 from visita_participante
     where visita_id = p_visita_id
       and comercial_id = auth.uid()
       and rol = 'responsable'
  ) or fn_rol_actual() = 'direccion_comercial'
  into v_autorizado;

  if not v_autorizado then
    raise exception 'No tienes permiso para borrar esta visita.';
  end if;

  select count(*) into v_oportunidades_abiertas
  from oportunidad
  where visita_origen_id = p_visita_id and etapa <> 'cerrada';

  if v_oportunidades_abiertas > 0 then
    raise exception 'No se puede borrar: tiene % oportunidad(es) abierta(s) sin cerrar. Ciérrala(s) antes de borrar la visita.',
      v_oportunidades_abiertas;
  end if;

  delete from oportunidad_visita_seguimiento
   where visita_id = p_visita_id
      or oportunidad_id in (select id from oportunidad where visita_origen_id = p_visita_id);

  delete from oportunidad_termino
   where oportunidad_id in (select id from oportunidad where visita_origen_id = p_visita_id);

  delete from proximo_paso where visita_id = p_visita_id;

  delete from oportunidad where visita_origen_id = p_visita_id;

  delete from hallazgo where visita_id = p_visita_id;

  delete from captura_libre where visita_id = p_visita_id;

  update termino set visita_origen_id = null where visita_origen_id = p_visita_id;

  delete from visita_interlocutor where visita_id = p_visita_id;
  delete from visita_participante where visita_id = p_visita_id;

  delete from visita where id = p_visita_id;

  if not found then
    raise exception 'La visita no se ha podido borrar (count 0) — revisa permisos o si ya no existía.';
  end if;
end;
$function$;

-- Mismo candado también en la PREVISUALIZACIÓN (usada por
-- ConfirmarBorradoVisita): sin esto, el cliente no sabe que va a fallar
-- hasta que confirma y la llamada de verdad revienta contra el RAISE
-- EXCEPTION de arriba. `num_oportunidades` seguía existiendo (total, no solo
-- abiertas) para no romper el texto "esta visita arrastra: X oportunidades".
drop function if exists public.previsualizar_borrado_visita(uuid);
create function public.previsualizar_borrado_visita(p_visita_id uuid)
 returns table(
   num_fotos integer,
   num_audios integer,
   num_notas integer,
   num_hallazgos integer,
   num_oportunidades integer,
   num_oportunidades_abiertas integer,
   num_proximos_pasos integer,
   rutas_storage text[]
 )
 language plpgsql
as $function$
begin
  return query
  select
    (select count(*)::int from captura_libre where visita_id = p_visita_id and tipo = 'foto'),
    (select count(*)::int from captura_libre where visita_id = p_visita_id and tipo = 'audio'),
    (select count(*)::int from captura_libre where visita_id = p_visita_id and tipo = 'nota'),
    (select count(*)::int from hallazgo where visita_id = p_visita_id),
    (select count(*)::int from oportunidad where visita_origen_id = p_visita_id),
    (select count(*)::int from oportunidad where visita_origen_id = p_visita_id and etapa <> 'cerrada'),
    (select count(*)::int from proximo_paso where visita_id = p_visita_id),
    (select array_agg(storage_path) from captura_libre
      where visita_id = p_visita_id and storage_path is not null);
end;
$function$;
