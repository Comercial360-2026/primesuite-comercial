export {
  encolarOperacion,
  actualizarOperacion,
  obtenerOperacion,
  obtenerPendientes,
  obtenerPorVisita,
  contarPendientesPorEntidad,
  eliminarOperacion,
} from './db';
export { iniciarMotorSincronizacion, detenerMotorSincronizacion, procesarCola } from './sync-engine';
export type {
  OperacionPendiente,
  EntidadSincronizable,
  EstadoOperacion,
  VisitaPayload,
  HallazgoPayload,
  CapturaLibrePayload,
  OportunidadPayload,
  ProximoPasoPayload,
} from './types';
