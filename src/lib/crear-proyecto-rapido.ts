import { supabase } from '@/lib/supabase-client';
import { uuid } from '@/lib/uuid';
import type { useSyncQueue } from '@/hooks/use-sync-queue';

type Encolar = ReturnType<typeof useSyncQueue>['encolar'];

// Crea un proyecto para un cliente y devuelve su id. Un solo sitio para
// esto: lo usan el «+ Nuevo proyecto» de la ficha de cliente y el que sale
// al elegir proyecto para una visita. Con red: INSERT directo. Sin red: se
// encola (entidad 'proyecto') y se sincroniza luego, igual que el alta de
// cliente.
export async function crearProyectoRapido(
  clienteId: string,
  nombre: string,
  encolar: Encolar
): Promise<string> {
  const id = uuid();
  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) throw new Error('El proyecto necesita un nombre.');

  if (navigator.onLine) {
    const { error } = await supabase
      .from('proyecto')
      .insert({ id, cliente_id: clienteId, nombre: nombreLimpio });
    if (!error) return id;
    // Fallo que no parece de red (RLS, constraint…): se muestra tal cual.
    const esFalloDeRed = /fetch|network|load failed/i.test(error.message ?? '');
    if (!esFalloDeRed) throw new Error(error.message);
  }

  await encolar(id, 'proyecto', { clienteId, nombre: nombreLimpio });
  return id;
}
