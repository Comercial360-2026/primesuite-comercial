-- Franja de una visita planificada sin hora concreta.
--
-- Hasta ahora, planificar sin hora (hora_definida = false) mandaba la visita
-- al cubo "Sin hora" y punto. El comercial pedía poder decir "es por la
-- mañana" o "por la tarde" aunque no fije una hora exacta.
--
--   hora_definida = true   -> la franja sale de la hora (corte 14:00). franja = null.
--   hora_definida = false, franja = 'manana' | 'tarde' -> esa franja, sin hora.
--   hora_definida = false, franja = null -> "Sin hora".
--
-- No hace falta tocar crear_visita_con_responsable: al planificar, el front
-- ya hace un UPDATE posterior sobre la visita recién creada (el mismo que
-- ponía hora_definida = false); ahora ese UPDATE fija también `franja`.

alter table public.visita
  add column if not exists franja text
  check (franja in ('manana', 'tarde'));

comment on column public.visita.franja is
  'Solo para visitas agendadas sin hora fija: ''manana'' | ''tarde'' | null. Si hora_definida = true se ignora (la franja sale de la hora).';
