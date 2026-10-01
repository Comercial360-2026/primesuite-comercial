import { useCallback, useState } from 'react';
import type { PasoTour } from '@/lib/ayuda';

function clave(idTour: string, comercialId: string) {
  return `primesuite-tour-${idTour}:${comercialId}`;
}

function marcarVisto(idTour: string, comercialId: string) {
  try {
    localStorage.setItem(clave(idTour, comercialId), '1');
  } catch {
    // No es crítico: el tour simplemente volverá a salir la próxima carga.
  }
}

// Motor genérico de un tour guiado de coach marks secuenciales. No sabe de
// contenido (eso lo dan los `pasos`, de ayuda.ts): controla en qué paso va.
// Ya NO arranca solo al entrar; solo se lanza con `reiniciar`
// ("Ver guía rápida" en Yo).
export function useTourGuiado(idTour: string, comercialId: string | undefined, pasos: PasoTour[]) {
  const [indice, setIndice] = useState(0);
  const [activo, setActivo] = useState(false);

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
