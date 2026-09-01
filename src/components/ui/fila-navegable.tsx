import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icono, type NombreIcono } from './iconos';
import { FilaToggle, type EstadoSeleccion } from './fila-toggle';

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
  to,
  onClick,
}: Props) {
  const seleccionando = seleccion?.activa ?? false;

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

  if (to != null) {
    return (
      <Link to={to} className={clases}>
        {contenido}
      </Link>
    );
  }

  return (
    <button type="button" className={clases} onClick={onClick} disabled={disabled}>
      {contenido}
    </button>
  );
}
