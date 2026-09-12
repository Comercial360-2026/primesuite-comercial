import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useVisitasConColaPendiente } from '@/hooks/use-sync-queue';
import { useDescargarInforme } from '@/hooks/use-descargar-informe';
import { plural } from '@/lib/texto';

export interface VisitaEspacioProyecto {
  visita_id: string;
  fecha: string;
  bytes: number;
  oportunidades_abiertas: number;
  rutas_storage: string[] | null;
  puede_liberarla: boolean;
}

export function espacioProyectoQueryKey(proyectoId: string) {
  return ['espacio-proyecto', proyectoId];
}

type Progreso = { fase: 'descargando' | 'liberando'; hecho: number; total: number };

// "Liberar espacio" a nivel de PROYECTO: agrega el mismo candado y el mismo
// flujo de "descargar backup completo → liberar" que ya existe por visita
// (detalle-visita-cerrada.tsx) y en lote por comercial (mi-espacio.tsx),
// pero a escala de proyecto y resuelto con un RPC de servidor
// (liberar_visitas_proyecto, migración 116) que no aborta el lote entero si
// una visita falla — cada una es independiente.
export function useEspacioProyecto(proyectoId: string | undefined) {
  const queryClient = useQueryClient();
  const pendientesLocal = useVisitasConColaPendiente();
  const { descargar } = useDescargarInforme();

  const queryKey = espacioProyectoQueryKey(proyectoId ?? '');
  const { data, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey,
    enabled: !!proyectoId,
    queryFn: async (): Promise<VisitaEspacioProyecto[]> => {
      const { data, error } = await supabase.rpc('fn_visitas_liberables_proyecto', {
        p_proyecto_id: proyectoId!,
      });
      if (error) throw error;
      return (data ?? []) as VisitaEspacioProyecto[];
    },
  });
  const visitas = data ?? [];

  // Mismo orden de prioridad y mismo criterio que motivoBloqueo en
  // mi-espacio.tsx (oportunidad abierta → cola local sin subir), más el
  // caso nuevo de este flujo: una visita de un compañero de la que no eres
  // responsable ni Dirección — evita marcarla para descubrir el fallo solo
  // al confirmar.
  function motivoBloqueo(v: VisitaEspacioProyecto): string | null {
    if (v.oportunidades_abiertas > 0) {
      return `No se puede liberar: tiene ${plural(v.oportunidades_abiertas, 'oportunidad abierta', 'oportunidades abiertas')}`;
    }
    if (pendientesLocal.has(v.visita_id)) return 'No se puede liberar: tiene cambios de este dispositivo sin subir';
    if (!v.puede_liberarla) return 'No eres responsable de esta visita';
    return null;
  }

  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const corriendo = progreso !== null;

  function invalidarTodo() {
    for (const k of [
      queryKey,
      ['listado-clientes'],
      ['historial-visitas'],
      ['semaforo-cliente'],
      ['resumen-visitas-proyecto', proyectoId],
      // Hueco detectado en mi-espacio.tsx: liberar espacio no refrescaba el
      // medidor de equipo, que se quedaba con la cifra vieja hasta 60s.
      // Aquí se invalida desde el principio.
      ['mi-espacio-total'],
      ['cuota-comercial-bytes'],
      ['espacio-equipo'],
      ['mis-visitas-espacio'],
    ]) {
      queryClient.invalidateQueries({ queryKey: k });
    }
  }

  // Solo respaldo, sin liberar nada: a diferencia de liberarSeleccionadas,
  // no filtra por motivoBloqueo — descargar el backup no borra nada, así que
  // una oportunidad abierta o cola local pendiente no tiene por qué impedirlo
  // (ese candado solo protege el borrado, no la lectura).
  async function descargarSeleccionadas(ids: string[]) {
    if (corriendo || !proyectoId) return;
    const candidatas = visitas.filter((v) => ids.includes(v.visita_id));
    if (!candidatas.length) return;
    if (!navigator.onLine) {
      setResultado('Necesitas conexión para descargar.');
      return;
    }

    setResultado(null);
    setProgreso({ fase: 'descargando', hecho: 0, total: candidatas.length });
    let hechas = 0;
    for (let i = 0; i < candidatas.length; i++) {
      const resultadoDescarga = await descargar('visita', candidatas[i].visita_id);
      if (typeof resultadoDescarga === 'object') hechas++;
      setProgreso({ fase: 'descargando', hecho: i + 1, total: candidatas.length });
    }
    setProgreso(null);
    setResultado(
      hechas === candidatas.length
        ? null
        : `Se descargaron ${hechas} de ${candidatas.length}. Las demás fallaron — inténtalo de nuevo.`
    );
  }

  async function liberarSeleccionadas(ids: string[]) {
    if (corriendo || !proyectoId) return;
    // Filtrado defensivo: entre marcar y confirmar la lista puede haberse
    // refrescado en segundo plano (misma razón que mi-espacio.tsx:217-220).
    const candidatas = visitas.filter((v) => ids.includes(v.visita_id) && !motivoBloqueo(v));
    if (!candidatas.length) return;
    if (!navigator.onLine) {
      setResultado('Necesitas conexión para liberar espacio.');
      return;
    }

    setResultado(null);
    setProgreso({ fase: 'descargando', hecho: 0, total: candidatas.length });

    // 1) Backup completo (fotos+audios+PDF) de cada visita, UNA A UNA, ANTES
    // de liberar nada. Si una descarga falla, se corta aquí: nunca se libera
    // una visita sin haberla respaldado con éxito antes.
    const descargadas: VisitaEspacioProyecto[] = [];
    for (let i = 0; i < candidatas.length; i++) {
      const v = candidatas[i];
      const resultadoDescarga = await descargar('visita', v.visita_id);
      if (typeof resultadoDescarga !== 'object') {
        // BUG encontrado en verificación en vivo (forzando el fallo de la 2ª
        // descarga de un lote de 2): este aviso se perdía porque
        // liberarEnServidor ponía `resultado` a null al terminar sin fallos
        // de RPC, pisando el mensaje de "se paró a mitad de camino" justo
        // cuando más falta hacía verlo. Ahora se le pasa como base y
        // liberarEnServidor lo conserva/combina en vez de descartarlo.
        const avisoDescarga =
          descargadas.length === 0
            ? 'No se pudo generar el primer respaldo. Comprueba tu conexión e inténtalo de nuevo.'
            : `Se respaldaron ${descargadas.length} de ${candidatas.length} y se liberaron esas. Se paró al fallar una descarga — el resto sigue intacto, inténtalo de nuevo cuando quieras.`;
        // Lo ya respaldado con éxito SÍ se libera, para no repetir descargas
        // innecesarias en el siguiente intento — mismo espíritu que "lo que
        // se pudo, se hace" del lote de Mi espacio.
        if (descargadas.length) await liberarEnServidor(descargadas, avisoDescarga);
        else {
          setProgreso(null);
          setResultado(avisoDescarga);
        }
        return;
      }
      descargadas.push(v);
      setProgreso({ fase: 'descargando', hecho: i + 1, total: candidatas.length });
    }

    await liberarEnServidor(descargadas);
  }

  async function liberarEnServidor(descargadas: VisitaEspacioProyecto[], avisoDescarga?: string) {
    setProgreso({ fase: 'liberando', hecho: 0, total: descargadas.length });
    const { data, error } = await supabase.rpc('liberar_visitas_proyecto', {
      p_proyecto_id: proyectoId!,
      p_visita_ids: descargadas.map((v) => v.visita_id),
    });
    if (error) {
      setProgreso(null);
      setResultado(`No se pudo liberar espacio: ${error.message}`);
      return;
    }

    const filas = (data ?? []) as { visita_id: string; liberada: boolean; motivo: string | null }[];
    const liberadas = filas.filter((f) => f.liberada);
    const fallidas = filas.filter((f) => !f.liberada);

    // 2) Storage SOLO de las que el servidor confirmó liberadas, y SOLO
    // después del RPC — nunca antes (el orden invertido de mi-espacio.tsx
    // perdía adjuntos si el RPC fallaba tras haber borrado ya Storage).
    if (liberadas.length) {
      const rutas = liberadas.flatMap(
        (f) => descargadas.find((v) => v.visita_id === f.visita_id)?.rutas_storage ?? []
      );
      if (rutas.length) {
        await Promise.all([
          supabase.storage.from('fotos-visita').remove(rutas),
          supabase.storage.from('audios-visita').remove(rutas),
        ]);
      }
    }

    invalidarTodo();
    setProgreso(null);
    if (fallidas.length === 0) {
      setResultado(avisoDescarga ?? null);
    } else {
      const motivos = fallidas.map((f) => f.motivo).filter(Boolean).join(' · ');
      const mensajeRpc = `Se liberaron ${liberadas.length} de ${filas.length}. ${fallidas.length} no se pudieron liberar${motivos ? `: ${motivos}` : '.'}`;
      setResultado(avisoDescarga ? `${avisoDescarga} ${mensajeRpc}` : mensajeRpc);
    }
  }

  return {
    visitas,
    isLoading,
    isError,
    // Sin caché previa (primera carga sin red) vs. "0 visitas" real — mismo
    // matiz que mi-espacio.tsx: `data === undefined` es la señal correcta,
    // no `visitas.length === 0` (que también es cierto con caché vacía real).
    sinConexion: isPaused && data === undefined,
    refetch,
    motivoBloqueo,
    progreso,
    corriendo,
    resultado,
    limpiarResultado: () => setResultado(null),
    descargarSeleccionadas,
    liberarSeleccionadas,
  };
}
