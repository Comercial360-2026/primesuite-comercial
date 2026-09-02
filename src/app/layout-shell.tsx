import { Link, NavLink, Outlet } from 'react-router-dom';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useAvisoLiberar } from '@/hooks/use-aviso-liberar';
import { AvisoVisitaProxima } from '@/components/ui/aviso-visita-proxima';
import { AvisoEspacio } from '@/components/ui/aviso-espacio';
import { IconoHoy, IconoClientes, IconoTareas, IconoYo } from '@/components/ui/iconos';

// Bottom nav de 4 secciones fijas — Visita activa NUNCA aparece aquí,
// solo se alcanza desde Hoy (ver 06_arquitectura_navegacion.md §5).
// "Yo" es siempre el mismo hueco, para cualquier rol — antes se sustituía
// por "Vocabulario" para direccion_comercial, lo cual le quitaba a ese rol
// su propio acceso a cerrar sesión (hueco real, detectado probando).
// Vocabulario ahora vive dentro de la pantalla Yo, no en el menú.
export function LayoutShell() {
  const { visitaEnCurso } = useVisitaActivaContext();
  // Aviso "libera espacio" que Dirección me haya mandado y no haya mirado.
  // La LÍNEA en la cáscara ya la pinta <AvisoEspacio /> (tiene prioridad
  // sobre los avisos de pozo). Lo que faltaba era que se notase también
  // desde otra pantalla: un punto en la pestaña "Yo".
  const { aviso: avisoLiberar } = useAvisoLiberar();

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
          {avisoLiberar && <span className="bottom-nav__dot" aria-label="Tienes un aviso" />}
        </NavLink>
      </nav>
    </div>
  );
}