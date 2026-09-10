import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { fechaCorta } from '@/lib/fechas';
import { PRIORIDAD_LABEL, etiqueta } from '@/lib/etiquetas-visita';
import type { OperacionPendiente } from '@/lib/offline-queue/types';

export type GrupoCierre = 'fotos' | 'audios' | 'notas' | 'oportunidades' | 'hallazgos' | 'pasos';

const TITULO: Record<GrupoCierre, string> = {
  fotos: 'Fotos',
  audios: 'Audios',
  notas: 'Notas',
  oportunidades: 'Oportunidades',
  hallazgos: 'Hallazgos',
  pasos: 'Próximos pasos',
};

interface Props {
  grupo: GrupoCierre;
  /** Operaciones de la cola ya filtradas al grupo. */
  items: OperacionPendiente[];
  onCerrar: () => void;
}

// Detalle de una casilla de "Cerrar visita": al tocar Fotos / Notas /
// Próximos pasos… se abre este diálogo con lo que hay en ese grupo, para
// repasarlo antes de cerrar. Solo lectura, se cierra con la × o
// "Cerrar". Los datos salen de la cola offline (useSyncQueue) → valen con o
// sin conexión. Las fotos y audios se ven/oyen aquí: el binario está en el
// móvil (IndexedDB) mientras no se ha subido, y en Storage cuando ya sí.
export function HojaDetalleCierre({ grupo, items, onCerrar }: Props) {
  const esMedia = grupo === 'fotos' || grupo === 'audios';

  // Capturas todavía en el móvil: URL directa al Blob local. Se crea en un
  // efecto (no en render) y se revoca solo al cerrar el modal — `items`
  // viene congelado del padre, así que este efecto corre una vez. Crearlas
  // en render las revocaba a mitad de carga y la <img> salía rota.
  const [urlsLocales, setUrlsLocales] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!esMedia) return;
    const m = new Map<string, string>();
    for (const op of items) {
      if (op.archivoLocal) m.set(op.id, URL.createObjectURL(op.archivoLocal));
    }
    setUrlsLocales(m);
    return () => m.forEach((u) => URL.revokeObjectURL(u));
  }, [esMedia, items]);

  // Capturas ya subidas (sin Blob local): URL firmada de Storage. El payload
  // local nunca guarda `storage_path`, así que hay que pedirlo a la tabla.
  const idsSubidos = esMedia ? items.filter((op) => !op.archivoLocal).map((op) => op.id) : [];
  const { data: urlsRemotas } = useQuery({
    queryKey: ['media-detalle-cierre', grupo, idsSubidos.join(',')],
    enabled: idsSubidos.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data: filas, error } = await supabase
        .from('captura_libre')
        .select('id, storage_path')
        .in('id', idsSubidos);
      if (error) throw error;
      const conRuta = (filas ?? []).filter((f): f is { id: string; storage_path: string } => !!f.storage_path);
      if (!conRuta.length) return {};
      const bucket = grupo === 'fotos' ? 'fotos-visita' : 'audios-visita';
      const { data: firmadas } = await supabase.storage
        .from(bucket)
        .createSignedUrls(conRuta.map((f) => f.storage_path), 3600);
      const porRuta = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
      const m: Record<string, string> = {};
      for (const f of conRuta) {
        const url = porRuta.get(f.storage_path);
        if (url) m[f.id] = url;
      }
      return m;
    },
  });

  const urlDe = (op: OperacionPendiente) => urlsLocales.get(op.id) ?? urlsRemotas?.[op.id] ?? null;

  return (
    <HojaSuperior titulo={`${TITULO[grupo]} (${items.length})`} onCerrar={onCerrar}>
      <ul className="detalle-cierre">
        {items.map((op) => {
          const pendiente = op.estado !== 'completado';
          const p = op.payload as {
            categoriaFoto?: string;
            zonaTexto?: string;
            contenidoTexto?: string;
            titulo?: string;
            prioridad?: string;
            nota?: string;
            descripcion?: string;
            fechaObjetivo?: string;
          };
          const zona = p.zonaTexto?.trim() || null;
          const url = esMedia ? urlDe(op) : null;

          return (
            <li key={op.id} className="detalle-cierre__fila">
              {grupo === 'fotos' && (
                <>
                  <span className="detalle-cierre__titulo">{p.categoriaFoto?.trim() || 'Foto'}</span>
                  {url ? (
                    <img className="detalle-cierre__foto" src={url} alt={p.categoriaFoto || 'foto de la visita'} />
                  ) : (
                    <span className="detalle-cierre__meta">
                      {pendiente ? 'pendiente de subir — se verá al sincronizar' : 'no disponible'}
                    </span>
                  )}
                  {meta([zona, pendiente && 'pendiente de subir'])}
                </>
              )}

              {grupo === 'audios' && (
                <>
                  <span className="detalle-cierre__titulo">Audio</span>
                  {url ? (
                    <audio className="detalle-cierre__audio" controls src={url} />
                  ) : (
                    <span className="detalle-cierre__meta">
                      {pendiente ? 'pendiente de subir — se oirá al sincronizar' : 'no disponible'}
                    </span>
                  )}
                  {meta([
                    zona,
                    p.contenidoTexto?.trim() ? 'con transcripción' : null,
                    pendiente && 'pendiente de subir',
                  ])}
                </>
              )}

              {grupo === 'notas' && (
                <>
                  <span className="detalle-cierre__titulo">
                    {p.contenidoTexto?.trim() || p.titulo?.trim() || 'Nota sin texto'}
                  </span>
                  {meta([zona, pendiente && 'pendiente de subir'])}
                </>
              )}

              {grupo === 'oportunidades' && (
                <>
                  <span className="detalle-cierre__titulo">{p.titulo}</span>
                  {meta([p.prioridad && etiqueta(PRIORIDAD_LABEL, p.prioridad), zona])}
                </>
              )}

              {grupo === 'hallazgos' && (
                <>
                  <span className="detalle-cierre__titulo">{p.nota?.trim() || 'Hallazgo'}</span>
                  {meta([zona])}
                </>
              )}

              {grupo === 'pasos' && (
                <>
                  <span className="detalle-cierre__titulo">{p.descripcion}</span>
                  {meta([p.fechaObjetivo ? `para ${fechaCorta(p.fechaObjetivo)}` : 'sin fecha objetivo', zona])}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </HojaSuperior>
  );
}

function meta(partes: Array<string | null | undefined | false>) {
  const t = partes.filter(Boolean).join(' · ');
  return t ? <span className="detalle-cierre__meta">{t}</span> : null;
}
