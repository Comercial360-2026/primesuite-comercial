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

## Informe de la visita en SharePoint (migraciones 139-140)
Cada visita cerrada puede dejar su `informe.html` (con fotos y mapa) en su carpeta de SharePoint, como «Informe de la visita (cerrada AAAA-MM-DD HH-MM).html». **Sin tocar el flujo de Power Automate:** el worker (fase 1b) pide el HTML a `generar-backup-visita` con la clave del worker y lo manda por el MISMO webhook como un archivo más con `captura_id = 'informe:<visita_id>'`; el flujo lo descarga, lo crea y llama a `confirmar-archivado-sharepoint`, que reconoce el prefijo, comprueba el tamaño contra el bucket `backups-visita` y anota `visita.informe_sharepoint_en/ruta`.
- Interruptor `ajustes_app.archivado_informe_activo` (**apagado**): encendido, copia el informe de TODAS las visitas cerradas que no lo tengan (máx. 3 por pasada de 10 min; un informe con fotos puede pesar ~20 MB). Prueba/reintento de una sola: POST al worker con `{"visita_id": "…", "informe": true}`.
- Si se reabre una visita y se vuelve a cerrar, el informe se copia otra vez (nombre con la hora del nuevo cierre; el anterior se queda). Cambios hechos después del cierre no regeneran el informe.
- Fallos: `visita.informe_intentos` (máx. 5, 15 min entre intentos). No hay aviso en Yo para informes agotados (pendiente si hace falta).
- Probado el 2 oct con la visita de Verescence: informe creado en su carpeta, confirmación con tamaño coincidente, ejecución «Succeeded» en Power Automate, segunda pasada sin reenviar, reabrir/recerrar lo deja pendiente.

## Duplicados
Si el flujo sube un archivo y falla justo la confirmación, el reintento crea «Foto 14-32-05 (reintento …).jpg». No se borra solo: el aviso de Gestión lo cuenta y se limpia a mano en SharePoint.

## Borrar visita/cliente
La app NO borra en SharePoint (decisión: SharePoint es el archivo histórico). Las confirmaciones de borrado dicen cuántos archivos se conservan allí. Alternativas en `../pendiente-borrado-sharepoint.md`.
