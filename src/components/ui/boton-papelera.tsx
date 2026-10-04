import { Icono } from './iconos';

// Papelera de la cabecera de una ficha: abre la confirmación de borrado de
// esa pantalla. Es el acceso sin gesto (ratón, o llegar sin pasar por la lista).
export function BotonPapelera({ etiqueta, onClick, disabled }: { etiqueta: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="boton-icono" aria-label={etiqueta} title={etiqueta} onClick={onClick} disabled={disabled}>
      <Icono nombre="borrar" size={18} />
    </button>
  );
}
