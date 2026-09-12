import { supabase } from '@/lib/supabase-client';

// Agrupa ignorando mayúsculas/espacios ("Muelle" y "muelle " son la misma
// zona) para que la lista de chips no se llene de casi-duplicados; se
// conserva la primera grafía vista, no se fuerza a minúsculas. Compartida
// entre esta consulta al servidor y la lista local de visita-activa.tsx —
// mismo criterio en los dos sitios donde se agregan zonas de una visita.
export function deduplicarZonas(valores: (string | null | undefined)[]): string[] {
  const vistas = new Map<string, string>();
  for (const v of valores) {
    const texto = v?.trim();
    if (!texto) continue;
    const clave = texto.toLocaleLowerCase('es');
    if (!vistas.has(clave)) vistas.set(clave, texto);
  }
  return [...vistas.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

// Zonas ya vistas en ESTA visita, para poder ELEGIR una en vez de
// reescribirla cada vez. Lee del catálogo `zona_visita` (migración 100),
// no de un escaneo en caliente de captura_libre/hallazgo/oportunidad/
// proximo_paso: un escaneo en caliente "olvida" una zona en cuanto el
// único registro que la usaba cambia a otra — un comercial que reasigna
// SU hallazgo le borraba la zona a los demás. El catálogo es un apéndice
// (lo rellena un trigger, ver migración 100): una zona, una vez vista, se
// queda en la lista aunque el registro que la introdujo ya no la use.
export async function listarZonasUsadasEnVisita(visitaId: string): Promise<string[]> {
  const { data } = await supabase
    .from('zona_visita')
    .select('zona_texto')
    .eq('visita_id', visitaId);

  return deduplicarZonas((data ?? []).map((f) => f.zona_texto));
}
