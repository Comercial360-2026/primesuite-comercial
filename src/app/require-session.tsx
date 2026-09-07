import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { EstadoLista } from '@/components/ui/estado-lista';

interface RequireSessionProps {
  children: ReactNode;
}

// Guarda global de sesión — envuelve todas las rutas protegidas. Sin esto,
// `comercial` puede ser `null` en cualquier pantalla (Alta rápida cliente,
// Ficha cliente, Repaso cliente, Visita activa...) y cada una tendría que
// defenderse por su cuenta, como ya ocurrió de forma silenciosa en
// AltaRapidaCliente. Un único punto de guarda es más fiable que repetir
// la comprobación pantalla por pantalla.
export function RequireSession({ children }: RequireSessionProps) {
  const { comercial, cargando } = useSesionActual();

  // Antes devolvía `null` — la app se quedaba en blanco, sin ninguna
  // señal, mientras resolvía la sesión (auth + fila de comercial).
  if (cargando) {
    return (
      <div className="screen">
        <EstadoLista estado="cargando" />
      </div>
    );
  }
  if (!comercial) {
    // Sin recordar de dónde venía: al volver a entrar se aterriza siempre
    // en Hoy (ver login.tsx).
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
