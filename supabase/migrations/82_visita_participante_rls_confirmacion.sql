-- Ajustes de RLS y del trigger de responsable para el flujo de
-- confirmación de participación (mig. 81).

-- 1) BUG que destapa la mig. 81 ---------------------------------------
-- Hasta ahora solo Dirección Comercial hacía UPDATE/DELETE sobre
-- visita_participante. Con la 81, un comercial normal (el invitado)
-- hace UPDATE de SU fila para aceptar/rechazar. El trigger
-- fn_check_visita_tiene_responsable NO es SECURITY DEFINER, así que
-- corre con los permisos del invitado: la política RLS le oculta la
-- fila del responsable (es de otro comercial) y cuenta 0 responsables
-- -> "La visita X debe tener exactamente un comercial responsable
-- (tiene 0)" -> 400 al aceptar o rechazar.
-- Se recrea la función idéntica pero SECURITY DEFINER + search_path
-- fijo, para que el recuento vea todas las filas.
create or replace function public.fn_check_visita_tiene_responsable()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_count int;
begin
  v_id := coalesce(new.visita_id, old.visita_id);

  -- Si la visita en sí ya no existe (se borró en la misma transacción,
  -- p.ej. dentro de eliminar_visita_completa), no tiene sentido exigir
  -- un responsable para algo que ya no existe.
  if not exists (select 1 from visita where id = v_id) then
    return null;
  end if;

  select count(*) into v_count
    from visita_participante
   where visita_id = v_id and rol = 'responsable';
  if v_count <> 1 then
    raise exception 'La visita % debe tener exactamente un comercial responsable (tiene %)', v_id, v_count;
  end if;
  return null;
end;
$function$;

-- 2) Endurecer las políticas -----------------------------------------
-- UPDATE lo podía hacer CUALQUIER participante de la visita sobre la
-- fila de CUALQUIER otro (fn_es_participante_de_visita). Con la 81 eso
-- deja a un invitado aceptar/rechazar en nombre de un compañero. Se
-- acota a: tu propia fila, la de alguien a quien TÚ añadiste (para
-- marcar rechazo_visto), o Dirección Comercial.
drop policy if exists pol_participante_update on visita_participante;
create policy pol_participante_update on visita_participante
  for update
  using (
    comercial_id = auth.uid()
    or anadido_por = auth.uid()
    or fn_rol_actual() = 'direccion_comercial'
  )
  with check (
    comercial_id = auth.uid()
    or anadido_por = auth.uid()
    or fn_rol_actual() = 'direccion_comercial'
  );

-- SELECT no dejaba a quien añadió ver la fila que le rechazaron salvo
-- que fuese Dirección (que hoy siempre lo es). Se añade anadido_por
-- para que el aviso de rechazo funcione aunque un día añada otro rol.
drop policy if exists pol_participante_select on visita_participante;
create policy pol_participante_select on visita_participante
  for select
  using (
    comercial_id = auth.uid()
    or anadido_por = auth.uid()
    or fn_estado_captura_visita(visita_id) = 'consolidada'
    or fn_rol_actual() = 'direccion_comercial'
  );

-- INSERT y DELETE se quedan igual: no cambia quién crea filas, y
-- "rechazar" ya no borra nada (pasa a estado 'rechazado').
