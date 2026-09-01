import type { ReactNode } from 'react';

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
  disabled?: boolean;
  /** Mientras corre: deshabilita el botón y muestra `etiquetaCargando`. */
  cargando?: boolean;
  etiquetaCargando?: string;
}

interface Props {
  /** Cabecera pequeña gris (la `.label` de arriba). */
  titulo: string;
  /** Cuerpo: texto, cifras, una barra fina… lo que hoy va suelto en la card. */
  children: ReactNode;
  tono?: Tono;
  /** El botón único, abajo. Sin `accion` = tarjeta solo informativa. */
  accion?: AccionTarjeta;
  /** Línea de error bajo el botón. */
  error?: string;
}

export function TarjetaAccion({ titulo, children, tono = 'neutral', accion, error }: Props) {
  const clases = ['tarjeta-accion', tono !== 'neutral' && `tarjeta-accion--${tono}`]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={clases}>
      <div className="tarjeta-accion__titulo">{titulo}</div>
      <div className="tarjeta-accion__cuerpo">{children}</div>
      {accion && (
        <button
          type="button"
          className="btn btn-secondary tarjeta-accion__boton"
          disabled={accion.disabled || accion.cargando}
          onClick={accion.onClick}
        >
          {accion.cargando ? accion.etiquetaCargando ?? 'Un momento…' : accion.etiqueta}
        </button>
      )}
      {error && <div className="field-error-text tarjeta-accion__error">{error}</div>}
    </div>
  );
}
