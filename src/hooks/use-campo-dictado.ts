import { useState, type Dispatch, type SetStateAction } from 'react';
import { useDictado } from './use-dictado';

// Generaliza el patrón de acumulación que Anotar ya tenía a mano: lo
// FINAL se suma de verdad al valor del campo, lo PROVISIONAL se enseña en
// vivo sin consolidar (cambia mientras el motor sigue afinando la frase).
// Un solo hook para cualquier campo de texto de la app — antes esta lógica
// solo existía copiada dentro de anotar-hoja.tsx.
export function useCampoDictado(valor: string, setValor: Dispatch<SetStateAction<string>>) {
  const [provisional, setProvisional] = useState('');

  const dictado = useDictado((frag, { final }) => {
    if (final) {
      setValor((v) => (v.trim() ? `${v.trimEnd()} ${frag}` : frag));
      setProvisional('');
    } else {
      setProvisional(frag);
    }
  });

  const valorEnVivo =
    dictado.dictando && provisional ? `${valor.trimEnd()}${valor.trim() ? ' ' : ''}${provisional}` : valor;

  // Si se pulsa "Guardar" con una frase a medias (dicha pero aún sin
  // consolidar por el motor), se vuelca al valor real antes de perderla.
  function consolidar(): string {
    if (provisional.trim()) {
      const v = `${valor.trimEnd()}${valor.trim() ? ' ' : ''}${provisional.trim()}`;
      dictado.parar();
      setValor(v);
      setProvisional('');
      return v;
    }
    return valor;
  }

  return {
    valorEnVivo,
    soportado: dictado.soportado,
    dictando: dictado.dictando,
    permisoDenegado: dictado.permisoDenegado,
    alternar: dictado.alternar,
    // Mientras se enseña lo provisional, el campo no se puede editar a
    // mano sin pisarse con lo que el motor sigue reconociendo.
    readOnly: dictado.dictando && !!provisional,
    consolidar,
  };
}
