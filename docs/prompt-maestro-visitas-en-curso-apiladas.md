# Prompt maestro — Visitas en curso apiladas

**Rama:** `feature/proyectos`. **Fecha:** 2026-09-07.

## Problema

Un comercial puede tener varias visitas en `estado_captura='en_curso'` a la vez
(cada "Iniciar visita ahora" con un cliente distinto crea una nueva y nada lo
impide). Cuando hay **2 o más**, la app las cuenta pero no da forma de llegar a
ellas ni de quitarlas:

- `bloque-ahora.tsx`: pinta solo `enCurso[0]` + texto muerto "y N visitas más en curso".
- `visita-activa.tsx:1500-1519`: el aviso "otra visita sigue abierta" solo trae
  enlace si `otrasVisitasEnCurso.length === 1`; con ≥2 dice "Tienes N visitas
  abiertas sin cerrar." y nada más.
- `agenda-del-dia.tsx`: la query `visitas` filtra por rango del día, así que una
  visita que quedó en curso **de un día anterior** no aparece en ningún sitio
  accionable (a diferencia de las `agendada` atrasadas, que sí tienen bloque).
- `use-visita-en-curso-cliente.ts` + `VisitaEnCursoModal`: solo avisan si la
  nueva visita es del **mismo cliente**.

Caso real: Comercial Prueba con 4 en curso (ARCELOR ×2, CNMC ×2) → dentro de una
de CNMC ve "Tienes 3 visitas abiertas sin cerrar." sin salida; en Hoy solo puede
abrir la de ARCELOR.

## Cambios

### 1. Modelo — "en curso" es una lista, sin día

- `agenda-del-dia.tsx`: añadir una query aparte `visitas-en-curso` que traiga
  **todas** las visitas del comercial con `estado_captura='en_curso'`
  (participante = yo, `estado in ('pendiente','aceptado')`), **sin filtro de
  fecha**. Ordenar por `fecha` desc (la más reciente arriba).
- `hoyEnCurso` pasa a alimentarse de esa query, no del filtrado por rango del
  día. El resto (`hoyPendientes`, `hoyHechas`) sigue igual, por rango.
- Quitar de `hoyEnCurso` cualquier visita que también esté en `hoyPendientes` /
  `hoyHechas` no hace falta: los estados son excluyentes.

### 2. Hoy — una fila por cada visita en curso

`bloque-ahora.tsx`:

- Si `enCurso.length === 1`: igual que ahora (tarjeta destacada + "Continuar visita").
- Si `enCurso.length > 1`: la tarjeta destacada es `enCurso[0]`, y **debajo**,
  dentro de la misma sección "Ahora", una `SeccionLista` con una `FilaNavegable`
  por cada visita restante:
  - `titulo` = nombre del cliente
  - `subtitulo` = objetivo (recortado a 1 línea) · si la visita no es de hoy,
    añadir "· abierta desde el {fechaCorta}"
  - `icono="reproducir"`, `tono="aviso"`, `chevron`
  - `onClick` → `onAbrir(v)` (navega a `/visita/:id`)
- Se elimina el texto "y N visitas más en curso" (queda cubierto por las filas).
- `AgendaDelDia` ya pasa `onAbrir={abrirVisita}`; añadir el `enCurso` completo
  (ya lo hace: `enCurso={hoyEnCurso}`).

### 3. Visita activa — el aviso siempre lleva a ellas

`visita-activa.tsx:1498-1535`:

- Mantener el aviso de una línea (tono sutil, `--ink-500`, icono `atencion`).
- `length === 1`: igual que ahora (texto "La de X del D sigue abierta." + chevron
  que navega a esa visita).
- `length > 1`: texto "Tienes N visitas abiertas sin cerrar." + **botón enlace
  "Ver"** (mismo estilo que el chevron actual: `color: var(--brand-600)`, sin
  caja) que hace `navigate('/hoy')` (donde ahora la sección "Ahora" las lista
  todas). El icono a la derecha es `chevron` en ambos casos.

### 4. Prevención — el modal salta con cualquier visita propia en curso

- `use-visita-en-curso-cliente.ts` → renombrar el concepto: nueva función
  `useVisitaPropiaEnCurso(comercialId)` que devuelve la visita en curso más
  reciente **del comercial** (cualquier cliente), o `null`. Query:
  `visita_participante` filtrado por `comercial_id`, `estado in
  ('pendiente','aceptado')`, `visita.estado_captura='en_curso'`, orden `fecha`
  desc, `limit 1`; devolver `{ id, objetivo, clienteNombre }`.
- Mantener también la comprobación por cliente donde ya se usa (repaso-cliente,
  planificar-visita, acciones-proyecto, alta-rapida-cliente): el aviso del mismo
  cliente es más específico y va primero. Si no hay del mismo cliente pero sí
  otra propia, mostrar igualmente `VisitaEnCursoModal` con el nombre del otro
  cliente en el título ("Ya tienes una visita en curso con {cliente}").
- `VisitaEnCursoModal`: sin cambios de API; ya recibe `clienteNombre` y
  `objetivo`. "Continuar esa visita" navega a la que devuelve el hook;
  "Empezar otra" sigue igual.

### 5. Salida — descartar una visita en curso vacía

- En la `FilaNavegable` de cada visita en curso (Hoy, punto 2) y en el aviso de
  visita activa cuando `length===1`, permitir **descartar** si la visita no tiene
  ninguna captura.
- "Vacía" = `previsualizar_borrado_visita` devuelve `num_fotos + num_audios +
  num_notas + num_hallazgos + num_oportunidades + num_proximos_pasos === 0`.
- Reutilizar `useBorrarVisita`. Como es vacía, saltarse la tarjeta de
  previsualización: `<ConfirmacionBorrado reversible={false}>` con texto "Esta
  visita no tiene nada anotado. Se elimina." → `confirmar()`.
- UX en la fila: patrón destructivo de la app — no un botón suelto. En la
  `FilaNavegable` usar `tono="riesgo"` + acción swipe "descartar" ya existente,
  **solo** si vacía; si tiene contenido, la fila solo navega (se cierra
  entrando y cerrando la visita como hoy).
- Si tras descartar `enCurso.length` baja a 1, la vista vuelve sola al layout de
  tarjeta única (deriva del estado, sin código extra).

## Qué NO se toca

- El flujo de cierre de visita (3 pantallas) para visitas con contenido.
- El "único slot" al arrancar desde `visita-activa` (comentario L540): se puede
  dejar como está; la prevención nueva (punto 4) es la que evita el apilado.
- Estados de `visita_participante`, RLS, RPCs (se reusa `eliminar_visita_completa`).

## Perfiles

- **Comercial:** entra a Hoy y ve TODAS sus visitas abiertas, las abre de una en
  una, y puede tirar las que abrió por error sin pelear con el cierre.
- **Director:** sin cambio (esto es vista propia del comercial; "Todas" de
  Dirección no lista "en curso" de otros de forma accionable, y no se añade).
- **Diseñador Apple:** una sola forma de "esto está a medias" en toda la app
  (fila `tono="aviso"` + "reproducir"); nada de contadores sin destino.

## Verificación

- `npm run typecheck && npm run lint && npm run build`.
- Chrome de pruebas (Comercial Prueba, 4 visitas en curso ya existentes):
  1. Hoy → sección "Ahora" muestra tarjeta + 3 filas; cada fila abre su visita.
  2. Dentro de una visita de CNMC → aviso "Tienes 3 visitas abiertas sin cerrar."
     + "Ver" lleva a Hoy.
  3. Descartar una de las 2 de CNMC (vacía) desde la fila → desaparece, quedan 3.
  4. En ARCELOR, "Iniciar visita ahora" con otra visita propia en curso → salta
     `VisitaEnCursoModal`.
  5. La visita de ARCELOR del 6-sept (día anterior) aparece ahora en "Ahora".
- Capturas de Hoy (varias en curso) y del aviso en visita activa.
- `graphify update .` al terminar.
