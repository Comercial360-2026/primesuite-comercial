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
- Detalle de visita cerrada (SAPA, cerrada): chip "3 hallazgos" (neutro, no
  "riesgos"); Hallazgos en lista plana sin subcabeceras de naturaleza. ✅
- **Informe de visita**: botón "Descargar informe" → genera y descarga
  (1.2 MB) end-to-end desde el build real de producción (no localhost). Sin
  errores de consola. ✅ (No se abrió el PDF para leer el texto exacto de las
  secciones — ya verificado por extracción de texto en Fase 4 contra la
  misma edge function.)

