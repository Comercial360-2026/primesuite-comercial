import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';

// Al volver (←) de una ficha a la lista de la que venías, la pantalla se monta de nuevo y empezaba arriba: en
// una visita con decenas de capturas, tocabas una nota, la editabas y perdías el sitio. Aquí se recuerda el
// scroll de cada pantalla (sessionStorage, por ruta+query) y se restaura SOLO al volver al origen que la pantalla
// anterior estampó (`state.from`, ver volver-a.ts). Llegar de otra forma empieza arriba, como siempre.
const PREFIJO = 'scroll:';
const clave = (l: Location) => l.pathname + l.search;
// La mayoría de pantallas scrollean en .screen__scroll (las «split»); el resto, en el contenedor del shell.
const contenedor = () => document.querySelector<HTMLElement>('.screen__scroll') ?? document.querySelector<HTMLElement>('.app-shell__content');

export function useRestaurarScroll() {
  const location = useLocation();
  const actual = useRef(clave(location));
  const previa = useRef<Location | null>(null);

  useEffect(() => {
    const alScrollear = (e: Event) => {
      if (e.target !== contenedor()) return;
      try {
        sessionStorage.setItem(PREFIJO + actual.current, String(Math.round((e.target as HTMLElement).scrollTop)));
      } catch {
        /* sin sessionStorage: no se recuerda */
      }
    };
    document.addEventListener('scroll', alScrollear, true);
    return () => document.removeEventListener('scroll', alScrollear, true);
  }, []);

  useEffect(() => {
    const k = clave(location);
    actual.current = k;
    const anterior = previa.current;
    previa.current = location;
    const volviendo = !!anterior && (anterior.state as { from?: string } | null)?.from === k;
    if (!volviendo) {
      try {
        sessionStorage.removeItem(PREFIJO + k);
      } catch {
        /* nada */
      }
      return;
    }
    let y = 0;
    try {
      y = Number(sessionStorage.getItem(PREFIJO + k) ?? 0);
    } catch {
      /* nada */
    }
    if (!y) return;
    // El contenido llega por consultas: se reintenta hasta que la pantalla ya mide lo bastante (máx. ~3 s).
    let frames = 0;
    let id = 0;
    const intentar = () => {
      const el = contenedor();
      if (el && el.scrollHeight - el.clientHeight >= y) {
        el.scrollTop = y;
        return;
      }
      if (++frames < 180) id = requestAnimationFrame(intentar);
    };
    id = requestAnimationFrame(intentar);
    return () => cancelAnimationFrame(id);
  }, [location]);
}
