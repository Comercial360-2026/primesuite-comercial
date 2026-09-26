import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta, haceRelativo } from '@/lib/fechas';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { etiqueta, PRIORIDAD_LABEL, ETAPA_LABEL } from '@/lib/etiquetas-visita';
import { desde } from '@/lib/volver-a';
import { ListaVisitasHistorial, type VisitaHistorial } from '@/features/visita/lista-visitas-historial';

// Las secciones de un proyecto (prompt maestro 13): arriba lo VIVO, que dura
// varias visitas (oportunidades activas, próximos pasos); debajo sus visitas,
// cada una con lo que tiene dentro. Notas y hallazgos no se repiten aquí
// sueltos: viven en su visita (y lo instalado, en la ficha del cliente). Lo
// monta la Ficha de proyecto. El historial de TODO el cliente (todas sus
// visitas, de cualquier proyecto) es otra cosa: `HistorialVisitasCliente`.
//
// Devuelve un fragment de <SeccionLista> (o el estado vacío) — sin envoltorio
// propio: el que monta el componente pone el <div className="lista-agrupada">.

interface OportunidadActiva {
  id: string;
  titulo: string;
  prioridad: string;
  etapa: string;
  valor_estimado: number | null;
  zona_texto: string | null;
}

interface ProximoPasoPendiente {
  id: string;
  descripcion: string;
  fecha_objetivo: string | null;
  zona_texto: string | null;
}

interface Props {
  proyectoId: string;
  /** Texto del estado vacío. */
  mensajeVacio?: string;
}

export function ActividadProyecto({
  proyectoId,
  mensajeVacio = 'Todavía no hay nada registrado en este proyecto. Empieza una visita para llenarlo.',
}: Props) {
  // Origen a estampar en cada fila que navega a una pantalla de detalle,
  // para que su ← vuelva aquí (a la ficha que monta este componente).
  const origen = desde(useLocation());

  const { data: oportunidades } = useQuery({
    queryKey: ['oportunidades-activas-proyecto', proyectoId],
    queryFn: async (): Promise<OportunidadActiva[]> => {
      const { data, error } = await supabase
        .from('oportunidad')
        .select('id, titulo, prioridad, etapa, valor_estimado, zona_texto')
        .eq('proyecto_id', proyectoId)
        .neq('etapa', 'cerrada')
        .order('creado_en', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: proximosPasos } = useQuery({
    queryKey: ['proximos-pasos-proyecto', proyectoId],
    queryFn: async (): Promise<ProximoPasoPendiente[]> => {
      const { data, error } = await supabase
        .from('proximo_paso')
        .select('id, descripcion, fecha_objetivo, zona_texto')
        .eq('proyecto_id', proyectoId)
        .eq('estado', 'pendiente')
        .order('fecha_objetivo', { ascending: true })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: historialVisitas } = useQuery({
    queryKey: ['historial-visitas-proyecto', proyectoId],
    queryFn: async (): Promise<VisitaHistorial[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, objetivo, estado_captura')
        .eq('proyecto_id', proyectoId)
        .order('fecha', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as VisitaHistorial[];
    },
  });

  // Ficha "vacía" = nada que un comercial haya registrado todavía en este
  // proyecto. `listasCargadas` evita el parpadeo de "vacía" mientras las
  // queries resuelven.
  const listasCargadas =
    oportunidades !== undefined &&
    proximosPasos !== undefined &&
    historialVisitas !== undefined;
  const fichaVacia =
    !oportunidades?.length &&
    !proximosPasos?.length &&
    !historialVisitas?.length;

  const hoyMs = new Date().setHours(0, 0, 0, 0);

  if (listasCargadas && fichaVacia) {
    return <EstadoLista estado="vacio" mensaje={mensajeVacio} />;
  }

  return (
    <>
      {!!oportunidades?.length && (
        <SeccionLista titulo="Oportunidades activas" prominencia="principal">
          {oportunidades.map((o) => (
            <FilaNavegable
              key={o.id}
              titulo={o.titulo}
              subtitulo={
                [
                  o.etapa ? etiqueta(ETAPA_LABEL, o.etapa) : null,
                  o.valor_estimado != null ? `${o.valor_estimado.toLocaleString('es-ES')} €` : null,
                  o.zona_texto?.trim() || null,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
              valor={etiqueta(PRIORIDAD_LABEL, o.prioridad)}
              to={`/oportunidades/${o.id}`}
              state={origen}
            />
          ))}
        </SeccionLista>
      )}

      {!!proximosPasos?.length && (
        <SeccionLista titulo="Próximos pasos">
          {proximosPasos.map((p) => {
            const vencido = !!p.fecha_objetivo && new Date(p.fecha_objetivo).getTime() < hoyMs;
            return (
              <FilaNavegable
                key={p.id}
                titulo={p.descripcion}
                subtitulo={p.zona_texto?.trim() || undefined}
                tono={vencido ? 'riesgo' : 'neutral'}
                valor={
                  p.fecha_objetivo
                    ? vencido
                      ? `vencido ${haceRelativo(p.fecha_objetivo)}`
                      : fechaCorta(p.fecha_objetivo)
                    : undefined
                }
                valorTenue={!vencido}
                to={`/proximos-pasos/${p.id}`}
                state={origen}
              />
            );
          })}
        </SeccionLista>
      )}

      {!!historialVisitas?.length && <ListaVisitasHistorial visitas={historialVisitas} />}
    </>
  );
}
