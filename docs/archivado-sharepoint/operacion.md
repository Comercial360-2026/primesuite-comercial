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

## Informe de la visita en SharePoint (migraciones 139-142)
Cada visita cerrada puede dejar en su carpeta de SharePoint DOS archivos: «Informe de la visita (cerrada AAAA-MM-DD HH-MM).pdf» (se previsualiza en SharePoint/Teams; coordenadas de las fotos con enlace a Google Maps) y el mismo `.html` (mapa interactivo con pines; SharePoint no lo previsualiza: hay que descargarlo y abrirlo, y el mapa necesita conexión). **Sin tocar el flujo de Power Automate** (que no tiene historial de versiones: es un flujo no-solución): el worker (fase 1b) pide cada formato a `generar-backup-visita` con la clave del worker y los manda por el MISMO webhook como archivos más, con `captura_id = 'informe-pdf:<visita_id>'` o `'informe:<visita_id>'`; el flujo (Apply to each: HTTP GET → Create file → Confirmar archivado) los trata como cualquier foto y `confirmar-archivado-sharepoint` los reconoce por el prefijo, comprueba el tamaño contra `backups-visita` y anota `visita.informe_*` (HTML) / `visita.informe_pdf_*` (PDF), cada formato por separado.
- **El HTML es una página navegable** (`_shared/informe-html.ts`): menú lateral a la izquierda con conmutador «Por tipo / Por zona» y contadores (todo lleva su zona: hallazgos, oportunidades, notas, próximos pasos, audios, documentos y fotos), lo seleccionado en el centro, mapa fijo a la derecha con los pines de las fotos que se ven (en móvil el menú baja desde arriba y el mapa va sobre el contenido solo en Fotos y en vista por zona), selección en la URL (`#notas`, `#zona-2`), buscador global, visor de fotos (flechas, teclado, deslizar), impresión lineal sin menú ni mapa, y botones «Original» / «Escuchar» / «Abrir» hacia SharePoint (`?web=1` para que el audio se reproduzca en SharePoint en vez de descargarse; solo funcionan para quien tenga acceso a la carpeta). El mapa usa teselas de **CARTO**, no OpenStreetMap: OSM devuelve 403 a las páginas sin Referer (`blob:` y archivos descargados; reproducido en Chrome). Las fotos van como **miniaturas** (~60 KB; 34 fotos: 2,7 MB en vez de 21,6): reducirlas cuesta CPU y una petición tiene ~2 s, así que se hace con presupuesto y se guarda en caché (`backups-visita/miniaturas/<captura>.jpg`, se vacía solo a las 2 h); el worker las «calienta» con `formato: 'miniaturas'` hasta que no quede pendiente y lo que no dé tiempo va con el original. El informe espera a que la visita no tenga copias pendientes (los enlaces necesitan la ruta en SharePoint).
- En la app, la fila «Informe web» de una visita cerrada tiene «Abrir» (pestaña nueva, sin descargar) y «Descargar».
- Los informes se suben 2 h a `backups-visita` (Supabase) para que el flujo los descargue y la limpieza los borra; solo quedan en SharePoint.
- Interruptor `ajustes_app.archivado_informe_activo` (**apagado**): encendido, copia el informe de TODAS las visitas cerradas que no lo tengan (máx. 2 visitas por pasada de 10 min; un informe HTML con fotos puede pesar ~20 MB — con 34 fotos funcionó; el límite real es la memoria de la función, sin medir). Prueba/reintento de una sola: POST al worker con `{"visita_id": "…", "informe": true}`.
- Reabrir y volver a cerrar una visita copia los informes otra vez (nombre con la hora del nuevo cierre; los anteriores se quedan). Cambios posteriores al cierre no regeneran el informe.
- Fallos: `visita.informe_intentos` (máx. 5, 15 min entre intentos). No hay aviso en Yo para informes agotados (pendiente si hace falta).
- Probado el 2 oct con la visita de Verescence: HTML y PDF creados en su carpeta, confirmaciones con tamaño coincidente, ejecuciones «Succeeded» en Power Automate, segunda pasada sin reenviar, reabrir/recerrar los deja pendientes.

## Duplicados
Si el flujo sube un archivo y falla justo la confirmación, el reintento crea «Foto 14-32-05 (reintento …).jpg». No se borra solo: el aviso de Gestión lo cuenta y se limpia a mano en SharePoint.

## Borrar visita/cliente
La app NO borra en SharePoint (decisión: SharePoint es el archivo histórico). Las confirmaciones de borrado dicen cuántos archivos se conservan allí. Alternativas en `../pendiente-borrado-sharepoint.md`.
