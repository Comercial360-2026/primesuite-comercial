import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// Deslizar una fila hacia la izquierda para revelar UNA acción (en la app,
// "Anular" en la Agenda). Gesto táctil: en escritorio no se arrastra con
// el ratón (la acción sigue en el detalle / en modo seleccionar), así que
// se ignora `pointerType === 'mouse'`.
//
// Bloqueo de eje: hasta que el primer movimiento decide si es horizontal
// o vertical no se mueve nada; si es vertical, se suelta para que el
// scroll de la lista funcione con normalidad.
//
// No hay librería de gestos en el repo — esto es lo mínimo para el caso.

const UMBRAL_EJE = 8; // px antes de decidir horizontal vs vertical
const ARRASTRE_MIN_ABRIR = 0.5; // fracción del ancho de la acción para quedarse abierta

// Una sola fila abierta a la vez: al abrir otra se cierra la anterior.
let laAbierta: { yo: object; cerrar: () => void } | null = null;

interface Opciones {
  /** Ancho en px de la zona de acción que se revela. */
  ancho: number;
  /** Si es `false`, el gesto se ignora (p. ej. en modo seleccionar). */
  activo?: boolean;
}

export function useSwipeFila({ ancho, activo = true }: Opciones) {
  const [dx, setDx] = useState(0);
  const [abierta, setAbierta] = useState(false);
  const inicio = useRef<{ x: number; y: number; base: number } | null>(null);
  const eje = useRef<null | 'x' | 'y'>(null);
  const yo = useRef({});

  function cerrar() {
    setDx(0);
    setAbierta(false);
    if (laAbierta?.yo === yo.current) laAbierta = null;
  }

  // Abierta: un toque fuera de cualquier fila deslizable la cierra.
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest('.fila-swipe')) cerrar();
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierta]);

  function onPointerDown(e: ReactPointerEvent) {
    if (!activo || e.pointerType === 'mouse') return;
    inicio.current = { x: e.clientX, y: e.clientY, base: abierta ? -ancho : 0 };
    eje.current = null;
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!inicio.current) return;
    const ddx = e.clientX - inicio.current.x;
    const ddy = e.clientY - inicio.current.y;

    if (eje.current === null) {
      if (Math.abs(ddx) < UMBRAL_EJE && Math.abs(ddy) < UMBRAL_EJE) return;
      eje.current = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y';
      if (eje.current === 'y') {
        // Gesto vertical: soltar, es scroll de la lista.
        inicio.current = null;
        return;
      }
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }

    // Solo hacia la izquierda (0 = cerrada, -ancho = abierta del todo).
    const siguiente = Math.max(-ancho, Math.min(0, inicio.current.base + ddx));
    setDx(siguiente);
  }

  function onPointerUp() {
    if (inicio.current && eje.current === 'x') {
      const abrir = dx <= -ancho * ARRASTRE_MIN_ABRIR;
      setDx(abrir ? -ancho : 0);
      setAbierta(abrir);
      if (abrir) {
        if (laAbierta && laAbierta.yo !== yo.current) laAbierta.cerrar();
        laAbierta = { yo: yo.current, cerrar };
      }
    }
    inicio.current = null;
    eje.current = null;
  }

  return {
    /** Desplazamiento actual en px (0 … -ancho). */
    dx,
    /** La fila está abierta (acción visible y fijada). */
    abierta,
    /** Cerrar por código (tras ejecutar la acción, o al tocar fuera). */
    cerrar,
    /** Handlers para el elemento arrastrable de la fila. */
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
