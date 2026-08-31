-- Objetivo de la visita: a qué va el comercial, en sus palabras. Texto
-- libre, opcional. Se fija al planificar (o al arrancar/durante, editable
-- desde Visita Activa). Distinto de tipo_visita (categoría) y del resumen
-- (lo que salió). El front lo escribe con un UPDATE posterior al alta, mismo
-- patrón que `franja` — la RPC crear_visita_con_responsable no cambia.

alter table public.visita add column objetivo text;
