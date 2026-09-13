# Prompt maestro 10 — "Anotar": un solo gesto de captura, naturaleza recortada

## Problema

En la visita, los botones "Hallazgo" y "Oportunidad" obligan al comercial a
decidir el tipo ANTES de escribir, delante del cliente. Y "Señal de
oportunidad" como naturaleza de hallazgo pisa a la entidad Oportunidad
(mismo dato en dos listas). "Contexto" no se entiende.

## Solución (decidida con Cesar)

Captura primero, clasifica después. Botones de la visita: **Foto · Audio ·
Anotar · Próximo paso** (de 6 a 4; desaparecen "Hallazgo", "Oportunidad" y
"Nota" como botones sueltos).

**"Anotar" (hoja superior):**
1. Cuadro grande: escribir o dictar lo que has visto.
2. "¿Qué es?" — 4 chips: **Dato del cliente · Competencia · Me preocupa ·
   Oportunidad de venta**. Por defecto "Dato del cliente" (escribir + Guardar
   y listo).
3. Según el chip:
   - **Oportunidad de venta** → aparece **Prioridad** (baja/media/alta/
     estratégica); el texto es el título. Se guarda como **Oportunidad**
     (entidad), con el "Completar ahora" que ya tenía la hoja rápida.
   - Los otros tres → aparece, **opcional**, "¿de qué marca o sistema?" (el
     término del catálogo, ya no obliga). Se guarda como **hallazgo** con esa
     naturaleza.

## Naturaleza de hallazgo — nuevo set

`riesgo` · `competencia` · `contexto`. Se quitan `oportunidad`, `fortaleza`,
`proyecto_activo`.

| valor | etiqueta nueva |
|---|---|
| `contexto` | Dato del cliente |
| `competencia` | Competencia |
| `riesgo` | Me preocupa |

## Cambios

### Migración (Supabase, no toca Netlify)
- Backfill `hallazgo`: `fortaleza`/`proyecto_activo`/`oportunidad` → `contexto`
  (los `oportunidad` NO se convierten a Oportunidad retroactivamente).
- Drop CHECK viejo; nuevo CHECK `naturaleza in ('contexto','riesgo','competencia')`.
- `vw_semaforo_cliente` y RPCs: verificado que no usan naturaleza.

### Etiquetas (2 espejos)
- `src/lib/etiquetas-visita.ts`: `NATURALEZA_ORDEN` = `['riesgo','competencia','contexto']`;
  `NATURALEZA_LABEL` con las etiquetas nuevas.
- `supabase/functions/_shared/informe-pdf.ts`: mismo cambio + `NATURALEZA_COLOR`
  (quitar las 3 que sobran).
- `supabase/functions/_shared/informe-pdf.test.ts`: actualizar asserts de dicts.

### Captura
- Nuevo `src/features/visita/anotar-hoja.tsx` (fusión de `hallazgo-rapido-hoja`
  + `oportunidad-rapida-hoja`). Borrar esos dos.
- `visita-activa.tsx`: grid 6→4; montar `AnotarHoja`; enrutar el guardado
  (payload hallazgo vs oportunidad). Quitar el flujo de "Nota" suelto.
- `src/lib/offline-queue/types.ts`: `HallazgoPayload['naturaleza']` = union nueva.

### Pantallas
- `detalle-hallazgo.tsx`: selector de naturaleza (3 chips) + término editable
  opcional.
- `ficha-cliente.tsx` "Ecosistema" + `eco-tag.tsx`: colores por naturaleza
  (3), y los hallazgos sin término no entran en Ecosistema (ya era así por
  término; ahora hay más sin término).
- Barrido de labels/colores/recuentos de naturaleza: `resumen-visita.ts`,
  `cierre-visita.tsx`, `hoja-detalle-cierre.tsx`, `detalle-visita-cerrada.tsx`,
  `actividad-proyecto.tsx`, `repaso-cliente.tsx`, `selector-termino.tsx`.
- `tokens.css` / `components.css`: variables de color de naturaleza que sobren.

### Ayuda
- `ayuda.ts` + `ayuda-nota.tsx`: reescribir `naturaleza-hallazgo`, `hallazgo`,
  `oportunidad`. `npm run ayuda:cobertura`.

### Informes
- Bloque de hallazgos del PDF (visita y proyecto): agrupa por
  `NATURALEZA_ORDEN` → cubierto por el módulo compartido. KPI "Riesgos" igual.
- "Notas de la visita" del PDF: queda condicional (solo visitas antiguas con
  `captura_libre` tipo nota). Redesplegar `generar-backup-visita` y
  `generar-informe-proyecto`.

## Verificación
- typecheck + lint + build + `ayuda:cobertura` + `deno test` del módulo compartido.
- En vivo: "Anotar" con los 4 chips; oportunidad con "Completar ahora"; PDF de
  una visita con hallazgos de las 3 naturalezas; Ecosistema de la ficha.
- Migración aplicada; 2 edge functions redesplegadas.

---

## ESTADO — Paso 1 hecho (sesión 2026-09-10, commit `3c3ccc2`)

Naturaleza 6→3 ya cerrado y barrido: `etiquetas-visita.ts`, `_shared/informe-pdf.ts`
+ test, `offline-queue/types.ts`, `eco-tag`, `resumen-visita`, `cierre-visita`,
`ayuda.ts`, `tokens.css`. Migración **100** `hallazgo_naturaleza_recorte` aplicada.
Edge functions `generar-backup-visita` y `generar-informe-proyecto` redesplegadas.

## ESTADO — Paso 2 hecho (sesión 2026-09-11, en local, sin push)

**Migración 105** `hallazgo_termino_opcional` — `alter table hallazgo alter column
termino_id drop not null`. Aplicada en `primesuite-comercial-dev`. Fichero local en
`supabase/migrations/105_...sql`. `src/types/database.ts` (Row/Insert/Update de
`hallazgo`) → `termino_id: string | null`.

### Nuevo / borrado
- **Nuevo** `src/features/visita/anotar-hoja.tsx` — cuadro de texto + `useDictado`
  propio + "¿Qué es?" (4 chips: Dato del cliente / Competencia / Me preocupa /
  Oportunidad de venta). "Oportunidad de venta" → Prioridad + guarda Oportunidad
  con pantalla "Completar ahora / Listo, sigo en la visita". Los otros 3 →
  hallazgo con `naturaleza` = el chip, `nota` = el texto, `terminoId` opcional
  (SelectorTermino bajo "¿De qué marca o sistema? (opcional)").
- **Borrados** `hallazgo-rapido-hoja.tsx` y `oportunidad-rapida-hoja.tsx`.

### `visita-activa.tsx`
- Grid capture 6→4: **Foto · Audio · Anotar · Próximo paso**.
- Fuera todo el flujo "Nota" suelto: estados `notaAbierta/notaTitulo/notaTexto/
  notaDictadoProvisional`, `guardadoNota`, `dictadoNota`, `notaTextoEnVivo`,
  funciones `cerrarNota`/`guardarNota`, el `<HojaSuperior titulo="Nota">`, el
  import `useDictado`. (Las notas viejas ya guardadas se siguen leyendo.)
- `oportunidadAbierta` fuera; `hallazgoAbierto` → `anotarAbierto`. Monta
  `<AnotarHoja>` con `onGuardarHallazgo` / `onGuardarOportunidad` /
  `onCompletarOportunidad`.
- Helper nuevo `tituloHallazgo(termino, nota, naturaleza)` → término ?? nota ??
  etiqueta de naturaleza. Usado en las 3 filas de hallazgo ("por zona", "En esta
  visita" propio y de compañeros). Query de compañeros añade `nota` al select.
- `terminoIdsHallazgos` filtra `Boolean` antes del `.in()`.
- Textos: empty-state "Toca Foto, Audio o Anotar"; aviso de espacio lleno
  "Anotar y Próximo paso siguen funcionando".

### Null-guards de término (barrido completo)
- `cierre-visita.tsx` — `terminoIdsHallazgos` filtra Boolean; `terminoNombre` pasa
  `''` cuando no hay término (388 ya lo trataba desde Paso 1).
- `lib/resumen-visita.ts` — riesgos y "También anotado" usan la nota cuando no
  hay término; se filtran los vacíos.
- `hoja-detalle-cierre.tsx` — título = término ?? etiqueta naturaleza ??
  "Anotación"; la naturaleza no se repite en meta si ya es el título.
- `detalle-visita-cerrada.tsx` — título = `termino_nombre` ?? etiqueta naturaleza.
- `actividad-proyecto.tsx` — `HallazgoAbierto` añade `nota`; select añade `nota`;
  título = término ?? nota ?? etiqueta naturaleza (activos y archivados).
- `repaso-cliente.tsx` / `ficha-cliente.tsx` — YA filtraban `termino_id !== null`
  (sin término no entra en Ecosistema). Sin cambios salvo quitar el ternario
  muerto `naturaleza === 'oportunidad'` del sort de `ficha-cliente`.
- `detalle-hallazgo.tsx` — el término pasa a **editable opcional**
  ("Marca o sistema (opcional)" con SelectorTermino / "quitar"); `guardar()`
  manda `termino_id: termino?.id ?? null`.
- PDF (`_shared/informe-pdf.ts`) — ya tenía `term ? … : 'Hallazgo'` desde Paso 1.
  Paso 2 no toca el módulo compartido → **no hace falta redesplegar** las 2 edge
  functions esta vez (ya se redeplegaron en Paso 1 con el módulo actual).

### Ayuda
- `visita-activa` (6→4 botones, describe "Anotar"), `detalle-hallazgo` (se crea
  desde "Anotar", marca/sistema opcional), `naturaleza-hallazgo` (título "Qué
  significa lo que anotas", 4 opciones incl. "Oportunidad de venta"),
  `detalle-oportunidad` (se crea desde "Anotar"). `ayuda:cobertura` sin nuevos
  huecos.

### Verificado en vivo (localhost, sesión Comercial Prueba, visita GABITEL)
- Grid de 4. "Anotar" → texto + "Dato del cliente" → hallazgo con `termino_id
  NULL`, `naturaleza contexto`, sincronizado ("todo subido"). Confirmado en BD.
- "Anotar" → "Oportunidad de venta" + Prioridad Alta → Oportunidad creada,
  pantalla "Completar ahora / Listo, sigo en la visita".
- "En esta visita" y cierre muestran "Dato del cliente" + la nota (no "Término").
- Sin errores de consola. Datos de prueba borrados de BD y de la cola local.

Verde + limpio: typecheck + lint + build + `deno test --no-check` del módulo PDF
(6/6). `ayuda:cobertura` sin regresión.
