# Copia de seguridad de las tablas — dónde está todo (3 oct 2026)

## Qué es
JSON con las filas de 23 tablas (no archivos). Se genera en el servidor y se sube a SharePoint. Sustituye al botón antiguo que descargaba un JSON en el navegador.

## Dónde vive cada pieza
| Pieza | Sitio |
|---|---|
| Código de la función | `supabase/functions/generar-copia-seguridad/index.ts` (desplegada `--no-verify-jwt`; auth propia: clave del worker o sesión de Dirección) |
| Confirmación | `supabase/functions/confirmar-archivado-sharepoint/index.ts` (rama `copia:<registro_id>`, compara tamaño) |
| Migración | `supabase/migrations/144_copia_seguridad_automatica.sql` (columnas nuevas de `registro_backup_completo`, cron `copia-seguridad-diaria` 03:30 UTC, quita la política de insert) |
| Pantalla | Yo → «Copia de seguridad» (`src/features/perfil/yo.tsx`), solo Dirección |
| Archivo temporal | bucket Supabase `backups-visita`, ruta `copias/<registro_id>.json` (se borra a las 2 h) |
| **Copia definitiva en SharePoint** | sitio `https://primion.sharepoint.com/sites/DeptDIGDepartamentocomercial-Spain` → biblioteca Documentos → `General/PrimeNotes/Copias de seguridad/Base de datos/Últimas copias/primenotes-copia-AAAA-MM-DD-HHMM.json` (**desde el 3 oct 10:16**; antes colgaba por error de `PrimeNotes - Comerciales`, carpeta de los comerciales) |
| Flujo que sube el archivo | Power Automate, entorno `Default-9680142b-e519-4506-8d12-c0704c2fafb4`: «PrimeSuite - Subir copia de seguridad» (id `810abbb5-1a26-46b1-bd78-30a80ae3bfc0`), PROPIO de copias (copia por «Save As» del de visitas, que no se toca). Carpeta de destino FIJA en su «Create file». Webhook = secreto de Vault `POWER_AUTOMATE_WEBHOOK_COPIA_URL` (función `fn_webhook_power_automate_copia`, migración 145). El de visitas sigue siendo «PrimeSuite - Archivar visita a SharePoint» (id `4b9ccfbe-5456-4522-93b5-89d99ee9961c`) |
| Flujo que rota (borra) | Power Automate, mismo entorno: «PrimeSuite - Rotar copias de seguridad» (id `9e82b899-a8ef-4022-8749-67c40f994d2d`), lunes 04:00 Madrid, propietario cesar.borrego@primion.eu |
| Estado | tabla `registro_backup_completo` (`enviada` → `confirmada` / `fallida`, ruta, tamaño, filas) |

## Flujo de rotación (estructura exacta)
Recurrence (semanal, lunes, 04:00, Madrid) → Get files (properties only): sitio arriba, biblioteca Documentos, carpeta `…/Últimas copias`, Order By `FileLeafRef desc`, Include Nested Items = No → Apply to each sobre `skip(outputs('Get_files_(properties_only)')?['body/value'], 8)` → For each sobre `createArray(items('Apply_to_each'))` → Delete file con id = contenido dinámico «Identificador» (`items('For_each')?['{Identifier}']`).
Conserva las 8 más recientes por nombre; cuenta copias, no días (si dejan de llegar, no borra nada). Lo borrado va a la papelera de SharePoint (~93 días).

## Pruebas hechas (reales)
- Copia automática por cron y por botón: llega a SharePoint y se confirma por tamaño (110 596 bytes).
- Restauración del formato: `jsonb_populate_recordset` en un esquema temporal, 23 tablas con los mismos recuentos (esquema borrado).
- Rotación: con `skip 1` y 2 copias borra solo la más antigua; con `skip 8` y 1 copia no borra nada.

## Pendiente (de Cesar)
- Borrar a mano las copias de prueba de `…/Copias de seguridad/2026-10/Base de datos/` (`…0727`, `…0736`): el flujo no vigila esa carpeta.
- Romper la herencia de permisos de `Copias de seguridad` (solo Dirección e IT): el JSON trae datos de todos los clientes.
- Segundo propietario en los dos flujos.
- Restauración real sobre una base de pruebas con un archivo de SharePoint (solo se probó el formato).

## Trampas encontradas (costaron horas)
1. Power Automate añade 3 bytes (BOM) a los archivos que llegan como `application/json`: subir como `application/octet-stream`.
2. File Identifier de «Delete file» es un selector de archivos: una expresión escrita queda como texto literal → `NotFound`. Solo vale contenido dinámico.
3. Insertar «Identificador» de Get files dentro de un bucle sobre `skip(...)` crea un `For each` interior sobre TODA la lista y borra todo: se rehace con `createArray(items('Apply_to_each'))`.
4. Un flujo programado apagado no se puede ejecutar (ni Run ni Test).
5. El «Week» del diálogo de creación no se guardó (salió «Minute», ejecución cada minuto): revisar siempre el disparador.
6. Con la papelera de SharePoint no se pierde nada: las 2 copias que borró el bucle erróneo (7:46, 7:47) estaban ahí.

## Qué se hizo mal (para no repetirlo)
Se construyó y se ejecutó el flujo de borrado sin leer antes la documentación de cada acción ni buscar los problemas conocidos del diseñador, y se probó el borrado sin una capa segura previa. La regla escrita en `CLAUDE.md` («agentes y procesos: primero documentación, luego pruebas por capas, luego clic») es obligatoria desde esta fecha.

---

# Cambio de ubicación (HECHO 3 oct): la copia va en `PrimeNotes/Copias de seguridad`, NO en `PrimeNotes - Comerciales`

**Por qué:** `PrimeNotes - Comerciales` es la carpeta de los comerciales; la copia lleva datos de todos los clientes y no debe colgar de ahí (heredaba permisos). Se colgó ahí por comodidad técnica (la ruta base del flujo de visitas es fija) y fue un error, no una decisión.

**Diseño elegido (A, por aislamiento y no por ahorrar código):** un flujo PROPIO para copias, copia del de visitas («Save As»), con la carpeta de destino fija: `/Shared Documents/General/PrimeNotes/Copias de seguridad/Base de datos/Últimas copias`. El flujo de visitas no se toca (si falla uno, el otro sigue). Mantiene la comprobación del secreto y la llamada de confirmación (`copia:<registro_id>`).

**Documentación leída antes de hacerlo (3 oct):**
- Conector SharePoint (Learn): «Create file» no sobrescribe; «Get files (properties only)» devuelve 100 por defecto, hasta 5000.
- Power Automate (Learn + búsqueda de incidencias): «Save As» copia acciones y disparador, el flujo nuevo queda como **borrador y apagado**; el disparador HTTP genera **URL nueva** al guardar (la URL lleva firma = secreto). Desde ago 2025 las URL HTTP son del tipo `*.environment.api.powerplatform.com` (las antiguas `logic.azure.com` dejaron de valer el 30 nov 2025); la actual de visitas ya es del tipo nuevo.
- **No documentado / por comprobar en real:** si el «Save As» conserva bien la comprobación del secreto y la conexión de SharePoint; el campo Folder Path del «Create file» se rellena con texto (se prueba antes de usarlo).

**Plan por capas (nada se ejecuta antes de su capa anterior):**
1. «Save As» del flujo de visitas → «PrimeSuite - Subir copia de seguridad». Solo se cambia el Folder Path de «Create file» (texto fijo). Sin encender.
2. Encender y probar con una petición de prueba controlada; comprobar el archivo y la confirmación.
3. Guardar la URL nueva en Supabase Vault como `POWER_AUTOMATE_WEBHOOK_COPIA_URL` (la pega Cesar; la URL es secreto) + función SQL `fn_webhook_power_automate_copia` (migración 145).
4. Cambiar `generar-copia-seguridad` para usar esa URL (la ruta deja de depender de `carpeta_*`).
5. Cambiar la carpeta del flujo de rotación a la nueva ruta.
6. Cesar borra la carpeta antigua `PrimeNotes - Comerciales/Copias de seguridad` y revisa permisos de la nueva.

## Estado del cambio de ubicación (3 oct, 10:19)
- Capas 1-5 HECHAS y verificadas: flujo propio creado y guardado; copia de prueba de las 10:16 subida a `General/PrimeNotes/Copias de seguridad/Base de datos/Últimas copias` (110 596 bytes) y registro en `confirmada`; secreto en Vault; `generar-copia-seguridad` desplegada con el webhook nuevo; flujo de rotación apuntado a la carpeta nueva (guardado 10:18).
- Pendiente de Cesar: borrar la carpeta antigua `PrimeNotes - Comerciales/Copias de seguridad` (si ya no hay nada útil), revisar permisos de la nueva, segundo propietario de los 3 flujos, y la prueba de la rotación sobre la carpeta nueva (con 1 copia no debe borrar nada).
- Por qué un flujo propio: ver arriba. El flujo de visitas no se modificó.

---

# Cifrado de la copia (3 oct) — código hecho, clave real PENDIENTE de generar por Cesar

- Híbrido: AES-256-GCM para el JSON + RSA-OAEP 4096 (SHA-256) para la clave AES. `supabase/functions/_shared/cifrar-copia.ts`; formato `PSC1 | u16 largo | clave envuelta | iv 12 | cifrado+etiqueta`. Archivo en SharePoint: `primenotes-copia-AAAA-MM-DD-HHMM.json.enc`.
- El servidor solo tiene la clave PÚBLICA (secreto de función `COPIA_CLAVE_PUBLICA`, PEM). Sin ella la función falla (500) y no sube nada: nunca en claro. La privada la genera Cesar con `scripts/copia-seguridad/descifrar.mjs generar-claves <carpeta>` (Claude no la ve) y la guarda en 1Password + papel.
- Descifrar: `node scripts/copia-seguridad/descifrar.mjs descifrar archivo.json.enc copia-privada.pem salida.json`.
- Probado: ida y vuelta (Deno cifra → Node descifra, archivo idéntico) con una clave desechable. Documentación leída: MDN (AES-GCM, RSA-OAEP), límites Edge Functions (256 MB memoria, 2 s CPU).
- Rotación: ordena por nombre, no se ve afectada por la extensión. Las copias antiguas `.json` (sin cifrar) siguen en la carpeta hasta que la rotación las borre.
