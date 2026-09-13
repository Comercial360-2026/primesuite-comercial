-- `vw_uso_termino` (migración 117) salía con SECURITY DEFINER por defecto,
-- el mismo patrón ya señalado por el linter de seguridad de Supabase en las
-- vistas existentes del proyecto (vw_semaforo_cliente, etc.). No hace falta
-- arrastrar ese aviso a una vista nueva: las políticas de
-- `hallazgo_area`/`oportunidad_area` ya permiten la lectura a cualquier
-- autenticado (select si el hallazgo/oportunidad padre existe), así que
-- pasar a SECURITY INVOKER no cambia el resultado, solo respeta la RLS del
-- usuario que consulta en vez de la del dueño de la vista.
alter view public.vw_uso_termino set (security_invoker = on);
