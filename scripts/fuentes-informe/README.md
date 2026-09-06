# Fuente del informe PDF — Roboto sin ligaduras

`supabase/functions/generar-backup-visita/roboto-sin-ligaduras.ts` es un
módulo **generado** con las 4 caras de Roboto en base64, embebidas en el
propio archivo para no depender de red al maquetar el PDF.

## Por qué existe

`pdfmake@0.2.10` usa la Roboto que trae de fábrica y **aplica sus ligaduras
OpenType** (`fi`, `fl`, `ff`, `ffi`, `ffl`). El glifo de ligadura acaba en el
PDF con un `ToUnicode` que varios extractores de texto interpretan mal: se
comen la 2ª letra. El PDF **se ve bien**, pero al copiar / `Ctrl+F` / con
lector de pantalla sale `unifcado`, `refejo`, `notifcación`…

- `pdftotext` (poppler) y `pdf.js` (Ctrl+F de Chrome/Firefox) sí recuperan el
  texto bien.
- Otros lectores y herramientas de extracción no.

Se descartó meter un `U+200C` entre la `f` y la letra siguiente para romper la
ligadura: `pdfmake` lo pinta como un cuadrado `.notdef` visible.

## La solución

Se embebe **la misma Roboto**, pero con la tabla `GSUB` recortada: se quitan
las familias de ligaduras (`liga`, `dlig`, `clig`, `rlig`) y se mantienen
`ccmp`, `locl`, `kern` y el posicionamiento de marcas. Sin el glifo de
ligadura, el flujo de texto es `f` + `i` (1:1) y el `ToUnicode` sale bien para
todos los lectores. El render es idéntico a simple vista: la ligadura `fi`/`fl`
de Roboto a tamaño de cuerpo es casi imperceptible.

`index.ts` pisa las 4 entradas del `vfs` de pdfmake con estas; como pdfmake
mapea la familia `Roboto` a esos mismos nombres de fichero, no hace falta
tocar `pdfMake.fonts` ni `defaultStyle`.

## Regenerar

Si algún día se sube la versión de pdfmake o se cambia la fuente:

```bash
pip install fonttools           # una vez
deno run -A scripts/fuentes-informe/generar.ts
```

Luego **verificar de verdad** (regla de la casa): desplegar, generar un
informe real con palabras `fi`/`fl` (unificar, clasificación, notificación,
flexible, reflejo), descomprimir el ZIP y mirar el `informe.pdf` — render **y**
capa de texto (copiar / `Ctrl+F`).
