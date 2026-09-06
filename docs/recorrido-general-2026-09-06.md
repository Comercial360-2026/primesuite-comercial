# Recorrido general — PrimeNotes (2026-09-06)

Segundo recorrido, esta vez **pantalla por pantalla de toda la app** (no un
ciclo, todas). Cesar conduce en su navegador; por cada pantalla dice si
está bien o qué cambiar. Claude anota aquí y consulta el código solo cuando
hay que decidir un cambio.

**Método (2026-09-06, revisado):** Claude conduce en el Chrome de Cesar
(sesión Dirección), pantalla por pantalla siguiendo un **caso de uso real**
(alta de cliente → planificar → visita → capturar → cerrar → informe → …).
Sin capturas: se lee el DOM (texto). Por cada pantalla, **Claude dice
primero qué encuentra que NO tiene sentido**, luego Cesar comenta, y se
corrige antes de avanzar. Prioridad **A** (fricción real) / **B**
(incoherencia) / **C** (pulido).

**Principio rector (Cesar, 2026-09-06):** una app tiene que **hacer lo que
dice**, de la forma **más simple posible**, y **cumplir lo que el usuario
espera**. Un control cuyo texto no coincide con lo que hace, un punto muerto
donde el usuario se queda sin salida, o un flujo que pide más pasos de los
necesarios = bug, aunque el código "funcione". En cada pantalla, antes de
nada: ¿el botón/texto hace lo que promete? ¿hay algún punto sin salida?
¿se puede en menos pasos? Los casos límite (sin datos, sin red, sin
permisos, cliente/registro que no existe) se prevén, no se esperan.

## PROMPT DE ANÁLISIS DE PANTALLA (obligatorio ANTES de tocar cada pantalla)

No parchear. Se completa este análisis por escrito, se presenta a Cesar y
se espera su OK; sólo entonces se escribe código. Verde (typecheck + lint +
build) antes de dar nada por hecho.

### 0. Ficha
- Ruta y nombre.
- Para qué sirve (1 frase).
- Quién la usa, en qué rol, en qué momento y **contexto físico**.
- Qué viene a conseguir el usuario, y en cuántos toques debería.

### 1. Perfil — Comercial en la calle (usuario principal)
Contexto: de pie o sentado con el cliente delante, móvil en una mano, prisa,
ruido, a veces sin cobertura, a veces sin abrir la app en semanas, a veces
daltónico.
- ¿Qué ven mis ojos primero? ¿Es lo que más necesito?
- ¿Consigo lo que vengo a hacer en 1-2 toques?
- ¿Algo me obliga a parar (rellenar, elegir, leer) antes de lo que quiero?
- ¿Entiendo cada palabra y cada icono sin pensar? ¿Hay jerga?
- ¿Lo hago con una mano? ¿Los controles frecuentes caen en la **zona del
  pulgar** (tercio inferior)? ¿Los destructivos están lejos de ahí o piden
  confirmar? Área de toque ≥ 44 px. Reacción visible a cada toque.
- Si me interrumpen (llamada, cambio de app, pantalla bloqueada) o me
  equivoco, ¿pierdo trabajo? ¿Recupero el estado al volver?
- Sin cobertura: ¿funciona? ¿me lo dice claro? ¿se sincroniza solo luego?
- Permisos del sistema (cámara / micro / GPS): ¿se piden en contexto y con
  motivo? ¿la pantalla sigue siendo útil si los deniego?

### 2. Perfil — Director comercial (consume el resultado)
- ¿Esta pantalla produce lo que necesito después (informe, seguimiento,
  métricas)?
- ¿Puede quedarse algo importante sin registrar por descuido?
- ¿Hay fricción (campos de más, pasos) que haga que el comercial no lo apunte?
- ¿Lo que se captura es fiel y completo?

### 3. Perfil — Diseñador de producto (Apple / HIG)
- **Un solo foco** por pantalla. ¿Cuál es? ¿Algo compite con él?
- **Jerarquía visual**: lo importante grande y central; lo secundario,
  pequeño y al margen o plegado. ¿Está invertida?
- ¿Cada elemento gana su sitio, o hay ruido / datos que no tocan a este
  momento del flujo?
- **Patrones**: navegación, hojas, búsqueda con lupa, listas, segmentados…
  ¿son los de iOS y los del RESTO de esta app, o inventados aquí? Patrones
  de la casa a reutilizar: Buscador colapsable con lupa · HojaInferior ·
  Segmentado · FilaNavegable · boton-icono · menú "⋯" · ConfirmacionBorrado
  + FilaNavegable tono="riesgo" para borrar · plural() · capitalizarFrase.
- **Iconos**: estándar, reconocibles al instante; un concepto = un icono,
  sin reutilizar el mismo para dos cosas. Estilo Phosphor.
- **Color**: nada se comunica SOLO con color (usuario daltónico) — también
  forma, posición o texto.
- **Estados** vacío / carga / error: los tres cuidados. El vacío, ¿orienta
  o sólo informa?
- **Texto**: español, tono de la casa, frase capitalizada, sin mayúsculas
  gritadas, concordancia (plural()). Cada botón dice exactamente lo que hace.
- **Densidad**: ¿se puede quitar algo sin perder función?

### 4. Principio rector
- ¿El texto de cada control coincide con lo que hace?
- ¿Hay algún **punto muerto** (sin salida, "hazlo en otro sitio" y ahí acaba)?
- ¿Se puede en menos pasos / menos pantallas?
- **Casos límite, uno a uno**: sin datos, lista vacía, lista enorme, sin
  red, sin permisos, registro que no existe, nombre larguísimo, texto con
  acentos/emoji. ¿Qué pasa en cada uno? ¿Está previsto?

### 5. Consistencia / mantenimiento
- ¿Reutiliza componentes y patrones existentes, o inventa uno nuevo para
  algo ya resuelto? (genérico, no una solución por pantalla)
- Nomenclatura: un solo nombre por concepto, igual que en el resto.
- El ← / "volver": ¿lleva a donde el usuario espera?
- Si cambia qué hace la pantalla o su ayuda: entrada de `ayuda.ts` en el
  mismo commit.

### 6. Salida
- Por cada punto: CUMPLE / NO CUMPLE / N/A + una línea.
- Cambios propuestos, priorizados A / B / C.
- Qué se rehace, qué se conserva, qué se descarta.
- Presentar a Cesar → esperar OK → código → verde.

**Directriz global — iconos:** todos los iconos que se cambien pasan a ser
**modernos e intuitivos, estilo Apple / SF Symbols** (formas simples,
reconocibles al instante, peso óptico consistente).
→ **HECHO (`8e80f41`)**: el set pasa a `lucide-react`. `iconos.tsx` mapea
cada nombre en español a un componente de lucide; la API no cambia, ninguna
pantalla se toca. Pendiente: repasar sobre la marcha si algún nombre reusa
icono (p. ej. "Almacenamiento" y "Copia de seguridad" comparten `Database`;
"Actividad por comercial" y "Equipo" comparten `UsersRound`).

Estado del código al empezar: `feature/proyectos`, local, sin push, 130
commits sobre `main`, verde y limpio. Migraciones 99–101 en dev.

---

## Checklist de pantallas

Marcar cada una: `⬜ pendiente` · `✅ revisada, sin cambios` · `🔧 cambios anotados`.

### 1. Acceso
- ⬜ `/login` — inicio de sesión + "He perdido el acceso"
- ⬜ `/establecer-contrasena` — poner contraseña desde el enlace

### 2. El día
- ⬜ `/` — Hoy (agenda del día)
- ⬜ `/agenda` — Agenda (planificadas / atrasadas)
- ⬜ `/planificar` — Planificar una visita

### 3. Cliente
- ⬜ `/clientes` — Listado de clientes + buscador global
- ⬜ `/clientes/nuevo` — Alta rápida de cliente
- ⬜ `/clientes/:id` — Ficha de cliente
- ⬜ `/clientes/:id/proyectos/:id` — Ficha de proyecto
- ⬜ `/clientes/:id/repaso` — Repaso de cliente (antes de la visita)
- ⬜ `/deduplicacion` — Clientes duplicados (Dirección)

### 4. Visita
- ⬜ `/visita/:id` — Visita activa (captura)
- ⬜ `/visita/:id/planificada` — Detalle de visita planificada
- ⬜ `/visita/:id/cierre` — Cerrar visita
- ⬜ `/visita/:id/detalle` — Detalle de visita cerrada
- ⬜ `/capturas/:id` — Detalle de una captura (foto/nota/audio)

### 5. Elementos sueltos
- ⬜ `/hallazgos/:id` — Detalle de hallazgo
- ⬜ `/oportunidades/:id` — Detalle de oportunidad
- ⬜ `/proximos-pasos/:id` — Detalle de próximo paso
- ⬜ `/tareas` — Mis próximos pasos ("Pasos" en el menú)

### 6. Yo y ayuda
- ⬜ `/yo` — Yo (identidad, espacio, gestión, reportar problema, versión)
- ⬜ `/mi-espacio` — Mi espacio / consumo (segmentado Mis visitas / Por comercial)
- ⬜ `/ayuda` — Cómo funciona PrimeNotes (manual)

### 7. Dirección
- ⬜ `/comerciales` — Equipo (listado + peticiones de acceso)
- ⬜ `/comerciales/nuevo` — Alta de comercial
- ⬜ `/comerciales/:id` — Ficha de comercial (baja, traspaso de cartera)
- ⬜ `/actividad-comerciales` — Actividad por comercial (listado)
- ⬜ `/actividad-comerciales/:id` — Actividad de un comercial (por proyecto)
- ⬜ `/vocabulario` — Vocabulario (catálogo + pendientes)
- ⬜ `/solicitudes-reasignacion` — Solicitudes de ayuda
- ⬜ `/sectores` — Catálogo de sectores

---

## Hallazgos

_(formato: pantalla → [A/B/C] qué no tiene sentido → decisión)_

### `/visita/:id` — Visita activa (rediseño acordado 2026-09-06 · "lo hacemos todo")

Premisa: el comercial está delante del cliente, hablando; lo único que debe
mandar en pantalla son los botones de captura. Todo lo demás, a un toque
pero sin ocupar sitio.

- **B1 · Contexto compacto arriba.** El bloque "A qué vienes" (textarea +
  botones) y las dos filas grandes Interlocutores/Equipo ocupan media
  pantalla. → Objetivo en **1 línea** con lápiz; tocas y se abre para
  editar. Interlocutores y Equipo como **chips con nº** (`👤 2 · 👥 1`),
  tocar abre la hoja.
- **B2 · Zona escondida.** El campo "Zona" está entre el título y los
  botones y parece un paso obligatorio previo; no lo es (solo sirve si
  recorres instalaciones). → Detrás de un chip **"Marcar zonas / Recorrido"**;
  oculto por defecto (capturas → «General»); si la visita ya tiene zonas,
  arranca abierto. Al abrir, muestra el resumen por zona.
- **B3 · Las 6 capturas al mismo nivel.** Foto/Nota/Audio son botones
  grandes; Hallazgo/Oportunidad/Próximo paso son chips pequeños → parecen
  "de segunda" cuando valen más para el negocio. → rejilla 2×3 de 6 botones
  iguales. ⚠️ Choca con la regla "nunca rejilla de botones idénticos"
  ([[primesuite-modelo-ui-reglas]]) — Cesar acepta romperla aquí.
- **B4 · Dictado voz→texto en Nota.** Escribir en el móvil delante del
  cliente queda mal. → botón de micrófono en la hoja de Nota
  (`SpeechRecognition`; si el navegador no lo soporta, no aparece).
- **B5 · Recordatorio durante la visita.** El aviso "antes de cerrar" llega
  tarde. → ampliar: avisar si no hay ningún próximo paso / ninguna
  oportunidad apuntada.
- **B6 · Interlocutor rápido.** Añadir uno pide nombre + cargo + rol en
  mitad de una conversación. → alta con **solo el nombre**; el resto luego.
- **B7 · Rotular la foto en el momento** (baja prioridad). 8 fotos y luego
  no sabes cuál es cuál. → la hoja de Foto muestra la zona y hace el título
  más visible.

Progreso:
- **B1 ✅** contexto compacto (objetivo 1 línea + chips interlocutores/equipo).
- **B2 ✅** zona escondida tras "Marcar zonas".
- **B3 ✅** 6 capturas iguales, rejilla 2×3.
- **B4 ✅** dictado voz→texto en la nota (`useDictado`).
- **B5 ✅** aviso "Antes de cerrar" ampliado: sin próximo paso / sin oportunidad.
- **B6 ✅** ya cumplía — el alta de interlocutor pide solo el nombre.
- **B7** (rotular foto en el momento) — pendiente, baja prioridad; la hoja de Foto ya pide título.
Verde (typecheck/lint/build). ayuda.ts al día. Verificado en vivo: B1-B4.

> **Nota (2026-09-06):** Cesar paró el rediseño B1-B3 por ser *parcheo*. Se
> conservan **B3** (6 capturas iguales), **B4** (dictado en Nota) y **B5**
> (aviso de cierre). **B1** (chips Interlocutores/Equipo) y **B2** (chip
> "Marcar zonas") se rehacen desde el análisis formal de abajo, no por
> retoques sueltos.

---

#### Análisis formal (prompt maestro) — 2026-09-06

Revisado: `visita-activa.tsx`, `hallazgo-rapido-hoja.tsx`, `selector-termino.tsx`,
`buscador.tsx`, `iconos.tsx`, `components.css`, `cierre-visita.tsx`.

**0. Ficha.** `/visita/:visitaId` — Visita activa (captura). Sirve para
capturar en caliente todo lo de una visita en curso (foto/nota/audio/
hallazgo/oportunidad/próximo paso) y cerrarla. La usa el comercial de pie
frente al cliente, con prisa, a veces sin cobertura; también un 2.º
comercial del equipo sobre la misma visita. Objetivo: dejar registrada una
cosa concreta en **1 toque + 1**.

**1. Comercial en la calle**
- ❌ Lo primero que se ve NO es lo que más necesita: contexto (nº visita,
  objetivo, chips, label, "Marcar zonas") empuja la rejilla de captura a
  media pantalla.
- ✅ 1-2 toques para capturar.
- ⚠️ "Marcar zonas" + microcopy parecen paso previo aunque no lo son.
- ❌ Iconos/jerga: "Zona/Recorrido/General" sin explicar; **Hallazgo usa la
  lupa** (`MagnifyingGlass`), el mismo glifo que "buscar" en toda la app.
- ❌ Zona del pulgar: **"Cerrar visita"** ocupa el sitio más alcanzable
  (fijo abajo, ancho, `btn-primary`, sin confirmación aquí); la captura,
  que se repite 20 veces, está en el scroll. **Chips-control a 32px** (<44).
- ✅ Interrupción/errores: cola offline, `flushSync`, timeslice audio,
  parada limpia al bloquear pantalla.
- ⚠️ Sin cobertura: captura OK, pero **objetivo no editable hasta
  sincronizar** ("Guardando…" sin fin).
- ✅ Permisos cámara/micro/GPS en contexto y con mensaje.

**2. Director comercial**
- ✅ Produce lo que se necesita después.
- ❌ Puede quedarse algo sin registrar: el recordatorio "sin oportunidad /
  sin próximo paso" **solo está en `/cierre`** (llega tarde). El commit
  "B5" tocó `cierre-visita.tsx`, no esta pantalla.
- ⚠️ Fricción: el selector de término no usa el buscador de la casa.
- ❌ Fidelidad/completitud: **las fotos de un compañero no se listan** en
  "En esta visita" (sí el resto de sus capturas).

**3. Diseñador Apple / HIG**
- ❌ Un solo foco: la rejilla de captura compite con contexto arriba y
  "Cerrar visita" abajo.
- ❌ Jerarquía **invertida**: secundario arriba y fijo, principal en medio
  del scroll, final del flujo con el sitio de honor.
- ⚠️ Ruido: microcopy de zona apila hasta 4 líneas de ayuda.
- ❌ Patrones: buscador de término = `<input className="field">` pelado, no
  el `Buscador` colapsable con lupa. Chips usados como navegación, no filtro.
- ❌ Iconos: `hallazgo: MagnifyingGlass` y `BotonBuscar` renderiza
  `<Icono nombre="hallazgo">` → un glifo, dos conceptos.
- ✅ Color: cada tipo por icono + texto; estado de sync en texto.
- ⚠️ Estados: error/carga OK; el vacío informa pero no orienta.
- ✅ Texto: español, frase capitalizada, botones dicen lo que hacen.
- ⚠️ Densidad: se puede plegar contexto y comprimir microcopy de zona.
- ⚠️ Rejilla de 6 idénticos (rompe regla 3 a propósito): no distingue
  captura en caliente (1 gesto) de la que abre formulario.

**4. Principio rector**
- ✅ Texto de controles coincide con lo que hacen (salvo el **icono** de
  Hallazgo).
- ⚠️ Punto muerto temporal: objetivo no editable hasta sync, sin indicar
  cuándo. Navegación ← correcta (`-1` con fallback a `/`).
- ⚠️ Menos pasos: el aviso de oportunidad/paso obliga a llegar a `/cierre`.
- Casos límite: vacío no orienta (C); lista enorme sin virtualizar
  (aceptable); sin red cubierto salvo objetivo; permisos con mensaje;
  GPS denegado → foto sin coords, documentado; **`SelectorTermino` no
  normaliza acentos** (C).

**5. Consistencia**
- ⚠️ Reutiliza casi todo; excepción: búsqueda de término no usa `Buscador`.
- ⚠️ "zona/recorrido/General" sin glosario en pantalla ni ayuda enlazada
  del concepto.
- ✅ ← correcto.
- `ayuda.ts`: existe `visita-activa`; al rehacer, actualizar + añadir
  cobertura del concepto zona **en el mismo commit**.

**Verificado después (no estaba en el 1.er pase):**
- ❌ **`visita-activa.tsx` NO comprueba `estado_captura` en ningún sitio.**
  Si un compañero cierra la visita, o se retoma una ya `consolidada`, la
  pantalla sigue en modo captura; lo capturado entra/falla tras el informe.
- ❌ **Varias visitas en curso a la vez:** `visitaEnCurso` es un único slot;
  arrancar otra deja la anterior huérfana (`en_curso` sin banner).
- ⚠️ **Objetivo, edición concurrente:** `update` pisa; `objetivoBorrador`
  solo se inicializa una vez (`=== null`), no re-sincroniza.
- ⚠️ **La zona se estampa al *guardar*, no al *capturar*:** cambiar de zona
  mientras pones el título mete la captura anterior en la zona nueva.
- ⚠️ **Botones `disabled` sin motivo visible** cuando el pozo de equipo
  está lleno (`espacioBloqueado`): el mensaje solo sale si logras pulsar.
- ⚠️ `visitaLocal` en carga: ventana async sin spinner donde "Próximo
  paso"/"Interlocutores" no abren (hay fallback a Supabase → C).
- ⚠️ a11y: en `CapturasPorUbicacion` las filas son `<div onClick>` (sin
  rol ni foco por teclado); en la vista "por tipo" sí son `<button>`.

**6. Salida — cambios**

*A0 — bloqueantes (van primero)*
- **A0.1** Guarda de `estado_captura`. Si `consolidada`: bloquear captura,
  mostrar "esta visita ya está cerrada" + enlace al detalle. El query del
  estado sondea (≤20 s) para detectar cierre por compañero.
- **A0.2** Aviso no bloqueante si el comercial tiene otra visita `en_curso`
  distinta de esta ("Tienes otra visita abierta · ver").

*A — fricción real*
- **A1** "Cerrar visita" **al final del scroll**, tras "En esta visita" (deja
  de ser fijo; cerrar obliga a pasar por el resumen). ← decidido.
- **A2** Enderezar jerarquía: rejilla de captura como primer bloque;
  contexto (nº visita, objetivo, chips) plegado debajo o a la cabecera.
- **A3** Icono de Hallazgo ≠ lupa: `hallazgo` pasa a otro glifo; `BotonBuscar`
  usa un `buscar: MagnifyingGlass` propio. Toca `iconos.tsx` (global).
- **A4** Chips-control a 44px (Interlocutores, Equipo, Marcar zonas) o
  convertirlos en `boton-icono`/fila.

*B — incoherencia*
- **B1** Introducir el concepto zona/recorrido: `<AyudaNota>` + entrada en
  `ayuda.ts`, o renombrar el chip a algo autoexplicativo.
- **B2** Recordatorio **en vivo** (lo que "B5" no llegó a hacer): en "En
  esta visita", si tras N capturas no hay oportunidad ni próximo paso,
  línea suave. No esperar a `/cierre`.
- **B3** `SelectorTermino` con el patrón `Buscador` de la casa (o al menos
  la lupa). Afecta también a Detalle de Oportunidad.
- **B4** Fotos de compañeros en "En esta visita": listarlas o justificar
  en código por qué no.
- **B5** Objetivo: `update` con `count`/reconciliación y re-sincronizar
  `objetivoBorrador` si cambia en servidor.
- **B6** Estampar la zona en el **momento de capturar**, no de guardar.
- **B7** Botones de captura: motivo visible cuando el pozo está lleno (no
  solo `disabled`).

*C — pulido*
- **C1** Estado vacío que oriente ("Toca Foto, Nota o Audio para empezar").
- **C2** Rejilla de 6: separar 3 (en caliente) + 3 (con hoja) por un hueco,
  sin volver a dos pesos.
- **C3** Comprimir el microcopy de zona.
- **C4** `SelectorTermino`: normalizar acentos en la búsqueda.
- **C5** `visitaLocal` en carga: spinner / deshabilitar las hojas que lo
  necesitan con feedback.
- **C6** a11y: filas de `CapturasPorUbicacion` como `<button>`.
- **B7-doc** Rotular la foto en el momento (mostrar zona + peso al título
  en la hoja de Foto). ← entra en este pase (decidido).

*Rehace / conserva / descarta*
- **Conserva:** dictado en Nota (B4); 6 capturas al mismo nivel como base
  (pendiente C2); lista fundida "En esta visita" con contador + estado de
  sync únicos; visor de fotos a pantalla completa; cola offline.
- **Rehace:** colocación y peso de "Cerrar visita" (A1); jerarquía vertical
  (A2); forma de los chips Interlocutores/Equipo/"Marcar zonas" (A4);
  introducción del concepto zona (B1).
- **Descarta:** el "aviso B5" tal como quedó (solo en `/cierre`) — se
  sustituye por el recordatorio en vivo (B2).
- **Global:** el cambio del icono `hallazgo` (A3) se hace en `iconos.tsx`.

Estado: análisis cerrado y aprobado por Cesar (2026-09-06). Orden de
trabajo: A0 → A → B → C. Verde (typecheck/lint/build) entre tandas;
`ayuda.ts` al día en el mismo commit que el cambio que la afecte.

### `/` — Hoy

- **[A] El botón "+" miente.** `aria-label`/`title` = "Empezar visita sin
  planificar", pero al pulsarlo hace `navigate('/clientes')` — te lleva al
  listado de clientes, no empieza ninguna visita. Y usa el icono `mas`
  (crear/añadir), que aquí no añade nada.
- **[B] Dos iconos de calendario casi iguales.** `hoy` (calendario+check,
  cabecera/nav) y `agenda` (calendario+rayitas, atajo a `/agenda`) no se
  distinguen a 18-20 px. El de agenda va suelto a la derecha de los
  filtros, sin etiqueta — no se lee como "ver agenda completa".
- **[C] Estado vacío sin acción.** "No tienes visitas para hoy." y nada
  más. Un usuario nuevo aterriza aquí sin una CTA ("planifica tu primera
  visita").
- **[A] El "+" → ✅ HECHO** (`~commit Nueva visita`). El "+" de Hoy abre
  `/planificar`, renombrada **"Nueva visita"**, con selector **¿Cuándo?
  Ahora / Otro día**. "Ahora" pide solo objetivo y arranca la visita en
  curso; "Otro día" = fecha/hora/franja/[para quién] → agendada. Junta las
  dos vías que estaban dispersas.
- **[B] dos calendarios / [C] estado vacío → pendientes.** Cesar: si no
  molestan, se dejan. (Sin decisión aún — no bloquean.)
- **Iconos → ✅ set entero a Phosphor** (`8e80f41` lucide, sustituido por
  Phosphor + tab bar iOS: sección activa con icono relleno). El "+" ya es
  el de Apple, no se toca.
