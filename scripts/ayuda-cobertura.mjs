#!/usr/bin/env node
// Informe de cobertura de la ayuda in-app (src/lib/ayuda.ts).
//
//   node scripts/ayuda-cobertura.mjs
//
// No falla el build ni el CI: es una foto de qué falta por cubrir, para
// mirarla al añadir contenido. El compilador ya garantiza que un
// `ayuda="x"` / `concepto="x"` solo existe si la entrada existe —- aquí lo
// que se ve es lo contrario: pantallas con cabecera que todavía NO piden
// ayuda, y entradas del diccionario que nadie usa.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname;
const SRC = join(RAIZ, 'src');

function* ficheros(dir) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) yield* ficheros(ruta);
    else if (/\.tsx?$/.test(nombre)) yield ruta;
  }
}

// --- claves declaradas en ayuda.ts -----------------------------------------
const ayudaTs = readFileSync(join(SRC, 'lib/ayuda.ts'), 'utf8');
function claves(nombreConst) {
  const m = ayudaTs.match(new RegExp(`const _?${nombreConst} = \\{([\\s\\S]*?)\\n\\} satisfies`));
  if (!m) return new Set();
  const set = new Set();
  for (const linea of m[1].split('\n')) {
    const k = linea.match(/^ {2}'?([a-z0-9-]+)'?: \{/);
    if (k) set.add(k[1]);
  }
  return set;
}
const pantallas = claves('PANTALLAS');
const conceptos = claves('CONCEPTOS');

// --- uso real en las pantallas -------------------------------------------
const pantallasUsadas = new Set();
const conceptosUsados = new Set();
const sinAyuda = []; // { fichero, cabecera }

for (const f of ficheros(SRC)) {
  const txt = readFileSync(f, 'utf8');
  const rel = f.slice(RAIZ.length);
  // La propia pantalla /ayuda no se documenta a sí misma.
  const esManual = rel.includes('features/ayuda/');

  for (const m of txt.matchAll(/<Cabecera(Seccion|Detalle)\b/g)) {
    // Recorta la etiqueta hasta su cierre real, saltando los `>` que
    // aparecen dentro de props con arrow functions (`onVolver={() => …}`)
    // o expresiones con `{}`. Un regex no-codicioso paraba en el `=>`.
    const desde = m.index + m[0].length;
    let prof = 0;
    let fin = desde;
    for (let i = desde; i < txt.length; i++) {
      const c = txt[i];
      if (c === '{') prof++;
      else if (c === '}') prof--;
      else if (c === '>' && prof === 0) {
        fin = i + 1;
        break;
      }
    }
    const props = txt.slice(desde, fin);
    const idm = props.match(/\bayuda=["']([a-z0-9-]+)["']/);
    if (idm) pantallasUsadas.add(idm[1]);
    else if (!esManual) sinAyuda.push({ fichero: rel, cabecera: `Cabecera${m[1]}` });
  }
  for (const m of txt.matchAll(/\bconcepto=["']([a-z0-9-]+)["']/g)) conceptosUsados.add(m[1]);
}

// --- informe ------------------------------------------------------------
const linea = (s) => process.stdout.write(s + '\n');

linea('\n  AYUDA IN-APP — cobertura\n  ' + '─'.repeat(40));

linea(`\n  Pantallas con entrada en ayuda.ts: ${pantallas.size}`);
linea(`  Conceptos con entrada en ayuda.ts: ${conceptos.size}`);

const pantallasHuerfanas = [...pantallas].filter((k) => !pantallasUsadas.has(k));
const conceptosHuerfanos = [...conceptos].filter((k) => !conceptosUsados.has(k));

if (pantallasHuerfanas.length) {
  linea('\n  ⚠  Entradas de PANTALLA que nadie referencia con ayuda="…":');
  for (const k of pantallasHuerfanas) linea(`       · ${k}  (aparece en /ayuda, pero sin "?" en su cabecera)`);
}
if (conceptosHuerfanos.length) {
  linea('\n  ⚠  Entradas de CONCEPTO que nadie referencia con <AyudaNota>:');
  for (const k of conceptosHuerfanos) linea(`       · ${k}  (aparece en /ayuda, pero sin nota al pie)`);
}

if (sinAyuda.length) {
  linea(`\n  Cabeceras sin ayuda="…" (${sinAyuda.length}) —- candidatas a cubrir:`);
  for (const s of sinAyuda) linea(`       · ${s.cabecera.padEnd(15)} ${s.fichero}`);
}

linea('');
