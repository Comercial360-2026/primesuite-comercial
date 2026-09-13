import { createContext, useContext } from 'react';

// El tour de bienvenida (TOUR_NAVEGACION) vive en LayoutShell, que envuelve
// TODAS las rutas — no en Yo. "Ver guía rápida" (fila en Yo) necesita poder
// relanzarlo desde ahí, así que LayoutShell expone su `reiniciar` por
// contexto en vez de duplicar el motor del tour en dos sitios.
interface TourNavegacionContextValue {
  reiniciar: () => void;
}

export const TourNavegacionContext = createContext<TourNavegacionContextValue>({
  reiniciar: () => {},
});

export function useTourNavegacionControl() {
  return useContext(TourNavegacionContext);
}
