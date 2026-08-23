import { NavLink, Outlet } from 'react-router-dom';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSesionActual } from '@/hooks/use-sesion-actual';

// Bottom nav de 4 secciones fijas — Visita activa NUNCA aparece aquí,
// solo se alcanza desde Hoy (ver 06_arquitectura_navegacion.md §5).
export function LayoutShell() {
  const { visitaEnCurso } = useVisitaActivaContext();
  const { comercial } = useSesionActual();
  const esAdministradorVocabulario = comercial?.rol === 'administrador_vocabulario';

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
        <NavLink to={esAdministradorVocabulario ? '/vocabulario' : '/yo'}>
          {esAdministradorVocabulario ? 'Vocabulario' : 'Yo'}
        </NavLink>
      </nav>
    </div>
  );
}