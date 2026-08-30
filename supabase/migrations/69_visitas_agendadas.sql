-- 69 — Visitas agendadas (planificar una visita a fecha futura)
-- Pendiente de aplicar a producción.
--
-- Hasta ahora toda vía de crear visita hacía `fecha = now()` y la visita
-- nacía 'en_curso' (metiendo directo en captura). No había forma de dejar
-- una visita planificada para otro día. Esta migración:
--   1. Añade el estado 'agendada' a estado_captura.
--   2. Permite a crear_visita_con_responsable recibir fecha y estado.
--   3. Excluye las agendadas del cálculo de "última visita" del semáforo
--      (si no, una visita futura mete la última visita en el futuro y el
--      cliente sale verde/amarillo sin haberlo visitado).

-- 1 -------------------------------------------------------------------------
alter table public.visita drop constraint visita_estado_captura_check;
alter table public.visita add constraint visita_estado_captura_check
  check (estado_captura in ('agendada', 'en_curso', 'consolidada'));

-- 2 -------------------------------------------------------------------------
-- DROP + CREATE (no CREATE OR REPLACE): se añaden parámetros, lo que cambia
-- la firma. Los 4 primeros parámetros mantienen nombre, tipo y orden, así
-- que una llamada antigua (solo esos 4) sigue funcionando con los defaults.
drop function if exists public.crear_visita_con_responsable(uuid, uuid, uuid, text);

create function public.crear_visita_con_responsable(
  p_visita_id uuid,
  p_cliente_id uuid,
  p_comercial_id uuid,
  p_tipo_visita text default null,
  p_fecha timestamptz default now(),
  p_estado_captura text default 'en_curso'
)
returns public.visita
language plpgsql
as $function$
declare
  v_visita public.visita;
begin
  if p_estado_captura not in ('agendada', 'en_curso') then
    raise exception 'estado_captura inicial no válido: %', p_estado_captura;
  end if;

  insert into public.visita (id, cliente_id, tipo_visita, fecha, estado_captura)
  values (p_visita_id, p_cliente_id, p_tipo_visita, p_fecha, p_estado_captura)
  returning * into v_visita;

  insert into public.visita_participante (visita_id, comercial_id, rol)
  values (p_visita_id, p_comercial_id, 'responsable');

  return v_visita;
end;
$function$;

-- 3 -------------------------------------------------------------------------
create or replace view public.vw_semaforo_cliente as
 select cr.cliente_maestro_id as cliente_id,
    cr.cliente_maestro_nombre as cliente_nombre,
    max(v.fecha) as ultima_visita,
    count(distinct o.id) filter (where (o.etapa <> all (array['ganada'::text, 'perdida'::text, 'descartada'::text]))) as oportunidades_activas,
        case
            when (count(distinct o.id) filter (where (o.etapa <> all (array['ganada'::text, 'perdida'::text, 'descartada'::text]))) > 0) then 'verde'::text
            when (max(v.fecha) >= (now() - '90 days'::interval)) then 'amarillo'::text
            else 'rojo'::text
        end as semaforo
   from ((public.vw_cliente_resuelto cr
     left join public.visita v on ((v.cliente_id = cr.cliente_id) and (v.estado_captura <> 'agendada'::text)))
     left join public.oportunidad o on ((o.cliente_id = cr.cliente_id)))
  group by cr.cliente_maestro_id, cr.cliente_maestro_nombre;
