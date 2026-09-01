import { Icono, type NombreIcono } from './iconos';
import { EstadoError } from './estado-error';

// Los cuatro estados "no hay lista que pintar" de una pantalla que consume
// useQuery, en un solo sitio: cargando, vacío, sin conexión y error.
// Sustituye a la mezcla de `<p>Cargando…</p>` sueltos, `<p>Sin resultados</p>`
// y la tarjeta `card--riesgo` de "isPaused" copiada por media app.
//
// `sin-conexion` y `error` reutilizan EstadoError (la primitiva de "algo
// falló, reintenta") — no se reinventa la caja roja con botón. EstadoError
// se mantiene como componente propio; las pantallas que aún lo llaman
// directo migran a EstadoLista al entrar en su fase.
//
// Aspecto de cargando/vacío en components.css (.estado-lista*).

type Props =
  | { estado: 'cargando'; mensaje?: string }
  | { estado: 'vacio'; mensaje: string; icono?: NombreIcono }
  | { estado: 'sin-conexion'; onReintentar: () => void; mensaje?: string }
  | { estado: 'error'; onReintentar: () => void; mensaje?: string };

export function EstadoLista(props: Props) {
  if (props.estado === 'sin-conexion') {
    return (
      <EstadoError
        mensaje={props.mensaje ?? 'Sin conexión. Comprueba tu red e inténtalo de nuevo.'}
        onReintentar={props.onReintentar}
      />
    );
  }

  if (props.estado === 'error') {
    // Sin `mensaje` cae al texto por defecto de EstadoError.
    return <EstadoError mensaje={props.mensaje} onReintentar={props.onReintentar} />;
  }

  if (props.estado === 'cargando') {
    return <div className="estado-lista">{props.mensaje ?? 'Cargando…'}</div>;
  }

  return (
    <div className="estado-lista estado-lista--vacio">
      <span className="estado-lista__icono">
        <Icono nombre={props.icono ?? 'bandeja'} size={32} />
      </span>
      <span>{props.mensaje}</span>
    </div>
  );
}
