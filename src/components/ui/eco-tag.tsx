import { useState } from 'react';

// Etiqueta de "ecosistema" de un cliente: algo que sabemos que tiene. Se usa
// en la ficha de cliente y en el repaso de cliente.
//
// Dos formas (PM11 Fase 4):
//   - tipo="termino" (por defecto): un modelo/tecnología concreto del
//     catálogo ("MIFARE › DESFire EV2").
//   - tipo="categoria": un hallazgo marcado solo con la categoría, sin bajar
//     al término. Gris tenue, borde punteado — se lee como algo menos preciso.
//
// El texto es libre y puede ser largo. En reposo se recorta a una línea con
// "…"; al tocarlo se despliega entero (no navega). Aspecto en components.css
// (.eco-tag*). Ver 08_sistema_diseno.md §"Color y accesibilidad".

interface Props {
  nombre: string;
  tipo?: 'termino' | 'categoria';
}

export function EcoTag({ nombre, tipo = 'termino' }: Props) {
  const [abierto, setAbierto] = useState(false);
  const variante = tipo === 'categoria' ? 'eco-tag--categoria' : 'eco-tag--neutro';

  return (
    <button
      type="button"
      className={`eco-tag ${variante}${abierto ? ' eco-tag--abierto' : ''}`}
      onClick={() => setAbierto((v) => !v)}
      aria-expanded={abierto}
      title={abierto ? undefined : nombre}
    >
      <span className="eco-tag__txt">{nombre}</span>
    </button>
  );
}
