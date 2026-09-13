// Regenera supabase/functions/generar-backup-visita/roboto-sin-ligaduras.ts
//
// Qué hace:
//   1. Extrae las 4 caras de Roboto que trae pdfmake@0.2.10 de fábrica
//      (vfs_fonts.js) — así la fuente del informe es EXACTAMENTE la de antes.
//   2. Recorta con pyftsubset la tabla GSUB para quitar las ligaduras
//      (liga/dlig: fi, fl, ff, ffi, ffl). Mantiene ccmp/locl/kern/marcas y
//      todos los glifos y unicodes.
//   3. Emite el módulo .ts con las 4 caras en base64.
//
// Por qué: pdfmake/pdfkit generan un ToUnicode para el glifo de ligadura que
// muchos extractores de texto leen mal, comiéndose la 2ª letra ("unificado" ->
// "unifcado" al copiar / Ctrl+F / lector de pantalla). El PDF se ve bien; solo
// la capa de texto está mal. Sin el glifo de ligadura el texto sale 1:1 y el
// render es idéntico a simple vista (la ligadura fi/fl de Roboto es casi
// imperceptible a tamaño de cuerpo).
//
// Requisitos: deno + python3 con fonttools (`pip install fonttools`).
// Uso:  deno run -A scripts/fuentes-informe/generar.ts

// @ts-expect-error — vfs_fonts.js no trae tipos; solo se lee su objeto vfs
import pdfFonts from 'https://esm.sh/pdfmake@0.2.10/build/vfs_fonts.js';

const AQUI = new URL('.', import.meta.url).pathname;
const DESTINO = `${AQUI}../../supabase/functions/generar-backup-visita/roboto-sin-ligaduras.ts`;
const TMP = await Deno.makeTempDir({ prefix: 'fuentes-informe-' });

const CARAS = ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Italic.ttf', 'Roboto-MediumItalic.ttf'];
// Features OpenType que se conservan. Deliberadamente SIN liga/dlig/clig/rlig.
const FEATURES = 'ccmp,locl,mark,mkmk,kern,calt';

const f = pdfFonts as { pdfMake?: { vfs: Record<string, string> }; vfs?: Record<string, string> };
const vfs: Record<string, string> = (f.pdfMake ? f.pdfMake.vfs : f.vfs) ?? {};

function pyftsubset(): string {
  for (const cmd of ['pyftsubset', 'python3']) {
    try {
      const p = new Deno.Command(cmd, { args: cmd === 'python3' ? ['-m', 'fontTools.subset', '--help'] : ['--help'], stdout: 'null', stderr: 'null' });
      if (p.outputSync().success) return cmd;
    } catch { /* siguiente */ }
  }
  throw new Error('Falta fonttools. Instala con: pip install fonttools');
}
const SUBSET = pyftsubset();

const salida: Record<string, string> = {};
for (const cara of CARAS) {
  const b64stock = vfs[cara];
  if (!b64stock) throw new Error(`vfs_fonts.js no trae ${cara}`);
  const src = `${TMP}/${cara}`;
  const dst = `${TMP}/nl-${cara}`;
  Deno.writeFileSync(src, Uint8Array.from(atob(b64stock), (c) => c.charCodeAt(0)));

  const args = [
    ...(SUBSET === 'python3' ? ['-m', 'fontTools.subset'] : []),
    src,
    `--output-file=${dst}`,
    '--unicodes=*',
    '--glyph-names',
    '--notdef-outline',
    '--recommended-glyphs',
    `--layout-features=${FEATURES}`,
    '--passthrough-tables',
  ];
  const r = new Deno.Command(SUBSET, { args, stdout: 'inherit', stderr: 'inherit' }).outputSync();
  if (!r.success) throw new Error(`pyftsubset falló con ${cara}`);

  const bytes = Deno.readFileSync(dst);
  salida[cara] = btoa(String.fromCharCode(...bytes));
  console.log(`  ${cara}: ${b64stock.length} -> ${salida[cara].length} b64`);
}

const cabecera = `// GENERADO — no editar a mano. Ver scripts/fuentes-informe/README.md
// Roboto (la misma que trae pdfmake de fábrica) con la tabla GSUB recortada:
// se quitan las ligaduras 'liga' y 'dlig' (fi, fl, ff, ffi, ffl) y se dejan
// ccmp/locl/kern/marcas. Motivo: pdfmake+pdfkit generan un ToUnicode para el
// glifo de ligadura que muchos extractores de texto interpretan mal y se comen
// la 2a letra ("unificado" -> "unifcado" al copiar / Ctrl+F / lector). Sin el
// glifo de ligadura, el texto del PDF sale 1:1. El render es idéntico a simple vista.
// Regenerar: deno run -A scripts/fuentes-informe/generar.ts

export const ROBOTO_SIN_LIGADURAS: Record<string, string> = {
`;
let cuerpo = '';
for (const cara of CARAS) cuerpo += `  ${JSON.stringify(cara)}:\n    ${JSON.stringify(salida[cara])},\n`;
Deno.writeTextFileSync(DESTINO, cabecera + cuerpo + '};\n');
await Deno.remove(TMP, { recursive: true });
console.log(`\nEscrito ${DESTINO}`);
