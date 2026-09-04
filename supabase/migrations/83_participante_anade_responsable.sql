-- Opción C: además de Dirección Comercial, el RESPONSABLE de la visita
-- puede añadir participantes (antes solo Dirección).

-- 1) "¿es X el responsable de esta visita?" — gemela de
--    fn_es_participante_de_visita, para RLS y para la app.
create or replace function public.fn_es_responsable_de_visita(
  p_visita_id uuid,
  p_comercial_id uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from visita_participante
    where visita_id = p_visita_id
      and comercial_id = p_comercial_id
      and rol = 'responsable'
  );
$function$;

-- 2) Lista mínima de comerciales para el selector de "añadir
--    participante". Un comercial normal NO puede leer la tabla
--    `comercial` (RLS), así que el responsable necesita esta función
--    SECURITY DEFINER. Solo id + nombre de los activos: nada sensible.
create or replace function public.fn_comerciales_seleccionables()
  returns table (id uuid, nombre text)
  language sql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
  select id, nombre from comercial where activo = true order by nombre;
$function$;

grant execute on function public.fn_comerciales_seleccionables() to authenticated;
grant execute on function public.fn_es_responsable_de_visita(uuid, uuid) to authenticated;

-- 3) INSERT: de "cualquier participante de la visita" a "el
--    responsable" (+ uno mismo — así se crea el propio responsable al
--    abrir la visita — + Dirección).
drop policy if exists pol_participante_insert on visita_participante;
create policy pol_participante_insert on visita_participante
  for insert
  with check (
    comercial_id = auth.uid()
    or fn_es_responsable_de_visita(visita_id)
    or fn_rol_actual() = 'direccion_comercial'
  );

-- 4) UPDATE: se añade el responsable a los que ya tenía la mig. 82
--    (tu propia fila / una que tú añadiste / Dirección), para que
--    pueda regestionar invitaciones de su visita.
drop policy if exists pol_participante_update on visita_participante;
create policy pol_participante_update on visita_participante
  for update
  using (
    comercial_id = auth.uid()
    or anadido_por = auth.uid()
    or fn_es_responsable_de_visita(visita_id)
    or fn_rol_actual() = 'direccion_comercial'
  )
  with check (
    comercial_id = auth.uid()
    or anadido_por = auth.uid()
    or fn_es_responsable_de_visita(visita_id)
    or fn_rol_actual() = 'direccion_comercial'
  );

-- DELETE se queda como en la 82 (fn_es_participante_de_visita OR
-- Dirección): no hay UI que expulse participantes, se aborda cuando la
-- haya.
