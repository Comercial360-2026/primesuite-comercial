import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

export interface ProyectoDelCliente {
  id: string;
  nombre: string;
  estado: string;
}

/** Estado de un proyecto en la voz del usuario. Un solo sitio para el texto —
 *  lo usan la ficha de cliente (subtítulo de la fila) y la ficha de proyecto
 *  (línea de contexto). */
export const ESTADO_PROYECTO_LABEL: Record<string, string> = {
  activo: 'activo',
  pausado: 'pausado',
  terminado: 'terminado',
};

// Los proyectos de un cliente, del más antiguo al más nuevo. Fuente ÚNICA de
// esta lista: la usan la Ficha de cliente (sección "Proyectos" + barra de
// acciones) y la Ficha de proyecto. Con una sola clave, invalidar tras crear
// un proyecto basta para las dos.
export function useProyectosCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: ['proyectos-cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<ProyectoDelCliente[]> => {
      const { data, error } = await supabase
        .from('proyecto')
        .select('id, nombre, estado')
        .eq('cliente_id', clienteId!)
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
