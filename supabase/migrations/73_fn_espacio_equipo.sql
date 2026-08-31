-- Total de Storage usado por el equipo + presupuesto, para el "reparto
-- blando" (src/lib/espacio.ts). A diferencia de fn_espacio_storage_usado,
-- ésta NO tiene corte por rol: un comercial normal también necesita ver el
-- total del pozo para saber si puede seguir subiendo.
--
-- Presupuesto = 1 GB del plan gratis − 200 MB reservados para BD y otros
-- (mismo criterio que fn_cuota_comercial_bytes).

create or replace function public.fn_espacio_equipo()
returns table(usado_total bigint, presupuesto bigint)
language sql
security definer
set search_path to 'public'
as $$
  select
    coalesce(sum((metadata->>'size')::bigint), 0)::bigint,
    ((1024 - 200) * 1024 * 1024)::bigint
  from storage.objects
  where bucket_id in ('fotos-visita', 'audios-visita');
$$;
