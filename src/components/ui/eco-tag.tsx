import { useState } from 'react';
import { Icono, type NombreIcono } from './iconos';

// Etiqueta de "ecosistema" de un cliente: algo que sabemos que tiene. Se usa
// en la ficha de cliente y en el repaso de cliente.
//
// Dos formas (PM11 Fase 4):
//   - tipo="termino" (por defecto): un modelo/tecnología del catálogo, con
//     su naturaleza (color + icono de forma + palabra; el usuario es
//     daltónico).
//   - tipo="categoria": un hallazgo marcado solo con la categoría, sin bajar
//     al término. Gris tenue, sin naturaleza — se lee como algo menos
//     preciso.
//
// El texto es libre y puede ser largo. En reposo se recorta a una línea con
// "…"; al tocarlo se despliega entero (no navega). Aspecto en components.css
// (.eco-tag*). Ver 08_sistema_diseno.md §"Color y accesibilidad".

// "Me preocupa" (riesgo) lleva icono de atención; "Competencia" va en morado
// sin icono (es un dato, no una alerta); "Dato del cliente" (contexto), neutro.
const ICONO_POR_NATURALEZA: Record<string, NombreIcono> = {
  riesgo: 'atencion',
};

interface Props {
  nombre: string;
  naturaleza: string;
  tipo?: 'termino' | 'categoria';
}

export function EcoTag({ nombre, naturaleza, tipo = 'termino' }: Props) {
  const [abierto, setAbierto] = useState(false);
  const esCategoria = tipo === 'categoria';
  const icono = esCategoria ? undefined : ICONO_POR_NATURALEZA[naturaleza];
  const variante = esCategoria
    ? 'eco-tag--categoria'
    : naturaleza === 'riesgo'
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
