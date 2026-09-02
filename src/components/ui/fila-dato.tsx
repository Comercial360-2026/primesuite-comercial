import type { ReactNode } from 'react';
import { Icono, type NombreIcono } from './iconos';

// Fila de una lista agrupada (dentro de SeccionLista) que solo muestra un
// dato: etiqueta a la izquierda, valor a la derecha. No navega ni acciona
// — es un <div>, sin flecha y sin fondo al pasar el ratón. Para la parte
// "Resumen" de pantallas como Mi espacio (tu parte, espacio del equipo…).
//
// Comparte caja y tonos con FilaNavegable: reutiliza .fila / .fila__icono /
// .fila__cuerpo / .fila__titulo / .fila__valor y el CSS de tonos ya escrito
// (aviso/ok tiñen el valor; riesgo también la etiqueta). Ver
// 08_sistema_diseno.md §"Sistema de filas".

type Tono = 'neutral' | 'aviso' | 'riesgo' | 'ok';

interface Props {
  /** Etiqueta a la izquierda. Se pinta en `.fila__titulo`. */
  etiqueta: string;
  /** Valor a la derecha (texto, porcentaje, un <span>…). */
  valor: ReactNode;
  /** El valor es contexto secundario (una fecha) → gris, sin peso. */
  valorTenue?: boolean;
  /** Icono opcional a la izquierda, por simetría con la familia de filas. */
  icono?: NombreIcono;
  tono?: Tono;
  densidad?: 'normal' | 'compacta';
}

export function FilaDato({ etiqueta, valor, valorTenue, icono, tono = 'neutral', densidad = 'normal' }: Props) {
  const clases = [
    'fila',
    'fila--dato',
    densidad === 'compacta' && 'fila--compacta',
    tono !== 'neutral' && `fila--${tono}`,
  ]
    .filter(Boolean)
    .join(' ');

  const tamIcono = densidad === 'compacta' ? 18 : 20;

  return (
    <div className={clases}>
      {icono && (
        <span className="fila__icono">
          <Icono nombre={icono} size={tamIcono} />
        </span>
      )}
      <span className="fila__cuerpo">
        <span className="fila__titulo">{etiqueta}</span>
      </span>
      <span className={`fila__valor${valorTenue ? ' fila__valor--tenue' : ''}`}>{valor}</span>
    </div>
  );
}
