import { uuid } from './uuid';
import type { VisitaPayload } from './offline-queue/types';

// Arranca una visita EN CURSO: encola la operación (cola offline) y marca el
// contexto de "visita activa" para que Hoy y el banner global apunten a ella.
// Devuelve el id local de la visita — el llamante navega a /visita/:id.
//
// Un solo sitio para esta secuencia: la usan `planificar-visita` (camino
// "Ahora") y `empezar-visita-hoja`. Antes vivía duplicada inline.
export async function arrancarVisitaAhora(args: {
  encolar: (id: string, entidad: 'visita', payload: VisitaPayload) => Promise<void>;
  iniciarVisita: (v: { id: string; clienteNombre: string }) => void;
  comercialId: string;
  clienteId: string;
  proyectoId: string;
  clienteNombre: string;
  objetivo: string;
}): Promise<string> {
  const visitaId = uuid();
  await args.encolar(visitaId, 'visita', {
    clienteId: args.clienteId,
    proyectoId: args.proyectoId,
    comercialResponsableId: args.comercialId,
    tipoVisita: null,
    objetivo: args.objetivo.trim(),
  });
  args.iniciarVisita({ id: visitaId, clienteNombre: args.clienteNombre });
  return visitaId;
}
