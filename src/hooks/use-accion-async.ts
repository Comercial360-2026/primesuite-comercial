import { useCallback, useEffect, useRef, useState } from 'react';

interface EstadoAccionAsync {
  cargando: boolean;
  error: string | null;
  tardando: boolean;
}

// A los 8 s sin terminar, la acción se marca como "tardando". En campo, un
// botón bloqueado en "Guardando…" sin ninguna otra señal parece colgado —
// esto deja que la UI avise de que sigue viva pero la red va lenta.
const MS_HASTA_TARDANDO = 8_000;

// Mecanismo común para acciones asíncronas disparadas desde un botón/formulario
// (guardar, encolar, navegar tras confirmar). Extraído del patrón ya validado
// en oportunidad-rapida-modal.tsx ("BUG CORREGIDO": sin try/catch, `guardando`
// quedaba en `true` para siempre si la acción fallaba, sin ningún error visible).
//
// Responsabilidades:
// - Exponer un único estado { cargando, error, tardando } para que la UI pueda
//   deshabilitar el control mientras la acción está en curso y avisar si se
//   está alargando por mala conexión.
// - Capturar cualquier excepción de la acción y convertirla en un mensaje
//   de error legible, en vez de dejarla sin manejar (evita el fallo silencioso).
// - Ejecutar `onExito` solo si la acción se completó sin lanzar excepción —
//   nunca limpiar/cerrar/navegar de forma optimista antes de esa confirmación.
//
// No decide nada sobre reintentos, timeouts ni sobre la cola offline — eso
// sigue siendo responsabilidad de use-sync-queue.ts y sync-engine.ts. `tardando`
// es solo un aviso visual: no cancela la acción.
export function useAccionAsync() {
  const [estado, setEstado] = useState<EstadoAccionAsync>({ cargando: false, error: null, tardando: false });
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pararTemporizador = useCallback(() => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  }, []);

  // Si la pantalla se desmonta con una acción en curso (típico: `onExito`
  // navega a otra ruta), el timer pendiente no debe dispararse después.
  useEffect(() => pararTemporizador, [pararTemporizador]);

  const ejecutar = useCallback(async <T,>(
    accion: () => Promise<T>,
    opciones?: { onExito?: (resultado: T) => void; mensajeError?: string | ((err: unknown) => string) }
  ): Promise<T | undefined> => {
    pararTemporizador();
    setEstado({ cargando: true, error: null, tardando: false });
    temporizador.current = setTimeout(() => {
      setEstado((e) => (e.cargando ? { ...e, tardando: true } : e));
    }, MS_HASTA_TARDANDO);
    try {
      const resultado = await accion();
      pararTemporizador();
      setEstado({ cargando: false, error: null, tardando: false });
      opciones?.onExito?.(resultado);
      return resultado;
    } catch (err) {
      pararTemporizador();
      const mensaje =
        typeof opciones?.mensajeError === 'function'
          ? opciones.mensajeError(err)
          : (opciones?.mensajeError ??
            (err instanceof Error ? err.message : 'No se pudo completar la acción. Inténtalo de nuevo.'));
      setEstado({ cargando: false, error: mensaje, tardando: false });
      return undefined;
    }
  }, [pararTemporizador]);

  const limpiarError = useCallback(() => setEstado((e) => ({ ...e, error: null })), []);

  const establecerError = useCallback((mensaje: string) => {
    pararTemporizador();
    setEstado({ cargando: false, error: mensaje, tardando: false });
  }, [pararTemporizador]);

  return {
    cargando: estado.cargando,
    error: estado.error,
    tardando: estado.tardando,
    ejecutar,
    limpiarError,
    establecerError,
  };
}
