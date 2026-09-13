-- 107 · Recategorizar un item: nota ⇄ hallazgo ⇄ oportunidad
-- Prompt maestro 11, Fase 3.
--
-- El comercial captura casi todo como "nota". Que además sea un hallazgo
-- ("algo que tienen") o una oportunidad ("algo para venderles") es una
-- marca que se pone o se quita después — también con la visita cerrada:
-- la RLS de las 3 tablas ya permite UPDATE/DELETE al autor y a Dirección
-- sin candado por estado de la visita, y el informe se regenera con datos
-- vivos en cada descarga.
--
-- Las 3 entidades son tablas distintas, así que "cambiar de tipo" = mover
-- de tabla en una sola transacción:
--   · se REUTILIZA el id. Nada apunta a captura_libre.id; a hallazgo y a
--     oportunidad solo apuntan columnas que esta función pone a NULL antes
--     de borrar, o filas que el guard obliga a resolver primero.
--   · NO se pierde nada: texto, título, zona, ubicación y la fecha de
--     creación original viajan al destino. El título de una nota se
--     antepone a su texto. La fecha relevante de un hallazgo, si la tiene,
--     se anota en el texto al dejar de ser hallazgo.
--   · las ÁREAS del catálogo de un hallazgo (que una nota / una oportunidad
--     no pueden guardar) se hibernan en `item_hallazgo_hibernado` y
--     vuelven solas si el item se marca otra vez como hallazgo.

-- --------------------------------------------------------------------------
-- Hibernación de áreas mientras el item no es un hallazgo
-- --------------------------------------------------------------------------
create table if not exists item_hallazgo_hibernado (
  item_id      uuid primary key,
  comercial_id uuid not null references comercial(id) on delete cascade,
  areas        jsonb not null default '[]'::jsonb,   -- [{tipo:'categoria'|'termino', id:uuid}, ...]
  congelado_en timestamptz not null default now()
);

comment on table item_hallazgo_hibernado is
  'Áreas del catálogo de un hallazgo mientras el item está convertido en nota u oportunidad (prompt maestro 11, Fase 3). Se restauran solas al volver a hallazgo. Solo la escribe/lee recategorizar_item (SECURITY DEFINER).';

alter table item_hallazgo_hibernado enable row level security;
-- Sin políticas a propósito: ningún cliente PostgREST la toca; solo la
-- función recategorizar_item, que corre como owner y salta la RLS.

-- Si el item se borra de verdad desde su ficha, su hibernación deja de
-- tener sentido.
create or replace function fn_limpiar_hibernado()
returns trigger
language plpgsql
as $$
begin
  delete from item_hallazgo_hibernado where item_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_limpiar_hibernado_captura on captura_libre;
create trigger trg_limpiar_hibernado_captura after delete on captura_libre
  for each row execute function fn_limpiar_hibernado();

drop trigger if exists trg_limpiar_hibernado_hallazgo on hallazgo;
create trigger trg_limpiar_hibernado_hallazgo after delete on hallazgo
  for each row execute function fn_limpiar_hibernado();

drop trigger if exists trg_limpiar_hibernado_oportunidad on oportunidad;
create trigger trg_limpiar_hibernado_oportunidad after delete on oportunidad
  for each row execute function fn_limpiar_hibernado();

-- --------------------------------------------------------------------------
-- recategorizar_item(id, desde, hacia) -> id (el mismo)
-- --------------------------------------------------------------------------
create or replace function recategorizar_item(p_id uuid, p_desde text, p_hacia text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_autor       uuid;
  v_visita_id   uuid;
  v_cliente_id  uuid;
  v_proyecto_id uuid;
  v_zona        text;
  v_ubicacion   uuid;
  v_creado      timestamptz;
  v_texto       text;   -- cuerpo unificado (nota / descripcion / hallazgo.nota)
  v_titulo      text;   -- solo notas y oportunidades
  v_areas       jsonb := '[]'::jsonb;
  v_fecha       date;
  v_tipo_fecha  text;
  v_extra       text := '';
begin
  if p_desde = p_hacia then
    raise exception 'Origen y destino son el mismo tipo.';
  end if;
  if p_desde not in ('nota','hallazgo','oportunidad')
     or p_hacia not in ('nota','hallazgo','oportunidad') then
    raise exception 'Tipo no válido: %/%.', p_desde, p_hacia;
  end if;

  -- 1) Cargar el origen -----------------------------------------------------
  if p_desde = 'nota' then
    select comercial_autor_id, visita_id, cliente_id, zona_texto, ubicacion_id, creado_en,
           contenido_texto, titulo
      into v_autor, v_visita_id, v_cliente_id, v_zona, v_ubicacion, v_creado, v_texto, v_titulo
      from captura_libre where id = p_id and tipo = 'nota';
  elsif p_desde = 'hallazgo' then
    select comercial_autor_id, visita_id, cliente_id, proyecto_id, zona_texto, ubicacion_id, creado_en,
           nota, fecha_relevante, tipo_fecha_relevante
      into v_autor, v_visita_id, v_cliente_id, v_proyecto_id, v_zona, v_ubicacion, v_creado,
           v_texto, v_fecha, v_tipo_fecha
      from hallazgo where id = p_id;
  else
    select comercial_autor_id, visita_origen_id, cliente_id, proyecto_id, zona_texto, ubicacion_id, creado_en,
           coalesce(descripcion, titulo), titulo
      into v_autor, v_visita_id, v_cliente_id, v_proyecto_id, v_zona, v_ubicacion, v_creado,
           v_texto, v_titulo
      from oportunidad where id = p_id;
  end if;

  if v_autor is null then
    raise exception 'El elemento no existe o ya se ha cambiado de tipo.';
  end if;
  if not (v_autor = auth.uid() or fn_rol_actual() = 'direccion_comercial') then
    raise exception 'No tienes permiso: solo el autor o Dirección Comercial pueden cambiar esto de tipo.';
  end if;

  -- cliente / proyecto que falten, de la visita
  if v_proyecto_id is null or v_cliente_id is null then
    select proyecto_id, cliente_id into v_proyecto_id, v_cliente_id
      from visita where id = v_visita_id;
  end if;
  if p_hacia in ('hallazgo','oportunidad') and v_proyecto_id is null then
    raise exception 'La visita de origen no tiene proyecto; no se puede crear el %.', p_hacia;
  end if;

  -- 2) Guard: una oportunidad "en marcha" no se degrada -------------------
  if p_desde = 'oportunidad' then
    if exists (select 1 from oportunidad where id = p_id and etapa <> 'latente')
       or exists (select 1 from oportunidad_termino where oportunidad_id = p_id)
       or exists (select 1 from oportunidad_visita_seguimiento where oportunidad_id = p_id)
       or exists (select 1 from proximo_paso where oportunidad_id = p_id)
       or exists (select 1 from oportunidad where oportunidad_antecedente_id = p_id)
    then
      raise exception 'Esta oportunidad ya está en marcha (tiene etapa avanzada, términos, seguimiento o próximos pasos). Ciérrala o bórrala antes de cambiarla de tipo.';
    end if;
  end if;

  -- 3) Recoger las áreas ANTES de borrar nada ----------------------------
  if p_desde = 'hallazgo' then
    select coalesce(jsonb_agg(
             case when categoria_id is not null
                  then jsonb_build_object('tipo','categoria','id',categoria_id)
                  else jsonb_build_object('tipo','termino','id',termino_id) end), '[]'::jsonb)
      into v_areas
      from hallazgo_area where hallazgo_id = p_id;
  else
    select areas into v_areas from item_hallazgo_hibernado where item_id = p_id;
    v_areas := coalesce(v_areas, '[]'::jsonb);
  end if;

  -- 4) Texto: no perder ni el título ni la fecha relevante --------------
  if p_desde = 'nota' and coalesce(v_titulo,'') <> '' then
    v_texto := v_titulo || E'\n' || coalesce(v_texto,'');
  end if;
  if p_desde = 'hallazgo' and v_fecha is not null and p_hacia <> 'hallazgo' then
    v_extra := E'\n\nFecha relevante: ' || to_char(v_fecha,'DD/MM/YYYY')
               || coalesce(' (' || v_tipo_fecha || ')', '');
  end if;

  -- 5) Borrar el origen -------------------------------------------------
  if p_desde = 'nota' then
    delete from captura_libre where id = p_id;
  elsif p_desde = 'hallazgo' then
    update captura_libre set hallazgo_id = null where hallazgo_id = p_id;
    update oportunidad     set hallazgo_origen_id = null where hallazgo_origen_id = p_id;
    delete from hallazgo where id = p_id;   -- hallazgo_area cae en cascada
  else
    delete from oportunidad where id = p_id;
  end if;

  -- 6) Crear el destino con el MISMO id -------------------------------
  if p_hacia = 'nota' then
    insert into captura_libre (id, visita_id, cliente_id, comercial_autor_id, tipo,
                               contenido_texto, ubicacion_id, zona_texto, estado_subida, creado_en)
    values (p_id, v_visita_id, v_cliente_id, v_autor, 'nota',
            nullif(btrim(coalesce(v_texto,'') || v_extra), ''), v_ubicacion, v_zona, 'completado', v_creado);

  elsif p_hacia = 'hallazgo' then
    insert into hallazgo (id, visita_id, cliente_id, proyecto_id, comercial_autor_id,
                          naturaleza, nota, ubicacion_id, zona_texto, creado_en)
    values (p_id, v_visita_id, v_cliente_id, v_proyecto_id, v_autor,
            'contexto', nullif(btrim(coalesce(v_texto,'')), ''), v_ubicacion, v_zona, v_creado);

    insert into hallazgo_area (hallazgo_id, categoria_id, termino_id)
    select p_id,
           case when a->>'tipo' = 'categoria' then (a->>'id')::uuid end,
           case when a->>'tipo' = 'termino'   then (a->>'id')::uuid end
    from jsonb_array_elements(v_areas) a;

  else -- oportunidad
    insert into oportunidad (id, cliente_id, proyecto_id, comercial_autor_id, visita_origen_id,
                             titulo, descripcion, prioridad, etapa, ubicacion_id, zona_texto, creado_en)
    values (p_id, v_cliente_id, v_proyecto_id, v_autor, v_visita_id,
            left(coalesce(nullif(btrim(coalesce(v_titulo, v_texto)), ''), 'Sin título'), 160),
            nullif(btrim(coalesce(v_texto,'') || v_extra), ''),
            'media', 'latente', v_ubicacion, v_zona, v_creado);
  end if;

  -- 7) Hibernar / limpiar áreas según el destino --------------------
  delete from item_hallazgo_hibernado where item_id = p_id;
  if p_hacia <> 'hallazgo' and jsonb_array_length(v_areas) > 0 then
    insert into item_hallazgo_hibernado (item_id, comercial_id, areas)
    values (p_id, v_autor, v_areas);
  end if;

  return p_id;
end;
$$;

revoke all on function recategorizar_item(uuid, text, text) from public;
grant execute on function recategorizar_item(uuid, text, text) to authenticated;
