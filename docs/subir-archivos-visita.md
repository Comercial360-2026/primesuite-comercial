# Subir archivos a una visita (fotos, audios y documentos) — plan, decisiones y registro (8-9 oct 2026)

Un solo botón (icono de galería) en la visita en curso y en la visita cerrada: `src/features/visita/subir-galeria.tsx`.
Antes había dos caminos distintos (foto/audio solo desde la cámara; documentos con otro icono) y en la visita cerrada solo documentos.

## Qué hace
- Elige fotos, audios (m4a/mp3/aac) y documentos (PDF, Word, Excel, PowerPoint, TXT, CSV) en la misma selección; tope 30 por vez.
- Foto/audio: fecha y GPS **de la propia foto** (EXIF, `lib/exif.ts`, leído ANTES de comprimir porque el canvas lo borra); nunca la posición actual. `creado_en` = fecha de la foto; marca `captura_libre.desde_galeria` (migración 154).
- Documento: sin fecha ni zona (como siempre), hasta 25 MB.
- Avisos: repetida (nombre + tamaño, también contra lo ya subido a la visita), foto hecha a >2 km de lo ya hecho en la visita (se guarda sin ubicación salvo que se elija), fecha a >2 días de la visita, archivo no admitido, fallos parciales con su motivo.
- Visita en curso: va a la cola (funciona sin cobertura). Visita cerrada: directo (exige red).
- Permisos: en la cerrada, Dirección o participante **aceptado** (un invitado «pendiente» no ve el botón).

## Dónde más hay que mirar (revisado)
| Sitio | Estado |
|---|---|
| Visita en curso | Botón único (antes: foto solo cámara + icono de documento). |
| Visita cerrada | Botón único en «Documentos» (antes: solo documentos). |
| Visita planificada | No se puede adjuntar: no hay captura antes de empezar. No se cambia. |
| Ficha de captura | Muestra «Subida de la galería · hecha el …». |
| Informe web y PDF | Foto de la galería lleva «· galería» y su hora real. Audios/documentos: lista como siempre. |
| SharePoint (cron cada 10 min) | Copia lo subido a una visita cerrada igual que lo demás. El nombre lleva la fecha (fotos/audios de la galería) y se evita pisar un archivo ya copiado con el mismo nombre. |
| Informe de SharePoint | Se regenera al reabrir y volver a cerrar si el contenido cambió (huella, migración 148). Subir a una visita cerrada NO regenera el informe hasta que se reabra y cierre. |
| Espacio del equipo lleno (98 %) | Se respeta en la visita en curso y en la cerrada. |
| Proyecto (informe de proyecto) | No muestra la marca «galería» (usa hora de captura). Pendiente anotado, sin impacto en datos. |

## Sorpresas previstas y cómo se cubren
1. Mismo nombre de archivo en SharePoint (documento con el mismo nombre subido después a una visita ya copiada; foto con la misma hora de otro día) → el nombre se compara con lo ya copiado y se añade «(2)».
2. Foto sin EXIF → fecha del archivo (se dice «fecha del archivo»); en iOS la fecha del archivo es la de la foto.
3. HEIC → iOS la entrega ya como JPEG con EXIF y GPS (medido en el simulador). En escritorio sin soporte HEIC falla con motivo claro.
4. 30 fotos en el móvil → una a una, miniaturas diferidas.
5. Sin conexión: visita en curso en cola; cerrada avisa del error por archivo.
6. Invitado sin aceptar → no puede subir (probado).
7. Zona nueva creada al subir → sale en la lista de zonas de esa visita para el resto del lote.

## Problemas encontrados durante el trabajo (para no repetirlos)
- Simulador iOS con `navigator.onLine=false` sin motivo: la cola no sube. Se arregla con `xcrun simctl shutdown` + `boot`.
- Un manejador `page.on('filechooser')` dejado en Playwright se queda en la página y sube archivos dos veces: no registrarlo; usar solo `browser_file_upload`.
- `supabase-js` sin red tarda en fallar: la comprobación de repetidas tiene tope de 4 s para no bloquear la hoja.
- Nombre del archivo en SharePoint «Foto HH-MM-SS» sin fecha: colisión entre días (corregido con la fecha para lo de galería y comprobando lo ya copiado).
- Al borrar una visita quedan sus informes en el bucket `backups-visita` (anterior a este cambio).
- Un enlace de acceso (`enlace_acceso`) se gasta al usarlo; para un 2.º usuario en Playwright, contexto nuevo + enlace nuevo cada vez.
- Pruebas contra una visita cerrada generan archivos reales en SharePoint (cron cada 10 min): borrarlos a mano en la carpeta del cliente de prueba.

## Comprobado (9 oct, con datos reales y borrados después)
- Lote mixto (foto + audio + PDF + TXT + .zip) en visita en curso: foto y audio con su fecha y marca de galería; documentos sin fecha ni zona; el .zip se rechaza con motivo.
- Documento repetido (mismo nombre y tamaño) → «Ya la subiste»; mismo nombre con otro contenido → sube y en SharePoint queda «Presupuesto (2).pdf» (no pisa el anterior).
- PDF de la visita: «Foto · 10:15 · galería». Informe web igual.
- Interlocutores de una visita: por defecto salen los contactos del cliente (CRM o no) SIN marcar; tocar a uno lo marca/desmarca como asistente, y «+» añade a otra persona ya marcada. Comprobado con contactos del CRM y una persona nueva. No se ha cambiado nada ahí.
