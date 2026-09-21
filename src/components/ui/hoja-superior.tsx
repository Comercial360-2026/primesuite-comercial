import { useEffect, useRef, type ReactNode } from 'react';
import { useAtraparFoco } from '@/hooks/use-atrapar-foco';

interface HojaSuperiorProps {
  /** Cabecera de la hoja. En minúsculas / frase, como el resto de la app. */
  titulo: string;
  onCerrar: () => void;
  /** Ranura a la derecha de la cabecera (lupa, "+", "Añadir N"…). */
  derecha?: ReactNode;
  children: ReactNode;
}

// La ÚNICA hoja de la app — panel que baja desde el borde de arriba, con
// cabecera propia (título + acciones + ×), sin cambiar la URL. Detrás queda
// el fondo gris de la app, como en cualquier pantalla (p. ej. "Nueva
// visita"): el panel blanco solo ocupa su contenido, no llega al fondo.
// Cierre: × / Esc / tocar fuera. En escritorio se centra en --app-max-w
// igual que el resto.
//
// Regla (Cesar, repetido varias veces desde 2026-09-07; docs/08 §"Hojas"):
// TODO panel emergente baja desde ARRIBA. La `HojaInferior` (bottom sheet)
// se eliminó — no hay opción de equivocarse en una pantalla nueva.
export function HojaSuperior({ titulo, onCerrar, derecha, children }: HojaSuperiorProps) {
  const cajaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [onCerrar]);

  useAtraparFoco(cajaRef);

  return (
    <div className="hoja-sup-fondo" onClick={onCerrar} role="presentation">
      <div
        ref={cajaRef}
        className="hoja-sup-caja"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hoja-cabecera">
          <div className="hoja-titulo">{titulo}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {derecha}
            <button type="button" className="hoja-cerrar" onClick={onCerrar} aria-label="cerrar">
              ×
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
