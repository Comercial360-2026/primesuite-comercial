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
export function capitalizarFrase(texto: string): string {
  if (!texto) return texto;
  const soloLetras = texto.replace(/[^\p{L}]/gu, '');
  if (!soloLetras || soloLetras !== soloLetras.toUpperCase() || soloLetras === soloLetras.toLowerCase()) {
    return texto;
  }
  const minuscula = texto.toLowerCase();
  return minuscula.charAt(0).toUpperCase() + minuscula.slice(1);
}
