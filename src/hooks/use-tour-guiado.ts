import { useCallback, useEffect, useState } from 'react';
import type { PasoTour } from '@/lib/ayuda';

function clave(idTour: string, comercialId: string) {
  return `primesuite-tour-${idTour}:${comercialId}`;
}

function yaVisto(idTour: string, comercialId: string): boolean {
  try {
    return localStorage.getItem(clave(idTour, comercialId)) === '1';
  } catch {
    // Sin localStorage (modo privado…): no insistir con el tour en cada
    // carga, mejor no mostrarlo a que se repita sin parar.
    return true;
  }
}

function marcarVisto(idTour: string, comercialId: string) {
  try {
    localStorage.setItem(clave(idTour, comercialId), '1');
  } catch {
    // No es crítico: el tour simplemente volverá a salir la próxima carga.
  }
}

// Motor genérico de un tour guiado de coach marks secuenciales. No sabe de
// contenido (eso lo dan los `pasos`, de ayuda.ts): solo decide si debe
// arrancar solo (primera vez para este comercial) y controla en qué paso
// va. `reiniciar` es lo que usa "Ver guía rápida" en Yo para repetirlo.
export function useTourGuiado(idTour: string, comercialId: string | undefined, pasos: PasoTour[]) {
  const [indice, setIndice] = useState(0);
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    if (!comercialId || pasos.length === 0) return;
    if (!yaVisto(idTour, comercialId)) {
      setIndice(0);
      setActivo(true);
    }
    // Solo al montar / si cambia de comercial o de tour — no cuando cambian
    // los `pasos` (es un array literal nuevo en cada render del padre).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idTour, comercialId]);

  const terminar = useCallback(() => {
    setActivo(false);
    if (comercialId) marcarVisto(idTour, comercialId);
  }, [idTour, comercialId]);

  const siguiente = useCallback(() => {
    setIndice((i) => {
      if (i + 1 >= pasos.length) {
        terminar();
        return i;
      }
      return i + 1;
    });
  }, [pasos.length, terminar]);

  const reiniciar = useCallback(() => {
    setIndice(0);
    setActivo(true);
  }, []);

  return {
    activo,
    paso: activo ? (pasos[indice] ?? null) : null,
    indice,
    total: pasos.length,
    siguiente,
    saltar: terminar,
    reiniciar,
  };
}
