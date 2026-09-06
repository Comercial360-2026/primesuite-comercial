import { useState } from 'react';
import { uuid } from '@/lib/uuid';
import type { OportunidadPayload } from '@/lib/offline-queue/types';
import { HojaInferior } from '@/components/ui/hoja-inferior';
import { Icono } from '@/components/ui/iconos';
import { PRIORIDAD_LABEL, etiqueta } from '@/lib/etiquetas-visita';

interface OportunidadRapidaModalProps {
  visitaId: string;
  clienteId: string | undefined;
  comercialId: string;
  /** El id de la oportunidad se genera aquí (mismo que la operación de cola)
   *  para poder ofrecer "Completar ahora" nada más guardarla. */
  onGuardar: (oportunidadId: string, payload: OportunidadPayload) => Promise<void>;
  /** Abre el Detalle de la oportunidad recién creada. */
  onCompletar: (oportunidadId: string) => void;
  onCerrar: () => void;
}

const PRIORIDADES: OportunidadPayload['prioridad'][] = ['baja', 'media', 'alta', 'estrategica'];

// Captura mínima según lo cerrado: título, prioridad. Nada más — el resto
// se completa en Detalle de Oportunidad. Tras guardar, el comercial elige:
// completar la oportunidad ahora, o seguir en la visita y hacerlo luego.
export function OportunidadRapidaModal({
  visitaId,
  clienteId,
  comercialId,
  onGuardar,
  onCompletar,
  onCerrar,
}: OportunidadRapidaModalProps) {
  const [oportunidadId] = useState(() => uuid());
  const [titulo, setTitulo] = useState('');
  const [prioridad, setPrioridad] = useState<OportunidadPayload['prioridad']>('media');
  const [guardando, setGuardando] = useState(false);
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!titulo.trim()) return;
    // Defensa explícita: antes fallaba en silencio si clienteId aún no
    // había resuelto (causa raíz corregida en use-visita-local.ts). Se deja
    // este aviso visible para que, si vuelve a ocurrir por cualquier motivo
    // futuro, el comercial vea un mensaje en vez de un botón que no hace nada.
    if (!clienteId) {
      setError('No se ha podido identificar el cliente de esta visita. Vuelve a intentarlo en unos segundos.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(oportunidadId, {
        clienteId,
        comercialAutorId: comercialId,
        visitaOrigenId: visitaId,
        titulo: titulo.trim(),
        prioridad,
      });
      setGuardadoConExito(true);
    } catch (err) {
      // BUG CORREGIDO: sin este catch, cualquier excepción dentro de
      // onGuardar (fallo de IndexedDB, error de red, lo que sea) dejaba
      // `guardando` en true para siempre — el botón quedaba deshabilitado
      // de forma permanente, sin ningún error visible.
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
    <HojaInferior titulo="Oportunidad rápida" onCerrar={onCerrar}>
      {guardadoConExito ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--success-600)', fontWeight: 500 }}>
            <Icono nombre="check" size={16} /> Guardado
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', margin: '4px 0 12px' }}>
            «{titulo.trim()}» — {etiqueta(PRIORIDAD_LABEL, prioridad)}. Puedes completarla ahora (etapa,
            horizonte, qué ya tiene el cliente, qué le proponemos…) o hacerlo luego desde el cliente.
          </div>
          <button
            className="btn btn-primary"
            onClick={() => onCompletar(oportunidadId)}
          >
            Completar ahora
          </button>
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onCerrar}>
            Listo, sigo en la visita
          </button>
        </>
      ) : (
        <>
          <div className="label">Título</div>
          <input
            className="field"
            autoFocus
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="sustitución control de accesos"
          />

          <div className="label">Prioridad</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {PRIORIDADES.map((p) => (
              <button
                key={p}
                type="button"
                className={`chip${prioridad === p ? ' chip--on' : ''}`}
                onClick={() => setPrioridad(p)}
              >
                {etiqueta(PRIORIDAD_LABEL, p)}
              </button>
            ))}
          </div>

          <button
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            disabled={!titulo.trim() || guardando}
            onClick={guardar}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>

          {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
        </>
      )}
    </HojaInferior>
  );
}
