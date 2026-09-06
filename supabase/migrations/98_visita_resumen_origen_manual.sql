-- El resumen de una visita cerrada (`visita.resumen_texto`) se genera
-- automáticamente al cerrar ("por reglas": objetivo + hallazgos de riesgo +
-- oportunidades + próximos pasos), y el comercial puede reescribirlo a mano
-- desde el detalle de la visita. Para distinguir ese caso hace falta un
-- tercer origen: 'manual'. El check solo contemplaba 'reglas' | 'ia'.

alter table public.visita drop constraint if exists visita_resumen_origen_check;

alter table public.visita
  add constraint visita_resumen_origen_check
  check (resumen_origen is null or resumen_origen = any (array['reglas'::text, 'ia'::text, 'manual'::text]));
