-- (1) Nuevo estado 'expulsado': cuando el responsable/Dirección "quita" a
--     un participante, la fila NO se borra, pasa a 'expulsado' para que al
--     afectado le llegue un aviso en "Yo" ("te han quitado de la visita
--     de X"). "Salir" (te sacas tú) sigue siendo un DELETE limpio.
alter table visita_participante drop constraint visita_participante_estado_check;
alter table visita_participante add constraint visita_participante_estado_check
  check (estado in ('pendiente', 'aceptado', 'rechazado', 'expulsado'));

-- "Me han expulsado y no lo he visto" (aviso en Yo del afectado).
-- Reutiliza rechazo_visto como "aviso de esta fila ya visto".
create index idx_vp_expulsion_sin_ver
  on visita_participante (comercial_id)
  where estado = 'expulsado' and rechazo_visto = false;

-- (2) y (3) Anti-reinvitación: si alguien RECHAZÓ una invitación, solo
--     Dirección Comercial puede volver a invitarle. El responsable no
--     puede insistir (ni una vez, ni en bucle). Un 'expulsado' sí lo
--     puede readmitir el responsable (a ese lo sacó él).
create or replace function public.fn_vp_solo_direccion_reactiva_rechazo()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
begin
  if old.estado = 'rechazado'
     and new.estado in ('pendiente', 'aceptado')
     and fn_rol_actual() is distinct from 'direccion_comercial' then
    raise exception 'Este comercial ya rechazó la visita. Solo Dirección Comercial puede volver a invitarle.';
  end if;
  return new;
end;
$function$;

create trigger trg_vp_reactivar_rechazo
  before update on visita_participante
  for each row
  execute function fn_vp_solo_direccion_reactiva_rechazo();
