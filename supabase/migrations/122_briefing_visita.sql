-- 122: briefing de cliente por visita, generado en segundo plano por el agente
-- de Copilot Studio (Direct Line) — sustituye al briefing de Jira/Confluence.
--
-- El agente tarda 6-8 min: no cabe en una petición. Por eso hay una cola:
--   · se pide (al planificar una visita de los próximos 7 días, la noche
--     anterior, o a mano desde la visita) → fila 'pendiente';
--   · la Edge Function `procesar-briefings`, llamada cada minuto por pg_cron,
--     abre la conversación ('generando') y recoge la respuesta ('listo').
-- Pide la cuenta exacta del CRM (cliente.crm_accountid, migración 121); sin
-- ella no se genera ('sin_cuenta').
--
-- El texto sale del CRM: se guarda SOLO ligado a su visita, lo ven solo sus
-- participantes y Dirección, y se borra al cerrar la visita (decisión Cesar,
-- 25-09-2026). `briefing_uso` guarda solo cuándo y por qué se generó cada uno
-- (sin contenido), para el contador de consumo de Dirección.
--
-- Controles de consumo (ajustes_app): 'briefing_pausado' corta todo lo
-- automático (el manual sigue); 'briefing_tope_diario' (valor_numero) limita
-- los envíos al agente por día; lo que pase del tope espera al día siguiente.

create extension if not exists pg_net with schema extensions;

-- ajustes_app solo tenía booleanos; el tope es un número.
alter table ajustes_app add column valor_numero integer;
insert into ajustes_app (clave, valor) values ('briefing_pausado', false);
insert into ajustes_app (clave, valor, valor_numero) values ('briefing_tope_diario', true, 50);

create table briefing_visita (
  visita_id       uuid primary key references visita(id) on delete cascade,
  estado          text not null check (estado in ('pendiente', 'generando', 'listo', 'error', 'sin_cuenta')),
  motivo          text not null check (motivo in ('planificar', 'nocturno', 'manual')),
  pedido_en       timestamptz not null default now(),
  iniciado_en     timestamptz,
  -- Del último briefing terminado. Al pedir uno nuevo se conservan: la visita
  -- sigue enseñando el anterior mientras se genera el siguiente.
  terminado_en    timestamptz,
  contenido       text,
  error           text,
  conversacion_id text,
  watermark       text,
  intentos        integer not null default 0
);

comment on table briefing_visita is
  'Briefing del cliente para una visita (agente Copilot Studio). Se borra al cerrar la visita.';

alter table briefing_visita enable row level security;

create policy pol_briefing_visita_select on briefing_visita
  for select using (fn_es_participante_de_visita(visita_id) or fn_rol_actual() = 'direccion_comercial');
-- Sin políticas de escritura: se escribe con fn_pedir_briefing y el worker (service role).

create table briefing_uso (
  id        bigint generated always as identity primary key,
  visita_id uuid,
  motivo    text not null,
  enviado_en timestamptz not null default now()
);

alter table briefing_uso enable row level security;
create policy pol_briefing_uso_select on briefing_uso
  for select using (fn_rol_actual() = 'direccion_comercial');

-- Encola (o re-encola) el briefing de una visita. Uso interno: triggers,
-- nocturno y fn_pedir_briefing. No hace nada si ya está en cola / en marcha,
-- ni si hay uno terminado hace menos de `p_frescura` (no repetir sin motivo).
create function fn_encolar_briefing(p_visita_id uuid, p_motivo text, p_frescura interval)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cuenta uuid;
  v_actual briefing_visita%rowtype;
begin
  select c.crm_accountid into v_cuenta
    from visita v join cliente c on c.id = v.cliente_id
   where v.id = p_visita_id;

  select * into v_actual from briefing_visita where visita_id = p_visita_id;
  if found and v_actual.estado in ('pendiente', 'generando') then
    return;
  end if;
  if found and v_actual.estado = 'listo' and v_actual.terminado_en > now() - p_frescura then
    return;
  end if;

  insert into briefing_visita (visita_id, estado, motivo, pedido_en)
  values (p_visita_id, case when v_cuenta is null then 'sin_cuenta' else 'pendiente' end, p_motivo, now())
  on conflict (visita_id) do update
    set estado = excluded.estado, motivo = excluded.motivo, pedido_en = now(),
        error = null, intentos = 0, conversacion_id = null, watermark = null, iniciado_en = null;
end;
$$;
revoke all on function fn_encolar_briefing(uuid, text, interval) from public, anon, authenticated;

-- Botón "Generar / Actualizar" de la visita. Participantes y Dirección.
-- Bloqueado 1 h tras el último generado.
create function fn_pedir_briefing(p_visita_id uuid)
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
end;
$$;

-- Al planificar (o cambiar la fecha de) una visita de los próximos 7 días.
create function fn_trg_briefing_visita()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado_captura in ('consolidada', 'cerrada') then
    delete from briefing_visita where visita_id = new.id;
    return new;
  end if;
  if new.estado_captura = 'agendada'
     and new.fecha between now() and now() + interval '7 days'
     and (tg_op = 'INSERT' or old.fecha is distinct from new.fecha or old.estado_captura is distinct from new.estado_captura)
     and not coalesce((select valor from ajustes_app where clave = 'briefing_pausado'), false) then
    perform fn_encolar_briefing(new.id, 'planificar', interval '12 hours');
  end if;
  return new;
end;
$$;

create trigger trg_briefing_visita
  after insert or update of fecha, estado_captura on visita
  for each row execute function fn_trg_briefing_visita();

-- Nocturno (20:00 UTC = 22:00 Madrid en verano, 21:00 en invierno): las
-- visitas planificadas para mañana, salvo las que
-- ya tienen uno de menos de 12 h.
create function fn_briefings_nocturnos()
returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if coalesce((select valor from ajustes_app where clave = 'briefing_pausado'), false) then
    return;
  end if;
  for r in
    select id from visita
     where estado_captura = 'agendada'
       and (fecha at time zone 'Europe/Madrid')::date = (now() at time zone 'Europe/Madrid')::date + 1
  loop
    perform fn_encolar_briefing(r.id, 'nocturno', interval '12 hours');
  end loop;
end;
$$;
revoke all on function fn_briefings_nocturnos() from public, anon, authenticated;

-- Contador de Dirección: envíos al agente hoy / este mes, por motivo.
create function fn_uso_briefings()
returns table (motivo text, hoy bigint, mes bigint)
language sql security definer set search_path = public as $$
  select m.motivo,
         count(u.id) filter (where u.enviado_en >= date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'),
         count(u.id) filter (where u.enviado_en >= date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid')
    from (values ('planificar'), ('nocturno'), ('manual')) m(motivo)
    left join briefing_uso u on u.motivo = m.motivo
   where fn_rol_actual() = 'direccion_comercial'
   group by m.motivo;
$$;

-- Para el tope diario del worker (día de Madrid).
create function fn_briefings_enviados_hoy()
returns bigint
language sql security definer set search_path = public as $$
  select count(*) from briefing_uso
   where enviado_en >= date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
$$;
revoke all on function fn_briefings_enviados_hoy() from public, anon, authenticated;
grant execute on function fn_briefings_enviados_hoy() to service_role;

select cron.schedule('briefings-nocturnos', '0 20 * * *', 'select fn_briefings_nocturnos()');

-- Worker: clave aleatoria creada aquí mismo en Vault; nadie la ve. El job la
-- manda en la cabecera y la Edge Function la valida con fn_clave_worker_valida.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'briefing_worker_key');

create function fn_clave_worker_valida(p_clave text)
returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'briefing_worker_key' and decrypted_secret = p_clave);
$$;
revoke all on function fn_clave_worker_valida(text) from public, anon, authenticated;
grant execute on function fn_clave_worker_valida(text) to service_role;
grant execute on function fn_encolar_briefing(uuid, text, interval) to service_role;

select cron.schedule('procesar-briefings', '* * * * *', $$
  select net.http_post(
    url := 'https://umrjzvpbcpzzqmkjahhn.supabase.co/functions/v1/procesar-briefings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clave-worker', (select decrypted_secret from vault.decrypted_secrets where name = 'briefing_worker_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from briefing_visita where estado in ('pendiente', 'generando'));
$$);
