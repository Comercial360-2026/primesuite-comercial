// Falla si una pantalla tiene «Pregunta a la IA» sin Briefing o al revés
// (regla de CLAUDE.md: los dos van juntos en toda pantalla de cliente/visita).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const rec = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? rec(p) : p.endsWith('.tsx') ? [p] : [];
  });

const mal = rec('src').filter((f) => {
  if (f.endsWith('pregunta-ia-hoja.tsx') || f.endsWith('briefing-hoja.tsx')) return false;
  const s = readFileSync(f, 'utf8');
  return /<PreguntaIAHoja/.test(s) !== /<BriefingHoja/.test(s);
});
if (mal.length) {
  console.error('Pantallas con solo uno de Briefing / Pregunta a la IA:\n' + mal.join('\n'));
  process.exit(1);
}
