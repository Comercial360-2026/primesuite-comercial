import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icono } from './iconos';
import { BotonAyuda } from './boton-ayuda';
import type { PantallaAyudaId } from '@/lib/ayuda';

// La fila "‹ Título" de las pantallas de detalle. Sustituye al
// `<button>←</button>` + `<h1>` copiado a mano en ~13 pantallas
// (agenda, ficha de cliente, Mi espacio, los detalle-*, vocabulario…).
// Restyle de la cabecera = este archivo, no pantalla por pantalla.
//
// Vuelta atrás, en orden de prioridad:
//   1. `onVolver`  — la pantalla decide (p. ej. si hay un panel de
//      confirmación abierto, cerrarlo en vez de salir).
//   2. `volverA`   — navegar a una ruta fija (ficha de cliente → /clientes).
//                    Regla #14: SIEMPRE una de las dos. Para "volver al
//                    origen real" se usa `useVolverA(fallback)` (lib/volver-a).
//   3. por defecto — `/` (Hoy). Nunca `navigate(-1)` (regla #14): la vuelta
//      del historial es poco fiable aquí. Si se llega a este caso es que la
//      pantalla no pasó `onVolver` ni `volverA` — se avisa en desarrollo.
//
// Aspecto en components.css (.cabecera-detalle*). Ver 08_sistema_diseno.md
// §"Sistema de filas".

interface Props {
  titulo: string;
  /** Segunda línea gris bajo el título (p. ej. "Cliente activo · Hostelería"). */
  subtitulo?: string;
  /** Acción de volver a medida. Tiene prioridad sobre `volverA`. */
  onVolver?: () => void;
  /** Ruta fija a la que volver en vez de `navigate(-1)`. */
  volverA?: string;
  /** Si se pasa, añade el "?" de ayuda junto al título. Id de `ayuda.ts`. */
  ayuda?: PantallaAyudaId;
  /** Ranura a la derecha: chip de estado, botón de acción… */
  derecha?: ReactNode;
}

export function CabeceraDetalle({ titulo, subtitulo, onVolver, volverA, ayuda, derecha }: Props) {
  const navigate = useNavigate();
  const volver =
    onVolver ??
    (() => {
      if (volverA) {
        navigate(volverA);
        return;
      }
      if (import.meta.env.DEV) {
        console.warn(
          `[CabeceraDetalle] "${titulo}" sin onVolver ni volverA — el ← cae a "/" (regla #14). Pásale un destino.`
        );
      }
      navigate('/');
    });

  return (
    <header className="cabecera-detalle">
      <button
        type="button"
        className="cabecera-detalle__volver"
        onClick={volver}
        aria-label="Volver"
      >
        <Icono nombre="atras" size={22} />
      </button>
      <div className="cabecera-detalle__texto">
        <h1 className="cabecera-detalle__titulo">{titulo}</h1>
        {subtitulo && <p className="cabecera-detalle__subtitulo">{subtitulo}</p>}
      </div>
      {ayuda && <BotonAyuda pantalla={ayuda} />}
      {derecha && <div className="cabecera-detalle__derecha">{derecha}</div>}
    </header>
  );
}
