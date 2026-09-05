-- fn_fusionar_cliente movía interlocutor/ubicacion/visita/oportunidad/
-- hallazgo/captura_libre al cliente maestro al fusionar, pero no proyecto —
-- dejaba los proyecto del cliente fusionado huérfanos (cliente_id apuntando
-- a un cliente ya fusionado) y a sus visitas/hallazgos/oportunidades (ya
-- movidos al maestro) con un proyecto_id que ya no correspondía a su propio
-- cliente_id.
--
-- Al mover los proyecto del cliente fusionado al maestro, su "Proyecto
-- General" (es_general) se degrada a proyecto normal — el maestro ya tiene
-- el suyo, y el índice único ux_proyecto_general_por_cliente solo permite
-- uno por cliente. Se renombra para que no queden dos "General" bajo el
-- mismo cliente en la ficha (Fase 3).
create or replace function public.fn_fusionar_cliente()
returns trigger
language plpgsql
as $function$
declare
  v_maestro_final uuid;
begin
  if new.estado_fusion = 'fusionado' and (old.estado_fusion is distinct from 'fusionado' or old.fusionado_en_id is distinct from new.fusionado_en_id) then

    -- Resuelve el maestro final por si new.fusionado_en_id apunta a otro cliente ya fusionado
    select coalesce(fusionado_en_id, id) into v_maestro_final
      from cliente where id = new.fusionado_en_id;

    if v_maestro_final <> new.fusionado_en_id then
      new.fusionado_en_id := v_maestro_final;
    end if;

    update interlocutor set cliente_id = v_maestro_final where cliente_id = new.id;
    update ubicacion     set cliente_id = v_maestro_final where cliente_id = new.id;
    update visita        set cliente_id = v_maestro_final where cliente_id = new.id;
    update oportunidad    set cliente_id = v_maestro_final where cliente_id = new.id;
    update hallazgo       set cliente_id = v_maestro_final where cliente_id = new.id;
    update captura_libre  set cliente_id = v_maestro_final where cliente_id = new.id;
    update proyecto
       set cliente_id = v_maestro_final,
           es_general = false,
           nombre = case when es_general then 'General (' || new.nombre || ')' else nombre end
     where cliente_id = new.id;
  end if;
  return new;
end;
$function$;
