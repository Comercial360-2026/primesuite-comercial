-- 159_vistas_sin_acceso_anonimo.sql  (16 oct 2026)
-- Hallazgo (asesor de seguridad de Supabase, nivel ERROR + comprobado con SQL): las 8 vistas vw_* son
-- SECURITY DEFINER, así que se saltan la RLS de quien las consulta, y el rol `anon` (la clave pública que va en el
-- código de la web) tenía SELECT y escritura sobre ellas: sin iniciar sesión se leían clientes, calendario,
-- oportunidades y comerciales, mientras que `cliente` directa devolvía 0 filas.
-- Paso 1 (esta migración): quitar TODO permiso a `anon` y las escrituras a `authenticated` (la app solo hace SELECT
-- sobre estas vistas; comprobado con grep). Paso 2 (pendiente, con prueba): security_invoker = true en cada vista.
revoke all on public.vw_cliente_resuelto, public.vw_termino_resuelto, public.vw_comercial_resuelto,
  public.vw_pipeline_oportunidades, public.vw_termino_demanda, public.vw_vocabulario_pendiente_revision,
  public.vw_calendario, public.vw_semaforo_cliente from anon;
revoke insert, update, delete, truncate, references, trigger on public.vw_cliente_resuelto, public.vw_termino_resuelto,
  public.vw_comercial_resuelto, public.vw_pipeline_oportunidades, public.vw_termino_demanda,
  public.vw_vocabulario_pendiente_revision, public.vw_calendario, public.vw_semaforo_cliente from authenticated;
