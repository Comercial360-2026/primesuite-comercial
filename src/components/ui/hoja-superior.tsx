import { useEffect, type ReactNode } from 'react';

interface HojaSuperiorProps {
  /** Cabecera de la hoja. En minúsculas / frase, como el resto de la app. */
  titulo: string;
  onCerrar: () => void;
  /** Ranura a la derecha de la cabecera (lupa, "+", "Añadir N"…). */
  derecha?: ReactNode;
  children: ReactNode;
}

// Hoja SUPERIOR — baja desde arriba y cubre la pantalla desde el borde de
// arriba, con cabecera propia (título + acciones + ×), como si fuera una
// pantalla ("Nuevo cliente") pero sin cambiar la URL. Sustituye a
// `HojaInferior` para Interlocutores y Equipo (Cesar, 2026-09-07: "lo
// quiero arriba, no debajo, no pantalla propia"). Cierre: × / Esc / tocar
// fuera. En escritorio se centra en --app-max-w igual que el resto.
export function HojaSuperior({ titulo, onCerrar, derecha, children }: HojaSuperiorProps) {
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [onCerrar]);

  return (
    <div className="hoja-sup-fondo" onClick={onCerrar} role="presentation">
      <div
        className="hoja-sup-caja"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
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
