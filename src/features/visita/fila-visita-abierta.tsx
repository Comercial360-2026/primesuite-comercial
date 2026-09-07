import { haceRelativo } from '@/lib/fechas';
import { tonoPorAntiguedad } from '@/lib/tono-antiguedad';
import { Icono } from '@/components/ui/iconos';

export interface VisitaAbierta {
  id: string;
  clienteNombre: string;
  /** Proyecto de la visita (puede faltar en datos antiguos). */
  proyectoNombre: string | null;
  /** `visita.en_curso_desde` — para "abierta hace…" y el tono. */
  desde: string | null;
  /** ¿Soy responsable de ella? Si no, no puedo cerrarla ni descartarla. */
  esMia?: boolean;
  /** Nombre del responsable, para "en curso de …" cuando no es mía. */
  responsableNombre?: string | null;
}

const COLOR_TONO: Record<string, string> = {
  neutral: 'var(--ink-200)',
  aviso: 'var(--warning-600)',
  riesgo: 'var(--risk-600)',
};

// Una visita EN CURSO en la lista de "visitas abiertas sin cerrar": el cuerpo
// abre la visita; a la derecha, Cerrar (va al cierre) y Descartar (la borra).
// Barra de color a la izquierda según lleve más o menos abierta. Si la visita
// es de otro comercial, se ve pero sin acciones. Mismo componente para el
// panel (aviso) y para "También en curso" de Hoy.
export function FilaVisitaAbierta({
  visita,
  puedeAccionar = true,
  onAbrir,
  onCerrar,
  onDescartar,
}: {
  visita: VisitaAbierta;
  /** false sin conexión: se ven las acciones desactivadas. */
  puedeAccionar?: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  onDescartar: () => void;
}) {
  const tono = tonoPorAntiguedad(visita.desde);
  const esMia = visita.esMia ?? true;
  const meta = [
    visita.proyectoNombre || null,
    visita.desde ? `abierta ${haceRelativo(visita.desde)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        border: '1px solid var(--ink-200)',
        borderLeft: `3px solid ${COLOR_TONO[tono]}`,
        borderRadius: 'var(--radius-field)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onAbrir}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'left',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          padding: '10px 12px',
          font: 'inherit',
        }}
      >
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink-900)' }}>
          {visita.clienteNombre}
        </div>
        {meta && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 2 }}>
            {meta}
          </div>
        )}
        {!esMia && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 2 }}>
            en curso de {visita.responsableNombre || 'otro comercial'} · no puedes cerrarla
          </div>
        )}
      </button>

      {esMia && (
        <div style={{ display: 'flex', borderLeft: '1px solid var(--ink-200)' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCerrar();
            }}
            disabled={!puedeAccionar}
            title="Cerrar la visita"
            style={botonAccion}
          >
            <Icono nombre="check" size={16} />
            Cerrar
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDescartar();
            }}
            disabled={!puedeAccionar}
            title="Descartar la visita"
            style={{ ...botonAccion, color: 'var(--risk-600)', borderLeft: '1px solid var(--ink-200)' }}
          >
            <Icono nombre="borrar" size={16} />
            Descartar
          </button>
        </div>
      )}
    </div>
  );
}

const botonAccion: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  minWidth: 68,
  padding: '4px 8px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 'var(--text-xs)',
  color: 'var(--ink-700)',
};
