import type { ReactNode } from 'react';
import { Icono, type NombreIcono } from './iconos';

// Mensaje con jerarquía clara: un icono de forma propia + una etiqueta de
// tipo + el texto. El color refuerza, pero NUNCA es la única señal (el
// usuario es daltónico): la forma del icono y la palabra "ATENCIÓN" /
// "ERROR" / "HECHO" / "INFO" ya dicen de qué va. Ver 08_sistema_diseno.md
// §"Mensajes (Aviso)".
//
// Sustituye a los `<div style={{fontSize:'var(--text-xs)', color:
// 'var(--ink-400)'}}>` sueltos y a los `.field-error-text` cuando el
// mensaje es un aviso de pantalla (no el error corto pegado a un campo).

export type TipoAviso = 'info' | 'atencion' | 'error' | 'exito';

const ICONO: Record<TipoAviso, NombreIcono> = {
  info: 'info',
  atencion: 'atencion',
  error: 'error',
  exito: 'check-circulo',
};

const PALABRA: Record<TipoAviso, string> = {
  info: 'Info',
  atencion: 'Atención',
  error: 'Error',
  exito: 'Hecho',
};

interface AvisoProps {
  tipo?: TipoAviso;
  /** Reemplaza la palabra de tipo por defecto ("Atención"…). */
  titulo?: string;
  children: ReactNode;
}

export function Aviso({ tipo = 'info', titulo, children }: AvisoProps) {
  return (
    <div className={`aviso aviso--${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <span className="aviso__icono">
        <Icono nombre={ICONO[tipo]} size={18} />
      </span>
      <div className="aviso__cuerpo">
        <span className="aviso__etiqueta">{titulo ?? PALABRA[tipo]}</span>
        <span className="aviso__texto">{children}</span>
      </div>
    </div>
  );
}
