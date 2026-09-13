import { useEffect, useState } from 'react';
import type { PasoTour } from '@/lib/ayuda';

interface TourGuiadoProps {
  paso: PasoTour;
  indice: number;
  total: number;
  onSiguiente: () => void;
  onSaltar: () => void;
}

interface Medidas {
  rect: DOMRect;
  appLeft: number;
  appWidth: number;
}

function medir(id: string): Medidas | null {
  const el = document.querySelector(`[data-tour="${id}"]`);
  if (!el) return null;
  const appEl = document.querySelector('.app-shell');
  const appRect = appEl?.getBoundingClientRect();
  return {
    rect: el.getBoundingClientRect(),
    appLeft: appRect?.left ?? 0,
    appWidth: appRect?.width ?? window.innerWidth,
  };
}

// Coach mark anclado a un elemento real de la pantalla (`data-tour="…"`).
// Sin velo translúcido sobre el resto: la regla del sistema prohíbe
// transparencias sobre color (08_sistema_diseno.md §"Reglas de estilo"), así
// que en vez de oscurecer y recortar un hueco se marca el elemento con un
// anillo opaco (--brand-600) y se ancla al lado una tarjeta sólida — mismo
// lenguaje visual que Modal/Aviso, no un componente nuevo de otro mundo.
// No bloquea el resto de la pantalla: el usuario puede seguir tocando
// debajo (si toca la pestaña señalada, el paso simplemente sigue vigente,
// ver layout-shell.tsx, donde el nav existe en cualquier ruta).
export function TourGuiado({ paso, indice, total, onSiguiente, onSaltar }: TourGuiadoProps) {
  const [medidas, setMedidas] = useState<Medidas | null>(null);

  useEffect(() => {
    const el = document.querySelector(`[data-tour="${paso.id}"]`);
    if (!el) {
      // El elemento señalado no está en esta pantalla (p. ej. se navegó a
      // mitad de tour): no se bloquea al usuario esperando algo que no va
      // a aparecer, se da el tour por terminado.
      onSaltar();
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const actualizar = () => setMedidas(medir(paso.id));
    actualizar();
    window.addEventListener('resize', actualizar);
    return () => window.removeEventListener('resize', actualizar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso.id]);

  if (!medidas) return null;
  const { rect, appLeft, appWidth } = medidas;
  const arriba = rect.top > window.innerHeight / 2;
  const esUltimo = indice === total - 1;

  return (
    <>
      <div
        className="tour-anillo"
        style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
      />
      <div
        className="tour-tarjeta"
        role="dialog"
        aria-label={paso.titulo}
        style={{
          left: appLeft + 16,
          width: appWidth - 32,
          ...(arriba ? { bottom: window.innerHeight - rect.top + 12 } : { top: rect.bottom + 12 }),
        }}
      >
        <p className="tour-tarjeta__titulo">{paso.titulo}</p>
        <p className="tour-tarjeta__texto">{paso.texto}</p>
        <div className="tour-tarjeta__pie">
          <div className="tour-tarjeta__puntos" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`tour-punto${i === indice ? ' tour-punto--activo' : ''}`} />
            ))}
          </div>
          <div className="tour-tarjeta__acciones">
            <button type="button" className="btn btn-secondary btn--compacto" onClick={onSaltar}>
              Saltar
            </button>
            <button type="button" className="btn btn-primary btn--compacto" onClick={onSiguiente}>
              {esUltimo ? 'Entendido' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
