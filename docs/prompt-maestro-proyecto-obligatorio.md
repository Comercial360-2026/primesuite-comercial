# Prompt maestro — proyecto obligatorio y explícito (fin de «General»)

**Rama:** `feature/proyectos`. **Fecha:** 2026-09-07. Decidido con Cesar tras
implementar los 11 flecos: el modelo de «proyecto General oculto» despista
—si no lo entiende quien lo programa, menos un comercial—. Se sustituye por
una jerarquía **estricta y visible desde el minuto uno**.

## Modelo

**Cliente → 1..N Proyectos → 1..N Visitas.** Sin excepciones, sin entes
ocultos, sin actividad «suelta».

- Al **dar de alta un cliente**, el comercial mete **nombre de cliente + nombre
  del primer proyecto** (dos campos en el mismo formulario). No hay cliente sin
  proyecto.
- Toda **visita / oportunidad / hallazgo / próximo paso** cuelga de un proyecto
  concreto, siempre.
- Cuando el cliente tiene **un solo proyecto**: no se pide elegir nada al
  crear visitas (se usa ese). El proyecto **se muestra como fila** en la ficha
  de cliente (coherencia: "diferenciados desde el minuto uno"), navegable a su
  ficha.
- Con **2+ proyectos**: lista «Proyectos», y al iniciar/planificar una visita
  se pregunta a cuál (selector ya hecho en `ObjetivoVisitaModal` /
  `planificar-visita`).
- Mover visita entre proyectos, renombrar, pausar/terminar, borrar: ya
  construido (RPCs `mover_visita_de_proyecto`, `eliminar_proyecto`; migración
  101). Al borrar un proyecto, su actividad **debe ir a otro proyecto elegido**
  (ya no hay «General» al que caer) — o bloquear el borrado del último
  proyecto de un cliente.

## Qué se quita (revierte trabajo de esta sesión)

- **`proyecto.es_general`**: columna y concepto fuera. `fn_crear_proyecto_general`
  y su trigger, fuera. Los triggers `fn_set_proyecto_id_*` que asignaban al
  General: una visita se crea siempre con `proyecto_id` explícito.
- **Ficha de cliente**: se quita el bloque inline «Sin proyecto asignado»
  (`ActividadProyecto` con `etiquetaGrupo`) y la fusión ficha-cliente↔ficha-
  proyecto. Con 1 proyecto = una fila; su actividad se ve entrando en él.
- **`ficha-proyecto.tsx`**: fuera el `<Navigate>` por `es_general` (P8).
- **Textos**: la palabra «General» / «Sin proyecto asignado» desaparece de
  todo — ya no existe el concepto, no hay que "barrerlo" (P10 se simplifica).
- `ObjetivoVisitaModal` / `AccionesProyecto` / `use-proyectos-cliente` /
  `actividad-proyecto`: fuera las ramas `es_general`.

## Qué sobrevive intacto

- **Historial de la ficha de cliente = TODAS las visitas del cliente**, con
  etiqueta del proyecto en cada fila (`historialClienteId` en
  `ActividadProyecto`). Sigue valiendo: la ficha de cliente es la vista "todo",
  cada proyecto es una carpeta.
- **«Terminado» = solo consulta** (plegado tras «Ver terminados», ficha sin
  barra, fuera de selectores). Reabrir.
- **P7b** — puerta al «Terminar» (visitas planificadas/en curso: mover o
  cancelar; en curso de otro comercial bloquea; oportunidades abiertas =
  aviso). PENDIENTE de implementar.
- **Todo el sub-proyecto "visitas sin cerrar"** (independiente de esto):
  - migración 102 (`visita.en_curso_desde` + trigger; cron de auto-cierre a
    48h DESPROGRAMADO — una visita solo la cierra el comercial).
  - aviso al arrancar y banner con proyecto + «abierta hace…»; aviso por
    proyecto (mismo → para; otro proyecto → aviso suave sin fricción); línea
    «N visita(s) sin cerrar — ábrela» en ficha de cliente y proyecto.
  - PENDIENTE: Hoy «En curso»/«También en curso» con proyecto + «abierta
    desde» + Cerrar/Descartar por fila + tono creciente.

## Migración de datos (una vez)

Cada cliente tiene hoy exactamente 1 proyecto `es_general` con toda su
actividad. La migración:
1. `update proyecto set nombre = <?>, es_general = false where es_general` —
   nombre: **decidir** (nombre del cliente / «Actividad general» / pedir a
   Dirección que los renombre). Las ~11k filas de actividad NO se mueven,
   siguen apuntando a ese `proyecto_id`.
2. Quitar `es_general` (columna, default, CHECK si lo hay) y
   `fn_crear_proyecto_general` + trigger.
3. Alta de cliente: RPC/flow que cree cliente + primer proyecto en una
   transacción, con nombre de proyecto obligatorio.

## Pendiente global tras esto

Este replanteo → P7b (puerta Terminar) → P9 (campo «Proyecto» editable en
detalle de visita) → Hoy visitas sin cerrar → P11 (ayuda `ayuda.ts`).

Supabase dev = `umrjzvpbcpzzqmkjahhn`. Migraciones **101 y 102 aplicadas**.
Rama `feature/proyectos`, ~22 commits, **TODO EN LOCAL, sin push**.
