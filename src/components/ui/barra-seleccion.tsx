import { Icono, type NombreIcono } from './iconos';

// Cabecera del "modo seleccionar": "N seleccionados · Cancelar · [Borrar
// (N)]". Igual en Mi espacio y Agenda, así que vive aquí y no copiada por
// pantalla. Se coloca arriba de la lista, dentro del `.screen` (no es una
// barra fija global).
//
// Aspecto en components.css (.barra-seleccion*). Ver 08_sistema_diseno.md
// §"Sistema de filas".

export interface AccionSeleccion {
  etiqueta: string;
  icono: NombreIcono;
  /** `riesgo` = destructiva (borrar/cancelar), en rojo. */
  tono?: 'neutral' | 'riesgo';
  onClick: () => void;
  disabled?: boolean;
}

interface Props {
  /** Nº de filas marcadas. */
  n: number;
  onCancelar: () => void;
  /** Normalmente una ("Borrar (N)"). El contador lo pone la pantalla en la
   *  etiqueta si lo quiere. */
  acciones: AccionSeleccion[];
}

export function BarraSeleccion({ n, onCancelar, acciones }: Props) {
  return (
    <div className="barra-seleccion">
      <span className="barra-seleccion__cuenta">
        {n === 0 ? 'Selecciona elementos' : `${n} seleccionado${n === 1 ? '' : 's'}`}
      </span>
      <div className="barra-seleccion__acciones">
        {acciones.map((a, i) => (
          <button
            key={i}
            type="button"
            className={`barra-seleccion__accion${a.tono === 'riesgo' ? ' barra-seleccion__accion--riesgo' : ''}`}
            onClick={a.onClick}
            disabled={a.disabled}
          >
            <Icono nombre={a.icono} size={18} />
            {a.etiqueta}
          </button>
        ))}
        <button type="button" className="barra-seleccion__cancelar" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
