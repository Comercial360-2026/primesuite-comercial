# Prompt maestro nº3 — Alta de cliente con primer proyecto

**Rama:** `feature/proyectos`. Sigue a nº1 (migración 103) y nº2 (barrido).
Pantalla: `src/features/clientes/alta-rapida-cliente.tsx` (+ cola offline + ayuda).
Cierra 5 de los 6 errores TS que quedan.

## Qué cambia para el comercial

Hoy el alta pide **solo el nombre del cliente**. Pasa a pedir **dos campos**:

1. **Nombre del cliente** (como ahora, con el aviso de duplicados).
2. **Primer proyecto** — obligatorio. Label «Primer proyecto», placeholder
   «p. ej. Mantenimiento, Obra nueva, Postventa…». Sin autocompletado.

Los tres botones actuales se mantienen («Guardar e iniciar visita ahora»,
«Guardar y planificar visita», «Guardar sin visita»); ahora exigen los **dos**
campos con texto.

La vía «este cliente ya existe» (tocar una coincidencia de la lista) no cambia:
ese cliente ya tiene proyectos, el campo «Primer proyecto» se ignora en esa
rama (no se oculta — si tocas una coincidencia, sales por otro camino).

## Online — RPC en vez de INSERT + trigger

`crearCliente()` deja de hacer `INSERT` directo en `cliente` (el trigger que
creaba el «General» ya no existe). Pasa a:

```ts
const { data, error } = await supabase.rpc('crear_cliente_con_proyecto', {
  p_cliente_id: clienteId,
  p_nombre_cliente: nombreLimpio,
  p_nombre_proyecto: nombreProyectoLimpio,
  p_creado_por: comercial.id,
  p_responsable_id: comercial.id,
});
// data: [{ cliente_id, proyecto_id }]
```

`crearCliente()` devuelve `{ id, nombre, proyectoId, enCola }`. Con eso:

- `arrancarConObjetivo` modo `'nuevo'`: pasa `proyectoId` a `encolarVisita`
  (ya no `undefined`) — el backend exige `proyecto_id`.
- `crearYPlanificar`: usa `proyectoId` del propio retorno; se elimina la
  consulta `select … .eq('es_general', true)` (líneas 242-251).
- `crearSinVisita`: igual, solo cambia la fuente del alta.

Fallo no-de-red (RLS, validación de la RPC) → se muestra tal cual, como hoy.

## Offline — encolar cliente + proyecto + visita encadenados

La cola ya soporta `'proyecto'` (`ProyectoPayload { clienteId, nombre, estado }`,
`sincronizarInsertSimple`) y `dependeDe`. El comentario de `types.ts:40` ya
anticipa «cliente nuevo → primer proyecto nuevo → visita».

`crearCliente()` sin red encola **dos** operaciones:

```ts
const proyectoId = uuid();
await encolar(clienteId, 'cliente', { nombre, creadoPor, responsableId });
await encolar(proyectoId, 'proyecto', { clienteId, nombre: nombreProyecto },
              { dependeDe: clienteId });
return { id: clienteId, nombre, proyectoId, enCola: true };
```

La visita encolada después usa `proyectoId` (el uuid local del proyecto) y
`dependeDe: proyectoId`. Así la cadena es cliente → proyecto → visita, cada
eslabón espera al anterior (lógica de `sync-engine.ts:70-87` ya existente).

`sincronizarVisita` (`sync-engine.ts:140-142`): el comentario «si no se conoce
proyectoId … su Proyecto General» queda obsoleto — actualizarlo: `proyecto_id`
siempre viaja explícito desde el alta; el `UPDATE` posterior lo aplica igual
que hoy.

## Ayuda (`src/lib/ayuda.ts`, entrada `alta-rapida-cliente`)

`queEs` / `cuando` mencionan hoy «solo el nombre». Reescribir a los dos campos:
un cliente nace con su primer proyecto (línea de negocio: mantenimiento, obra
nueva…), y toda visita cuelga de un proyecto. (La entrada `ficha-cliente` que
aún dice «el que se llama General» se corrige en nº4/nº P11.)

## Fuera de este prompt

`ficha-cliente.tsx` y `ficha-proyecto.tsx` (últimos 2 errores TS) → nº4.

## Cierre

`npm run typecheck && npm run lint && npm run build`. Deben quedar solo los 2
errores de nº4. Prueba manual en Chrome: alta con los dos campos → iniciar
visita → la visita nace en el proyecto tecleado (no en un «General»). Commit.
