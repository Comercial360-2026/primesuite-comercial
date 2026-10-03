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
| **Copia definitiva en SharePoint** | sitio `https://primion.sharepoint.com/sites/DeptDIGDepartamentocomercial-Spain` → biblioteca Documentos → `General/PrimeNotes/PrimeNotes - Comerciales/Copias de seguridad/Base de datos/Últimas copias/primenotes-copia-AAAA-MM-DD-HHMM.json` (dentro de PrimeNotes, en la carpeta `PrimeNotes - Comerciales`) |
| Flujo que sube el archivo | Power Automate, entorno `Default-9680142b-e519-4506-8d12-c0704c2fafb4`: «PrimeSuite - Archivar visita a SharePoint» (id `4b9ccfbe-5456-4522-93b5-89d99ee9961c`), el mismo de las visitas. Ruta = `carpeta_cliente/carpeta_proyecto/carpeta_visita` → `Copias de seguridad / Base de datos / Últimas copias` |
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
