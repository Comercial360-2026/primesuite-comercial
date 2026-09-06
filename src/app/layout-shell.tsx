import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useAvisoLiberar } from '@/hooks/use-aviso-liberar';
import { useAvisosParticipacion } from '@/hooks/use-avisos-participacion';
import { AvisoVisitaProxima } from '@/components/ui/aviso-visita-proxima';
import { AvisoEspacio } from '@/components/ui/aviso-espacio';
import { BannerInstalar } from '@/components/ui/banner-instalar';
import { IconoHoy, IconoClientes, IconoTareas, IconoYo } from '@/components/ui/iconos';

// Bottom nav de 4 secciones fijas — Visita activa NUNCA aparece aquí,
// solo se alcanza desde Hoy (ver 06_arquitectura_navegacion.md §5).
// "Yo" es siempre el mismo hueco, para cualquier rol — antes se sustituía
// por "Vocabulario" para direccion_comercial, lo cual le quitaba a ese rol
// su propio acceso a cerrar sesión (hueco real, detectado probando).
// Vocabulario ahora vive dentro de la pantalla Yo, no en el menú.
export function LayoutShell() {
  const { visitaEnCurso } = useVisitaActivaContext();
  // El banner es un atajo de vuelta a la visita: sobra cuando ya estás
  // dentro de ella (la cabecera de esa pantalla ya dice "Visita en curso")
  // y en su pantalla de cierre/resumen (1.6 del recorrido de revisión).
  const { pathname } = useLocation();
  const dentroDeLaVisita =
    !!visitaEnCurso &&
    (pathname === `/visita/${visitaEnCurso.id}` ||
      pathname.startsWith(`/visita/${visitaEnCurso.id}/`));
  // Avisos que encienden el punto de la pestaña "Yo": el "libera espacio"
  // que Dirección me haya mandado (su LÍNEA la pinta <AvisoEspacio />), y
  // las invitaciones a visitas de equipo pendientes de aceptar/rechazar
  // o los rechazos que aún no he visto.
  const { aviso: avisoLiberar } = useAvisoLiberar();
  const { hayAvisos: hayAvisosParticipacion } = useAvisosParticipacion();

  return (
    <div className="app-shell">
      <main className="app-shell__content">
        <Outlet />
      </main>

      <AvisoEspacio />

      {visitaEnCurso && !dentroDeLaVisita ? (
        // Link (no <a href>): navegación SPA. Con <a href> se recargaba la
        // PWA entera en mitad de una visita — lento y se perdía el estado
        // en memoria.
        <Link to={`/visita/${visitaEnCurso.id}`} className="visita-en-curso-banner">
          Visita en curso con {visitaEnCurso.clienteNombre}
        </Link>
      ) : !visitaEnCurso ? (
        <AvisoVisitaProxima />
      ) : null}

      <BannerInstalar />

      <nav className="bottom-nav">
        <NavLink to="/" end>
          {({ isActive }) => (
            <>
              <IconoHoy activo={isActive} />
              Hoy
            </>
          )}
        </NavLink>
        <NavLink to="/clientes">
          {({ isActive }) => (
            <>
              <IconoClientes activo={isActive} />
              Clientes
            </>
          )}
        </NavLink>
        <NavLink to="/tareas">
          {({ isActive }) => (
            <>
              <IconoTareas activo={isActive} />
              Pasos
            </>
          )}
        </NavLink>
        <NavLink to="/yo">
          {({ isActive }) => (
            <>
              <IconoYo activo={isActive} />
              Yo
              {(avisoLiberar || hayAvisosParticipacion) && (
                <span className="bottom-nav__dot" aria-label="Tienes un aviso" />
              )}
            </>
          )}
        </NavLink>
      </nav>
    </div>
  );
}