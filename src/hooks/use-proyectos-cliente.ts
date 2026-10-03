import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

export interface ProyectoDelCliente {
  id: string;
  nombre: string;
  estado: string;
  /** Fecha de la visita más reciente de ESTE proyecto (null si no tiene
   *  ninguna). Para el remate de una línea de su fila en la ficha de
   *  cliente; el historial completo vive dentro del proyecto. */
  ultimaVisitaFecha: string | null;
  /** Visitas de este proyecto (todas: cerradas, en curso y planificadas). */
  numVisitas: number;
  /** true si tiene una visita con `estado_captura = 'en_curso'`. */
  visitaEnCurso: boolean;
}

/** Estado de un proyecto en la voz del usuario. Un solo sitio para el texto —
 *  lo usan la ficha de cliente (subtítulo de la fila) y la ficha de proyecto
 *  (línea de contexto). */
export const ESTADO_PROYECTO_LABEL: Record<string, string> = {
  activo: 'activo',
  pausado: 'pausado',
  terminado: 'terminado',
};

// Los proyectos de un cliente, del más antiguo al más nuevo, con el remate
// de actividad de cada uno (última visita / en curso) resuelto en una sola
// consulta extra sobre `visita` — evita una consulta por fila. Fuente ÚNICA
// de esta lista: la usan la Ficha de cliente (sección "Proyectos" + barra de
// acciones) y la Ficha de proyecto. Con una sola clave, invalidar tras crear
// un proyecto o cerrar/empezar una visita basta para las dos.
export function useProyectosCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: ['proyectos-cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<ProyectoDelCliente[]> => {
      const [{ data: proyectos, error: errProyectos }, { data: visitas, error: errVisitas }] =
        await Promise.all([
          supabase
            .from('proyecto')
            .select('id, nombre, estado')
            .eq('cliente_id', clienteId!)
            .order('creado_en', { ascending: true }),
          supabase
            .from('visita')
            .select('proyecto_id, fecha, estado_captura')
            .eq('cliente_id', clienteId!)
            .order('fecha', { ascending: false }),
        ]);
      if (errProyectos) throw errProyectos;
      if (errVisitas) throw errVisitas;

      // Recorrido único de `visitas` (ya viene ordenada por fecha desc): la
      // primera vez que se ve un proyecto_id es su visita más reciente.
      const ultimaPorProyecto = new Map<string, string>();
      const enCursoPorProyecto = new Set<string>();
      const numPorProyecto = new Map<string, number>();
      for (const v of visitas ?? []) {
        if (!v.proyecto_id) continue;
        numPorProyecto.set(v.proyecto_id, (numPorProyecto.get(v.proyecto_id) ?? 0) + 1);
        // «Última» = la última que ya ocurrió: una planificada para el mes que viene no es la última visita.
        if (v.estado_captura !== 'agendada' && !ultimaPorProyecto.has(v.proyecto_id)) ultimaPorProyecto.set(v.proyecto_id, v.fecha);
        if (v.estado_captura === 'en_curso') enCursoPorProyecto.add(v.proyecto_id);
      }

      return (proyectos ?? []).map((p) => ({
        ...p,
        ultimaVisitaFecha: ultimaPorProyecto.get(p.id) ?? null,
        numVisitas: numPorProyecto.get(p.id) ?? 0,
        visitaEnCurso: enCursoPorProyecto.has(p.id),
      }));
    },
  });
}
