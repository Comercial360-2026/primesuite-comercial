import { supabase } from '@/lib/supabase-client';

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

  const unicas = new Set<string>();
  for (const f of filas) {
    const z = f.zona_texto?.trim();
    if (z) unicas.add(z);
  }
  return [...unicas].sort((a, b) => a.localeCompare(b, 'es'));
}
