import { CONCEPTOS, type ConceptoAyudaId } from '@/lib/ayuda';

interface Props {
  /** Id del concepto en `ayuda.ts`. Solo claves existentes (lo obliga el tipo). */
  concepto: ConceptoAyudaId;
}

// Línea gris de una frase bajo un campo que no se explica solo (la
// naturaleza de un hallazgo, el tipo de fecha de un próximo paso…). El texto
// es el `queEs` del concepto en `ayuda.ts` —- el mismo del que se genera el
// manual, para que no puedan divergir-—. Sin estado, sin descartable.
export function AyudaNota({ concepto }: Props) {
  return <p className="ayuda-nota">{CONCEPTOS[concepto].queEs}</p>;
}
