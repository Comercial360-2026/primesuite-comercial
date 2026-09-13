# Prompt maestro 06 — «visitas sin cerrar»

**Rama:** `feature/proyectos`. **Fecha:** 2026-09-07. Todo local, sin push.
Sin migración.

## Clase del bug

Aviso de «N visitas sin cerrar / abiertas» que **navega fuera** (a Hoy con
2+, a otra visita con 1) en vez de **desplegar la lista donde estás**. Y no
había un sitio para cerrar/descartar todas las visitas colgadas de una tacada.

### Sitios (barrido)

| # | Sitio | Antes | Ahora |
| --- | --- | --- | --- |
| 1 | `visita-activa.tsx` — banner «otra visita abierta» | 1 → `/visita/:id` · 2+ → `/` (Hoy) | botón «Ver» → **panel** en sitio, nunca navega |
| 2 | `aviso-visitas-sin-cerrar.tsx` (ficha-cliente / ficha-proyecto) | 1 → `/visita/:id` · 2+ → `/` (Hoy) | 1 → esa visita (directo) · 2+ → **panel** |
| 3 | `acciones-proyecto.tsx` — «Tienes otra visita abierta en {proyecto}» · «Abrir» | → `/visita/:id` | **se deja**: es una visita concreta, botón «Abrir», y está en la barra de la ficha, no dentro de una visita en curso |
| 4 | `cierre-visita.tsx` — ← de «Cerrar visita» | `navigate('/visita/:id')` fijo | `useVolverA('/visita/:id')` — respeta de dónde se llegó (regla #14) |

## Decisiones (Cesar, 2026-09-07)

- **N=1**: el aviso lleva **directo** a esa visita. Panel solo con 2+.
- **Tono por antigüedad** (`src/lib/tono-antiguedad.ts`, un solo sitio):
  `<24 h → neutral` · `24 h–3 d → aviso` · `>3 d → riesgo`. Barra de color a la
  izquierda de la fila + texto plano («abierta hace X»).
- **Un solo componente de fila** (`FilaVisitaAbierta`) y **un solo panel**
  (`PanelVisitasAbiertas`), compartidos por visita-activa, ficha-cliente,
  ficha-proyecto y Hoy.
- **El panel deja Cerrar/Descartar desde dentro**, no solo saltar. Un sitio
  para despachar todas las visitas colgadas.
- **Visitas de otro comercial**: en el panel de la ficha (que no filtra por
  comercial) se ven **sin botones** — «en curso de {X} · no puedes cerrarla».
- **Sin conexión**: Cerrar y Descartar **desactivados** con nota, no fallo
  silencioso.
- **Cerrar** = `navigate('/visita/:id/cierre', { state: desde(location) })` —
  cerrar es un flujo con resumen, no un UPDATE suelto. El ← del cierre vuelve
  a donde se pulsó.
- **Descartar** = `useBorrarVisita` + `ConfirmarBorradoVisita` (el mismo de
  Hoy: dice qué se pierde si la visita tiene contenido).
- **Orden**: más antigua primero (la que más urge, arriba).
- **Panel largo**: `max-height: 60vh` + scroll. Nada de «cerrar/descartar
  todas».
- **Contador**: `useBorrarVisita` invalida `['visitas-sin-cerrar']` →
  al descartar/cerrar el aviso y el panel se actualizan; si llega a 0
  desaparecen.
- **No filtrar por «hoy»**: `useVisitasSinCerrar` y `otras-visitas-en-curso`
  ya traen todas las `en_curso`, sea de hoy o de días pasados.
- **Texto banner** (visita-activa, 2+): «Tienes N visitas abiertas sin
  cerrar.» a secas; el detalle en el panel.
- **Hoy** «También en curso»: la 1ª sigue en la tarjeta grande
  (`bloque-ahora`), el resto como `FilaVisitaAbierta`. Nada de swipe ni menú
  «⋯»: Cerrar/Descartar visibles.

## Archivos

| Archivo | Qué |
| --- | --- |
| `src/lib/tono-antiguedad.ts` | nuevo — `tonoPorAntiguedad(desde)` |
| `src/features/visita/fila-visita-abierta.tsx` | nuevo — fila con Cerrar/Descartar + barra de tono |
| `src/features/visita/panel-visitas-abiertas.tsx` | nuevo — `<Modal>` + lista de filas + borrado inline |
| `src/hooks/use-visitas-sin-cerrar.ts` | + `lista` (cliente, proyecto, desde, esMía, responsable) + arg `comercialId` |
| `src/features/visita/aviso-visitas-sin-cerrar.tsx` | N=1 directo · 2+ abre panel |
| `src/features/visita/visita-activa.tsx` | banner abre panel; texto a secas |
| `src/features/hoy/agenda-del-dia.tsx` | «También en curso» → `FilaVisitaAbierta`; +`en_curso_desde`/`proyecto` en la query |
| `src/hooks/use-borrar-visita.ts` | invalida `['visitas-sin-cerrar']` |
| `src/features/visita/cierre-visita.tsx` | ← con `useVolverA` |
| `src/lib/ayuda.ts` | `hoy` y `visita-activa` mencionan el panel / Cerrar-Descartar |

## Verificación (hecha en Chrome, sesión Comercial Prueba, 5 visitas en curso)

- ✅ Hoy «También en curso»: filas con Cerrar/Descartar; ARCELOR «abierta ayer»
  con barra ámbar, el resto neutra.
- ✅ Dentro de una visita en curso → banner «Tienes 5 visitas abiertas sin
  cerrar.» → «Ver» → panel, **sin cambiar de URL**; más antigua arriba.
- ✅ Descartar en el panel → `ConfirmarBorradoVisita` inline → Cancelar.
- ✅ Cerrar en el panel → `/visita/:id/cierre`; ← vuelve a la visita en curso
  de origen, no a la del cierre.
- ✅ Ficha de cliente con 1 sin cerrar → «Abrir» va directo a esa visita.
- ✅ `typecheck` · `lint` · `build`.

Pendiente de probar con datos: panel de ficha con 2+ en el mismo cliente;
visita de otro comercial en el panel (sin botones); offline.

## Pendiente aparte (no en esta tanda)

- **Prevención**: al arrancar otra visita teniendo una abierta —aunque sea de
  otro cliente— avisar y ofrecer cerrar la anterior. Hoy `visita-en-curso-modal`
  solo salta con el mismo cliente. Toca `acciones-proyecto` / `alta-rapida` /
  `repaso-cliente`.
- **Informe**: portada del PDF de visita con proyecto + cliente; y un PDF
  **de proyecto** con sus 1..N visitas.
