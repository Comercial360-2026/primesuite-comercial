import { Modal } from '@/components/ui/modal';
import { Icono } from '@/components/ui/iconos';
import { desdeHace } from '@/lib/fechas';

interface VisitaEnCursoModalProps {
  clienteNombre?: string;
  // Objetivo de la visita que ya está abierta, para que el comercial
  // reconozca cuál es antes de decidir.
  objetivo: string | null;
  /** Proyecto de esa visita. `null` solo si el join no lo trajo. */
  proyectoNombre?: string | null;
  /** `visita.en_curso_desde` — para "abierta hace…". */
  enCursoDesde?: string | null;
  /** True (por defecto) si la visita la llevo yo. False = participo en la de otra persona. */
  esMia?: boolean;
  responsableNombre?: string | null;
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
  esMia = true,
  responsableNombre,
  onContinuar,
  onEmpezarOtra,
  onCerrar,
}: VisitaEnCursoModalProps) {
  const contexto = [
    proyectoNombre || null,
    enCursoDesde ? `abierta ${desdeHace(enCursoDesde)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Modal
      titulo={
        esMia
          ? `Ya tienes una visita en curso${clienteNombre ? ` con ${clienteNombre}` : ''}`
          : `Participas en una visita en curso${clienteNombre ? ` con ${clienteNombre}` : ''}`
      }
      onCerrar={onCerrar}
    >
      {!esMia && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-700)', margin: '8px 0 2px' }}>
          {responsableNombre ? `La lleva ${responsableNombre}. ` : ''}Puedes empezar la tuya cuando quieras.
        </div>
      )}
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

      {esMia ? (
        <>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onContinuar}>
            Continuar esa visita
            <Icono nombre="chevron" size={18} />
          </button>
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onEmpezarOtra}>
            Empezar otra
          </button>
        </>
      ) : (
        <>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onEmpezarOtra}>
            Empezar la mía
            <Icono nombre="chevron" size={18} />
          </button>
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onContinuar}>
            Ver esa visita
          </button>
        </>
      )}
    </Modal>
  );
}
