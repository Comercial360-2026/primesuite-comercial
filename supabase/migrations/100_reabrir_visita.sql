-- Reabrir una visita cerrada (estado_captura 'consolidada' -> 'en_curso').
--
-- El responsable de la visita (o Dirección Comercial) puede reabrirla
-- directamente. Cualquier otro participante (aceptado) tiene que PEDIRLO —
-- es la visita de otro, no la suya — y el responsable/Dirección lo acepta o
-- lo rechaza desde el mismo sitio donde ya gestiona invitaciones ("Yo").
--
-- Sin esta migración, cualquier fila en visita_participante (incluso
-- 'pendiente' o 'expulsado', porque fn_es_participante_de_visita no mira el
-- estado) podía reescribir estado_captura vía pol_visita_update sin pasar
-- por ningún permiso ni aviso — el trigger de abajo tapa ese hueco
-- específicamente para la transición de reapertura, sin tocar el resto de
-- usos de pol_visita_update (editar objetivo, etc.), que no se ha pedido
-- cambiar.

alter table public.visita
  add column if not exists cerrada_en timestamptz,
  add column if not exists reabierta_en timestamptz,
  add column if not exists reabierta_por uuid references public.comercial(id);

comment on column public.visita.cerrada_en is
  'Cuándo se cerró (consolidó) por última vez. NULL en visitas cerradas antes de esta migración (no había forma de saberlo).';
comment on column public.visita.reabierta_en is
  'Cuándo se reabrió por última vez (solo el último ciclo, no historial completo).';
comment on column public.visita.reabierta_por is
  'Quién quedó usando la visita al reabrirla: el propio responsable/Dirección si reabrió directo, o el participante cuya solicitud se aceptó.';

-- Guarda de seguridad: solo responsable de la visita o Dirección Comercial
-- pueden pasar consolidada -> en_curso directamente. El resto de
-- transiciones (agendada -> en_curso, en_curso -> consolidada) siguen igual
-- que hasta ahora, sin restricción nueva.
create or replace function public.fn_proteger_reabrir_visita()
  returns trigger
  language plpgsql
as $function$
begin
  if old.estado_captura = 'consolidada' and new.estado_captura = 'en_curso' then
    if not (fn_es_responsable_de_visita(old.id) or fn_rol_actual() = 'direccion_comercial') then
      raise exception 'Solo el responsable de la visita o Dirección Comercial pueden reabrirla directamente.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_proteger_reabrir_visita on public.visita;
create trigger trg_proteger_reabrir_visita
  before update on public.visita
  for each row execute function public.fn_proteger_reabrir_visita();

-- Solicitudes de reapertura: un participante (no responsable) pide, el
-- responsable o Dirección resuelve. Mismo patrón que solicitud_reasignacion
-- e invitaciones de visita_participante (estado + resuelto/a por y cuándo).
create table public.visita_solicitud_reapertura (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null references public.visita(id) on delete cascade,
  solicitado_por uuid not null references public.comercial(id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada')),
  creado_en timestamptz not null default now(),
  resuelta_por uuid references public.comercial(id),
  resuelta_en timestamptz,
  -- Mismo mecanismo que visita_participante.rechazo_visto: el solicitante ve
  -- el rechazo una vez y lo marca "Entendido"; una aceptación no necesita
  -- aviso aparte porque la visita ya vuelve a estar en curso por sí sola.
  rechazo_visto boolean not null default false
);

-- Como mucho una solicitud pendiente por visita — evita duplicados si el
-- mismo participante (o dos distintos) la piden dos veces seguidas.
create unique index ux_solicitud_reapertura_pendiente
  on public.visita_solicitud_reapertura (visita_id)
  where estado = 'pendiente';

alter table public.visita_solicitud_reapertura enable row level security;

create policy pol_solicitud_reapertura_select on public.visita_solicitud_reapertura
  for select using (
    solicitado_por = auth.uid()
    or fn_es_responsable_de_visita(visita_id)
    or fn_rol_actual() = 'direccion_comercial'
  );

create policy pol_solicitud_reapertura_insert on public.visita_solicitud_reapertura
  for insert with check (
    solicitado_por = auth.uid()
    and exists (
      select 1 from public.visita_participante vp
      where vp.visita_id = visita_solicitud_reapertura.visita_id
        and vp.comercial_id = auth.uid()
        and vp.estado = 'aceptado'
        and vp.rol <> 'responsable'
    )
    and exists (
      select 1 from public.visita v
      where v.id = visita_solicitud_reapertura.visita_id
        and v.estado_captura = 'consolidada'
    )
  );

-- Resolver (aceptar/rechazar de verdad, con efecto en la visita) siempre
-- pasa por fn_resolver_solicitud_reapertura de abajo — marcar la solicitud y
-- reabrir la visita son un solo paso atómico (la lección de PR#9: dos
-- escrituras separadas pueden quedar a medias). Esta política solo deja al
-- propio solicitante tocar su fila para marcar "visto" un rechazo ya hecho —
-- el WITH CHECK le impide poner 'aceptada' él mismo (auto-aprobarse).
create policy pol_solicitud_reapertura_update on public.visita_solicitud_reapertura
  for update
  using (
    solicitado_por = auth.uid()
    or fn_es_responsable_de_visita(visita_id)
    or fn_rol_actual() = 'direccion_comercial'
  )
  with check (
    fn_es_responsable_de_visita(visita_id)
    or fn_rol_actual() = 'direccion_comercial'
    or (solicitado_por = auth.uid() and estado = 'rechazada' and resuelta_en is not null)
  );

create or replace function public.fn_resolver_solicitud_reapertura(p_solicitud_id uuid, p_aprobar boolean)
  returns void
  language plpgsql
as $function$
declare
  v_visita_id uuid;
  v_solicitado_por uuid;
begin
  select visita_id, solicitado_por into v_visita_id, v_solicitado_por
  from public.visita_solicitud_reapertura
  where id = p_solicitud_id and estado = 'pendiente'
  for update;

  if not found then
    raise exception 'Solicitud no encontrada o ya resuelta.';
  end if;

  if not (fn_es_responsable_de_visita(v_visita_id) or fn_rol_actual() = 'direccion_comercial') then
    raise exception 'No autorizado.';
  end if;

  update public.visita_solicitud_reapertura
    set estado = case when p_aprobar then 'aceptada' else 'rechazada' end,
        resuelta_por = auth.uid(),
        resuelta_en = now()
    where id = p_solicitud_id;

  if p_aprobar then
    update public.visita
      set estado_captura = 'en_curso',
          reabierta_en = now(),
          reabierta_por = v_solicitado_por
      where id = v_visita_id;
  end if;
end;
$function$;
