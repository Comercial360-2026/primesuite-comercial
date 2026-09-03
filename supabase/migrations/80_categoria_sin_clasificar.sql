-- "Sin clasificar": bandeja fija donde caen los términos que los comerciales
-- proponen sobre la marcha desde SelectorTermino (Hallazgo rápido / Detalle
-- de oportunidad). Antes caían en "la primera categoría alfabética", que era
-- una categoría real y quedaba ensuciada. Ahora van todos aquí y Dirección
-- los reubica al aprobarlos en Pendientes ("Aprobar en…").
--
-- Se crea sólo si no existe (la migración es reejecutable). El nombre es la
-- clave: el cliente la localiza por él (src/lib/vocabulario.ts).

insert into categoria_vocabulario (nombre, orden)
select 'Sin clasificar', coalesce((select max(orden) from categoria_vocabulario), 0) + 1
where not exists (
  select 1 from categoria_vocabulario where nombre = 'Sin clasificar'
);
