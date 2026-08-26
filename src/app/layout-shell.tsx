import { NavLink, Outlet } from 'react-router-dom';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';

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

      {visitaEnCurso && (
        <a href={`/visita/${visitaEnCurso.id}`} className="visita-en-curso-banner">
          Visita en curso con {visitaEnCurso.clienteNombre}
        </a>
      )}

      <nav className="bottom-nav">
        <NavLink to="/" end>
          Hoy
        </NavLink>
        <NavLink to="/clientes">Clientes</NavLink>
        <NavLink to="/tareas">Tareas</NavLink>
        <NavLink to="/yo">Yo</NavLink>
      </nav>
    </div>
  );
}