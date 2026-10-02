import { Icono } from './iconos';
import { MEDIO_VISITA, type MedioVisita } from '@/lib/medio-visita';

// «¿Cómo es la visita?»: tres botones en una fila — Presencial / Teams / Llamada —
// con icono, palabra y color (el elegido se rellena del color del medio). Compactos
// (44 px) pero inconfundibles, y arriba del formulario para que no pasen desapercibidos. Con Teams, además, el enlace (opcional). Lo usan
// empezar-visita-hoja, planificar-visita, la ventana «¿A qué vas?» y el cambio de
// medio dentro de la visita.
interface Props {
  medio: MedioVisita;
  enlace: string;
  onMedio: (m: MedioVisita) => void;
  onEnlace: (e: string) => void;
}

const ORDEN: MedioVisita[] = ['presencial', 'teams', 'llamada'];

export function SelectorMedioVisita({ medio, enlace, onMedio, onEnlace }: Props) {
  return (
    <div className="medio-selector">
      <div className="medio-selector__titulo">¿Cómo es la visita?</div>
      <div className="medio-opciones" role="radiogroup" aria-label="Cómo es la visita">
        {ORDEN.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={medio === m}
            className={`medio-opcion medio-opcion--${m}${medio === m ? ' medio-opcion--on' : ''}`}
            onClick={() => onMedio(m)}
          >
            <Icono nombre={MEDIO_VISITA[m].icono} size={20} />
            <span>{MEDIO_VISITA[m].etiqueta}</span>
          </button>
        ))}
      </div>
      {medio === 'teams' && (
        <>
          <div className="label">Enlace de la reunión (opcional)</div>
          <input
            type="url"
            inputMode="url"
            className="field"
            placeholder="https://teams.microsoft.com/…"
            value={enlace}
            onChange={(e) => onEnlace(e.target.value)}
          />
        </>
      )}
    </div>
  );
}
