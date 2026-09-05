import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta, haceRelativo } from '@/lib/fechas';
import { uuid } from '@/lib/uuid';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useVisitaEnCursoCliente } from '@/hooks/use-visita-en-curso-cliente';
import { ObjetivoVisitaModal } from '@/features/visita/objetivo-visita-modal';
import { VisitaEnCursoModal } from '@/features/visita/visita-en-curso-modal';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Icono } from '@/components/ui/iconos';
import { etiqueta, PRIORIDAD_LABEL, ETAPA_LABEL, NATURALEZA_LABEL } from '@/lib/etiquetas-visita';

// Ficha de proyecto — Fase 3 del plan Cliente → Proyecto → Visita. Es lo
// que antes vivía directamente en la ficha de cliente (oportunidades,
// próximos pasos, historial, planificar/iniciar visita): al meter proyecto
// en medio, todo eso pasa a colgar de AQUÍ, porque una visita ahora
// pertenece a un proyecto concreto, no solo a un cliente.

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

export function FichaProyecto() {
  const { clienteId, proyectoId } = useParams<{ clienteId: string; proyectoId: string }>();
  const navigate = useNavigate();
  const { comercial } = useSesionActual();
  const { iniciarVisita } = useVisitaActivaContext();
  const { encolar } = useSyncQueue(undefined);

  // Ventana "¿A qué vas?" antes de arrancar una visita sobre la marcha — el
  // objetivo es obligatorio también aquí, igual que al planificar. Antes, si
  // ya hay una visita en curso con este cliente (en cualquiera de sus
  // proyectos), se avisa (enCursoModal).
  const [objetivoAdHocAbierto, setObjetivoAdHocAbierto] = useState(false);
  const [enCursoModalAbierto, setEnCursoModalAbierto] = useState(false);
  const { data: visitaEnCurso } = useVisitaEnCursoCliente(clienteId);

  function pedirIniciarVisitaAdHoc() {
    if (visitaEnCurso) setEnCursoModalAbierto(true);
    else setObjetivoAdHocAbierto(true);
  }

  // Clave distinta de ['cliente', clienteId] (la que usa Ficha de cliente,
  // con más columnas) — mismo cliente_id pero forma de datos distinta; con
  // la misma clave, TanStack Query serviría aquí la caché de la otra
  // pantalla (o al revés), mostrando "undefined" en campos que esta consulta
  // nunca pidió. Bug real, detectado navegando en vivo entre las dos fichas.
  const { data: cliente } = useQuery({
    queryKey: ['cliente-nombre', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cliente')
        .select('id, nombre')
        .eq('id', clienteId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: proyecto } = useQuery({
    queryKey: ['proyecto', proyectoId],
    enabled: !!proyectoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proyecto')
        .select('id, nombre, estado')
        .eq('id', proyectoId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Recuento total de visitas de ESTE proyecto (P11) — historialVisitas está
  // limitado a 10 para no cargar de más, así que hace falta una consulta
  // aparte para el número real.
  const { data: totalVisitas } = useQuery({
    queryKey: ['total-visitas-proyecto', proyectoId],
    enabled: !!proyectoId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('visita')
        .select('id', { count: 'exact', head: true })
        .eq('proyecto_id', proyectoId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: oportunidades } = useQuery({
    queryKey: ['oportunidades-activas-proyecto', proyectoId],
    enabled: !!proyectoId,
    queryFn: async (): Promise<OportunidadActiva[]> => {
      const { data, error } = await supabase
        .from('oportunidad')
        .select('id, titulo, prioridad, etapa, valor_estimado')
        .eq('proyecto_id', proyectoId!)
        .not('etapa', 'in', '(ganada,perdida,descartada)')
        .order('creado_en', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: proximosPasos } = useQuery({
    queryKey: ['proximos-pasos-proyecto', proyectoId],
    enabled: !!proyectoId,
    queryFn: async (): Promise<ProximoPasoPendiente[]> => {
      const { data, error } = await supabase
        .from('proximo_paso')
        .select('id, descripcion, fecha_objetivo')
        .eq('proyecto_id', proyectoId!)
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
  // subconjunto "abierto" como en Oportunidades/Próximos pasos. Antes de
  // esta sección no había NINGÚN sitio en la app donde un hallazgo propio
  // fuera navegable (hueco encontrado revisando la pantalla de detalle).
  const { data: hallazgos } = useQuery({
    queryKey: ['hallazgos-proyecto', proyectoId],
    enabled: !!proyectoId,
    queryFn: async (): Promise<HallazgoAbierto[]> => {
      const { data, error } = await supabase
        .from('hallazgo')
        .select('id, naturaleza, fecha_relevante, termino:termino_id(nombre)')
        .eq('proyecto_id', proyectoId!)
        .order('creado_en', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as HallazgoAbierto[];
    },
  });

  // La lanza la ventana "¿A qué vas?" (ObjetivoVisitaModal) — de ahí llega
  // el `objetivo`, ya validado como no vacío. Lanza en caso de fallo para
  // que la propia ventana muestre el error; si va bien, navega y la ventana
  // se desmonta con la pantalla.
  async function iniciarVisitaAdHoc(objetivo: string) {
    if (!cliente || !comercial || !proyectoId) {
      throw new Error('No se ha podido identificar el proyecto o tu sesión. Recarga la página.');
    }
    const visitaId = uuid();
    await encolar(visitaId, 'visita', {
      clienteId: cliente.id,
      proyectoId,
      comercialResponsableId: comercial.id,
      tipoVisita: null,
      objetivo,
    });
    iniciarVisita({ id: visitaId, clienteNombre: cliente.nombre });
    navigate(`/visita/${visitaId}`);
  }

  const { data: historialVisitas } = useQuery({
    queryKey: ['historial-visitas-proyecto', proyectoId],
    enabled: !!proyectoId,
    queryFn: async (): Promise<VisitaHistorial[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, tipo_visita, objetivo, estado_captura')
        .eq('proyecto_id', proyectoId!)
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

  // Línea de contexto (regla 6: siempre visible, sin depender de "volver").
  // "N.ª visita" es nueva (P11 del plan de datos): antes no existía en
  // ninguna pantalla, y aquí es un recuento retrospectivo del proyecto, no
  // el ordinal de "la visita en la que estás" (eso es Visita activa).
  const ultimaVisitaProyecto = historialVisitas?.[0]?.fecha;
  const contextoLinea = [
    proyecto?.estado,
    totalVisitas !== undefined
      ? totalVisitas === 0
        ? 'sin visitas todavía'
        : `${totalVisitas} visita${totalVisitas === 1 ? '' : 's'}`
      : null,
    ultimaVisitaProyecto ? `última hace ${haceRelativo(ultimaVisitaProyecto)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo={proyecto?.nombre ?? '…'}
        ayuda="ficha-proyecto"
        subtitulo={cliente?.nombre}
        volverA={`/clientes/${clienteId}`}
      />

      <div className="screen__scroll">
       {contextoLinea && (
         <div className="ficha-vitals">
           <span>{contextoLinea}</span>
         </div>
       )}
       <div className="lista-agrupada">
        {listasCargadas && fichaVacia ? (
          <EstadoLista
            estado="vacio"
            mensaje="Todavía no hay nada registrado en este proyecto. Empieza una visita para llenarlo."
          />
        ) : (
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
                  const vencido =
                    !!p.fecha_objetivo && new Date(p.fecha_objetivo).getTime() < hoyMs;
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
                  // La fila solo navega. Descargar informe y Borrar viven
                  // dentro de la visita (detalle / Visita Activa) — así el
                  // historial no es un muro de botones.
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
        )}
       </div>
      </div>

      {/* Iniciar visita ahora es lo diario (regla 3): botón primario.
          Planificar para otro día es esporádico → chip, y abre el flujo
          único /planificar ya apuntando a este cliente y proyecto. */}
      <button className="btn btn-primary" onClick={pedirIniciarVisitaAdHoc}>
        Iniciar visita ahora
        <Icono nombre="chevron" size={18} />
      </button>
      <button
        type="button"
        className="chip"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigate(`/planificar?clienteId=${clienteId}&proyectoId=${proyectoId}`)}
      >
        Planificar para otro día
      </button>

      {enCursoModalAbierto && visitaEnCurso && (
        <VisitaEnCursoModal
          clienteNombre={cliente?.nombre}
          objetivo={visitaEnCurso.objetivo}
          onContinuar={() => navigate(`/visita/${visitaEnCurso.id}`)}
          onEmpezarOtra={() => {
            setEnCursoModalAbierto(false);
            setObjetivoAdHocAbierto(true);
          }}
          onCerrar={() => setEnCursoModalAbierto(false)}
        />
      )}

      {objetivoAdHocAbierto && (
        <ObjetivoVisitaModal
          clienteNombre={cliente?.nombre}
          onConfirmar={iniciarVisitaAdHoc}
          onCerrar={() => setObjetivoAdHocAbierto(false)}
        />
      )}
    </div>
  );
}
