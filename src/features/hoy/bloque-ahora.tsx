import { Icono } from '@/components/ui/iconos';
import { hora, fechaDiaMes } from '@/lib/fechas';

// El bloque de arriba de "Hoy": lo único que importa nada más entrar —
// qué haces ahora. Tres formas:
//   - hay visita(s) en curso  → "En curso", tarjeta destacada, "Continuar visita"
//   - no, pero hay una próxima → "Tu próxima visita", "Ver preparación"
//   - no hay nada de nada      → no se dibuja (la pantalla enseña el estado vacío)

interface VisitaMin {
  id: string;
  fecha: string;
  hora_definida: boolean;
  objetivo: string | null;
  cliente: { id: string; nombre: string } | null;
}

interface Props {
  enCurso: VisitaMin[];
  /** Siguiente visita sin empezar (de hoy o futura). */
  proxima: VisitaMin | null;
  /** True si `proxima` es de hoy (cambia el texto de "cuándo"). */
  proximaEsHoy: boolean;
  onAbrir: (visita: VisitaMin) => void;
}

export function BloqueAhora({ enCurso, proxima, proximaEsHoy, onAbrir }: Props) {
  if (enCurso.length > 0) {
    const v = enCurso[0];
    return (
      <div className="bloque-ahora">
        <span className="bloque-ahora__tag">
          <Icono nombre="reproducir" size={12} /> En curso
        </span>
        <div className="bloque-ahora__cli">{v.cliente?.nombre ?? 'Cliente'}</div>
        {v.objetivo && <div className="bloque-ahora__obj">{v.objetivo}</div>}
        {/* Si hay más de una en curso, el resto se listan (y se abren/descartan)
            en la sección "También en curso" de Hoy, justo debajo. */}
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={() => onAbrir(v)}
        >
          Continuar visita
          <Icono nombre="chevron" size={16} />
        </button>
      </div>
    );
  }

  if (proxima) {
    const cuando = proximaEsHoy
      ? proxima.hora_definida
        ? `hoy a las ${hora(proxima.fecha)}`
        : 'hoy'
      : fechaDiaMes(proxima.fecha) + (proxima.hora_definida ? ` · ${hora(proxima.fecha)}` : '');
    return (
      <div className="bloque-ahora bloque-ahora--prox">
        <span className="bloque-ahora__tag">Tu próxima visita</span>
        <div className="bloque-ahora__cli">{proxima.cliente?.nombre ?? 'Cliente'}</div>
        {proxima.objetivo && <div className="bloque-ahora__obj">{proxima.objetivo}</div>}
        <div className="bloque-ahora__meta">{cuando}</div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={() => onAbrir(proxima)}
        >
          Ver preparación
          <Icono nombre="chevron" size={16} />
        </button>
      </div>
    );
  }

  return null;
}
