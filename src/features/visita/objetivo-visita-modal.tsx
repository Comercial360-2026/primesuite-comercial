import { useState } from 'react';

interface ObjetivoVisitaModalProps {
  // Nombre del cliente para encabezar la ventana ("Visita a …").
  clienteNombre?: string;
  // Arranca la visita con el objetivo escrito. El cierre de la ventana y la
  // navegación los controla quien la abre, igual que el resto de modales.
  onConfirmar: (objetivo: string) => Promise<void> | void;
  onCerrar: () => void;
}

// Ventana obligatoria al arrancar una visita "sobre la marcha" (los caminos
// de "Iniciar visita ahora", que no pasan por planificación). El objetivo de
// una visita se piensa ANTES de entrar al cliente — una visita planificada
// ya lo pregunta en su formulario; esta es su equivalente para la visita
// improvisada. No se puede empezar sin escribirlo.
export function ObjetivoVisitaModal({ clienteNombre, onConfirmar, onCerrar }: ObjetivoVisitaModalProps) {
  const [objetivo, setObjetivo] = useState('');
  const [arrancando, setArrancando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function empezar() {
    if (!objetivo.trim() || arrancando) return;
    setArrancando(true);
    setError(null);
    try {
      await onConfirmar(objetivo.trim());
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo empezar la visita: ${err.message}`
          : 'No se pudo empezar la visita. Inténtalo de nuevo.'
      );
      setArrancando(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--surface-0)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 10,
      }}
      onClick={onCerrar}
    >
      <div
        className="card"
        style={{ width: '100%', boxSizing: 'border-box', margin: 'var(--space-5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 500 }}>
            ¿A qué vas{clienteNombre ? ` a ${clienteNombre}` : ''}?
          </div>
          <button
            type="button"
            onClick={onCerrar}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}
            aria-label="cerrar"
          >
            ×
          </button>
        </div>

        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', margin: '8px 0' }}>
          el objetivo de la visita. Podrás matizarlo dentro.
        </div>
        <textarea
          className="field"
          style={{ height: 'auto', padding: 8 }}
          rows={2}
          autoFocus
          value={objetivo}
          onChange={(e) => setObjetivo(e.target.value)}
          placeholder="cerrar el pedido pendiente, presentar la nueva gama, primera toma de contacto…"
        />

        <button
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          disabled={!objetivo.trim() || arrancando}
          onClick={empezar}
        >
          {arrancando ? 'Empezando…' : 'Empezar visita'}
        </button>

        {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
