import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { BUCKETS_VISITA } from '@/lib/buckets-visita';

// Tamaño real (no estimado) de las fotos + audios + documentos de una visita,
// listando los buckets de adjuntos por el prefijo `${visitaId}/` que usa sync-engine.ts al
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
      const listados = await Promise.all(BUCKETS_VISITA.map((b) => supabase.storage.from(b).list(visitaId)));
      if (cancelado) return;
      if (listados.some((l) => l.error)) {
        setError(true);
        return;
      }
      const total = listados
        .flatMap((l) => l.data ?? [])
        .reduce((suma, f) => suma + (f.metadata?.size ?? 0), 0);
      setBytes(total);
    })();
    return () => {
      cancelado = true;
    };
  }, [visitaId]);

  return { bytes, error };
}
