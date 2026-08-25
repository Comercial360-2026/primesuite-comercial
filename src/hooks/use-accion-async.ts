import { useCallback, useState } from 'react';

interface EstadoAccionAsync {
  cargando: boolean;
  error: string | null;
}

// Mecanismo común para acciones asíncronas disparadas desde un botón/formulario
// (guardar, encolar, navegar tras confirmar). Extraído del patrón ya validado
// en oportunidad-rapida-modal.tsx ("BUG CORREGIDO": sin try/catch, `guardando`
// quedaba en `true` para siempre si la acción fallaba, sin ningún error visible).
//
// Responsabilidades:
// - Exponer un único estado { cargando, error } para que la UI pueda
//   deshabilitar el control mientras la acción está en curso.
// - Capturar cualquier excepción de la acción y convertirla en un mensaje
//   de error legible, en vez de dejarla sin manejar (evita el fallo silencioso).
// - Ejecutar `onExito` solo si la acción se completó sin lanzar excepción —
//   nunca limpiar/cerrar/navegar de forma optimista antes de esa confirmación.
//
// No decide nada sobre reintentos ni sobre la cola offline — eso sigue siendo
// responsabilidad de use-sync-queue.ts y sync-engine.ts.
export function useAccionAsync() {
  const [estado, setEstado] = useState<EstadoAccionAsync>({ cargando: false, error: null });

  const ejecutar = useCallback(async <T,>(
    accion: () => Promise<T>,
    opciones?: { onExito?: (resultado: T) => void; mensajeError?: string }
  ): Promise<T | undefined> => {
    setEstado({ cargando: true, error: null });
    try {
      const resultado = await accion();
      setEstado({ cargando: false, error: null });
      opciones?.onExito?.(resultado);
      return resultado;
    } catch (err) {
      const mensaje =
        opciones?.mensajeError ??
        (err instanceof Error ? err.message : 'No se pudo completar la acción. Inténtalo de nuevo.');
      setEstado({ cargando: false, error: mensaje });
      return undefined;
    }
  }, []);

  const limpiarError = useCallback(() => setEstado((e) => ({ ...e, error: null })), []);

  const establecerError = useCallback((mensaje: string) => {
    setEstado({ cargando: false, error: mensaje });
  }, []);

  return { cargando: estado.cargando, error: estado.error, ejecutar, limpiarError, establecerError };
}
