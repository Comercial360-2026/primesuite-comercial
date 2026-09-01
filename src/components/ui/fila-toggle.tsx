import { Icono } from './iconos';

// Casilla de selección (círculo estilo iOS) de una fila en "modo
// seleccionar". No se instancia desde las pantallas ni desde aquí se
// captura el clic: la pintan FilaNavegable y FilaAccion a la izquierda del
// icono cuando reciben `seleccion.activa`, y es la propia fila (un
// <button> con `aria-pressed`) la que marca/desmarca. Este componente es
// solo el dibujo del círculo — se exporta junto al tipo EstadoSeleccion
// por si una lista a medida lo necesita.
//
// Aspecto en components.css (.fila-toggle*). Ver 08_sistema_diseno.md
// §"Sistema de filas".

/** Estado que una pantalla pasa a cada fila para el modo seleccionar. */
export interface EstadoSeleccion {
  /** El modo seleccionar está encendido en esta lista. */
  activa: boolean;
  /** Esta fila está marcada. */
  marcada: boolean;
  /** Marca / desmarca esta fila. */
  onToggle: () => void;
}

export function FilaToggle({ marcada }: { marcada: boolean }) {
  return (
    <span className={`fila-toggle${marcada ? ' fila-toggle--marcada' : ''}`} aria-hidden="true">
      <Icono nombre={marcada ? 'check-circulo' : 'circulo'} size={22} />
    </span>
  );
}
