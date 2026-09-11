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

## [C] Bug encontrado y corregido — guardar (no solo borrar) fallaba en silencio sin permiso

Probado en vivo con **Borja** (comercial normal, sesión aparte): abre un
hallazgo de Comercial Prueba en la visita cerrada de SAPA (la RLS de
`select` lo deja ver porque la visita está `consolidada`), edita la nota,
pulsa Guardar → antes de corregir, la app decía "guardado ✓" y volvía atrás
sin haber tocado nada (confirmado en BD: 0 filas afectadas, verificado
también con un PATCH directo a PostgREST: `content-range: */0`). Mismo
encargo técnico que ya se documentó y corrigió para el **borrado**
(`adenda_punto1_delete_silencioso.md`: sin permiso, Supabase no da error,
"tiene éxito" afectando a 0 filas) pero nunca se aplicó al **guardado**.

**Corregido** (commit `640d9f5`): comprobación de `count` + mensaje de error
en las 4 pantallas de "Guardar" con el mismo patrón RLS (autor/responsable
o Dirección Comercial): `detalle-hallazgo.tsx`, `detalle-oportunidad.tsx`,
`detalle-captura.tsx` (nota), `detalle-proximo-paso.tsx` (guardar y
"marcar hecho" — este último ni siquiera comprobaba `error`).

**Re-probado con Borja tras el rebuild**: hallazgo → Guardar → "No se ha
podido guardar (0 filas afectadas)…", se queda en la pantalla, BD sin
cambios. ✅ Borrar → mismo hallazgo → "No se ha podido borrar (0 filas
afectadas)…". ✅ Nota → Guardar → "No se pudo actualizar. Si la nota ya
estaba sincronizada, puede que falte permiso de edición en el servidor.",
BD sin cambios. ✅

**No verificado en vivo con Borja** (por alcance de datos, no por el fix):
oportunidad (RLS de `select` no lo dejaba ver ninguna de SAPA — no es
participante de esas visitas) y próximo paso (mismo motivo). El código es
idéntico al ya probado dos veces; typecheck+lint+build verdes.

**No auditado**: el resto de `.update()` de la app fuera de estas 4
pantallas (vocabulario, proyecto, interlocutor, participantes…). La
mayoría son pantallas de Dirección o actúan sobre un recurso recién creado
por el propio usuario — menor riesgo, pero queda pendiente como revisión
aparte si se quiere ir más allá de PM11.

## Resumen

- **2 bugs encontrados y corregidos**, ambos re-probados y cerrados:
  - [B] fantasma en "En esta visita" al borrar hallazgo/próximo paso.
  - [C] guardar (no solo borrar) fallaba en silencio sin permiso — probado
    en vivo con Borja, el más importante de los dos (podía hacer creer a
    un comercial que había editado algo de otro cuando no había pasado nada).
- Todo lo demás probado (modelo Proyectos, ecosistema por categoría, Notas
  en repaso/actividad de proyecto, detalle de visita cerrada sin naturaleza,
  informe de visita, Anotar) — sin errores de consola, comportamiento
  correcto.
- **Login de Borja**: lo hizo Cesar a mano en una pestaña normal (no
  incógnito) — la extensión de Chrome no puede entrar en ventanas de
  incógnito ni escribir contraseñas.
- **No auditado**: el resto de `.update()` de la app fuera de las 4
  pantallas corregidas (vocabulario, proyecto, interlocutor,
  participantes…) — revisión aparte si se quiere ir más allá de PM11.
- Datos de prueba de esta QA borrados o sin persistir (BD, IndexedDB del
  Preview y caché/service worker de la pestaña de prueba).

