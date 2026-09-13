-- Subcategorías de vocabulario en forma de jerarquía de TÉRMINOS (1 nivel):
-- p.ej. "MIFARE" (padre) con modelos "DESFire EV2", "EV1"... colgando.
-- Además, orden manual de términos entre hermanos (como categoria_vocabulario.orden).

alter table termino add column parent_id uuid references termino(id);
alter table termino add column orden integer not null default 0;

create index idx_termino_parent on termino(parent_id);
create index idx_termino_categoria_orden on termino(categoria_id, orden);

-- Backfill: numera cada grupo de hermanos (misma categoría + mismo padre)
-- por orden alfabético actual, para que nada se reordene visualmente al desplegar.
with num as (
  select id,
         row_number() over (partition by categoria_id, parent_id order by nombre) - 1 as rn
  from termino
)
update termino t set orden = num.rn from num where num.id = t.id;

-- Guarda de jerarquía: 1 solo nivel, sin auto-padre, y el hijo hereda
-- SIEMPRE la categoría del padre.
create or replace function fn_termino_jerarquia_guard()
returns trigger language plpgsql as $$
declare
  v_parent termino;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'Un término no puede ser su propio padre.';
  end if;
  select * into v_parent from termino where id = new.parent_id;
  if not found then
    raise exception 'El término padre % no existe.', new.parent_id;
  end if;
  if v_parent.parent_id is not null then
    raise exception 'Solo se admite un nivel de anidación: "%" ya es un modelo dentro de otro término.', v_parent.nombre;
  end if;
  new.categoria_id := v_parent.categoria_id;
  return new;
end;
$$;

create trigger trg_termino_jerarquia_guard
  before insert or update of parent_id, categoria_id on termino
  for each row execute function fn_termino_jerarquia_guard();

-- Al mover un término padre de categoría, arrastra sus modelos.
create or replace function fn_termino_cascada_categoria()
returns trigger language plpgsql as $$
begin
  if new.categoria_id is distinct from old.categoria_id then
    update termino
       set categoria_id = new.categoria_id
     where parent_id = new.id
       and categoria_id is distinct from new.categoria_id;
  end if;
  return null;
end;
$$;

create trigger trg_termino_cascada_categoria
  after update of categoria_id on termino
  for each row execute function fn_termino_cascada_categoria();
