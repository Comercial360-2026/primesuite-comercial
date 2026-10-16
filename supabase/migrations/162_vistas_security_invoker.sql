-- Las vistas respetan la RLS de quien consulta. Probado por rol (comercial y dirección) en transacción con rollback:
-- mismos recuentos salvo vw_comercial_resuelto y vw_pipeline_oportunidades, que la app no usa.
-- (vw_ecosistema_actual_cliente es materializada: no admite security_invoker.)
alter view public.vw_cliente_resuelto set (security_invoker = true);
alter view public.vw_termino_resuelto set (security_invoker = true);
alter view public.vw_comercial_resuelto set (security_invoker = true);
alter view public.vw_pipeline_oportunidades set (security_invoker = true);
alter view public.vw_termino_demanda set (security_invoker = true);
alter view public.vw_vocabulario_pendiente_revision set (security_invoker = true);
alter view public.vw_calendario set (security_invoker = true);
alter view public.vw_semaforo_cliente set (security_invoker = true);
alter view public.vw_uso_termino set (security_invoker = true);
