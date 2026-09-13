# Prompt maestro 12 — Categorías: modo "Editar" unificado

**Rama:** `feature/proyectos`. **Fecha:** 2026-09-12. Nace de una revisión de
diseño en chat (sin tocar código), a raíz del rename "Vocabulario" →
"Categorías" de esta misma sesión. Todo lo de abajo está acordado con Cesar;
implementar en sesión nueva.

## Pantalla

`/vocabulario` (`src/features/vocabulario/cola-vocabulario.tsx`), cabecera
"Categorías", pestaña "Catálogo completo" — solo Dirección Comercial. Gestiona
un catálogo de **3 niveles**: Categoría → Término → Modelo (p. ej. "Software" →
"MIFARE" → "DESFire EV2"). Es la única pantalla con jerarquía de 3 niveles en
toda la app.

## Problema

La pantalla usa **tres mecanismos de interacción distintos, uno por nivel**,
en vez de un único lenguaje:

- **Categoría** → menú "⋮" contextual por fila (`menuCategoriaId`), con chips
  "+ Añadir término" / "Editar categoría" / "Borrar categoría". Acción
  individual, sin lote.
- **Término** → sin acción visible en su fila normal; solo se toca entrando en
  el modo global "Seleccionar" (`seleccionandoCat` + `BarraSeleccion`):
  Renombrar (solo si hay exactamente 1 marcado) / Mover a… / Quitar.
- **Modelo** → botón "+ Añadir modelo" siempre visible bajo el término
  desplegado (`voc-fila-add`), sin menú.

Además, comprobado en el código, hay 3 problemas concretos, no solo de
consistencia:

1. **"Quitar" en lote dispara sin confirmación.** Es el único botón
   `tono="riesgo"` de la app que no pasa por `ConfirmacionBorrado` (a
   diferencia de "Borrar categoría", que sí la usa). Contradice
   [[primesuite-boton-destructivo]] (patrón único ya fijado en el resto de la
   app).
2. **Badge ambiguo.** El badge circular a la derecha de un término (nº de
   modelos) y el subtítulo gris (nº de fichas que lo usan) miden cosas
   distintas y se confunden a simple vista.
3. **"+ Añadir término" está escondido** detrás de un menú "⋮" que hay que
   abrir antes, mientras que "+ Añadir modelo" está siempre a la vista.
   Inconsistente entre dos niveles que deberían comportarse igual.

Comprobado también qué SÍ es coherente con el resto de la app y no hay que
tocar: "Renombrar" deshabilitado salvo con exactamente 1 marcado es el
patrón ya establecido (igual en `gestionar-sectores`, `directorio-
interlocutores`, `agenda-del-dia`, `panel-visitas-abiertas`) — no es un fallo
de esta pantalla.

## Análisis por perfiles

- **Comercial:** no ve esta pantalla (RLS + `soloDireccion`).
- **Director (usuario):** hoy tiene que recordar tres sitios distintos para
  "editar algo" según si es una categoría, un término o un modelo. Debería
  ser un único gesto ("Editar") que se comporte igual sea lo que sea que
  toque.
- **Diseñador Apple:** un mismo tipo de acción (reordenar / seleccionar-para-
  actuar) debe significar lo mismo en toda la jerarquía, no fragmentarse por
  nivel. Crear un hijo dentro de un padre ya visible en pantalla (término
  dentro de categoría, modelo dentro de término) SÍ puede ir con un "+"
  inline junto al padre — eso no es un antipatrón (Recordatorios de Apple
  hace lo mismo) — el fallo es que hoy solo modelo lo tiene visible y término
  no.

## Cambios

### 1. Modo único "Editar" (sustituye "Ordenar" + "Seleccionar" + menú "⋮")

Un solo chip **"Editar"** (donde hoy están los chips "Ordenar" y
"Seleccionar"). Activo, en categoría/término/modelo por igual:

- checkbox de selección (como hoy en "Seleccionar"),
- flechas subir/bajar (como hoy en "Ordenar").

Antes de implementar el punto de las flechas, **probar en pantalla de móvil
real** cuántos elementos tocables caben en una fila de categoría (chevron +
checkbox + flechas + nombre) — si no caben con buen tamaño de toque, separar
en dos sub-modos dentro de "Editar" (un segmentado interno "Reordenar" /
"Seleccionar") en vez de forzar los 4 elementos a la vez. Decisión de diseño
a validar en pantalla, no en el código a ciegas.

`BarraSeleccion` pasa a mostrar las acciones según el TIPO de fila marcada:

- si hay categorías marcadas → Renombrar (1 marcada) / Borrar (con
  `ConfirmacionBorrado`, ver punto 3),
- si hay términos/modelos marcados → Renombrar (1 marcado) / Mover a… /
  Quitar (con confirmación, ver punto 3).

El menú "⋮" de categoría desaparece por completo — sus tres chips se reparten
entre el botón "+ Añadir término" (punto 2) y las acciones del modo "Editar".

**Excepción a mantener:** la categoría fija "Sin clasificar" no ofrece
Renombrar/Borrar — su checkbox puede aparecer en modo "Editar" pero esas dos
acciones quedan deshabilitadas para ella, igual que hoy el menú "⋮" no se le
ofrece.

### 2. "+ Añadir término" visible, sin menú

Quitar "+ Añadir término" del menú "⋮" (que desaparece, ver punto 1) y
ponerlo como botón fijo al pie de cada categoría desplegada — mismo patrón
visual (`voc-fila-add`) que ya usa "+ Añadir modelo". Un término y un modelo
se crean exactamente igual: viendo a su padre ya abierto, con un botón
siempre a la vista debajo.

Crear una categoría sigue en el "+" de la cabecera (sin cambios: no tiene
padre ambiguo, es la única entidad de nivel superior).

### 3. Confirmación antes de "Quitar" (y antes de "Borrar categoría", que ya la tiene)

Añadir `ConfirmacionBorrado` (o el mismo patrón, adaptado a lote) antes de
ejecutar `quitarLote`. Texto de la confirmación explica en el momento — no
solo en /ayuda — que "Quitar" dejaa el término fuera del catálogo pero NO
borra las fichas que ya lo usan (es `estado_gobierno = 'descartado'`, no un
DELETE real). Mismo sitio: aprovechar esa confirmación para el punto 6.

### 4. Separar "usos" de "nº de modelos"

Quitar el badge circular numérico de la fila de término (hoy = nº de
modelos). Añadir "N modelos" al mismo subtítulo gris que ya concatena con
"·" (`sub = [...].filter(Boolean).join(' · ')` en `filaTermino`), junto a
"pendiente de revisar" y "en N fichas". Un solo lugar para todos los datos
secundarios del término, sin badge aparte.

### 5. Selección mixta término + su propio modelo

Cuando el lote marcado incluye un término Y uno de sus propios modelos a la
vez, mostrar una línea en `BarraSeleccion` ("Este término se mueve con sus
modelos") en vez de dejarlo implícito. No bloquear la combinación — la lógica
de `moverLoteAbierto` ya la maneja correctamente, solo falta explicarla.

### 6. Microcopy de "Quitar" en el momento de la acción

Cubierto dentro del punto 3 (mismo texto de confirmación).

## Qué NO se toca

- El modelo de datos (`categoria_vocabulario`, `termino`, `hallazgo_area`,
  `oportunidad_area`) — nada de esto cambia.
- La pestaña "Pendientes" (`seleccionandoPend` / `marcadosPend`) — tiene su
  propio ciclo de vida (aprobar/fusionar/descartar propuestas), no forma
  parte de la jerarquía Categoría/Término/Modelo y no comparte el problema
  descrito aquí.
- El buscador (`CampoBuscar`) — sigue ocultándose en modo "Editar", igual que
  hoy se oculta en "Ordenar"/"Seleccionar".
- Los nombres de tabla / RPC (`resolver_termino_propuesto`, etc.).
- El icono duplicado de la fila "Sectores" en `yo.tsx` — es un hallazgo
  aparte, ya anotado como tarea independiente (`task_c4425f67`), no forma
  parte de este prompt maestro.

## Verificación

- `typecheck` + `lint` + `build`.
- Sesión de Dirección Comercial en vivo (Chrome):
  1. Modo "Editar": marcar una categoría → aparecen Renombrar/Borrar; marcar
     un término → aparecen Renombrar/Mover a…/Quitar; marcar categoría +
     término a la vez → decidir en el momento qué mostrar (probablemente
     deshabilitar hasta que la selección sea de un solo tipo).
  2. "Quitar" y "Borrar categoría" piden confirmación con el texto nuevo.
  3. "+ Añadir término" visible sin abrir ningún menú.
  4. Badge de modelos ya no aparece; el subtítulo del término lista "N
     modelos" junto a "en N fichas" cuando aplique.
  5. Marcar término + su modelo → aviso en la barra.
  6. Ergonomía táctil real en un viewport de móvil (375px) del modo "Editar"
     en una categoría con término y modelo a la vez.
- `ayuda.ts` (entrada `cola-vocabulario`): actualizar el texto para que
  describa el modo "Editar" único en vez de "Seleccionar"/"⋮" por separado —
  en el mismo commit.
- `graphify update .`
