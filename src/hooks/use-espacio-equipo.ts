import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { evaluarEspacio, type EstadoEspacio } from '@/lib/espacio';

// Junta las cuatro cifras (mi uso, mi parte orientativa, uso del equipo,
// presupuesto) desde funciones que ya existen + fn_espacio_equipo (que no
// tiene el corte por rol de fn_espacio_storage_usado, así que un comercial
// normal también ve el total del equipo).
// Lo usan "Mi espacio", el banner de la cáscara y Visita Activa (bloqueo
// de fotos al 98% del pozo).

export function useEspacioEquipo(): { estado: EstadoEspacio | null; cargando: boolean } {
  const { data: miUso } = useQuery({
    queryKey: ['mi-espacio-total'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('fn_mi_espacio_total');
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const { data: cuotaBase } = useQuery({
    queryKey: ['cuota-comercial-bytes'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('fn_cuota_comercial_bytes');
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const { data: equipo } = useQuery({
    queryKey: ['espacio-equipo'],
    staleTime: 60_000,
    queryFn: async (): Promise<{ usado_total: number; presupuesto: number }> => {
      const { data, error } = await supabase.rpc('fn_espacio_equipo').single();
      if (error) throw error;
      return {
        usado_total: Number(data.usado_total ?? 0),
        presupuesto: Number(data.presupuesto ?? 0),
      };
    },
  });

  if (miUso == null || cuotaBase == null || !equipo) return { estado: null, cargando: true };

  return {
    estado: evaluarEspacio(miUso, cuotaBase, equipo.usado_total, equipo.presupuesto),
    cargando: false,
  };
}
