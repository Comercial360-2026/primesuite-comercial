import { useState } from 'react';
import type { OportunidadPayload } from '@/lib/offline-queue/types';
import { Modal } from '@/components/ui/modal';

interface OportunidadRapidaModalProps {
  visitaId: string;
  clienteId: string | undefined;
  comercialId: string;
  onGuardar: (payload: OportunidadPayload) => Promise<void>;
  onCerrar: () => void;
}

const PRIORIDADES: OportunidadPayload['prioridad'][] = ['baja', 'media', 'alta', 'estrategica'];

// Captura mínima según lo cerrado: título, prioridad, solución principal
// opcional. Nada más — el resto se completa después en Detalle de
// Oportunidad. Se presenta como overlay sobre Visita activa, no como
// navegación a otra pantalla, para no romper el flujo de la visita.
export function OportunidadRapidaModal({
  visitaId,
  clienteId,
  comercialId,
  onGuardar,
  onCerrar,
}: OportunidadRapidaModalProps) {
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
      await onGuardar({
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
      // de forma permanente, sin ningún error visible ni en Network,
      // porque la petición nunca llegó a dispararse la segunda vez.
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
    <Modal titulo="oportunidad rápida" onCerrar={onCerrar}>
        <div className="label">título</div>
        <input
          className="field"
          autoFocus
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="sustitución control de accesos"
        />

        <div className="label">prioridad</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {PRIORIDADES.map((p) => (
            <button
              key={p}
              type="button"
              className={`chip${prioridad === p ? ' chip--on' : ''}`}
              onClick={() => setPrioridad(p)}
            >
              {p}
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          disabled={!titulo.trim() || guardando || guardadoConExito}
          onClick={guardar}
        >
          {guardadoConExito ? 'Guardado ✓' : guardando ? 'Guardando…' : 'Guardar'}
        </button>

        {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
    </Modal>
  );
}
