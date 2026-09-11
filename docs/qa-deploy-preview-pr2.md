# QA — Deploy Preview PR #2 (237 commits, feature/proyectos → main)

URL: https://deploy-preview-2--rococo-gumption-efb70a.netlify.app
Supabase: dev (`umrjzvpbcpzzqmkjahhn`) — confirmado por red, no toca prod.
Sesión: Comercial Prueba (login manual de Cesar en el Preview, cuenta nueva
en ese origen). Borja en incógnito: pendiente, no accesible desde la
extensión de Chrome (ventana incógnito aislada) — checks de permiso
marcados como bloqueados hasta que Cesar lo confirme desde su ventana.

Formato: pantalla/flujo → resultado → [A/B/C] si hay hallazgo.

## Arranque
- `/` Hoy carga sin errores de consola. Red confirma dev Supabase. ✅

## Modelo Proyectos (Cliente → Proyecto → Visita)
- Ficha de cliente GABITEL: proyectos como filas ("Proyecto principal",
  "Tornos en planta de Portugal", "Ver terminados (1)"), sin "General"
  fantasma. Historial de visitas etiquetado por proyecto. ✅
- Ecosistema (PM11 Fase 4): "125"/"Spec" (términos, neutro) + "Software"/
  "Hardware" (categorías, gris punteado) — el modelo por categoría vive en
  el Preview igual que en dev. ✅ Sin errores de consola.
- Repaso de cliente (SAPA): Ecosistema + bloque **Notas** (3 notas, título +
  texto + fecha). ✅
- Ficha de proyecto (SAPA · Proyecto principal): sección **Notas** (3),
  Historial de visitas, botón "Informe del proyecto". ✅ Sin errores.
- Detalle de visita cerrada (SAPA, cerrada): chip "3 hallazgos" (neutro, no
  "riesgos"); Hallazgos en lista plana sin subcabeceras de naturaleza. ✅
- **Informe de visita**: botón "Descargar informe" → genera y descarga
  (1.2 MB) end-to-end desde el build real de producción (no localhost). Sin
  errores de consola. ✅ (No se abrió el PDF para leer el texto exacto de las
  secciones — ya verificado por extracción de texto en Fase 4 contra la
  misma edge function.)

## [B] Bug encontrado y corregido — fantasma en "En esta visita" al borrar

Anotar → Hallazgo (GEWING, en curso) → guardar (con área Hardware) → abrir su
ficha → Borrar hallazgo → confirmar. La fila borrada (confirmado en BD:
`hallazgo` count 0) **seguía apareciendo en "En esta visita"** incluso tras
recargar la página entera — un fantasma de verdad, no un problema de caché
en memoria.

Causa: `detalle-hallazgo.tsx` borraba la fila de Supabase pero nunca llamaba
a `eliminarOperacion(id)` para quitar la copia local de IndexedDB (la cola
offline). Mismo bug ya encontrado y corregido antes en nota
(`detalle-captura.tsx`) y oportunidad (`detalle-oportunidad.tsx`, con su
propio comentario "BUG CORREGIDO") — nunca se aplicó a hallazgo. Barrido de
toda la app: **próximo paso** (`detalle-proximo-paso.tsx`) tenía el mismo
hueco. Interlocutor y vocabulario no participan de la cola offline, no les
aplica.

**Corregido** (commit `ce8f402`, subido — el Preview se reconstruye solo):
`eliminarOperacion(id)` tras el borrado en servidor en `detalle-hallazgo.tsx`
y `detalle-proximo-paso.tsx`, igual que en los otros dos. typecheck+lint+
build verdes. Datos de prueba de esta sesión borrados (BD + IndexedDB del
Preview).

**Re-probado tras el rebuild (commit `ce8f402` en el Preview)**: Anotar →
Hallazgo → guardar → abrir ficha → Borrar → confirmar → "En esta visita"
pasa a "Aún no has capturado nada" al instante, sin recargar. BD confirma
0 filas. Sin errores de consola. ✅
Repetido con **Próximo paso** (el otro sitio corregido): mismo resultado,
sin fantasma, BD confirma 0 filas. ✅ **Cerrado.**

## Resumen

- **1 bug encontrado y corregido** (fantasma en "En esta visita" al borrar
  hallazgo/próximo paso), re-probado y cerrado.
- Todo lo demás probado (modelo Proyectos, ecosistema por categoría, Notas
  en repaso/actividad de proyecto, detalle de visita cerrada sin naturaleza,
  informe de visita, Anotar) — sin errores de consola, comportamiento
  correcto.
- **No probado**: permisos con Borja (ventana incógnito, no accesible desde
  la extensión de Chrome de esta sesión); resto del backlog de "qué más
  queda" (fuera del alcance de esta QA, es trabajo posterior al PR).
- Datos de prueba de esta QA borrados (BD + IndexedDB del Preview).

