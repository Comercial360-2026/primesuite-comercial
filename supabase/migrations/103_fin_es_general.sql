-- 103 — Fin de `proyecto.es_general`.
--
-- Modelo estricto y visible: Cliente -> 1..N Proyectos -> 1..N Visitas, todo
-- explícito, sin "proyecto General oculto". Al dar de alta un cliente se mete
-- nombre de cliente + nombre del primer proyecto.
-- Spec: docs/prompt-maestro-proyecto-obligatorio.md
--       docs/prompt-maestro-01-migracion-fin-es-general.md

-- 1. Renombrar los proyectos "General" a un placeholder neutro. La actividad
--    (visitas/oportunidades/hallazgos/pasos) NO se mueve: sigue apuntando al
--    mismo proyecto_id. Dirección los renombrará cliente a cliente.
update public.proyecto
   set nombre = 'Proyecto principal'
 where es_general = true;

-- 2. `proyecto_id` de una visita pasa a ser obligatorio de verdad.
--    El trigger se conserva (deriva cliente_id desde proyecto_id) pero ya no
--    cae al proyecto General: una visita sin proyecto es un error explícito.
create or replace function public.fn_set_proyecto_id_visita()
returns trigger language plpgsql as $$
begin
  if new.proyecto_id is null then
    raise exception 'Una visita necesita un proyecto.';
  end if;
  select cliente_id into new.cliente_id
    from public.proyecto where id = new.proyecto_id;
  if new.cliente_id is null then
    raise exception 'El proyecto % no existe.', new.proyecto_id;
  end if;
  return new;
end;
$$;

alter table public.visita alter column proyecto_id set not null;

-- 3. Alta de cliente: fuera el trigger que creaba el proyecto "General";
--    en su lugar, una RPC transaccional que crea cliente + primer proyecto.
drop trigger if exists trg_cliente_crear_proyecto_general on public.cliente;
drop function if exists public.fn_crear_proyecto_general();

create or replace function public.crear_cliente_con_proyecto(
  p_cliente_id       uuid,
  p_nombre_cliente   text,
  p_nombre_proyecto  text,
  p_creado_por       uuid,
  p_responsable_id   uuid
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

  insert into public.cliente (id, nombre, estado_relacion, creado_por, responsable_id)
  values (p_cliente_id, btrim(p_nombre_cliente), 'borrador', p_creado_por, p_responsable_id);

  insert into public.proyecto (cliente_id, nombre, estado, creado_por)
  values (p_cliente_id, btrim(p_nombre_proyecto), 'activo', p_creado_por)
  returning id into v_proy;

  return query select p_cliente_id, v_proy;
end;
$$;

-- 4. Fusión de clientes: los proyectos del absorbido pasan tal cual (solo
--    cambia cliente_id). Sin caso especial del "General".
create or replace function public.fn_fusionar_cliente()
returns trigger language plpgsql as $$
declare
  v_maestro_final uuid;
begin
  if new.estado_fusion = 'fusionado' and (old.estado_fusion is distinct from 'fusionado' or old.fusionado_en_id is distinct from new.fusionado_en_id) then

    select coalesce(fusionado_en_id, id) into v_maestro_final
      from cliente where id = new.fusionado_en_id;

    if v_maestro_final <> new.fusionado_en_id then
      new.fusionado_en_id := v_maestro_final;
    end if;

    update interlocutor  set cliente_id = v_maestro_final where cliente_id = new.id;
    update ubicacion      set cliente_id = v_maestro_final where cliente_id = new.id;
    update visita         set cliente_id = v_maestro_final where cliente_id = new.id;
    update oportunidad    set cliente_id = v_maestro_final where cliente_id = new.id;
    update hallazgo       set cliente_id = v_maestro_final where cliente_id = new.id;
    update captura_libre  set cliente_id = v_maestro_final where cliente_id = new.id;
    update proyecto       set cliente_id = v_maestro_final where cliente_id = new.id;
  end if;
  return new;
end;
$$;

-- 5. Actividad por proyecto (Dirección): fuera la columna `es_general`.
drop function if exists public.fn_actividad_comercial_por_proyecto(uuid, timestamptz);

create or replace function public.fn_actividad_comercial_por_proyecto(
  p_comercial_id uuid,
  p_desde timestamp with time zone default null::timestamp with time zone
)
returns table(
  proyecto_id uuid, proyecto_nombre text, cliente_id uuid, cliente_nombre text,
  num_visitas bigint, num_hallazgos bigint, num_fotos bigint, num_audios bigint,
  num_notas bigint, num_oportunidades_creadas bigint, num_oportunidades_en_curso bigint
)
language sql stable security definer set search_path to 'public' as $$
  with visitas as (
    select v.proyecto_id, count(distinct vp.visita_id) as num_visitas
    from visita_participante vp
    join visita v on v.id = vp.visita_id
    where vp.comercial_id = p_comercial_id and vp.rol = 'responsable'
      and (p_desde is null or v.fecha >= p_desde)
    group by v.proyecto_id
  ),
  hallazgos as (
    select h.proyecto_id, count(distinct h.id) as num_hallazgos
    from hallazgo h
    where h.comercial_autor_id = p_comercial_id
      and (p_desde is null or h.creado_en >= p_desde)
    group by h.proyecto_id
  ),
  capturas as (
    select v.proyecto_id,
      count(distinct cl.id) filter (where cl.tipo = 'foto') as num_fotos,
      count(distinct cl.id) filter (where cl.tipo = 'audio') as num_audios,
      count(distinct cl.id) filter (where cl.tipo = 'nota') as num_notas
    from captura_libre cl
    join visita v on v.id = cl.visita_id
    where cl.comercial_autor_id = p_comercial_id
      and (p_desde is null or cl.creado_en >= p_desde)
    group by v.proyecto_id
  ),
  oportunidades as (
    select o.proyecto_id,
      count(distinct o.id) as num_oportunidades_creadas,
      count(distinct o.id) filter (where o.etapa <> all (array['ganada', 'perdida', 'descartada'])) as num_oportunidades_en_curso
    from oportunidad o
    where o.comercial_autor_id = p_comercial_id
      and (p_desde is null or o.creado_en >= p_desde)
    group by o.proyecto_id
  ),
  claves as (
    select proyecto_id from visitas
    union select proyecto_id from hallazgos
    union select proyecto_id from capturas
    union select proyecto_id from oportunidades
  )
  select
    k.proyecto_id,
    p.nombre as proyecto_nombre,
    p.cliente_id,
    c.nombre as cliente_nombre,
    coalesce(vi.num_visitas, 0) as num_visitas,
    coalesce(ha.num_hallazgos, 0) as num_hallazgos,
    coalesce(ca.num_fotos, 0) as num_fotos,
    coalesce(ca.num_audios, 0) as num_audios,
    coalesce(ca.num_notas, 0) as num_notas,
    coalesce(op.num_oportunidades_creadas, 0) as num_oportunidades_creadas,
    coalesce(op.num_oportunidades_en_curso, 0) as num_oportunidades_en_curso
  from claves k
    join proyecto p on p.id = k.proyecto_id
    join cliente c on c.id = p.cliente_id
    left join visitas vi on vi.proyecto_id = k.proyecto_id
    left join hallazgos ha on ha.proyecto_id = k.proyecto_id
    left join capturas ca on ca.proyecto_id = k.proyecto_id
    left join oportunidades op on op.proyecto_id = k.proyecto_id
  where exists (select 1 from comercial c2 where c2.id = auth.uid() and c2.rol = 'direccion_comercial')
  order by
    (coalesce(vi.num_visitas, 0) + coalesce(ha.num_hallazgos, 0) + coalesce(ca.num_fotos, 0)
      + coalesce(ca.num_audios, 0) + coalesce(ca.num_notas, 0) + coalesce(op.num_oportunidades_creadas, 0)) desc,
    p.nombre;
$$;

-- 6. Borrar un proyecto: ya no hay "General" donde reubicar. Destino explícito
--    y obligatorio; se bloquea si es el único proyecto del cliente.
drop function if exists public.eliminar_proyecto(uuid);

create or replace function public.eliminar_proyecto(
  p_proyecto_id uuid,
  p_destino_id  uuid
) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_cliente uuid; v_cliente_destino uuid; v_total int;
begin
  if not fn_comercial_actual_activo() then
    raise exception 'No tienes permiso para borrar proyectos.';
  end if;
  select cliente_id into v_cliente from proyecto where id = p_proyecto_id;
  if v_cliente is null then
    raise exception 'El proyecto no existe o ya se había borrado.';
  end if;
  select count(*) into v_total from proyecto where cliente_id = v_cliente;
  if v_total <= 1 then
    raise exception 'Es el único proyecto del cliente; no se puede borrar.';
  end if;
  select cliente_id into v_cliente_destino from proyecto where id = p_destino_id;
  if v_cliente_destino is null or v_cliente_destino <> v_cliente then
    raise exception 'El proyecto de destino no es válido para este cliente.';
  end if;

  update visita       set proyecto_id = p_destino_id where proyecto_id = p_proyecto_id;
  update oportunidad  set proyecto_id = p_destino_id where proyecto_id = p_proyecto_id;
  update hallazgo     set proyecto_id = p_destino_id where proyecto_id = p_proyecto_id;
  update proximo_paso set proyecto_id = p_destino_id where proyecto_id = p_proyecto_id;
  delete from proyecto where id = p_proyecto_id;
end;
$$;

-- 7. Fuera la columna (ya ninguna función la referencia).
alter table public.proyecto drop column es_general;
