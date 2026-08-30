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
      setEstados((prev) => ({ ...prev, [visitaId]: { url: data.url, tamanoBytes: data.tamanoBytes ?? 0 } }));
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

// Mismo botón/enlace en los cuatro sitios donde aparece: mientras no se ha
// pedido, "Descargar informe"; generando, deshabilitado con aviso; listo,
// un <a href> real (nunca window.open() tras un await — el navegador ya no
// lo trata como gesto directo del usuario y bloquea el popup en silencio,
// verificado en directo) — el comercial lo pulsa él mismo.
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
    return (
      <a
        href={estado.url}
        className="btn btn-primary"
        style={{ ...estilo, display: 'inline-block', textAlign: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
        Descargar ({formatearMB(estado.tamanoBytes)} MB)
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
