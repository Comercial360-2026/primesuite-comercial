import { useEffect, type ReactNode } from 'react';

// Diálogo centrado sobre la columna de la app. Sustituye a los 7 modales de
// la visita, que estaban hechos a mano con `position:fixed; inset:0` y una
// tarjeta pegada abajo — sin componente común y sin respetar el ancho de la
// app, así que en escritorio se veían a todo el ancho y el de "visita en
// curso" parecía una pantalla en blanco.
//
// El fondo es gris opaco (no un velo translúcido: la regla del sistema
// prohíbe transparencias sobre color, ver 08_sistema_diseno.md §"Reglas de
// estilo"). Para que aun así se lea como "se ha abierto algo", la tarjeta
// va CENTRADA y con caja, no pegada a un borde.
//
// Cierre: la × de la cabecera, la tecla Esc, o tocar fuera de la tarjeta.

interface ModalProps {
  /** Cabecera del diálogo. En minúsculas / frase, como el resto de la app. */
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
}

export function Modal({ titulo, onCerrar, children }: ModalProps) {
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [onCerrar]);

  return (
    <div className="modal-fondo" onClick={onCerrar} role="presentation">
      <div
        className="modal-caja"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-cabecera">
          <div className="modal-titulo">{titulo}</div>
          <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="cerrar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
