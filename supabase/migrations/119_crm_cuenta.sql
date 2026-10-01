-- Cuentas del CRM (Dynamics on-prem, tras VPN) para vincular cada cliente de
-- PrimeSuite con su cuenta exacta. Sin esto el briefing de Copilot Studio
-- tiene que adivinar la cuenta por nombre ("Total" = 9 cuentas) y de noche
-- no hay nadie para elegir.
--
-- Solo lo mínimo para identificar la cuenta: nada de oportunidades, ofertas,
-- importes ni contactos (eso sigue viviendo solo en el CRM / SharePoint).
-- La carga la hace el flujo de Power Automate del PC de Cesar (7:00 y 11:00)
-- con service role; los comerciales solo leen.

create table crm_cuenta (
  accountid        uuid primary key,
  nombre           text not null,
  ciudad           text,
  codigo_postal    text,
  pais             text,
  cuenta_matriz_id uuid,
  cuenta_matriz    text,
  activa           boolean not null default true,
  modificado_crm   timestamptz,
  sincronizado_en  timestamptz not null default now()
);

comment on table crm_cuenta is
  'Espejo mínimo de las cuentas (accounts) del CRM Dynamics. Lo escribe el flujo de '
  'Power Automate (service role); los comerciales solo leen para vincular clientes.';

create index crm_cuenta_nombre_idx on crm_cuenta (lower(nombre));

alter table crm_cuenta enable row level security;

create policy pol_crm_cuenta_select on crm_cuenta
  for select using (fn_comercial_actual_activo());
