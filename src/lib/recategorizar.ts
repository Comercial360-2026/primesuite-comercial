import { supabase } from '@/lib/supabase-client';
import {
  obtenerOperacion,
  eliminarOperacion,
  encolarOperacion,
  EVENTO_COLA_PROCESADA,
} from '@/lib/offline-queue';
import type { OperacionPendiente } from '@/lib/offline-queue/types';

// Prompt maestro 11, Fase 3: nota ⇄ hallazgo ⇄ oportunidad. El movimiento
// real (mover de tabla, reutilizando el id, sin perder nada) lo hace la RPC
// `recategorizar_item`. Aquí solo van las rutas y el reflejo en la cola
// local.

export type TipoItem = 'nota' | 'hallazgo' | 'oportunidad';

export const RUTA_ITEM: Record<TipoItem, (id: string) => string> = {
  nota: (id) => `/capturas/${id}`,
  hallazgo: (id) => `/hallazgos/${id}`,
  oportunidad: (id) => `/oportunidades/${id}`,
};

// Tras recategorizar en el servidor, "En esta visita" de la visita EN CURSO
// sigue leyendo la copia local (IndexedDB) para lo propio. Si el item tenía
// entrada en la cola, se reescribe con el tipo nuevo —leyendo la fila recién
// creada— para que la lista no muestre un fantasma del tipo viejo ni se
// pierda el item nuevo. Si no había copia local (repaso en oficina, visita
// cerrada), no hay nada que hacer.
export async function reflejarRecategorizacionEnCola(id: string, hacia: TipoItem): Promise<void> {
  const op = await obtenerOperacion(id);
  if (!op) return;

  let nueva: OperacionPendiente | null = null;

  if (hacia === 'hallazgo') {
    const { data } = await supabase
      .from('hallazgo')
      .select('visita_id, cliente_id, comercial_autor_id, naturaleza, nota, zona_texto, creado_en')
      .eq('id', id)
      .single();
    if (data) {
      nueva = {
        id,
        entidad: 'hallazgo',
        estado: 'completado',
        intentos: 0,
        creadoEn: data.creado_en ?? op.creadoEn,
        payload: {
          visitaId: data.visita_id,
          comercialAutorId: data.comercial_autor_id,
          naturaleza: data.naturaleza as 'contexto' | 'riesgo' | 'competencia',
          nota: data.nota ?? undefined,
          zonaTexto: data.zona_texto ?? undefined,
        },
      } as unknown as OperacionPendiente;
    }
  } else if (hacia === 'oportunidad') {
    const { data } = await supabase
      .from('oportunidad')
      .select('cliente_id, comercial_autor_id, visita_origen_id, titulo, prioridad, zona_texto, creado_en')
      .eq('id', id)
      .single();
    if (data) {
      nueva = {
        id,
        entidad: 'oportunidad',
        estado: 'completado',
        intentos: 0,
        creadoEn: data.creado_en ?? op.creadoEn,
        payload: {
          clienteId: data.cliente_id,
          comercialAutorId: data.comercial_autor_id,
          visitaOrigenId: data.visita_origen_id,
          titulo: data.titulo,
          prioridad: data.prioridad as 'baja' | 'media' | 'alta' | 'estrategica',
          zonaTexto: data.zona_texto ?? undefined,
        },
      } as unknown as OperacionPendiente;
    }
  } else {
    const { data } = await supabase
      .from('captura_libre')
      .select('visita_id, comercial_autor_id, titulo, contenido_texto, zona_texto, creado_en')
      .eq('id', id)
      .single();
    if (data) {
      nueva = {
        id,
        entidad: 'captura_libre',
        estado: 'completado',
        intentos: 0,
        creadoEn: data.creado_en ?? op.creadoEn,
        payload: {
          visitaId: data.visita_id,
          comercialAutorId: data.comercial_autor_id,
          tipo: 'nota',
          titulo: data.titulo ?? undefined,
          contenidoTexto: data.contenido_texto ?? undefined,
          zonaTexto: data.zona_texto ?? undefined,
        },
      } as unknown as OperacionPendiente;
    }
  }

  await eliminarOperacion(id);
  if (nueva) await encolarOperacion(nueva);
  // Señal para que useSyncQueue (Visita activa, Cierre) relea la cola.
  window.dispatchEvent(new Event(EVENTO_COLA_PROCESADA));
}
