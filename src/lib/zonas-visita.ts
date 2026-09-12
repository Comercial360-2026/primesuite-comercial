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

// Zonas ya escritas en ESTA visita (en cualquier nota, hallazgo,
// oportunidad o próximo paso), para poder ELEGIR una en vez de
// reescribirla cada vez — mismo criterio que "zonas usadas" en Anotar
// (visita-activa.tsx), pero leído del servidor: aquí se edita un ítem que
// ya existe, con la visita en curso o ya cerrada, así que no basta con
// mirar la cola offline en memoria.
export async function listarZonasUsadasEnVisita(visitaId: string): Promise<string[]> {
  const [capturas, hallazgos, oportunidades, pasos] = await Promise.all([
    supabase.from('captura_libre').select('zona_texto').eq('visita_id', visitaId),
    supabase.from('hallazgo').select('zona_texto').eq('visita_id', visitaId),
    // La oportunidad no lleva `visita_id` — se cuelga de la visita en la
    // que se detectó vía `visita_origen_id`.
    supabase.from('oportunidad').select('zona_texto').eq('visita_origen_id', visitaId),
    supabase.from('proximo_paso').select('zona_texto').eq('visita_id', visitaId),
  ]);

  const filas = [
    ...(capturas.data ?? []),
    ...(hallazgos.data ?? []),
    ...(oportunidades.data ?? []),
    ...(pasos.data ?? []),
  ] as { zona_texto: string | null }[];

  return deduplicarZonas(filas.map((f) => f.zona_texto));
}
