import { supabase } from '@/lib/supabase-client';
import type { CrearVisitaConResponsableArgs, VisitaRow } from './types';

export interface ResultadoRpc<T> {
  data: T | null;
  error: string | null;
}

// Wrapper de crear_visita_con_responsable (10_rpc_functions.sql §1).
// Resuelve en una única transacción de servidor el constraint diferido de
// "un solo responsable por visita" — es el punto de entrada obligatorio
// para crear visitas, tanto en línea como al reproducir la cola offline.
// Nunca se debe insertar directamente en `visita` + `visita_participante`
// por separado desde el cliente.
export async function crearVisitaConResponsable(
  args: CrearVisitaConResponsableArgs
): Promise<ResultadoRpc<VisitaRow>> {
  const { data, error } = await supabase.rpc('crear_visita_con_responsable', {
    p_visita_id: args.pVisitaId,
    p_cliente_id: args.pClienteId,
    p_comercial_id: args.pComercialId,
    p_tipo_visita: args.pTipoVisita ?? undefined,
    p_fecha: args.pFecha ?? undefined,
    p_estado_captura: args.pEstadoCaptura ?? undefined,
  });

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data as VisitaRow, error: null };
}
