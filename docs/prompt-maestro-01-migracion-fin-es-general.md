# Prompt maestro nº1 — Migración 103: fin de `es_general` en BD

**Rama:** `feature/proyectos`. **Fecha:** 2026-09-07. Primera pieza del replanteo
«proyecto obligatorio y explícito» (spec: `prompt-maestro-proyecto-obligatorio.md`).
Solo capa de datos. El barrido de frontend va en prompts siguientes, pantalla a
pantalla.

## Estado real verificado (dev `umrjzvpbcpzzqmkjahhn`, 2026-09-07)

- `proyecto.es_general boolean NOT NULL default false`. **Sin CHECK**, sin índice
  propio. Sí hay `proyecto_estado_check` (activo/pausado/terminado), intacto.
- **13 clientes, 13 proyectos `es_general`** (exactamente 1 por cliente), 16
  proyectos totales (3 con nombre). **0 visitas con `proyecto_id` NULL.** Datos
  limpios, migración sin casos raros.
- Trigger `trg_cliente_crear_proyecto_general` AFTER INSERT en `cliente` →
  `fn_crear_proyecto_general()` inserta el proyecto `'General'`.
- Trigger `trg_visita_proyecto_id` BEFORE INSERT en `visita` →
  `fn_set_proyecto_id_visita()`: si viene `proyecto_id`, deriva `cliente_id`; si
  no, **cae al `es_general`**.
- `es_general` aparece en 5 funciones: `fn_crear_proyecto_general`,
  `fn_set_proyecto_id_visita`, `fn_fusionar_cliente`,
  `fn_actividad_comercial_por_proyecto` (columna de salida), `eliminar_proyecto`
  (guard). **Ninguna vista ni RLS.**
- No existe RPC de alta de cliente: el frontend hace `INSERT` directo en
  `cliente` y el trigger crea el proyecto.

## Migración 103 (un solo archivo, orden estricto)

### 1. Renombrar y quitar la marca

```sql
update public.proyecto
   set nombre = 'Proyecto principal'
 where es_general = true;
```

Las ~11k filas de actividad **no se tocan** (siguen apuntando a ese
`proyecto_id`). Aviso a Dirección: renombrar cliente a cliente con la RPC de
renombrar ya existente.

### 2. `fn_set_proyecto_id_visita` — `proyecto_id` pasa a ser obligatorio de verdad

- Se **conserva** el trigger (sigue derivando `cliente_id` desde `proyecto_id`,
  cómodo y usado).
- Se **elimina** la rama `else` que asignaba al `es_general`.
- Si entra una visita con `proyecto_id IS NULL` → `raise exception 'Una visita
  necesita un proyecto.'` (mensaje claro, no un NULL silencioso).

```sql
create or replace function public.fn_set_proyecto_id_visita()
returns trigger language plpgsql as $$
begin
  if new.proyecto_id is null then
    raise exception 'Una visita necesita un proyecto.';
  end if;
  select cliente_id into new.cliente_id
    from public.proyecto where id = new.proyecto_id;
  if new.cliente_id is null then
    raise exception 'El proyecto % no existe.', new.proyecto_id;
  end if;
  return new;
end;
$$;
```

Y `alter table public.visita alter column proyecto_id set not null;` (ya está al
100%, el trigger lo blinda para el futuro).

### 3. Alta de cliente → RPC transaccional, fuera el trigger

```sql
drop trigger trg_cliente_crear_proyecto_general on public.cliente;
drop function public.fn_crear_proyecto_general();

create or replace function public.crear_cliente_con_proyecto(
  p_cliente_id       uuid,
  p_nombre_cliente   text,
  p_nombre_proyecto  text,
  p_creado_por       uuid,
  p_responsable_id   uuid
) returns table (cliente_id uuid, proyecto_id uuid)
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_proy uuid;
begin
  if not fn_comercial_actual_activo() then
    raise exception 'No tienes permiso para dar de alta clientes.';
  end if;
  if coalesce(btrim(p_nombre_cliente),'') = '' then
    raise exception 'El cliente necesita un nombre.';
  end if;
  if coalesce(btrim(p_nombre_proyecto),'') = '' then
    raise exception 'El primer proyecto necesita un nombre.';
  end if;

  insert into public.cliente (id, nombre, estado_relacion, creado_por, responsable_id)
  values (p_cliente_id, btrim(p_nombre_cliente), 'borrador', p_creado_por, p_responsable_id);

  insert into public.proyecto (cliente_id, nombre, estado, creado_por)
  values (p_cliente_id, btrim(p_nombre_proyecto), 'activo', p_creado_por)
  returning id into v_proy;

  return query select p_cliente_id, v_proy;
end;
$$;
```

(Los nombres de columna de `cliente` — `estado_relacion`, `responsable_id`,
`creado_por` — replican el INSERT actual de `alta-rapida-cliente.tsx:144`.)

### 4. `fn_fusionar_cliente` — se simplifica

Quitar el caso especial del General. Los proyectos del cliente absorbido pasan
**tal cual** (solo cambia `cliente_id`). Se admite que el maestro acabe con dos
"Proyecto principal": son proyectos normales, se renombran o fusionan a mano
después.

```sql
-- dentro del if de fusión, sustituir el update proyecto por:
update proyecto set cliente_id = v_maestro_final where cliente_id = new.id;
```

### 5. `fn_actividad_comercial_por_proyecto` — fuera la columna `es_general`

- `RETURNS TABLE(...)` sin `es_general boolean`.
- `select` sin `p.es_general`.
- **Consumidor:** `src/features/perfil/detalle-actividad-comercial.tsx` (rama
  `es_general ? cliente_nombre : cliente › proyecto` → siempre `cliente ›
  proyecto`). Va en su prompt de pantalla.

### 6. `eliminar_proyecto` — guard nuevo + destino explícito

Ya no hay «General» al que reubicar. Nueva firma con destino obligatorio y
bloqueo del último proyecto:

```sql
drop function public.eliminar_proyecto(uuid);

create or replace function public.eliminar_proyecto(
  p_proyecto_id uuid,
  p_destino_id  uuid
) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_cliente uuid; v_cliente_destino uuid; v_total int;
begin
  if not fn_comercial_actual_activo() then
    raise exception 'No tienes permiso para borrar proyectos.';
  end if;
  select cliente_id into v_cliente from proyecto where id = p_proyecto_id;
  if v_cliente is null then
    raise exception 'El proyecto no existe o ya se había borrado.';
  end if;
  select count(*) into v_total from proyecto where cliente_id = v_cliente;
  if v_total <= 1 then
    raise exception 'Es el único proyecto del cliente; no se puede borrar.';
  end if;
  select cliente_id into v_cliente_destino from proyecto where id = p_destino_id;
  if v_cliente_destino is null or v_cliente_destino <> v_cliente then
    raise exception 'El proyecto de destino no es válido para este cliente.';
  end if;

  update visita       set proyecto_id = p_destino_id where proyecto_id = p_proyecto_id;
  update oportunidad  set proyecto_id = p_destino_id where proyecto_id = p_proyecto_id;
  update hallazgo     set proyecto_id = p_destino_id where proyecto_id = p_proyecto_id;
  update proximo_paso set proyecto_id = p_destino_id where proyecto_id = p_proyecto_id;
  delete from proyecto where id = p_proyecto_id;
end;
$$;
```

**Consumidor:** `src/features/proyectos/acciones-proyecto.tsx` — hoy llama
`eliminar_proyecto(p_proyecto_id)`; pasará a pedir el proyecto de destino (un
`<select>` en `<ConfirmacionBorrado>`) y bloquear si es el único. Va en el
prompt de la ficha de proyecto.

### 7. Quitar la columna

```sql
alter table public.proyecto drop column es_general;
```

Va **al final**, cuando ninguna función la referencia.

## Tras aplicar (dev)

1. `apply_migration` 103 en dev.
2. `generate_typescript_types` → regenerar `src/lib/database.types.ts`. A partir
   de aquí **el frontend no compila** hasta terminar el barrido (referencias a
   `es_general` en `alta-rapida-cliente.tsx`, `ficha-cliente.tsx`, etc.). Es
   aceptable: rama local, sin push.
3. Commit de la migración + tipos con nota "no compila hasta barrido de
   pantallas".

## Frontend que queda tocado por esta migración (prompts siguientes, uno por pantalla)

| Pantalla / módulo | Cambio |
| --- | --- |
| `alta-rapida-cliente.tsx` | 2 campos (cliente + primer proyecto); usar RPC `crear_cliente_con_proyecto`; quitar lecturas `es_general` (l. 60, 91-104, 242-247, 384); offline: encolar cliente+proyecto. |
| `ficha-cliente.tsx` | Fila de proyecto siempre (sin fusión); quitar bloque «Sin proyecto asignado». |
| `ficha-proyecto.tsx` | Fuera `<Navigate>` por `es_general` (P8). |
| `acciones-proyecto.tsx` | `eliminar_proyecto` con destino + bloqueo último. |
| `detalle-actividad-comercial.tsx` | Siempre `cliente › proyecto`. |
| `objetivo-visita-modal.tsx` / `use-proyectos-cliente` / `actividad-proyecto.tsx` | Fuera ramas `es_general`; el nombre del proyecto se ve siempre. |
| Sweep textos | ~12 ficheros con `proyecto && !es_general ? nombre : —` → nombre siempre. Revisar que no sature subtítulos (Agenda). |

## No entra aquí

Migración de nombres por Dirección (proceso manual), P7b, P9, Hoy visitas sin
cerrar, P11. Todo eso después del barrido.
