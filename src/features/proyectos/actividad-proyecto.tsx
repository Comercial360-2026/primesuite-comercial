import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta, haceRelativo } from '@/lib/fechas';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { etiqueta, PRIORIDAD_LABEL, ETAPA_LABEL, NATURALEZA_LABEL } from '@/lib/etiquetas-visita';

// Las secciones "vivas" de un proyecto: oportunidades activas, próximos
// pasos, hallazgos e historial de visitas de ESE proyecto. Se comparte entre
// la Ficha de proyecto (pantalla propia) y la Ficha de cliente cuando el
// cliente solo tiene su Proyecto General — en ese caso las dos pantallas
// eran casi lo mismo y obligaban a un salto de navegación de más (1.5 del
// recorrido de revisión), así que la actividad del General se muestra
// directamente dentro de la ficha de cliente.
//
// Devuelve un fragment de <SeccionLista> (o el estado vacío) — sin envoltorio
// propio: el que monta el componente pone el <div className="lista-agrupada">.

interface OportunidadActiva {
  id: string;
  titulo: string;
  prioridad: string;
  etapa: string;
  valor_estimado: number | null;
}

interface ProximoPasoPendiente {
  id: string;
  descripcion: string;
  fecha_objetivo: string | null;
}

interface HallazgoAbierto {
  id: string;
  naturaleza: string;
  fecha_relevante: string | null;
  termino: { nombre: string } | null;
}

interface VisitaHistorial {
  id: string;
  fecha: string;
  tipo_visita: string | null;
  objetivo: string | null;
  estado_captura: string;
}

interface Props {
  proyectoId: string;
  /** Texto del estado vacío. Por defecto habla "de este proyecto"; la ficha
      de cliente (cuando solo hay el General) pasa uno sin esa palabra. */
  mensajeVacio?: string;
}

export function ActividadProyecto({
  proyectoId,
  mensajeVacio = 'Todavía no hay nada registrado en este proyecto. Empieza una visita para llenarlo.',
}: Props) {
  const { data: oportunidades } = useQuery({
    queryKey: ['oportunidades-activas-proyecto', proyectoId],
    queryFn: async (): Promise<OportunidadActiva[]> => {
      const { data, error } = await supabase
        .from('oportunidad')
        .select('id, titulo, prioridad, etapa, valor_estimado')
        .eq('proyecto_id', proyectoId)
        .not('etapa', 'in', '(ganada,perdida,descartada)')
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
        .select('id, descripcion, fecha_objetivo')
        .eq('proyecto_id', proyectoId)
        .eq('estado', 'pendiente')
        .order('fecha_objetivo', { ascending: true })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Hallazgos del proyecto (P5: se arrastran entre visitas hasta
  // resolverse). El esquema no tiene un estado de resolución propio —
  // "resolverlo" hoy es borrarlo desde su detalle (ver detalle-hallazgo.tsx)
  // — así que aquí se listan sencillamente los más recientes, no un
  // subconjunto "abierto" como en Oportunidades/Próximos pasos.
  const { data: hallazgos } = useQuery({
    queryKey: ['hallazgos-proyecto', proyectoId],
    queryFn: async (): Promise<HallazgoAbierto[]> => {
      const { data, error } = await supabase
        .from('hallazgo')
        .select('id, naturaleza, fecha_relevante, termino:termino_id(nombre)')
        .eq('proyecto_id', proyectoId)
        .order('creado_en', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as HallazgoAbierto[];
    },
  });

  const { data: historialVisitas } = useQuery({
    queryKey: ['historial-visitas-proyecto', proyectoId],
    queryFn: async (): Promise<VisitaHistorial[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, tipo_visita, objetivo, estado_captura')
        .eq('proyecto_id', proyectoId)
        .order('fecha', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Ficha "vacía" = nada que un comercial haya registrado todavía en este
  // proyecto. `listasCargadas` evita el parpadeo de "vacía" mientras las
  // cuatro queries resuelven.
  const listasCargadas =
    oportunidades !== undefined &&
    proximosPasos !== undefined &&
    hallazgos !== undefined &&
    historialVisitas !== undefined;
  const fichaVacia =
    !oportunidades?.length && !proximosPasos?.length && !hallazgos?.length && !historialVisitas?.length;

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
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
              valor={etiqueta(PRIORIDAD_LABEL, o.prioridad)}
              to={`/oportunidades/${o.id}`}
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
              />
            );
          })}
        </SeccionLista>
      )}

      {!!hallazgos?.length && (
        <SeccionLista titulo="Hallazgos">
          {hallazgos.map((h) => (
            <FilaNavegable
              key={h.id}
              titulo={h.termino?.nombre ?? '…'}
              tono={h.naturaleza === 'riesgo' ? 'riesgo' : 'neutral'}
              valor={etiqueta(NATURALEZA_LABEL, h.naturaleza)}
              valorTenue
              to={`/hallazgos/${h.id}`}
            />
          ))}
        </SeccionLista>
      )}

      {!!historialVisitas?.length && (
        <SeccionLista titulo="Historial de visitas">
          {historialVisitas.map((v) => {
            // La fila solo navega. Descargar informe y Borrar viven dentro
            // de la visita (detalle / Visita Activa) — así el historial no
            // es un muro de botones.
            const estadoLegible =
              v.estado_captura === 'agendada'
                ? 'planificada'
                : v.estado_captura === 'en_curso'
                  ? 'en curso'
                  : 'cerrada';
            const accion =
              v.estado_captura === 'agendada'
                ? 'gestionar'
                : v.estado_captura === 'en_curso'
                  ? 'continuar visita'
                  : 'ver contenido';
            const to =
              v.estado_captura === 'agendada'
                ? `/visita/${v.id}/planificada`
                : v.estado_captura === 'en_curso'
                  ? `/visita/${v.id}`
                  : `/visita/${v.id}/detalle`;
            return (
              <FilaNavegable
                key={v.id}
                titulo={fechaCorta(v.fecha)}
                subtitulo={`${v.objetivo ? `${v.objetivo} · ` : ''}${estadoLegible}`}
                valor={accion}
                valorTenue
                to={to}
              />
            );
          })}
        </SeccionLista>
      )}
    </>
  );
}
