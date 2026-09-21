import { useEffect, type RefObject } from 'react';

const SELECTOR_FOCABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportamiento de foco de cualquier panel modal (Modal/HojaSuperior):
 * al abrir, mueve el foco dentro del panel; mientras está abierto, atrapa
 * el Tab para que no se escape al contenido de detrás (que sigue en el DOM);
 * al cerrar, devuelve el foco a quien lo abrió. Sin esto, cualquier usuario
 * de teclado o lector de pantalla pierde su posición en cada hoja/modal de
 * la app (cae a document.body).
 */
export function useAtraparFoco(cajaRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const elementoPrevio = document.activeElement as HTMLElement | null;
    cajaRef.current?.focus();

    function alTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const caja = cajaRef.current;
      if (!caja) return;
      const focables = caja.querySelectorAll<HTMLElement>(SELECTOR_FOCABLE);
      if (!focables.length) return;
      const primero = focables[0];
      const ultimo = focables[focables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener('keydown', alTab);

    return () => {
      document.removeEventListener('keydown', alTab);
      elementoPrevio?.focus?.();
    };
  }, [cajaRef]);
}
