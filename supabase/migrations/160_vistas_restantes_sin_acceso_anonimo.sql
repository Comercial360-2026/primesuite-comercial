-- 160_vistas_restantes_sin_acceso_anonimo.sql  (16 oct 2026)
-- Misma clase que la 159, encontrada al barrer el resto: la vista materializada vw_ecosistema_actual_cliente (las
-- vistas materializadas NO tienen RLS) era legible por `anon` (comprobado: devolvía filas sin sesión), y
-- vw_actividad_comercial / vw_uso_termino tenían permisos de escritura para anon y authenticated.
-- La app las lee siempre con sesión (authenticated): se conserva SELECT para authenticated y se quita lo demás.
revoke all on public.vw_ecosistema_actual_cliente, public.vw_actividad_comercial, public.vw_uso_termino from anon;
revoke insert, update, delete, truncate, references, trigger on public.vw_ecosistema_actual_cliente,
  public.vw_actividad_comercial, public.vw_uso_termino from authenticated;
