import { Modal } from '@/components/ui/modal';

interface VisitaEnCursoModalProps {
  clienteNombre?: string;
  // Objetivo de la visita que ya está abierta, para que el comercial
  // reconozca cuál es antes de decidir.
  objetivo: string | null;
  onContinuar: () => void; // ir a la visita en curso que ya existe
  onEmpezarOtra: () => void; // seguir adelante y abrir una visita nueva
  onCerrar: () => void;
}

// Aviso al pulsar "Iniciar visita ahora" cuando ya hay una visita EN CURSO
// con ese cliente. No bloquea: deja continuar la que hay o empezar otra a
// propósito. Evita el apilado accidental de visitas abiertas.
export function VisitaEnCursoModal({
  clienteNombre,
  objetivo,
  onContinuar,
  onEmpezarOtra,
  onCerrar,
}: VisitaEnCursoModalProps) {
  return (
    <Modal
      titulo={`Ya tienes una visita en curso${clienteNombre ? ` con ${clienteNombre}` : ''}`}
      onCerrar={onCerrar}
    >
      {objetivo && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-700)', margin: '8px 0' }}>
          «{objetivo}»
        </div>
      )}

      <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onContinuar}>
        Continuar esa visita →
      </button>
      <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onEmpezarOtra}>
        Empezar otra
      </button>
    </Modal>
  );
}
