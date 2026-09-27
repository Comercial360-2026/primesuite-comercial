-- 126: «Pregunta a la IA» — preguntas libres sobre un cliente al agente de
-- Copilot Studio «Consultas comerciales CB» (Direct Line, secreto
-- DIRECT_LINE_SECRET_CONSULTAS). Mismo patrón que el briefing (122): cola +
-- Edge Function `procesar-consultas`. La pregunta tarda 20 s-3 min.
--
-- Decisiones Cesar (26/27-09-2026):
--   · Solo pregunta el responsable del cliente, quien participa en alguna de
--     sus visitas, o Dirección.
--   · Cada consulta queda registrada con su autor; cada uno ve SOLO las suyas.
--   · Tope diario POR USUARIO (ajustes_app 'consulta_ia_tope_usuario').
--   · Sin cuenta del CRM vinculada no se pregunta ('sin_cuenta').

insert into ajustes_app (clave, valor, valor_numero) values ('consulta_ia_tope_usuario', true, 20)
on conflict (clave) do nothing;

create table consulta_ia (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references cliente(id) on delete cascade,
  visita_id       uuid references visita(id) on delete set null,
  comercial_id    uuid not null default auth.uid() references comercial(id),
  pregunta        text not null check (length(btrim(pregunta)) between 3 and 1000),
  estado          text not null check (estado in ('pendiente', 'generando', 'listo', 'error', 'sin_cuenta')),
  respuesta       text,
  error           text,
  pedido_en       timestamptz not null default now(),
  iniciado_en     timestamptz,
  terminado_en    timestamptz,
  conversacion_id text,
  watermark       text,
  intentos        integer not null default 0
);

create index consulta_ia_cliente_autor on consulta_ia (cliente_id, comercial_id, pedido_en desc);
create index consulta_ia_estado on consulta_ia (estado) where estado in ('pendiente', 'generando');

comment on table consulta_ia is
  'Preguntas a la IA (agente Consultas comerciales CB) sobre un cliente. Cada comercial ve solo las suyas.';

alter table consulta_ia enable row level security;
create policy pol_consulta_ia_select on consulta_ia
  for select using (comercial_id = auth.uid());
-- Sin políticas de escritura: se escribe con fn_preguntar_ia y el worker (service role).

-- ¿Puede el comercial actual preguntar por este cliente?
create function fn_puede_consultar_cliente(p_cliente_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select fn_comercial_actual_activo() and (
    fn_rol_actual() = 'direccion_comercial'
    or exists (select 1 from cliente where id = p_cliente_id and responsable_id = auth.uid())
    or exists (
      select 1 from visita v join visita_participante vp on vp.visita_id = v.id
       where v.cliente_id = p_cliente_id and vp.comercial_id = auth.uid()
    )
  );
$$;

-- Consultas del usuario hoy (día de Madrid) y su tope.
create function fn_tope_consulta_ia()
returns table (hechas_hoy bigint, tope integer, alcanzado boolean)
language sql stable security definer set search_path = public as $$
  select h.n, a.valor_numero, a.valor and a.valor_numero is not null and h.n >= a.valor_numero
    from (select count(*) n from consulta_ia
           where comercial_id = auth.uid()
             and estado <> 'sin_cuenta'
             and pedido_en >= date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid') h
    cross join (select valor, valor_numero from ajustes_app where clave = 'consulta_ia_tope_usuario') a
   where fn_comercial_actual_activo();
$$;

-- Botón «Preguntar». Encola y despierta al worker al momento.
create function fn_preguntar_ia(p_cliente_id uuid, p_pregunta text, p_visita_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_cuenta uuid;
  v_tope record;
begin
  if not fn_puede_consultar_cliente(p_cliente_id) then
    raise exception 'Solo el responsable del cliente, quien participa en sus visitas o Dirección pueden preguntar por él.';
  end if;
  if length(btrim(coalesce(p_pregunta, ''))) < 3 then
    raise exception 'Escribe la pregunta.';
  end if;
  select * into v_tope from fn_tope_consulta_ia();
  if v_tope.alcanzado then
    raise exception 'Has llegado a tu tope de % preguntas de hoy. Mañana podrás seguir.', v_tope.tope;
  end if;
  if exists (select 1 from consulta_ia where comercial_id = auth.uid() and estado in ('pendiente', 'generando')) then
    raise exception 'Ya tienes una pregunta en marcha. Espera a que termine.';
  end if;

  select crm_accountid into v_cuenta from cliente where id = p_cliente_id;
  insert into consulta_ia (cliente_id, visita_id, pregunta, estado)
  values (p_cliente_id, p_visita_id, btrim(p_pregunta), case when v_cuenta is null then 'sin_cuenta' else 'pendiente' end)
  returning id into v_id;

  if v_cuenta is not null then
    perform net.http_post(
      url := 'https://umrjzvpbcpzzqmkjahhn.supabase.co/functions/v1/procesar-consultas',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-clave-worker', (select decrypted_secret from vault.decrypted_secrets where name = 'briefing_worker_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  end if;
  return v_id;
end;
$$;

grant execute on function fn_preguntar_ia(uuid, text, uuid) to authenticated;
grant execute on function fn_puede_consultar_cliente(uuid) to authenticated;
grant execute on function fn_tope_consulta_ia() to authenticated;

-- Worker cada minuto mientras haya algo en marcha (el disparo inmediato de
-- fn_preguntar_ia arranca la conversación; esto recoge la respuesta).
select cron.schedule('procesar-consultas', '* * * * *', $$
  select net.http_post(
    url := 'https://umrjzvpbcpzzqmkjahhn.supabase.co/functions/v1/procesar-consultas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clave-worker', (select decrypted_secret from vault.decrypted_secrets where name = 'briefing_worker_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from consulta_ia where estado in ('pendiente', 'generando'));
$$);
