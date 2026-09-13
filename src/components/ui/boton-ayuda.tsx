import { useState } from 'react';
import { Modal } from './modal';
import { Icono } from './iconos';
import { Aviso } from './aviso';
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
            <p className="ayuda-respuesta">{entrada.queEs}</p>
            <div className="ayuda-bloque">
              <span className="ayuda-bloque__lb">Cuándo</span>
              <p className="ayuda-bloque__texto">{entrada.cuando}</p>
            </div>
            {entrada.ojo && (
              <Aviso tipo="atencion" titulo="Ojo">
                {entrada.ojo}
              </Aviso>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
