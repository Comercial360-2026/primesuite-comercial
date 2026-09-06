import { useState } from 'react';
import { Icono } from './iconos';

// Buscar no ocupa sitio hasta que se usa: por defecto es solo la lupa —
// en la cabecera, junto a la ayuda y el "+" — y al tocarla se abre el
// campo real, con foco automático, en el cuerpo de la pantalla. Sustituye
// al `<input className="field">` permanente que antes vivía siempre
// abierto y vacío encima de cada listado. Mismo criterio en toda la app.
//
// Se usa en dos piezas porque el icono vive en la cabecera (prop `derecha`
// de CabeceraSeccion/CabeceraDetalle) y el campo abierto vive más abajo,
// en el cuerpo — `useBuscador` conecta ambas con el mismo estado.

export function useBuscador(hayValorInicial: boolean) {
  const [abierto, setAbierto] = useState(hayValorInicial);
  return { abierto, abrir: () => setAbierto(true), cerrar: () => setAbierto(false) };
}

interface BotonBuscarProps {
  onClick: () => void;
  etiqueta: string;
}

export function BotonBuscar({ onClick, etiqueta }: BotonBuscarProps) {
  return (
    <button type="button" className="boton-icono" aria-label={etiqueta} title={etiqueta} onClick={onClick}>
      <Icono nombre="buscar" size={18} />
    </button>
  );
}

interface CampoBuscarProps {
  value: string;
  onChange: (valor: string) => void;
  placeholder: string;
  onCerrar: () => void;
}

export function CampoBuscar({ value, onChange, placeholder, onCerrar }: CampoBuscarProps) {
  return (
    <div className="buscador-campo">
      <input
        className="field"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="campo-cerrar"
        aria-label="Cerrar búsqueda"
        title="Cerrar búsqueda"
        onClick={onCerrar}
      >
        <Icono nombre="error" size={16} />
      </button>
    </div>
  );
}
