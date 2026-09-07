import type { ReactNode } from 'react';

// Sección de una lista agrupada al estilo "Ajustes de iPhone": una cabecera
// gris discreta (opcional, en frase — solo la primera en mayúscula) y un
// grupo de filas con separadores finos y esquinas redondeadas.
//
// No sabe qué filas contiene: dentro van FilaNavegable, FilaDato y
// FilaAccion. El aspecto está en components.css (.seccion-lista*) sobre el
// bloque "Filas" de tokens.css — restyle = un sitio, no sección por
// sección.

interface Props {
  /** Cabecera. En frase ("Dirección comercial"), no en Mayúsculas. */
  titulo?: string;
  /** Peso de la cabecera en la jerarquía de la pantalla:
   *  `principal` = la sección del dinero o de la acción · `normal` (def.) ·
   *  `tenue` = metadatos de referencia (Datos, Más). Ver 08 §"Jerarquía". */
  prominencia?: 'principal' | 'normal' | 'tenue';
  /** Acción a la derecha de la cabecera, en su misma línea. Normalmente un
   *  `.boton-icono` con `<Icono nombre="mas">` para "añadir uno". */
  accion?: ReactNode;
  children: ReactNode;
}

export function SeccionLista({ titulo, prominencia = 'normal', accion, children }: Props) {
  const clase = ['seccion-lista', prominencia !== 'normal' && `seccion-lista--${prominencia}`]
    .filter(Boolean)
    .join(' ');
  // Con `accion` (un "+" en la cabecera) la sección puede quedarse sin filas
  // —una lista aún vacía a la que el "+" va a añadir la primera—: entonces
  // solo se pinta la cabecera, no un grupo vacío con bordes.
  const hayFilas = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <section className={clase}>
      {accion ? (
        <div className="seccion-lista__cabecera-fila">
          {titulo && <h2 className="seccion-lista__cabecera">{titulo}</h2>}
          <div className="seccion-lista__cabecera-accion">{accion}</div>
        </div>
      ) : (
        titulo && <h2 className="seccion-lista__cabecera">{titulo}</h2>
      )}
      {hayFilas && <div className="seccion-lista__grupo">{children}</div>}
    </section>
  );
}
