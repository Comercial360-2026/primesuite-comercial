import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import type { Database } from '@/types/database';

type Comercial = Database['public']['Tables']['comercial']['Row'];

// Lee el registro `comercial` correspondiente al usuario autenticado en
// Supabase Auth (comercial.id === auth.users.id, ver 02_auth_rls.sql §1).
// Se resuelve una sola vez por sesión y se mantiene en memoria — las
// políticas RLS ya validan el rol en cada consulta, esto es solo para que
// la UI (bottom nav, RequireRole) sepa qué mostrar sin re-consultar.
export function useSesionActual() {
  const [comercial, setComercial] = useState<Comercial | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      const { data: sesion, error } = await supabase.auth.getSession();

      // BUG CORREGIDO: sin conexión, la renovación en segundo plano del
      // access token puede fallar y getSession() devolver una sesión nula
      // aunque la sesión guardada localmente siga siendo válida — "no se
      // pudo verificar por falta de red" no es lo mismo que "no hay
      // sesión". Antes esto expulsaba al comercial a /login en cuanto
      // perdía cobertura, anulando en la práctica todo el diseño
      // offline-first de la aplicación. Ahora, sin red o ante un error de
      // la propia llamada, se mantiene el último comercial conocido en
      // memoria y simplemente se deja de mostrar el estado de carga.
      if (!navigator.onLine || error) {
        if (activo) setCargando(false);
        return;
      }

      if (!sesion.session) {
        if (activo) {
          setComercial(null);
          setCargando(false);
        }
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
