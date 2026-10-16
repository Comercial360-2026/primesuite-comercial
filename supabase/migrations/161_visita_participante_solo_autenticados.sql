-- 161_visita_participante_solo_autenticados.sql  (16 oct 2026)
-- Barrido como `anon` (la clave pública de la web): visita_participante devolvía 9 filas sin sesión porque su política
-- de SELECT tiene la cláusula «la visita está consolidada» (visible para cualquiera) y estaba creada para el rol
-- `public` (= también anon). Las 4 políticas pasan a `authenticated`: la app siempre va con sesión y las funciones del
-- servidor usan la clave de servicio, que se salta la RLS.
alter policy pol_participante_select on public.visita_participante to authenticated;
alter policy pol_participante_insert on public.visita_participante to authenticated;
alter policy pol_participante_update on public.visita_participante to authenticated;
alter policy pol_participante_delete on public.visita_participante to authenticated;
