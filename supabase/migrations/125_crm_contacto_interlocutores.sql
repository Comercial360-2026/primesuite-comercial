-- Interlocutores desde el CRM (prompt maestro 13, punto 5).
--
-- Los contactos del CRM llegan cada mañana con la carga diaria (crm-diario.ps1
-- → sincronizar-cuentas-crm?tabla=contactos) a `crm_contacto`. Para cada
-- cliente vinculado a una cuenta (cliente.crm_accountid), sus contactos pasan
-- a ser interlocutores de ese cliente, marcados con `crm_contactid`: así la
-- ficha, la visita (presentes) y el repaso los usan sin cambiar nada.
--
-- Reglas:
--  - Nombre, cargo, teléfono y email de un interlocutor del CRM los manda el
--    CRM (se sobrescriben en cada carga); tipo de influencia y relevancia son
--    de la app y no se tocan.
--  - Un interlocutor dado de alta a mano que coincide con un contacto del CRM
--    (mismo email, o mismo teléfono de 9+ cifras) se JUNTA con él: pasa a
--    llevar su crm_contactid en vez de duplicarse.
--  - Contacto inactivo en el CRM, que cambia de cuenta, o cliente que se
--    desvincula / cambia de cuenta → el interlocutor queda activo=false (baja
--    lógica, como «Quitar»: las visitas pasadas lo conservan).

create table crm_contacto (
  contactid       uuid primary key,
  accountid       uuid,
  nombre          text not null,
  cargo           text,
  email           text,
  telefono        text,
  movil           text,
  activo          boolean not null default true,
  modificado_crm  timestamptz,
  sincronizado_en timestamptz not null default now()
);

comment on table crm_contacto is
  'Espejo mínimo de los contactos del CRM Dynamics. Lo escribe la carga diaria '
  '(service role); se vuelca en interlocutor con fn_sincronizar_interlocutores_crm.';

create index crm_contacto_accountid_idx on crm_contacto (accountid);

alter table crm_contacto enable row level security;

create policy pol_crm_contacto_select on crm_contacto
  for select using (fn_comercial_actual_activo());

-- Sin índice único (cliente_id, crm_contactid): fusionar dos clientes con la
-- misma cuenta mueve los interlocutores de uno al otro y chocaría. Los
-- duplicados que deje una fusión los da de baja la función.
alter table interlocutor add column crm_contactid uuid;
create index interlocutor_crm_contactid_idx on interlocutor (crm_contactid) where crm_contactid is not null;

create or replace function fn_solo_digitos(t text) returns text
language sql immutable as $$ select nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '') $$;

-- p_cliente_id: solo ese cliente (al vincularlo); null = todos (tras la carga).
create or replace function fn_sincronizar_interlocutores_crm(p_cliente_id uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- 1. Juntar: interlocutor a mano que coincide con un contacto de su cuenta.
  update interlocutor i
     set crm_contactid = m.contactid
    from (
      select distinct on (c.contactid, cl.id) c.contactid, i2.id as interlocutor_id
        from cliente cl
        join crm_contacto c on c.accountid = cl.crm_accountid
        join interlocutor i2 on i2.cliente_id = cl.id and i2.crm_contactid is null
       where (p_cliente_id is null or cl.id = p_cliente_id)
         and cl.estado_fusion = 'activo'
         and (
           (c.email is not null and lower(i2.email) = lower(c.email))
           or (length(fn_solo_digitos(i2.telefono)) >= 9
               and fn_solo_digitos(i2.telefono) in (fn_solo_digitos(c.telefono), fn_solo_digitos(c.movil)))
         )
         and not exists (
           select 1 from interlocutor x where x.cliente_id = cl.id and x.crm_contactid = c.contactid
         )
       order by c.contactid, cl.id, i2.activo desc, i2.creado_en
    ) m
   where i.id = m.interlocutor_id;

  -- 2. Duplicados (p. ej. tras una fusión): se queda el más antiguo.
  update interlocutor i
     set activo = false, actualizado_en = now()
   where i.crm_contactid is not null
     and i.activo
     and (p_cliente_id is null or i.cliente_id = p_cliente_id)
     and exists (
       select 1 from interlocutor o
        where o.cliente_id = i.cliente_id and o.crm_contactid = i.crm_contactid
          and o.activo and (o.creado_en, o.id) < (i.creado_en, i.id)
     );

  -- 3. Actualizar los ya enlazados con lo que diga el CRM.
  update interlocutor i
     set nombre = c.nombre,
         cargo = coalesce(c.cargo, i.cargo),
         telefono = coalesce(c.movil, c.telefono, i.telefono),
         email = coalesce(c.email, i.email),
         activo = c.activo and c.accountid is not distinct from cl.crm_accountid,
         actualizado_en = now()
    from crm_contacto c, cliente cl
   where i.crm_contactid = c.contactid
     and cl.id = i.cliente_id
     and (p_cliente_id is null or i.cliente_id = p_cliente_id)
     and not exists (
       select 1 from interlocutor o
        where o.cliente_id = i.cliente_id and o.crm_contactid = i.crm_contactid
          and o.activo and (o.creado_en, o.id) < (i.creado_en, i.id)
     )
     and (i.nombre, i.cargo, i.telefono, i.email, i.activo) is distinct from
         (c.nombre, coalesce(c.cargo, i.cargo), coalesce(c.movil, c.telefono, i.telefono),
          coalesce(c.email, i.email), c.activo and c.accountid is not distinct from cl.crm_accountid);

  -- 4. Del CRM cuyo cliente ya no está vinculado a una cuenta (o su contacto
  --    ya no está en crm_contacto): baja.
  update interlocutor i
     set activo = false, actualizado_en = now()
    from cliente cl
   where cl.id = i.cliente_id
     and i.crm_contactid is not null
     and i.activo
     and (p_cliente_id is null or i.cliente_id = p_cliente_id)
     and (cl.crm_accountid is null
          or not exists (select 1 from crm_contacto c
                          where c.contactid = i.crm_contactid and c.accountid = cl.crm_accountid));

  -- 5. Alta de los contactos activos que el cliente aún no tiene.
  insert into interlocutor (cliente_id, nombre, cargo, telefono, email, crm_contactid)
  select cl.id, c.nombre, c.cargo, coalesce(c.movil, c.telefono), c.email, c.contactid
    from cliente cl
    join crm_contacto c on c.accountid = cl.crm_accountid and c.activo
   where (p_cliente_id is null or cl.id = p_cliente_id)
     and cl.estado_fusion = 'activo'
     and not exists (
       select 1 from interlocutor x where x.cliente_id = cl.id and x.crm_contactid = c.contactid
     );
end;
$$;

revoke all on function fn_sincronizar_interlocutores_crm(uuid) from public, anon, authenticated;

-- Al vincular (o cambiar) la cuenta de un cliente, sus interlocutores del CRM
-- aparecen al momento, sin esperar a la carga de la mañana siguiente.
create or replace function fn_tr_cliente_crm_interlocutores()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' and new.crm_accountid is null then return null; end if;
  if tg_op = 'UPDATE' and new.crm_accountid is not distinct from old.crm_accountid then return null; end if;
  perform fn_sincronizar_interlocutores_crm(new.id);
  return null;
end;
$$;

create trigger tr_cliente_crm_interlocutores
  after insert or update of crm_accountid on cliente
  for each row
  execute function fn_tr_cliente_crm_interlocutores();
