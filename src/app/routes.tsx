import { Routes, Route, Navigate } from 'react-router-dom';
import { LayoutShell } from '@/app/layout-shell';
import { RequireRole } from '@/app/require-role';
import { RequireSession } from '@/app/require-session';
import { VisitaActivaProvider } from '@/hooks/use-visita-activa-context';
import { Login } from '@/features/auth/login';

// Pantallas — cada import se resuelve a un stub inicial en su carpeta de
// feature (ver 09_arquitectura_tecnica.md §3). Se construyen en el orden del
// flujo crítico: Agenda → Visita activa → Cierre, después Ficha de cliente,
// después el resto — coherente con el plan de implementación cerrado.

import { AgendaDelDia } from '@/features/hoy/agenda-del-dia';
import { RepasoCliente } from '@/features/hoy/repaso-cliente';
import { VisitaActiva } from '@/features/visita/visita-activa';
import { DetalleVisitaCerrada } from '@/features/visita/detalle-visita-cerrada';
import { DetalleCaptura } from '@/features/visita/detalle-captura';
import { CierreVisita } from '@/features/visita/cierre-visita';
import { ListadoClientes } from '@/features/clientes/listado-clientes';
import { FichaCliente } from '@/features/clientes/ficha-cliente';
import { GestionUbicacionesCliente } from '@/features/clientes/gestion-ubicaciones-cliente';
import { AltaRapidaCliente } from '@/features/clientes/alta-rapida-cliente';
import { DetalleHallazgo } from '@/features/hallazgo/detalle-hallazgo';
import { DetalleOportunidad } from '@/features/oportunidad/detalle-oportunidad';
import { MisProximosPasos } from '@/features/tareas/mis-proximos-pasos';
import { DetalleProximoPaso } from '@/features/tareas/detalle-proximo-paso';
import { ColaVocabulario } from '@/features/vocabulario/cola-vocabulario';
import { SolicitudesReasignacion } from '@/features/visita/solicitudes-reasignacion';
import { Yo } from '@/features/perfil/yo';
import { MiEspacio } from '@/features/perfil/mi-espacio';
import { ConsumoComerciales } from '@/features/perfil/consumo-comerciales';

export function AppRoutes() {
  return (
    <VisitaActivaProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <RequireSession>
              <LayoutShell />
            </RequireSession>
          }
        >
          {/* Nivel 0 — Hoy */}
          <Route path="/" element={<AgendaDelDia />} />
          <Route path="/clientes/:clienteId/repaso" element={<RepasoCliente />} />
          <Route path="/clientes/:clienteId/ubicaciones" element={<GestionUbicacionesCliente />} />
          <Route path="/clientes/nuevo" element={<AltaRapidaCliente />} />

          {/* Visita — Nivel 2, alcanzable solo desde Hoy */}
          <Route path="/visita/:visitaId" element={<VisitaActiva />} />
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

          {/* Nivel 0 — Consumo por comercial — exclusivo de Dirección Comercial */}
          <Route
            path="/consumo-comerciales"
            element={
              <RequireRole roles={['direccion_comercial']}>
                <ConsumoComerciales />
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </VisitaActivaProvider>
  );
}
