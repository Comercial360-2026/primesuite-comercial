-- 158_pedir_briefing_arranque_inmediato.sql
-- El botón «Generar / Actualizar» del briefing esperaba a la siguiente pasada del cron
-- (hasta 60 s medidos: 10-57 s). Ahora avisa al worker al momento, como hace fn_preguntar_ia.
create or replace function fn_pedir_briefing(p_visita_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_term timestamptz;
begin
  if not (fn_es_participante_de_visita(p_visita_id) or fn_rol_actual() = 'direccion_comercial') then
    raise exception 'No tienes acceso a esta visita.';
  end if;
  select terminado_en into v_term from briefing_visita where visita_id = p_visita_id and estado = 'listo';
  if v_term > now() - interval '1 hour' then
    raise exception 'El briefing se generó hace menos de una hora.';
  end if;
  perform fn_encolar_briefing(p_visita_id, 'manual', interval '0');
  perform net.http_post(
    url := 'https://umrjzvpbcpzzqmkjahhn.supabase.co/functions/v1/procesar-briefings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clave-worker', (select decrypted_secret from vault.decrypted_secrets where name = 'briefing_worker_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
