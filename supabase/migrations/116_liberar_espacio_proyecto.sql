-- Fase 2 de proyecto: "liberar espacio" a nivel de PROYECTO (hoy solo existe
-- por visita individual y en lote dentro de "Mi espacio"). Un proyecto puede
-- acumular muchas visitas cerradas sin forma de liberar su espacio de golpe.
--
-- Mismo aprendizaje del incidente SAPA (12/9, ver migración 115): el candado
-- de negocio (oportunidad abierta) no puede depender de que la UI lo
-- recuerde — vive dentro de eliminar_visita_completa, punto único. Pero a
-- diferencia de eliminar_cliente_completo (todo-o-nada: si una visita falla,
-- aborta el cliente entero), aquí cada visita del proyecto es independiente:
-- un fallo en una (oportunidad recién abierta, sin permiso, ya no pertenece
-- al proyecto) no debe impedir liberar las demás.

-- 1) Previsualización agregada del proyecto: qué visitas cerradas hay, cuánto
-- ocupan, cuáles están bloqueadas y por qué. Mismo patrón que
-- fn_mis_visitas_espacio (114) para bytes, y que previsualizar_borrado_visita
-- (115) para rutas_storage (viene de captura_libre, no de listar el bucket).
create or replace function public.fn_visitas_liberables_proyecto(p_proyecto_id uuid)
returns table(
  visita_id uuid,
  fecha timestamptz,
  bytes bigint,
  oportunidades_abiertas bigint,
  rutas_storage text[],
  puede_liberarla boolean
)
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_autorizado boolean;
begin
  select exists (
    select 1
    from proyecto p
    join cliente c on c.id = p.cliente_id
    where p.id = p_proyecto_id
      and (
        fn_rol_actual() = 'direccion_comercial'
        or c.responsable_id = auth.uid()
        or exists (
          select 1
          from visita v2
          join visita_participante vp on vp.visita_id = v2.id
          where v2.proyecto_id = p_proyecto_id and vp.comercial_id = auth.uid()
        )
      )
  ) into v_autorizado;

  if not v_autorizado then
    raise exception 'No tienes permiso para ver el espacio de este proyecto.';
  end if;

  return query
  select
    v.id,
    v.fecha,
    coalesce((
      select sum((o.metadata->>'size')::bigint)
      from storage.objects o
      where o.bucket_id in ('fotos-visita', 'audios-visita')
        and split_part(o.name, '/', 1) = v.id::text
    ), 0)::bigint,
    (select count(*) from oportunidad op where op.visita_origen_id = v.id and op.etapa <> 'cerrada'),
    (select array_agg(cl.storage_path) from captura_libre cl where cl.visita_id = v.id and cl.storage_path is not null),
    exists (
      select 1 from visita_participante vp
      where vp.visita_id = v.id and vp.comercial_id = auth.uid() and vp.rol = 'responsable'
    ) or fn_rol_actual() = 'direccion_comercial'
  from visita v
  where v.proyecto_id = p_proyecto_id
    and v.estado_captura in ('consolidada', 'cerrada')
  order by v.fecha asc;
end;
$function$;

-- 2) Liberar varias visitas del proyecto de una vez. Recibe ya los ids
-- elegidos (filtrados en cliente por candado de cola local, que no puede
-- vivir en servidor) y, para cada uno, deja que eliminar_visita_completa
-- aplique su propio candado (oportunidad abierta / permiso) — sin
-- duplicarlo aquí. Un fallo en una visita se reporta con su motivo real y
-- NO aborta las demás (exception when others por iteración).
create or replace function public.liberar_visitas_proyecto(p_proyecto_id uuid, p_visita_ids uuid[])
returns table(visita_id uuid, liberada boolean, motivo text)
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  foreach v_id in array coalesce(p_visita_ids, '{}') loop
    if not exists (
      select 1 from visita
      where id = v_id
        and proyecto_id = p_proyecto_id
        and estado_captura in ('consolidada', 'cerrada')
    ) then
      visita_id := v_id;
      liberada := false;
      motivo := 'La visita ya no pertenece a este proyecto o ya no está cerrada.';
      return next;
      continue;
    end if;

    begin
      perform eliminar_visita_completa(v_id);
      visita_id := v_id;
      liberada := true;
      motivo := null;
    exception when others then
      visita_id := v_id;
      liberada := false;
      motivo := sqlerrm;
    end;
    return next;
  end loop;
end;
$function$;
