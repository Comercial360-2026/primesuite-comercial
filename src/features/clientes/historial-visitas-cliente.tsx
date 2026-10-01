import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { ListaVisitasHistorial, type VisitaHistorial } from '@/features/visita/lista-visitas-historial';

// Las visitas del cliente en su propia ficha. Solo se monta cuando el
// cliente tiene UN proyecto (ficha-cliente.tsx): con varios, cada proyecto
// enseña las suyas al entrar. Misma fila que el proyecto
// (`ListaVisitasHistorial`): fecha, objetivo y qué tiene dentro.
//
// Devuelve una <SeccionLista> (o nada si no hay visitas) — sin envoltorio
// propio, igual que `ActividadProyecto`.

export function HistorialVisitasCliente({ clienteId }: { clienteId: string }) {
  const { data: visitas } = useQuery({
    queryKey: ['historial-visitas-cliente', clienteId],
    queryFn: async (): Promise<VisitaHistorial[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, objetivo, estado_captura')
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!visitas?.length) return null;
  return <ListaVisitasHistorial visitas={visitas} />;
}
