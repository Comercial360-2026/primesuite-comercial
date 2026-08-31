import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';

// El aviso pendiente de "libera espacio" que Dirección Comercial me haya
// mandado (uno como mucho — hay índice único). Lo usa el banner de la
// cáscara para mostrarlo, y "Mi espacio" para marcarlo atendido al abrir.

interface AvisoLiberar {
  id: string;
  pedidoPorNombre: string;
  creadoEn: string;
}

export function useAvisoLiberar(): {
  aviso: AvisoLiberar | null;
  marcarAtendido: () => void;
} {
  const { comercial } = useSesionActual();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['aviso-liberar', comercial?.id],
    enabled: !!comercial,
    staleTime: 60_000,
    queryFn: async (): Promise<AvisoLiberar | null> => {
      const { data: fila, error } = await supabase
        .from('aviso_liberar_espacio')
        .select('id, creado_en, pedido_por')
        .eq('comercial_id', comercial!.id)
        .is('atendido_en', null)
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!fila) return null;
      const { data: quien } = await supabase
        .from('comercial')
        .select('nombre')
        .eq('id', fila.pedido_por)
        .maybeSingle();
      return {
        id: fila.id,
        creadoEn: fila.creado_en,
        pedidoPorNombre: quien?.nombre ?? 'Dirección Comercial',
      };
    },
  });

  const marcarAtendido = useCallback(() => {
    if (!data) return;
    void supabase
      .from('aviso_liberar_espacio')
      .update({ atendido_en: new Date().toISOString() })
      .eq('id', data.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['aviso-liberar'] });
        queryClient.invalidateQueries({ queryKey: ['avisos-liberar-pendientes'] });
      });
  }, [data, queryClient]);

  return { aviso: data ?? null, marcarAtendido };
}
