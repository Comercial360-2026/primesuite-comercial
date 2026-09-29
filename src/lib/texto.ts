// Normalización de texto libre al MOSTRARLO — nunca al guardarlo, para no
// reescribir lo que el comercial tecleó. D4 del rediseño de Visita activa
// (ver memoria primesuite-modelo-ui-reglas): un próximo paso escrito con
// Bloq Mayús puesto ("RESOLVER DUDAS CON EL CLIENTE") se lee a gritos en
// cualquier lista. Se normaliza a capitalización de frase.
//
// Si el texto YA tiene mezcla de mayúsculas y minúsculas, se respeta tal
// cual: es la señal de que el comercial ya capitalizó a mano lo que le
// importaba (un nombre propio, una sigla) y no hay forma fiable de separar
// "nombre propio" de "resto de la frase" en una cadena ya toda en
// mayúsculas — por eso solo se toca el caso extremo (todo gritado).
// Concordancia de número: `plural(1, 'nota', 'notas')` → "1 nota";
// `plural(3, 'nota', 'notas')` → "3 notas". La forma plural se pasa
// explícita porque en español no siempre es "+s" ("oportunidad" →
// "oportunidades", "próximo paso" → "próximos pasos"). Evita el "1 notas"
// que salía en el cierre y el resumen de la visita.
export function plural(n: number, singular: string, formaPlural: string): string {
  return `${n} ${n === 1 ? singular : formaPlural}`;
}

// Qué hay dentro de una visita, en corto: "3 fotos · 2 notas · 1 hallazgo".
// Con más de 3 tipos colapsa a "N elementos" para que quepa en una línea
// (D2 del rediseño de Visita activa). Vacío si no hay nada. Lo usan Visita
// activa y las filas de historial de visitas.
export function desgloseVisita(t: {
  fotos: number;
  audios: number;
  notas: number;
  hallazgos: number;
  oportunidades: number;
  pasos: number;
}): string {
  const tipos = [
    t.fotos && plural(t.fotos, 'foto', 'fotos'),
    t.audios && plural(t.audios, 'audio', 'audios'),
    t.notas && plural(t.notas, 'nota', 'notas'),
    t.hallazgos && plural(t.hallazgos, 'hallazgo', 'hallazgos'),
    t.oportunidades && plural(t.oportunidades, 'oportunidad', 'oportunidades'),
    t.pasos && plural(t.pasos, 'próximo paso', 'próximos pasos'),
  ].filter((x): x is string => !!x);
  if (tipos.length <= 3) return tipos.join(' · ');
  const total = t.fotos + t.audios + t.notas + t.hallazgos + t.oportunidades + t.pasos;
  return plural(total, 'elemento', 'elementos');
}

// Minúsculas y sin acentos, para comparar/buscar texto libre sin que un
// tilde deje fuera una coincidencia ("desfire" encuentra "DESFire",
// "camion" encuentra "camión"). Solo para comparar — nunca se guarda.
export function sinAcentos(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function capitalizarFrase(texto: string): string {
  if (!texto) return texto;
  const soloLetras = texto.replace(/[^\p{L}]/gu, '');
  if (!soloLetras || soloLetras !== soloLetras.toUpperCase() || soloLetras === soloLetras.toLowerCase()) {
    return texto;
  }
  const minuscula = texto.toLowerCase();
  return minuscula.charAt(0).toUpperCase() + minuscula.slice(1);
}
