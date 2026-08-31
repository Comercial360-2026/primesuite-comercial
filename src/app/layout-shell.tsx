import { Link, NavLink, Outlet } from 'react-router-dom';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { AvisoVisitaProxima } from '@/components/ui/aviso-visita-proxima';
import { AvisoEspacio } from '@/components/ui/aviso-espacio';

// Iconos del bottom nav — trazo simple, currentColor (heredan el color
// activo/inactivo de `.bottom-nav a`), mismo estilo que el resto de SVG de
// la app (stroke 1.7, extremos redondeados).
const svgProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const IconoHoy = () => (
  <svg {...svgProps}>
    <rect x="3" y="4.5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v3M16 3v3" />
    <path d="M8.5 13.5l2.5 2.5 4.5-5" />
  </svg>
);
const IconoClientes = () => (
  <svg {...svgProps}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 11a3 3 0 0 0 0-6" />
    <path d="M17 19c0-2.6-1.4-4.3-3-5" />
  </svg>
);
const IconoTareas = () => (
  <svg {...svgProps}>
    <path d="M4 7l2 2 3.5-3.5" />
    <path d="M4 17l2 2 3.5-3.5" />
    <path d="M13 7h7M13 17h7" />
  </svg>
);
const IconoYo = () => (
  <svg {...svgProps}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
  </svg>
);

// Bottom nav de 4 secciones fijas — Visita activa NUNCA aparece aquí,
// solo se alcanza desde Hoy (ver 06_arquitectura_navegacion.md §5).
// "Yo" es siempre el mismo hueco, para cualquier rol — antes se sustituía
// por "Vocabulario" para direccion_comercial, lo cual le quitaba a ese rol
// su propio acceso a cerrar sesión (hueco real, detectado probando).
// Vocabulario ahora vive dentro de la pantalla Yo, no en el menú.
export function LayoutShell() {
  const { visitaEnCurso } = useVisitaActivaContext();

  return (
    <div className="app-shell">
      <main className="app-shell__content">
        <Outlet />
      </main>

      <AvisoEspacio />

      {visitaEnCurso ? (
        // Link (no <a href>): navegación SPA. Con <a href> se recargaba la
        // PWA entera en mitad de una visita — lento y se perdía el estado
        // en memoria.
        <Link to={`/visita/${visitaEnCurso.id}`} className="visita-en-curso-banner">
          Visita en curso con {visitaEnCurso.clienteNombre}
        </Link>
      ) : (
        <AvisoVisitaProxima />
      )}

      <nav className="bottom-nav">
        <NavLink to="/" end>
          <IconoHoy />
          Hoy
        </NavLink>
        <NavLink to="/clientes">
          <IconoClientes />
          Clientes
        </NavLink>
        <NavLink to="/tareas">
          <IconoTareas />
          Tareas
        </NavLink>
        <NavLink to="/yo">
          <IconoYo />
          Yo
        </NavLink>
      </nav>
    </div>
  );
}