-- 146: una cuenta del CRM = un cliente activo. Hasta ahora `crm_accountid` solo tenía un índice normal y dos
-- clientes podían apuntar a la misma cuenta (duplicado que luego había que fusionar a mano en Deduplicación).
-- Parcial: solo clientes activos (un cliente fusionado en otro puede conservar la cuenta sin chocar) y solo
-- con cuenta vinculada. Comprobado antes de aplicar: 0 cuentas repetidas entre clientes activos.
create unique index if not exists cliente_crm_accountid_unico
  on public.cliente (crm_accountid)
  where crm_accountid is not null and estado_fusion = 'activo';
