-- 68 — eliminar_visita_completa: SECURITY DEFINER
-- Aplicada a producción el 2026-08-30 (primera migración versionada del repo;
-- las 1..67 se aplicaron en su día directamente en Supabase, sin versionar).
--
-- Bug: un comercial normal, responsable de su propia visita, nunca podía
-- borrarla desde la app — siempre "La visita no se ha podido borrar (count 0)".
-- Causa: la función borraba la fila `visita_participante` ANTES de
-- `delete from visita`, y la política RLS `pol_visita_delete` autoriza el
-- borrado de la visita comprobando que exista un `visita_participante`
-- (esa visita, auth.uid(), rol='responsable'). Al borrar esa fila a mitad de
-- cascada, la función se auto-revocaba el permiso y el `delete from visita`
-- afectaba a 0 filas. Dirección Comercial no lo notaba: pasa `pol_visita_delete`
-- por la rama del rol, sin necesitar la fila de participante.
--
-- Solución: SECURITY DEFINER — el permiso ya se comprueba una vez arriba
-- (`v_autorizado`), así que la cascada interna no tiene por qué volver a
-- pelearse con RLS. Mismo patrón que el borrado de cliente. Cuerpo sin cambios.

create or replace function public.eliminar_visita_completa(p_visita_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = 'public', 'pg_temp'
as $function$
declare
  v_autorizado boolean;
begin
  select exists (
    select 1 from visita_participante
     where visita_id = p_visita_id
       and comercial_id = auth.uid()
       and rol = 'responsable'
  ) or fn_rol_actual() = 'direccion_comercial'
  into v_autorizado;

  if not v_autorizado then
    raise exception 'No tienes permiso para borrar esta visita.';
  end if;

  delete from oportunidad_visita_seguimiento
   where visita_id = p_visita_id
      or oportunidad_id in (select id from oportunidad where visita_origen_id = p_visita_id);

  delete from oportunidad_termino
   where oportunidad_id in (select id from oportunidad where visita_origen_id = p_visita_id);

  delete from proximo_paso where visita_id = p_visita_id;

  delete from oportunidad where visita_origen_id = p_visita_id;

  delete from hallazgo where visita_id = p_visita_id;

  delete from captura_libre where visita_id = p_visita_id;

  update termino set visita_origen_id = null where visita_origen_id = p_visita_id;

  delete from visita_interlocutor where visita_id = p_visita_id;
  delete from visita_participante where visita_id = p_visita_id;

  delete from visita where id = p_visita_id;

  if not found then
    raise exception 'La visita no se ha podido borrar (count 0) — revisa permisos o si ya no existía.';
  end if;
end;
$function$;
