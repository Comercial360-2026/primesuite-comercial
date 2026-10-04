import { supabase } from '@/lib/supabase-client';

// Los tres buckets de adjuntos de una visita. Cualquier sitio que borre,
// liste o mida adjuntos de una visita recorre ESTA lista: así un bucket nuevo
// no se olvida en un borrado (dejaría archivos huérfanos).
export const BUCKETS_VISITA = ['fotos-visita', 'audios-visita', 'documentos-visita'] as const;

export function bucketDeTipo(tipo: string): (typeof BUCKETS_VISITA)[number] {
  if (tipo === 'foto') return 'fotos-visita';
  if (tipo === 'documento') return 'documentos-visita';
  return 'audios-visita';
}

// Quita rutas de Storage en todos los buckets de adjuntos (una ruta solo
// existe en el suyo; quitarla de los otros es un no-op).
export function quitarAdjuntosDeStorage(rutas: string[]) {
  return Promise.all(BUCKETS_VISITA.map((b) => supabase.storage.from(b).remove(rutas)));
}
