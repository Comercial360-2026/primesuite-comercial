-- Modo Recorrido: la "zona" pasa de ser una entidad de catálogo
-- (tabla `ubicacion`, reutilizable entre visitas del cliente) a una simple
-- ETIQUETA DE TEXTO LIBRE que el comercial escribe sobre la marcha —
-- distinta en cada visita, de usar y tirar, sin nada que "aceptar" ni
-- catálogo que crezca.
--
-- Cada captura de la visita guarda esa etiqueta denormalizada en
-- `zona_texto`. El repaso y el informe agrupan por ese texto; las visitas
-- YA CERRADAS conservan su `ubicacion_id` y se siguen leyendo por ahí
-- (por eso `ubicacion` y las FK no se tocan).
--
-- `proximo_paso` gana la columna por primera vez: en Recorrido ahora se
-- puede anotar un próximo paso ligado a la puerta/barrera que estás
-- mirando.

alter table public.captura_libre add column zona_texto text;
alter table public.hallazgo      add column zona_texto text;
alter table public.oportunidad   add column zona_texto text;
alter table public.proximo_paso  add column zona_texto text;
