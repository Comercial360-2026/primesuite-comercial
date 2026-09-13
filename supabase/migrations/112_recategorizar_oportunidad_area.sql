-- 112 · recategorizar_item: usar oportunidad_area, no la tabla muerta
-- oportunidad_termino.
--
-- La migración 111 (Categoría en Oportunidad) movió la clasificación de una
-- oportunidad a `oportunidad_area` (mismo mecanismo que `hallazgo_area`),
-- pero no tocó `recategorizar_item` ("Esto es", migración 107/109), que
-- seguía mirando `oportunidad_termino` — tabla a la que ya no escribe nadie
-- desde 111. Dos efectos reales, no solo cosméticos:
--
--   1. El guard "una oportunidad en marcha no se degrada" comprobaba
--      `oportunidad_termino` para bloquear si tenía términos — esa
--      condición ya no se cumple NUNCA (la tabla está siempre vacía), así
--      que dejó de proteger nada. Como una Categoría en Oportunidad ahora es
--      la misma etiqueta ligera que en Hallazgo (no bloquea allí), se quita
--      la condición en vez de repuntarla — sería más estricto de lo que ya
--      es el propio Hallazgo.
--   2. Al recoger las áreas para conservarlas (paso 3 de la función), el
--      origen 'oportunidad' nunca leía `oportunidad_area`, solo
--      `item_hallazgo_hibernado` (los restos de una hibernación de cuando
--      el item fue hallazgo). Resultado: la Categoría puesta en la
--      oportunidad se perdía sin más al pasarla a nota/hallazgo con
--      "Esto es" — `oportunidad_area` cae en cascada al borrar la
--      oportunidad, y nunca se copiaba a ningún sitio antes de ese borrado.
--
-- Se aprovecha para hacer simétrico el tratamiento de áreas entre hallazgo y
-- oportunidad: cada uno escribe/lee su propia tabla de áreas de inmediato
-- (antes solo hallazgo lo hacía; oportunidad quedaba hibernada hasta volver
-- a ser hallazgo). La hibernación en `item_hallazgo_hibernado` queda
-- reservada para el único estado sin tabla de áreas propia: 'nota'.

create or replace function public.recategorizar_item(p_id uuid, p_desde text, p_hacia text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
  v_hibernado   jsonb;
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
  -- (ya no comprueba términos/categoría: esa etiqueta no implica "en
  -- marcha", igual que en hallazgo)
  if p_desde = 'oportunidad' then
    if exists (select 1 from oportunidad where id = p_id and etapa <> 'latente')
       or exists (select 1 from oportunidad_visita_seguimiento where oportunidad_id = p_id)
       or exists (select 1 from proximo_paso where oportunidad_id = p_id)
       or exists (select 1 from oportunidad where oportunidad_antecedente_id = p_id)
    then
      raise exception 'Esta oportunidad ya está en marcha (tiene etapa avanzada, seguimiento o próximos pasos). Ciérrala o bórrala antes de cambiarla de tipo.';
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
  elsif p_desde = 'oportunidad' then
    select coalesce(jsonb_agg(
             case when categoria_id is not null
                  then jsonb_build_object('tipo','categoria','id',categoria_id)
                  else jsonb_build_object('tipo','termino','id',termino_id) end), '[]'::jsonb)
      into v_areas
      from oportunidad_area where oportunidad_id = p_id;
    -- restos de una hibernación anterior (fue hallazgo antes de ser esta
    -- oportunidad y nunca volvió a serlo) que la Categoría de oportunidad
    -- no haya vuelto a cubrir ya
    select areas into v_hibernado from item_hallazgo_hibernado where item_id = p_id;
    if v_hibernado is not null and jsonb_array_length(v_hibernado) > 0 then
      select v_areas || coalesce(jsonb_agg(h), '[]'::jsonb)
        into v_areas
        from jsonb_array_elements(v_hibernado) h
        where not exists (
          select 1 from jsonb_array_elements(v_areas) a
          where a->>'tipo' = h->>'tipo' and a->>'id' = h->>'id'
        );
    end if;
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
    update oportunidad set hallazgo_origen_id = null where hallazgo_origen_id = p_id;
    delete from hallazgo where id = p_id;   -- hallazgo_area cae en cascada
  else
    delete from oportunidad where id = p_id;   -- oportunidad_area cae en cascada
  end if;

  -- 6) Crear el destino con el MISMO id -------------------------------
  if p_hacia = 'nota' then
    insert into captura_libre (id, visita_id, cliente_id, comercial_autor_id, tipo,
                               contenido_texto, ubicacion_id, zona_texto, estado_subida, creado_en)
    values (p_id, v_visita_id, v_cliente_id, v_autor, 'nota',
            nullif(btrim(coalesce(v_texto,'') || v_extra), ''), v_ubicacion, v_zona, 'completado', v_creado);

  elsif p_hacia = 'hallazgo' then
    insert into hallazgo (id, visita_id, cliente_id, proyecto_id, comercial_autor_id,
                          nota, ubicacion_id, zona_texto, creado_en)
    values (p_id, v_visita_id, v_cliente_id, v_proyecto_id, v_autor,
            nullif(btrim(coalesce(v_texto,'')), ''), v_ubicacion, v_zona, v_creado);

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

    insert into oportunidad_area (oportunidad_id, categoria_id, termino_id)
    select p_id,
           case when a->>'tipo' = 'categoria' then (a->>'id')::uuid end,
           case when a->>'tipo' = 'termino'   then (a->>'id')::uuid end
    from jsonb_array_elements(v_areas) a;
  end if;

  -- 7) Hibernar / limpiar áreas — solo hace falta para 'nota', que no tiene
  -- tabla de áreas propia; hallazgo y oportunidad ya las guardaron en su
  -- propia tabla en el paso 6.
  delete from item_hallazgo_hibernado where item_id = p_id;
  if p_hacia = 'nota' and jsonb_array_length(v_areas) > 0 then
    insert into item_hallazgo_hibernado (item_id, comercial_id, areas)
    values (p_id, v_autor, v_areas);
  end if;

  return p_id;
end;
$function$;
