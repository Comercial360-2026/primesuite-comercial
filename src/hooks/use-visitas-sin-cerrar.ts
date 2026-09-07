import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

export interface VisitasSinCerrar {
  total: number;
  /** Id de la más reciente — para enlazar directo cuando solo hay una. */
  primeraId: string | null;
  /** `en_curso_desde` de la más reciente. */
  primeraDesde: string | null;
}

// Visitas EN CURSO (sin cerrar) de un cliente o de un proyecto concreto. Para
// la línea "N visita(s) sin cerrar — ábrela" arriba de la ficha: las visitas
// abiertas no se cierran solas, así que hay que empujar a cerrarlas.
export function useVisitasSinCerrar(args: { clienteId?: string; proyectoId?: string }) {
  const { clienteId, proyectoId } = args;
  return useQuery({
    queryKey: ['visitas-sin-cerrar', proyectoId ?? null, clienteId ?? null],
    enabled: !!clienteId || !!proyectoId,
    queryFn: async (): Promise<VisitasSinCerrar> => {
      let q = supabase
        .from('visita')
        .select('id, en_curso_desde', { count: 'exact' })
        .eq('estado_captura', 'en_curso')
        .order('fecha', { ascending: false });
      q = proyectoId ? q.eq('proyecto_id', proyectoId) : q.eq('cliente_id', clienteId!);
      const { data, count, error } = await q;
      if (error) throw error;
      return {
        total: count ?? 0,
        primeraId: data?.[0]?.id ?? null,
        primeraDesde: data?.[0]?.en_curso_desde ?? null,
      };
    },
  });
}
