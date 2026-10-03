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
| `espacio_manual_activo` | false/true | false (por defecto, migración 143): se oculta la liberación MANUAL de espacio —pantalla «Mi espacio», petición de Dirección, avisos que mandan a ella— porque la liberación automática a los 30 días la sustituye. Apagado, «Yo» solo muestra el % del pozo del equipo (Dirección) y el banner de pozo lleno informa sin enlace. La protección de cuota (cortar fotos y audios con el pozo lleno) no depende de este interruptor. |

## Informe de la visita en SharePoint (migraciones 139-142)
Cada visita cerrada puede dejar en su carpeta de SharePoint DOS archivos: «Informe de la visita (cerrada AAAA-MM-DD HH-MM).pdf» (se previsualiza en SharePoint/Teams; coordenadas de las fotos con enlace a Google Maps) y el mismo `.html` (mapa interactivo con pines; SharePoint no lo previsualiza: hay que descargarlo y abrirlo, y el mapa necesita conexión). **Sin tocar el flujo de Power Automate** (que no tiene historial de versiones: es un flujo no-solución): el worker (fase 1b) pide cada formato a `generar-backup-visita` con la clave del worker y los manda por el MISMO webhook como archivos más, con `captura_id = 'informe-pdf:<visita_id>'` o `'informe:<visita_id>'`; el flujo (Apply to each: HTTP GET → Create file → Confirmar archivado) los trata como cualquier foto y `confirmar-archivado-sharepoint` los reconoce por el prefijo, comprueba el tamaño contra `backups-visita` y anota `visita.informe_*` (HTML) / `visita.informe_pdf_*` (PDF), cada formato por separado.
- **El HTML es una página navegable** (`_shared/informe-html.ts`): menú lateral a la izquierda con conmutador «Por tipo / Por zona» y contadores (todo lleva su zona: hallazgos, oportunidades, notas, próximos pasos, audios, documentos y fotos), lo seleccionado en el centro, mapa fijo a la derecha con los pines de las fotos que se ven (en móvil el menú baja desde arriba y el mapa va sobre el contenido solo en Fotos y en vista por zona), selección en la URL (`#notas`, `#zona-2`), buscador global, visor de fotos (flechas, teclado, deslizar), impresión lineal sin menú ni mapa, y botones «Original» / «Escuchar» / «Abrir» hacia SharePoint (`?web=1` para que el audio se reproduzca en SharePoint en vez de descargarse; solo funcionan para quien tenga acceso a la carpeta). El mapa pide las teselas a la función **`tile-mapa`** (proxy de OpenStreetMap, desplegada con `--no-verify-jwt`, pública, solo z/x/y numéricos): pedirlas directo falla en las páginas sin Referer (`blob:` y archivos descargados) —OSM devuelve una imagen de «acceso bloqueado» con código 200— y CARTO devuelve «API KEY REQUIRED» (visto en Chrome y Safari). Las fotos van como **miniaturas** (~60 KB; 34 fotos: 2,7 MB en vez de 21,6): reducirlas cuesta CPU y una petición tiene ~2 s, así que se hace con presupuesto y se guarda en caché (`backups-visita/miniaturas/<captura>.jpg`, se vacía solo a las 2 h); el worker las «calienta» con `formato: 'miniaturas'` hasta que no quede pendiente y lo que no dé tiempo va con el original. El informe espera a que la visita no tenga copias pendientes (los enlaces necesitan la ruta en SharePoint).
- En la app, la fila «Informe web» de una visita cerrada tiene «Abrir» (pestaña nueva, sin descargar) y «Descargar».
- Los informes se suben 2 h a `backups-visita` (Supabase) para que el flujo los descargue y la limpieza los borra; solo quedan en SharePoint.
- Interruptor `ajustes_app.archivado_informe_activo` (**apagado**): encendido, copia el informe de TODAS las visitas cerradas que no lo tengan (máx. 2 visitas por pasada de 10 min; un informe HTML con fotos puede pesar ~20 MB — con 34 fotos funcionó; el límite real es la memoria de la función, sin medir). Prueba/reintento de una sola: POST al worker con `{"visita_id": "…", "informe": true}`.
- Reabrir y volver a cerrar (migración 148, 3 oct): SIN cambios en el contenido NO se genera informe nuevo (la reapertura ya no borra las marcas; `informe_huella` guarda una huella del contenido al confirmarse el informe y el cierre la compara). CON cambios (captura, hallazgo, oportunidad, paso, resumen, objetivo) se genera uno nuevo «(rev …)» y el anterior se queda en SharePoint. `visita.veces_reabierta` cuenta las reaperturas. Cambios posteriores al cierre sin reabrir no regeneran el informe.
- Fallos: `visita.informe_intentos` (máx. 5, 15 min entre intentos). Los informes agotados se avisan en Yo → Gestión → «Copia a SharePoint» (migración 147, ver abajo).
- Probado el 2 oct con la visita de Verescence: HTML y PDF creados en su carpeta, confirmaciones con tamaño coincidente, ejecuciones «Succeeded» en Power Automate, segunda pasada sin reenviar, reabrir/recerrar los deja pendientes.

## Copia de seguridad de las tablas (migración 144)
Cron `copia-seguridad-diaria` (03:30 UTC) → Edge Function `generar-copia-seguridad` (desplegada `--no-verify-jwt`; auth propia: clave del worker o sesión de Dirección). Solo actúa si no hay una copia confirmada de hace < 7 días ni una enviada hace < 30 min; si el flujo falló, reintenta al día siguiente. Lee las 23 tablas con service_role (paginando de 1000 en 1000), sube el JSON a `backups-visita` (como `application/octet-stream`: con `application/json` Power Automate añade 3 bytes de BOM y la confirmación por tamaño falla) y lo manda por el MISMO webhook: `Copias de seguridad/Base de datos/Últimas copias/primenotes-copia-AAAA-MM-DD-HHMM.json` dentro de `PrimeNotes - Comerciales`, sin tocar el flujo (usa `carpeta_cliente/proyecto/visita` como carpetas). El flujo confirma en `confirmar-archivado-sharepoint` con `captura_id = 'copia:<registro_id>'` (compara tamaño). Estado en `registro_backup_completo` (`enviada` → `confirmada` | `fallida`, ruta, tamaño, filas por tabla, error). Yo → «Copia de seguridad» (Dirección): «Hacer copia ahora» = misma función con `forzar`; aviso si pasan 8 días sin confirmada o la última falló.
- **No entran:** `crm_*` (se recargan del CRM), `consulta_ia`, los archivos de visitas no cerradas.
- **Permisos (a mano en SharePoint):** la carpeta `Copias de seguridad` cuelga de `PrimeNotes - Comerciales`; romper la herencia y dejarla solo a Dirección/IT (el JSON trae todos los clientes).
- **Retención (HECHA y probada 3 oct):** flujo programado «PrimeSuite - Rotar copias de seguridad» (lunes 04:00, Madrid; propietario cesar.borrego@primion.eu; falta segundo propietario). Estructura: Recurrence → «Get files (properties only)» (biblioteca Documentos, carpeta `…/Copias de seguridad/Base de datos/Últimas copias`, Order By `FileLeafRef desc`, sin anidados) → «Apply to each» sobre `skip(outputs('Get_files_(properties_only)')?['body/value'], 8)` → «For each» sobre `createArray(items('Apply_to_each'))` → «Delete file» con id = contenido dinámico «Identificador» (`items('For_each')?['{Identifier}']`). Conserva las 8 más recientes por nombre y borra el resto (papelera de SharePoint ~93 días). Cuenta copias, no días: si dejan de llegar, no borra nada. Probado: con skip 1 y 2 copias borra solo la más antigua; con skip 8 y 1 copia no borra nada.
  - **Trampas del diseñador (costaron horas):** (1) el campo File Identifier es un selector de archivos: una expresión escrita queda como texto literal (sin `@`) → «NotFound»; solo vale contenido dinámico. (2) Insertar «Identificador» desde Get files dentro de un bucle sobre `skip(...)` crea un bucle `For each` interior sobre TODA la lista → borraba todo; por eso el `For each` interior se rehace con `createArray(items('Apply_to_each'))`. (3) Un flujo programado apagado no se puede ejecutar (ni Run ni Test). (4) El «Starting/Week» del diálogo de creación no se guardó: salió «Minute»; revisar siempre el disparador.
- **Techo:** el JSON entero en memoria (límite del bucket 50 MB); si se acerca, partir por tabla.
- Restaurar: sin procedimiento probado todavía.

## Duplicados
Si el flujo sube un archivo y falla justo la confirmación, el reintento crea «Foto 14-32-05 (reintento …).jpg». No se borra solo: el aviso de Gestión lo cuenta y se limpia a mano en SharePoint.

## Borrar visita/cliente
La app NO borra en SharePoint (decisión: SharePoint es el archivo histórico). Las confirmaciones de borrado dicen cuántos archivos se conservan allí. Alternativas en `../pendiente-borrado-sharepoint.md`.

## Prueba del interruptor `espacio_manual_activo` (3 oct 2026, local, usuario Dirección)
Apagado: «Yo» muestra «Espacio del equipo 2%» y `/mi-espacio` redirige a `/yo`. Encendido: «Yo» muestra «Almacenamiento» y `/mi-espacio` carga (2 visitas, 15,7 MB, 2%). Vuelto a apagar y comprobado. Valor final: false.

## Prueba del interruptor `archivado_informe_activo` (3 oct 2026)
Encendido a las ~10:04 UTC; el cron de las 10:10 copió el informe de SAPA (la única visita cerrada sin informe; Verescence ya lo tenía del 2 oct): `informe_sharepoint_en` = 10:11:06 UTC, 0 intentos, ruta `…/SAPA/Accesos/2026-09-17 Visita/Informe de la visita (cerrada 2026-09-23 16-29).html`. Sin errores. No borra nada. Estado tras la prueba: ENCENDIDO (decidido por Cesar el 3 oct: se queda encendido).
`archivado_liberar_activo`: NO probado a propósito (borra originales; requiere PR #16 en producción). Hoy no liberaría nada: ninguna captura pasa de 30 días (Verescence cumple el 14 oct, SAPA el 23 oct).

## Informe a SharePoint: memoria y reintentos (comprobado 3 oct)
- **Tiempo medido** (SAPA, 34 fotos, pasada de las 10:10 UTC): 8 llamadas de miniaturas de 5-8 s y una generación de 55,8 s. Límite de pared de la función: 150 s (gratuito) / 400 s (de pago): margen ~2,7x con ese informe. **Memoria: NO medida** (los registros no la dan); si un informe la supera, falla como cualquier otro error.
- **Fallo encontrado y arreglado:** el intento se marcaba DESPUÉS de generar; si la generación fallaba antes, `informe_intentos` no avanzaba y la visita se reintentaba cada 10 min sin fin, ocupando una de las 2 plazas por pasada. Ahora el `catch` marca el intento (`fn_marcar_intento_informe` con rutas nulas, que no pisa las existentes): 5 intentos con 15 min de espera. Función `procesar-archivado-sharepoint` v14 desplegada.
- **Probado:** el RPC con nulos (sube `informe_intentos`, pone `informe_intento_en`, conserva `informe_storage_path`); restaurado a 0. **Sin probar con un fallo real** de generación.
- **Sin comprobar:** visita reabierta y vuelta a cerrar (el aviso tras 5 fallos se resolvió con la migración 147).

## Aviso de informes agotados (migración 147, 3 oct)
- Tras 5 intentos fallidos (`visita.informe_intentos >= 5`) la visita deja de reintentarse. Ahora Yo → Gestión → «Copia a SharePoint» lo cuenta («N informe(s) de visita sin copiar tras 5 intentos») y suma al punto de la pestaña Yo. Tocar el aviso (`fn_reintentar_archivado`) devuelve esos informes a la cola con 5 intentos más (el cron los retoma en ≤10 min).
- El motivo del último fallo queda en `visita.informe_error` (solo por SQL; no se muestra en la app). Función `procesar-archivado-sharepoint` v16.
- Probado el 3 oct con estado simulado (no se provocó un fallo real de generación para no romper la generación de una visita real): visita de SAPA con `informe_intentos=5` y PDF a null → aviso visible en Yo; al tocarlo `informe_intentos`=0 y error vacío; valores restaurados. El camino del `catch` (marcar intento + guardar motivo) se probó antes a nivel de RPC, no con un fallo real.
- Qué hacer si salta: comprobar el flujo de Power Automate (activo, conexión de SharePoint) y `select informe_error from visita where informe_intentos >= 5;`, y tocar el aviso.

## Reabrir y volver a cerrar sin duplicados (migración 148, 3 oct)
- Probado en transacción con rollback sobre una visita real (se dejó intacta): reabrir conserva las marcas; cerrar sin cambios las conserva; cerrar tras cambiar el objetivo las borra (informe nuevo) y `veces_reabierta` pasa a 2.
- Quien puede reabrir directo: el responsable de la visita y Dirección (trigger `fn_proteger_reabrir_visita`); el resto, por solicitud. La app pide confirmación y avisa del informe nuevo.
- Abierto: `ajustes_app.visita_autocierre_horas` está APAGADO (18 h si se enciende): una visita reabierta y olvidada no se cierra sola y mientras tanto no la ve el resto de la empresa.

## Límites de subida (comprobados 3 oct)
- Servidor (bucket de Storage, no se puede saltar desde la app): fotos 15 MB (jpeg/png/webp), audios 30 MB, documentos 25 MB (pdf, Word, Excel, PowerPoint, txt, csv). Probado con la API: un doc de 26 MB y una foto de 16 MB devuelven «EntityTooLarge» (413); uno de 1 MB entra.
- App (avisa antes de subir): documentos > 25 MB → «pesa más de 25 MB. Prueba con una versión más ligera»; foto > 12 MB tras comprimir → «pesa demasiado incluso comprimida». Probado en pantalla con archivos de 26 y 16 MB. Audio: la grabación se corta a los 10 min (≈ 5-10 MB), el límite de 30 MB del servidor no se ha probado con un archivo grande.
- Además hay cuota total del equipo (el «pozo»): con el pozo lleno se cortan fotos y audios.

## Cierre automático (`visita_autocierre_horas`, APAGADO)
Probado el 3 oct en transacción con rollback: encendido, una visita recién reabierta NO se cierra; una con 30 h sin actividad se cierra sola (`cierre_automatico`, `cerrada_en` = su última actividad) y conserva las marcas del informe (no duplica, migración 148). Se deja APAGADO hasta desplegar la app con los avisos (PR #24): la base de datos es la misma para producción y para pruebas, y la app de producción actual no tiene esos avisos. Encender con `update ajustes_app set valor = true where clave = 'visita_autocierre_horas';`.

## Si el servidor rechaza una subida (3 oct)
- Tamaño o formato (Storage 413 / 415): ya no se reintenta 5 veces; va directo a «error» con mensaje en español. Cola offline (fotos, audios y documentos de una visita en curso): Yo → «1 elemento sin sincronizar» dice «El documento pesa más de lo que admite el servidor. No se puede subir: hay que hacerlo de nuevo más ligero», con «Descartar». Documento adjuntado a una visita cerrada (subida directa): el aviso rojo bajo «Adjuntar un documento» dice «pesa más de lo que admite el servidor (máx. 25 MB)» o «tiene un formato que el servidor no admite».
- Probado en la app simulando la respuesta 413 del servidor en el navegador (sin tocar el bucket real): ambos caminos, y la cola quedó vacía. Los mensajes reales de Storage (413 «exceeded the maximum allowed size», 415 «mime type … is not supported») se obtuvieron con la API.
- Solo en inglés quedan otros errores (red, cuota, sesión): esos sí se reintentan.

## Restos de pruebas en SharePoint que hay que borrar a mano (3 oct)
- `…/PrimeNotes - Comerciales/ZZ Prueba fallo/` (carpeta entera: informe HTML y PDF de una visita de prueba ya borrada de la app; la app no borra en SharePoint).
- `…/Copias de seguridad/2026-10/Base de datos/` (copias de prueba `…0727`, `…0736`) y la carpeta antigua `PrimeNotes - Comerciales/Copias de seguridad`.
- Intento de provocar un fallo real del informe (3 oct): una foto con el archivo inexistente NO lo rompe; el informe se genera igualmente (sin esa foto). El camino de fallo sigue sin probarse con un fallo real.
