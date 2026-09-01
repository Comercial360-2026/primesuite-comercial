# 08 — Sistema de diseño (companion del repo)

Este fichero es la **copia viva dentro del repo** del documento de diseño
`08` entregado aparte. No repite todo el documento externo: recoge lo que
está **implementado en código** y a lo que apuntan los comentarios de
`src/styles/tokens.css`, `src/styles/components.css` y
`src/components/ui/iconos.tsx`.

## Fuentes de verdad

| Qué | Dónde | Regla |
|---|---|---|
| Colores, tipografía, espaciado, radios, alturas | `src/styles/tokens.css` (`:root`) | Cualquier cambio de marca se hace **solo aquí**. |
| Clases de componentes base (`.btn`, `.card`, `.field`, `.chip`, filas…) | `src/styles/components.css` | Implementan los tokens. Sin `box-shadow`, sin `blur`, sin degradados, sin `opacity` sobre color salvo el estado deshabilitado. |
| Iconos | `src/components/ui/iconos.tsx` | Registro único. Las pantallas piden el icono por nombre; cambiar de set = editar ese archivo. |

---

## Sistema de filas

Sustituye el patrón anterior —"cada elemento es una `.card` con borde, todas
del mismo peso, y muchas con `onClick={() => navigate(...)}`"— por listas
agrupadas coherentes al estilo *Ajustes de iPhone*. Objetivo: que un
restyle de las filas sea **un solo sitio**, no pantalla por pantalla.

### Cuándo usarlo

- Pantallas que son sobre todo una lista de accesos o de datos: **Yo**, Mi
  espacio, y (fases siguientes) Clientes, Mis próximos pasos, Agenda, ficha
  de cliente…
- **No** para el contenido rico de una pantalla (formularios, la visita
  activa, tarjetas con gráfico o con su propio botón de acción): eso sigue
  siendo `.card` u otros componentes.

### Componentes

Todos en `src/components/ui/`, nombres en español.

#### `SeccionLista` — *implementado*

Grupo de filas con cabecera gris opcional, separadores finos y esquinas
redondeadas.

| Prop | Tipo | Notas |
|---|---|---|
| `titulo` | `string?` | Cabecera gris **en frase** ("Dirección comercial"), no en Mayúsculas Iniciales. Sin título = grupo suelto (p. ej. la fila de "Cerrar sesión"). |
| `children` | `ReactNode` | Las filas. |

Varias `SeccionLista` se envuelven en `<div className="lista-agrupada">`
(flex columna, `gap: --space-6`, `max-width: 520px`, centrado) para el
layout de escritorio.

Para listas con **secciones internas** (la Agenda: un grupo por día, y
dentro "Mañana" / "Tarde" / "Sin hora"), se intercala un
`<div className="seccion-lista__subcabecera">` entre las filas — comparte
separador y padding con ellas.

#### `FilaNavegable` — *implementado*

Fila de una `SeccionLista`. Se dibuja como **enlace** o como **acción**,
según qué prop reciba (el tipo obliga a pasar exactamente una):

- `to: string` → `<Link>`. Navegación real (clic medio, abrir en pestaña).
  Muestra la flecha `›` por defecto.
- `onClick: () => void` → `<button>`. Acción en el sitio ("Cerrar sesión").
  Sin flecha por defecto.

| Prop | Tipo | Notas |
|---|---|---|
| `icono` | `NombreIcono?` | Nombre del registro de `iconos.tsx`. |
| `titulo` | `string` | Obligatorio. |
| `subtitulo` | `string?` | Segunda línea, gris pequeña. |
| `valor` | `ReactNode?` | Contenido a la derecha, antes de la flecha: texto (`"72%"`), un chip de estado (p. ej. el semáforo en Clientes)… Igual que `FilaDato.valor`. |
| `badge` | `string \| number?` | Contador pequeño. No se dibuja si es `0`, `''` o `undefined`. |
| `tono` | `'neutral' \| 'aviso' \| 'riesgo' \| 'ok'` | Por defecto `neutral`. Ver tabla de tonos. |
| `densidad` | `'normal' \| 'compacta'` | Por defecto `normal` (alto `--fila-min-h`, icono 20). `compacta` = alto 44, icono 18, para listas densas. |
| `chevron` | `boolean?` | Fuerza mostrar/ocultar la flecha. Por defecto: visible solo con `to`. |
| `disabled` | `boolean?` | Solo efectivo en la variante `onClick`. |

#### `FilaDato` — *implementado*

Fila de solo lectura: etiqueta a la izquierda, valor a la derecha. No
navega ni acciona (es un `<div>`, sin flecha y sin fondo al pasar el
ratón). Para la parte "Resumen" de pantallas como **Mi espacio** (tu
parte, espacio del equipo…). Reutiliza la caja y los tonos de
`FilaNavegable`; el valor va algo más oscuro y mayor que en una fila
navegable porque es el dato principal.

| Prop | Tipo | Notas |
|---|---|---|
| `etiqueta` | `string` | Obligatorio. Se pinta en `.fila__titulo`. |
| `valor` | `ReactNode` | Obligatorio. Texto, porcentaje, un `<span>`… a la derecha. |
| `icono` | `NombreIcono?` | Icono opcional a la izquierda, por simetría con la familia. |
| `tono` | `'neutral' \| 'aviso' \| 'riesgo' \| 'ok'` | Mismo mapa que `FilaNavegable`: `aviso`/`ok` tiñen el valor; `riesgo` también la etiqueta. |
| `densidad` | `'normal' \| 'compacta'` | Igual que `FilaNavegable`. |

#### `FilaAccion` — *implementado*

Fila con un **cuerpo** —opcionalmente pulsable— y una fila de **botones de
icono** a la derecha (p. ej. descargar informe, borrar visita). Sustituye
al patrón `<div className="card" style={{display:'flex'}}>` con
icon-buttons hechos a mano y `e.stopPropagation()` repartidos. El cuerpo y
el grupo de acciones son hermanos (no `<button>` anidados), así que pulsar
una acción nunca dispara el cuerpo.

| Prop | Tipo | Notas |
|---|---|---|
| `titulo` | `string` | Obligatorio. |
| `subtitulo` | `string?` | Segunda línea gris. |
| `icono` | `NombreIcono?` | Icono a la izquierda del cuerpo. |
| `onClick` | `() => void ?` | Si falta, el cuerpo es inerte (sin hover ni cursor de puntero). |
| `tono` | `'neutral' \| 'aviso' \| 'riesgo' \| 'ok'` | Tiñe el cuerpo igual que las demás filas. |
| `densidad` | `'normal' \| 'compacta'` | Igual que `FilaNavegable`. |
| `disabled` | `boolean?` | Desactiva el `onClick` del cuerpo (no las acciones). |
| `acciones` | `AccionFila[]` | Botones de icono a la derecha. Vacío = ninguna. |

`AccionFila`:

| Campo | Tipo | Notas |
|---|---|---|
| `icono` | `NombreIcono` | |
| `etiqueta` | `string` | `aria-label` + `title`. Obligatorio: los botones son solo icono. |
| `onClick` | `() => void ?` | |
| `href` | `string?` | Si está, se dibuja como `<a href>` real en vez de `<button>` — necesario para descargas (`window.open()` tras un `await` lo bloquea el navegador). |
| `tono` | `'neutral' \| 'riesgo' \| 'brand'` | Color del icono. Distinto set que el tono de la fila: aquí es afordancia (destructiva / principal), no estado. |
| `disabled` | `boolean?` | |

#### `CabeceraDetalle` — *implementado*

La fila `‹ Título` de arriba de las pantallas de detalle. Sustituye al
`<button>←</button>` + `<h1>` copiado a mano en ~13 pantallas (agenda,
ficha de cliente, Mi espacio, los `detalle-*`, vocabulario, consumo…).
Usa el icono `atras` del registro (flecha con asta, no un chevron: es
"volver", no "hay más").

| Prop | Tipo | Notas |
|---|---|---|
| `titulo` | `string` | Obligatorio. |
| `subtitulo` | `string?` | Segunda línea gris bajo el título (p. ej. `"Cliente activo · Hostelería"`). |
| `onVolver` | `() => void ?` | Acción de volver a medida. Tiene prioridad sobre `volverA`. La usan las pantallas que cierran un panel de confirmación en vez de salir. |
| `volverA` | `string?` | Ruta fija a la que volver en vez de `navigate(-1)` (ficha de cliente → `/clientes`, Mi espacio → `/yo`). |
| `derecha` | `ReactNode?` | Ranura a la derecha: chip de estado, botón de acción (p. ej. el semáforo + "Borrar cliente" de la ficha). |

Prioridad de la vuelta: `onVolver` → `volverA` → `navigate(-1)`.

#### `TarjetaAccion` — *implementado*

Bloque informativo + **un** botón de acción. Sustituye al patrón
`<div className="card">` con `.label`, un cuerpo de texto/cifras y un
`<button className="btn btn-secondary">` montado a mano (el medidor de
espacio y la copia de seguridad de **Yo**). No es una fila: es una tarjeta
con caja, para contenido que debe destacar (una cifra grande, un aviso) y
que lleva su propia acción. Las listas de accesos/datos siguen siendo
`SeccionLista` + filas.

| Prop | Tipo | Notas |
|---|---|---|
| `titulo` | `string` | Cabecera pequeña gris (la `.label` de arriba). |
| `children` | `ReactNode` | Cuerpo: texto, cifras, una barra fina… Para la línea de estado que el tono debe teñir, usar `<div className="tarjeta-accion__estado">`. |
| `tono` | `'neutral' \| 'aviso' \| 'riesgo'` | Por defecto `neutral`. Tiñe **borde + título + `tarjeta-accion__estado`**. No hay `ok` (una tarjeta con acción nunca es "todo correcto"). |
| `accion` | `AccionTarjeta?` | El botón único, abajo. Sin `accion` = tarjeta solo informativa. |
| `error` | `string?` | Línea de error bajo el botón (`field-error-text`). |

`AccionTarjeta`:

| Campo | Tipo | Notas |
|---|---|---|
| `etiqueta` | `string` | Texto del botón. |
| `onClick` | `() => void` | |
| `disabled` | `boolean?` | |
| `cargando` | `boolean?` | Deshabilita el botón y muestra `etiquetaCargando`. |
| `etiquetaCargando` | `string?` | Por defecto `"Un momento…"`. |

Sin `href` (las descargas de **Yo** generan el blob en JS, no navegan). Si
alguna tarjeta necesitase descargar tras un `await`, se añade igual que en
`AccionFila`.

#### `EstadoLista` — *implementado*

Los cuatro estados "no hay lista que pintar" en un solo componente:
`cargando`, `vacio`, `sin-conexion`, `error`. Sustituye a los `<p>Cargando…</p>`
sueltos, los `<p>Sin resultados</p>` y la tarjeta `card--riesgo` de
"isPaused" copiada en ~5 pantallas.

Es una unión discriminada por `estado`:

| `estado` | Props | Render |
|---|---|---|
| `'cargando'` | `mensaje?` (por defecto `"Cargando…"`) | Texto gris centrado. |
| `'vacio'` | `mensaje` (obligatorio), `icono?` | Texto gris centrado, con icono opcional encima. |
| `'sin-conexion'` | `onReintentar`, `mensaje?` | `EstadoError` con texto de red y botón "Reintentar". |
| `'error'` | `onReintentar`, `mensaje?` | `EstadoError` (texto por defecto si no se pasa `mensaje`). |

`sin-conexion` y `error` reutilizan **`EstadoError`** (la primitiva "algo
falló, reintenta"), que se mantiene como componente propio. Las pantallas
que aún llaman a `EstadoError` directo migran a `EstadoLista` al entrar en
su fase.

#### `FilaToggle` + prop `seleccion?` — *implementado*

"Modo seleccionar": una lista que normalmente navega pasa a marcar filas
para una acción en lote (borrar visitas en Mi espacio, cancelar
planificadas en Agenda). La pantalla lleva el estado (qué ids marcados) y
lo baja a cada fila.

Prop opcional en **`FilaNavegable`** y **`FilaAccion`** (no en `FilaDato`,
que es de solo lectura):

```ts
interface EstadoSeleccion {
  activa: boolean;      // el modo seleccionar está encendido en esta lista
  marcada: boolean;     // esta fila está marcada
  onToggle: () => void; // marca / desmarca esta fila
}
```

Reglas cuando `seleccion.activa`:

- Aparece un `FilaToggle` (círculo) a la izquierda, antes del icono.
- La fila **no navega ni ejecuta su `onClick`/`to`**: todo el cuerpo llama
  a `onToggle`. `FilaNavegable` con `to` se dibuja como `<button>` (con
  `aria-pressed`), no como `<Link>`.
- La flecha `›` se oculta. En `FilaAccion`, los botones de icono de la
  derecha se ocultan.
- Fila marcada → clase `fila--marcada` (fondo `--fila-marcada-bg`, sin
  tocar el tono).
- Una fila `disabled` no se puede marcar.

Sin la prop, o con `activa:false`, la fila se comporta **exactamente**
como antes — el cambio es no-op para todas las llamadas existentes.

`FilaToggle` es solo el dibujo del círculo (`aria-hidden`); no captura el
clic (lo hace el `<button>` de la fila). Glifos `circulo` / `check-circulo`
del registro. Se exporta junto a `EstadoSeleccion` por si una lista a
medida lo necesita.

#### `BarraSeleccion` — *implementado*

La cabecera del modo seleccionar: "N seleccionados · Cancelar · [Borrar
(N)]". Igual en Mi espacio y Agenda → un componente, no copiada. Se coloca
arriba de la lista, dentro del `.screen` (no es una barra fija global).

| Prop | Tipo | Notas |
|---|---|---|
| `n` | `number` | Nº de filas marcadas. `0` → "Selecciona elementos". |
| `onCancelar` | `() => void` | Apaga el modo seleccionar en la pantalla. |
| `acciones` | `AccionSeleccion[]` | Normalmente una. El contador va en `etiqueta` si se quiere ("Borrar (3)"). |

`AccionSeleccion`: `{ etiqueta; icono: NombreIcono; tono?: 'neutral' \| 'riesgo'; onClick; disabled? }`.
`riesgo` = destructiva (borrar / cancelar), en rojo.

### Modo seleccionar — patrón de pantalla

Quién hace qué:

- **La pantalla** tiene el estado: un `seleccionando: boolean` y un
  `Set<string>` de ids marcados. Un chip/botón "Seleccionar" lo enciende.
- Cada fila recibe `seleccion={{ activa: seleccionando, marcada: ids.has(id), onToggle: () => alterna(id) }}`.
- `BarraSeleccion` arriba, con `n={ids.size}` y una acción "Borrar (n)"
  (`tono:'riesgo'`, `disabled` si `n === 0`).
- La acción en lote = **N × la operación individual que ya existe**, en
  bucle, con progreso ("Borrando 3 de 7…") y parte de fallos parciales. No
  se crea RPC de lote. Las filas que fallan se quedan marcadas.
- **Sin conexión**: el modo seleccionar se puede usar, pero al confirmar
  una acción que necesita red (borrar visitas: arrastran Storage) se avisa
  y no se hace nada — no se encola.
- Al terminar (o al Cancelar) → `seleccionando = false`, `ids` vacío.
- Ids que ya no están en la lista al ejecutar se ignoran.

### Tokens — bloque "Filas" (`tokens.css`)

| Token | Uso |
|---|---|
| `--fila-min-h` | Alto táctil mínimo de una fila (`52px`). |
| `--fila-pad-x` / `--fila-pad-y` | Márgenes del contenido (`16px` / `12px`). |
| `--fila-separador` | Línea fina entre filas (`1px solid --ink-100`). |
| `--fila-activa-bg` | Fondo al pulsar / al pasar el ratón. |
| `--fila-icono` | Color del icono de la izquierda. |
| `--fila-chevron` | Color de la flecha `›`. |
| `--fila-accion-size` | Lado de un botón de icono de `FilaAccion` (`36px`). |
| `--seccion-cabecera` | Color del título gris de la sección. |
| `--fila-seleccion` / `--fila-seleccion-marcada` | Círculo de `FilaToggle` sin marcar / marcado. |
| `--fila-marcada-bg` | Fondo de una fila marcada. |
| `--fila-tono-aviso` / `--fila-tono-riesgo` / `--fila-tono-ok` | Colores de tono. |

### Tabla de tonos

Los tonos **solo tiñen texto e icono**, nunca ponen fondo de color
(coherente con "sin degradados, sin opacity sobre color").

| Tono | Token | Tiñe | Uso |
|---|---|---|---|
| `neutral` | — | nada | Caso normal. |
| `aviso` | `--warning-600` | icono, `valor`, `badge` | Algo que revisar, sin urgencia (p. ej. "Solicitudes de ayuda (3)"). |
| `riesgo` | `--danger-600` | icono, `valor`, `badge` **y el título** | Grave / destructivo (p. ej. "Cerrar sesión", "N sin sincronizar"). |
| `ok` | `--success-600` | icono, `valor`, `badge` | Confirmación positiva. |

### Reglas de estilo

- Cabeceras de sección **en frase**, no en Mayúsculas Iniciales.
- Flecha `›` solo en filas que navegan (`to`); nunca en acciones.
- Ancho máximo `520px` centrado desde el primer día (escritorio); `:hover`
  además de `:active`.
- La primera fila de un grupo no lleva separador superior (lo recorta
  `.fila:first-child`).

### Ejemplo

```tsx
<div className="lista-agrupada">
  <SeccionLista titulo="Almacenamiento">
    <FilaNavegable
      icono="almacenamiento"
      titulo="Mi espacio"
      subtitulo="Tu cuota y el tamaño de tus visitas"
      to="/mi-espacio"
    />
  </SeccionLista>

  <SeccionLista titulo="Dirección comercial">
    <FilaNavegable icono="vocabulario" titulo="Gestionar vocabulario" to="/vocabulario" />
    <FilaNavegable
      icono="solicitudes"
      titulo="Solicitudes de ayuda"
      badge={numPendientes}
      tono={numPendientes ? 'aviso' : 'neutral'}
      to="/solicitudes-reasignacion"
    />
  </SeccionLista>

  <SeccionLista>
    <FilaNavegable icono="salir" titulo="Cerrar sesión" tono="riesgo" onClick={cerrarSesion} />
  </SeccionLista>
</div>
```
