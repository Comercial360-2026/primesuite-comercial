import { useEffect, useState } from 'react';
import { obtenerOperacion } from '@/lib/offline-queue';
import type { VisitaPayload } from '@/lib/offline-queue/types';
import { supabase } from '@/lib/supabase-client';

interface VisitaLocalMinima {
  clienteId: string;
}

// BUG CORREGIDO (reportado en validación funcional real): la visita puede
// no existir en la cola local de IndexedDB — no solo por estar offline, sino
// porque puede haberse creado por otra vía (SQL/RPC directa, otro
// dispositivo, o cualquier origen que no pasó por encolarOperacion en este
// navegador). El código anterior solo miraba IndexedDB y, si no encontraba
// nada, se quedaba en `null` para siempre sin avisar — causando que
// Oportunidad rápida (y cualquier lógica dependiente de clienteId) fallara
// en silencio: sin error, sin petición de red, sin explicación.
//
// Ahora: intenta local primero (rápido, funciona offline); si no hay nada,
// resuelve contra Supabase directamente como fallback.
export function useVisitaLocal(visitaId: string | undefined) {
  const [datos, setDatos] = useState<VisitaLocalMinima | null>(null);

  useEffect(() => {
    if (!visitaId) return;
    let cancelado = false;

    async function resolver() {
      const op = await obtenerOperacion(visitaId!);
      if (op?.entidad === 'visita') {
        const payload = op.payload as VisitaPayload;
        if (!cancelado) setDatos({ clienteId: payload.clienteId });
        return;
      }

      // Fallback: no hay registro local — consulta Supabase directamente.
      const { data, error } = await supabase
        .from('visita')
        .select('cliente_id')
        .eq('id', visitaId!)
        .single();

      if (!cancelado) {
        if (error || !data) {
          // eslint-disable-next-line no-console
          console.error(`No se pudo resolver la visita ${visitaId}: ni local ni en Supabase.`, error);
          setDatos(null);
        } else {
          setDatos({ clienteId: data.cliente_id });
        }
      }
    }

    void resolver();
    return () => {
      cancelado = true;
    };
  }, [visitaId]);

  return datos;
}
