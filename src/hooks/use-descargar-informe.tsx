import { useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { esSinRed } from '@/lib/red';

type EstadoDescarga = 'inactivo' | 'generando' | 'error' | 'sin-red' | { url: string; tamanoBytes: number };

/** Qué informe se pide. 'visita' → zip con PDF + fotos + audios de UNA visita.
 *  'proyecto' → PDF suelto de UN proyecto con su cronología de visitas. */
export type TipoInforme = 'visita' | 'proyecto';

const FUNCION_POR_TIPO: Record<TipoInforme, string> = {
  visita: 'generar-backup-visita',
  proyecto: 'generar-informe-proyecto',
};

// En una conexión muerta, functions.invoke() puede no resolver nunca y el
// botón se queda en "Generando…" para siempre, sin recuperarse solo. A los
// 45 s lo damos por fallido. Aquí es seguro cortar: generar el informe solo
// lee datos y arma un archivo temporal — no escribe nada, así que reintentar
// (o que la petición huérfana acabe sola y se descarte) es inofensivo. 45 s
// da margen de sobra para una generación lenta pero real.
const TIMEOUT_MS = 45_000;

export function formatearMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

// Guarda el archivo (zip de visita o PDF de proyecto) en el disco sin pasos
// ocultos: se trae como blob y se pincha un <a download> temporal. Con una
// blob: URL el atributo `download` SÍ respeta el nombre aunque el archivo
// venga de otro origen (la URL firmada de Storage lo es), y al no ser
// window.open el navegador no lo bloquea como popup pese al await previo de
// la generación. El nombre (y la extensión) salen del `?download=` que ya
// trae la URL firmada.
async function guardarArchivoEnDisco(url: string) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Descarga fallida (${resp.status})`);
  const blob = await resp.blob();
  const nombre = new URL(url).searchParams.get('download') || 'informe-primenotes';
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
// visita cerrada — cada sitio nuevo que necesitara "descargar el informe"
// (Hoy, el historial de la ficha de cliente, la ficha de proyecto) habría
// significado copiar la misma lógica una vez más, con el riesgo real de que
// una copia se corrija y las demás no. Centralizado aquí, con el tipo de
// informe como parámetro.
export function useDescargarInforme() {
  const [estados, setEstados] = useState<Record<string, EstadoDescarga>>({});

  // Devuelve el resultado además de guardarlo en `estados`: quien encadena
  // varias descargas en secuencia (liberar espacio de un proyecto entero)
  // necesita saber el resultado de ESTA llamada al terminar el `await`, sin
  // depender de releer `estadoDe` — ese closure no se actualiza a mitad de
  // una función async ya en marcha, solo en el siguiente render.
  async function descargar(tipo: TipoInforme, id: string): Promise<EstadoDescarga> {
    setEstados((prev) => ({ ...prev, [id]: 'generando' }));
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
      const invocacion = supabase.functions.invoke(FUNCION_POR_TIPO[tipo], {
        body: tipo === 'visita' ? { visitaId: id } : { proyectoId: id },
      });
      const limite = new Promise<never>((_, reject) => {
        temporizador = setTimeout(() => {
          // Se trata como falta de conexión (ver comentario de TIMEOUT_MS):
          // en la práctica, a los 45 s sin respuesta la causa es la red.
          const e = new Error('Ha tardado demasiado. Comprueba tu conexión e inténtalo de nuevo.');
          e.name = 'TimeoutDescarga';
          reject(e);
        }, TIMEOUT_MS);
      });
      const { data, error } = await Promise.race([invocacion, limite]);
      if (error || !data?.url) throw error ?? new Error('Sin URL de descarga');
      clearTimeout(temporizador);
      const listo = { url: data.url, tamanoBytes: data.tamanoBytes ?? 0 };
      setEstados((prev) => ({ ...prev, [id]: listo }));
      // Un solo toque: en cuanto está listo, el archivo se guarda solo. Si esto
      // fallara (sin red, CORS…), el estado ya es "listo" y queda el enlace
      // <a href> de reserva para bajarlo a mano.
      try {
        await guardarArchivoEnDisco(data.url);
      } catch {
        /* enlace de reserva visible en la propia fila/botón */
      }
      return listo;
    } catch (e) {
      const sinRed = esSinRed(e) || (e instanceof Error && e.name === 'TimeoutDescarga');
      const resultado: EstadoDescarga = sinRed ? 'sin-red' : 'error';
      setEstados((prev) => ({ ...prev, [id]: resultado }));
      return resultado;
    } finally {
      clearTimeout(temporizador);
    }
  }

  function estadoDe(id: string): EstadoDescarga {
    return estados[id] ?? 'inactivo';
  }

  return { estadoDe, descargar };
}
