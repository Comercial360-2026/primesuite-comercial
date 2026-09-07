import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta, haceRelativo } from '@/lib/fechas';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { etiqueta, PRIORIDAD_LABEL, ETAPA_LABEL, NATURALEZA_LABEL } from '@/lib/etiquetas-visita';
import { desde } from '@/lib/volver-a';

// Las secciones "vivas" de un proyecto: oportunidades activas, próximos
// pasos, hallazgos e historial de visitas. Se comparte entre:
//   · la Ficha de proyecto — todo acotado a ESE proyecto;
//   · la Ficha de cliente — SIEMPRE, con la actividad del proyecto General
//     (lo "sin proyecto asignado"). Ahí el historial se amplía a TODAS las
//     visitas del cliente (`historialClienteId`) y, si hay proyectos con
//     nombre, la actividad propia va bajo el rótulo `etiquetaGrupo`
//     ("Sin proyecto asignado").
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
  proyecto: { nombre: string; es_general: boolean } | null;
}

interface Props {
  proyectoId: string;
  /** Texto del estado vacío. Por defecto habla "de este proyecto"; la ficha
      de cliente (cuando solo hay el General) pasa uno sin esa palabra. */
  mensajeVacio?: string;
  /** Ficha de cliente: el "Historial de visitas" abarca TODAS las visitas del
      cliente (de cualquier proyecto), no solo las de este proyecto. Cada fila
      lleva el nombre del proyecto de subtítulo si no es el General. La ficha
      de proyecto no lo pasa: allí el historial es solo lo suyo. */
  historialClienteId?: string;
  /** Ficha de cliente con 2+ proyectos: rótulo del grupo de actividad que no
      está en ningún proyecto con nombre ("Sin proyecto asignado"). Sin esto,
      la actividad es "toda la del cliente" y no lleva rótulo. Solo precede a
      oportunidades / próximos pasos / hallazgos — el historial va aparte, es
      de todo el cliente. */
  etiquetaGrupo?: string;
}

export function ActividadProyecto({
  proyectoId,
  mensajeVacio = 'Todavía no hay nada registrado en este proyecto. Empieza una visita para llenarlo.',
  historialClienteId,
  etiquetaGrupo,
}: Props) {
  // Origen a estampar en cada fila que navega a una pantalla de detalle,
  // para que su ← vuelva aquí (a la ficha que monta este componente).
  const origen = desde(useLocation());

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

  // Hallazgos del proyecto (P5: se arrastran entre visitas). Un comercial
  // puede "archivar" uno cuando lo da por no vigente (detalle-hallazgo.tsx):
  // deja de salir aquí pero sigue en su visita y en el informe. Por defecto
  // se listan los 5 activos más recientes; "Ver archivados (N)" trae el resto.
  const { data: hallazgos } = useQuery({
    queryKey: ['hallazgos-proyecto', proyectoId],
    queryFn: async (): Promise<HallazgoAbierto[]> => {
      const { data, error } = await supabase
        .from('hallazgo')
        .select('id, naturaleza, fecha_relevante, termino:termino_id(nombre)')
        .eq('proyecto_id', proyectoId)
        .is('archivado_en', null)
        .order('creado_en', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as HallazgoAbierto[];
    },
  });

  const { data: numArchivados } = useQuery({
    queryKey: ['hallazgos-archivados-proyecto', proyectoId, 'count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('hallazgo')
        .select('id', { count: 'exact', head: true })
        .eq('proyecto_id', proyectoId)
        .not('archivado_en', 'is', null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const [verArchivados, setVerArchivados] = useState(false);
  const { data: hallazgosArchivados } = useQuery({
    queryKey: ['hallazgos-archivados-proyecto', proyectoId, 'lista'],
    enabled: verArchivados,
    queryFn: async (): Promise<HallazgoAbierto[]> => {
      const { data, error } = await supabase
        .from('hallazgo')
        .select('id, naturaleza, fecha_relevante, termino:termino_id(nombre)')
        .eq('proyecto_id', proyectoId)
        .not('archivado_en', 'is', null)
        .order('archivado_en', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as HallazgoAbierto[];
    },
  });

  // Clave propia por alcance para no cruzar cachés — ['…-cliente', id] trae
  // visitas de varios proyectos y una columna de más (`proyecto`), que la
  // variante por proyecto no pide (ver [[primesuite-query-key-colision]]).
  const { data: historialVisitas } = useQuery({
    queryKey: historialClienteId
      ? ['historial-visitas-cliente', historialClienteId]
      : ['historial-visitas-proyecto', proyectoId],
    queryFn: async (): Promise<VisitaHistorial[]> => {
      const base = supabase
        .from('visita')
        .select('id, fecha, tipo_visita, objetivo, estado_captura, proyecto:proyecto_id(nombre, es_general)')
        .order('fecha', { ascending: false })
        .limit(10);
      const { data, error } = historialClienteId
        ? await base.eq('cliente_id', historialClienteId)
        : await base.eq('proyecto_id', proyectoId);
      if (error) throw error;
      return (data ?? []) as unknown as VisitaHistorial[];
    },
  });

  // Ficha "vacía" = nada que un comercial haya registrado todavía en este
  // proyecto. `listasCargadas` evita el parpadeo de "vacía" mientras las
  // cuatro queries resuelven.
  const listasCargadas =
    oportunidades !== undefined &&
    proximosPasos !== undefined &&
    hallazgos !== undefined &&
    numArchivados !== undefined &&
    historialVisitas !== undefined;
  const fichaVacia =
    !oportunidades?.length &&
    !proximosPasos?.length &&
    !hallazgos?.length &&
    !numArchivados &&
    !historialVisitas?.length;

  const hoyMs = new Date().setHours(0, 0, 0, 0);

  if (listasCargadas && fichaVacia) {
    return <EstadoLista estado="vacio" mensaje={mensajeVacio} />;
  }

  // Actividad "propia" del proyecto (todo menos el historial, que en la ficha
  // de cliente es de TODO el cliente). El rótulo "Sin proyecto asignado" solo
  // se dibuja si hay algo que rotular.
  const hayActividadPropia =
    !!oportunidades?.length || !!proximosPasos?.length || !!hallazgos?.length || !!numArchivados;

  return (
    <>
      {etiquetaGrupo && hayActividadPropia && (
        <div className="lbl-seccion">{etiquetaGrupo}</div>
      )}

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

      {(!!hallazgos?.length || !!numArchivados) && (
        <SeccionLista titulo="Hallazgos">
          {hallazgos?.map((h) => (
            <FilaNavegable
              key={h.id}
              titulo={h.termino?.nombre ?? '…'}
              tono={h.naturaleza === 'riesgo' ? 'riesgo' : 'neutral'}
              valor={etiqueta(NATURALEZA_LABEL, h.naturaleza)}
              valorTenue
              to={`/hallazgos/${h.id}`}
              state={origen}
            />
          ))}
          {!!numArchivados && (
            <FilaNavegable
              titulo={verArchivados ? 'Ocultar archivados' : `Ver archivados (${numArchivados})`}
              chevron={false}
              valorTenue
              onClick={() => setVerArchivados((v) => !v)}
            />
          )}
          {verArchivados &&
            hallazgosArchivados?.map((h) => (
              <FilaNavegable
                key={h.id}
                titulo={h.termino?.nombre ?? '…'}
                valor="archivado"
                valorTenue
                to={`/hallazgos/${h.id}`}
                state={origen}
              />
            ))}
        </SeccionLista>
      )}

      {!!historialVisitas?.length && (
        <SeccionLista titulo="Historial de visitas">
          {historialVisitas.map((v) => {
            // La fila solo navega (el chevron ya lo dice). Descargar informe
            // y Borrar viven dentro de la visita (detalle / Visita Activa) —
            // así el historial no es un muro de botones. El estado va en
            // `valor` como en las secciones hermanas (prioridad, naturaleza…),
            // no como verbo gris, y el subtítulo se queda solo con el
            // objetivo para que trunque limpio sin comerse el estado.
            const estadoLegible =
              v.estado_captura === 'agendada'
                ? 'planificada'
                : v.estado_captura === 'en_curso'
                  ? 'en curso'
                  : 'cerrada';
            const to =
              v.estado_captura === 'agendada'
                ? `/visita/${v.id}/planificada`
                : v.estado_captura === 'en_curso'
                  ? `/visita/${v.id}`
                  : `/visita/${v.id}/detalle`;
            // En la ficha de cliente el historial mezcla proyectos: se nombra
            // el proyecto de cada visita salvo el General (P9, regla 4). Va
            // DELANTE del objetivo — el subtítulo trunca a una línea y el
            // proyecto es lo que dice "de qué es esta visita".
            const proyectoNombre =
              historialClienteId && v.proyecto && !v.proyecto.es_general ? v.proyecto.nombre : null;
            const subtitulo =
              [proyectoNombre, v.objetivo?.trim() || null].filter(Boolean).join(' · ') || undefined;
            return (
              <FilaNavegable
                key={v.id}
                titulo={fechaCorta(v.fecha)}
                subtitulo={subtitulo}
                valor={estadoLegible}
                valorTenue
                to={to}
                state={origen}
              />
            );
          })}
        </SeccionLista>
      )}
    </>
  );
}
