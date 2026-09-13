# Prompt maestro 11 — "Anotar": nota por defecto, hallazgo/oportunidad opcional

Sustituye el enfoque del **Paso 2 del prompt maestro 10** (que forzaba clasificar
con 4 pastillas). Aquí "Anotar" vuelve a ser, ante todo, **escribir una nota**.

## Problema con lo que había

- "Anotar" obligaba a elegir 1 de 4 (*Dato del cliente / Competencia / Me preocupa /
  Oportunidad de venta*), con "Dato del cliente" premarcado. El comercial tiene que
  decidir el tipo antes de escribir, delante del cliente.
- "Dato del cliente" no se entiende: es "ninguna de las otras" disfrazada de etiqueta.
- "Me preocupa" / "Competencia" no aportan si nadie usa luego una vista que los
  filtre; el comercial ya lo escribe en el texto.
- El contador y el informe decían "hallazgos" aunque el comercial solo había "anotado".

## Modelo acordado con Cesar

El comercial captura de todo: foto, audio, **anotar**, próximo paso. Dentro de
"Anotar":

1. **Cuadro de texto** (escribir o dictar). Guardar así → **nota**. Es el caso normal.
2. Una línea: **"Se guarda como nota. Márcalo si además es:"** con dos opciones,
   **excluyentes**, se elige una o ninguna:
   - **Algo que tienen** *(hallazgo)* — algo del cliente; alimenta el "Ecosistema".
   - **Algo para venderles** *(oportunidad)* — entra en el pipeline (etapas, prioridad).
3. Si marca **hallazgo** → aparece el **área** (opcional): el catálogo de vocabulario,
   un solo selector, te quedas en la categoría (Software, Hardware, Identificación,
   Integraciones…) o bajas al término exacto. **Varias áreas a la vez.**
4. Si marca **oportunidad** → aparece **Prioridad** (+ pantalla "Completar ahora"
   que ya existe).
5. **Botón que cambia de nombre**: *Guardar nota · Guardar hallazgo · Guardar
   oportunidad*. Aunque ignores la línea 2, al guardar ves que había más opciones.

Reglas:
- **Nunca las dos a la vez en caliente.** El caso "es hallazgo Y oportunidad" es raro
  y se resuelve **después**: se guarda como oportunidad y desde su ficha un toque
  "esto también es un hallazgo" crea el hallazgo enlazado (mismo texto y área).
- **Convertir más tarde**: cualquier nota, desde su ficha, "convertir en hallazgo /
  en oportunidad".
- **La zona se estampa sola** en todo lo que se captura (si hay zona activa → esa
  zona; si no → general). "Anotar" igual que el resto. Ya funciona así.
- Palabras iguales en todos lados: **Nota · Hallazgo · Oportunidad** — en la hoja,
  en "En esta visita", en el informe y en la vista de proyecto.

### Dónde vive cada cosa

| | Visita + informe PDF | Actividad del proyecto | Repaso pre-visita | Ecosistema del cliente |
|---|---|---|---|---|
| **Nota** | sí | sí | sí (recomendado) | no |
| **Hallazgo** | sí | sí | sí | sí (por área/término) |
| **Oportunidad** | sí | sí (pipeline) | sí | no |

### Cómo sabe el comercial que puede clasificar

- **Puede**: cada nota en "En esta visita" se abre al tocarla; en su ficha están
  "Marcar como hallazgo / oportunidad".
- **Tiene pendiente**: en la pantalla de **Cerrar visita** (que ya repasa todo y
  ya avisa) se añade un texto informativo — *"Tienes N notas. Repásalas por si
  alguna es un hallazgo o una oportunidad."* con las notas tocables. **No bloquea.**
- Nada de buzón global ni contador que persigue. No toda nota se clasifica.

## Fases

### Fase 1 — la hoja "Anotar" + enrutado  ← ESTA SESIÓN
- `anotar-hoja.tsx`: quitar las 4 pastillas obligatorias. Texto → "márcalo si
  además es: [Algo que tienen] [Algo para venderles]" (excluyente, o ninguna) →
  botón que cambia de nombre.
- Enrutar el guardado:
  - ninguna → **nota** = `captura_libre` tipo `'nota'` (la fontanería ya existe).
  - hallazgo → `hallazgo` (con `naturaleza='contexto'` fijo e invisible por ahora;
    el término opcional se queda como está — el área multi es Fase 2).
  - oportunidad → `oportunidad` + prioridad + "Completar ahora" (igual que hoy).
- `visita-activa.tsx`: handler `guardarNota(texto)` que encola la captura_libre;
  pasar `onGuardarNota` a `AnotarHoja`.
- "En esta visita": las notas ya abren `/capturas/:id`; hallazgos abren
  `/hallazgos/:id`; oportunidades `/oportunidades/:id`. (Filas abribles: hecho.)
- `detalle-hallazgo.tsx`: **ocultar** el selector de "Naturaleza" (sigue guardando
  'contexto' por debajo; el `NOT NULL` se quita en fase posterior).
- Aviso de primera vez en la hoja (1 línea, se oculta tras usarla un par de veces).
- Verificar en vivo: crear nota, hallazgo y oportunidad; comprobar que cada una
  cae donde toca y se puede abrir/revisar.

### Fase 2 — área multi-selección (sesión nueva)
- Selector de área = categorías del catálogo de vocabulario, con opción de bajar
  al término. Multi. Toca base de datos (una tabla puente hallazgo↔área/término, o
  equivalente). Aplica a hallazgo (y a oportunidad si se decide).

### Fase 3 — fichas de detalle + convertir/editar después  ← HECHA (commit `891d2f2`)
- Ficha de nota mínima: texto + editar + borrar (sin "naturaleza", sin "archivar"). Ya
  estaba en `detalle-captura`; se le añadió **fallback a Supabase** cuando la nota no
  está en la cola local (visita cerrada u otro dispositivo) + `useVolverA`.
- "Esto es: Nota · Hallazgo · Oportunidad" (`<Segmentado>`) en las 3 fichas, componente
  `src/features/visita/recategorizar-item.tsx` + `src/lib/recategorizar.ts`.
- **Motor**: migración 107 `recategorizar_item` (RPC `SECURITY DEFINER`). Mueve de tabla
  **reutilizando el id**, una transacción, sin perder nada (texto, título → antepuesto,
  zona, ubicación, `creado_en` original; fecha relevante del hallazgo → al texto al
  degradarlo). FKs entrantes a hallazgo/oportunidad a NULL antes de borrar.
- **Áreas del catálogo**: se hibernan en `item_hallazgo_hibernado` al salir de hallazgo y
  **vuelven solas** al remarcar como hallazgo. 3 triggers `AFTER DELETE` limpian el
  hibernado si el item se borra de verdad.
- **Guard**: una oportunidad no `latente`, o con términos / seguimiento / próximos pasos,
  no se degrada (mensaje claro). Solo autor o Dirección pueden cambiar de tipo.
- Editar y borrar con la visita cerrada: **la RLS de las 3 tablas ya lo permitía** (autor
  o Dirección, sin candado por `estado_captura`) y el informe se **regenera con datos
  vivos** en cada descarga (`generar-backup-visita` reconstruye el ZIP siempre) — no hace
  falta paso extra.
- Aviso no bloqueante en "Cerrar visita": *"N notas. Si alguna es «algo que tienen» o
  «algo para venderles», ábrela y márcala."* — **solo si hay notas y no se ha marcado
  ningún hallazgo ni oportunidad** en la visita.
- `detalle-visita-cerrada`: las notas del anexo pasan a fila navegable (`.dvc-bloque--accion`).
- **Resumen automático** (`visita.resumen_texto` con `resumen_origen = 'reglas'`): se
  **rehace** con el contenido actual tras convertir/editar/borrar una nota, hallazgo u
  oportunidad de una visita ya cerrada — así no dice "2 notas" cuando ya hay "1 nota y 1
  hallazgo". Un resumen escrito a mano (`'manual'`) NO se toca. `src/lib/regenerar-resumen.ts`,
  cableado en RecategorizarItem, detalle-captura, detalle-hallazgo, detalle-oportunidad.

**Verificado en vivo (punta a punta)**: visita de prueba cerrada — aviso "Notas sin
clasificar"; nota abrible/editable/borrable con la visita cerrada leyendo de Supabase;
convertir tras cerrar; resumen `'reglas'` se rehace, `'manual'` se respeta.

**Sitios tocados**: `detalle-captura.tsx` (reescrito), `detalle-hallazgo.tsx`,
`detalle-oportunidad.tsx`, `detalle-visita-cerrada.tsx`, `cierre-visita.tsx`,
`recategorizar-item.tsx` (nuevo), `lib/recategorizar.ts` (nuevo), `styles/components.css`,
`lib/ayuda.ts`, `types/database.ts`, `supabase/migrations/107_recategorizar_item.sql` (nuevo).

**Bug PRE-EXISTENTE de Fase 2 ARREGLADO**: en `detalle-hallazgo.tsx` el
`useEffect([areasCargadas]) → setAreas` (+ `refetchOnWindowFocus` activo, `main.tsx` solo
pone `staleTime`) reejecutaba `setAreas`/`setNota` en cada refetch y **borraba lo editado
sin guardar**. Ahora el formulario se siembra del servidor **una sola vez por hallazgo**
(refs `camposSembradosRef` / `areasSembradasRef`).

**Fuera de Fase 3 (a propósito — no tocado):**
- **Foto y audio no se pueden marcar como hallazgo/oportunidad**: el selector "Esto es"
  solo sale en `tipo === 'nota'`. Si un comercial fotografía "rack viejo" y quiere que sea
  hallazgo, hoy no puede. PM11 no lo contempla.
- **Editar el título de una foto/audio con la visita cerrada**: `detalle-captura` ya lee de
  Supabase, así que técnicamente se podría — pero `detalle-visita-cerrada` no enlaza fotos
  ni audios a su ficha (abren visor / `<audio>` inline). Hueco paralelo, no de PM11.
- Columnas `captura_libre.hallazgo_id` / `oportunidad_id`: siguen dormidas (con "mover" no
  se usan). Quitar en Fase 5.
- **Permiso "no eres autor ni Dirección"**: el `motivoBloqueo` y el selector inerte están
  implementados y revisados en código (mismo patrón que `detalle-visita-cerrada` con
  "Borrar"), pero NO probado con dos usuarios distintos en vivo.
- Verificación PM11: typecheck + lint + build + `ayuda:cobertura` OK; `deno test --no-check
  supabase/functions/_shared/informe-pdf.test.ts` = 6/6 (módulo PDF sin cambios en Fase 3).
  La RPC 107 se validó en vivo (las 4 direcciones + guard + hibernación ida y vuelta +
  permisos del autor), sin test SQL automatizado.

### Fase 4 — informe y vista de proyecto  ← HECHA (commit local, sin push)

Migración **108** `ecosistema_por_categoria` (aplicada en dev).

- **Informe PDF (`_shared/informe-pdf.ts`)**: `bloquesHallazgos` deja de agrupar
  por naturaleza. Cada hallazgo = su **nota** en negrita + línea gris con sus
  **áreas** (`hallazgo_area`: categorías y términos, término antes que
  categoría) + vence + zona. `HallazgoRow` pierde `naturaleza`/`termino`, gana
  `areas: AreaHallazgoRow[]`. Nuevo helper `areasDeFilaHallazgo(embed)`. Test
  `informe-pdf.test.ts` actualizado (el ESPERADO y el fixture `HALL`).
- **`generar-backup-visita`**: consulta `hallazgo` con embed
  `hallazgo_area(categoria(nombre), termino(nombre, parent(nombre)))`. Secciones
  y orden como la app: Resumen · Objetivo · **Notas** (fija, con estado vacío) ·
  **Hallazgos** · **Oportunidades** · **Próximos pasos** · anexos. KPI "Riesgos
  detectados" → **"Hallazgos"** (sin naturaleza no se calcula). Redesplegada.
- **`generar-informe-proyecto`**: mismo embed; cada visita de la cronología gana
  subsección **Notas** (texto de cada nota) antes de Hallazgos; el orden pasa a
  Notas · Hallazgos · Oportunidades · Próximos pasos; la línea "Adjuntos" ya no
  cuenta notas. Redesplegada.
- **`ActividadProyecto`** (ficha de proyecto, dirección incluida): sección
  **Notas** — las 5 notas más recientes del proyecto, fila navegable a
  `/capturas/:id`.
- **Repaso pre-visita** (`repaso-cliente`): bloque **Notas** (3 últimas notas
  del cliente, solo lectura) tras Ecosistema.
- **Ecosistema por categoría** (opción (b)): `src/lib/ecosistema.ts`
  (`cargarEcosistemaCliente`, compartido por ficha-cliente y repaso, antes
  duplicado). La matview `vw_ecosistema_actual_cliente` (migración 108, drop +
  recreate) emite además **una fila por categoría de solo-categoría** con
  `termino_id` NULL + `categoria_id`/`categoria_nombre`; se **omite si el
  cliente ya tiene un término de esa categoría** (CTE `cats_cubiertas`) y se
  **excluyen los hallazgos archivados** (antes no). `<EcoTag tipo="categoria">`
  = gris tenue, borde punteado, sin naturaleza (`.eco-tag--categoria`). El cron
  `refrescar-ecosistema-actual` (cada 10 min, `REFRESH … CONCURRENTLY`) sigue
  igual — índice único `(cliente_id, termino_id, categoria_id) nulls not
  distinct`.
- `ayuda.ts`: `repaso-cliente` y `ficha-proyecto` al día. `database.ts`: Row de
  la vista con `categoria_id` / `categoria_nombre`.

**Verificado en vivo (Comercial Prueba)**: ficha-cliente y repaso de GABITEL
muestran "Hardware"/"Software" como EcoTag de categoría en gris punteado;
repaso de SAPA muestra el bloque Notas (3 notas); ficha de proyecto de SAPA
muestra la sección Notas. `generar-backup-visita` y `generar-informe-proyecto`
devuelven 200 y el texto extraído del PDF confirma el orden y las palabras
nuevas (Notas · Hallazgos · Oportunidades · Próximos pasos; hallazgo = nota +
áreas, sin chips de naturaleza). typecheck + lint + build + `deno test` +
`ayuda:cobertura` OK.

Pendiente conocido, **a propósito para Fase 5**: `detalle-visita-cerrada`
sigue agrupando hallazgos por naturaleza (subcabeceras "Me preocupa"…) y el
KPI "N riesgo(s)"; la ayuda `naturaleza-hallazgo` sigue en `ayuda.ts` sin
`<AyudaNota>`.

### Fase 5 — migración y limpieza  ← HECHA (commit local, sin push)

Migración **109** `retirar_naturaleza_hallazgo` (aplicada en dev). "Lo que no
sirve se quita" — se **borra** `naturaleza`, no se deja nullable.

- **BD (migración 109)**:
  - Hallazgos `riesgo`/`competencia` conservan la marca como línea al final de
    la nota (`(Marcado antes como «Me preocupa».)` / `«Competencia»`); los
    `contexto` no llevaban info → nada que conservar.
  - `hallazgo.naturaleza` (+ CHECK), `hallazgo.termino_id` (+ FK),
    `captura_libre.hallazgo_id` / `.oportunidad_id` (+ FKs) → **DROP COLUMN**.
  - Vistas sin uso en la app → **DROP**: `vw_resumen_visita`,
    `vw_mapa_hallazgos_ubicacion`.
  - `vw_ecosistema_actual_cliente` (matview) recreada sin `naturaleza` (drop +
    recreate, resto igual que la 108; REFRESH CONCURRENTLY probado OK).
  - Funciones ajustadas: `fn_fusionar_termino` (quita el `update hallazgo set
    termino_id`), `recategorizar_item` (deja de insertar `naturaleza='contexto'`
    y de anular `captura_libre.hallazgo_id`).
- **Front**:
  - `etiquetas-visita.ts`: fuera `NATURALEZA_ORDEN` / `NATURALEZA_LABEL`.
  - `EcoTag`: sin prop `naturaleza` — solo `tipo` (`termino` | `categoria`).
    `ecosistema.ts` / `cargarEcosistemaCliente` no leen `naturaleza`; orden =
    términos antes que categorías. CSS: fuera `.eco-tag--riesgo` /
    `--competencia` y `.seccion-lista__subcabecera--riesgo`; tokens
    `--purple-600` / `--purple-050` retirados.
  - `detalle-visita-cerrada`: hallazgos = **lista plana** (sin subcabeceras por
    naturaleza); KPI "N riesgos" → **"N hallazgos"** (neutro).
  - `resumen-visita.ts` / `regenerar-resumen.ts` / `cierre-visita`: el resumen
    "por reglas" ya no separa riesgos; una línea **`Hallazgos: …`** con la nota
    de cada uno. Fuera el termino-name resolver (muerto desde Fase 2).
  - `visita-activa` (`tituloHallazgo(nota)`), `hoja-detalle-cierre`,
    `detalle-hallazgo`, `recategorizar.ts`, `HallazgoPayload` /
    `CapturaLibrePayload`: fuera `naturaleza` / `terminoId` / `hallazgoId` /
    `oportunidadId`. `sync-engine.sincronizarHallazgo` borra un `naturaleza`
    residual del payload (colas viejas en IndexedDB).
  - `ayuda.ts`: entrada `naturaleza-hallazgo` eliminada. `ayuda-nota.tsx`:
    comentario al día.
  - `database.ts`: parche a mano (quitar `naturaleza`/`termino_id` de `hallazgo`,
    `hallazgo_id`/`oportunidad_id` de `captura_libre`, `naturaleza` de la vista
    de ecosistema, bloques `vw_resumen_visita` / `vw_mapa_hallazgos_ubicacion`).
    Quedan `referencedRelation` sueltos a esas 2 vistas en arrays de
    `Relationships` (inertes para `tsc`; se limpian en el próximo
    `generate_typescript_types`).
- **Datos de prueba**: el hallazgo `PRUEBA CLAUDE fase5…` (GABITEL) creado y
  borrado por Claude (BD + cola local). Las visitas GEWING/GABITEL/TOTAL/CNMC de
  Cesar, intactas.

**Verificado en vivo (Comercial Prueba)**: `detalle-visita-cerrada` de SAPA
sin subcabeceras de naturaleza y KPI "3 hallazgos"; nota preservada
"(Marcado antes como «Me preocupa».)" visible; ecosistema de GABITEL sigue
pintando términos + categorías; "Anotar" → Hallazgo (con área) guarda e
sincroniza sin `naturaleza` (7 hallazgos, "todo subido"); `detalle-hallazgo`
carga, edita y borra sin errores (cascada de `hallazgo_area` OK). typecheck +
lint + build + `deno test` (6/6) + `ayuda:cobertura` OK.

## Verificación (cada fase)
typecheck + lint + build + `ayuda:cobertura` + `deno test --no-check` del módulo
PDF. En vivo con la sesión Comercial Prueba (localhost).
