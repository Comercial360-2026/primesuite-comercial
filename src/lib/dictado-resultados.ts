// Reparte los resultados de la Web Speech API en «frases ya cerradas» y «provisional».
// Dos comportamientos reales del motor que repetían palabras (casos Martí, 28-29 oct):
//  1) Safari/iOS vuelve a entregar resultados ya cerrados y `resultIndex` no es de fiar → se cuenta por instancia.
//  2) Android (Chrome/Edge) marca como CERRADA cada hipótesis parcial y acumulada: «esto», «esto es», «esto es una»…
//     Pegarlas una tras otra daba «esto esto es esto es una…» → una frase que EMPIEZA por la anterior la sustituye.
export type ResultadoVoz = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;

export function repartirResultados(results: ResultadoVoz, cerradas: number) {
  const finales: string[] = [];
  let provisional = '';
  let n = cerradas;
  let seguidosCerrados = true;
  for (let i = cerradas; i < results.length; i += 1) {
    const t = results[i][0].transcript;
    if (results[i].isFinal && seguidosCerrados) {
      if (t.trim()) finales.push(t.trim());
      n = i + 1;
    } else {
      seguidosCerrados = false;
      provisional += t;
    }
  }
  return { finales, provisional: provisional.trim(), cerradas: n };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** ¿`nueva` es la frase `anterior` ampliada (hipótesis acumulada) y no una frase distinta? */
export function amplia(anterior: string, nueva: string) {
  const a = norm(anterior);
  const b = norm(nueva);
  return a.length > 0 && b.length >= a.length && b.startsWith(a);
}
