-- 123: aviso de tope diario de briefings alcanzado (Cesar, 25-09-2026).
-- Lo lee cualquier comercial activo: Dirección ve el aviso en Yo › Gestión y
-- el comercial ve en su visita por qué su briefing espera a mañana. Solo
-- cifras, sin datos de nadie.
create function fn_tope_briefing()
returns table (enviados_hoy bigint, tope integer, alcanzado boolean)
language sql security definer set search_path = public as $$
  select h.n, a.valor_numero, a.valor and a.valor_numero is not null and h.n >= a.valor_numero
    from (select fn_briefings_enviados_hoy() n) h
    cross join (select valor, valor_numero from ajustes_app where clave = 'briefing_tope_diario') a
   where fn_comercial_actual_activo();
$$;
