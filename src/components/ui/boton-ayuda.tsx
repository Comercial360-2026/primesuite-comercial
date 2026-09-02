import { useState } from 'react';
import { Modal } from './modal';
import { Icono } from './iconos';
import { PANTALLAS, type PantallaAyudaId } from '@/lib/ayuda';

interface Props {
  /** Id de la entrada en `ayuda.ts`. Solo se aceptan claves existentes:
   *  escribir mal el id o borrar la entrada rompe el `typecheck`. */
  pantalla: PantallaAyudaId;
}

// El "?" que sale en la cabecera de una pantalla que tiene entrada en
// `ayuda.ts`. Al pulsarlo abre un Modal (el que ya usa el resto de la app)
// con "qué es / cuándo se usa / ojo". Toda la lógica del diálogo vive aquí
// para que CabeceraSeccion y CabeceraDetalle solo pasen `ayuda="<id>"`.
export function BotonAyuda({ pantalla }: Props) {
  const [abierto, setAbierto] = useState(false);
  const entrada = PANTALLAS[pantalla];

  return (
    <>
      <button
        type="button"
        className="boton-ayuda"
        onClick={() => setAbierto(true)}
        aria-label={`Ayuda: ${entrada.titulo}`}
      >
        <Icono nombre="ayuda" size={20} />
      </button>
      {abierto && (
        <Modal titulo={entrada.titulo} onCerrar={() => setAbierto(false)}>
          <div className="ayuda-modal">
            <p>{entrada.queEs}</p>
            <p className="ayuda-modal__bloque">
              <span className="ayuda-modal__lb">Cuándo</span>
              {entrada.cuando}
            </p>
            {entrada.ojo && (
              <p className="ayuda-modal__bloque ayuda-modal__bloque--ojo">
                <span className="ayuda-modal__lb">Ojo</span>
                {entrada.ojo}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
