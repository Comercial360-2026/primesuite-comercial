import { useState } from 'react';
import type { HallazgoPayload } from '@/lib/offline-queue/types';
import { SelectorTermino } from '@/components/ui/selector-termino';
import { AyudaNota } from '@/components/ui/ayuda-nota';
import { Modal } from '@/components/ui/modal';

interface HallazgoRapidoModalProps {
  visitaId: string;
  comercialId: string;
  onGuardar: (payload: HallazgoPayload) => Promise<void>;
  onCerrar: () => void;
}

interface TerminoSeleccionado {
  id: string;
  nombre: string;
}

const NATURALEZAS: HallazgoPayload['naturaleza'][] = [
  'contexto',
  'oportunidad',
  'riesgo',
  'competencia',
  'fortaleza',
  'proyecto_activo',
];

// Captura mínima según lo cerrado: término + naturaleza, nada más — la
// nota, ubicación y fecha relevante se completan después en Detalle de
// Hallazgo (ya construido y probado). El selector de término (buscador +
// categorías desplegables) vive en SelectorTermino, reutilizado también en
// Detalle de Oportunidad — un único componente, mismo comportamiento en
// los tres sitios donde se elige un término.
export function HallazgoRapidoModal({
  visitaId,
  comercialId,
  onGuardar,
  onCerrar,
}: HallazgoRapidoModalProps) {
  const [terminoSeleccionado, setTerminoSeleccionado] = useState<TerminoSeleccionado | null>(null);
  const [naturaleza, setNaturaleza] = useState<HallazgoPayload['naturaleza']>('contexto');
  const [guardando, setGuardando] = useState(false);
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!terminoSeleccionado) return;
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({
        visitaId,
        comercialAutorId: comercialId,
        terminoId: terminoSeleccionado.id,
        naturaleza,
      });
      // El cierre del modal lo controla el padre (visita-activa.tsx), con
      // el mismo retraso de 700ms, para que "guardado ✓" sea visible antes
      // de desaparecer.
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
    <Modal titulo="hallazgo" onCerrar={onCerrar}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 8 }}>
          lo que el cliente tiene, sea de quién sea
        </div>

        {terminoSeleccionado ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="chip chip--on">{terminoSeleccionado.nombre}</span>
            <button
              type="button"
              onClick={() => setTerminoSeleccionado(null)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}
            >
              cambiar
            </button>
          </div>
        ) : (
          <SelectorTermino onSeleccionar={setTerminoSeleccionado} />
        )}

        <div className="label">naturaleza</div>
        <AyudaNota concepto="naturaleza-hallazgo" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {NATURALEZAS.map((n) => (
            <button
              key={n}
              type="button"
              className={`chip${naturaleza === n ? ' chip--on' : ''}`}
              onClick={() => setNaturaleza(n)}
            >
              {n.replace('_', ' ')}
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          disabled={!terminoSeleccionado || guardando || guardadoConExito}
          onClick={guardar}
        >
          {guardadoConExito ? 'Guardado ✓' : guardando ? 'Guardando…' : 'Guardar'}
        </button>

        {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
    </Modal>
  );
}
