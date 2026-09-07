# Prompt maestro — ficha de cliente: fuera los chips de acción, todo en secciones

**Rama:** `feature/proyectos`. **Fecha:** 2026-09-07.

## Problema (lo que ve Cesar)

En la ficha de cliente conviven tres formas de "acción/crear" que no son el
idioma de la app:

- `+ Nuevo proyecto` → chip suelto en una fila de chips.
- `Responsable: X` → chip suelto.
- `+ Nuevo interlocutor` → botón ancho `.btn-secondary` al fondo de la sección
  Interlocutores.

En la visita en curso, Interlocutores y Equipo son iconos con "+" en su sitio;
aquí no. Rompe la homogeneidad. Referencia que da Cesar: "Historial de visitas"
es una **línea (título de sección) con las visitas debajo** — Proyectos debe
verse igual: línea "Proyectos" + un "+" al lado + los proyectos debajo.

## Cambio 1 — `SeccionLista` gana una acción en la cabecera

`src/components/ui/seccion-lista.tsx`: nueva prop `accion?: ReactNode`. Se pinta
a la derecha del `titulo`, en la misma línea. `.seccion-lista__cabecera` pasa a
`display:flex; align-items:center; justify-content:space-between; gap:8px`
(components.css). Si hay `accion` sin `titulo`, se pinta igualmente la fila de
cabecera. El uso previsto es un `.boton-icono` con `<Icono nombre="mas">`.

## Cambio 2 — `ficha-cliente.tsx`

### 2a. La fila de chips

Se quita el chip `+ Nuevo proyecto` (pasa a la sección "Proyectos", 2b).
El chip `Responsable: X` **se queda como está** (decisión de Cesar 2026-09-07:
"solo dice el responsable de la cuenta, déjalo así esa parte"). El panel inline
`cambiandoResp` sigue igual. Si tras quitar "+ Nuevo proyecto" el chip
"Responsable" queda solo en la fila, la fila se mantiene con ese único chip.

### 2b. Sección "Proyectos"

Nueva `SeccionLista titulo="Proyectos" prominencia="principal"` con
`accion={<botón + "Nuevo proyecto">}` (solo si el usuario puede crearlos —
mismo permiso que hoy tiene el chip). Siempre visible.

- Debajo, una `FilaNavegable` por cada proyecto **no-General** activo del cliente
  (`to={/clientes/:id/proyectos/:pid}`). El proyecto "General" NO se lista (es
  implícito); su actividad se sigue mostrando inline como hoy (`ActividadProyecto`),
  debajo de esta sección.
- Si no hay proyectos no-generales: la sección queda solo con su cabecera y el
  "+". (Es lo que Cesar describe: "los proyectos que haya, si los hay".)
- El "+" abre el alta inline actual (`creandoProyecto` → card "Nuevo proyecto"
  con Cancelar / Crear), renderizada bajo la cabecera de la sección.

### 2c. Interlocutores — icono en la cabecera de la pantalla (como la visita)

Igual que `visita-activa.tsx:1472-1482`: en la ranura `derecha` de
`CabeceraDetalle`, junto al lápiz de "Editar datos", un `.boton-icono` con
`<Icono nombre="interlocutor" size={18}>` + `.boton-icono__badge` con el nº de
interlocutores dados de alta. Al pulsarlo abre una hoja.

- Se **elimina** la `SeccionLista titulo="Interlocutores"` del cuerpo.
- Nueva hoja fina `InterlocutoresClienteHoja` (`src/features/clientes/`):
  `HojaSuperior titulo="Interlocutores"` + `derecha` = `.boton-icono` "+"
  (estado `creando`), contiene `<DirectorioInterlocutores clienteId
  crearNuevo={{ abierto: creando, onCambio: setCreando }} />`. Es la
  `InterlocutoresHoja` de la visita **sin** la capa de presencia (sin
  `visitaId`, sin `presencia`).
- Query del recuento: `['interlocutores-count', clienteId]` (nº de
  interlocutores activos del cliente).

### 2e. Equipo — icono en la cabecera (PENDIENTE definir contenido)

Cesar pide que "Equipo" también salga arriba a la derecha, como en la visita.
En la ficha de cliente **no hay visita**, así que no hay "equipo de la visita".
El único concepto de equipo aquí es el **responsable del cliente** (y, si acaso,
quién más lo lleva). Falta que Cesar diga qué abre este icono:
  - (a) el responsable del cliente + cambiarlo (sustituye a 2d), o
  - (b) otra cosa (lista de comerciales con acceso, histórico de responsables…).
Hasta saberlo, 2e queda sin implementar y "Responsable" se hace según 2d.

### 2d. "Responsable" — sin cambios

Se queda como hoy: chip `Responsable: X` que abre el panel `cambiandoResp`
(dirección), y `FilaDato "Responsable"` en la sección "Datos" para quien no es
dirección. Cesar lo dejó explícitamente fuera de este pase.

## Qué NO se toca

- `ActividadProyecto` (actividad del General inline) — igual.
- Lógica de `crearProyecto`, `cambiarResponsable`, permisos, queries.
- El lápiz de "Editar datos" en la cabecera de la pantalla (ya hecho).
- La sección "Ecosistema" y el chip `eco-tag-mas` (ya hecho).

## Verificación

- `typecheck` + `lint` + `build`.
- Chrome de pruebas, ficha de un cliente:
  1. Cabecera: `?` + icono Interlocutores (con badge) + lápiz "Editar datos".
     Ya no hay sección "Interlocutores" en el cuerpo.
  2. El icono Interlocutores abre la hoja; su "+" da de alta; el badge sube.
  3. Sección "Proyectos" con "+"; crear uno → aparece como fila; tocar → su ficha.
     Con 0 proyectos extra: solo la cabecera "Proyectos" + "+".
  4. Sigue el chip "Responsable: X" y su panel de cambio (dirección).
- Captura de la ficha en un cliente con 0 proyectos extra y con 2.
- `graphify update .`
