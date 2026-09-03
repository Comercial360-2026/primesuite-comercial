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

## Prueba de usuario — requisito de toda pantalla

Antes de dar una pantalla por hecha, tiene que pasar estos 6 puntos. Si
falla uno, no está terminada:

1. **¿Se entiende en 2 segundos qué hacer aquí?** Hay una acción o foco
   principal y se ve.
2. **¿Cada estado importante tiene una pista que NO es el color?** Forma
   de icono, palabra, negrita o posición. El usuario es daltónico
   (rojo/verde). Ver §"Color y accesibilidad".
3. **¿Hay una sola jerarquía clara?** Lo importante grande, lo secundario
   pequeño. Nada compite.
4. **¿Los estados vacíos están resueltos?** No ocupan lo mismo que uno
   lleno; usan `EstadoLista` (`vacio`), no un texto suelto.
5. **¿Los formatos son consistentes?** Horas, fechas y nombres se
   escriben igual en toda la app.
6. **¿No hay nada repetido ni decorativo de más?** Un dato o una acción
   aparece una vez.
7. **¿Tiene jerarquía o es plana?** ¿El ojo sabe por dónde empezar? Las
   cabeceras guían (no son etiquetas pálidas), el valor que importa pesa,
   lo secundario es pequeño y gris. Ver §"Jerarquía". «Repasado» = repasada
   la jerarquía, no solo que la estructura sea correcta.
8. **¿La ayuda sigue diciendo la verdad?** Si la pantalla tiene entrada en
   `src/lib/ayuda.ts` (el "?" de la cabecera) o hay una `<AyudaNota>` en un
   campo, y este cambio altera qué hace la pantalla o el campo, la entrada
   se actualiza EN ESTE MISMO COMMIT. Pantalla o concepto nuevo con
   fricción real → se le añade su entrada. Ver §"Ayuda in-app".

---

## Jerarquía — que el ojo sepa por dónde empezar

La app se construye de un solo patrón (`SeccionLista` + tarjeta + filas)
repetido en pila. Sin ayuda, todas las pantallas pesan lo mismo y un dato
menor ocupa lo mismo que el importante. Reglas, casi todas en
`components.css` + los componentes compartidos (cambio en un sitio,
propaga a toda la app):

- **Cabeceras de sección que guían.** `.seccion-lista__cabecera` es
  `--text-sm` / 600 / `--ink-700` — legible y con peso, no una etiqueta
  pálida. Tres niveles con la prop `prominencia` de `SeccionLista`:
  `principal` (la sección del dinero o de la acción: `--text-base` /
  `--ink-900`), `normal` (def.), `tenue` (metadatos: Datos, Más — pequeña
  y gris).
- **El valor de la fila pesa cuando es el objetivo.** `.fila__valor` va en
  `--ink-900` / 500 por defecto (un número, un estado, una prioridad, un
  importe). Solo un valor de contexto secundario —una fecha— usa
  `valorTenue` (prop de `FilaNavegable` / `FilaDato` → `.fila__valor--tenue`).
- **El texto libre en una lista NUNCA crece.** Títulos y descripciones que
  escribe el comercial pueden tener 5 palabras o 1000 caracteres. En una
  lista se recortan: `.fila__titulo` a 2 líneas, `.fila__subtitulo` y
  `.cabecera-detalle__subtitulo` a 1, con "…". El texto entero se ve al
  tocar la fila (que ya navega al elemento). Lo que no navega y puede ser
  largo (etiquetas de Ecosistema) es un `<button>` que se despliega al
  tocarlo (`EcoTag`). Toda lista de contenido cuenta con un tope de
  elementos visibles + "+N más".
- **Un idioma de acento, tres trabajos, siempre forma + palabra.** Azul de
  marca = acción principal · «lleva a otra pantalla» (`.fila-ir`) ·
  informativo/de sistema (`.info-tag`, p. ej. «Heredado»). Semántico
  (verde/ámbar/rojo) = estado que hay que leer, con icono de forma +
  palabra (daltónico). Neutro = todo lo demás.
- **El ritmo agrupa.** `.grupo` (hueco `--space-2`) envuelve secciones
  relacionadas; `.lista-agrupada` (`--space-6`) separa grupos sin relación.
- **Lo escaso no lleva tarjeta.** Un solo dato trivial suelto →
  `.dato-inline` (etiqueta + valor en una línea, sin caja). Una tarjeta
  entera para una fila se lee como un error.
- **Una acción principal por pantalla.** Un solo `.btn-primary` (azul
  relleno) **visible a la vez**; el resto `.btn-secondary` (borde) o
  `.btn-enlace` (texto). Cuando se abre un panel de confirmación o edición
  inline (planificar, reprogramar, cambiar responsable, dar de baja,
  confirmar borrado…), **ese panel es el foco**: su botón de confirmar es
  el `.btn-primary` y cualquier otra CTA persistente de la pantalla (la
  anclada abajo, "Guardar" arriba…) baja a `.btn-secondary` mientras el
  panel está abierto. Una pantalla puede tener **cero** primarios (listas
  de monitorización o de administración con una decisión por fila, p. ej.
  Consumo por comercial o Clientes duplicados): ahí no se fuerza uno.

---

## Sistema de filas

Sustituye el patrón anterior —"cada elemento es una `.card` con borde, todas
del mismo peso, y muchas con `onClick={() => navigate(...)}`"— por listas
agrupadas coherentes al estilo *Ajustes de iPhone*. Objetivo: que un
restyle de las filas sea **un solo sitio**, no pantalla por pantalla.

### Cuándo usarlo

- Pantallas que son sobre todo una lista de accesos, de datos o de acciones
  repetidas. Tras el rollout general (Fase 4) están en el sistema: **Yo**,
  Mi espacio, Clientes, Mis próximos pasos, Agenda, **Hoy**, ficha de
  cliente (todo el cuerpo), Vocabulario (Pendientes y Catálogo),
  Solicitudes de ayuda, Consumo por comercial, Clientes duplicados,
  Ubicaciones de cliente, y las listas dentro de los `detalle-*`
  (hallazgos / oportunidades / próximos pasos de una visita cerrada).
- **No** para el contenido rico de una pantalla (formularios —incluidos
  `detalle-oportunidad` / `detalle-hallazgo` / el cuerpo de
  `detalle-proximo-paso`—, la visita activa, alta rápida, cierre de visita,
  fotos/audios/prosa, chips de etiquetas): eso sigue siendo `.card` u otros
  componentes. Un formulario navegable es peor que un formulario.
- **Modos inline** (renombrar, mover, fusionar, confirmar borrado): se
  dibujan como `<div className="fila-confirmacion">` **dentro del grupo**
  (misma caja, separador y padding que las filas), nunca como una `.card`
  desprendida.

### Qué patrón de acción usar

Cuando una lista lleva acciones, el patrón depende de si la acción es la
misma para todos los elementos o distinta en cada uno:

- **Misma acción sobre varios elementos a la vez** (borrar visitas, anular
  visitas planificadas) → **modo seleccionar** (`seleccion?` en las filas +
  `BarraSeleccion`). Ver *Modo seleccionar — patrón de pantalla*.
- **Decisión distinta por elemento** (a quién asignar una reasignación, con
  qué cliente fusionar, renombrar / mover un término) → **`FilaAccion`**
  con sus botones de icono (y un modo inline `fila-confirmacion` para el
  paso siguiente si hace falta).
- **Bloque suelto que destaca y trae su propia acción** (el medidor de
  espacio, la copia de seguridad) → **`TarjetaAccion`**. Nunca dentro de
  una lista: una `TarjetaAccion` por fila es un muro de botones.

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
(flex columna, `gap: --space-6`, ancho completo). El tope de ancho para
escritorio lo pone ahora el marco de la app (`.app-shell`,
`--app-max-w`), no cada lista.

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
| `tono` | `'neutral' \| 'aviso' \| 'riesgo' \| 'ok' \| 'alerta'` | Por defecto `neutral`. Ver tabla de tonos. `alerta` solo en `FilaNavegable`. |
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
| `tono` | `'neutral' \| 'aviso' \| 'riesgo'` | Por defecto `neutral`. Tiñe **borde + título + `tarjeta-accion__estado` + relleno de `barra`**. No hay `ok` (una tarjeta con acción nunca es "todo correcto"). |
| `barra` | `number?` (0–100) | Barra fina de progreso/antigüedad entre el cuerpo y el botón (p. ej. días desde la última copia de seguridad). El relleno lo tiñe el `tono`. |
| `accion` | `AccionTarjeta?` | El botón único, abajo. Sin `accion` = tarjeta solo informativa. |
| `error` | `string?` | Línea de error bajo el botón (`field-error-text`). |

`AccionTarjeta`:

| Campo | Tipo | Notas |
|---|---|---|
| `etiqueta` | `string` | Texto del botón. |
| `icono` | `NombreIcono?` | Icono delante del texto, para acción concreta (hacer copia, planificar…). Ver §"Iconos". |
| `onClick` | `() => void` | |
| `disabled` | `boolean?` | |
| `cargando` | `boolean?` | Deshabilita el botón y muestra `etiquetaCargando`. |
| `etiquetaCargando` | `string?` | Por defecto `"Un momento…"`. |
| `enfasis` | `'primario' \| 'secundario'?` | Peso del botón. `primario` (relleno) cuando la acción urge — p. ej. la copia de seguridad cuando lleva demasiados días. Por defecto `secundario` (borde). |

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

**Secciones vacías: no se dibujan.** Una `SeccionLista` sin contenido
desaparece — nada de una fila "Sin X" de relleno que pese lo mismo que una
llena (rompe el punto 4 de la §"Prueba de usuario"). Si al quitar las
secciones vacías la pantalla se queda sin nada que un usuario haya
registrado, se pone **un** `EstadoLista` `vacio` con una frase que dice qué
hacer para llenarla (ej. ficha de cliente nueva: "Empieza una visita para
llenar la ficha"). Los accesos estructurales fijos (Ubicaciones, Borrar) y
la acción principal siguen visibles.

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

### Deslizar (swipe) — prop `swipe?` de `FilaNavegable`

Gesto **táctil** para revelar **una** acción por fila (en la app: "Anular"
en la Agenda). Deliberadamente limitado: el sistema de filas prioriza
acciones **visibles** (`FilaAccion`), así que el swipe solo se usa donde no
hay acción a la vista y entrar al detalle costaría un paso.

| Prop (`AccionSwipe`) | Tipo | Notas |
|---|---|---|
| `etiqueta` | `string` | Texto bajo el icono en la zona revelada. |
| `icono` | `NombreIcono` | |
| `onAccion` | `() => void` | Se ejecuta al pulsar la acción revelada (la fila se cierra sola antes). |
| `tono` | `'neutral' \| 'riesgo'` | `riesgo` = fondo rojo. |

Reglas:

- Solo puntero **no-ratón**: en escritorio no se arrastra (la acción sigue
  en el detalle / en modo seleccionar). Lo implementa `useSwipeFila`
  (`src/hooks/use-swipe-fila.ts`), sin librería de gestos.
- Bloqueo de eje: si el primer movimiento es vertical, se suelta para no
  romper el scroll. Se abre al pasar la mitad del ancho de la acción.
- Se desactiva mientras `seleccion.activa`.
- El ancho de la zona (`--swipe-accion-ancho`) debe coincidir con
  `ANCHO_SWIPE` del hook.

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
| `--swipe-accion-ancho` | Ancho de la zona de acción del gesto de deslizar (`96px`). |
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
| `alerta` | `--fila-tono-riesgo` | **solo la barra** de 3px a la izquierda | "Míralo" sin gritar: el título se lee normal, la barra llama la atención en una lista larga. Para el cliente frío ("Sin visitar") de la lista de Clientes, donde el nombre no debe ir en rojo. Solo `FilaNavegable`. |

El tono **no puede ser la única señal** (el usuario es daltónico, ver
§"Color y accesibilidad"): una fila con tono `aviso`/`riesgo`/`ok`/`alerta`
debe llevar además un icono, un `badge` o un `valor` con texto (p. ej. el
semáforo con forma+palabra en Clientes) que la distinga de una fila neutral.

### Reglas de estilo

- **Todo el texto de interfaz va en frase**: primera letra en mayúscula, el
  resto en minúscula, **no** en Mayúsculas Iniciales. Aplica a cabeceras de
  sección, etiquetas de campo (`.label`), subtítulos, títulos de `Modal`,
  placeholders de `<select>` y mensajes de estado. Ej.: «Correo»,
  «Inicia sesión para continuar», «Sin ubicación». (Los `placeholder=` de
  ejemplo dentro de un `<input>` sí pueden ir en minúscula: son pistas, no
  etiquetas.)
- Flecha `›` solo en filas que navegan (`to`); nunca en acciones.
- Toda la app va en una columna centrada en escritorio (`.app-shell`,
  `--app-max-w`, ~500 px); las filas usan `:hover` además de `:active`.
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

## Iconos — cuándo sí y cuándo no

Una sola regla para toda la app: el icono depende de **qué hace** el
control, no de en qué componente está. Todos salen del registro de
`src/components/ui/iconos.tsx` (trazo simple, `currentColor`); no se
dibujan `<svg>` a mano en las pantallas.

| Caso | Icono | Ejemplos |
|---|---|---|
| "Qué tipo de cosa es esto" (navegación, filas de lista) | **Sí, delante** | menú de abajo; `FilaNavegable` con `icono=` |
| **Verbo concreto sobre algo** | **Sí, delante** | Foto, Audio, Nota, Hallazgo, Oportunidad, Próximo paso, Iniciar recorrido, Descargar, Borrar, Compartir, Añadir, Empezar |
| Botón genérico de formulario o diálogo | **No, solo texto** | Guardar, Cancelar, Aceptar, Reintentar, Confirmar, Descartar |
| Chip de filtro / estado (no es una acción) | **No, solo texto** | Todos / Solo mías, Lista / Mes, Seleccionar |

En `.btn` (`.btn-primary` / `.btn-secondary`) el icono va **antes del
texto**, separado 8 px (`--space-2`), y hereda el color del texto:

```tsx
<button className="btn btn-primary">
  <Icono nombre="descargar" /> Descargar informe
</button>
```

Un botón sin icono se ve exactamente igual que antes. Los botones grandes
de captura de la visita (`.capture-btn`, columna) llevan el icono encima
del texto.

Para la fila compacta de iconos de una pantalla de detalle (el par
"descargar / borrar" de `detalle-*`) se usa **`FilaAccion`**, no dos `.btn`
grandes.

## Formatos de fecha y hora

Un solo sitio: `src/lib/fechas.ts`. Ninguna pantalla llama a
`new Date(x).toLocale…` directamente.

| Función | Sale | Para |
|---|---|---|
| `fechaCorta(x)` | `9 sept 2026` | listas, metadatos, "última visita", texto corrido |
| `fechaDiaMes(x)` | `mar 9 sept` | chips y filas donde el año sobra (esta semana / mes) |
| `fechaLarga(x)` | `martes, 9 de septiembre de 2026` | cabeceras y fechas destacadas (`FilaDato`) |
| `hora(x)` | `09:30` | siempre HH:MM, nunca "9h" ni "9:5" |

Aceptan ISO string o `Date`; devuelven `''` si el valor es nulo.

## Modales

Un solo componente, `Modal` (`src/components/ui/modal.tsx`), para todos los
diálogos. Antes cada modal de la visita se montaba a mano con
`position:fixed; inset:0` y una tarjeta pegada al borde inferior — sin
componente común y sin respetar el ancho de la app.

```tsx
<Modal titulo="qué queda pendiente" onCerrar={cerrar}>
  …contenido…
</Modal>
```

| Prop | Tipo | Notas |
|---|---|---|
| `titulo` | `string` | Cabecera en frase (primera en mayúscula), no en Mayúsculas Iniciales. |
| `onCerrar` | `() => void` | Lo llaman la × de la cabecera, la tecla `Esc` y tocar fuera de la tarjeta. |
| `children` | `ReactNode` | El contenido del diálogo. |

Reglas:

- **Diálogo centrado**, con caja, sobre la columna de la app (ancho
  `--app-max-w`). No es una hoja pegada a un borde.
- Fondo **gris opaco** (`--surface-0`), no un velo translúcido: la regla
  "sin transparencias sobre color" no se rompe. Por eso la tarjeta va
  centrada y con caja — para que se lea como diálogo aun con el fondo
  opaco.
- El contenido interno usa los componentes normales (`.field`, `.btn`,
  `.chip`, `SeccionLista`…). `Modal` solo pone el marco y la cabecera.

## Cabeceras

Dos componentes, uno por nivel:

- **`CabeceraSeccion`** (`src/components/ui/cabecera-seccion.tsx`) — las 4
  pantallas del menú de abajo (Hoy / Clientes / Tareas / Yo). Icono +
  título `--text-xl` peso 600, a la izquierda. Antes cada una ponía un
  `<h1>` suelto con estilos inline y sin icono. Props: `titulo`, `icono`,
  `subtitulo?`, `ayuda?`, `derecha?`.
- **`CabeceraDetalle`** (`src/components/ui/cabecera-detalle.tsx`) — las
  pantallas de detalle: flecha `‹` de volver + título (+ `subtitulo?`,
  `ayuda?`, `derecha?`). Ver la tabla de props en §"Sistema de filas".

`ayuda="<id>"` (una clave de `PANTALLAS` en `src/lib/ayuda.ts`) añade el "?"
que abre el `Modal` de ayuda de esa pantalla. Solo lo llevan las pantallas
con un concepto que se puede entender mal (un modo, un ciclo de vida, un
"mío vs del equipo"); las hojas de detalle que solo muestran un registro,
no. Ver §"Ayuda in-app".

## Ayuda in-app

Toda la ayuda al usuario —- textos escritos para el comercial, no para quien
programa-— sale de un único fichero: **`src/lib/ayuda.ts`**. Dos mapas
tipados, `PANTALLAS` (`EntradaPantalla`: `queEs` / `cuando` / `ojo?` /
`soloDireccion?`) y `CONCEPTOS` (`EntradaConcepto`: `queEs` / `cuando?` /
`ejemplo?` / `soloDireccion?`). Las claves son literales: un `ayuda="x"` o
`concepto="x"` que no exista no compila.

Tres superficies, todas leen de ese fichero (no tienen texto propio):

| Superficie | Componente | De dónde sale |
|---|---|---|
| "?" en la cabecera | `BotonAyuda` (lo montan `CabeceraSeccion` / `CabeceraDetalle` con la prop `ayuda`) → abre `Modal` | una entrada de `PANTALLAS` |
| Nota gris al pie de un campo | `<AyudaNota concepto="…" />` — `--text-xs` / `--ink-400`, una frase | el `queEs` de un `CONCEPTOS` |
| Manual completo `/ayuda` ("Cómo funciona PrimeNotes", fila en Yo) | `AyudaManual` — recorre los dos mapas, agrupa, busca, filtra por rol | ambos mapas |

Reglas:

- **Contenido por fricción, no por catálogo.** Se documenta lo que se
  entiende mal (cierre de visita, duplicados, naturaleza de hallazgo, tipo
  de fecha, semáforo, modo recorrido), no todas las pantallas por igual.
- **`soloDireccion: true`** en lo que solo maneja Dirección Comercial → no
  aparece en el manual de un comercial.
- **Se actualiza en el mismo commit** que el cambio de comportamiento
  (punto 8 de §"Prueba de usuario"). Un texto de ayuda que ya no es cierto
  es un bug.
- `npm run ayuda:cobertura` lista qué pantallas con cabecera aún no piden
  ayuda y qué entradas del diccionario no las usa nadie. Es un informe, no
  falla el build.

## Color y accesibilidad — nada se entiende solo por el color

El usuario principal es **daltónico** (rojo/verde). Regla no negociable:
**el color nunca es la única señal**. Cada punto donde el color carga
significado lleva además una segunda pista — forma de icono, palabra,
negrita o posición.

Dónde aplica y con qué segunda pista:

| Punto | Color | Segunda pista |
|---|---|---|
| Semáforo del cliente | verde / amarillo / rojo | `EtiquetaSemaforo`: icono de forma propia (✓ / – / △) + palabra ("Al día" / "Seguimiento" / "En riesgo") |
| Etiquetas de Ecosistema (`.eco-tag`) | rojo (riesgo) / rojo señal (oportunidad) / gris | fondo suave (no borde, no es un chip pulsable) + icono de forma (`atencion` / `oportunidad`) + el propio nombre del término |
| Mensajes (`Aviso`) | azul / ámbar / rojo / verde | icono de forma propia + palabra de tipo ("ATENCIÓN"…) |
| Tono de fila (`aviso` / `riesgo` / `ok`) | ámbar / rojo / verde | **la fila también debe llevar** un icono o un `badge` con texto que la distinga; el tono por sí solo no basta |
| "Oportunidad" (rojo `--signal-600`) | rojo | icono `oportunidad` (destello) delante del texto |
| Error de campo (`.field-error-text`) | rojo | va pegado al campo que falla + texto que dice qué corregir |

Si al añadir un elemento nuevo el único modo de leerlo es "porque es
rojo" o "porque es verde", falta la segunda pista.

## Mensajes (`Aviso`)

Un componente, `Aviso` (`src/components/ui/aviso.tsx`), para los mensajes
de pantalla (avisos, errores, confirmaciones). Sustituye a los
`<div style={{fontSize:'var(--text-xs)', color:'var(--ink-400)'}}>` sueltos
—gris minúsculo, se perdían— repartidos por el flujo de la visita.

```tsx
<Aviso tipo="atencion" titulo="Grabando">
  No bloquees la pantalla ni cambies de app o la grabación se cortará.
</Aviso>
```

| Prop | Tipo | Notas |
|---|---|---|
| `tipo` | `'info' \| 'atencion' \| 'error' \| 'exito'` | Por defecto `info`. Fija el icono, la palabra y el color de acento. |
| `titulo` | `string?` | Reemplaza la palabra de tipo por defecto ("Atención"…). |
| `children` | `ReactNode` | El texto del mensaje. |

- Cada tipo tiene un **icono de forma distinta** (ℹ / △ / ⊗ / ✓) y una
  **palabra** ("INFO" / "ATENCIÓN" / "ERROR" / "HECHO"): se distinguen sin
  ver el color.
- Tamaño `--text-sm` (no `--text-xs`): un aviso tiene que verse.
- `role="alert"` para `error`, `role="status"` para el resto.
- Para el error corto pegado a un campo de formulario se sigue usando
  `.field-error-text` (no un `Aviso` con caja).
