-- 155_briefing_tarea.sql
-- Briefing rápido (docs/briefing-rapido-plan.md): el worker procesar-briefings
-- lanza varias conversaciones de Direct Line EN PARALELO (una por fuente) y
-- después una de redacción. Cada conversación es una fila de esta tabla.
-- Solo la toca el worker (service role): RLS activada y sin políticas.

create table briefing_tarea (
  id              uuid primary key default gen_random_uuid(),
  visita_id       uuid not null references briefing_visita(visita_id) on delete cascade,
  fase            text not null check (fase in ('lectura', 'redaccion')),
  fuente          text not null,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'generando', 'listo', 'vencida', 'error')),
  mensaje         text,
  resultado       text,
  error           text,
  conversacion_id text,
  watermark       text,
  plazo_segundos  integer not null default 120,
  iniciado_en     timestamptz,
  terminado_en    timestamptz,
  creado_en       timestamptz not null default now()
);

create index briefing_tarea_visita_idx on briefing_tarea (visita_id);
create index briefing_tarea_vivas_idx on briefing_tarea (estado) where estado in ('pendiente', 'generando');

alter table briefing_tarea enable row level security;

comment on table briefing_tarea is
  'Conversaciones de Direct Line de un briefing (lecturas por fuente y redacción). Solo el worker procesar-briefings. fuente: crm_oportunidades, crm_ofertas, licitaciones, jira, redaccion. vencida = no llegó en plazo_segundos (el briefing sale sin esa fuente).';
