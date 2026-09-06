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
  Horizonte). El modelo de oportunidad se apoya mucho en ayuda inline.
- [B] ¿Los chips (Etapa/Prioridad) se autoguardan o necesitan el botón
  "Guardar" del final? No está claro; si es lo segundo, cambiar Etapa y
  salir pierde el cambio sin aviso de "cambios sin guardar".
- [C] Pantalla larga y con mucho formulario para algo que se hace en
  campo. Contrasta con el modal "rápido" (solo Título + Prioridad).
- [B] "Descartada" / "Perdida" como chips de Etapa sin confirmación —
  cerrar una oportunidad por error es fácil.
- [C] Sin contexto de la visita/fecha en la cabecera (solo el cliente).

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
  "…ver instalaciones · cerr…".
- [C] "ver contenido" como etiqueta de acción de fila (gris, a la
  derecha) — el resto de filas solo llevan "›".

### Tareas / Mis próximos pasos
- [B] El menú dice "Tareas", la pantalla se titula "Mis próximos pasos",
  y los ítems son "próximo paso". Tres nombres para lo mismo. (Y el modal
  de creación se titula "Qué queda pendiente" con opción "Tarea".)

### Yo (comercial)
- [B] Muy escueto: 3 filas (Mi espacio / Manual / Cerrar sesión). No hay
  "mis datos" (nombre, zona de cartera), ni preferencias, ni versión de
  app, ni "reportar un problema".
- [C] "Mi espacio" (gestión de disco) es la fila principal — para un
  comercial es una preocupación de borde, no la portada de "Yo".

### Ayuda / "Cómo funciona PrimeNotes"
- [B] Lista plana de 20+ entradas sin orden claro (ni alfabético ni por
  flujo): "Yo, Hoy, Agenda, Preparar la visita, Mis próximos pasos,
  Clientes…". Cuesta encontrar algo.
- [B] Nombres de la ayuda ≠ nombres en la app ("Preparar la visita",
  "Cerrar una visita" vs "Consolidar").
- Es un índice de pantallas, no una guía de uso → es justo el hueco que
  taparía la **guía rápida** pendiente.

### Agenda
- [C] Bien: el estado vacío sí guía ("Planifica una desde la ficha de un
  cliente"). Pero ese texto ya está desfasado porque existe el "+"
  (ver 1.4).

### Ficha de cliente
- [B] Estado "borrador" en la cabecera de un cliente que ya tiene visita
  cerrada y oportunidad. ¿Qué significa "borrador" para el comercial?
- [B] "General (todo lo que no encaja en otro)" — el nombre del proyecto
  General se muestra literal, con el paréntesis. Verboso.
- Ver 1.1 (datos) y 1.2 (interlocutores).

### Ficha de proyecto
- [C] "Hallazgos" solo crece (no hay estado de "resuelto"); en un cliente
  de años será un muro. Valorar archivar/ocultar hallazgos viejos.

---

## 3. Transversales

### Nomenclatura (varios nombres para un concepto)
- Cerrar visita = "Cerrar" / "Consolidar" / "cerrar".
- Tareas = "Tareas" / "Mis próximos pasos" / "próximo paso" / "Qué queda
  pendiente".
- Recorrido/zona: coherente ya (campo "Zona"), pero la ayuda todavía
  habla de "recorrer las instalaciones".

### Plurales
- "1 notas / 1 hallazgos / 1 oportunidades / 1 próximos pasos" en cierre y
  resumen. En otros sitios sí concuerda ("1 nota", "1 visita").

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
  rechazar, expulsar. No se probó (hace falta 2 sesiones a la vez).
- **Offline real**: no se probó cortar la red durante una visita.
- **El informe PDF**: no se abrió el PDF generado en esta pasada (el
  retoque de color del Grupo 7 ya está desplegado; conviene mirarlo en la
  próxima generación real).

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
