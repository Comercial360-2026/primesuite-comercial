import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

export interface ProyectoDelCliente {
  id: string;
  nombre: string;
  estado: string;
  es_general: boolean;
}

/** Estado de un proyecto en la voz del usuario. Un solo sitio para el texto —
 *  lo usan la ficha de cliente (subtítulo de la fila) y la ficha de proyecto
 *  (línea de contexto). */
export const ESTADO_PROYECTO_LABEL: Record<string, string> = {
  activo: 'activo',
  pausado: 'pausado',
  terminado: 'terminado',
};

// Los proyectos de un cliente, el General primero. Fuente ÚNICA de esta
// lista: la usan la Ficha de cliente (para pintar "Proyectos" o, si solo
// está el General, su actividad en línea) y la Ficha de proyecto (para
// saber si debe fundirse en la de cliente — 1.5 del recorrido de revisión).
// Con una sola clave, invalidar tras crear un proyecto basta para las dos.
export function useProyectosCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: ['proyectos-cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<ProyectoDelCliente[]> => {
      const { data, error } = await supabase
        .from('proyecto')
        .select('id, nombre, estado, es_general')
        .eq('cliente_id', clienteId!)
        .order('es_general', { ascending: false })
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
