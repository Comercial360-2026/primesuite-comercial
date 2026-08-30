-- Cierra el hueco de permisos en la fusión de clientes.
--
-- En `cliente` hay dos políticas de UPDATE:
--   pol_cliente_fusion  -> USING fn_rol_actual() = 'direccion_comercial'
--   pol_cliente_update  -> USING/CHECK fn_comercial_actual_activo()
-- Las políticas permisivas se combinan con OR, así que la segunda deja a
-- CUALQUIER comercial activo hacer UPDATE de cualquier columna, incluidas
-- estado_fusion y fusionado_en_id. La pantalla de Deduplicación está detrás
-- de RequireRole en la app, pero una llamada directa a la API no lo estaría.
--
-- RLS no puede comparar contra la fila antigua (WITH CHECK solo ve la nueva),
-- así que el control se hace con un trigger BEFORE UPDATE.
--
-- Solo bloquea a un usuario autenticado de la app que NO sea Dirección
-- Comercial (fn_rol_actual() devuelve su rol). Si fn_rol_actual() es null
-- —SQL Editor como postgres, service_role, tareas de backend— se deja pasar:
-- la amenaza es un comercial normal llamando a PostgREST directamente, no el
-- mantenimiento con credenciales de administrador.

create or replace function public.fn_guard_fusion_cliente()
returns trigger
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
begin
  if (new.estado_fusion is distinct from old.estado_fusion
      or new.fusionado_en_id is distinct from old.fusionado_en_id)
     and public.fn_rol_actual() is not null
     and public.fn_rol_actual() <> 'direccion_comercial' then
    raise exception 'Solo Dirección Comercial puede fusionar o separar clientes';
  end if;
  return new;
end;
$$;

-- El prefijo "00_" lo hace disparar ANTES que trg_cliente_fusion (los
-- triggers BEFORE de una tabla se ejecutan en orden alfabético de nombre),
-- para rechazar la operación antes de que fn_fusionar_cliente mueva visitas,
-- oportunidades, etc.
drop trigger if exists trg_cliente_00_guard_fusion on public.cliente;
create trigger trg_cliente_00_guard_fusion
  before update on public.cliente
  for each row execute function public.fn_guard_fusion_cliente();
