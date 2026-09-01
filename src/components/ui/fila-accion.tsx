import { Icono, type NombreIcono } from './iconos';
import { FilaToggle, type EstadoSeleccion } from './fila-toggle';

// Fila de una lista agrupada (dentro de SeccionLista) con un cuerpo
// —opcionalmente pulsable— y una fila de botones de icono a la derecha
// (p. ej. descargar informe, borrar visita). Sustituye a la maraña de
// `<div className="card" style={{display:'flex'}}>` con icon-buttons hechos
// a mano y `e.stopPropagation()` repartidos.
//
// No puede ser un solo <button> (no se anidan botones): el cuerpo y el
// grupo de acciones son hermanos, así que pulsar una acción nunca dispara
// el cuerpo — sin `stopPropagation`. Aspecto en components.css (.fila*,
// .fila__cuerpo-accion, .fila__acciones, .fila__accion-btn) sobre el bloque
// "Filas" de tokens.css. Ver 08_sistema_diseno.md §"Sistema de filas".

type Tono = 'neutral' | 'aviso' | 'riesgo' | 'ok';

export interface AccionFila {
  icono: NombreIcono;
  /** aria-label + title del botón. Obligatorio: los botones son solo icono. */
  etiqueta: string;
  onClick?: () => void;
  /** Si está, se dibuja como <a href> real en vez de <button> — necesario
   *  para descargas (window.open() tras un await lo bloquea el navegador). */
  href?: string;
  /** Color del icono. Distinto set que el tono de la fila: aquí es
   *  afordancia (acción destructiva / principal), no estado. */
  tono?: 'neutral' | 'riesgo' | 'brand';
  disabled?: boolean;
}

interface Props {
  icono?: NombreIcono;
  titulo: string;
  subtitulo?: string;
  /** Si falta, el cuerpo es inerte (sin hover, sin cursor de puntero). */
  onClick?: () => void;
  tono?: Tono;
  densidad?: 'normal' | 'compacta';
  /** Desactiva el `onClick` del cuerpo (no las acciones). */
  disabled?: boolean;
  acciones?: AccionFila[];
  /** Modo seleccionar. Con `activa`, el cuerpo marca/desmarca en vez de su
   *  `onClick`, y los botones de acción se ocultan. Sin esta prop, o con
   *  `activa:false`, la fila es exactamente la de hoy. */
  seleccion?: EstadoSeleccion;
}

export function FilaAccion({
  icono,
  titulo,
  subtitulo,
  onClick,
  tono = 'neutral',
  densidad = 'normal',
  disabled,
  acciones = [],
  seleccion,
}: Props) {
  const seleccionando = seleccion?.activa ?? false;

  const clases = [
    'fila',
    'fila--accion',
    densidad === 'compacta' && 'fila--compacta',
    tono !== 'neutral' && `fila--${tono}`,
    seleccionando && seleccion!.marcada && 'fila--marcada',
  ]
    .filter(Boolean)
    .join(' ');

  const tamIcono = densidad === 'compacta' ? 18 : 20;

  const cuerpo = (
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
    </>
  );

  return (
    <div className={clases}>
      {seleccionando ? (
        <button
          type="button"
          className="fila__cuerpo-accion"
          onClick={seleccion!.onToggle}
          disabled={disabled}
          aria-pressed={seleccion!.marcada}
        >
          {cuerpo}
        </button>
      ) : onClick ? (
        <button type="button" className="fila__cuerpo-accion" onClick={onClick} disabled={disabled}>
          {cuerpo}
        </button>
      ) : (
        <div className="fila__cuerpo-accion">{cuerpo}</div>
      )}

      {!seleccionando && acciones.length > 0 && (
        <div className="fila__acciones">
          {acciones.map((a, i) => {
            const claseBtn = [
              'fila__accion-btn',
              a.tono === 'riesgo' && 'fila__accion-btn--riesgo',
              a.tono === 'brand' && 'fila__accion-btn--brand',
            ]
              .filter(Boolean)
              .join(' ');

            if (a.href) {
              return (
                <a
                  key={i}
                  href={a.href}
                  className={claseBtn}
                  aria-label={a.etiqueta}
                  title={a.etiqueta}
                >
                  <Icono nombre={a.icono} size={18} />
                </a>
              );
            }

            return (
              <button
                key={i}
                type="button"
                className={claseBtn}
                aria-label={a.etiqueta}
                title={a.etiqueta}
                disabled={a.disabled}
                onClick={a.onClick}
              >
                <Icono nombre={a.icono} size={18} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
