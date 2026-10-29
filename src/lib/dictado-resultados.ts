// Reparte los resultados de la Web Speech API en «frases ya cerradas» y «provisional».
// El motor (sobre todo Safari/iOS) puede volver a entregar en cada evento resultados ya cerrados y
// `resultIndex` no es de fiar: contar desde ahí repetía cada palabra varias veces (caso Martí, 28 oct).
// Se cuenta por instancia: `cerradas` = cuántos resultados cerrados ya se han entregado.
export type ResultadoVoz = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;

export function repartirResultados(results: ResultadoVoz, cerradas: number) {
  let final = '';
  let provisional = '';
  let n = cerradas;
  let seguidosCerrados = true;
  for (let i = cerradas; i < results.length; i += 1) {
    const t = results[i][0].transcript;
    if (results[i].isFinal && seguidosCerrados) {
      final += t;
      n = i + 1;
    } else {
      seguidosCerrados = false;
      provisional += t;
    }
  }
  return { final: final.trim(), provisional: provisional.trim(), cerradas: n };
}
