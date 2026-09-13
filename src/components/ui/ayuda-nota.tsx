import { useState } from 'react';
import { CONCEPTOS, type ConceptoAyudaId } from '@/lib/ayuda';

interface Props {
  /** Id del concepto en `ayuda.ts`. Solo claves existentes (lo obliga el tipo). */
  concepto: ConceptoAyudaId;
}

// Ayuda de un campo que no se explica solo (el horizonte de una
// oportunidad, la fecha relevante de un hallazgo…). Va PLEGADA por
// defecto: una línea
// discreta y tocable; al abrirla muestra el `queEs` del concepto en
// `ayuda.ts` —el mismo del que se genera el manual, para que no diverjan—.
// Sin plegar, tres campos seguidos con su ayuda eran un muro de texto gris
// en el móvil.
export function AyudaNota({ concepto }: Props) {
  const [abierta, setAbierta] = useState(false);
  const { titulo, queEs } = CONCEPTOS[concepto];
  return (
    <div className="ayuda-nota">
      <button
        type="button"
        className="ayuda-nota__toggle"
        aria-expanded={abierta}
        onClick={() => setAbierta((v) => !v)}
      >
        <span className="ayuda-nota__icono" aria-hidden="true">ⓘ</span>
        {abierta ? 'Ocultar' : `Qué es «${titulo}»`}
      </button>
      {abierta && <p className="ayuda-nota__texto">{queEs}</p>}
    </div>
  );
}
