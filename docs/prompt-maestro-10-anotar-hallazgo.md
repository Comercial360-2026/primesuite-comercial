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
