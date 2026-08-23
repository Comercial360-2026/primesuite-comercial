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
      const { data: sesion } = await supabase.auth.getSession();
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
    const { data: listener } = supabase.auth.onAuthStateChange(() => cargar());
    return () => {
      activo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { comercial, cargando };
}
