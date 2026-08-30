-- 70 — visita.hora_definida (hora opcional en las visitas planificadas)
-- Pendiente de aplicar a producción.
--
-- Al planificar, el comercial puede meter una hora o dejarla sin poner.
-- `visita.fecha` (timestamptz) siempre lleva una hora por debajo — para que
-- la lista del día tenga un orden — pero `hora_definida` dice si esa hora es
-- de verdad o solo un relleno. La agenda agrupa: hora < 14:00 → mañana,
-- >= 14:00 → tarde, sin hora → "sin hora".
--
-- Default TRUE: las visitas ya existentes (en_curso / consolidada) tienen
-- una hora real de cuando se hicieron; se conserva. Solo las agendadas que
-- se creen sin hora pondrán hora_definida = false.

alter table public.visita
  add column hora_definida boolean not null default true;
