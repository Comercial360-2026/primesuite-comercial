# Prompt maestro — gestionar-sectores: modo Seleccionar

**Rama:** `feature/proyectos`. **Fecha:** 2026-09-07. **Pendiente #1** del recorrido.

## Pantalla

`/sectores` (`src/features/clientes/gestionar-sectores.tsx`) — catálogo de
sectores, **solo Dirección**. Alimenta el desplegable "Sector" de "Editar datos"
del cliente. Renombrar aquí NO reescribe los clientes que ya usan el nombre.

## Problema

Cada sector es un `<div>` a mano (flex) con acciones como `.btn-enlace` en
minúscula pegados: **"renombrar" · "quitar" / "restaurar"**, y en modo edición
**"guardar" · "cancelar"**. Cinco `.btn-enlace` sueltos (regla #12). No usa
`SeccionLista` / `FilaNavegable` ni ningún patrón de la app.

## Análisis por perfiles

- **Director (usuario):** en la misma app gestiona el catálogo de **vocabulario**
  con modo "Seleccionar" + `BarraSeleccion` (renombrar / mover / quitar). Aquí
  hace lo mismo (renombrar, ocultar) con otro gesto —enlaces de texto—. Debe ser
  el mismo gesto en las dos pantallas de catálogo.
- **Diseñador Apple:** enlaces de texto en minúscula sueltos = patrón muerto,
  no es el idioma de la app (filas, chips, modo seleccionar). `<div>` a mano en
  vez de `SeccionLista`.
- **Comercial:** no ve esta pantalla.

## Cambios

### 1. Filas dentro de `SeccionLista`

Cada sector = `FilaNavegable` (dentro de la `SeccionLista titulo="Catálogo"` que
ya existe), sin `to`/`onClick` de navegación (no navega): el cuerpo es inerte
salvo en modo seleccionar. Título = nombre; si `!activo`, añadir " · oculto" en
gris y `tono` tenue (mantener el `opacity: 0.5` actual vía una clase o el patrón
de fila que ya exista). Se elimina el `<div>` a mano.

### 2. Modo "Seleccionar" (igual que vocabulario / interlocutores)

- Estado local: `seleccionando: boolean`, `marcados: Set<string>`.
- Fuera de modo seleccionar: un chip **"Seleccionar"** arriba a la derecha
  (aparece si hay ≥1 sector), enciende el modo. Mismo sitio y estilo que en
  `directorio-interlocutores` / `cola-vocabulario`.
- En modo seleccionar: cada `FilaNavegable` recibe `seleccion={{ activa: true,
  marcada: marcados.has(s.id), onToggle: () => alternarMarcado(s.id) }}`.
- Barra `<BarraSeleccion n={marcados.size} onCancelar={salirSeleccion}
  acciones={[…]} />` encima de la lista.

### 3. Acciones de la barra

1. **Renombrar** — `icono: 'editar'`, `disabled: marcados.size !== 1`. Al pulsar:
   `setRenombrando(id)` + `setBorrador(nombre)` del único marcado, y sale del
   modo seleccionar. Reutiliza el `renombrando` / `borrador` que ya existe.
2. **Ocultar (N)** / **Restaurar (N)** — etiqueta y acción según lo marcado:
   - todos los marcados `activo` → "Ocultar (N)", `icono: 'oculto'`.
   - todos los marcados `!activo` → "Restaurar (N)", `icono: 'restaurar'`.
   - mezcla, o 0 → `disabled`, cuenta a 0.
   Ejecuta `alternarActivo` sobre cada marcado (secuencial, reutilizando
   `cambio.ejecutar`), refresca y sale del modo.

Iconos nuevos en `iconos.tsx` (Phosphor ya instalado):
`oculto: EyeSlash`, `restaurar: ArrowCounterClockwise`.

### 4. Renombrado inline sin `.btn-enlace`

Cuando `renombrando === s.id`, la fila se sustituye por una `card` (mismo patrón
que la edición de interlocutor en `directorio-interlocutores.tsx`): `input`
autofocus + fila de botones `[.btn-secondary "Cancelar"] [.btn-primary
"Guardar"]`. Enter guarda, Escape cancela. Se eliminan los `.btn-enlace`
"guardar" / "cancelar".

### 5. "Añadir sector" — sin cambios

La `card` de arriba (input + `.btn-primary "Añadir"`) se queda: es la acción de
crear, no un `.btn-enlace`, y funciona. (Nota: vocabulario movió "+ Categoría"
al "+" de la cabecera; aquí NO se hace en este pase para acotar el cambio.)

## Qué NO se toca

- Las queries (`sectores-todos`, `sectores-activos`), `anadir`, `renombrar`,
  `alternarActivo`, `refrescar` — misma lógica.
- El texto de ayuda al pie ("Quitar solo lo saca del desplegable…") — sigue
  valiendo; si acaso cambiar "Quitar" → "Ocultar" para casar con el botón nuevo,
  y actualizar `ayuda.ts` (entrada `gestionar-sectores`) en el mismo commit.

## Verificación

- `typecheck` + `lint` + `build`.
- Chrome de pruebas (sesión de Dirección): entrar en `/sectores`;
  1. "Seleccionar" → marcar 1 → "Renombrar" abre el input inline; guardar y
     cancelar sin `.btn-enlace`.
  2. Marcar 2 activos → "Ocultar (2)" → pasan a "· oculto".
  3. Marcar los 2 ocultos → "Restaurar (2)".
  4. Marcar 1 activo + 1 oculto → acción deshabilitada.
- `grep -n "btn-enlace" src/features/clientes/gestionar-sectores.tsx` → 0.
- Captura de la pantalla en reposo y en modo seleccionar.
- `graphify update .`
