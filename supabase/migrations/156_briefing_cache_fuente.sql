-- 156_briefing_cache_fuente.sql
-- Caché por cuenta del CRM de las lecturas lentas y poco cambiantes del briefing rápido
-- (hoy: carpetas de Licitaciones y pedidos, ~70 s). Solo la usa el worker procesar-briefings
-- (service role): RLS activada y sin políticas. Caducidad: la decide el worker (rapido.ts).
create table briefing_cache_fuente (
  cuenta_id      uuid not null,
  fuente         text not null,
  resultado      text not null,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta_id, fuente)
);
alter table briefing_cache_fuente enable row level security;
comment on table briefing_cache_fuente is
  'Caché de lecturas del briefing rápido por cuenta CRM y fuente (licitaciones). Solo el worker procesar-briefings.';
