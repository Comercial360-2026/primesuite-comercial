import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { uuid } from '@/lib/uuid';
import {
  encolarOperacion,
  obtenerUbicacionesPorCliente,
  procesarCola,
} from '@/lib/offline-queue';
import type { OperacionPendiente } from '@/lib/offline-queue/types';

export interface UbicacionSeleccionable {
  id: string;
  nombre: string;
  sincronizada: boolean;
}

// Ubicación es la única entidad "de cliente" (no de visita) que pasa por la
// cola offline — ver comentario en types.ts. Por eso este hook, a
// diferencia de useSyncQueue, combina DOS fuentes:
//  1) el servidor (vía TanStack Query) — para que ubicaciones creadas en
//     otra sesión, otro dispositivo, u otro comercial, aparezcan también;
//  2) la cola local (vía obtenerUbicacionesPorCliente) — para que una
//     ubicación creada hace un segundo, todavía sin conexión, se pueda
//     seleccionar y usar de inmediato sin esperar a que sincronice.
// Se deduplica por id (el id se genera en cliente y se reutiliza como PK
// real al sincronizar, mismo patrón que el resto de la cola).
export function useUbicacionesCliente(clienteId: string | undefined, comercialId: string) {
  const queryClient = useQueryClient();
  const [locales, setLocales] = useState<OperacionPendiente<'ubicacion'>[]>([]);

  const recargarLocales = useCallback(async () => {
    if (!clienteId) {
      setLocales([]);
      return;
    }
    setLocales(await obtenerUbicacionesPorCliente(clienteId));
  }, [clienteId]);

  useEffect(() => {
    void recargarLocales();
  }, [recargarLocales]);

  const { data: remotas = [] } = useQuery({
    queryKey: ['ubicaciones-cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<{ id: string; nombre: string }[]> => {
      const { data, error } = await supabase
        .from('ubicacion')
        .select('id, nombre')
        .eq('cliente_id', clienteId!)
        .order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });

  const ubicaciones = useMemo<UbicacionSeleccionable[]>(() => {
    const mapa = new Map<string, UbicacionSeleccionable>();
    for (const r of remotas) {
      mapa.set(r.id, { id: r.id, nombre: r.nombre, sincronizada: true });
    }
    for (const l of locales) {
      if (!mapa.has(l.id)) {
        mapa.set(l.id, {
          id: l.id,
          nombre: l.payload.nombre,
          sincronizada: l.estado === 'completado',
        });
      }
    }
    return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [remotas, locales]);

  const crear = useCallback(
    async (nombre: string): Promise<UbicacionSeleccionable> => {
      if (!clienteId) throw new Error('Falta el cliente para crear la ubicación.');
      const id = uuid();
      await encolarOperacion({
        id,
        entidad: 'ubicacion',
        payload: { clienteId, nombre },
        estado: 'pendiente',
        intentos: 0,
        creadoEn: new Date().toISOString(),
      } as unknown as OperacionPendiente);
      await recargarLocales();
      // Intento inmediato si hay red — si no la hay, procesarCola() no hace
      // nada y el motor periódico se encarga, igual que el resto de la cola.
      void procesarCola().then(() => {
        void recargarLocales();
        void queryClient.invalidateQueries({ queryKey: ['ubicaciones-cliente', clienteId] });
      });
      return { id, nombre, sincronizada: false };
    },
    [clienteId, comercialId, recargarLocales, queryClient]
  );

  return { ubicaciones, crear, recargarLocales };
}
