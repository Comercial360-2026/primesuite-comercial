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

  // Marca de verificación — "hecho" / "marcar como completado".
  check: <path d="M5 12.5l4 4L19 7" />,

  // Círculo vacío — casilla sin marcar de FilaToggle (modo seleccionar).
  circulo: <circle cx="12" cy="12" r="8.5" />,

  // Círculo con check — casilla marcada de FilaToggle. El relleno lo pone
  // el CSS (.fila-toggle--marcada), aquí solo va el trazo.
  'check-circulo': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.3l2.4 2.4 4.6-5" />
    </>
  ),

  // "+" — crear / añadir (nueva categoría, nuevo término, nueva ubicación).
  mas: <path d="M12 5v14M5 12h14" />,

  // Lápiz — renombrar / editar en el sitio.
  editar: (
    <>
      <path d="M4 20l1-4 11-11 3 3-11 11z" />
      <path d="M14 7l3 3" />
    </>
  ),

  // Flecha que entra en una caja — mover a otra categoría.
  mover: (
    <>
      <path d="M4 12h10" />
      <path d="M10 8l4 4-4 4" />
      <path d="M16 5h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2" />
    </>
  ),

  // Dos ramas que confluyen en una — fusionar con un término existente.
  fusionar: (
    <>
      <path d="M5 4v3c0 3 2 5 5 5h9" />
      <path d="M5 20v-3c0-3 2-5 5-5" />
      <path d="M15 8l4 4-4 4" />
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

  // --- Mensajes (componente Aviso). Formas distintas entre sí para que se
  // distingan sin depender del color. ---

  // Info — círculo con "i".
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5h.01" />
    </>
  ),

  // Atención — triángulo con "!".
  atencion: (
    <>
      <path d="M12 4L2.5 20h19z" />
      <path d="M12 10v5" />
      <path d="M12 18h.01" />
    </>
  ),

  // Error — círculo con aspa.
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),

  // Guion — estado neutro / en pausa (p. ej. semáforo "seguimiento").
  guion: <path d="M6 12h12" />,

  // --- Captura durante la visita (botones grandes de visita-activa /
  // editor-captura). Trazo simple, mismo criterio que el resto. ---

  // Foto — cámara.
  foto: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8.5 7L10 4h4l1.5 3" />
      <circle cx="12" cy="13.5" r="3.3" />
    </>
  ),

  // Audio — micrófono.
  audio: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
    </>
  ),

  // Nota — documento con renglones.
  nota: (
    <>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v3h3" />
      <path d="M9 11h6M9 14.5h6" />
    </>
  ),

  // Hallazgo — lupa (algo observado sobre el terreno).
  hallazgo: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5L20 20" />
    </>
  ),

  // Oportunidad — destello de 4 puntas (mismo sentido que el acento
  // --signal-600 del sistema).
  oportunidad: <path d="M12 3.5c.6 4.3 1.6 5.3 6 6-4.4.7-5.4 1.7-6 6-.6-4.3-1.6-5.3-6-6 4.4-.7 5.4-1.7 6-6z" />,

  // Próximo paso — banderín (lo que queda pendiente al salir).
  paso: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4.5h11l-2.5 4 2.5 4H6" />
    </>
  ),

  // Recorrido — punto de partida, rastro de puntos y chincheta de destino.
  recorrido: (
    <>
      <circle cx="5" cy="19" r="1.6" />
      <path d="M7 17.5c3.5-1.5 4.5-5 4.5-8" strokeDasharray="0.1 3.4" />
      <path d="M17 3.5a3.5 3.5 0 0 0-3.5 3.5c0 2.7 3.5 6.5 3.5 6.5s3.5-3.8 3.5-6.5A3.5 3.5 0 0 0 17 3.5z" />
      <circle cx="17" cy="7" r="1.2" />
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
