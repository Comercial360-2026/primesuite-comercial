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
  /** Cabecera gris. En frase ("Dirección comercial"), no en Mayúsculas. */
  titulo?: string;
  children: ReactNode;
}

export function SeccionLista({ titulo, children }: Props) {
  return (
    <section className="seccion-lista">
      {titulo && <h2 className="seccion-lista__cabecera">{titulo}</h2>}
      <div className="seccion-lista__grupo">{children}</div>
    </section>
  );
}
