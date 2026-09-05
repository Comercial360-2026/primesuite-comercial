-- Decisión de Cesar (2026-09-05): el responsable de una visita también
-- puede reinvitar a quien rechazó, igual que Dirección — no solo Dirección.
-- Se quita el trigger que lo impedía (no un límite más fino, al revés: se
-- elimina la restricción existente).
drop trigger if exists trg_vp_reactivar_rechazo on public.visita_participante;
drop function if exists public.fn_vp_solo_direccion_reactiva_rechazo();
