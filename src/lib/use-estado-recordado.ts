import { useCallback, useState } from 'react';

// useState que sobrevive a ir a una ficha y volver (la pantalla se desmonta al navegar): el valor se guarda
// en sessionStorage bajo `clave` (con ids dentro si depende de una visita/proyecto). Para vistas, NO para datos:
// «Zona/Tipo», «Ver todas», «Ver inactivos». Los filtros de una lista siguen yendo en la URL (CLAUDE.md).
export function useEstadoRecordado<T>(clave: string, inicial: T): [T, (v: T) => void] {
  const [valor, setValorEstado] = useState<T>(() => {
    try {
      const guardado = sessionStorage.getItem(`estado:${clave}`);
      return guardado === null ? inicial : (JSON.parse(guardado) as T);
    } catch {
      return inicial;
    }
  });
  const setValor = useCallback(
    (v: T) => {
      setValorEstado(v);
      try {
        sessionStorage.setItem(`estado:${clave}`, JSON.stringify(v));
      } catch {
        /* sin sessionStorage: solo no se recuerda */
      }
    },
    [clave]
  );
  return [valor, setValor];
}
