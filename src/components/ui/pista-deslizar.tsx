import { useState } from 'react';
import { Aviso } from './aviso';

const CLAVE = 'pista-deslizar-vista';
const leer = () => {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
};

// Aviso de una sola vez: enseña el gesto de deslizar la fila. Se quita con «Entendido».
export function PistaDeslizar() {
  const [vista, setVista] = useState(leer);
  if (vista) return null;
  return (
    <Aviso tipo="info">
      Desliza una fila a la izquierda para marcar como inactivo o borrar.{' '}
      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginTop: 8 }}
        onClick={() => {
          try {
            localStorage.setItem(CLAVE, '1');
          } catch {
            /* sin almacenamiento: volverá a salir */
          }
          setVista(true);
        }}
      >
        Entendido
      </button>
    </Aviso>
  );
}
