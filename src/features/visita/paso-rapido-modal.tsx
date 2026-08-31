import { useState } from 'react';
import type { ProximoPasoPayload } from '@/lib/offline-queue/types';

interface PasoRapidoModalProps {
  visitaId: string;
  comercialId: string;
  onGuardar: (payload: ProximoPasoPayload) => Promise<void>;
  onPlanificarVisita: (args: {
    fecha: string;
    hora: string;
    franja: '' | 'manana' | 'tarde';
    objetivo: string;
  }) => Promise<void>;
  onCerrar: () => void;
}

// Al terminar una visita, lo que queda pendiente es de dos tipos y el
// comercial lo sabe en caliente:
//   - Tarea: algo de despacho ("enviar propuesta", "llamar a compras").
//     Va a proximo_paso y aparece en "Mis próximos pasos".
//   - Próxima visita: hay que volver otro día. Se planifica ahí mismo y
//     aparece en Agenda / calendario / "Hoy" — no se crea ningún
//     proximo_paso.
// Antes solo existía la primera y una "revisita" quedaba invisible fuera
// de la pestaña Tareas.
export function PasoRapidoModal({
  onGuardar,
  onPlanificarVisita,
  visitaId,
  comercialId,
  onCerrar,
}: PasoRapidoModalProps) {
  const [modo, setModo] = useState<'tarea' | 'visita'>('tarea');

  const [descripcion, setDescripcion] = useState('');
  const [fechaObjetivo, setFechaObjetivo] = useState('');

  const [fechaVisita, setFechaVisita] = useState('');
  const [horaVisita, setHoraVisita] = useState('');
  const [franjaVisita, setFranjaVisita] = useState<'' | 'manana' | 'tarde'>('');
  const [objetivoVisita, setObjetivoVisita] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoyISO = new Date().toISOString().slice(0, 10);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      if (modo === 'tarea') {
        if (!descripcion.trim()) return;
        await onGuardar({
          visitaId,
          comercialResponsableId: comercialId,
          descripcion: descripcion.trim(),
          fechaObjetivo: fechaObjetivo || undefined,
        });
      } else {
        if (!fechaVisita || !objetivoVisita.trim()) return;
        await onPlanificarVisita({
          fecha: fechaVisita,
          hora: horaVisita,
          franja: franjaVisita,
          objetivo: objetivoVisita,
        });
      }
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

  const puedeGuardar =
    modo === 'tarea'
      ? !!descripcion.trim()
      : !!fechaVisita && !!objetivoVisita.trim();

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
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 500 }}>qué queda pendiente</div>
          <button
            type="button"
            onClick={onCerrar}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}
            aria-label="cerrar"
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            type="button"
            className={`chip${modo === 'tarea' ? ' chip--on' : ''}`}
            onClick={() => {
              setModo('tarea');
              setError(null);
            }}
          >
            Tarea
          </button>
          <button
            type="button"
            className={`chip${modo === 'visita' ? ' chip--on' : ''}`}
            onClick={() => {
              setModo('visita');
              setError(null);
            }}
          >
            Próxima visita
          </button>
        </div>

        {modo === 'tarea' ? (
          <>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', margin: '8px 0' }}>
              algo de despacho: enviar propuesta, llamar a compras…
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
          </>
        ) : (
          <>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', margin: '8px 0' }}>
              hay que volver otro día. Se planifica y sale en tu agenda.
            </div>
            <div className="label" style={{ marginTop: 0 }}>fecha</div>
            <input
              className="field"
              type="date"
              min={hoyISO}
              value={fechaVisita}
              onChange={(e) => setFechaVisita(e.target.value)}
            />
            <div className="label">objetivo</div>
            <textarea
              className="field"
              style={{ height: 'auto', padding: 8 }}
              rows={2}
              placeholder="a qué vuelves: cerrar el pedido, revisar la instalación…"
              value={objetivoVisita}
              onChange={(e) => setObjetivoVisita(e.target.value)}
            />
            <div className="label">hora (opcional)</div>
            <input
              className="field"
              type="time"
              value={horaVisita}
              onChange={(e) => setHoraVisita(e.target.value)}
            />
            {!horaVisita && (
              <>
                <div className="label">sin hora concreta, ¿cuándo?</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(
                    [
                      ['manana', 'Mañana'],
                      ['tarde', 'Tarde'],
                      ['', 'Sin hora fija'],
                    ] as const
                  ).map(([val, txt]) => (
                    <button
                      key={val || 'sin'}
                      type="button"
                      className={`chip${franjaVisita === val ? ' chip--on' : ''}`}
                      onClick={() => setFranjaVisita(val)}
                    >
                      {txt}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <button
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          disabled={!puedeGuardar || guardando || guardadoConExito}
          onClick={guardar}
        >
          {guardadoConExito
            ? modo === 'tarea'
              ? 'Guardado ✓'
              : 'Planificada ✓'
            : guardando
              ? 'Guardando…'
              : modo === 'tarea'
                ? 'Guardar'
                : 'Planificar visita'}
        </button>

        {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
