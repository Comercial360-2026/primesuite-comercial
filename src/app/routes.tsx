import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { LayoutShell } from '@/app/layout-shell';
import { RequireRole } from '@/app/require-role';
import { RequireSession } from '@/app/require-session';
import { VisitaActivaProvider } from '@/hooks/use-visita-activa-context';
import { supabase } from '@/lib/supabase-client';
import { Login } from '@/features/auth/login';
import { EstablecerContrasena } from '@/features/auth/establecer-contrasena';

// Pantallas — cada import se resuelve a un stub inicial en su carpeta de
// feature (ver 09_arquitectura_tecnica.md §3). Se construyen en el orden del
// flujo crítico: Agenda → Visita activa → Cierre, después Ficha de cliente,
// después el resto — coherente con el plan de implementación cerrado.

import { AgendaDelDia } from '@/features/hoy/agenda-del-dia';
import { Agenda } from '@/features/hoy/agenda';
import { RepasoCliente } from '@/features/hoy/repaso-cliente';
import { VisitaActiva } from '@/features/visita/visita-activa';
import { DetalleVisitaCerrada } from '@/features/visita/detalle-visita-cerrada';
import { DetalleVisitaPlanificada } from '@/features/visita/detalle-visita-planificada';
import { DetalleCaptura } from '@/features/visita/detalle-captura';
import { CierreVisita } from '@/features/visita/cierre-visita';
import { ListadoClientes } from '@/features/clientes/listado-clientes';
import { FichaCliente } from '@/features/clientes/ficha-cliente';
import { GestionUbicacionesCliente } from '@/features/clientes/gestion-ubicaciones-cliente';
import { AltaRapidaCliente } from '@/features/clientes/alta-rapida-cliente';
import { Deduplicacion } from '@/features/clientes/deduplicacion';
import { DetalleHallazgo } from '@/features/hallazgo/detalle-hallazgo';
import { DetalleOportunidad } from '@/features/oportunidad/detalle-oportunidad';
import { MisProximosPasos } from '@/features/tareas/mis-proximos-pasos';
import { DetalleProximoPaso } from '@/features/tareas/detalle-proximo-paso';
import { ColaVocabulario } from '@/features/vocabulario/cola-vocabulario';
import { SolicitudesReasignacion } from '@/features/visita/solicitudes-reasignacion';
import { Yo } from '@/features/perfil/yo';
import { AyudaManual } from '@/features/ayuda/ayuda-manual';
import { MiEspacio } from '@/features/perfil/mi-espacio';
import { ConsumoComerciales } from '@/features/perfil/consumo-comerciales';
import { ListadoComerciales } from '@/features/comerciales/listado-comerciales';
import { AltaComercial } from '@/features/comerciales/alta-comercial';
import { DetalleComercial } from '@/features/comerciales/detalle-comercial';

// El enlace de un solo uso (Fase 6a) es de tipo `recovery`: al abrirlo,
// Supabase crea una sesión temporal y dispara `PASSWORD_RECOVERY`. El
// propio enlace ya apunta a /establecer-contrasena, pero esto cubre la
// carrera y un futuro "olvidé mi contraseña" desde el login.
function useRedirigirRecuperacion() {
  const navigate = useNavigate();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') {
        navigate('/establecer-contrasena', { replace: true });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);
}

export function AppRoutes() {
  useRedirigirRecuperacion();
  return (
    <VisitaActivaProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/establecer-contrasena" element={<EstablecerContrasena />} />

        <Route
          element={
            <RequireSession>
              <LayoutShell />
            </RequireSession>
          }
        >
          {/* Nivel 0 — Hoy */}
          <Route path="/" element={<AgendaDelDia />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/clientes/:clienteId/repaso" element={<RepasoCliente />} />
          <Route path="/clientes/:clienteId/ubicaciones" element={<GestionUbicacionesCliente />} />
          <Route path="/clientes/nuevo" element={<AltaRapidaCliente />} />

          {/* Visita — Nivel 2, alcanzable solo desde Hoy */}
          <Route path="/visita/:visitaId" element={<VisitaActiva />} />
          <Route path="/visita/:visitaId/planificada" element={<DetalleVisitaPlanificada />} />
          <Route path="/visita/:visitaId/detalle" element={<DetalleVisitaCerrada />} />
          <Route path="/capturas/:capturaId" element={<DetalleCaptura />} />
          <Route path="/visita/:visitaId/cierre" element={<CierreVisita />} />

          {/* Nivel 0 — Clientes */}
          <Route path="/clientes" element={<ListadoClientes />} />
          <Route path="/clientes/:clienteId" element={<FichaCliente />} />

          {/* Nivel 2 — Detalle, múltiples puntos de entrada, misma pantalla */}
          <Route path="/hallazgos/:hallazgoId" element={<DetalleHallazgo />} />
          <Route path="/oportunidades/:oportunidadId" element={<DetalleOportunidad />} />
          <Route path="/proximos-pasos/:pasoId" element={<DetalleProximoPaso />} />

          {/* Nivel 0 — Tareas */}
          <Route path="/tareas" element={<MisProximosPasos />} />

          {/* Nivel 0 — Yo — hueco real: el bottom nav apuntaba aquí desde
              el principio del proyecto sin que la ruta existiera nunca. */}
          <Route path="/yo" element={<Yo />} />
          <Route path="/mi-espacio" element={<MiEspacio />} />
          {/* Manual in-app — "Cómo funciona PrimeNotes". Cualquier rol. */}
          <Route path="/ayuda" element={<AyudaManual />} />

          {/* Nivel 0 — Consumo por comercial — exclusivo de Dirección Comercial */}
          <Route
            path="/consumo-comerciales"
            element={
              <RequireRole roles={['direccion_comercial']}>
                <ConsumoComerciales />
              </RequireRole>
            }
          />

          {/* Equipo — alta/edición/baja de comerciales, exclusivo de
              Dirección Comercial (crear un comercial crea un usuario de Auth
              vía la Edge Function gestionar-comercial). */}
          <Route
            path="/comerciales"
            element={
              <RequireRole roles={['direccion_comercial']}>
                <ListadoComerciales />
              </RequireRole>
            }
          />
          <Route
            path="/comerciales/nuevo"
            element={
              <RequireRole roles={['direccion_comercial']}>
                <AltaComercial />
              </RequireRole>
            }
          />
          <Route
            path="/comerciales/:comercialId"
            element={
              <RequireRole roles={['direccion_comercial']}>
                <DetalleComercial />
              </RequireRole>
            }
          />

          {/* Nivel 0 — Vocabulario — exclusivo de Dirección Comercial */}
          <Route
            path="/vocabulario"
            element={
              <RequireRole roles={['direccion_comercial']}>
                <ColaVocabulario />
              </RequireRole>
            }
          />

          {/* Solicitudes de reasignación — exclusivo de Dirección Comercial,
              mismo criterio que Vocabulario: es quien resuelve la cola. */}
          <Route
            path="/solicitudes-reasignacion"
            element={
              <RequireRole roles={['direccion_comercial']}>
                <SolicitudesReasignacion />
              </RequireRole>
            }
          />

          {/* Deduplicación de clientes — exclusivo de Dirección Comercial:
              fusionar dos fichas es una acción de administración irreversible. */}
          <Route
            path="/deduplicacion"
            element={
              <RequireRole roles={['direccion_comercial']}>
                <Deduplicacion />
              </RequireRole>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </VisitaActivaProvider>
  );
}
