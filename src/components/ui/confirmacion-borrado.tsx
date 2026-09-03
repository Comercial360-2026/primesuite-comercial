import type { ReactNode } from 'react';

// Panel "¿Seguro?" de cualquier acción destructiva. Antes cada pantalla lo
// escribía a mano: unas decían "no se puede deshacer", otras no; los
// botones se llamaban distinto en cada sitio. Aquí el aviso es SIEMPRE
// igual, en el mismo formato — es lo que hace el trabajo de seguridad que
// el color no puede hacer (el usuario es daltónico). Ver
// 08_sistema_diseno.md §"Botones".
//
// La tarjeta va en `card--riesgo` (borde borgoña) y el botón de confirmar
// es `.btn-peligro` (relleno borgoña) — un bloque relleno se lee fuerte
// con cualquier visión.

interface ConfirmacionBorradoProps {
  /** Qué arrastra la acción, en la voz del comercial. Opcional. */
  children?: ReactNode;
  /**
   * Si la acción se PUEDE deshacer, cómo. P. ej. "Podrás reactivarlo más
   * adelante". Si no se pasa, el aviso es "No se puede deshacer.".
   */
  reversible?: string;
  onCancelar: () => void;
  onConfirmar: () => void;
  cargando?: boolean;
  error?: string | null;
  /** Texto del botón de confirmar. Por defecto "Sí, borrar". */
  confirmar?: string;
  /** Texto del botón de confirmar mientras trabaja. Por defecto "Borrando…". */
  cargandoTexto?: string;
}

export function ConfirmacionBorrado({
  children,
  reversible,
  onCancelar,
  onConfirmar,
  cargando = false,
  error,
  confirmar = 'Sí, borrar',
  cargandoTexto = 'Borrando…',
}: ConfirmacionBorradoProps) {
  return (
    <div className="card card--riesgo">
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
        {children}
        {children ? ' ' : ''}
        {reversible ?? 'No se puede deshacer.'}
      </div>
      {error && (
        <div className="field-error-text" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancelar} disabled={cargando}>
          Cancelar
        </button>
        <button type="button" className="btn btn-peligro" onClick={onConfirmar} disabled={cargando}>
          {cargando ? cargandoTexto : confirmar}
        </button>
      </div>
    </div>
  );
}
