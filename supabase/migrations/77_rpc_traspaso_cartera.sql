-- Fase 6b — traspaso de cartera y reasignación de un cliente.
--
-- Mueven, en una transacción:
--   · el responsable del cliente        → cliente.responsable_id
--   · el responsable de las visitas      → visita_participante (rol 'responsable')
--     PLANIFICADAS y FUTURAS (agendada, fecha >= ahora)
--   · los próximos pasos PENDIENTES      → proximo_paso.comercial_responsable_id
--
-- El histórico de visitas cerradas NO se toca (sigue a nombre de quien la
-- hizo). Las oportunidades no tienen dueño propio: van con su cliente.
--
-- security definer para centralizar los updates en una sola llamada con
-- recuentos atómicos; el guard de rol (fn_rol_actual) es explícito y sigue
-- reflejando al USUARIO que llama (PostgREST fija el JWT igualmente).

create or replace function public.fn_traspasar_cartera(p_de uuid, p_a uuid)
returns table (clientes integer, visitas integer, pasos integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clientes integer;
  v_visitas integer;
  v_pasos integer;
begin
  if public.fn_rol_actual() <> 'direccion_comercial' then
    raise exception 'Solo Dirección Comercial puede traspasar carteras.';
  end if;
  if p_de = p_a then
    raise exception 'El origen y el destino no pueden ser el mismo comercial.';
  end if;
  if not exists (select 1 from comercial where id = p_de) then
    raise exception 'El comercial de origen no existe.';
  end if;
  if not exists (select 1 from comercial where id = p_a and activo) then
    raise exception 'El comercial de destino no existe o está de baja.';
  end if;

  update cliente
     set responsable_id = p_a
   where responsable_id = p_de
     and estado_fusion = 'activo';
  get diagnostics v_clientes = row_count;

  update visita_participante vp
     set comercial_id = p_a
   where vp.comercial_id = p_de
     and vp.rol = 'responsable'
     and exists (
       select 1 from visita v
        where v.id = vp.visita_id
          and v.estado_captura = 'agendada'
          and v.fecha >= now()
     );
  get diagnostics v_visitas = row_count;

  update proximo_paso
     set comercial_responsable_id = p_a
   where comercial_responsable_id = p_de
     and estado = 'pendiente';
  get diagnostics v_pasos = row_count;

  return query select v_clientes, v_visitas, v_pasos;
end;
$$;

create or replace function public.fn_reasignar_cliente(p_cliente uuid, p_a uuid)
returns table (visitas integer, pasos integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_de uuid;
  v_visitas integer := 0;
  v_pasos integer := 0;
begin
  if public.fn_rol_actual() <> 'direccion_comercial' then
    raise exception 'Solo Dirección Comercial puede cambiar el responsable de un cliente.';
  end if;
  if not exists (select 1 from comercial where id = p_a and activo) then
    raise exception 'El comercial de destino no existe o está de baja.';
  end if;

  select responsable_id into v_de from cliente where id = p_cliente;

  update cliente set responsable_id = p_a where id = p_cliente;

  -- Visitas planificadas futuras y pasos pendientes de ESTE cliente que
  -- llevaba el responsable anterior — pasan también.
  if v_de is not null and v_de <> p_a then
    update visita_participante vp
       set comercial_id = p_a
     where vp.comercial_id = v_de
       and vp.rol = 'responsable'
       and exists (
         select 1 from visita v
          where v.id = vp.visita_id
            and v.cliente_id = p_cliente
            and v.estado_captura = 'agendada'
            and v.fecha >= now()
       );
    get diagnostics v_visitas = row_count;

    update proximo_paso pp
       set comercial_responsable_id = p_a
     where pp.comercial_responsable_id = v_de
       and pp.estado = 'pendiente'
       and exists (
         select 1 from visita v
          where v.id = pp.visita_id and v.cliente_id = p_cliente
       );
    get diagnostics v_pasos = row_count;
  end if;

  return query select v_visitas, v_pasos;
end;
$$;

grant execute on function public.fn_traspasar_cartera(uuid, uuid) to authenticated;
grant execute on function public.fn_reasignar_cliente(uuid, uuid) to authenticated;
