import { desdeHace } from '@/lib/fechas';
import { tonoPorAntiguedad } from '@/lib/tono-antiguedad';
import { plural } from '@/lib/texto';
import { FilaToggle, type EstadoSeleccion } from '@/components/ui/fila-toggle';

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
  /** Oportunidades con etapa <> 'cerrada' colgando de esta visita. > 0 =
   *  no se puede marcar para descartar (eliminar_visita_completa lo
   *  rechaza en el servidor de todas formas — esto es solo para no
   *  dejar marcar algo que se sabe de antemano que va a fallar). */
  oportunidadesAbiertas?: number;
}

const COLOR_TONO: Record<string, string> = {
  neutral: 'var(--ink-200)',
  aviso: 'var(--warning-600)',
  riesgo: 'var(--risk-600)',
};

// Una visita EN CURSO en una lista ("También en curso" de Hoy, panel de
// "visitas abiertas sin cerrar"). La fila SOLO abre la visita. Cerrar y
// descartar NO son botones por fila: van por el modo "Seleccionar" del
// contenedor (chip → casillas FilaToggle → BarraSeleccion con [Cerrar] /
// [Descartar]). Barra de color a la izquierda según lleve más o menos
// abierta. Si la visita es de otro comercial, se ve pero no es accionable
// ni seleccionable.
export function FilaVisitaAbierta({
  visita,
  onAbrir,
  seleccion,
}: {
  visita: VisitaAbierta;
  onAbrir: () => void;
  /** Lo pasa el contenedor cuando su modo "Seleccionar" está activo. Solo
   *  aplica a las visitas propias. */
  seleccion?: EstadoSeleccion;
}) {
  const tono = tonoPorAntiguedad(visita.desde);
  const esMia = visita.esMia ?? true;
  const bloqueadaPorOportunidad = esMia && (visita.oportunidadesAbiertas ?? 0) > 0;
  const meta = [
    visita.proyectoNombre || null,
    visita.desde ? `abierta ${desdeHace(visita.desde)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const seleccionando = !!seleccion?.activa && esMia && !bloqueadaPorOportunidad;
  const marcada = !!seleccion?.marcada;

  return (
    <button
      type="button"
      onClick={seleccionando ? seleccion!.onToggle : onAbrir}
      aria-pressed={seleccionando ? marcada : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        border: '1px solid var(--ink-200)',
        borderLeft: `3px solid ${COLOR_TONO[tono]}`,
        borderRadius: 'var(--radius-field)',
        background: marcada ? 'var(--brand-050)' : 'none',
        cursor: 'pointer',
        padding: '10px 12px',
        font: 'inherit',
      }}
    >
      {seleccionando && <FilaToggle marcada={marcada} />}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink-900)' }}>
          {visita.clienteNombre}
        </span>
        {meta && (
          <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 2 }}>
            {meta}
          </span>
        )}
        {!esMia && (
          <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 2 }}>
            en curso de {visita.responsableNombre || 'otro comercial'} · no puedes cerrarla
          </span>
        )}
        {bloqueadaPorOportunidad && (
          <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--warning-600)', marginTop: 2 }}>
            {plural(visita.oportunidadesAbiertas ?? 0, 'oportunidad abierta', 'oportunidades abiertas')} · ciérrala
            {(visita.oportunidadesAbiertas ?? 0) > 1 ? 's' : ''} para poder descartarla
          </span>
        )}
      </span>
    </button>
  );
}
