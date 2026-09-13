-- Vista agregada de uso de términos del vocabulario — sustituye el patrón
-- de traer TODAS las filas de hallazgo_area/oportunidad_area de la empresa
-- entera para contar por término en JS (cola-vocabulario.tsx, pestaña
-- Catálogo). El agregado corre en Postgres: el resultado crece con el nº de
-- términos usados, no con el nº de hallazgos/oportunidades de toda la
-- empresa acumulados desde siempre.
create or replace view public.vw_uso_termino as
select termino_id, count(*)::int as usos
from (
  select termino_id from public.hallazgo_area where termino_id is not null
  union all
  select termino_id from public.oportunidad_area where termino_id is not null
) t
group by termino_id;

comment on view public.vw_uso_termino is
  'Nº de hallazgos + oportunidades que usan cada término (agregado en servidor) — ver cola-vocabulario.tsx.';
