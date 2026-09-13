import { Icono } from './iconos';

// Botón sutil para desplegar/plegar el resto de una lista que muestra un
// tope (p. ej. "También en curso" en Hoy y el panel de visitas sin cerrar
// enseñan 3). NO es una fila ancha: es un icono centrado con "+N" / "menos"
// en gris pequeño, para que no compita con las filas de contenido.
export function BotonVerMas({
  n,
  abierto,
  onClick,
}: {
  /** Cuántas quedan por mostrar. */
  n: number;
  abierto: boolean;
  onClick: () => void;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={abierto ? 'Ver menos' : `Ver las otras ${n}`}
        title={abierto ? 'Ver menos' : `Ver las otras ${n}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          color: 'var(--ink-400)',
          font: 'inherit',
          fontSize: 'var(--text-xs)',
          padding: '4px 8px',
        }}
      >
        <Icono nombre={abierto ? 'subir' : 'bajar'} size={16} />
        {abierto ? 'menos' : `+${n}`}
      </button>
    </div>
  );
}
