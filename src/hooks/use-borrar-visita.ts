import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useAccionAsync } from '@/hooks/use-accion-async';

export interface PrevisualizacionBorrado {
  num_fotos: number;
  num_audios: number;
  num_notas: number;
  num_hallazgos: number;
  num_oportunidades: number;
  num_proximos_pasos: number;
  rutas_storage: string[] | null;
}

// Borrado de una visita completa, en dos pasos (previsualizar qué arrastra →
// confirmar), extraído para que sea idéntico en todos los sitios donde se
// puede borrar una visita: ficha de cliente, Hoy, detalle de visita cerrada,
// Mi espacio. Antes cada pantalla tenía su propia copia.
export function useBorrarVisita(opts?: { onBorrada?: () => void }) {
  const queryClient = useQueryClient();
  const [visitaBorrarId, setVisitaBorrarId] = useState<string | null>(null);
  const [previsualizacion, setPrevisualizacion] = useState<PrevisualizacionBorrado | null>(null);
  const previsualizando = useAccionAsync();
  const borrando = useAccionAsync();

  async function pedir(visitaId: string) {
    setVisitaBorrarId(visitaId);
    setPrevisualizacion(null);
    await previsualizando.ejecutar(
      async () => {
        const { data, error } = await supabase
          .rpc('previsualizar_borrado_visita', { p_visita_id: visitaId })
          .single();
        if (error) throw new Error(error.message);
        return data as PrevisualizacionBorrado;
      },
      { onExito: (data) => setPrevisualizacion(data) }
    );
  }

  function cancelar() {
    setVisitaBorrarId(null);
    setPrevisualizacion(null);
    previsualizando.limpiarError();
    borrando.limpiarError();
  }

  async function confirmar() {
    if (!visitaBorrarId) return;
    const rutas = previsualizacion?.rutas_storage ?? [];
    await borrando.ejecutar(
      async () => {
        const { error } = await supabase.rpc('eliminar_visita_completa', { p_visita_id: visitaBorrarId });
        if (error) throw new Error(error.message);
        if (rutas.length) {
          await Promise.all([
            supabase.storage.from('fotos-visita').remove(rutas),
            supabase.storage.from('audios-visita').remove(rutas),
          ]);
        }
      },
      {
        onExito: () => {
          setVisitaBorrarId(null);
          setPrevisualizacion(null);
          // Refrescar todo lo que lista visitas (prefijo, para las claves
          // con clienteId/fecha dentro).
          for (const k of [
            ['visitas-hoy'],
            ['visitas-proximas'],
            ['visitas-atrasadas'],
            ['agenda-planificadas'],
            ['historial-visitas'],
            ['listado-clientes'],
            ['semaforo-cliente'],
            ['num-grupos-duplicados'],
          ]) {
            queryClient.invalidateQueries({ queryKey: k });
          }
          opts?.onBorrada?.();
        },
      }
    );
  }

  return { visitaBorrarId, previsualizacion, previsualizando, borrando, pedir, cancelar, confirmar };
}
