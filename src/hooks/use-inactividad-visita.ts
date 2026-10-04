import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

// Cierre automático por inactividad (migración 135): una visita EN CURSO con algo
// capturado y sin actividad durante `horasLimite` (ajustes_app 'visita_autocierre_horas',
// 18 por defecto) se cierra sola. Esto avisa ANTES: desde las 8 h sin actividad se dice
// cuánto falta. Devuelve null si no toca avisar (poca inactividad, ajuste apagado, sin
// permiso para ver la actividad o aún cargando).
const HORAS_AVISO = 8;

export interface InactividadVisita {
  horasInactiva: number;
  horasLimite: number;
  /** Horas que faltan para el cierre automático (≥ 0). */
  horasRestantes: number;
}

export function useInactividadVisita(visitaId: string | undefined, enCurso: boolean): InactividadVisita | null {
  const { data } = useQuery({
    queryKey: ['inactividad-visita', visitaId],
    enabled: !!visitaId && enCurso,
    refetchInterval: 10 * 60_000,
    queryFn: async (): Promise<InactividadVisita | null> => {
      const [{ data: ultima, error: e1 }, { data: ajuste, error: e2 }] = await Promise.all([
        supabase.rpc('fn_ultima_actividad_visita', { p_visita_id: visitaId! }),
        supabase.from('ajustes_app').select('valor, valor_numero').eq('clave', 'visita_autocierre_horas').maybeSingle(),
      ]);
      if (e1 || e2 || !ultima || !ajuste?.valor || !ajuste.valor_numero) return null;
      const horasInactiva = (Date.now() - new Date(ultima).getTime()) / 3_600_000;
      if (horasInactiva < HORAS_AVISO) return null;
      return {
        horasInactiva: Math.floor(horasInactiva),
        horasLimite: ajuste.valor_numero,
        horasRestantes: Math.max(0, Math.ceil(ajuste.valor_numero - horasInactiva)),
      };
    },
  });
  return data ?? null;
}
