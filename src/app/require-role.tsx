import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSesionActual } from '@/hooks/use-sesion-actual';

interface RequireRoleProps {
  roles: string[];
  children: ReactNode;
}

// Lee el rol desde la sesión ya en memoria (Supabase Auth + tabla comercial),
// sin consulta adicional por navegación — ver 09_arquitectura_tecnica.md §1.
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { comercial, cargando } = useSesionActual();

  if (cargando) return null;
  if (!comercial || !roles.includes(comercial.rol)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
