# Prompt maestro nº2 — Barrido mecánico de `es_general` en frontend

**Rama:** `feature/proyectos`. Sigue a la migración 103 (`d7f4a06`). Solo quita
lecturas de una columna que ya no existe. **Sin decisiones de UX nuevas** salvo
la ya acordada: el nombre del proyecto pasa a verse siempre (antes se ocultaba
si era el «General»).

## Alcance (18 ficheros)

### A · Cadenas de contexto — el nombre del proyecto se muestra siempre
`x.proyecto && !x.proyecto.es_general ? x.proyecto.nombre : null|''`
→ `x.proyecto?.nombre ?? null|''`

`agenda.tsx`, `detalle-hallazgo.tsx`, `detalle-oportunidad.tsx`,
`detalle-proximo-paso.tsx`, `cierre-visita.tsx`, `detalle-captura.tsx`,
`visita-activa.tsx` (×2), `actividad-proyecto.tsx`, `planificar-visita.tsx`,
`use-aviso-visita-en-curso.ts` (×2).

### B · `select('… proyecto:proyecto_id(nombre, es_general)')` → `(nombre)`
y tipos inline `{ nombre: string; es_general: boolean }` → `{ nombre: string }`
en los mismos ficheros + `agenda.tsx`.

### C · Listas de proyectos — quitar `es_general` de `select`, interfaz y
`.order('es_general', { ascending:false })` (el orden pasa a ser solo
`creado_en asc`; el «Proyecto principal» migrado es el más antiguo, queda
primero igual):
`use-proyectos-cliente.ts`, `repaso-cliente.tsx`, `planificar-visita.tsx`.

### D · Filtro «no terminado»
`p.es_general || p.estado !== 'terminado'` → `p.estado !== 'terminado'`
`objetivo-visita-modal.tsx`, `planificar-visita.tsx`.

### E · Etiqueta del proyecto en selectores
`p.es_general ? 'Sin proyecto asignado' : p.nombre` → `p.nombre`
`objetivo-visita-modal.tsx`. En `planificar-visita.tsx:296` el `subtitulo`
condicionado al General se elimina.

### F · `detalle-actividad-comercial.tsx` (Dirección)
`p.es_general ? p.cliente_nombre : '${cliente} › ${proyecto}'`
→ siempre `'${p.cliente_nombre} › ${p.proyecto_nombre}'`. Quitar `es_general`
de la interfaz `ActividadProyecto` (la RPC ya no lo devuelve).

## Fuera de este prompt

- `alta-rapida-cliente.tsx` → prompt nº3 (2 campos + RPC + cola offline).
- `ficha-cliente.tsx` (`find(es_general)` / `filter(!es_general)`) y
  `ficha-proyecto.tsx` (`<Navigate>` P8) y `acciones-proyecto.tsx`
  (`eliminar_proyecto` con destino) → prompt nº4.

## Cierre

`npm run typecheck && npm run lint && npm run build`. Debe bajar de 17 errores
TS a solo los de los ficheros de nº3/nº4. Commit.
