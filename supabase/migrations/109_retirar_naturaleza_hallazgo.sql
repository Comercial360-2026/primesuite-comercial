-- Prompt maestro 11, Fase 5 — retirar el concepto "naturaleza" del hallazgo.
--
-- Desde PM11 un hallazgo es "algo que tienen": lo que importa es su NOTA y
-- sus ÁREAS del catálogo. La vieja "naturaleza" (Me preocupa / Competencia /
-- Dato del cliente) ya no se pinta en ninguna pantalla ni en el informe
-- (Fases 1–4). Esta migración la borra de la BD, junto con columnas y
-- objetos que ya no sirve nadie:
--
--   - `hallazgo.naturaleza`  (+ su CHECK)         → DROP
--   - `hallazgo.termino_id`  (+ su FK)            → DROP  (las áreas viven en
--                                                   `hallazgo_area` desde Fase 2)
--   - `captura_libre.hallazgo_id` / `.oportunidad_id` (+ sus FK) → DROP
--                                                   (columnas dormidas: "mover
--                                                    de tabla" reutiliza el id,
--                                                    ver migración 107)
--   - vista `vw_resumen_visita`                   → DROP  (sin uso en la app)
--   - vista `vw_mapa_hallazgos_ubicacion`         → DROP  (sin uso en la app)
--
-- Antes de borrar `naturaleza`, los hallazgos marcados como 'riesgo' o
-- 'competencia' conservan esa marca como una línea al final de su nota (los
-- 'contexto' eran el valor neutro por defecto: no se pierde nada).

-- 1) Preservar la marca vieja en el texto -----------------------------------
update public.hallazgo
set nota = nullif(
  btrim(
    coalesce(nota, '') ||
    case naturaleza
      when 'riesgo'      then E'\n(Marcado antes como «Me preocupa».)'
      when 'competencia' then E'\n(Marcado antes como «Competencia».)'
    end,
    E' \n\t\r'
  ), '')
where naturaleza in ('riesgo', 'competencia');

-- 2) Funciones que aún nombran columnas que van a desaparecer --------------

-- `fn_fusionar_termino`: al fusionar un término reapuntaba `hallazgo.termino_id`.
-- Ese camino ya no existe (las áreas están en `hallazgo_area`, y el ecosistema
-- resuelve la fusión al leer vía `vw_termino_resuelto`). Se quita esa línea.
create or replace function public.fn_fusionar_termino()
 returns trigger
 language plpgsql
as $function$
declare
  v_maestro_final uuid;
begin
  if new.estado_gobierno = 'propuesto' or new.fusionado_en_id is null then
    return new;
  end if;

  if (old.fusionado_en_id is distinct from new.fusionado_en_id) then
    select coalesce(fusionado_en_id, id) into v_maestro_final
      from termino where id = new.fusionado_en_id;

    if v_maestro_final <> new.fusionado_en_id then
      new.fusionado_en_id := v_maestro_final;
    end if;

    update oportunidad_termino set termino_id = v_maestro_final
      where termino_id = new.id
        and not exists (
          select 1 from oportunidad_termino ot2
           where ot2.oportunidad_id = oportunidad_termino.oportunidad_id
             and ot2.termino_id = v_maestro_final
             and ot2.rol_en_oportunidad = oportunidad_termino.rol_en_oportunidad
        );
    delete from oportunidad_termino where termino_id = new.id;  -- duplicados residuales tras la fusión
  end if;
  return new;
end;
$function$;

-- `recategorizar_item` (RPC de "Esto es", migración 107): dejaba de escribir
-- `naturaleza='contexto'` al crear el hallazgo destino y de anular
-- `captura_libre.hallazgo_id` antes de borrar el hallazgo origen.
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
    update oportunidad set hallazgo_origen_id = null where hallazgo_origen_id = p_id;
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
  end if;

  -- 7) Hibernar / limpiar áreas según el destino --------------------
  delete from item_hallazgo_hibernado where item_id = p_id;
  if p_hacia <> 'hallazgo' and jsonb_array_length(v_areas) > 0 then
    insert into item_hallazgo_hibernado (item_id, comercial_id, areas)
    values (p_id, v_autor, v_areas);
  end if;

  return p_id;
end;
$function$;

-- 3) Vistas sin uso que nombran `naturaleza` -----------------------------
drop view if exists public.vw_resumen_visita;
drop view if exists public.vw_mapa_hallazgos_ubicacion;

-- 4) `vw_ecosistema_actual_cliente` (matview) sin la columna `naturaleza` --
-- Sigue siendo materializada (cron `refrescar-ecosistema-actual` cada 10 min,
-- REFRESH ... CONCURRENTLY → índice único). Drop + recreate con el mismo
-- nombre; el resto igual que la migración 108.
drop materialized view public.vw_ecosistema_actual_cliente;

create materialized view public.vw_ecosistema_actual_cliente as
with term_areas as (
  select distinct on (cr.cliente_maestro_id, tr.termino_maestro_id)
    cr.cliente_maestro_id as cliente_id,
    tr.termino_maestro_id as termino_id,
    null::uuid            as categoria_id,
    null::text            as categoria_nombre,
    h.nota,
    h.ubicacion_id,
    h.estado_validacion,
    h.creado_en           as fecha_hallazgo,
    h.id                  as hallazgo_id
  from public.hallazgo h
    join public.hallazgo_area ha on ha.hallazgo_id = h.id and ha.termino_id is not null
    join public.vw_cliente_resuelto cr on cr.cliente_id = h.cliente_id
    join public.vw_termino_resuelto tr on tr.termino_id = ha.termino_id
  where h.archivado_en is null
  order by cr.cliente_maestro_id, tr.termino_maestro_id, h.creado_en desc
),
cats_cubiertas as (
  select distinct ta.cliente_id, tmaes.categoria_id
  from term_areas ta
    join public.termino tmaes on tmaes.id = ta.termino_id
  where tmaes.categoria_id is not null
),
cat_areas as (
  select distinct on (cr.cliente_maestro_id, cat.id)
    cr.cliente_maestro_id as cliente_id,
    null::uuid            as termino_id,
    cat.id               as categoria_id,
    cat.nombre           as categoria_nombre,
    h.nota,
    h.ubicacion_id,
    h.estado_validacion,
    h.creado_en           as fecha_hallazgo,
    h.id                  as hallazgo_id
  from public.hallazgo h
    join public.hallazgo_area ha on ha.hallazgo_id = h.id and ha.categoria_id is not null
    join public.vw_cliente_resuelto cr on cr.cliente_id = h.cliente_id
    join public.categoria_vocabulario cat on cat.id = ha.categoria_id
  where h.archivado_en is null
    and not exists (
      select 1 from cats_cubiertas cc
      where cc.cliente_id = cr.cliente_maestro_id
        and cc.categoria_id = ha.categoria_id
    )
  order by cr.cliente_maestro_id, cat.id, h.creado_en desc
)
select * from term_areas
union all
select * from cat_areas;

create unique index uq_vw_ecosistema_actual
  on public.vw_ecosistema_actual_cliente (cliente_id, termino_id, categoria_id) nulls not distinct;

grant select on public.vw_ecosistema_actual_cliente to anon, authenticated, service_role;

-- 5) Borrar las columnas ------------------------------------------------
alter table public.hallazgo       drop column naturaleza;      -- arrastra hallazgo_naturaleza_check
alter table public.hallazgo       drop column termino_id;      -- arrastra hallazgo_termino_id_fkey
alter table public.captura_libre  drop column hallazgo_id;     -- arrastra captura_libre_hallazgo_id_fkey
alter table public.captura_libre  drop column oportunidad_id;  -- arrastra fk_captura_oportunidad
