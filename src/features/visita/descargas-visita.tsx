import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaAccion } from '@/components/ui/fila-accion';
import { formatearMB, type EstadoDescarga, type TipoInforme } from '@/hooks/use-descargar-informe';

// Las tres descargas de una visita, iguales en el cierre y en el detalle de la
// visita cerrada. «PDF de la visita» es la normal: lleva las fotos dentro y se
// abre sin descomprimir nada. «Originales en ZIP» son las fotos, audios y
// documentos tal como se capturaron, sin informe (el PDF y el informe web van
// aparte). Se reciben estadoDe/descargar del useDescargarInforme de la pantalla
// para compartir estado entre las filas.

const FILAS: Array<{ tipo: TipoInforme; titulo: string; queLleva: string; etiqueta: string }> = [
  { tipo: 'visita', titulo: 'PDF de la visita', queLleva: 'Informe con las fotos', etiqueta: 'Descargar PDF' },
  { tipo: 'visita-web', titulo: 'Informe web', queLleva: 'Página navegable: fotos, mapa por zonas, buscador', etiqueta: 'Descargar informe web' },
  { tipo: 'visita-zip', titulo: 'Originales en ZIP', queLleva: 'Fotos, audios y documentos tal como se capturaron', etiqueta: 'Descargar originales' },
];

function subtitulo(estado: EstadoDescarga, queLleva: string, progreso: number | null, motivo: string | null) {
  if (typeof estado === 'object') {
    return estado.partes
      ? `Descargado (${formatearMB(estado.tamanoBytes)} MB en ${estado.partes} archivos; si el navegador lo pide, permite las descargas múltiples)`
      : `Descargado (${formatearMB(estado.tamanoBytes)} MB)`;
  }
  if (estado === 'generando') {
    if (progreso === null || progreso === 0) return 'Generando… puede tardar un minuto con muchas fotos';
    return progreso < 100 ? `Preparando las fotos… ${progreso} %` : 'Montando el archivo…';
  }
  if (estado === 'sin-red') return 'Sin conexión. Inténtalo cuando tengas red';
  if (estado === 'error') return motivo ?? 'No se pudo generar, toca de nuevo';
  return queLleva;
}

export function DescargasVisita({
  visitaId,
  estadoDe,
  descargar,
  progresoDe,
  motivoDe,
}: {
  visitaId: string;
  estadoDe: (tipo: TipoInforme, id: string) => EstadoDescarga;
  descargar: (tipo: TipoInforme, id: string) => Promise<EstadoDescarga>;
  progresoDe: (tipo: TipoInforme, id: string) => number | null;
  motivoDe: (tipo: TipoInforme, id: string) => string | null;
}) {
  return (
    <SeccionLista>
      {FILAS.map(({ tipo, titulo, queLleva, etiqueta }) => {
        const estado = estadoDe(tipo, visitaId);
        const listo = typeof estado === 'object' ? estado : null;
        return (
          <FilaAccion
            key={tipo}
            densidad="compacta"
            titulo={titulo}
            subtitulo={subtitulo(estado, queLleva, progresoDe(tipo, visitaId), motivoDe(tipo, visitaId))}
            acciones={[
              {
                icono: 'descargar',
                etiqueta: listo ? `${etiqueta} otra vez` : etiqueta,
                onClick: listo ? undefined : () => descargar(tipo, visitaId),
                href: listo ? listo.url : undefined,
                disabled: estado === 'generando',
                tono: estado === 'error' ? 'riesgo' : listo ? 'brand' : 'neutral',
              },
            ]}
          />
        );
      })}
    </SeccionLista>
  );
}
