import { Icono } from './iconos';
import { MEDIO_VISITA, type MedioVisita } from '@/lib/medio-visita';

// «¿Cómo es la visita?»: tres iconos en una línea — Presencial / Teams / Llamada.
// Solo el elegido va relleno de su color; los otros, en gris. El nombre del elegido
// se escribe junto al título. Con Teams, además, el enlace (opcional). Lo usan
// empezar-visita-hoja, planificar-visita, la ventana «¿A qué vas?» y el cambio de
// medio dentro de la visita.
interface Props {
  medio: MedioVisita;
  enlace: string;
  onMedio: (m: MedioVisita) => void;
  onEnlace: (e: string) => void;
  /** Dentro de la visita: guardar el enlace al salir del campo. */
  onEnlaceBlur?: () => void;
  /** Visita aún sin sincronizar: se ve, pero no se puede cambiar. */
  deshabilitado?: boolean;
}

const ORDEN: MedioVisita[] = ['presencial', 'teams', 'llamada'];

export function SelectorMedioVisita({ medio, enlace, onMedio, onEnlace, onEnlaceBlur, deshabilitado }: Props) {
  return (
    <div className="medio-selector">
      <div className="medio-selector__fila">
        <div>
          <div className="medio-selector__titulo">¿Cómo es la visita?</div>
          {/* El nombre del elegido, con su color: así el icono activo nunca es ambiguo. */}
          <div className={`medio-selector__elegido medio-selector__elegido--${medio}`}>{MEDIO_VISITA[medio].etiqueta}</div>
        </div>
        <div className="medio-opciones" role="radiogroup" aria-label="Cómo es la visita">
          {ORDEN.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={medio === m}
              aria-label={MEDIO_VISITA[m].etiqueta}
              title={MEDIO_VISITA[m].etiqueta}
              className={`medio-opcion medio-opcion--${m}${medio === m ? ' medio-opcion--on' : ''}`}
              disabled={deshabilitado}
              onClick={() => onMedio(m)}
            >
              <Icono nombre={MEDIO_VISITA[m].icono} size={22} />
            </button>
          ))}
        </div>
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
            onBlur={onEnlaceBlur}
            disabled={deshabilitado}
          />
        </>
      )}
    </div>
  );
}
