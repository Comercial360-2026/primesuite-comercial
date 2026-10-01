# Pendiente: borrar una visita o un cliente y SharePoint

Detectado el 2026-10-02 (pregunta de Cesar). **No estaba contemplado** en el diseño del archivado (`docs/archivado-sharepoint/diseno.md`, PR #16), que solo trata «comercial que se va».

## Qué pasa hoy (comprobado en el código de `feature/archivado-sharepoint`)
- Borrar visita (`use-borrar-visita.ts`), borrar cliente (`ficha-cliente.tsx`), liberar espacio (`mi-espacio.tsx`, `use-espacio-proyecto.ts`) y las RPC `eliminar_visita_completa` / `eliminar_cliente_completo` solo tocan la BD y Supabase Storage.
- Las capturas ya archivadas tienen `storage_path = null` y `ruta_sharepoint` rellena: el borrado de Storage no las ve y **sus archivos y carpetas siguen en SharePoint**, huérfanos, sin ninguna fila que los referencie.
- Las confirmaciones de borrado cuentan fotos/audios/documentos de la BD (los archivados cuentan) pero **no avisan** de que hay archivos en SharePoint que no se borrarán.

## Decisión a tomar (no tomada)
1. **SharePoint como archivo histórico**: no se borra nada allí. Lo único obligatorio sería decirlo en la confirmación («N archivos archivados en SharePoint se conservan») y, si se quiere, dejar una lista en la BD de rutas huérfanas.
2. **Borrar también en SharePoint**: otro flujo de Power Automate «Borrar carpeta» llamado desde una Edge Function antes de borrar la fila (orden: SharePoint → Storage → BD, con reintento y sin perder la ruta si falla). Irreversible; exigiría confirmación explícita con el número de archivos de SharePoint.
3. **Mixto**: visita sí (su carpeta `AAAA-MM-DD Visita`), cliente entero no sin segunda confirmación.

## Al implementarlo (barrido)
`previsualizar_borrado_visita/cliente` (añadir `num_archivados_sharepoint`), `BUCKETS_VISITA` ya cubre Storage, ayuda in-app, y los documentos archivados (tipo `documento`) cuando el archivado los contemple.
