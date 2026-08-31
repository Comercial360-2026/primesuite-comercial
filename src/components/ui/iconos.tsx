// Set único de iconos de la app — trazo simple, `currentColor` (heredan el
// color de quien los usa), stroke 1.7, extremos redondeados. Mismo criterio
// que tokens.css: cualquier cambio de iconografía (otro dibujo, otro grosor,
// otra forma) se hace SOLO aquí; las pantallas importan por nombre y no
// saben cómo está trazado el icono. Cambiar de set = editar este archivo.

interface PropsIcono {
  /** Lado del icono en px. Nav = 22; botones de acción = 20. */
  size?: number;
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconoHoy({ size = 22 }: PropsIcono) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
      <path d="M8.5 13.5l2.5 2.5 4.5-5" />
    </svg>
  );
}

export function IconoClientes({ size = 22 }: PropsIcono) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 11a3 3 0 0 0 0-6" />
      <path d="M17 19c0-2.6-1.4-4.3-3-5" />
    </svg>
  );
}

export function IconoTareas({ size = 22 }: PropsIcono) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4 7l2 2 3.5-3.5" />
      <path d="M4 17l2 2 3.5-3.5" />
      <path d="M13 7h7M13 17h7" />
    </svg>
  );
}

export function IconoYo({ size = 22 }: PropsIcono) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
    </svg>
  );
}

export function IconoDescargar({ size = 20 }: PropsIcono) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 3v11" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function IconoBorrar({ size = 20 }: PropsIcono) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6.5 7l1 13h9l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
