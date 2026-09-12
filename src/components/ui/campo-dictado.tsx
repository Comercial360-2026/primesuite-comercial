import { forwardRef, useImperativeHandle } from 'react';
import type { Dispatch, InputHTMLAttributes, SetStateAction, TextareaHTMLAttributes } from 'react';
import { Icono } from './iconos';
import { useCampoDictado } from '@/hooks/use-campo-dictado';

// Botón de dictado DENTRO del campo (esquina del textarea, o a la derecha
// en un input de una línea) — no un botón aparte debajo, como WhatsApp o el
// micro de un buscador. Mismo lenguaje visual que ya usa "Audio" al grabar
// en la visita (signal-600 + `.rec-dot` con pulso): dictar y grabar son la
// misma idea de "app escuchando" para el usuario.
export interface RefCampoDictado {
  /** Vuelca a texto cualquier frase dicha y aún sin consolidar (frase a
   *  medias cuando se pulsa Guardar) y la devuelve. Llamarlo justo antes
   *  de guardar, en vez de leer el estado directamente. */
  consolidar(): string;
}

function BotonDictado({
  soportado,
  dictando,
  variante,
  onClick,
}: {
  soportado: boolean;
  dictando: boolean;
  variante: 'input' | 'textarea';
  onClick: () => void;
}) {
  if (!soportado) return null;
  return (
    <button
      type="button"
      className={`campo-dictado__btn campo-dictado__btn--${variante}${dictando ? ' campo-dictado__btn--on' : ''}`}
      onClick={onClick}
      aria-pressed={dictando}
      aria-label={dictando ? 'Detener dictado' : 'Dictar'}
      title={dictando ? 'Escuchando… toca para parar' : 'Dictar'}
    >
      <Icono nombre="audio" size={16} weight={dictando ? 'fill' : 'regular'} />
      {dictando && <span className="rec-dot campo-dictado__dot" aria-hidden />}
    </button>
  );
}

function AvisoPermiso({ mostrar }: { mostrar: boolean }) {
  if (!mostrar) return null;
  return (
    <div className="field-error-text">
      Permiso de micrófono denegado. Actívalo en los ajustes del navegador para dictar.
    </div>
  );
}

interface PropsComunes {
  valor: string;
  onCambio: Dispatch<SetStateAction<string>>;
}

type PropsTextarea = PropsComunes &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'style' | 'readOnly'>;

export const TextareaDictado = forwardRef<RefCampoDictado, PropsTextarea>(function TextareaDictado(
  { valor, onCambio, className, ...resto },
  ref
) {
  const d = useCampoDictado(valor, onCambio);
  useImperativeHandle(ref, () => ({ consolidar: d.consolidar }), [d.consolidar]);

  return (
    <div className={`campo-dictado${d.soportado ? ' campo-dictado--con-boton' : ''}`}>
      <textarea
        {...resto}
        className={`field${className ? ` ${className}` : ''}`}
        value={d.valorEnVivo}
        onChange={(e) => onCambio(e.target.value)}
        readOnly={d.readOnly}
      />
      <BotonDictado soportado={d.soportado} dictando={d.dictando} variante="textarea" onClick={d.alternar} />
      <AvisoPermiso mostrar={d.permisoDenegado} />
    </div>
  );
});

type PropsInput = PropsComunes &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'style' | 'readOnly'>;

export const InputDictado = forwardRef<RefCampoDictado, PropsInput>(function InputDictado(
  { valor, onCambio, className, ...resto },
  ref
) {
  const d = useCampoDictado(valor, onCambio);
  useImperativeHandle(ref, () => ({ consolidar: d.consolidar }), [d.consolidar]);

  return (
    <div className={`campo-dictado${d.soportado ? ' campo-dictado--con-boton' : ''}`}>
      <input
        {...resto}
        type="text"
        className={`field${className ? ` ${className}` : ''}`}
        value={d.valorEnVivo}
        onChange={(e) => onCambio(e.target.value)}
        readOnly={d.readOnly}
      />
      <BotonDictado soportado={d.soportado} dictando={d.dictando} variante="input" onClick={d.alternar} />
      <AvisoPermiso mostrar={d.permisoDenegado} />
    </div>
  );
});
