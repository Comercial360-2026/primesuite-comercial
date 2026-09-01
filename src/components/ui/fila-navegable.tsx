import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icono, type NombreIcono } from './iconos';
import { FilaToggle, type EstadoSeleccion } from './fila-toggle';
import { useSwipeFila } from '@/hooks/use-swipe-fila';

/** Acción única que revela el gesto de deslizar (táctil). */
export interface AccionSwipe {
  etiqueta: string;
  icono: NombreIcono;
  onAccion: () => void;
  tono?: 'neutral' | 'riesgo';
}

const ANCHO_SWIPE = 96;

// Fila de una lista agrupada (dentro de SeccionLista). Es la pieza que
// sustituye a la maraña de `<div className="card" onClick={navigate(...)}>`
// repetida por toda la app: icono · título · subtítulo · valor · badge, con
// tono opcional, y se dibuja como enlace real (`to`) o como acción (`onClick`).
//
// - `to`     → <Link>: navegación real (clic medio, "abrir en pestaña"…),
//              muestra la flecha ">" por defecto.
// - `onClick`→ <button>: acción en el sitio (p. ej. "Cerrar sesión"),
//              sin flecha por defecto.
// Exactamente uno de los dos, obligado por el tipo.
//
// Aspecto en components.css (.fila*) sobre el bloque "Filas" de tokens.css.
// Ver 08_sistema_diseno.md §"Sistema de filas".

type Tono = 'neutral' | 'aviso' | 'riesgo' | 'ok';

interface PropsBase {
  icono?: NombreIcono;
  titulo: string;
  subtitulo?: string;
  /** Contenido a la derecha, antes de la flecha: texto ("72%"), un chip de
   *  estado, etc. Igual que `FilaDato.valor`. */
  valor?: ReactNode;
  /** Contador/etiqueta pequeña. No se dibuja si es 0 o vacío. */
  badge?: string | number;
  tono?: Tono;
  densidad?: 'normal' | 'compacta';
  /** Fuerza mostrar/ocultar la flecha ">". Por defecto: visible con `to`. */
  chevron?: boolean;
  disabled?: boolean;
  /** Modo seleccionar. Con `activa`, la fila deja de navegar/accionar: todo
   *  el cuerpo marca/desmarca (aparece la casilla, se oculta la flecha).
   *  Sin esta prop, o con `activa:false`, la fila es exactamente la de hoy. */
  seleccion?: EstadoSeleccion;
  /** Deslizar la fila a la izquierda revela esta acción (gesto táctil; se
   *  ignora con ratón y en modo seleccionar). */
  swipe?: AccionSwipe;
}

type Props = PropsBase &
  ({ to: string; onClick?: never } | { onClick: () => void; to?: never });

export function FilaNavegable({
  icono,
  titulo,
  subtitulo,
  valor,
  badge,
  tono = 'neutral',
  densidad = 'normal',
  chevron,
  disabled,
  seleccion,
  swipe,
  to,
  onClick,
}: Props) {
  const seleccionando = seleccion?.activa ?? false;
  const swipeActivo = !!swipe && !seleccionando;
  const s = useSwipeFila({ ancho: ANCHO_SWIPE, activo: swipeActivo });

  const clases = [
    'fila',
    densidad === 'compacta' && 'fila--compacta',
    tono !== 'neutral' && `fila--${tono}`,
    seleccionando && seleccion!.marcada && 'fila--marcada',
  ]
    .filter(Boolean)
    .join(' ');

  const tamIcono = densidad === 'compacta' ? 18 : 20;
  const mostrarChevron = !seleccionando && (chevron ?? to != null);

  const contenido = (
    <>
      {seleccionando && <FilaToggle marcada={seleccion!.marcada} />}
      {icono && (
        <span className="fila__icono">
          <Icono nombre={icono} size={tamIcono} />
        </span>
      )}
      <span className="fila__cuerpo">
        <span className="fila__titulo">{titulo}</span>
        {subtitulo && <span className="fila__subtitulo">{subtitulo}</span>}
      </span>
      {valor && <span className="fila__valor">{valor}</span>}
      {!!badge && <span className="fila__badge">{badge}</span>}
      {mostrarChevron && (
        <span className="fila__chevron">
          <Icono nombre="chevron" size={18} />
        </span>
      )}
    </>
  );

  // Modo seleccionar: la fila nunca navega ni ejecuta su acción normal —
  // todo el cuerpo marca/desmarca. Se dibuja siempre como <button>.
  if (seleccionando) {
    return (
      <button
        type="button"
        className={clases}
        onClick={seleccion!.onToggle}
        disabled={disabled}
        aria-pressed={seleccion!.marcada}
      >
        {contenido}
      </button>
    );
  }

  // Con swipe: estilo de arrastre + handlers de puntero en el elemento
  // arrastrable, y un clic mientras está abierta la cierra en vez de
  // navegar/accionar.
  const estiloSwipe: CSSProperties | undefined = swipeActivo
    ? { transform: `translateX(${s.dx}px)`, transition: s.dx === 0 || s.abierta ? 'transform .18s ease' : 'none', touchAction: 'pan-y' }
    : undefined;
  const clicSwipe = swipeActivo
    ? (e: { preventDefault: () => void }) => {
        if (s.abierta) {
          e.preventDefault();
          s.cerrar();
        }
      }
    : undefined;

  const elementoFila =
    to != null ? (
      <Link
        to={to}
        className={clases}
        style={estiloSwipe}
        onClick={clicSwipe}
        {...(swipeActivo ? s.handlers : {})}
      >
        {contenido}
      </Link>
    ) : (
      <button
        type="button"
        className={clases}
        style={estiloSwipe}
        onClick={(e) => {
          if (swipeActivo && s.abierta) {
            e.preventDefault();
            s.cerrar();
            return;
          }
          onClick?.();
        }}
        disabled={disabled}
        {...(swipeActivo ? s.handlers : {})}
      >
        {contenido}
      </button>
    );

  if (!swipeActivo) return elementoFila;

  return (
    <div className="fila-swipe">
      <div className="fila-swipe__zona" aria-hidden={!s.abierta}>
        <button
          type="button"
          tabIndex={s.abierta ? 0 : -1}
          className={`fila-swipe__accion${swipe!.tono === 'riesgo' ? ' fila-swipe__accion--riesgo' : ''}`}
          onClick={() => {
            s.cerrar();
            swipe!.onAccion();
          }}
        >
          <Icono nombre={swipe!.icono} size={18} />
          {swipe!.etiqueta}
        </button>
      </div>
      {elementoFila}
    </div>
  );
}
