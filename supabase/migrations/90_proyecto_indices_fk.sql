-- Índices en las FK proyecto_id nuevas: son la columna de join que va a
-- machacar Fase 3 (ficha de proyecto listando sus visitas/hallazgos/
-- oportunidades/pasos). El resto de FKs sin índice del esquema (creado_por,
-- etc.) ya eran así antes de esta migración y quedan fuera de alcance.
create index ix_visita_proyecto_id on public.visita (proyecto_id);
create index ix_hallazgo_proyecto_id on public.hallazgo (proyecto_id);
create index ix_oportunidad_proyecto_id on public.oportunidad (proyecto_id);
create index ix_proximo_paso_proyecto_id on public.proximo_paso (proyecto_id);
