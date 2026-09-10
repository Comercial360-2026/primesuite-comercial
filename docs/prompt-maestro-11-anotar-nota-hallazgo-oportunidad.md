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

### Fase 4 — informe y vista de proyecto
- PDF (visita y proyecto): secciones **Notas · Hallazgos · Oportunidades ·
  Próximos pasos**, con las mismas palabras que la app. Redesplegar
  `generar-backup-visita` y `generar-informe-proyecto`.
- "Actividad del proyecto" (dirección): añadir sección **Notas**.
- Repaso pre-visita: incluir las notas.

### Fase 5 — migración y limpieza
- Hallazgos viejos: se dejan como hallazgos; su `naturaleza` actual se conserva
  como una línea de texto en la nota/comentario (dejamos de usar el concepto).
- Quitar el `NOT NULL` / `CHECK` de `hallazgo.naturaleza` cuando ya no se use.
- Limpiar datos de prueba (visitas GEWING/GABITEL/TOTAL/CNMC de Comercial Prueba
  las limpia Cesar; lo que haya creado Claude probando, lo borra Claude).
- Textos de ayuda: `visita-activa`, ficha de nota, `detalle-hallazgo`,
  `detalle-oportunidad`. Quitar/rehacer `naturaleza-hallazgo`. `ayuda:cobertura`.

## Verificación (cada fase)
typecheck + lint + build + `ayuda:cobertura` + `deno test --no-check` del módulo
PDF. En vivo con la sesión Comercial Prueba (localhost).
