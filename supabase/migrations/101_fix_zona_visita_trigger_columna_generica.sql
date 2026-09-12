-- Fix de 100_zona_visita_catalogo.sql: `new.visita_origen_id` no compila en
-- el trigger de hallazgo/captura_libre/proximo_paso porque esas tablas no
-- tienen esa columna — el CASE de PL/pgSQL no descarta en compilación la
-- rama no tomada, se resuelve contra el tipo de fila real de NEW en cada
-- tabla donde se dispara. Reventaba con "record new has no field
-- visita_origen_id" al guardar zona en cualquier hallazgo/captura/próximo
-- paso (encontrado por Cesar probando en vivo nada más desplegar).
--
-- Arreglo: acceder vía JSON (to_jsonb(NEW)->>'col'), que da NULL si la
-- columna no existe en la tabla que disparó el trigger en vez de fallar —
-- sirve para las 4 tablas con una sola función genérica.
create or replace function fn_registrar_zona_visita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_visita_id uuid;
  v_zona_texto text;
begin
  v_visita_id := coalesce(v_row->>'visita_id', v_row->>'visita_origen_id')::uuid;
  v_zona_texto := btrim(v_row->>'zona_texto');

  if v_visita_id is not null and v_zona_texto is not null and v_zona_texto <> '' then
    insert into zona_visita (visita_id, zona_clave, zona_texto)
    values (v_visita_id, lower(v_zona_texto), v_zona_texto)
    on conflict (visita_id, zona_clave) do nothing;
  end if;

  return new;
end;
$$;
