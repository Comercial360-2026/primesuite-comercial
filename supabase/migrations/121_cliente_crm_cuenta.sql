-- 121: vincular cada cliente con su cuenta del CRM (crm_cuenta, migración 119).
--
-- Se elige al dar de alta (buscador sobre crm_cuenta) o después con el lápiz
-- de la ficha. Opcional: un cliente nuevo que aún no está en el CRM, o un alta
-- sin conexión, queda sin vincular. Varios clientes pueden apuntar a la misma
-- cuenta (no hay unique): la app avisa, no lo impide.
-- Sirve para que el briefing de Copilot Studio pida la cuenta exacta por id en
-- vez de adivinarla por nombre.

alter table cliente
  add column crm_accountid uuid references crm_cuenta(accountid) on delete set null;

create index cliente_crm_accountid_idx on cliente (crm_accountid);

drop function if exists public.crear_cliente_con_proyecto(uuid, text, text, uuid, uuid);

create function public.crear_cliente_con_proyecto(
  p_cliente_id       uuid,
  p_nombre_cliente   text,
  p_nombre_proyecto  text,
  p_creado_por       uuid,
  p_responsable_id   uuid,
  p_crm_accountid    uuid default null
) returns table (cliente_id uuid, proyecto_id uuid)
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_proy uuid;
begin
  if not fn_comercial_actual_activo() then
    raise exception 'No tienes permiso para dar de alta clientes.';
  end if;
  if coalesce(btrim(p_nombre_cliente),'') = '' then
    raise exception 'El cliente necesita un nombre.';
  end if;
  if coalesce(btrim(p_nombre_proyecto),'') = '' then
    raise exception 'El primer proyecto necesita un nombre.';
  end if;

  insert into public.cliente (id, nombre, estado_relacion, creado_por, responsable_id, crm_accountid)
  values (p_cliente_id, btrim(p_nombre_cliente), 'borrador', p_creado_por, p_responsable_id, p_crm_accountid);

  insert into public.proyecto (cliente_id, nombre, estado, creado_por)
  values (p_cliente_id, btrim(p_nombre_proyecto), 'activo', p_creado_por)
  returning id into v_proy;

  return query select p_cliente_id, v_proy;
end;
$$;
