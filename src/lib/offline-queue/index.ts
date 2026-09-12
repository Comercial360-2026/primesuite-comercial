export {
  encolarOperacion,
  actualizarOperacion,
  obtenerOperacion,
  obtenerPendientes,
  obtenerOperacionesConError,
  obtenerPorVisita,
  obtenerVisitasConPendientes,
  obtenerUbicacionesPorCliente,
  contarPendientesPorEntidad,
  eliminarOperacion,
} from './db';
export {
  iniciarMotorSincronizacion,
  detenerMotorSincronizacion,
  procesarCola,
  EVENTO_COLA_PROCESADA,
} from './sync-engine';
export type {
  OperacionPendiente,
  EntidadSincronizable,
  EstadoOperacion,
  ClientePayload,
  VisitaPayload,
  HallazgoPayload,
  CapturaLibrePayload,
  OportunidadPayload,
  ProximoPasoPayload,
  UbicacionPayload,
} from './types';
