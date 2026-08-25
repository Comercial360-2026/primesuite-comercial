import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSesionActual } from '@/hooks/use-sesion-actual';

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
  const location = useLocation();

  if (cargando) return null;
  if (!comercial) {
    return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  }
  return <>{children}</>;
}
