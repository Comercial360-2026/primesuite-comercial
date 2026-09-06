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
