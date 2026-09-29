import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaAccion } from '@/components/ui/fila-accion';
import { formatearMB, type EstadoDescarga, type TipoInforme } from '@/hooks/use-descargar-informe';

// Las dos descargas de una visita, iguales en el cierre y en el detalle de la
// visita cerrada. «PDF de la visita» es la normal: lleva las fotos dentro y se
// abre sin descomprimir nada. «Todo en ZIP» es la copia completa (fotos
// originales + audios) para quien quiera guardarla o antes de liberar espacio.
// Se reciben estadoDe/descargar del useDescargarInforme de la pantalla para
// compartir estado con otras acciones suyas (liberar espacio usa el ZIP).

const FILAS: Array<{ tipo: TipoInforme; titulo: string; queLleva: string; etiqueta: string }> = [
  { tipo: 'visita', titulo: 'PDF de la visita', queLleva: 'Informe con las fotos', etiqueta: 'Descargar PDF' },
  { tipo: 'visita-zip', titulo: 'Todo en ZIP', queLleva: 'PDF, fotos originales y audios', etiqueta: 'Descargar ZIP' },
];

function subtitulo(estado: EstadoDescarga, queLleva: string) {
  if (typeof estado === 'object') return `Descargado (${formatearMB(estado.tamanoBytes)} MB)`;
  if (estado === 'generando') return 'Generando…';
  if (estado === 'sin-red') return 'Sin conexión. Inténtalo cuando tengas red';
  if (estado === 'error') return 'No se pudo generar, toca de nuevo';
  return queLleva;
}

export function DescargasVisita({
  visitaId,
  estadoDe,
  descargar,
}: {
  visitaId: string;
  estadoDe: (tipo: TipoInforme, id: string) => EstadoDescarga;
  descargar: (tipo: TipoInforme, id: string) => Promise<EstadoDescarga>;
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
            subtitulo={subtitulo(estado, queLleva)}
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
