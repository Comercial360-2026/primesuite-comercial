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

## MÉTODO DE ANÁLISIS (obligatorio ANTES de tocar cada pantalla)

No parchear. Antes de editar una pantalla se hace este análisis por
escrito; sólo después se propone y se cambia. Se pasa la pantalla por tres
perfiles y por las preguntas transversales, y se emite CUMPLE / NO CUMPLE +
lista de cambios priorizados.

**Perfil 1 — el comercial en la calle (usuario principal).** Contexto real:
de pie o sentado frente a un cliente, móvil en una mano, con prisa, a veces
sin cobertura, a veces sin abrir la app en semanas.
- ¿A qué vengo a esta pantalla? ¿Lo consigo en 1-2 toques?
- ¿Qué ven mis ojos primero? ¿Es lo que más necesito?
- ¿Algo me obliga a parar (rellenar, elegir, leer) antes de lo que quiero hacer?
- ¿Entiendo cada palabra y cada icono sin pensar?
- ¿Lo hago con una mano? ¿Los botones llegan al pulgar?
- Si me interrumpen o me equivoco, ¿pierdo trabajo?

**Perfil 2 — el director comercial (consume el resultado).**
- ¿Esta pantalla produce lo que necesito luego (informe, seguimiento)?
- ¿Puede quedarse algo importante sin registrar?
- ¿Hay fricción que haga que el comercial no lo apunte?

**Perfil 3 — diseñador de producto (criterio Apple / HIG).**
- ¿Cada elemento gana su sitio, o hay ruido?
- Jerarquía: lo importante grande y central; lo secundario, pequeño y al margen.
- ¿Patrones de iOS (navegación, hojas, búsqueda con lupa, listas) o inventados?
- ¿Iconos estándar y reconocibles? Consistencia con el resto de la app.
- Estado vacío / error / carga cuidados. Un solo foco por pantalla.

**Preguntas transversales (fijas):** ¿para qué sirve la pantalla (1 frase)? ·
¿quién la usa y cuándo? · ¿qué debe ver al entrar? · ¿qué funcionalidades
DEBE cumplir y las cumple? · ¿qué le falta / qué no se ha tenido en cuenta? ·
¿hace lo que dice, en mínimos pasos, sin puntos muertos?

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
