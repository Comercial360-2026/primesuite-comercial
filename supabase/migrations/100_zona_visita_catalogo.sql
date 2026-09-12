-- Catálogo persistente de zonas por visita.
--
-- Hasta ahora "zonas de esta visita" se calculaba en caliente escaneando
-- `zona_texto` de captura_libre/hallazgo/oportunidad/proximo_paso: no hay
-- una lista propia, es "lo que tiene zona AHORA MISMO". Efecto en producción
-- (encontrado por Cesar en vivo): si el único registro que usaba "zona 27"
-- se editaba a otra zona, "zona 27" dejaba de existir para todo el mundo en
-- esa visita, aunque la hubiera creado hace un segundo — un comercial que
-- cambia de zona su propio hallazgo le borra la opción a los demás. No es
-- un catálogo, es una fotografía del instante.
--
-- `zona_visita` es el catálogo real: una fila por zona vista alguna vez en
-- la visita, que no se borra cuando el registro que la introdujo cambia de
-- zona o se archiva/borra. `zona_clave` (minúsculas, sin espacios de sobra)
-- es la clave de unicidad — mismo criterio que `deduplicarZonas()` en
-- src/lib/zonas-visita.ts, para no crear "Muelle" y "muelle" como dos filas.

create table zona_visita (
  visita_id uuid not null references visita(id) on delete cascade,
  zona_clave text not null,
  zona_texto text not null,
  creado_en timestamptz not null default now(),
  primary key (visita_id, zona_clave)
);

comment on table zona_visita is
  'Catálogo de zonas vistas en una visita: no se borra ni se pisa cuando el '
  'registro que la introdujo cambia de zona — apéndice, nunca se hace UPDATE '
  'del texto. Poblado por trigger desde captura_libre/hallazgo/oportunidad/'
  'proximo_paso (fn_registrar_zona_visita), nunca desde el cliente.';

alter table zona_visita enable row level security;

-- Mismo criterio de visibilidad que el resto de datos de una visita: quien
-- participa en ella, Dirección Comercial, o lectura ampliada.
create policy pol_zona_visita_select on zona_visita
  for select using (
    fn_es_participante_de_visita(visita_id)
    or fn_rol_actual() = 'direccion_comercial'
    or fn_rol_lectura_ampliada()
  );

-- Sin política de INSERT/UPDATE/DELETE para el cliente a propósito: solo
-- escribe el trigger (SECURITY DEFINER), nunca una llamada directa desde la
-- app — así no hace falta acotar quién puede "declarar" una zona existente.

create or replace function fn_registrar_zona_visita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visita_id uuid;
  v_zona_texto text;
begin
  v_visita_id := case when TG_TABLE_NAME = 'oportunidad' then new.visita_origen_id else new.visita_id end;
  v_zona_texto := btrim(new.zona_texto);

  if v_visita_id is not null and v_zona_texto is not null and v_zona_texto <> '' then
    insert into zona_visita (visita_id, zona_clave, zona_texto)
    values (v_visita_id, lower(v_zona_texto), v_zona_texto)
    on conflict (visita_id, zona_clave) do nothing;
  end if;

  return new;
end;
$$;

comment on function fn_registrar_zona_visita is
  'Trigger AFTER INSERT/UPDATE OF zona_texto: da de alta la zona en el '
  'catálogo de la visita si no estaba. No la quita nunca ni la actualiza '
  '— eso es lo que arregla el bug de "zona 27 desapareció".';

create trigger trg_zona_visita_captura
  after insert or update of zona_texto on captura_libre
  for each row execute function fn_registrar_zona_visita();

create trigger trg_zona_visita_hallazgo
  after insert or update of zona_texto on hallazgo
  for each row execute function fn_registrar_zona_visita();

create trigger trg_zona_visita_oportunidad
  after insert or update of zona_texto on oportunidad
  for each row execute function fn_registrar_zona_visita();

create trigger trg_zona_visita_proximo_paso
  after insert or update of zona_texto on proximo_paso
  for each row execute function fn_registrar_zona_visita();

-- Backfill: las zonas que ya existían antes de este catálogo (los datos
-- vivos de hoy) también cuentan como "vistas alguna vez".
insert into zona_visita (visita_id, zona_clave, zona_texto)
select visita_id, lower(btrim(zona_texto)), btrim(zona_texto)
from captura_libre
where zona_texto is not null and btrim(zona_texto) <> ''
on conflict (visita_id, zona_clave) do nothing;

insert into zona_visita (visita_id, zona_clave, zona_texto)
select visita_id, lower(btrim(zona_texto)), btrim(zona_texto)
from hallazgo
where zona_texto is not null and btrim(zona_texto) <> ''
on conflict (visita_id, zona_clave) do nothing;

insert into zona_visita (visita_id, zona_clave, zona_texto)
select visita_origen_id, lower(btrim(zona_texto)), btrim(zona_texto)
from oportunidad
where visita_origen_id is not null and zona_texto is not null and btrim(zona_texto) <> ''
on conflict (visita_id, zona_clave) do nothing;

insert into zona_visita (visita_id, zona_clave, zona_texto)
select visita_id, lower(btrim(zona_texto)), btrim(zona_texto)
from proximo_paso
where zona_texto is not null and btrim(zona_texto) <> ''
on conflict (visita_id, zona_clave) do nothing;
