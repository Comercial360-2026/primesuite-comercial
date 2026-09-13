import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// Cuál es "la visita en curso" a efectos de UI: la ÚLTIMA que abriste. La
// visita en sí vive en Supabase / la cola offline; esto solo decide qué
// visita destaca la app (banner global + tarjeta "En curso" de Hoy) cuando
// tienes varias abiertas a la vez. Se persiste en localStorage para que
// sobreviva a un recargado y para que el banner y la tarjeta NO se
// contradigan (antes la tarjeta cogía la más reciente por fecha y el banner
// la última abierta — podían discrepar).

export interface VisitaEnCurso {
  id: string;
  clienteNombre: string;
}

const CLAVE = 'primesuite-visita-en-curso';

function leer(): VisitaEnCurso | null {
  try {
    const bruto = localStorage.getItem(CLAVE);
    return bruto ? (JSON.parse(bruto) as VisitaEnCurso) : null;
  } catch {
    return null;
  }
}

function guardar(v: VisitaEnCurso | null) {
  try {
    if (v) localStorage.setItem(CLAVE, JSON.stringify(v));
    else localStorage.removeItem(CLAVE);
  } catch {
    // localStorage no disponible (modo privado) — no es crítico.
  }
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
  const [visitaEnCurso, setVisitaEnCurso] = useState<VisitaEnCurso | null>(() => leer());

  const iniciarVisita = useCallback((visita: VisitaEnCurso) => {
    setVisitaEnCurso(visita);
    guardar(visita);
  }, []);

  const cerrarVisita = useCallback(() => {
    setVisitaEnCurso(null);
    guardar(null);
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
