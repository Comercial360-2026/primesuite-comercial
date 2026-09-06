-- Hallazgos archivables (recorrido de revisión, Ficha de proyecto [C]).
--
-- Los hallazgos de un proyecto solo crecían: no había forma de decir "este
-- ya no es vigente" sin borrarlo, y borrarlo lo quita también de su visita y
-- del informe PDF de esa visita (se pierde el histórico).
--
-- `archivado_en` NULL = hallazgo activo. Con fecha = un comercial lo dio por
-- no vigente: desaparece de la sección "Hallazgos" de la ficha de proyecto /
-- cliente, pero sigue intacto en su visita y en el informe de esa visita. Es
-- reversible (desarchivar = volver a NULL). No hace falta política nueva: la
-- RLS de UPDATE de hallazgo (autor o Dirección) ya acota quién puede hacerlo,
-- igual que "Guardar" y "Borrar".

alter table hallazgo add column archivado_en timestamptz;

comment on column hallazgo.archivado_en is
  'Cuándo un comercial archivó el hallazgo (lo dio por no vigente). NULL = activo. '
  'No lo borra: sigue en su visita y en el informe PDF de esa visita; solo lo saca '
  'de la sección "Hallazgos" de la ficha de proyecto/cliente. Reversible (desarchivar = NULL).';
