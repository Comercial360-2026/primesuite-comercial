import { useState } from 'react';
import type { HallazgoPayload } from '@/lib/offline-queue/types';
import { SelectorTermino } from '@/components/ui/selector-termino';
import { AyudaNota } from '@/components/ui/ayuda-nota';
import { HojaInferior } from '@/components/ui/hoja-inferior';
import { Icono } from '@/components/ui/iconos';
import { NATURALEZA_LABEL, etiqueta } from '@/lib/etiquetas-visita';

interface HallazgoRapidoHojaProps {
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

// Captura en caliente: término + naturaleza + una nota opcional para el
// contexto ("el lector falla dos veces al día", "lo instaló la competencia
// hace un año"). Antes la nota solo se podía añadir luego, desde el Detalle
// de Hallazgo — que en la práctica nadie abría, así que el hallazgo quedaba
// sin contexto. El resto (ubicación, fecha relevante) sí se completa
// después. El selector de término vive en SelectorTermino, reutilizado
// también en Detalle de Oportunidad.
export function HallazgoRapidoHoja({
  visitaId,
  comercialId,
  onGuardar,
  onCerrar,
}: HallazgoRapidoHojaProps) {
  const [terminoSeleccionado, setTerminoSeleccionado] = useState<TerminoSeleccionado | null>(null);
  const [naturaleza, setNaturaleza] = useState<HallazgoPayload['naturaleza']>('contexto');
  const [nota, setNota] = useState('');
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
        nota: nota.trim() || undefined,
      });
      // El cierre lo controla el padre (visita-activa.tsx), con el mismo
      // retraso de 700ms, para que "guardado ✓" sea visible antes de
      // desaparecer.
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
    <HojaInferior titulo="Hallazgo" onCerrar={onCerrar}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 8 }}>
          Algo que el cliente ya tiene instalado, sea de la marca que sea.
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

        <div className="label">Naturaleza</div>
        <AyudaNota concepto="naturaleza-hallazgo" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {NATURALEZAS.map((n) => (
            <button
              key={n}
              type="button"
              className={`chip${naturaleza === n ? ' chip--on' : ''}`}
              onClick={() => setNaturaleza(n)}
            >
              {etiqueta(NATURALEZA_LABEL, n)}
            </button>
          ))}
        </div>

        <div className="label">Nota (opcional)</div>
        <textarea
          className="field"
          style={{ height: 'auto', padding: 8 }}
          rows={2}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="el contexto en caliente: qué falla, desde cuándo, quién lo puso…"
        />

        <button
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          disabled={!terminoSeleccionado || guardando || guardadoConExito}
          onClick={guardar}
        >
          {guardadoConExito ? <><Icono nombre="check" size={16} /> Guardado</> : guardando ? 'Guardando…' : 'Guardar'}
        </button>

        {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
    </HojaInferior>
  );
}
