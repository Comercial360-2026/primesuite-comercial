-- Backfill del "Proyecto General" para clientes que ya existían antes de
-- 87_proyecto_esquema.sql (el trigger de esa migración solo crea el
-- proyecto general en clientes NUEVOS a partir de ahora).
insert into public.proyecto (cliente_id, nombre, estado, es_general, creado_por, creado_en)
select c.id, 'General', 'activo', true, c.creado_por, c.creado_en
from public.cliente c
where not exists (
  select 1 from public.proyecto p where p.cliente_id = c.id and p.es_general
);

-- Visitas ya existentes: al Proyecto General de su cliente.
update public.visita v
set proyecto_id = p.id
from public.proyecto p
where p.cliente_id = v.cliente_id and p.es_general and v.proyecto_id is null;

-- Hallazgo y próximo paso: heredan de su visita.
update public.hallazgo h
set proyecto_id = v.proyecto_id
from public.visita v
where v.id = h.visita_id and h.proyecto_id is null;

update public.proximo_paso pp
set proyecto_id = v.proyecto_id
from public.visita v
where v.id = pp.visita_id and pp.proyecto_id is null;

-- Oportunidad: hereda de su visita_origen_id.
update public.oportunidad o
set proyecto_id = v.proyecto_id
from public.visita v
where v.id = o.visita_origen_id and o.proyecto_id is null;
