-- Un cliente vinculado a una cuenta del CRM puede llamarse como ella (se ofrece en su ficha y en «Clientes por vincular»).
-- Si Dirección/el comercial decide mantener SU nombre, se marca para no volver a ofrecérselo.
alter table cliente add column if not exists crm_nombre_propio boolean not null default false;
