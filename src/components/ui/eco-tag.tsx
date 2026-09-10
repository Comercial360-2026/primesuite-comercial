import { useState } from 'react';
import { Icono, type NombreIcono } from './iconos';

// Etiqueta de "ecosistema" de un cliente: un término del vocabulario con su
// naturaleza. Se usa en la ficha de cliente y en el repaso de cliente.
//
// El "término" es texto libre y puede ser largo. En reposo se recorta a una
// línea con "…"; al tocarlo se despliega entero (no navega a ningún sitio,
// así que el toque es la única forma de ver el texto completo).
//
// Color + icono de forma + palabra: el usuario es daltónico. Aspecto en
// components.css (.eco-tag*). Ver 08_sistema_diseno.md §"Color y accesibilidad".

// "Me preocupa" (riesgo) lleva icono de atención; "Competencia" va en morado
// sin icono (es un dato, no una alerta); "Dato del cliente" (contexto), neutro.
const ICONO_POR_NATURALEZA: Record<string, NombreIcono> = {
  riesgo: 'atencion',
};

interface Props {
  nombre: string;
  naturaleza: string;
}

export function EcoTag({ nombre, naturaleza }: Props) {
  const [abierto, setAbierto] = useState(false);
  const icono = ICONO_POR_NATURALEZA[naturaleza];
  const variante =
    naturaleza === 'riesgo'
      ? 'eco-tag--riesgo'
      : naturaleza === 'competencia'
        ? 'eco-tag--competencia'
        : 'eco-tag--neutro';

  return (
    <button
      type="button"
      className={`eco-tag ${variante}${abierto ? ' eco-tag--abierto' : ''}`}
      onClick={() => setAbierto((v) => !v)}
      aria-expanded={abierto}
      title={abierto ? undefined : nombre}
    >
      {icono && <Icono nombre={icono} size={13} />}
      <span className="eco-tag__txt">{nombre}</span>
    </button>
  );
}
