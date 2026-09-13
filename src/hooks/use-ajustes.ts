import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

// Ajustes globales de la app (tabla `ajustes_app`, migración 113): todos
// leen, solo Dirección Comercial escribe (RLS). Cada ajuste es su propia
// query, con la clave literal como parte de la queryKey para que cambiar
// uno no invalide (ni comparta caché con) otro.

export const CLAVE_CLASIFICACION_DETALLADA = 'clasificacion_detallada';

async function leerAjusteBooleano(clave: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('ajustes_app')
    .select('valor')
    .eq('clave', clave)
    .maybeSingle();
  if (error) throw error;
  return data?.valor ?? false;
}

// "Clasificación detallada": si está encendido, Hallazgo/Oportunidad/Anotar
// dejan elegir término o modelo del catálogo además de la categoría entera
// (SelectorAreas); apagado (también mientras carga o sin conexión) es el
// selector simple de solo categoría (SelectorCategorias) — el valor por
// defecto más seguro, nunca deja a alguien clasificando más fino sin que
// Dirección lo haya activado.
export function useClasificacionDetallada(): boolean {
  const { data } = useQuery({
    queryKey: ['ajuste', CLAVE_CLASIFICACION_DETALLADA],
    queryFn: () => leerAjusteBooleano(CLAVE_CLASIFICACION_DETALLADA),
  });
  return data ?? false;
}
