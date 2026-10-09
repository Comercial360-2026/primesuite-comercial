-- 157_briefing_tarea_unica.sql
-- Dos pasadas simultáneas del worker creaban DOS veces las tareas de redacción de un briefing.
-- Una tarea por (briefing, fuente); el worker inserta con ON CONFLICT DO NOTHING.
delete from briefing_tarea a using briefing_tarea b
  where a.visita_id = b.visita_id and a.fuente = b.fuente and a.ctid > b.ctid;
create unique index briefing_tarea_visita_fuente_uq on briefing_tarea (visita_id, fuente);
