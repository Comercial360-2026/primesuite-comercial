# Documentos colgados de una visita

Estado: implementado (rama `feature/documentos-visita`, migración 131).

## Qué es
Un botón «Adjuntar un documento» en la visita en curso y en la visita cerrada. El archivo va a Supabase Storage y se descarga luego igual que fotos y audios (detalle de la captura, ZIP de la visita).

## Decisiones
- **Misma tabla**: `captura_libre.tipo = 'documento'` + `nombre_original`, `mime`, `bytes`. Así hereda RLS, autoría, borrado, cola offline y recuentos.
- **Bucket propio** `documentos-visita` (privado, 25 MB, PDF/Word/Excel/PowerPoint/TXT/CSV). Permisos copiados de `audios-visita`.
- **Sin zona**: un documento es de la visita entera.
- **Visita en curso**: pasa por la cola offline como las fotos (`sync-engine.ts`).
- **Visita cerrada**: subida directa (esa pantalla ya exige conexión). Pueden Dirección y participantes aceptados; el servidor solo exige ser el autor.
- **Nombre**: se descarga con su nombre original, nunca con el uuid de Storage.

## Barrido de sitios tocados (clase: «adjuntos de visita»)
`BUCKETS_VISITA` / `quitarAdjuntosDeStorage` (`src/lib/buckets-visita.ts`) sustituyen a las listas `fotos-visita`+`audios-visita` sueltas: borrar visita, borrar cliente, Mi espacio, liberar espacio de proyecto, tamaño de adjuntos. En BD: `fn_espacio_*`, `fn_mis_visitas_espacio`, `fn_visitas_liberables_proyecto` cuentan el bucket nuevo; `previsualizar_borrado_visita/cliente` devuelven `num_documentos` (la confirmación de borrado los nombra). ZIP de la visita (`generar-backup-visita`): carpeta `documentos/` + anexo + LEEME. Informe de proyecto: cuenta documentos.

## Pendiente fuera de esta rama
Archivado a SharePoint (PR #16): `BUCKET_POR_TIPO`, `fn_visitas_para_archivar` y `fn_capturas_para_archivar` solo contemplan foto/audio. Hay que añadir `documento` (con su nombre original) cuando #16 esté en `main`.
