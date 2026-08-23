import { useCallback, useEffect, useState } from 'react';
import {
  encolarOperacion,
  obtenerPorVisita,
  procesarCola,
} from '@/lib/offline-queue';
import type { OperacionPendiente, EntidadSincronizable, PayloadPorEntidad } from '@/lib/offline-queue/types';

// Puente entre la cola offline y React. La UI (Visita activa, Cierre de
// visita) nunca sabe si un registro ya está en Supabase o todavía en cola
// local — solo lee `estado` de cada operación, igual que se especificó en
// 09_arquitectura_tecnica.md §1 ("la UI no distingue la fuente").
export function useSyncQueue(visitaId: string | undefined) {
  const [operaciones, setOperaciones] = useState<OperacionPendiente[]>([]);

  const recargar = useCallback(async () => {
    if (!visitaId) return;
    const datos = await obtenerPorVisita(visitaId);
    setOperaciones(datos);
  }, [visitaId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const encolar = useCallback(
    async <E extends EntidadSincronizable>(
      id: string,
      entidad: E,
      payload: PayloadPorEntidad[E],
      opciones?: { dependeDe?: string; archivoLocal?: Blob }
    ) => {
      // El objeto se construye correctamente para cualquier E concreto, pero
      // TypeScript no puede verificar la unión discriminada resultante desde
      // un parámetro de tipo genérico en este punto de la llamada — el cast
      // es seguro porque entidad/payload provienen del mismo par <E, PayloadPorEntidad[E]>.
      await encolarOperacion({
        id,
        entidad,
        payload,
        dependeDe: opciones?.dependeDe,
        archivoLocal: opciones?.archivoLocal,
        estado: 'pendiente',
        intentos: 0,
        creadoEn: new Date().toISOString(),
      } as unknown as OperacionPendiente);
      await recargar();
      // Intento inmediato si hay red — si no la hay, procesarCola() no hace
      // nada (comprueba navigator.onLine) y el motor periódico se encarga.
      void procesarCola().then(() => recargar());
    },
    [recargar]
  );

  return { operaciones, encolar, recargar };
}
