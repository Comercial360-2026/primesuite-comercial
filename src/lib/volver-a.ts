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

/** Ruta a la que debe volver el ← de esta pantalla: el origen real que
 *  pasó quien navegó aquí, o el `fallback` fijo de la pantalla. */
export function useVolverA(fallback: string): string {
  const { state } = useLocation();
  const from = (state as EstadoConOrigen | null)?.from;
  return typeof from === 'string' && from ? from : fallback;
}

/** El origen a estampar al navegar a una pantalla de detalle:
 *  `navigate(destino, { state: desde(location) })` o, en un `<Link>`,
 *  `state={desde(location)}`. */
export function desde(location: Location): EstadoConOrigen {
  return { from: location.pathname + location.search };
}
