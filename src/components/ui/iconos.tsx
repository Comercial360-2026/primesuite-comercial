import type { ReactNode } from 'react';

// Set único de iconos de la app — trazo simple, `currentColor` (heredan el
// color de quien los usa), stroke 1.7, extremos redondeados. Mismo criterio
// que tokens.css: cualquier cambio de iconografía (otro dibujo, otro grosor,
// otra forma) se hace SOLO aquí; las pantallas piden el icono por nombre y no
// saben cómo está trazado. Cambiar de set = editar este archivo.
//
// Uso: <Icono nombre="chevron" /> — o los wrappers con nombre propio de
// abajo (IconoHoy…) que existen para el bottom nav y otras pantallas ya
// escritas. Todos comparten el mismo registro, no hay dos fuentes de verdad.

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// Solo el contenido interno del <svg>. El <svg> con sus atributos lo pone
// <Icono>. Nombres en español, en kebab-case si hacen falta dos palabras.
const registro = {
  hoy: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
      <path d="M8.5 13.5l2.5 2.5 4.5-5" />
    </>
  ),
  clientes: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 11a3 3 0 0 0 0-6" />
      <path d="M17 19c0-2.6-1.4-4.3-3-5" />
    </>
  ),
  tareas: (
    <>
      <path d="M4 7l2 2 3.5-3.5" />
      <path d="M4 17l2 2 3.5-3.5" />
      <path d="M13 7h7M13 17h7" />
    </>
  ),
  yo: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
    </>
  ),
  descargar: (
    <>
      <path d="M12 3v11" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  borrar: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6.5 7l1 13h9l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),

  // Flecha ">" de las filas navegables. Apunta a la derecha; la rotación
  // (p. ej. secciones plegables) la hace quien la usa, no este dibujo.
  chevron: <path d="M9 6l6 6-6 6" />,

  // Flecha "‹" de volver, para CabeceraDetalle. Flecha completa (con asta),
  // no un chevron: significa "volver atrás", no "aquí hay más".
  atras: (
    <>
      <path d="M11 5l-7 7 7 7" />
      <path d="M4 12h16" />
    </>
  ),

  // Almacenamiento / cuota — cilindro de disco.
  almacenamiento: (
    <>
      <path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z" />
      <path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),

  // Vocabulario / catálogo de términos — libro con renglones.
  vocabulario: (
    <>
      <path d="M6 4h11a1 1 0 0 1 1 1v15H7a1 1 0 0 1-1-1z" />
      <path d="M6 4v15" />
      <path d="M9.5 9h5M9.5 12.5h5" />
    </>
  ),

  // Solicitudes de ayuda / sustitución — salvavidas.
  solicitudes: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.8v4M12 16.2v4M3.8 12h4M16.2 12h4" />
    </>
  ),

  // Consumo por comercial — barras.
  consumo: (
    <>
      <path d="M4 20V11M12 20V5M20 20v-6" />
      <path d="M3 20h18" />
    </>
  ),

  // Clientes duplicados — dos fichas superpuestas.
  duplicados: (
    <>
      <rect x="4" y="4" width="12" height="12" rx="2" />
      <path d="M8 20h9a1 1 0 0 0 1-1V8" />
    </>
  ),

  // Cerrar sesión — puerta con flecha de salida.
  salir: (
    <>
      <path d="M9.5 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3.5" />
      <path d="M14 8.5l3.5 3.5-3.5 3.5" />
      <path d="M17.5 12H9" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type NombreIcono = keyof typeof registro;

interface PropsIcono {
  nombre: NombreIcono;
  /** Lado del icono en px. Nav = 22; filas y botones de acción = 20. */
  size?: number;
}

export function Icono({ nombre, size = 20 }: PropsIcono) {
  return (
    <svg width={size} height={size} {...base} aria-hidden="true">
      {registro[nombre]}
    </svg>
  );
}

// Wrappers con nombre propio — los usa el bottom nav (layout-shell) y
// mi-espacio; mismo registro, solo fijan el tamaño por defecto de su sitio.
type PropsWrapper = { size?: number };

export const IconoHoy = ({ size = 22 }: PropsWrapper) => <Icono nombre="hoy" size={size} />;
export const IconoClientes = ({ size = 22 }: PropsWrapper) => <Icono nombre="clientes" size={size} />;
export const IconoTareas = ({ size = 22 }: PropsWrapper) => <Icono nombre="tareas" size={size} />;
export const IconoYo = ({ size = 22 }: PropsWrapper) => <Icono nombre="yo" size={size} />;
export const IconoDescargar = ({ size = 20 }: PropsWrapper) => <Icono nombre="descargar" size={size} />;
export const IconoBorrar = ({ size = 20 }: PropsWrapper) => <Icono nombre="borrar" size={size} />;
