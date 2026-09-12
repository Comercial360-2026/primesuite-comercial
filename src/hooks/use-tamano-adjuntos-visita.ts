import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';

// Tamaño real (no estimado) de las fotos + audios de una visita, listando
// los dos buckets por el prefijo `${visitaId}/` que usa sync-engine.ts al
// subirlos. Se usa para mostrar "vas a liberar X MB" ANTES de generar el
// zip completo (que además lleva el PDF).
export function useTamanoAdjuntosVisita(visitaId: string | undefined) {
  const [bytes, setBytes] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setBytes(null);
    setError(false);
    if (!visitaId) return;
    let cancelado = false;
    (async () => {
      const [fotos, audios] = await Promise.all([
        supabase.storage.from('fotos-visita').list(visitaId),
        supabase.storage.from('audios-visita').list(visitaId),
      ]);
      if (cancelado) return;
      if (fotos.error || audios.error) {
        setError(true);
        return;
      }
      const total = [...(fotos.data ?? []), ...(audios.data ?? [])].reduce(
        (suma, f) => suma + (f.metadata?.size ?? 0),
        0
      );
      setBytes(total);
    })();
    return () => {
      cancelado = true;
    };
  }, [visitaId]);

  return { bytes, error };
}
