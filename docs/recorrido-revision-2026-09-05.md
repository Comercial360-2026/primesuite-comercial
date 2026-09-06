# Recorrido de revisión — PrimeNotes (2026-09-05)

Recorrido en solitario, haciendo de comercial (sesión de Borja Senra) el
ciclo completo: Hoy → alta de cliente → visita en curso (nota, hallazgo,
oportunidad, próximo paso, zona) → cierre → informe → detalle de visita
cerrada → Tareas → Yo → Ayuda → Agenda → ficha de cliente/proyecto.

Formato: cada punto es **pendiente** hasta que lo revisemos y decidamos
si se cambia. No se ha tocado nada de código.

Escala de prioridad orientativa:
- **A** = hueco de producto o fricción real en el uso diario.
- **B** = incoherencia o roce que conviene arreglar.
- **C** = detalle menor / pulido.

---

## 1. Hallazgos estructurales (los que más pesan)

### 1.1 — [A] No hay dónde rellenar los datos del cliente — ✅ RESUELTO (commit pendiente)
El modelo solo tiene 3 campos "de después": Sector, Tamaño, Ubicación
general (no hay teléfono/web/CIF, nunca los hubo). El lado de lectura
existía pero no había editor → siempre vacíos, y salen en la cabecera de
cada informe PDF.
**Hecho:** chip "Editar datos" en la ficha de cliente (Nombre + Sector +
Tamaño + Ubicación general), para el comercial responsable o Dirección
(requiere conexión, es un UPDATE directo). Sector = desplegable de un
catálogo nuevo (`sector`, migración 97, semilla de 8) que Dirección
gestiona en **Yo → Gestión → Sectores** (añadir / renombrar / quitar-
ocultar). Tamaño = Pequeña/Mediana/Grande fijo. Verificado en vivo como
comercial (Borja): guardar sector/tamaño/ubicación y que salga en "Datos"
y en la cabecera.

### 1.x — [B] El estado "borrador" del cliente — ✅ RESUELTO (mismo commit)
`estado_relacion` se ponía a 'borrador' en TODOS los clientes y nada lo
cambiaba ni lo leía. Estaba muerto. Quitado de la cabecera de la ficha
(el campo sigue en la BD por si se le da uso algún día). Verificado: la
cabecera ya solo muestra el sector si lo hay.

### 1.2 — [A] Los interlocutores del cliente no viven en ningún sitio estable — ✅ RESUELTO
El directorio (personas de contacto del cliente) solo se gestionaba
dentro de una visita. **Hecho:** se extrajo el CRUD a un componente
compartido `DirectorioInterlocutores` (alta/edición/quitar), y ahora hay
una sección **"Interlocutores"** en la ficha de cliente (cualquiera que
vea la ficha; requiere conexión). La hoja de Interlocutores de la visita
sigue igual — es el mismo componente + la capa de "quién estuvo presente
en esta visita". Verificado en vivo: alta desde la ficha, y presencia +
"Editar" + nombre en Zona 1 desde la visita, sin regresiones ni errores
de consola.

### 1.3 — [A] Un comercial sin cartera se queda sin app — ✅ RESUELTO (opción 2)
Cesar eligió: la lista sigue mostrando tu cartera por defecto, pero **el
buscador encuentra CUALQUIER cliente** de la empresa (cubrir a un
compañero, comprobar antes de crear). No hace falta migración — la RLS de
`cliente` ya permite leer cualquiera. **Hecho** en `listado-clientes.tsx`:
al buscar se ignora el filtro de cartera; estado vacío nuevo ("Todavía no
tienes clientes en tu cartera. Crea uno con «+», o usa el buscador para
encontrar cualquier cliente."). `ayuda.ts` de `clientes` actualizada.
Verificado en vivo: Borja (sin cartera) busca "MADRID" y encuentra MADRID
DIGITAL (cartera de otro).
**El bug de duplicados NO existía:** el chequeo de "ya existe parecido" del
alta ya consulta TODOS los clientes (comprobado en el código, `alta-rapida-
cliente.tsx` no filtra por responsable). En el recorrido no saltó porque
el nombre era único, no por estar limitado a la cartera.
La ficha de un cliente ajeno **no se pone en solo lectura**: el modelo ya
permite a propósito que cualquier comercial trabaje el cliente de otro;
"Borrar cliente" y "Editar datos" ya tienen su propio candado
(creador/responsable/Dirección).

### 1.4 — [A] Planificar una visita no tiene camino directo — ✅ RESUELTO (camino completo)
Cesar eligió el flujo único. **Hecho:** nueva pantalla `/planificar`
(`planificar-visita.tsx`): cliente (buscador, cualquiera) → proyecto (solo
si tiene más de uno; con el General a secas se salta) → fecha + objetivo +
hora/franja + [Para otro comercial, si Dirección] → guarda y vuelve a la
Agenda. Un solo componente:
- **Agenda "+"** → `/planificar` (antes: buscador en línea que te dejaba en
  la ficha del cliente — código retirado).
- **Ficha de proyecto "Planificar para otro día"** → `/planificar?clienteId=
  &proyectoId=` (panel inline de ~100 líneas retirado, con su estado y su
  `?planificar=1`).
- **Alta rápida "Guardar y planificar visita"** → mismo `/planificar?…`.
- Texto del estado vacío de Agenda corregido: "Toca «+» para planificar una".
Verificado en vivo end-to-end como comercial: Agenda + → busca MADRID
DIGITAL (de otro) → forma → Planificar → aparece en la Agenda con fecha,
objetivo y franja correctos. Sin errores de consola.

### 1.5 — [B] El "Proyecto General" sigue costando un nivel de navegación — ✅ RESUELTO (fundir)
Para un cliente con un solo proyecto (el General, P9), la ficha de
cliente y la ficha de proyecto eran casi lo mismo, pero había que pasar
por las dos. **Hecho:** cuando el cliente solo tiene su Proyecto General,
su actividad (Oportunidades activas / Próximos pasos / Hallazgos /
Historial) se muestra **dentro de la propia ficha de cliente**, con la
barra "Iniciar visita ahora" + "Planificar para otro día" abajo. En
cuanto se crea un 2º proyecto, reaparece la lista "Proyectos" y cada uno
tiene su ficha. La ruta directa al General único (`/clientes/:id/
proyectos/:generalId`, p. ej. desde "Actividad por comercial") redirige a
la ficha de cliente. Componentes compartidos nuevos `ActividadProyecto` y
`AccionesProyecto` (la ficha de proyecto es ahora una cáscara sobre
ellos); consulta única `useProyectosCliente` para las dos pantallas — así
"cuántos proyectos hay" es un solo dato y basta invalidarlo al crear uno.
De paso: "última hace hace X" → "última hace X" en la línea de contexto
del proyecto. `ayuda.ts` (`ficha-cliente`, `ficha-proyecto`) actualizada.
Verificado en vivo como comercial (Borja): General único fundido, URL del
General redirige, crear 2º proyecto devuelve la lista y su ficha, el
General con 2 proyectos ya no redirige.

### 1.6 — [B] La "banda de visita en curso" ocupa una fila fija en TODAS las pantallas — ✅ RESUELTO
Mientras hay una visita abierta, el banner "Visita en curso con
[cliente]" se pegaba abajo en cada pantalla, incluida la propia visita
(redundante con su cabecera "Visita en curso") y la pantalla de "Visita
consolidada correctamente" (contradictorio: la visita ya no está en
curso).
**Hecho:**
- `LayoutShell` oculta el banner cuando estás dentro de la propia visita
  en curso (`/visita/:id` y sus subrutas, incluido el cierre) — ahí la
  cabecera ya lo dice y el banner solo robaba una fila.
- `cierre-visita.tsx` limpia el contexto (`cerrarVisita()`) al consolidar,
  no al pulsar "volver" — así el banner desaparece ya en la pantalla de
  resumen / "consolidada correctamente".
- En el resto de pantallas (Hoy, Clientes, fichas, detalles, Tareas) el
  banner se mantiene: ahí SÍ es útil, es el camino de vuelta a la visita.
Lo de "tapa contenido en el detalle de una oportunidad" era el banner
comiéndose 40 px de alto; con scroll el contenido era accesible y, fuera
de la visita, el banner se queda a propósito. Verificado en vivo como
comercial (Borja): visita iniciada sin banner dentro, con banner en
Clientes, sin banner en el resumen tras consolidar.

---

## 2. Por pantalla

### Hoy
- [C] Vacío: "No tienes visitas para hoy." sin siguiente paso (¿planificar?
  ¿ver agenda?).
- [C] Iconos de cabecera ("+" y calendario) sin etiqueta ni tooltip —
  hay que pulsarlos para saber qué hacen.
- [C] "Hecho hoy" es una sección plegable incluso con una sola visita —
  arranca mostrando "ocultar"; el plegado sobra si hay 0-1 filas.

### Nuevo cliente
- [C] Sin control de duplicados visible al escribir (la memoria dice que
  lo hay; quizá también limitado a la cartera del comercial → se podría
  crear un duplicado de un cliente de un compañero sin aviso).
- [B] La barra de navegación inferior sigue visible en el formulario;
  tocar "Clientes/Hoy" a media alta pierde lo escrito sin avisar.

### Visita en curso
- [A] La lista "En esta visita" se trunca a ~3 filas al pie — ✅ RESUELTO
  (parcial). Estaba dentro de una `.card` con fondo y borde: parecía una
  caja con su propio scroll y solo se veían 3 filas. Ahora la lista fluye
  en el scroll de la pantalla (sin tarjeta), y el contador + estado de
  sincronización van en su propia línea bajo el título. El layout de fondo
  (`screen--split` con "Cerrar visita" fijo abajo) no se rediseña: en un
  móvil corto la lista sigue quedando en poco espacio, pero ya se entiende
  que el scroll es el de la página.
- [B] Inconsistencia de patrón de captura: Foto/Nota/Audio **en línea** vs
  Hallazgo/Oportunidad/Próximo paso **modal a pantalla completa** — ✅
  RESUELTO. Cesar eligió unificar. Ahora las SEIS capturas (Foto, Nota,
  Audio, Hallazgo, Oportunidad, Próximo paso) abren la misma **hoja
  inferior** (`HojaInferior`, la que ya usaban Interlocutores y Equipo):
  sube desde abajo, con manija, se centra en escritorio. Mismo gesto, mismo
  comportamiento. El `Modal` centrado se queda solo para diálogos de
  decisión ("¿A qué vas?", "ya tienes una visita en curso"). Foto/Audio:
  cerrar la hoja sin guardar descarta el binario (igual que "Descartar").
  Verificado en vivo: Nota, Hallazgo, Oportunidad, Próximo paso abren como
  hoja; ciclo guardar completo OK.
- [B] "ver por zona / ver por tipo" se recorta por la derecha — ✅ RESUELTO.
  El botón ya no compite en la misma fila que el contador: va junto al
  título "En esta visita", con `white-space: nowrap`.
- [B] Oportunidad en la lista se pintaba en rojo (`--signal-600`) — ✅
  RESUELTO. Quitado el acento de color del texto (y el CSS
  `.va-item__texto--acento`, que ya no se usa). El icono ✨ y la prioridad
  distinguen la fila; ningún tipo lleva color de texto, que en lista se
  lee como alarma.
- [C] La caja "A qué vienes" arrancaba con borde discontinuo + "La visita
  se está guardando" — parecía un error — ✅ RESUELTO. Borde sólido suave
  como el resto; el texto pasa a "Guardando la visita…".
- [C] Nota: el foco inicial iba al "título breve (opcional)" — ✅ RESUELTO.
  El foco va al cuerpo; el título pasa debajo del cuerpo.
- [C] Hallazgo rápido: no hay campo de nota — ✅ RESUELTO. `hallazgo.nota`
  ya existía en la BD y en el payload; solo faltaba el `<textarea>`
  opcional en la hoja. Se serializa sola (aPayloadSnakeCase). Verificado en
  BD: la nota escrita en caliente llega a `hallazgo.nota`.

### Modal de Hallazgo (ahora hoja inferior)
- [B] Subtítulo "lo que el cliente tiene, sea de quién sea" (críptico) — ✅
  RESUELTO. Ahora "Algo que el cliente ya tiene instalado, sea de la marca
  que sea."
- [B] Categorías con **(0)** (4 de 7 vacías: "Software (0)", "Hardware
  (0)"…) — ✅ RESUELTO. `SelectorTermino` oculta las categorías sin
  términos (el catálogo lo gestiona Dirección desde Vocabulario, no desde
  este selector).
- [B] Dos enlaces "ⓘ Qué es…" apilados (Términos y modelos / Naturaleza) —
  ✅ RESUELTO. Quitada la nota "termino-modelo" de `SelectorTermino` (el
  placeholder "buscar término o modelo…" ya lo nombra y el árbol lo enseña,
  MIFARE › DESFire EV2; sigue en /ayuda). Queda solo la de "naturaleza",
  que es el concepto propio. Aplica también a Detalle de Oportunidad, donde
  se apilaba con Etapa / Prioridad / Horizonte.
- [C] Al desplegar una categoría, el árbol se intercalaba entre los chips —
  ✅ RESUELTO. `SelectorTermino`: todas las categorías en una fila que
  envuelve; el árbol de la que abres aparece DEBAJO de la fila entera.
  Verificado en la hoja de Hallazgo y en Detalle de Oportunidad (×2 usos).

### Detalle de oportunidad
- [B] **Tres** enlaces "ⓘ Qué es…" en una pantalla (Etapa, Prioridad,
  Horizonte). El modelo de oportunidad se apoya mucho en ayuda inline. — ✅
  RESUELTO. Un solo "ⓘ Qué es «Etapa, prioridad y horizonte»" bajo los tres
  campos. Los conceptos `prioridad-oportunidad` y `horizonte-decision` se
  fundieron en `etapa-oportunidad` (una entrada mejor en el manual, no tres).
- [B] ¿Los chips (Etapa/Prioridad) se autoguardan o necesitan el botón
  "Guardar" del final? ... cambiar Etapa y salir pierde el cambio sin aviso. —
  ✅ RESUELTO. Se marca "cambios sin guardar" (`sucio`) y al pulsar atrás con
  cambios sale un aviso "Has cambiado algo y no lo has guardado" con "Seguir
  editando" / "Salir sin guardar". Los términos asociados sí quedan al momento
  (eso no cambia). `ayuda.ts` lo dice.
- [C] Pantalla larga y con mucho formulario para algo que se hace en
  campo. Contrasta con el modal "rápido" (solo Título + Prioridad). —
  ✅ RESUELTO (rediseño "dos velocidades"). Siempre visible: Título ·
  Etapa · Prioridad · Horizonte · Descripción · Guardar (≈ la hoja
  rápida, sin scroll). Los dos bloques de términos se pliegan en una
  sección única "Términos y soluciones (N)" que solo se abre sola si ya
  hay algo asociado (`nTerminos > 0`); si no, se puede abrir a mano para
  añadir el primero. Reutiliza `SeccionColapsable` con una prop nueva
  `siempreAbrible` (permite abrir con 0 elementos, sin salirse del
  comportamiento original de Hoy). El "cierre solo cuando toca" (Motivo
  de cierre) ya estaba: card condicional a etapa Perdida/Descartada.
  Etiquetas dentro del plegable acortadas ("Lo que ya tiene" / "Lo que
  le proponemos"). Verificado en vivo el estado plegado + apertura
  manual + los dos "+ añadir"; el estado "abierto por defecto con
  términos" queda comprobado por inspección (mismo mecanismo async ya
  probado en Hoy) — RLS del `oportunidad_termino` no deja asociar
  términos desde la sesión de pruebas.
- [B] "Descartada" / "Perdida" como chips de Etapa sin confirmación —
  cerrar una oportunidad por error es fácil. — ✅ RESUELTO. Tocar "Perdida" o
  "Descartada" ya no aplica al toque: sale "Vas a marcar esta oportunidad
  como «…»: se da por cerrada y tendrás que indicar un motivo. ¿Seguro?"
  (Cancelar / Sí, cerrarla). El resto de etapas se aplican directas.
- [C] Sin contexto de la visita/fecha en la cabecera (solo el cliente). —
  ✅ RESUELTO. El subtítulo añade "· creada el <fecha>".

### Detalle de captura (Nota)
- [B] No muestra ni deja cambiar la **zona** donde se tomó ("Recepción").
  Ahora que la zona es más visible en la captura, aquí se pierde.
- [C] Marca de tiempo en crudo con segundos: "5/9/2026, 20:16:14 · subido".
  El resto de la app usa "5 sept" / "hace X".

### Cerrar visita (3 pantallas: Cerrar → Confirmar → Resumen)
- [B] **Tres verbos para la misma acción** — ✅ RESUELTO. Un solo verbo:
  botón "Cerrar visita" (era "Consolidar visita") → "¿Confirmas el
  cierre?" → "Sí, cerrar visita" → "Visita cerrada correctamente" (era
  "consolidada"). `ayuda.ts` al día. El estado interno de la BD sigue
  siendo `consolidada` (no se toca).
- [B] Plural "1 notas / 1 hallazgos…" — ✅ RESUELTO. Helper `plural(n,
  singular, formaPlural)` en `lib/texto.ts` (la forma plural se pasa
  explícita: "oportunidad→oportunidades", "próximo paso→próximos pasos").
  Aplicado a los chips de recuento de "¿Confirmas?" y del resumen (una
  sola constante `chipsRecuento`, no repetida).
- [B] En "Resumen" no había sección de **Notas** — ✅ RESUELTO. Añadida,
  como Oportunidades / Hallazgos / Pasos.
- [C] "¿Confirmas el cierre?" con gran hueco blanco — ✅ RESUELTO. La vista
  deja de usar `screen--split`: los botones van justo bajo los chips, con
  una línea que explica qué implica cerrar.
- [C] Sin aviso de "faltan interlocutores / datos del cliente" — ✅
  RESUELTO. Aviso NO bloqueante "Antes de cerrar" en la primera pantalla:
  lista si no hay interlocutores registrados (con enlace "Volver a la
  visita") y si el cliente no tiene sector/tamaño/ubicación.

### Detalle de visita cerrada
- [A/B] La primera fila "RESUMEN — Sin resumen registrado" — ✅ RESUELTO
  (opción 3: automático + editable). Al cerrar, `generarResumenReglas`
  (`lib/resumen-visita.ts`) compone una micro-historia legible —objetivo +
  riesgos con su nota + oportunidades + próximos pasos, NO un recuento— y
  se guarda en `visita.resumen_texto` con `resumen_origen = 'reglas'`. El
  objetivo se lee de la cola local si aún no sincronizó (nunca sale sin
  él). Se muestra en la pantalla de resumen tras cerrar y en el detalle de
  visita cerrada; ahí un botón **"Editar"** lo reescribe a mano →
  `resumen_origen = 'manual'`. Migración **98** (el check de
  `resumen_origen` acepta `'manual'`), aplicada en Supabase dev.
  Verificado en vivo: resumen con la nota del riesgo entre paréntesis;
  edición manual; objetivo por fallback al cerrar de inmediato.
- [C] Fila de "Historial de visitas" recortada a media palabra:
  "…ver instalaciones · cerr…" — ✅ RESUELTO. El subtítulo concatenaba
  `objetivo · estado` y al truncar se comía el estado. Ahora el subtítulo
  es solo el objetivo (trunca limpio) y el estado va en `valor`
  (`actividad-proyecto.tsx`, sección compartida ficha-cliente/ficha-proyecto).
- [C] "ver contenido" como etiqueta de acción de fila (gris, a la
  derecha) — el resto de filas solo llevan "›" — ✅ RESUELTO. Quitado el
  verbo pseudo-acción ("ver contenido" / "gestionar" / "continuar visita");
  `valor` = estado ("cerrada" / "planificada" / "en curso"), como en las
  otras tres secciones del mismo componente (prioridad, fecha, naturaleza).
  El destino sigue dependiendo del estado.

### Tareas / Mis próximos pasos
- [B] El menú dice "Tareas", la pantalla se titula "Mis próximos pasos",
  y los ítems son "próximo paso". Tres nombres para lo mismo. (Y el modal
  de creación se titula "Qué queda pendiente" con opción "Tarea.") — ✅
  RESUELTO. Cesar eligió que gane **"próximos pasos"**. Menú "Tareas" →
  **"Pasos"** (forma corta que cabe en la barra inferior; la ruta sigue
  siendo `/tareas`). Hoja de alta: opción "Tarea" → **"Próximo paso"** (y
  su gemela "Próxima visita" ya estaba bien); el título "Qué queda
  pendiente" se queda como paraguas de las dos ramas, no como sinónimo de
  la entidad. `ayuda.ts` (`mis-proximos-pasos`, `proximo-paso`) y los
  comentarios internos ("pestaña Tareas", cabeceras de nivel 0) al día.
  La pantalla ya se titulaba "Mis próximos pasos" y los ítems ya eran
  "próximo paso" (sin cambios). `detalle-proximo-paso` ya usaba "Próximo
  paso".

### Yo (comercial)
- [B] Muy escueto: 3 filas (Mi espacio / Manual / Cerrar sesión). No hay
  "mis datos" (nombre, zona de cartera), ni preferencias, ni versión de
  app, ni "reportar un problema".
  — ✅ **versión + reportar problema** (`dbde413`). Pie
  `PrimeNotes · vX.Y.Z · fecha` (de package.json + build, vía Vite
  `define`). Fila "Reportar un problema" (todos los roles) → hoja con
  textarea → INSERT en `reporte_problema` (migración **101**) con contexto
  {version, build, rol, plataforma, url}. Dirección ve los partes sin
  resolver en la propia pantalla "Yo" (tarjeta "Problemas reportados" +
  "Entendido"), sin pantalla nueva. Verificado en vivo como Dirección.
  «mis datos / preferencias» se dejan fuera: el nombre y la zona los
  gestiona Dirección en "Equipo", y no hay preferencias reales que ofrecer.
- [C] "Mi espacio" (gestión de disco) es la fila principal — para un
  comercial es una preocupación de borde, no la portada de "Yo".

### Ayuda / "Cómo funciona PrimeNotes"
- [B] Lista plana de 20+ entradas sin orden claro (ni alfabético ni por
  flujo): "Yo, Hoy, Agenda, Preparar la visita, Mis próximos pasos,
  Clientes…". Cuesta encontrar algo. — ✅ RESUELTO. Cada entrada de
  `ayuda.ts` lleva ahora un `grupo`; la lista va ordenada por el flujo real
  y partida en bloques con sub-cabecera: Pantallas → «El día a día / Tú y tu
  espacio / Un cliente / Una visita paso a paso / Lo que registras en una
  visita / Si diriges el equipo»; Conceptos → «Durante la visita /
  Oportunidades y vocabulario / Planificar y hacer seguimiento / La app por
  dentro». Al buscar, los bloques vacíos no salen. Ni una cadena de ayuda
  cambia (solo orden + `grupo`).
- [B] Nombres de la ayuda ≠ nombres en la app ("Preparar la visita",
  "Cerrar una visita" vs "Consolidar"). — El "Consolidar" ya se unificó a
  "Cerrar visita" en toda la app (commit `b4b636d`); los títulos de la
  ayuda son "en frase" a propósito y quedan como están.
- Es un índice de pantallas, no una guía de uso → es justo el hueco que
  taparía la **guía rápida** pendiente (sigue pendiente, es otra tarea).

### Agenda
- [C] Bien: el estado vacío sí guía ("Planifica una desde la ficha de un
  cliente"). Pero ese texto ya está desfasado porque existe el "+"
  (ver 1.4). — ✅ RESUELTO en 1.4 (commit `697eef3`): ahora "No hay visitas
  planificadas. Toca «+» para planificar una." y el "+" lleva
  `title="Planificar visita"`.

### Ficha de cliente
- [B] Estado "borrador" en la cabecera de un cliente que ya tiene visita
  cerrada y oportunidad. ¿Qué significa "borrador" para el comercial? — ✅
  RESUELTO en 1.x (commit `c220f65`): `estado_relacion` estaba muerto,
  quitado de la cabecera.
- [B] "General (todo lo que no encaja en otro)" — el nombre del proyecto
  General se muestra literal, con el paréntesis. Verboso. — ✅ RESUELTO.
  En los dos únicos sitios que nombran el General (lista "Proyectos" de la
  ficha de cliente y selector de proyecto de `/planificar`) el título es
  ahora solo "General" y "Todo lo que no encaja en otro proyecto" pasa a
  subtítulo tenue. En el resto de la app el General ya no se nombraba
  (`!es_general ? nombre : ''`).
- Ver 1.1 (datos) y 1.2 (interlocutores).

### Ficha de proyecto
- [C] "Hallazgos" solo crece (no hay estado de "resuelto"); en un cliente
  de años será un muro. Valorar archivar/ocultar hallazgos viejos. — ✅
  RESUELTO. Migración 99 (`hallazgo.archivado_en`). En el detalle del
  hallazgo, "Archivar" / "Desarchivar" (solo autor o Dirección, misma RLS
  que "Guardar"/"Borrar"). La sección "Hallazgos" de la ficha lista solo los
  activos; "Ver archivados (N)" los despliega. Archivar NO borra: el
  hallazgo sigue en su visita y en el informe PDF de esa visita. El borrado
  en cascada (visita/cliente) ya se llevaba los hallazgos — no hacía falta
  tocarlo.

---

## 3. Transversales

### Nomenclatura (varios nombres para un concepto)
- Cerrar visita = "Cerrar" / "Consolidar" / "cerrar" — ✅ (ver "Cerrar visita").
- Tareas = "Tareas" / "Mis próximos pasos" / "próximo paso" / "Qué queda
  pendiente" — ✅ RESUELTO. Gana "próximos pasos"; menú → "Pasos", opción de
  la hoja → "Próximo paso" (ver "Tareas / Mis próximos pasos").
- Recorrido/zona: coherente ya (campo "Zona"), pero la ayuda todavía
  habla de "recorrer las instalaciones".

### Plurales
- "1 notas / 1 hallazgos / 1 oportunidades / 1 próximos pasos" en cierre y
  resumen. En otros sitios sí concuerda ("1 nota", "1 visita"). — ✅
  RESUELTO. `plural()` (`lib/texto.ts`) en los chips de "¿Confirmas?" y del
  resumen (commit `b4b636d`), y en las **cajas de recuento** de la primera
  pantalla de "Cerrar visita" (commit `dab303b`, salió en la pasada final:
  seguían fijas en plural "1 Notas"). Queda el estilo "(s)" de los paneles
  de confirmación de borrado ("2 visita(s), 1 oportunidad(es)") — es un
  formato compacto a propósito para el desglose de "esto se borrará", menor
  prioridad.

### Layout / móvil
- Recortes por la derecha: "ver por zona", historial de visitas, línea de
  contexto de "En esta visita".
- La lista "En esta visita" no gestiona bien el crecimiento (ver 1.6 y
  Visita en curso).
- El banner "Visita en curso" roba una fila en todas las pantallas
  (ver 1.6).

### Ayuda inline
- Muchos "ⓘ Qué es…" en oportunidad (3) y hallazgo (2). Si un concepto
  necesita explicarse cada vez que se usa, o el nombre es malo o el
  modelo es demasiado.

---

## 4. Lo que funciona bien (no tocar)

- El ciclo alta → visita → captura → cierre → informe **se entiende y
  fluye**; en 2 minutos tienes una visita real cerrada con PDF.
- El campo **Zona** nuevo: claro, sin modo, chips para volver.
- Los 3 CTAs jerarquizados de "Nuevo cliente" (iniciar / planificar /
  solo guardar).
- El "✓ Guardado — ¿Completar ahora?" tras crear una oportunidad rápida.
- El patrón de botón destructivo (rojo borgoña + panel de confirmación con
  el desglose de lo que se borra) es consistente y honesto.
- "En esta visita" con contador desglosado y "ver por zona/tipo".
- El estado vacío de Agenda sí orienta.

---

## 5. Pendiente de revisar contigo (no cubierto en esta pasada)

- **Pantallas exclusivas de Dirección**: Vocabulario (cola + catálogo),
  Equipo/comerciales (alta, detalle, baja, traspaso de cartera),
  Solicitudes de reasignación, Deduplicación, Peticiones de acceso,
  Actividad por comercial, Consumo/Mi espacio (ya se fusionaron esta
  sesión). Se revisaron en la homogeneización de diseño, pero no con la
  mirada de "¿es cómodo / falta algo?".
- **Visitas de equipo**: invitar a un compañero a una visita, aceptar/
  rechazar, expulsar. — ✅ VERIFICADO (2026-09-06), sin cambios de código.
  Ver §8.
- **Offline real**: no se probó cortar la red durante una visita. — ✅
  VERIFICADO (2026-09-06) simulando el corte de red; 1 fleco corregido
  (`f17d385`). Ver §8.
- **El informe PDF**: no se abrió el PDF generado en esta pasada (el
  retoque de color del Grupo 7 ya está desplegado; conviene mirarlo en la
  próxima generación real). — PARCIAL (2026-09-06, pasada final): el
  "informe" se genera, sube a Storage y se descarga bien: un `copia-
  visita.zip` (56 KB) con `informe.pdf` + `fotos/` + `audios/` +
  `LEEME.txt`. El PDF por dentro (colores del Grupo 7) sigue sin abrirse —
  hay que descomprimir y abrirlo a mano.

---

## 7. Pasada final del ciclo (2026-09-06)

Recorrido completo Hoy → alta → visita (Zona + las 6 capturas como hojas +
"En esta visita") → cierre → "¿Confirmas?" → resumen → informe. Primero con
la sesión de Dirección, luego repetido con la de **Borja (comercial)** en
el navegador normal: cartera vacía + buscador global (1.3), "Yo" del
comercial (identidad + 3 filas), menú "Pasos" → "Mis próximos pasos"
vacío, ciclo entero y "Borrar esta visita" como responsable. Todo lo
tocado en sesiones anteriores se ve bien. Hallazgos nuevos, todos
corregidos y verificados en vivo:

**En pantalla (commit `dab303b`):**

1. **[B] Plurales en las cajas de recuento de "Cerrar visita"** — "1 Notas
   / 1 Hallazgos". El `plural()` cubría los chips de "¿Confirmas?" y del
   resumen, no estas casillas. Ahora "1 Nota / 1 Hallazgo".
2. **[C] Doble puntuación en el resumen automático** — una nota de riesgo
   acabada en punto salía "…no cifran.). Oportunidad:". Se recorta el signo
   final del fragmento antes del paréntesis.
3. **[B/C] "Informe de la visita (PDF)" descarga un ZIP** — pasa a
   "Informe de la visita" + subtítulo "PDF con las fotos y los audios, en
   un ZIP".

Y abriendo el PDF de verdad (descomprimir el ZIP), commit `9ccc8f4` en la
edge function `generar-backup-visita`:

4. **[B] Ligaduras fi/fl/ff sin texto copiable.** pdfmake aplica las
   ligaduras de Roboto y el ToUnicode del glifo se come la 2ª letra: el PDF
   se ve bien, pero copiar / Ctrl+F / lector de pantalla dan "unifcado",
   "Refeja". Se intentó `romperLigaduras()` (U+200C entre la f y la letra)
   → **pdfmake lo pinta como un cuadrado .notdef visible** ("verif□ ica").
   **Revertido** (`e40bb89`). Queda como problema conocido con un comentario
   NOTA en el código; salidas: cambiar de fuente o de motor de PDF.
5. **[C] LEEME.txt decía "(visita visita)"** — `(visita
   ${tipoLabel.toLowerCase()})` con `tipo_visita` null (todas hoy) → "visita
   visita". Ahora " · <frase>" solo si hay tipo; si no, solo la fecha.
   **Verificado en el PDF v13.** ✅

**Pendiente:** re-desplegar `generar-backup-visita` con la versión
revertida (solo el LEEME). El PDF por dentro se vio en v13: maqueta,
colores Grupo 7 y resumen "Se registró 1 nota" → OK.

**Resumen automático (commit `7e6fffe`):**

6. **[C] "Se registraron 1 nota"** — el resumen de fallback (visita con
   solo capturas) usaba siempre el verbo en plural. Ahora concuerda: "Se
   registró 1 nota" / "Se registraron 2 notas". Verificado en vivo con
   Borja.

7. **[C] "(s)" de recuento** ("1 nota(s)", "0 oportunidad(es)") — ✅
   RESUELTO (`ce554e2` + `2ecb797`). `plural()` de `lib/texto` en el
   panel de borrado de visita, el de borrado de cliente
   (`ficha-cliente.tsx`), el aviso "Cartera heredada" del alta de
   comercial, el mensaje del traspaso de cartera suelto y el aria-label
   de `MapaFotos`. `grep "(s)"` sobre `src/**/*.tsx` = 0.
8. **[C] Ruta muerta `/cierre` al borrar una visita** — ✅ RESUELTO
   (`ce554e2`). Desde el detalle de una visita cerrada, `navigate(-1)`
   podía volver a `/visita/:id/cierre` (pintada con caché de una visita
   que ya no existe). Ahora va a la ficha del cliente con `{ replace:
   true }` — destino vivo y el ← del navegador no vuelve a la visita
   borrada. (Se añadió `cliente_id` al `select` del detalle.)

---

## 6. Propuesta de orden para el recorrido conjunto

1. Hoy → Agenda → planificar (validar 1.4).
2. Clientes → ficha de cliente → datos e interlocutores (validar 1.1, 1.2).
3. Ficha de proyecto → iniciar visita.
4. Visita en curso: cada tipo de captura + zona + "En esta visita".
5. Cerrar visita (3 pantallas) → resumen → informe.
6. Detalle de visita cerrada + detalles de oportunidad/hallazgo/paso.
7. Tareas, Yo, Ayuda.
8. Cambio a sesión de Dirección: Vocabulario, Equipo, Solicitudes,
   Deduplicación, Consumo, Actividad.

---

## 8. Pasada UX de las pantallas de Dirección (2026-09-06)

Recorrido en vivo con la sesión de Dirección (`Comercial Prueba`) contra
`localhost:5173`: Yo (Dirección) → Consumo/Mi espacio → Actividad por
comercial (+ detalle) → Equipo → Ficha de comercial → Alta de comercial →
Vocabulario (Catálogo + Pendientes) → Solicitudes de ayuda → Clientes
duplicados. Los estados vacíos de Solicitudes y Duplicados están bien; no
se pudo ver el estado con datos. ~~**Sin cubrir:** visitas de equipo
(invitar/aceptar/expulsar — hace falta 2 sesiones) y offline real.~~ — ✅
ambos cubiertos el 2026-09-06 (ver más abajo, "Visitas de equipo" y
"Offline real").

Tema recurrente: **"cartera"** se usaba con dos sentidos (una etiqueta de
texto libre tipo "Cataluña" vs. el conjunto de clientes) y aparecía así en
Ficha de comercial y Alta. — ✅ RESUELTO (commit `4e48049`): el campo de
texto libre pasa a llamarse solo **"Zona (opcional)"** en las dos
pantallas (mismo placeholder de ejemplo). "cartera" queda con un único
significado (el conjunto de clientes: traspasar/heredar, "sin cartera
asignada"). `ayuda.ts` al día. Columna de BD `zona_cartera` sin tocar.

### Yo (Dirección)
- [B] Tres filas de almacenamiento repartidas en dos secciones: "Mi
  espacio" (en "Tu espacio", con MB), "Espacio del equipo %" (FilaDato en
  "Salud del equipo") y "Consumo por comercial". **"Mi espacio" y "Consumo
  por comercial" abren la MISMA pantalla** (`/mi-espacio`, segmentado
  Yo/Equipo). Fundir en una sola entrada y no repetir la pantalla en dos
  sitios. — ✅ RESUELTO (commit `a0f8e81`): para Dirección desaparece la
  sección "Tu espacio" y la FilaDato suelta; queda **una sola fila
  "Almacenamiento"** en "El equipo" → `/mi-espacio`, con el % del pozo del
  equipo como valor (y su tono aviso/riesgo). Dentro, el segmentado "Mis
  visitas / Por comercial" ya estaba. El comercial normal mantiene "Mi
  espacio" en "Tu espacio" sin cambios.
- [C] "Salud del equipo" incluye "Copia de seguridad" — no es "salud" sino
  seguridad de datos. — ✅ (`ca10a2e`) sección renombrada a **"El equipo"**;
  la copia sigue en su bloque sin rótulo, ya no bajo "salud".
- [C] "Sectores" usa icono de personas. — ✅ (`ca10a2e`) pasa al icono de
  catálogo (el mismo de Vocabulario). *("Mi espacio" y "Espacio del equipo"
  comparten el de cilindro y se deja: los dos SON almacenamiento, a distinta
  escala, y viven en secciones rotuladas.)*
- [C] Subtítulo de "Solicitudes de ayuda" se corta con "…". — ✅ (`ca10a2e`)
  acortado a "Comerciales que piden que alguien les cubra una visita".
- [C] En "Gestión", lo accionable (Solicitudes de ayuda, que lleva badge)
  va el último. — ✅ (`ca10a2e`) reordenado: primero lo que puede esperar
  respuesta (Solicitudes de ayuda, Peticiones de acceso, Clientes
  duplicados), luego los catálogos (Equipo, Vocabulario, Sectores).

### Ficha de comercial (`/comerciales/:id`)
- [B] "Zona / cartera (opcional)" (texto libre) choca con "sin cartera
  asignada" (vitals) y con "Heredar/Traspasar la cartera" (= clientes).
  Renombrar el campo a solo **"Zona"**. — ✅ RESUELTO (`4e48049`).
- [B] No hay vistazo de actividad ni enlace a "Actividad por comercial" de
  esa persona; la ficha solo muestra la carga de cartera. Añadir enlace
  "Ver actividad" (→ `/actividad-comerciales/:id`) y/o un par de números. —
  ✅ RESUELTO (`49a3917`): sección "Actividad" con fila "Ver actividad".
  El ← del detalle de actividad volvía siempre a la lista aunque vinieras
  de la ficha → ✅ (`515a538`) `navigate(-1)` en vez de `volverA` fijo;
  acierta desde la lista y desde la ficha, y conserva el `?dias=todo`.
- [C] "sin cartera asignada" en gris parece un aviso; para un alta reciente
  es solo un hecho. — ✅ (`ca10a2e`) → "Sin clientes asignados todavía"
  (sin el residuo de "cartera").

### Consumo por comercial (`/mi-espacio?vista=equipo`)
- ~~[B] "Seleccionar" no hace nada en la pestaña "Por comercial".~~ —
  **FALSO POSITIVO** (fallo de clic en la revisión). SÍ funciona: entra en
  modo selección → marcar comerciales que van altos → "Pedir que liberen
  (N)" (inserta `aviso_liberar_espacio`). Gated en `hayElegibles`. Sin
  cambios.
- [C] Filas por comercial sin chevron / no navegables — tocar un comercial
  para ver sus visitas sería natural (opcional).

### Actividad por comercial (`/actividad-comerciales` + detalle)
- [B] Sin ventana temporal: todo es histórico total. Para "¿quién está
  activo?" hace falta "este mes" / "últimos 30 días". — ✅ RESUELTO
  (`3b1277f`, migración 100): segmentado "Últimos 30 días / Todo" (30 días
  por defecto) en lista y ficha; la selección viaja en `?dias=todo` y se
  arrastra lista↔ficha. Cada fuente se filtra por su marca de tiempo.
- [C] Lista principal alfabética, sin distinguir a los de 0 actividad. —
  ✅ de paso en `3b1277f`: ahora ordena por actividad desc.
- [C] En el detalle, la métrica de la columna de valor envuelve feo ("2
  oportunidades\nactivas"). — ✅ (`ca10a2e`) pasa a `subtitulo` a ancho
  completo, como en la lista.
- [C] El detalle se titula "Por proyecto" pero lista nombres de cliente
  (la mayoría solo tienen el General) → de hecho es "por cliente".
  *(Se deja: "Por proyecto" es correcto — el General ES un proyecto.)*
- [C] "capturas" como métrica de primer nivel para Dirección — ¿aporta?
  (visitas/hallazgos/oportunidades son resultados; capturas es volumen).
  *(Se deja: quitarlo cambia el contenido de la pantalla; pendiente de que
  Cesar decida.)*

### Vocabulario → Pendientes
- [B] No hay acciones por ítem. Para aprobar/descartar un término hay que
  entrar en "Seleccionar" → marcar → acción (3 toques para 1 ítem). Tocar
  el ítem solo despliega metadatos. Poner Aprobar/Descartar directos. —
  ✅ RESUELTO (`fc00b07`): al desplegar la tarjeta salen 3 chips —
  "Aprobar en «<cat>»", "Fusionar con…", "Descartar" — que reutilizan
  `resolver()`. El modo lote se mantiene. ayuda.ts al día.
- [C] Fecha del subtítulo se corta ("1 sept 20…"). — ✅ (`ca10a2e`)
  subtítulo = "categoría · fecha"; "propuesto por X" baja al bloque de
  contexto.
- [C] "Catálogo completo": 5 de 7 categorías a "0 términos" — parece roto
  (es dato de prueba; baja prioridad). *(Se deja.)*

### Alta de comercial (`/comerciales/nuevo`)
- [C] Mismo problema de nombre: "Zona / cartera (opcional)" → "Zona". —
  ✅ RESUELTO (`4e48049`).
- [C] Verbos distintos para mover cartera: "Heredar … de" (alta) vs
  "Traspasar … a" (baja/ficha). *(Se deja: son direcciones distintas
  —tirar vs. empujar— y ambos verbos son estándar.)*

### Visitas de equipo — ✅ VERIFICADO (2026-09-06, sin cambios de código)

Recorrido en vivo con las dos sesiones reales (Comercial Prueba /
Dirección como responsable + Borja Senra como participante), alternando
login en la misma pestaña MCP (la de incógnito no es alcanzable). Visita
de prueba en CAPSA, datos borrados al final (SQL comprobado).

- **Invitar**: hoja "Equipo" dentro de la visita en curso (no en la
  planificada). El responsable o Dirección añade → la fila nace "sin
  aceptar".
- **Rechazar**: a Borja le sale el aviso en "Yo" (sección "Visitas de
  equipo" + punto en la pestaña). Rechazar → el aviso desaparece; a quien
  invitó le llega "Borja Senra ha rechazado la visita de CAPSA" +
  "Entendido".
- **Reinvitar** tras rechazo: el candidato aparece como "rechazó ·
  reinvitar" y vuelve a "sin aceptar".
- **Aceptar**: la visita compartida aparece en el "Hoy" de Borja ("EN
  CURSO · Continuar visita"), entra y puede capturar; en "Equipo" ve "tú,
  Comercial Prueba".
- **Permisos del participante**: en su fila solo "salir" (no puede
  expulsar a otros), sin buscador para añadir, con "Pedir ayuda con esta
  visita".
- **Expulsar**: Dirección/responsable → confirma "¿Quitar?" → Borja sale
  de la lista. En BD la fila queda `estado='expulsado'`,
  `rechazo_visto=false`, que es lo que dispara el aviso "Te han quitado de
  la visita de …" en el "Yo" del afectado (mismo hook y misma columna que
  invitación/rechazo, ya verificados en vivo).
- Papercut menor → ✅ RESUELTO (`48db1e7`). Nueva query
  `participantes-expulsados` (misma RLS que `participantes-rechazados`) +
  `expulsadoPrevio` en los candidatos → chip "expulsado · reinvitar". El
  `upsert` de `añadir()` ya reactivaba la fila a `pendiente`. De paso,
  `ayuda.ts` (`interlocutor-participante`): "a quien ha rechazado solo lo
  puede volver a invitar Dirección" era falso desde 2026-09-05 —
  corregido. NO verificado en vivo (2 sesiones) — pendiente Deploy
  Preview / próxima pasada.

### Offline real — ✅ VERIFICADO (2026-09-06), 1 fleco corregido (`f17d385`)

Simulado el corte de red durante una visita en curso (intercepción de
`fetch` a `supabase.co` + `navigator.onLine=false` + evento `offline`;
restaurado con el par simétrico). Visita de prueba en SAPA, datos y cola
local (IndexedDB) borrados al final.

- **Sin red**: la captura (Nota) entra en la cola local — el modelo es
  cola-primero — y aparece en "En esta visita" con el contador "N sin
  subir". BD comprobada: **0 filas** en `captura_libre` mientras está en
  cola. Nada toca Supabase.
- **Al volver la red**: el motor de sincronización sube la cola solo
  (evento `online` + su intervalo). La nota aparece en `captura_libre`
  conservando su hora original.
- **Fleco corregido**: si seguías en la pantalla de la visita cuando
  volvía la conexión, el contador "N sin subir" se quedaba pegado hasta
  salir y volver a entrar (los datos ya estaban subidos). `useSyncQueue`
  solo recargaba tras `encolar()`. Ahora escucha `EVENTO_COLA_PROCESADA` y
  `online` y refresca en vivo → pasa a "todo subido" solo. Mismo patrón
  que la pantalla "Yo".
- Observación menor (fuera de alcance, no tocada): `captura_libre.
  estado_subida` se queda en `'pendiente'` para las notas de texto (ese
  campo es para el pipeline de binarios/validación IA, no para la cola
  offline; la UI lee la cola de IndexedDB, no esa columna).
