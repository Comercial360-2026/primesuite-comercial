import { useEffect, useRef } from 'react';
import { Icono } from '@/components/ui/iconos';

// Visor de fotos a pantalla completa. En móvil una rejilla pequeña no
// sirve para ver el detalle (una barrera, un número de serie): tocar una
// foto la abre aquí, con ‹ ›, deslizar (táctil) y Esc / ×.

interface Foto {
  id: string;
  url: string | null;
  titulo: string | null;
  ubicacion_nombre: string | null;
}

interface Props {
  fotos: Foto[];
  indice: number;
  onCerrar: () => void;
  onCambiar: (nuevoIndice: number) => void;
}

export function VisorFotos({ fotos, indice, onCerrar, onCambiar }: Props) {
  const foto = fotos[indice];
  const inicioX = useRef<number | null>(null);
  const hayAnterior = indice > 0;
  const haySiguiente = indice < fotos.length - 1;

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
      else if (e.key === 'ArrowLeft' && hayAnterior) onCambiar(indice - 1);
      else if (e.key === 'ArrowRight' && haySiguiente) onCambiar(indice + 1);
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [indice, hayAnterior, haySiguiente, onCerrar, onCambiar]);

  if (!foto) return null;

  const pie = [foto.titulo, foto.ubicacion_nombre].filter(Boolean).join(' · ');

  return (
    <div
      className="visor-fotos"
      role="dialog"
      aria-modal="true"
      aria-label="foto"
      onPointerDown={(e) => {
        inicioX.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (inicioX.current == null) return;
        const dx = e.clientX - inicioX.current;
        inicioX.current = null;
        if (Math.abs(dx) < 50) return;
        if (dx > 0 && hayAnterior) onCambiar(indice - 1);
        else if (dx < 0 && haySiguiente) onCambiar(indice + 1);
      }}
    >
      <button type="button" className="visor-fotos__cerrar" onClick={onCerrar} aria-label="cerrar">
        ×
      </button>

      {foto.url ? (
        <img className="visor-fotos__img" src={foto.url} alt={foto.titulo ?? 'foto'} />
      ) : (
        <div className="visor-fotos__nodisp">Foto no disponible</div>
      )}

      <div className="visor-fotos__inferior">
        {pie && <div className="visor-fotos__pie">{pie}</div>}
        <div className="visor-fotos__nav">
          <button type="button" onClick={() => onCambiar(indice - 1)} disabled={!hayAnterior} aria-label="anterior">
            <span className="visor-fotos__flecha-izq">
              <Icono nombre="chevron" size={26} />
            </span>
          </button>
          <span className="visor-fotos__cuenta">
            {indice + 1} / {fotos.length}
          </span>
          <button type="button" onClick={() => onCambiar(indice + 1)} disabled={!haySiguiente} aria-label="siguiente">
            <Icono nombre="chevron" size={26} />
          </button>
        </div>
      </div>
    </div>
  );
}
