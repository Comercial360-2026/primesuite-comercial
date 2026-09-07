-- 101 — Ficha de proyecto: borrar un proyecto con nombre, y mover una visita
-- (con lo capturado en ella) a otro proyecto del mismo cliente.
--
-- Modelo (P2): proyecto hereda el de cliente — cualquier comercial activo
-- puede crear / renombrar / cambiar estado (RLS de la 93). No hay policy de
-- DELETE: el borrado va por SECURITY DEFINER, igual que cliente / visita.
--
-- eliminar_proyecto: NUNCA el General. Su actividad (visitas, oportunidades,
-- hallazgos, próximos pasos) NO se borra: pasa al proyecto General del cliente
-- ("sin proyecto asignado"). Así "borrar un proyecto" es reorganizar, no
-- perder historial.
--
-- mover_visita_de_proyecto: cambia visita.proyecto_id y arrastra lo que nació
-- en esa visita — oportunidades (`visita_origen_id`), hallazgos y próximos
-- pasos (`visita_id`). El destino tiene que ser del mismo cliente. Los
-- triggers `*_proyecto_id` son BEFORE INSERT, no pisan estos UPDATE.

create or replace function public.eliminar_proyecto(p_proyecto_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = 'public', 'pg_temp'
as $function$
declare
  v_cliente_id uuid;
  v_es_general boolean;
  v_general_id uuid;
begin
  if not fn_comercial_actual_activo() then
    raise exception 'No tienes permiso para borrar proyectos.';
  end if;

  select cliente_id, es_general into v_cliente_id, v_es_general
    from proyecto where id = p_proyecto_id;

  if v_cliente_id is null then
    raise exception 'El proyecto no existe o ya se había borrado.';
  end if;
  if v_es_general then
    raise exception 'El proyecto General no se puede borrar.';
  end if;

  select id into v_general_id
    from proyecto
   where cliente_id = v_cliente_id and es_general = true;
  if v_general_id is null then
    raise exception 'El cliente no tiene proyecto General — no se puede reubicar la actividad.';
  end if;

  update visita       set proyecto_id = v_general_id where proyecto_id = p_proyecto_id;
  update oportunidad  set proyecto_id = v_general_id where proyecto_id = p_proyecto_id;
  update hallazgo     set proyecto_id = v_general_id where proyecto_id = p_proyecto_id;
  update proximo_paso set proyecto_id = v_general_id where proyecto_id = p_proyecto_id;

  delete from proyecto where id = p_proyecto_id;
end;
$function$;

create or replace function public.mover_visita_de_proyecto(
  p_visita_id uuid,
  p_proyecto_id uuid
)
  returns void
  language plpgsql
  security definer
  set search_path = 'public', 'pg_temp'
as $function$
declare
  v_cliente_visita uuid;
  v_cliente_proyecto uuid;
begin
  if not fn_comercial_actual_activo() then
    raise exception 'No tienes permiso para cambiar el proyecto de una visita.';
  end if;

  select cliente_id into v_cliente_visita   from visita   where id = p_visita_id;
  select cliente_id into v_cliente_proyecto from proyecto where id = p_proyecto_id;

  if v_cliente_visita is null then
    raise exception 'La visita no existe.';
  end if;
  if v_cliente_proyecto is null then
    raise exception 'El proyecto de destino no existe.';
  end if;
  if v_cliente_visita <> v_cliente_proyecto then
    raise exception 'La visita y el proyecto de destino son de clientes distintos.';
  end if;

  update visita       set proyecto_id = p_proyecto_id where id = p_visita_id;
  update oportunidad  set proyecto_id = p_proyecto_id where visita_origen_id = p_visita_id;
  update hallazgo     set proyecto_id = p_proyecto_id where visita_id = p_visita_id;
  update proximo_paso set proyecto_id = p_proyecto_id where visita_id = p_visita_id;
end;
$function$;
