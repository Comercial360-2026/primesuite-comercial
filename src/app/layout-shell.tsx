import { NavLink, Outlet } from 'react-router-dom';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSesionActual } from '@/hooks/use-sesion-actual';

export function LayoutShell() {
  const { visitaEnCurso } = useVisitaActivaContext();
  const { comercial } = useSesionActual();
  const esDireccionComercial = comercial?.rol === 'direccion_comercial';

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
        <NavLink to={esDireccionComercial ? '/vocabulario' : '/yo'}>
          {esDireccionComercial ? 'Vocabulario' : 'Yo'}
        </NavLink>
      </nav>
    </div>
  );
}
