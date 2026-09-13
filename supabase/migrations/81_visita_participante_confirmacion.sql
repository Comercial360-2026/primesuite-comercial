-- Confirmación de participación en una visita.
--
-- Hasta ahora, añadir a un comercial como participante de una visita era un
-- INSERT en visita_participante y ya está — ni se enteraba. Ahora:
--   · si te añade OTRO, la fila nace 'pendiente' y a ti te aparece un aviso
--     en "Yo" para aceptar o rechazar;
--   · si te añades tú mismo (o eres el responsable, que se crea al crear la
--     visita), nace 'aceptado' — no hay nada que confirmar;
--   · si rechazas, quedas fuera de la visita y a quien te añadió le llega
--     un aviso ("X ha rechazado la visita de …").
--
-- Sin correos ni push: todo son avisos dentro de la app.

alter table visita_participante
  add column estado text not null default 'aceptado'
    check (estado in ('pendiente', 'aceptado', 'rechazado')),
  add column anadido_por uuid references comercial(id),
  -- Quien añadió ya ha visto que le rechazaron (para que el aviso
  -- desaparezca de su "Yo"). Sin efecto mientras estado <> 'rechazado'.
  add column rechazo_visto boolean not null default false;

-- Las filas que ya existían quedan 'aceptado' (el default) y sin
-- `anadido_por` — no sabemos retroactivamente quién las creó, y no deben
-- generar avisos.

-- "Mis invitaciones pendientes" (aviso en Yo del invitado).
create index idx_vp_pendiente_comercial
  on visita_participante (comercial_id)
  where estado = 'pendiente';

-- "Me han rechazado y no lo he visto" (aviso en Yo de quien añadió).
create index idx_vp_rechazo_sin_ver
  on visita_participante (anadido_por)
  where estado = 'rechazado' and rechazo_visto = false;
