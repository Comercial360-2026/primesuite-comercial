import { useState } from 'react';
import type { ProximoPasoPayload } from '@/lib/offline-queue/types';

interface PasoRapidoModalProps {
  visitaId: string;
  comercialId: string;
  onGuardar: (payload: ProximoPasoPayload) => Promise<void>;
  onCerrar: () => void;
}

// Captura mínima, mismo criterio ya cerrado para Hallazgo y Oportunidad
// rápida: descripción + fecha objetivo (opcional). El resto (vínculo a una
// oportunidad concreta) se completa después en Detalle de Próximo Paso, no
// aquí — mismo patrón "captura mínima + completar después".
export function PasoRapidoModal({ visitaId, comercialId, onGuardar, onCerrar }: PasoRapidoModalProps) {
  const [descripcion, setDescripcion] = useState('');
  const [fechaObjetivo, setFechaObjetivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!descripcion.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({
        visitaId,
        comercialResponsableId: comercialId,
        descripcion: descripcion.trim(),
        fechaObjetivo: fechaObjetivo || undefined,
      });
      // El cierre del modal lo controla el padre (visita-activa.tsx), con
      // el mismo retraso de 700ms que el resto de modales, para que
      // "guardado ✓" sea visible antes de desaparecer.
      setGuardadoConExito(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo guardar: ${err.message}`
          : 'No se pudo guardar. Inténtalo de nuevo.'
      );
    } finally {
      setGuardando(false);
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
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 500 }}>próximo paso</div>
          <button
            type="button"
            onClick={onCerrar}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}
            aria-label="cerrar"
          >
            ×
          </button>
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 8 }}>
          qué hay que hacer después de esta visita
        </div>

        <textarea
          className="field"
          style={{ height: 'auto', padding: 8 }}
          rows={2}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="volver a llamar en dos semanas, enviar propuesta…"
          autoFocus
        />

        <div className="label">fecha objetivo (opcional)</div>
        <input
          className="field"
          type="date"
          value={fechaObjetivo}
          onChange={(e) => setFechaObjetivo(e.target.value)}
        />

        <button
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          disabled={!descripcion.trim() || guardando || guardadoConExito}
          onClick={guardar}
        >
          {guardadoConExito ? 'Guardado ✓' : guardando ? 'Guardando…' : 'Guardar'}
        </button>

        {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
