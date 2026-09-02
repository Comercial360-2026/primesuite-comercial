import { useState } from 'react';
import { supabase } from '@/lib/supabase-client';

type EstadoDescarga = 'inactivo' | 'generando' | 'error' | { url: string; tamanoBytes: number };

// En una conexión muerta, functions.invoke() puede no resolver nunca y el
// botón se queda en "Generando…" para siempre, sin recuperarse solo. A los
// 45 s lo damos por fallido. Aquí es seguro cortar: generar el informe solo
// lee datos y arma un zip temporal — no escribe nada, así que reintentar (o
// que la petición huérfana acabe sola y se descarte) es inofensivo. 45 s da
// margen de sobra para una generación lenta pero real.
const TIMEOUT_MS = 45_000;

export function formatearMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

// Guarda el zip en el disco sin pasos ocultos: se trae el fichero como blob
// y se pincha un <a download> temporal. Con una blob: URL el atributo
// `download` SÍ respeta el nombre aunque el zip venga de otro origen (la URL
// firmada de Storage lo es), y al no ser window.open el navegador no lo
// bloquea como popup pese al await previo de la generación. El nombre sale
// del `?download=` que ya trae la URL firmada.
async function guardarZipEnDisco(url: string) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Descarga fallida (${resp.status})`);
  const blob = await resp.blob();
  const nombre = new URL(url).searchParams.get('download') || 'copia-visita.zip';
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocar tarde: revocar de inmediato corta la descarga en algún navegador.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

// Antes esto solo existía duplicado dentro de Mi espacio y del detalle de
// visita cerrada — cada sitio nuevo que necesitara "descargar el informe de
// esta visita" (como Hoy o el historial de la ficha de cliente) habría
// significado copiar la misma lógica una vez más, con el riesgo real de que
// una copia se corrija y las demás no. Centralizado aquí en su lugar.
export function useDescargarInforme() {
  const [estados, setEstados] = useState<Record<string, EstadoDescarga>>({});

  async function descargar(visitaId: string) {
    setEstados((prev) => ({ ...prev, [visitaId]: 'generando' }));
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
      const invocacion = supabase.functions.invoke('generar-backup-visita', {
        body: { visitaId },
      });
      const limite = new Promise<never>((_, reject) => {
        temporizador = setTimeout(
          () => reject(new Error('Ha tardado demasiado. Comprueba tu conexión e inténtalo de nuevo.')),
          TIMEOUT_MS
        );
      });
      const { data, error } = await Promise.race([invocacion, limite]);
      if (error || !data?.url) throw error ?? new Error('Sin URL de descarga');
      clearTimeout(temporizador);
      setEstados((prev) => ({ ...prev, [visitaId]: { url: data.url, tamanoBytes: data.tamanoBytes ?? 0 } }));
      // Un solo toque: en cuanto está lista, la copia se guarda sola. Si esto
      // fallara (sin red, CORS…), el estado ya es "listo" y queda el enlace
      // <a href> de reserva para bajarla a mano.
      try {
        await guardarZipEnDisco(data.url);
      } catch {
        /* enlace de reserva visible en la propia fila/botón */
      }
    } catch {
      setEstados((prev) => ({ ...prev, [visitaId]: 'error' }));
    } finally {
      clearTimeout(temporizador);
    }
  }

  function estadoDe(visitaId: string): EstadoDescarga {
    return estados[visitaId] ?? 'inactivo';
  }

  return { estadoDe, descargar };
}

// Botón/enlace de descarga. Mientras no se ha pedido, "Descargar informe";
// generando, deshabilitado con aviso; listo, la copia ya se ha guardado sola
// (ver guardarZipEnDisco) y queda un <a href> real por si hay que bajarla
// otra vez — nunca window.open() tras un await, que el navegador bloquea
// como popup en silencio (verificado en directo).
export function BotonDescargarInforme({
  estado,
  onDescargar,
  compacto = false,
}: {
  estado: EstadoDescarga;
  onDescargar: () => void;
  compacto?: boolean;
}) {
  const estilo = compacto
    ? { width: 'auto', padding: '0 12px', fontSize: 'var(--text-xs)' }
    : { width: 'auto', padding: '0 16px' };

  if (typeof estado === 'object') {
    // "Descargar otra vez" es una acción menor de repetición — nunca el
    // primario de la pantalla. Va en secundario (borde), igual que el
    // estado de reposo.
    return (
      <a
        href={estado.url}
        className="btn btn-secondary"
        style={{ ...estilo, display: 'inline-block', textAlign: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
        Descargar otra vez ({formatearMB(estado.tamanoBytes)} MB)
      </a>
    );
  }
  return (
    <button
      className="btn btn-secondary"
      style={estilo}
      disabled={estado === 'generando'}
      onClick={(e) => {
        e.stopPropagation();
        onDescargar();
      }}
    >
      {estado === 'generando' ? 'Generando…' : estado === 'error' ? 'Error, reintentar' : 'Descargar informe'}
    </button>
  );
}
