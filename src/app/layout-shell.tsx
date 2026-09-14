import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { desde } from '@/lib/volver-a';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useAvisoLiberar } from '@/hooks/use-aviso-liberar';
import { useAvisosParticipacion } from '@/hooks/use-avisos-participacion';
import { useAvisosGestion } from '@/hooks/use-avisos-gestion';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useTourGuiado } from '@/hooks/use-tour-guiado';
import { TourNavegacionContext } from '@/hooks/use-tour-navegacion-context';
import { AvisoVisitaProxima } from '@/components/ui/aviso-visita-proxima';
import { AvisoEspacio } from '@/components/ui/aviso-espacio';
import { BannerInstalar } from '@/components/ui/banner-instalar';
import { TourGuiado } from '@/components/ui/tour-guiado';
import { IconoHoy, IconoClientes, IconoTareas, IconoYo } from '@/components/ui/iconos';
import { TOUR_NAVEGACION } from '@/lib/ayuda';

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
  const location = useLocation();
  const { pathname } = location;
  const dentroDeLaVisita =
    !!visitaEnCurso &&
    (pathname === `/visita/${visitaEnCurso.id}` ||
      pathname.startsWith(`/visita/${visitaEnCurso.id}/`));
  // Avisos que encienden el punto de la pestaña "Yo": el "libera espacio"
  // que Dirección me haya mandado (su LÍNEA la pinta <AvisoEspacio />), las
  // invitaciones a visitas de equipo pendientes de aceptar/rechazar o los
  // rechazos que aún no he visto, y — solo para Dirección Comercial — algo
  // pendiente en "Gestión" (peticiones de acceso, solicitudes de ayuda,
  // clientes duplicados). Antes esto último solo se veía entrando en Yo
  // (Cesar, 14 sept: "entras y no te das cuenta").
  const { aviso: avisoLiberar } = useAvisoLiberar();
  const { hayAvisos: hayAvisosParticipacion } = useAvisosParticipacion();
  const { hayAvisos: hayAvisosGestion } = useAvisosGestion();

  // Tour de bienvenida (4 pasos, uno por pestaña) — se dispara solo una vez
  // por comercial, en cualquier ruta (el bottom nav es el mismo en todas).
  // Vive aquí (y no en Yo) porque LayoutShell envuelve todas las rutas;
  // "Ver guía rápida" en Yo lo relanza vía TourNavegacionContext.
  const { comercial } = useSesionActual();
  const tourNav = useTourGuiado('navegacion', comercial?.id, TOUR_NAVEGACION);

  return (
    <TourNavegacionContext.Provider value={{ reiniciar: tourNav.reiniciar }}>
      <div className="app-shell">
        <main className="app-shell__content">
          <Outlet />
        </main>

        <AvisoEspacio />

        {visitaEnCurso && !dentroDeLaVisita ? (
          // Link (no <a href>): navegación SPA. Con <a href> se recargaba la
          // PWA entera en mitad de una visita — lento y se perdía el estado
          // en memoria.
          <Link
            to={`/visita/${visitaEnCurso.id}`}
            state={desde(location)}
            className="visita-en-curso-banner"
          >
            Visita en curso con {visitaEnCurso.clienteNombre}
          </Link>
        ) : !visitaEnCurso ? (
          <AvisoVisitaProxima />
        ) : null}

        <BannerInstalar />

        <nav className="bottom-nav">
          <NavLink to="/" end data-tour="nav-hoy">
            {({ isActive }) => (
              <>
                <IconoHoy activo={isActive} />
                Hoy
              </>
            )}
          </NavLink>
          <NavLink to="/clientes" data-tour="nav-clientes">
            {({ isActive }) => (
              <>
                <IconoClientes activo={isActive} />
                Clientes
              </>
            )}
          </NavLink>
          <NavLink to="/tareas" data-tour="nav-tareas">
            {({ isActive }) => (
              <>
                <IconoTareas activo={isActive} />
                Pasos
              </>
            )}
          </NavLink>
          <NavLink to="/yo" data-tour="nav-yo">
            {({ isActive }) => (
              <>
                <IconoYo activo={isActive} />
                Yo
                {(avisoLiberar || hayAvisosParticipacion || hayAvisosGestion) && (
                  <span className="bottom-nav__dot" aria-label="Tienes un aviso" />
                )}
              </>
            )}
          </NavLink>
        </nav>
      </div>

      {tourNav.paso && (
        <TourGuiado
          paso={tourNav.paso}
          indice={tourNav.indice}
          total={tourNav.total}
          onSiguiente={tourNav.siguiente}
          onSaltar={tourNav.saltar}
        />
      )}
    </TourNavegacionContext.Provider>
  );
}
