-- 127: cancelar una «Pregunta a la IA» en marcha.
--
-- Bug real (27-09-2026): fn_preguntar_ia bloquea una pregunta nueva mientras
-- haya una 'pendiente'/'generando' (126), y el agente puede tardar hasta los
-- 8 minutos del corte de procesar-consultas antes de liberarla — el
-- comercial se queda sin poder hacer nada en esa pantalla. Se añade el
-- estado 'cancelada' (el comercial decide no esperar más) y una función para
-- marcarlo. No cuenta para el tope diario, a diferencia de 'error'.

alter table consulta_ia drop constraint consulta_ia_estado_check;
alter table consulta_ia add constraint consulta_ia_estado_check
  check (estado in ('pendiente', 'generando', 'listo', 'error', 'sin_cuenta', 'cancelada'));

create function fn_cancelar_consulta_ia(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update consulta_ia
     set estado = 'cancelada', error = null, terminado_en = now(), conversacion_id = null, watermark = null
   where id = p_id and comercial_id = auth.uid() and estado in ('pendiente', 'generando');
  if not found then
    raise exception 'Esta pregunta ya no se puede cancelar.';
  end if;
end;
$$;

grant execute on function fn_cancelar_consulta_ia(uuid) to authenticated;

create or replace function fn_tope_consulta_ia()
returns table (hechas_hoy bigint, tope integer, alcanzado boolean)
language sql stable security definer set search_path = public as $$
  select h.n, a.valor_numero, a.valor and a.valor_numero is not null and h.n >= a.valor_numero
    from (select count(*) n from consulta_ia
           where comercial_id = auth.uid()
             and estado not in ('sin_cuenta', 'cancelada')
             and pedido_en >= date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid') h
    cross join (select valor, valor_numero from ajustes_app where clave = 'consulta_ia_tope_usuario') a
   where fn_comercial_actual_activo();
$$;
