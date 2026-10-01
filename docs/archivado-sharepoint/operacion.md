# Archivado a SharePoint — operación (qué mirar y qué hacer si falla)

Estado 2 oct 2026. Diseño en `diseno.md`; esto es el manual de guardia.

## Cómo funciona (resumen)
Cron `procesar-archivado-sharepoint` cada 10 min → worker (Edge Function) → webhook del flujo de Power Automate «Archivar visita a SharePoint» → el flujo sube cada archivo y llama a `confirmar-archivado-sharepoint` (comprueba tamaño). Fase 1 copia al cerrar la visita; fase 2 libera el original a los N días (`ajustes_app.archivado_dias_liberar`, 30) y solo si `ajustes_app.archivado_liberar_activo` = true.

## Dónde se ve que algo va mal
- **Yo → Gestión → «Copia a SharePoint»** (solo Dirección): archivos esperando copia desde hace > 2 h, copias agotadas tras 5 intentos y posibles duplicados «(reintento …)» de los últimos 14 días. Tocar el aviso reinicia los intentos de las agotadas.
- **Visita cerrada** (Dirección): motivo de cada fallo (`error_archivado`).

## Si la copia se para
1. Comprobar el flujo en Power Automate (¿activo?, ¿conexión de SharePoint válida?, ¿historial de ejecuciones?). **El flujo es propiedad de `cesar.borrego@primion.eu` y usa su conexión de SharePoint: si esa cuenta cambia de contraseña, licencia o se da de baja, la copia se detiene** (los archivos siguen a salvo en Supabase; no se libera nada sin copia confirmada). Recomendado: añadir un segundo propietario al flujo.
2. Cuando el flujo vuelva a funcionar: tocar el aviso de Yo → Gestión (o `select fn_reintentar_archivado();` con sesión de Dirección). El cron retoma en ≤ 10 min.
3. Reprocesar una visita concreta a mano: POST a `procesar-archivado-sharepoint` con cabecera `x-clave-worker` y cuerpo `{"visita_id": "…"}`.

## Interruptores (tabla `ajustes_app`)
| clave | valor | efecto |
|---|---|---|
| `archivado_liberar_activo` | false/true | false: no se borra ningún original. **Activar solo cuando la app con soporte de capturas archivadas (PR #16) esté en producción.** |
| `archivado_dias_liberar` | `valor_numero` (30) | días tras el cierre antes de liberar el original. Subirlo si se quiere conservar más tiempo el original. |

## Duplicados
Si el flujo sube un archivo y falla justo la confirmación, el reintento crea «Foto 14-32-05 (reintento …).jpg». No se borra solo: el aviso de Gestión lo cuenta y se limpia a mano en SharePoint.

## Borrar visita/cliente
La app NO borra en SharePoint (decisión: SharePoint es el archivo histórico). Las confirmaciones de borrado dicen cuántos archivos se conservan allí. Alternativas en `../pendiente-borrado-sharepoint.md`.
