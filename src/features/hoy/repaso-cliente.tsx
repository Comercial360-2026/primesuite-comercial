import { useState } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { conReintentoDeSesion } from '@/lib/con-reintento-de-sesion';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { EstadoError } from '@/components/ui/estado-error';
import { AvisoTardando } from '@/components/ui/aviso-tardando';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaDato } from '@/components/ui/fila-dato';
import { EcoTag } from '@/components/ui/eco-tag';
import { Icono } from '@/components/ui/iconos';
import { cargarEcosistemaCliente } from '@/lib/ecosistema';
import { fechaCorta } from '@/lib/fechas';
import { etiqueta, PRIORIDAD_LABEL } from '@/lib/etiquetas-visita';
import { useVolverA } from '@/lib/volver-a';
import { uuid } from '@/lib/uuid';
import { ObjetivoVisitaModal } from '@/features/visita/objetivo-visita-modal';
import { crearProyectoRapido } from '@/lib/crear-proyecto-rapido';
import { VisitaEnCursoModal } from '@/features/visita/visita-en-curso-modal';
import { useAvisoVisitaEnCurso } from '@/hooks/use-aviso-visita-en-curso';

interface NotaReciente {
  id: string;
  titulo: string | null;
  contenido_texto: string | null;
  creado_en: string;
}

interface OportunidadActiva {
  id: string;
  titulo: string;
  prioridad: string;
}

interface ProximoPasoPendiente {
  descripcion: string;
  fecha_objetivo: string | null;
}

// Se lee en 30 segundos: solo tres bloques, sin exigir scroll, tal como se
// validó en el wireframe — nada de histórico completo aquí, eso vive en
// Ficha de cliente.
export function RepasoCliente() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const [searchParams] = useSearchParams();
  const visitaIdAgendada = searchParams.get('visitaId');
  const navigate = useNavigate();
  // Se llega desde Hoy, desde la visita planificada o desde el aviso global
  // de visita próxima (puede saltar desde cualquier pantalla). El ← vuelve
  // al origen real; si no consta, a Hoy.
  const volver = useVolverA('/');
  const { comercial } = useSesionActual();
  const { iniciarVisita } = useVisitaActivaContext();
  const iniciandoVisita = useAccionAsync();
  const { encolar } = useSyncQueue(undefined);
  const queryClient = useQueryClient();

  // Ventana "¿A qué vas?" para la visita sin planificar (obligatoria), y
  // aviso previo si ya hay una visita en curso con este cliente.
  const [objetivoModalAbierto, setObjetivoModalAbierto] = useState(false);
  const [enCursoModalAbierto, setEnCursoModalAbierto] = useState(false);
  const { data: visitaEnCurso } = useAvisoVisitaEnCurso(clienteId, comercial?.id);

  function pedirIniciarVisitaAdHoc() {
    if (visitaEnCurso) setEnCursoModalAbierto(true);
    else setObjetivoModalAbierto(true);
  }

  // Proyecto (línea de negocio) al que va la visita. Si el cliente solo
  // tiene uno, la visita va a ese sin preguntar; si tiene 2+, la ventana
  // "¿A qué vas?" pide a cuál — mismo selector que "Iniciar visita ahora"
  // desde la ficha; aquí no se dibuja nada suelto.
  const { data: proyectosCliente } = useQuery({
    queryKey: ['proyectos-cliente-repaso', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<Array<{ id: string; nombre: string; estado: string }>> => {
      // Excluye 'terminado' del selector de objetivo — mismo filtro que ya
      // aplican empezar-visita-hoja.tsx y planificar-visita.tsx al mismo
      // destino; sin él, un proyecto terminado más antiguo podía quedar
      // preseleccionado por defecto sobre uno activo más reciente.
      const { data, error } = await supabase
        .from('proyecto')
        .select('id, nombre, estado')
        .eq('cliente_id', clienteId!)
        .neq('estado', 'terminado')
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Si venimos de una visita ya planificada, traemos su objetivo para
  // recordar "a qué vengo" antes de entrar.
  const { data: visitaAgendada } = useQuery({
    queryKey: ['visita-agendada-objetivo', visitaIdAgendada],
    enabled: !!visitaIdAgendada,
    queryFn: async (): Promise<{ objetivo: string | null }> => {
      const { data, error } = await supabase
        .from('visita')
        .select('objetivo')
        .eq('id', visitaIdAgendada!)
        .maybeSingle();
      if (error) throw error;
      return data ?? { objetivo: null };
    },
  });

  // Clave distinta de ['cliente', clienteId] (la de Ficha de cliente, con
  // más columnas): con la misma clave, TanStack Query serviría aquí o allá
  // la caché de la otra pantalla — bug real de fondo, no hipotético, visto
  // al navegar Ficha de proyecto → Ficha de cliente con la misma clave que
  // usaba esta pantalla.
  const clienteQueryKey = ['cliente-nombre', clienteId];
  const {
    data: cliente,
    isError: isErrorCliente,
    isPaused: isPausedCliente,
    refetch: refetchCliente,
  } = useQuery({
    queryKey: clienteQueryKey,
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.from('cliente').select('id, nombre').eq('id', clienteId!).single();
      if (error) throw error;
      return data;
    },
  });
  // isPaused: ver nota en agenda-del-dia.tsx / listado-clientes.tsx —
  // TanStack Query pausa en vez de marcar error cuando decide que la red
  // no es fiable, y sin este caso la sección se queda en blanco.
  const sinConexionCliente = isPausedCliente && cliente === undefined;
  // reintentar() en vez de refetch() a secas: una consulta "paused" no
  // siempre reacciona a un refetch() manual — resetQueries fuerza un
  // intento realmente nuevo, verificado en pruebas reales de red rota.
  function reintentarCliente() {
    queryClient.resetQueries({ queryKey: clienteQueryKey });
    refetchCliente();
  }

  const ecosistemaQueryKey = ['ecosistema-actual', clienteId];
  const {
    data: ecosistema,
    isError: isErrorEcosistema,
    isPaused: isPausedEcosistema,
    refetch: refetchEcosistema,
  } = useQuery({
    queryKey: ecosistemaQueryKey,
    enabled: !!clienteId,
    queryFn: () => cargarEcosistemaCliente(clienteId!, 6),
  });
  const sinConexionEcosistema = isPausedEcosistema && ecosistema === undefined;
  function reintentarEcosistema() {
    queryClient.resetQueries({ queryKey: ecosistemaQueryKey });
    refetchEcosistema();
  }

  // Últimas notas del cliente (PM11 Fase 4): lo que se anotó en visitas
  // pasadas y no se marcó como hallazgo ni oportunidad. Solo lectura —
  // el repaso se lee de un vistazo, no navega a ningún sitio.
  const notasQueryKey = ['notas-recientes-cliente', clienteId];
  const {
    data: notasRecientes,
    isError: isErrorNotas,
    isPaused: isPausedNotas,
    refetch: refetchNotas,
  } = useQuery({
    queryKey: notasQueryKey,
    enabled: !!clienteId,
    queryFn: async (): Promise<NotaReciente[]> => {
      const { data, error } = await supabase
        .from('captura_libre')
        .select('id, titulo, contenido_texto, creado_en, visita:visita_id!inner(cliente_id)')
        .eq('visita.cliente_id', clienteId!)
        .eq('tipo', 'nota')
        .order('creado_en', { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as unknown as NotaReciente[];
    },
  });
  const sinConexionNotas = isPausedNotas && notasRecientes === undefined;
  function reintentarNotas() {
    queryClient.resetQueries({ queryKey: notasQueryKey });
    refetchNotas();
  }

  const interlocutoresQueryKey = ['interlocutores-cliente', clienteId];
  const {
    data: interlocutoresConocidos,
    isError: isErrorInterlocutores,
    isPaused: isPausedInterlocutores,
    refetch: refetchInterlocutores,
  } = useQuery({
    queryKey: interlocutoresQueryKey,
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interlocutor')
        .select('id, nombre, cargo')
        .eq('cliente_id', clienteId!)
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data;
    },
  });
  const sinConexionInterlocutores = isPausedInterlocutores && interlocutoresConocidos === undefined;
  function reintentarInterlocutores() {
    queryClient.resetQueries({ queryKey: interlocutoresQueryKey });
    refetchInterlocutores();
  }

  const oportunidadQueryKey = ['oportunidad-activa', clienteId];
  const {
    data: oportunidad,
    isError: isErrorOportunidad,
    isPaused: isPausedOportunidad,
    refetch: refetchOportunidad,
  } = useQuery({
    queryKey: oportunidadQueryKey,
    enabled: !!clienteId,
    queryFn: async (): Promise<OportunidadActiva | null> => {
      const { data, error } = await supabase
        .from('oportunidad')
        .select('id, titulo, prioridad')
        .eq('cliente_id', clienteId!)
        .not('etapa', 'in', '(ganada,perdida,descartada)')
        .order('prioridad', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const sinConexionOportunidad = isPausedOportunidad && oportunidad === undefined;
  function reintentarOportunidad() {
    queryClient.resetQueries({ queryKey: oportunidadQueryKey });
    refetchOportunidad();
  }

  const proximoPasoQueryKey = ['proximo-paso-pendiente', clienteId];
  const {
    data: proximoPaso,
    isError: isErrorProximoPaso,
    isPaused: isPausedProximoPaso,
    refetch: refetchProximoPaso,
  } = useQuery({
    queryKey: proximoPasoQueryKey,
    enabled: !!clienteId,
    queryFn: async (): Promise<ProximoPasoPendiente | null> => {
      const { data, error } = await supabase
        .from('proximo_paso')
        .select('descripcion, fecha_objetivo, visita:visita_id!inner(cliente_id)')
        .eq('visita.cliente_id', clienteId!)
        .eq('estado', 'pendiente')
        .order('fecha_objetivo', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ProximoPasoPendiente | null;
    },
  });
  const sinConexionProximoPaso = isPausedProximoPaso && proximoPaso === undefined;
  function reintentarProximoPaso() {
    queryClient.resetQueries({ queryKey: proximoPasoQueryKey });
    refetchProximoPaso();
  }

  // Visita YA planificada: al empezarla de verdad pasa de 'agendada' a
  // 'en_curso'. El objetivo ya se fijó al planificarla, así que no se
  // vuelve a preguntar. El filtro es por estado para no re-lanzar visitas
  // que ya se estaban capturando o ya se cerraron. Requiere red — una
  // visita agendada solo existe en el servidor, nunca en la cola local.
  async function iniciarVisitaPlanificada() {
    await iniciandoVisita.ejecutar(
      async () => {
        if (!cliente || !comercial || !visitaIdAgendada) {
          throw new Error('No se ha podido identificar el cliente o tu sesión. Recarga la página.');
        }
        // Sin permiso, o si otro comercial ya la empezó primero, el UPDATE
        // no da error — "tiene éxito" afectando a 0 filas (mismo encargo
        // técnico que el resto de guardados, ver
        // adenda_punto1_delete_silencioso.md). Comprobar `count` es la
        // única forma de no meter al comercial en una visita que en
        // realidad no se ha marcado "en curso".
        await conReintentoDeSesion(
          () =>
            supabase
              .from('visita')
              .update({ estado_captura: 'en_curso' }, { count: 'exact' })
              .eq('id', visitaIdAgendada)
              .eq('estado_captura', 'agendada'),
          'No se ha podido empezar la visita (puede que ya la haya empezado otro, o que no tengas permiso).'
        );
        return { visitaId: visitaIdAgendada, clienteNombre: cliente.nombre };
      },
      {
        onExito: ({ visitaId, clienteNombre }) => {
          iniciarVisita({ id: visitaId, clienteNombre });
          navigate(`/visita/${visitaId}`);
        },
      }
    );
  }

  // Visita SIN planificar: la lanza la ventana "¿A qué vas?" con el objetivo
  // ya escrito. Se encola (funciona con o sin red, ver lib/offline-queue).
  // Lanza en caso de fallo para que la ventana muestre el error.
  async function iniciarVisitaConObjetivo(objetivo: string, proyectoElegido: string) {
    if (!cliente || !comercial) {
      throw new Error('No se ha podido identificar el cliente o tu sesión. Recarga la página.');
    }
    const visitaId = uuid();
    await encolar(visitaId, 'visita', {
      clienteId: cliente.id,
      proyectoId: proyectoElegido || undefined,
      comercialResponsableId: comercial.id,
      tipoVisita: null,
      objetivo,
    });
    iniciarVisita({ id: visitaId, clienteNombre: cliente.nombre });
    navigate(`/visita/${visitaId}`);
  }

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo={cliente?.nombre ?? '…'}
        subtitulo="Preparar la visita"
        ayuda="repaso-cliente"
        volverA={volver}
      />
      <div className="screen__scroll">
      <div className="lista-agrupada">
      {(isErrorCliente || sinConexionCliente) && (
        <EstadoError
          mensaje={sinConexionCliente ? 'Sin conexión. Comprueba tu red.' : 'No se pudo cargar el cliente.'}
          onReintentar={reintentarCliente}
        />
      )}

      {visitaIdAgendada && (
        <div className="ficha-vitals">
          <span>
            Vas a: <b>{visitaAgendada === undefined ? 'cargando…' : visitaAgendada.objetivo?.trim() || 'sin objetivo definido'}</b>
          </span>
        </div>
      )}

      {isErrorInterlocutores || sinConexionInterlocutores ? (
        <EstadoError
          mensaje={sinConexionInterlocutores ? 'Sin conexión. Comprueba tu red.' : 'No se pudo cargar los interlocutores conocidos.'}
          onReintentar={reintentarInterlocutores}
        />
      ) : (
        !!interlocutoresConocidos?.length && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {interlocutoresConocidos.map((i) => (
              <span key={i.id} className="chip" style={{ fontSize: 'var(--text-xs)' }}>
                {i.nombre}{i.cargo ? ` · ${i.cargo}` : ''}
              </span>
            ))}
          </div>
        )
      )}

      {isErrorEcosistema || sinConexionEcosistema ? (
        <EstadoError
          mensaje={sinConexionEcosistema ? 'Sin conexión. Comprueba tu red.' : 'No se pudo cargar el ecosistema.'}
          onReintentar={reintentarEcosistema}
        />
      ) : (
        <SeccionLista titulo="Ecosistema">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px var(--fila-pad-x)' }}>
            {ecosistema === undefined ? (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Cargando…</span>
            ) : ecosistema.length ? (
              ecosistema.map((item) => (
                <EcoTag key={item.clave} nombre={item.nombre} tipo={item.tipo} />
              ))
            ) : (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Sin ecosistema registrado todavía</span>
            )}
          </div>
        </SeccionLista>
      )}

      {isErrorNotas || sinConexionNotas ? (
        <EstadoError
          mensaje={sinConexionNotas ? 'Sin conexión. Comprueba tu red.' : 'No se pudieron cargar las notas.'}
          onReintentar={reintentarNotas}
        />
      ) : (
        !!notasRecientes?.length && (
          <SeccionLista titulo="Notas">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px var(--fila-pad-x)' }}>
              {notasRecientes.map((n) => (
                <div key={n.id} style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-700)' }}>
                  {n.titulo && <b>{n.titulo}. </b>}
                  {n.contenido_texto?.trim() || '(nota sin texto)'}
                  <span style={{ color: 'var(--ink-400)' }}> · {fechaCorta(n.creado_en)}</span>
                </div>
              ))}
            </div>
          </SeccionLista>
        )
      )}

      {(isErrorOportunidad || sinConexionOportunidad) && (
        <EstadoError
          mensaje={sinConexionOportunidad ? 'Sin conexión. Comprueba tu red.' : 'No se pudo cargar la oportunidad activa.'}
          onReintentar={reintentarOportunidad}
        />
      )}
      {(isErrorProximoPaso || sinConexionProximoPaso) && (
        <EstadoError
          mensaje={sinConexionProximoPaso ? 'Sin conexión. Comprueba tu red.' : 'No se pudo cargar el próximo paso.'}
          onReintentar={reintentarProximoPaso}
        />
      )}
      {(!(isErrorOportunidad || sinConexionOportunidad) || !(isErrorProximoPaso || sinConexionProximoPaso)) && (
        <SeccionLista titulo="Antes de entrar">
          {!(isErrorOportunidad || sinConexionOportunidad) && (
            <FilaDato
              etiqueta="Oportunidad activa"
              valor={
                oportunidad === undefined
                  ? 'Cargando…'
                  : oportunidad
                    ? `${oportunidad.titulo} · ${etiqueta(PRIORIDAD_LABEL, oportunidad.prioridad).toLowerCase()}`
                    : 'ninguna'
              }
              valorTenue={!oportunidad}
            />
          )}
          {!(isErrorProximoPaso || sinConexionProximoPaso) && (
            <FilaDato
              etiqueta="Próximo paso"
              valor={proximoPaso === undefined ? 'Cargando…' : proximoPaso ? proximoPaso.descripcion : 'sin pendientes'}
              valorTenue={!proximoPaso}
            />
          )}
        </SeccionLista>
      )}

      </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={visitaIdAgendada ? iniciarVisitaPlanificada : pedirIniciarVisitaAdHoc}
        disabled={iniciandoVisita.cargando}
      >
        {iniciandoVisita.cargando ? (
          'Iniciando…'
        ) : (
          <>
            Iniciar visita
            <Icono nombre="chevron" size={18} />
          </>
        )}
      </button>
      {iniciandoVisita.error && <div className="field-error-text">{iniciandoVisita.error}</div>}
      <AvisoTardando visible={iniciandoVisita.tardando} />

      {enCursoModalAbierto && visitaEnCurso && (
        <VisitaEnCursoModal
          clienteNombre={visitaEnCurso.clienteNombre}
          objetivo={visitaEnCurso.objetivo}
          proyectoNombre={visitaEnCurso.proyectoNombre}
          enCursoDesde={visitaEnCurso.enCursoDesde}
          onContinuar={() => navigate(`/visita/${visitaEnCurso.id}`)}
          onEmpezarOtra={() => {
            setEnCursoModalAbierto(false);
            setObjetivoModalAbierto(true);
          }}
          onCerrar={() => setEnCursoModalAbierto(false)}
        />
      )}

      {objetivoModalAbierto && (
        <ObjetivoVisitaModal
          clienteNombre={cliente?.nombre}
          proyectos={proyectosCliente}
          proyectoInicial={proyectosCliente?.[0]?.id}
          onCrearProyecto={
            clienteId ? (nombreProy) => crearProyectoRapido(clienteId, nombreProy, encolar) : undefined
          }
          onConfirmar={iniciarVisitaConObjetivo}
          onCerrar={() => setObjetivoModalAbierto(false)}
        />
      )}
    </div>
  );
}
