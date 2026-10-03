import type { ReactNode } from 'react';
import { Icono } from './iconos';
import { MEDIO_VISITA, esNoPresencial, medioDe } from '@/lib/medio-visita';

// Icono del medio (Teams / llamada) delante de un texto de fila — p. ej. la
// hora en la agenda. Presencial no pinta nada: es lo normal. El tono lo da la
// clase `.etiqueta-medio--*` (components.css); el icono va siempre con título.
export function conMedio(texto: string | undefined, medio: string | null | undefined): ReactNode {
  const m = medioDe(medio);
  if (!esNoPresencial(m)) return texto;
  return (
    <span className={`etiqueta-medio etiqueta-medio--${m}`} title={MEDIO_VISITA[m].etiqueta}>
      <Icono nombre={MEDIO_VISITA[m].icono} size={14} />
      {texto}
    </span>
  );
}
