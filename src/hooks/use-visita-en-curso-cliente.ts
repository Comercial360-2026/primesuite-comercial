import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

// ¿Hay ya una visita EN CURSO para este cliente? Se usa antes de arrancar
// una visita "sobre la marcha" para no apilar varias abiertas a la vez con
// el mismo cliente (pasa sin querer: cada "Iniciar visita ahora" crea una
// nueva). Devuelve la más reciente, o null. No filtra por comercial: una
// visita abierta con ese cliente es motivo de aviso sea de quien sea, y
// "Empezar otra" sigue disponible.
export function useVisitaEnCursoCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: ['visita-en-curso-cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<{ id: string; objetivo: string | null } | null> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, objetivo')
        .eq('cliente_id', clienteId!)
        .eq('estado_captura', 'en_curso')
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
