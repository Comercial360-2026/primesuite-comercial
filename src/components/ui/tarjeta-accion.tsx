import type { ReactNode } from 'react';
import { Icono, type NombreIcono } from './iconos';

// Bloque informativo + un único botón de acción. Sustituye al patrón
// `<div className="card">` con `.label`, un cuerpo de texto/cifras y un
// `<button className="btn btn-secondary">` montado a mano, repetido en
// yo.tsx (medidor de espacio, copia de seguridad) y mi-espacio.tsx.
//
// No es una fila: es una tarjeta con su caja, para contenido que debe
// destacar (una cifra grande, una barra, un aviso) y que lleva su propia
// acción. Las listas de accesos/datos siguen siendo SeccionLista + filas.
//
// El tono colorea el borde, el título y el texto de estado — igual que hoy
// se hace con `style={{ borderColor: ... }}` inline, pero en un sitio.
// Aspecto en components.css (.tarjeta-accion*). Ver 08_sistema_diseno.md
// §"Sistema de filas".

type Tono = 'neutral' | 'aviso' | 'riesgo';

export interface AccionTarjeta {
  etiqueta: string;
  onClick: () => void;
  /** Icono delante del texto — acción concreta (hacer copia, planificar…).
   *  Ver 08_sistema_diseno.md §"Iconos". */
  icono?: NombreIcono;
  disabled?: boolean;
  /** Mientras corre: deshabilita el botón y muestra `etiquetaCargando`. */
  cargando?: boolean;
  etiquetaCargando?: string;
  /** Peso del botón. `primario` (relleno) cuando la acción urge — p. ej.
   *  la copia de seguridad cuando lleva demasiados días. Por defecto
   *  `secundario` (borde). */
  enfasis?: 'primario' | 'secundario';
}

interface Props {
  /** Cabecera pequeña gris (la `.label` de arriba). */
  titulo: string;
  /** Cuerpo: texto, cifras, una barra fina… lo que hoy va suelto en la card. */
  children: ReactNode;
  tono?: Tono;
  /** El botón único, abajo. Sin `accion` = tarjeta solo informativa. */
  accion?: AccionTarjeta;
  /** Barra fina de progreso/antigüedad (0–100), entre el cuerpo y el botón.
   *  El relleno lo tiñe el `tono`. */
  barra?: number;
  /** Línea de error bajo el botón. */
  error?: string;
}

export function TarjetaAccion({ titulo, children, tono = 'neutral', accion, barra, error }: Props) {
  const clases = ['tarjeta-accion', tono !== 'neutral' && `tarjeta-accion--${tono}`]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={clases}>
      <div className="tarjeta-accion__titulo">{titulo}</div>
      <div className="tarjeta-accion__cuerpo">{children}</div>
      {barra != null && (
        <div className="tarjeta-accion__barra">
          <span style={{ width: `${Math.min(Math.max(barra, 0), 100)}%` }} />
        </div>
      )}
      {accion && (
        <button
          type="button"
          className={`btn ${accion.enfasis === 'primario' ? 'btn-primary' : 'btn-secondary'} tarjeta-accion__boton`}
          disabled={accion.disabled || accion.cargando}
          onClick={accion.onClick}
        >
          {accion.icono && !accion.cargando && <Icono nombre={accion.icono} size={18} />}
          {accion.cargando ? accion.etiquetaCargando ?? 'Un momento…' : accion.etiqueta}
        </button>
      )}
      {error && <div className="field-error-text tarjeta-accion__error">{error}</div>}
    </div>
  );
}
