import { useState } from 'react';
import { Modal } from '@/components/ui/modal';

interface ProyectoOpcion {
  id: string;
  nombre: string;
  es_general: boolean;
}

interface ObjetivoVisitaModalProps {
  // Nombre del cliente para encabezar la ventana ("Visita a …").
  clienteNombre?: string;
  // Proyectos del cliente. Si hay 2+, la ventana muestra un selector para
  // elegir a cuál va esta visita (el General = "Sin proyecto asignado", va
  // primero y es el valor por defecto). Con 0 o 1, no se dibuja selector.
  proyectos?: ProyectoOpcion[];
  // Proyecto preseleccionado. Sirve también de valor devuelto cuando no hay
  // selector (p. ej. desde la ficha de un proyecto concreto).
  proyectoInicial?: string;
  // Arranca la visita con el objetivo escrito y el proyecto elegido. El
  // cierre de la ventana y la navegación los controla quien la abre, igual
  // que el resto de modales.
  onConfirmar: (objetivo: string, proyectoId: string) => Promise<void> | void;
  onCerrar: () => void;
}

// Ventana obligatoria al arrancar una visita "sobre la marcha" (los caminos
// de "Iniciar visita ahora", que no pasan por planificación). El objetivo de
// una visita se piensa ANTES de entrar al cliente — una visita planificada
// ya lo pregunta en su formulario; esta es su equivalente para la visita
// improvisada. No se puede empezar sin escribirlo.
export function ObjetivoVisitaModal({
  clienteNombre,
  proyectos,
  proyectoInicial,
  onConfirmar,
  onCerrar,
}: ObjetivoVisitaModalProps) {
  const [objetivo, setObjetivo] = useState('');
  const [proyectoId, setProyectoId] = useState(
    proyectoInicial ?? proyectos?.[0]?.id ?? ''
  );
  const [arrancando, setArrancando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El selector solo aparece si de verdad hay que elegir (2+ proyectos).
  const hayQueElegir = (proyectos?.length ?? 0) > 1;

  async function empezar() {
    if (!objetivo.trim() || arrancando) return;
    setArrancando(true);
    setError(null);
    try {
      await onConfirmar(objetivo.trim(), proyectoId);
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
    <Modal titulo={`¿A qué vas${clienteNombre ? ` a ${clienteNombre}` : ''}?`} onCerrar={onCerrar}>
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

      {hayQueElegir && (
        <>
          <div className="label">Proyecto</div>
          <select
            className="field"
            value={proyectoId}
            onChange={(e) => setProyectoId(e.target.value)}
          >
            {proyectos!.map((p) => (
              <option key={p.id} value={p.id}>
                {p.es_general ? 'Sin proyecto asignado' : p.nombre}
              </option>
            ))}
          </select>
        </>
      )}

      <button
        className="btn btn-primary"
        style={{ marginTop: 12 }}
        disabled={!objetivo.trim() || arrancando}
        onClick={empezar}
      >
        {arrancando ? 'Empezando…' : 'Empezar visita'}
      </button>

      {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
    </Modal>
  );
}
