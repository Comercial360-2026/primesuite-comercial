import { Modal } from '@/components/ui/modal';
import { fechaCorta } from '@/lib/fechas';
import { NATURALEZA_LABEL, PRIORIDAD_LABEL, etiqueta } from '@/lib/etiquetas-visita';
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
  /** Operaciones de la cola ya filtradas al grupo (capturas del tipo, o la
   *  entidad correspondiente). */
  items: OperacionPendiente[];
  /** id de término → nombre, para los hallazgos. */
  nombresTerminos?: Record<string, string>;
  onCerrar: () => void;
}

// Detalle de una casilla de "Cerrar visita": al tocar Fotos / Notas /
// Próximos pasos… se abre este diálogo con lo que hay en ese grupo, para
// repasarlo antes de consolidar. Solo lectura: no edita ni borra nada, se
// cierra con la × o "Cerrar". Los datos salen de la cola offline
// (useSyncQueue), así que valen igual con o sin conexión.
export function ModalDetalleCierre({ grupo, items, nombresTerminos, onCerrar }: Props) {
  return (
    <Modal titulo={`${TITULO[grupo]} (${items.length})`} onCerrar={onCerrar}>
      <ul className="detalle-cierre">
        {items.map((op) => (
          <li key={op.id} className="detalle-cierre__fila">
            {fila(grupo, op, nombresTerminos)}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={onCerrar}>
        Cerrar
      </button>
    </Modal>
  );
}

function zona(payload: { zonaTexto?: string; ubicacionId?: string }): string | null {
  return payload.zonaTexto?.trim() || null;
}

function meta(partes: Array<string | null | undefined | false>) {
  const t = partes.filter(Boolean).join(' · ');
  return t ? <span className="detalle-cierre__meta">{t}</span> : null;
}

function fila(grupo: GrupoCierre, op: OperacionPendiente, nombresTerminos?: Record<string, string>) {
  const pendiente = op.estado !== 'completado';

  if (grupo === 'fotos' || grupo === 'audios') {
    const p = op.payload as { categoriaFoto?: string; zonaTexto?: string; contenidoTexto?: string };
    return (
      <>
        <span className="detalle-cierre__titulo">
          {grupo === 'fotos' ? p.categoriaFoto?.trim() || 'Foto' : 'Audio'}
        </span>
        {meta([zona(p), grupo === 'audios' && p.contenidoTexto?.trim() ? 'con transcripción' : null, pendiente && 'pendiente de subir'])}
      </>
    );
  }

  if (grupo === 'notas') {
    const p = op.payload as { titulo?: string; contenidoTexto?: string; zonaTexto?: string };
    return (
      <>
        <span className="detalle-cierre__titulo">{p.contenidoTexto?.trim() || p.titulo?.trim() || 'Nota sin texto'}</span>
        {meta([zona(p), pendiente && 'pendiente de subir'])}
      </>
    );
  }

  if (grupo === 'oportunidades') {
    const p = op.payload as { titulo: string; prioridad: string; zonaTexto?: string };
    return (
      <>
        <span className="detalle-cierre__titulo">{p.titulo}</span>
        {meta([etiqueta(PRIORIDAD_LABEL, p.prioridad), zona(p)])}
      </>
    );
  }

  if (grupo === 'hallazgos') {
    const p = op.payload as { terminoId: string; naturaleza: string; nota?: string; zonaTexto?: string };
    return (
      <>
        <span className="detalle-cierre__titulo">{nombresTerminos?.[p.terminoId] ?? 'Término'}</span>
        {meta([etiqueta(NATURALEZA_LABEL, p.naturaleza), zona(p)])}
        {p.nota?.trim() && <span className="detalle-cierre__nota">{p.nota}</span>}
      </>
    );
  }

  // pasos
  const p = op.payload as { descripcion: string; fechaObjetivo?: string; zonaTexto?: string };
  return (
    <>
      <span className="detalle-cierre__titulo">{p.descripcion}</span>
      {meta([p.fechaObjetivo ? `para ${fechaCorta(p.fechaObjetivo)}` : 'sin fecha objetivo', zona(p)])}
    </>
  );
}
