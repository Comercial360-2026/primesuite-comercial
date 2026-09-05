-- eliminar_cliente_completo predata a Fase 1 (proyecto) y no borraba los
-- proyecto del cliente antes de borrar el propio cliente. Desde que
-- proyecto.cliente_id es NOT NULL con FK sin ON DELETE CASCADE, esto rompía
-- CUALQUIER borrado de cliente con un "violates foreign key constraint
-- proyecto_cliente_id_fkey" — detectado probando en directo, no solo
-- mirando el código. Se borran los proyecto justo antes que el cliente: ya
-- no queda ninguna visita/hallazgo/oportunidad/proximo_paso apuntando a
-- ellos porque el bucle de arriba ya los ha eliminado vía
-- eliminar_visita_completa.
create or replace function public.eliminar_cliente_completo(p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_autorizado boolean;
  v_visita_id uuid;
begin
  select (creado_por = auth.uid() or fn_rol_actual() = 'direccion_comercial')
  into v_autorizado
  from cliente where id = p_cliente_id;

  if v_autorizado is null then
    raise exception 'El cliente no existe.';
  end if;

  if not v_autorizado then
    raise exception 'No tienes permiso para borrar este cliente.';
  end if;

  for v_visita_id in select id from visita where cliente_id = p_cliente_id loop
    perform eliminar_visita_completa(v_visita_id);
  end loop;

  delete from ubicacion where cliente_id = p_cliente_id;

  delete from interlocutor where cliente_id = p_cliente_id;

  delete from proyecto where cliente_id = p_cliente_id;

  delete from cliente where id = p_cliente_id;

  if not found then
    raise exception 'El cliente no se ha podido borrar (count 0) — revisa permisos.';
  end if;
end;
$function$;
