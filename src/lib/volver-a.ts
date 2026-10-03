import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';

// Regla #14 del modelo de UI: el ← de una pantalla nunca hace `navigate(-1)`.
// La vuelta natural del historial es poco fiable en esta app — tras
// guardar/borrar puede caer en una ruta muerta pintada con caché
// (p. ej. `/visita/:id/cierre`), y desde el aviso global de visita próxima
// (LayoutShell) puede caer en cualquier pantalla.
//
// En su lugar: quien navega a una pantalla de detalle estampa de dónde
// viene (`state.from`), y el ← vuelve ahí. Si no hay `from` (enlace
// directo, recarga, redirección), se usa el `fallback` fijo y vivo de la
// pantalla.
//
//   Origen:  navigate(destino, { state: desde(location) })
//            <Link to={destino} state={desde(location)} />
//   Destino: const volver = useVolverA('/ruta-fallback');
//            <CabeceraDetalle ... volverA={volver} />
//            // y cualquier navigate(-1) interno → navigate(volver)
//
// Solo hace falta estampar el origen cuando difiere del `fallback` de la
// pantalla de destino (si coincide, el fallback ya acierta).

interface EstadoConOrigen {
  from?: string;
}

// Origen recordado por pantalla (sessionStorage, por ruta sin query). Hace falta porque el ← hace
// `navigate(origen)` SIN estado: si vienes de Lista → Ficha → Proyecto, al volver a la ficha esta llega
// sin `state.from` y su ← caía en el fallback (Clientes «Solo míos») en vez de la lista de la que venías.
// Se guarda cada vez que una pantalla llega CON origen y se usa cuando llega SIN él.
const CLAVE_ORIGENES = 'primesuite-origenes';

function leerOrigenes(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE_ORIGENES) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function recordarOrigen(ruta: string, from: string) {
  try {
    sessionStorage.setItem(CLAVE_ORIGENES, JSON.stringify({ ...leerOrigenes(), [ruta]: from }));
  } catch {
    // sessionStorage no disponible: se usa el fallback, no es crítico.
  }
}

/** Ruta a la que debe volver el ← de esta pantalla: el origen real que
 *  pasó quien navegó aquí, el último origen recordado de esta ruta (al volver
 *  «hacia atrás» a ella sin estado) o el `fallback` fijo de la pantalla. */
export function useVolverA(fallback: string): string {
  const { state, pathname } = useLocation();
  const from = (state as EstadoConOrigen | null)?.from;
  const conOrigen = typeof from === 'string' && from ? from : null;
  useEffect(() => {
    if (conOrigen && conOrigen !== pathname) recordarOrigen(pathname, conOrigen);
  }, [pathname, conOrigen]);
  return conOrigen ?? leerOrigenes()[pathname] ?? fallback;
}

/** El origen a estampar al navegar a una pantalla de detalle:
 *  `navigate(destino, { state: desde(location) })` o, en un `<Link>`,
 *  `state={desde(location)}`. */
export function desde(location: Location): EstadoConOrigen {
  return { from: location.pathname + location.search };
}
