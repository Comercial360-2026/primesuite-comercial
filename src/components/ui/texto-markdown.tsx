import type { ReactNode } from 'react';

// Pinta el markdown del briefing del agente (títulos, listas, negritas,
// tablas sencillas y párrafos) con elementos de React: nunca inserta HTML,
// así que un texto raro del agente no puede meter nada ejecutable.
// ponytail: subconjunto a mano en vez de una librería de markdown; si el
// agente empieza a usar enlaces, código o listas anidadas, valorar
// `react-markdown` (dependencia nueva, justificarla en el PR).

function enLinea(texto: string): ReactNode[] {
  // **negrita** → <strong>; el resto, texto tal cual.
  return texto.split(/(\*\*[^*]+\*\*)/g).map((trozo, i) =>
    trozo.startsWith('**') && trozo.endsWith('**') && trozo.length > 4 ? (
      <strong key={i}>{trozo.slice(2, -2)}</strong>
    ) : (
      trozo
    )
  );
}

const celdas = (linea: string) =>
  linea
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

export function TextoMarkdown({ texto }: { texto: string }) {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n');
  const bloques: ReactNode[] = [];
  let i = 0;

  while (i < lineas.length) {
    const linea = lineas[i];
    const t = linea.trim();

    if (!t || /^-{3,}$/.test(t)) {
      i++;
      continue;
    }

    const titulo = /^(#{1,4})\s+(.*)$/.exec(t);
    if (titulo) {
      const nivel = titulo[1].length;
      bloques.push(
        <div key={i} className={nivel <= 2 ? 'md-titulo' : 'md-subtitulo'}>
          {enLinea(titulo[2].replace(/\*\*/g, ''))}
        </div>
      );
      i++;
      continue;
    }

    if (t.startsWith('|')) {
      const filas: string[][] = [];
      while (i < lineas.length && lineas[i].trim().startsWith('|')) {
        const f = celdas(lineas[i]);
        if (!f.every((c) => /^:?-{2,}:?$/.test(c))) filas.push(f); // fuera la línea |---|
        i++;
      }
      const [cabecera, ...cuerpo] = filas;
      bloques.push(
        <div key={i} className="md-tabla">
          <table>
            <thead>
              <tr>{cabecera?.map((c, k) => <th key={k}>{enLinea(c)}</th>)}</tr>
            </thead>
            <tbody>
              {cuerpo.map((f, r) => (
                <tr key={r}>{f.map((c, k) => <td key={k}>{enLinea(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^([-*•]|\d+[.)])\s+/.test(t)) {
      const items: string[] = [];
      while (i < lineas.length && /^([-*•]|\d+[.)])\s+/.test(lineas[i].trim())) {
        items.push(lineas[i].trim().replace(/^([-*•]|\d+[.)])\s+/, ''));
        i++;
      }
      bloques.push(
        <ul key={i} className="md-lista">
          {items.map((it, k) => <li key={k}>{enLinea(it)}</li>)}
        </ul>
      );
      continue;
    }

    const parrafo: string[] = [];
    while (i < lineas.length && lineas[i].trim() && !/^(#{1,4}\s|\||[-*•]\s|\d+[.)]\s|-{3,}$)/.test(lineas[i].trim())) {
      parrafo.push(lineas[i].trim());
      i++;
    }
    bloques.push(
      <p key={i} className="md-parrafo">
        {enLinea(parrafo.join(' '))}
      </p>
    );
  }

  return <div className="md">{bloques}</div>;
}
