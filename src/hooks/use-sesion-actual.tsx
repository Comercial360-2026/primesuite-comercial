import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase-client';
import type { Database } from '@/types/database';

type Comercial = Database['public']['Tables']['comercial']['Row'];

const CLAVE_CACHE = 'primesuite-comercial-cache';

function leerComercialCacheado(): Comercial | null {
  try {
    const bruto = localStorage.getItem(CLAVE_CACHE);
    return bruto ? (JSON.parse(bruto) as Comercial) : null;
  } catch {
    return null;
  }
}

function guardarComercialCacheado(comercial: Comercial | null) {
  try {
    if (comercial) {
      localStorage.setItem(CLAVE_CACHE, JSON.stringify(comercial));
    } else {
      localStorage.removeItem(CLAVE_CACHE);
    }
  } catch {
    // localStorage no disponible (modo privado, etc.) — no es crítico,
    // simplemente no sobrevive a un recargado sin red en ese caso.
  }
}

interface SesionActual {
  comercial: Comercial | null;
  cargando: boolean;
}

// Sin contexto compartido, cada uno de los ~30 sitios que necesitan saber
// "quién es el comercial actual" (RequireRole, RequireSession, layout-shell,
// hooks de avisos...) abría su PROPIA suscripción a onAuthStateChange y su
// propia consulta a `comercial` — un evento de auth (refresco de token,
// reconexión) disparaba todas a la vez, y cada guard anidado (p. ej.
// RequireRole dentro de RequireSession) arrancaba de nuevo en `cargando:
// true` aunque el guard exterior ya hubiera resuelto la sesión, causando un
// parpadeo en blanco en cada navegación entre pantallas de Dirección. Un
// único `<SesionActualProvider>` en la raíz resuelve la sesión UNA vez;
// `useSesionActual()` sigue teniendo la misma firma de siempre, así que
// ningún consumidor cambia.
const SesionActualContext = createContext<SesionActual | null>(null);

export function SesionActualProvider({ children }: { children: ReactNode }) {
  const [comercial, setComercial] = useState<Comercial | null>(() => leerComercialCacheado());
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      const { data: sesion, error } = await supabase.auth.getSession();

      // Sin red o error de la propia llamada: se mantiene el último
      // comercial conocido (ya hidratado desde localStorage al arrancar,
      // o el que ya hubiera en memoria si esto ocurre a mitad de sesión)
      // y simplemente se deja de mostrar el estado de carga. "No se pudo
      // verificar por falta de red" no es lo mismo que "no hay sesión".
      if (!navigator.onLine || error) {
        if (activo) setCargando(false);
        return;
      }

      if (!sesion.session) {
        if (activo) {
          setComercial(null);
          setCargando(false);
        }
        guardarComercialCacheado(null);
        return;
      }

      const { data } = await supabase
        .from('comercial')
        .select('*')
        .eq('id', sesion.session.user.id)
        .single();

      if (activo) {
        setComercial(data ?? null);
        setCargando(false);
      }
      guardarComercialCacheado(data ?? null);
    }

    cargar();

    // Solo un SIGNED_OUT explícito debe limpiar la sesión. Otros eventos
    // (incluido un intento de refresco de token fallido) simplemente
    // vuelven a intentar cargar, sin asumir que el comercial cerró sesión.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (activo) {
          setComercial(null);
          setCargando(false);
        }
        guardarComercialCacheado(null);
        return;
      }
      cargar();
    });

    // En cuanto vuelve la conexión, se reintenta verificar la sesión real
    // contra el servidor — así el estado "mantenido por falta de red" no
    // se queda desactualizado indefinidamente.
    function alReconectar() {
      cargar();
    }
    window.addEventListener('online', alReconectar);

    return () => {
      activo = false;
      listener.subscription.unsubscribe();
      window.removeEventListener('online', alReconectar);
    };
  }, []);

  return (
    <SesionActualContext.Provider value={{ comercial, cargando }}>
      {children}
    </SesionActualContext.Provider>
  );
}

// Lee la sesión ya resuelta por <SesionActualProvider>, montado una vez en
// la raíz de la app (main.tsx) — ver 09_arquitectura_tecnica.md §1.
export function useSesionActual(): SesionActual {
  const ctx = useContext(SesionActualContext);
  if (!ctx) {
    throw new Error('useSesionActual() debe usarse dentro de <SesionActualProvider>.');
  }
  return ctx;
}
