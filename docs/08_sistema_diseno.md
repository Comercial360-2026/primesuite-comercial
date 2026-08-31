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
| `valor` | `string?` | Texto a la derecha, antes de la flecha (p. ej. `"72%"`). |
| `badge` | `string \| number?` | Contador pequeño. No se dibuja si es `0`, `''` o `undefined`. |
| `tono` | `'neutral' \| 'aviso' \| 'riesgo' \| 'ok'` | Por defecto `neutral`. Ver tabla de tonos. |
| `densidad` | `'normal' \| 'compacta'` | Por defecto `normal` (alto `--fila-min-h`, icono 20). `compacta` = alto 44, icono 18, para listas densas. |
| `chevron` | `boolean?` | Fuerza mostrar/ocultar la flecha. Por defecto: visible solo con `to`. |
| `disabled` | `boolean?` | Solo efectivo en la variante `onClick`. |

#### Reservados en el contrato — *no implementados todavía*

Se construyen cuando la pantalla que los necesita entre en su fase:

- `FilaDato` — etiqueta + valor a la derecha, solo lectura, sin acción.
- `FilaAccion` — cuerpo con `onClick` + `acciones[]` de icon-buttons.
- `EstadoLista` — cargando / vacío / sin conexión / error (unifica la
  tarjeta de "isPaused" repetida en ~5 sitios).
- `TarjetaAccion` — bloque informativo + 1 botón (p. ej. la copia de
  seguridad, el medidor de espacio).
- `CabeceraDetalle` — el `‹ Título` hecho a mano en ~12 pantallas.
- Prop `seleccion?: { activa; marcada; onToggle }` en las filas
  (multi-selección para borrado) y `FilaToggle`.

### Tokens — bloque "Filas" (`tokens.css`)

| Token | Uso |
|---|---|
| `--fila-min-h` | Alto táctil mínimo de una fila (`52px`). |
| `--fila-pad-x` / `--fila-pad-y` | Márgenes del contenido (`16px` / `12px`). |
| `--fila-separador` | Línea fina entre filas (`1px solid --ink-100`). |
| `--fila-activa-bg` | Fondo al pulsar / al pasar el ratón. |
| `--fila-icono` | Color del icono de la izquierda. |
| `--fila-chevron` | Color de la flecha `›`. |
| `--seccion-cabecera` | Color del título gris de la sección. |
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
