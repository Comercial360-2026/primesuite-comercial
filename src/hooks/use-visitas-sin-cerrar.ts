import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import type { VisitaAbierta } from '@/features/visita/fila-visita-abierta';

export interface VisitasSinCerrar {
  total: number;
  /** Id de la más reciente — para enlazar directo cuando solo hay una. */
  primeraId: string | null;
  /** `en_curso_desde` de la más reciente. */
  primeraDesde: string | null;
  /** Todas, para el panel: cliente · proyecto · abierta hace… + si es mía. */
  lista: VisitaAbierta[];
}

// Visitas EN CURSO (sin cerrar) de un cliente o de un proyecto concreto. Para
// el aviso "N visita(s) sin cerrar" arriba de la ficha y el panel que abre:
// las visitas abiertas no se cierran solas (ya no hay auto-cierre, ver
// migración 102), así que hay que empujar a cerrarlas. `comercialId` marca
// cuáles son mías (las de otro comercial se ven pero no se pueden cerrar).
export function useVisitasSinCerrar(args: {
  clienteId?: string;
  proyectoId?: string;
  comercialId?: string;
}) {
  const { clienteId, proyectoId, comercialId } = args;
  return useQuery({
    queryKey: ['visitas-sin-cerrar', proyectoId ?? null, clienteId ?? null, comercialId ?? null],
    enabled: !!clienteId || !!proyectoId,
    queryFn: async (): Promise<VisitasSinCerrar> => {
      let q = supabase
        .from('visita')
        .select(
          'id, en_curso_desde, cliente:cliente_id(nombre), proyecto:proyecto_id(nombre)',
          { count: 'exact' }
        )
        .eq('estado_captura', 'en_curso')
        .order('en_curso_desde', { ascending: false });
      q = proyectoId ? q.eq('proyecto_id', proyectoId) : q.eq('cliente_id', clienteId!);
      const { data, count, error } = await q;
      if (error) throw error;

      const filas = (data ?? []) as unknown as Array<{
        id: string;
        en_curso_desde: string | null;
        cliente: { nombre: string } | null;
        proyecto: { nombre: string } | null;
      }>;

      // Responsables de esas visitas (rol 'responsable' en visita_participante).
      const ids = filas.map((f) => f.id);
      let responsables: Record<string, { id: string; nombre: string }> = {};
      if (ids.length) {
        const { data: resp } = await supabase
          .from('visita_participante')
          .select('visita_id, comercial_id, comercial:comercial_id(nombre)')
          .eq('rol', 'responsable')
          .in('visita_id', ids);
        responsables = Object.fromEntries(
          (resp ?? []).map((r) => [
            (r as { visita_id: string }).visita_id,
            {
              id: (r as { comercial_id: string }).comercial_id,
              nombre: (r as unknown as { comercial: { nombre: string } | null }).comercial?.nombre ?? '',
            },
          ])
        );
      }

      const lista: VisitaAbierta[] = filas.map((f) => {
        const r = responsables[f.id];
        return {
          id: f.id,
          clienteNombre: f.cliente?.nombre ?? 'Cliente',
          proyectoNombre: f.proyecto?.nombre ?? null,
          desde: f.en_curso_desde,
          esMia: !r || !comercialId || r.id === comercialId,
          responsableNombre: r?.nombre || null,
        };
      });

      return {
        total: count ?? 0,
        primeraId: filas[0]?.id ?? null,
        primeraDesde: filas[0]?.en_curso_desde ?? null,
        lista,
      };
    },
  });
}
