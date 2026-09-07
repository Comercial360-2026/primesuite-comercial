import { useState } from 'react';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { Icono } from '@/components/ui/iconos';
import { DirectorioInterlocutores } from './directorio-interlocutores';

interface Props {
  clienteId: string;
  onCerrar: () => void;
}

// Hoja superior de "Interlocutores" de la ficha de cliente — el mismo
// directorio (alta / edición / baja por "Seleccionar") que la hoja de la
// visita, pero SIN la capa de "quién estuvo presente" (aquí no hay visita).
// El disparador es un botón-icono en la cabecera de la ficha, igual que en
// la visita en curso.
export function InterlocutoresClienteHoja({ clienteId, onCerrar }: Props) {
  const [creando, setCreando] = useState(false);

  return (
    <HojaSuperior
      titulo="Interlocutores"
      onCerrar={onCerrar}
      derecha={
        !creando && (
          <button
            type="button"
            className="boton-icono"
            aria-label="Nuevo interlocutor"
            title="Nuevo interlocutor"
            onClick={() => setCreando(true)}
          >
            <Icono nombre="mas" size={18} />
          </button>
        )
      }
    >
      <DirectorioInterlocutores
        clienteId={clienteId}
        crearNuevo={{ abierto: creando, onCambio: setCreando }}
      />
    </HojaSuperior>
  );
}
