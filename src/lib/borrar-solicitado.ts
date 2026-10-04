import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { desde } from '@/lib/volver-a';
import { useOnline } from '@/hooks/use-online';
import type { AccionSwipe } from '@/components/ui/fila-navegable';

// «Borrar deslizando»: la fila de una lista navega a la ficha con
// `state={borrarDesde(location)}` y la ficha abre SU confirmación de siempre
// (con sus candados y recuentos) en cuanto está lista. Así el gesto y la
// papelera de la cabecera comparten una sola confirmación.

export function borrarDesde(location: Location) {
  return { ...desde(location), borrar: true };
}

/** Llama a `abrir` una vez cuando se llegó con `borrar` y `listo` es true
 *  (datos cargados y permiso comprobado). Limpia la marca para que recargar
 *  o volver no reabra la confirmación. */
export function useBorrarSolicitado(abrir: () => void, listo: boolean) {
  const location = useLocation();
  const navigate = useNavigate();
  const pedido = (location.state as { borrar?: boolean } | null)?.borrar === true;
  useEffect(() => {
    if (!pedido || !listo) return;
    navigate(location.pathname + location.search, {
      replace: true,
      state: { ...(location.state as object), borrar: false },
    });
    abrir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, listo]);
}

/** Ref para el contenedor de una confirmación: al abrirse se desplaza hasta
 *  verla (la confirmación vive al final de pantallas largas). */
export function useVerAlAbrir<T extends HTMLElement = HTMLDivElement>(abierta: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!abierta || !el) return;
    const ver = () => el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    ver();
    // «Calculando qué se va a borrar…» crece al llegar el recuento: se vuelve a centrar.
    const obs = new ResizeObserver(ver);
    obs.observe(el);
    return () => obs.disconnect();
  }, [abierta]);
  return ref;
}

/** `swipe` para una fila de lista: deslizar y tocar la papelera lleva a la
 *  ficha (`to`) con la confirmación de borrado ya abierta. */
export function useSwipeBorrar() {
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnline();
  return (to: string, etiqueta = 'Borrar'): AccionSwipe => ({
    etiqueta,
    icono: 'borrar',
    tono: 'riesgo',
    desactivada: !online,
    motivo: 'Necesitas conexión para borrar',
    onAccion: () => navigate(to, { state: borrarDesde(location) }),
  });
}
