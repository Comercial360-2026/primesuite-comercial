import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// Estado de UI efímero (no persiste más allá de la sesión de la app) —
// coherente con la capa 3 de gestión de estado definida en
// 09_arquitectura_tecnica.md §1. La visita en sí vive en Supabase / la cola
// offline; esto solo controla si el banner "visita en curso" se muestra.

export interface VisitaEnCurso {
  id: string;
  clienteNombre: string;
}

interface VisitaActivaContextValue {
  visitaEnCurso: VisitaEnCurso | null;
  iniciarVisita: (visita: VisitaEnCurso) => void;
  cerrarVisita: () => void;
}

export const VisitaActivaContext = createContext<VisitaActivaContextValue>({
  visitaEnCurso: null,
  iniciarVisita: () => {},
  cerrarVisita: () => {},
});

export function VisitaActivaProvider({ children }: { children: ReactNode }) {
  const [visitaEnCurso, setVisitaEnCurso] = useState<VisitaEnCurso | null>(null);

  const iniciarVisita = useCallback((visita: VisitaEnCurso) => {
    setVisitaEnCurso(visita);
  }, []);

  const cerrarVisita = useCallback(() => {
    setVisitaEnCurso(null);
  }, []);

  return (
    <VisitaActivaContext.Provider value={{ visitaEnCurso, iniciarVisita, cerrarVisita }}>
      {children}
    </VisitaActivaContext.Provider>
  );
}

export function useVisitaActivaContext() {
  return useContext(VisitaActivaContext);
}
