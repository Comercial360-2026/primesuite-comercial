-- 104 — `crear_visita_con_responsable` recibe el proyecto explícito.
--
-- Desde la 103, `visita.proyecto_id` es NOT NULL y el trigger
-- `fn_set_proyecto_id_visita` ya no lo deriva del "General" (no existe). La
-- RPC insertaba la visita sin `proyecto_id` y lo parcheaba después con un
-- UPDATE — eso ahora falla en el propio INSERT. El proyecto pasa a ser un
-- argumento obligatorio de la RPC.

drop function if exists public.crear_visita_con_responsable(uuid, uuid, uuid, text, timestamptz, text);

create or replace function public.crear_visita_con_responsable(
  p_visita_id uuid,
  p_cliente_id uuid,
  p_comercial_id uuid,
  p_proyecto_id uuid,
  p_tipo_visita text default null::text,
  p_fecha timestamp with time zone default now(),
  p_estado_captura text default 'en_curso'::text
) returns visita
language plpgsql as $$
declare v_visita public.visita;
begin
  if p_estado_captura not in ('agendada', 'en_curso') then
    raise exception 'estado_captura inicial no válido: %', p_estado_captura;
  end if;
  if p_proyecto_id is null then
    raise exception 'Una visita necesita un proyecto.';
  end if;
  insert into public.visita (id, cliente_id, proyecto_id, tipo_visita, fecha, estado_captura)
  values (p_visita_id, p_cliente_id, p_proyecto_id, p_tipo_visita, p_fecha, p_estado_captura)
  returning * into v_visita;
  insert into public.visita_participante (visita_id, comercial_id, rol)
  values (p_visita_id, p_comercial_id, 'responsable');
  return v_visita;
end;
$$;
