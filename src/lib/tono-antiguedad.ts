// Tono de una visita EN CURSO según cuánto lleva abierta. Un único sitio para
// los umbrales — lo usan el panel de "visitas abiertas sin cerrar" y las filas
// de "También en curso" en Hoy. Cuanto más vieja, más urge cerrarla.
//
//   < 24 h        → neutral  (abierta hoy, normal)
//   24 h – 3 días → aviso    (ámbar: llevas días con ella abierta)
//   > 3 días      → riesgo   (rojo: se ha quedado colgada)

export type TonoAntiguedad = 'neutral' | 'aviso' | 'riesgo';

const H = 60 * 60 * 1000;

export function tonoPorAntiguedad(desde: string | null | undefined): TonoAntiguedad {
  if (!desde) return 'neutral';
  const ms = Date.now() - new Date(desde).getTime();
  if (Number.isNaN(ms) || ms < 24 * H) return 'neutral';
  if (ms < 72 * H) return 'aviso';
  return 'riesgo';
}
