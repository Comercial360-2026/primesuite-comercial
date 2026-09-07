import { Modal } from '@/components/ui/modal';
import { Icono } from '@/components/ui/iconos';
import { haceRelativo } from '@/lib/fechas';

interface VisitaEnCursoModalProps {
  clienteNombre?: string;
  // Objetivo de la visita que ya está abierta, para que el comercial
  // reconozca cuál es antes de decidir.
  objetivo: string | null;
  /** Proyecto de esa visita (null = el General, no se nombra). */
  proyectoNombre?: string | null;
  /** `visita.en_curso_desde` — para "abierta hace…". */
  enCursoDesde?: string | null;
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
  proyectoNombre,
  enCursoDesde,
  onContinuar,
  onEmpezarOtra,
  onCerrar,
}: VisitaEnCursoModalProps) {
  const contexto = [
    proyectoNombre || null,
    enCursoDesde ? `abierta ${haceRelativo(enCursoDesde)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Modal
      titulo={`Ya tienes una visita en curso${clienteNombre ? ` con ${clienteNombre}` : ''}`}
      onCerrar={onCerrar}
    >
      {contexto && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', margin: '8px 0 2px' }}>
          {contexto}
        </div>
      )}
      {objetivo && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-700)', margin: '2px 0 8px' }}>
          «{objetivo}»
        </div>
      )}

      <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onContinuar}>
        Continuar esa visita
        <Icono nombre="chevron" size={18} />
      </button>
      <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onEmpezarOtra}>
        Empezar otra
      </button>
    </Modal>
  );
}
