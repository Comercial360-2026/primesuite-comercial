-- 135: cierre automático de visitas ABANDONADAS (por inactividad).
--
-- Contexto: la migración 102 (7 sept) quitó el cierre automático a las 48 h («una visita la
-- cierra el comercial, punto»): cerraba sin avisar y no existía reabrir. Desde la 100
-- (reabrir, 21 sept) un cierre equivocado se deshace en un toque, así que se recupera, pero
-- distinto: solo visitas con algo capturado y SIN ACTIVIDAD durante N horas (por defecto 18,
-- `ajustes_app.visita_autocierre_horas`; `valor` = activo), `cerrada_en` = la hora de su
-- última actividad (no la del cron), marcada `cierre_automatico`. Las visitas vacías no se
-- cierran (se descartan desde el panel de visitas abiertas). Al reabrir, la marca se limpia y
-- la actividad se pone a «ahora» para que no vuelva a cerrarse de inmediato.
-- El resumen automático no se genera aquí (su lógica vive en el cliente): la visita cerrada lo
-- genera al abrirse (regenerarResumenSiAuto).

alter table visita
  add column cierre_automatico boolean not null default false,
  add column ultima_actividad_en timestamptz;

insert into ajustes_app (clave, valor, valor_numero) values ('visita_autocierre_horas', true, 18) on conflict (clave) do nothing;

-- Última señal de vida de una visita: lo más reciente entre sus propios campos y lo capturado
-- (la hora de las capturas es la de sincronización con el servidor).
create function fn_ultima_actividad_visita(p_visita_id uuid)
returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(
    v.ultima_actividad_en, v.en_curso_desde, v.actualizado_en,
    (select max(creado_en) from captura_libre where visita_id = v.id),
    (select max(creado_en) from hallazgo where visita_id = v.id),
    (select max(actualizado_en) from oportunidad where visita_origen_id = v.id),
    (select max(actualizado_en) from proximo_paso where visita_id = v.id)
  )
  from visita v
  where v.id = p_visita_id
    and (fn_es_participante_de_visita(v.id) or fn_rol_actual() = 'direccion_comercial');
$$;

create function fn_cerrar_visitas_inactivas()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  horas integer;
  n integer;
begin
  select valor_numero into horas from ajustes_app where clave = 'visita_autocierre_horas' and valor;
  if horas is null then return 0; end if;

  with candidatas as (
    select v.id,
           greatest(
             v.ultima_actividad_en, v.en_curso_desde, v.actualizado_en,
             (select max(creado_en) from captura_libre where visita_id = v.id),
             (select max(creado_en) from hallazgo where visita_id = v.id),
             (select max(actualizado_en) from oportunidad where visita_origen_id = v.id),
             (select max(actualizado_en) from proximo_paso where visita_id = v.id)
           ) as ultima
      from visita v
     where v.estado_captura = 'en_curso'
       and (exists (select 1 from captura_libre where visita_id = v.id)
         or exists (select 1 from hallazgo where visita_id = v.id)
         or exists (select 1 from oportunidad where visita_origen_id = v.id)
         or exists (select 1 from proximo_paso where visita_id = v.id))
  )
  update visita v
     set estado_captura = 'consolidada',
         cerrada_en = c.ultima,
         cierre_automatico = true,
         resumen_origen = 'reglas'
    from candidatas c
   where v.id = c.id and c.ultima < now() - make_interval(hours => horas);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function fn_cerrar_visitas_inactivas() from public, anon, authenticated;
grant execute on function fn_cerrar_visitas_inactivas() to service_role;

create function fn_reabrir_visita_reinicia_cierre_auto()
returns trigger
language plpgsql as $$
begin
  if old.estado_captura = 'consolidada' and new.estado_captura = 'en_curso' then
    new.cierre_automatico := false;
    new.ultima_actividad_en := now();
  end if;
  return new;
end;
$$;
create trigger trg_visita_reabrir_reinicia_cierre_auto
  before update on visita
  for each row execute function fn_reabrir_visita_reinicia_cierre_auto();

select cron.schedule('cerrar-visitas-inactivas', '7 * * * *', $$select fn_cerrar_visitas_inactivas();$$);
