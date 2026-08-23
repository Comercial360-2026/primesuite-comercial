import { Routes, Route, Navigate } from 'react-router-dom';
import { LayoutShell } from '@/app/layout-shell';
import { RequireRole } from '@/app/require-role';
import { VisitaActivaProvider } from '@/hooks/use-visita-activa-context';

// Pantallas — cada import se resuelve a un stub inicial en su carpeta de
// feature (ver 09_arquitectura_tecnica.md §3). Se construyen en el orden del
// flujo crítico: Agenda → Visita activa → Cierre, después Ficha de cliente,
// después el resto — coherente con el plan de implementación cerrado.

import { AgendaDelDia } from '@/features/hoy/agenda-del-dia';
import { RepasoCliente } from '@/features/hoy/repaso-cliente';
import { VisitaActiva } from '@/features/visita/visita-activa';
import { CierreVisita } from '@/features/visita/cierre-visita';
import { ListadoClientes } from '@/features/clientes/listado-clientes';
import { FichaCliente } from '@/features/clientes/ficha-cliente';
import { AltaRapidaCliente } from '@/features/clientes/alta-rapida-cliente';
import { DetalleHallazgo } from '@/features/hallazgo/detalle-hallazgo';
import { DetalleOportunidad } from '@/features/oportunidad/detalle-oportunidad';
import { MisProximosPasos } from '@/features/tareas/mis-proximos-pasos';
import { ColaVocabulario } from '@/features/vocabulario/cola-vocabulario';

export function AppRoutes() {
  return (
    <VisitaActivaProvider>
      <Routes>
        <Route element={<LayoutShell />}>
          {/* Nivel 0 — Hoy */}
          <Route path="/" element={<AgendaDelDia />} />
          <Route path="/clientes/:clienteId/repaso" element={<RepasoCliente />} />
          <Route path="/clientes/nuevo" element={<AltaRapidaCliente />} />

          {/* Visita — Nivel 2, alcanzable solo desde Hoy */}
          <Route path="/visita/:visitaId" element={<VisitaActiva />} />
          <Route path="/visita/:visitaId/cierre" element={<CierreVisita />} />

          {/* Nivel 0 — Clientes */}
          <Route path="/clientes" element={<ListadoClientes />} />
          <Route path="/clientes/:clienteId" element={<FichaCliente />} />

          {/* Nivel 2 — Detalle, múltiples puntos de entrada, misma pantalla */}
          <Route path="/hallazgos/:hallazgoId" element={<DetalleHallazgo />} />
          <Route path="/oportunidades/:oportunidadId" element={<DetalleOportunidad />} />

          {/* Nivel 0 — Tareas */}
          <Route path="/tareas" element={<MisProximosPasos />} />

          {/* Nivel 0 — Vocabulario (solo administrador_vocabulario) — V1.1 */}
          <Route
            path="/vocabulario"
            element={
              <RequireRole roles={['administrador_vocabulario']}>
                <ColaVocabulario />
              </RequireRole>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </VisitaActivaProvider>
  );
}
