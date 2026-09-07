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
//      Para "volver al origen real" se usa `useVolverA(fallback)` (lib/volver-a).
//
// Regla #14: SIEMPRE una de las dos, obligado por el tipo — no hay salida
// por defecto a "/" (era la causa de "el ← me lleva a Hoy"). Nunca
// `navigate(-1)`: la vuelta del historial es poco fiable aquí.
//
// Aspecto en components.css (.cabecera-detalle*). Ver 08_sistema_diseno.md
// §"Sistema de filas".

type Props = {
  titulo: string;
  /** Segunda línea gris bajo el título (p. ej. "Cliente activo · Hostelería"). */
  subtitulo?: string;
  /** Si se pasa, añade el "?" de ayuda junto al título. Id de `ayuda.ts`. */
  ayuda?: PantallaAyudaId;
  /** Ranura a la derecha: chip de estado, botón de acción… */
  derecha?: ReactNode;
} & (
  | { onVolver: () => void; volverA?: string }
  | { volverA: string; onVolver?: () => void }
);

export function CabeceraDetalle({ titulo, subtitulo, onVolver, volverA, ayuda, derecha }: Props) {
  const navigate = useNavigate();
  const volver = onVolver ?? (() => navigate(volverA!));

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
