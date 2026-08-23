import { supabase } from '@/lib/supabase-client';
import type { ResolverTerminoPropuestoArgs, TerminoRow } from './types';
import type { ResultadoRpc } from './crear-visita-con-responsable';

// Wrapper de resolver_termino_propuesto (10_rpc_functions.sql §2).
// Usado por el rol administrador_vocabulario en la Cola de vocabulario
// propuesto (V1.1) — se deja preparado ahora porque es infraestructura
// mínima, no pantalla; la pantalla llega en la siguiente iteración según
// 07_plan_producto_v1.md §2.
export async function resolverTerminoPropuesto(
  args: ResolverTerminoPropuestoArgs
): Promise<ResultadoRpc<TerminoRow>> {
  if (args.pAccion === 'fusionar' && !args.pTerminoDestinoId) {
    return { data: null, error: 'fusionar requiere pTerminoDestinoId' };
  }

  const { data, error } = await supabase.rpc('resolver_termino_propuesto', {
    p_termino_id: args.pTerminoId,
    p_accion: args.pAccion,
    p_termino_destino_id: args.pTerminoDestinoId ?? undefined,
  });

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data as TerminoRow, error: null };
}
