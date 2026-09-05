import { useEffect, type ReactNode } from 'react';

interface HojaInferiorProps {
  /** Cabecera de la hoja. En minúsculas / frase, como el resto de la app. */
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
}

// Hoja inferior (bottom sheet) — para contenido de baja frecuencia dentro de
// una pantalla ya abierta (Interlocutores, Equipo), sin tapar el contexto de
// arriba con un modal centrado ni gastar una pantalla propia (D3 del
// rediseño de Visita activa, ver primesuite-modelo-ui-reglas). Mismo cierre
// que Modal: × / Esc / tocar fuera. En escritorio se centra dentro de
// --app-max-w igual que el resto de la app (regla 10) — no se escapa a todo
// el ancho ni queda pegada al borde de la ventana.
export function HojaInferior({ titulo, onCerrar, children }: HojaInferiorProps) {
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [onCerrar]);

  return (
    <div className="hoja-fondo" onClick={onCerrar} role="presentation">
      <div
        className="hoja-caja"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hoja-manija" aria-hidden="true" />
        <div className="hoja-cabecera">
          <div className="hoja-titulo">{titulo}</div>
          <button type="button" className="hoja-cerrar" onClick={onCerrar} aria-label="cerrar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
