import type { ReactNode } from 'react';
import { Icono, type NombreIcono } from './iconos';

// Cabecera de las 4 pantallas del menú de abajo (Hoy / Clientes / Tareas /
// Yo). Antes cada una ponía un `<h1>` suelto con estilos inline y sin
// icono. Es a las pantallas de nivel 0 lo que `CabeceraDetalle` es a las de
// detalle. Ver 08_sistema_diseno.md §"Cabeceras".

interface CabeceraSeccionProps {
  titulo: string;
  icono: NombreIcono;
  /** Acción o filtro a la derecha del título (opcional). */
  derecha?: ReactNode;
}

export function CabeceraSeccion({ titulo, icono, derecha }: CabeceraSeccionProps) {
  return (
    <header className="cabecera-seccion">
      <span className="cabecera-seccion__icono">
        <Icono nombre={icono} size={22} />
      </span>
      <h1 className="cabecera-seccion__titulo">{titulo}</h1>
      {derecha && <div className="cabecera-seccion__derecha">{derecha}</div>}
    </header>
  );
}
