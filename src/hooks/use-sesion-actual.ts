import { useEffect, useState } from 'react';
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

// Lee el registro `comercial` correspondiente al usuario autenticado en
// Supabase Auth (comercial.id === auth.users.id, ver 02_auth_rls.sql §1).
// Se resuelve una sola vez por sesión y se mantiene en memoria — las
// políticas RLS ya validan el rol en cada consulta, esto es solo para que
// la UI (bottom nav, RequireRole) sepa qué mostrar sin re-consultar.
export function useSesionActual() {
  // BUG CORREGIDO: el estado en memoria (useState) no sobrevive a un
  // recargado completo de la página — si eso pasa sin conexión (frecuente
  // al activar modo avión, o si el móvil mata la pestaña), el comercial
  // volvía a null en el arranque y no había red para recuperarlo, expulsando
  // a /login pese a tener una sesión guardada válida. Se hidrata el estado
  // inicial desde una copia en localStorage, actualizada en cada carga con
  // éxito, para que el arranque en frío sin red no se quede sin nada.
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

  return { comercial, cargando };
}
