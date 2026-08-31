import { useState } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { EstadoError } from '@/components/ui/estado-error';
import { AvisoTardando } from '@/components/ui/aviso-tardando';
import { ObjetivoVisitaModal } from '@/features/visita/objetivo-visita-modal';

interface EcosistemaItem {
  termino_id: string;
  naturaleza: string;
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
  const { comercial } = useSesionActual();
  const { iniciarVisita } = useVisitaActivaContext();
  const iniciandoVisita = useAccionAsync();
  const { encolar } = useSyncQueue(undefined);
  const queryClient = useQueryClient();

  // Ventana "¿A qué vas?" para la visita sin planificar (obligatoria).
  const [objetivoModalAbierto, setObjetivoModalAbierto] = useState(false);

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

  const clienteQueryKey = ['cliente', clienteId];
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
    queryFn: async (): Promise<Array<EcosistemaItem & { nombre: string }>> => {
      const { data: items, error } = await supabase
        .from('vw_ecosistema_actual_cliente')
        .select('termino_id, naturaleza')
        .eq('cliente_id', clienteId!)
        .limit(6);
      if (error) throw error;

      const itemsValidos = (items ?? []).filter(
        (i): i is { termino_id: string; naturaleza: string } =>
          i.termino_id !== null && i.naturaleza !== null
      );
      if (!itemsValidos.length) return [];

      const { data: terminos, error: errorTerminos } = await supabase
        .from('termino')
        .select('id, nombre')
        .in('id', itemsValidos.map((i) => i.termino_id));
      if (errorTerminos) throw errorTerminos;

      const nombreById = new Map((terminos ?? []).map((t) => [t.id, t.nombre]));
      return itemsValidos.map((i) => ({ ...i, nombre: nombreById.get(i.termino_id) ?? i.termino_id }));
    },
  });
  const sinConexionEcosistema = isPausedEcosistema && ecosistema === undefined;
  function reintentarEcosistema() {
    queryClient.resetQueries({ queryKey: ecosistemaQueryKey });
    refetchEcosistema();
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
        const { error: errEstado } = await supabase
          .from('visita')
          .update({ estado_captura: 'en_curso' })
          .eq('id', visitaIdAgendada)
          .eq('estado_captura', 'agendada');
        if (errEstado) throw new Error(errEstado.message);
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
  async function iniciarVisitaConObjetivo(objetivo: string) {
    if (!cliente || !comercial) {
      throw new Error('No se ha podido identificar el cliente o tu sesión. Recarga la página.');
    }
    const visitaId = crypto.randomUUID();
    await encolar(visitaId, 'visita', {
      clienteId: cliente.id,
      comercialResponsableId: comercial.id,
      tipoVisita: null,
      objetivo,
    });
    iniciarVisita({ id: visitaId, clienteNombre: cliente.nombre });
    navigate(`/visita/${visitaId}`);
  }

  return (
    <div className="screen">
      <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', alignSelf: 'flex-start' }}>
        ←
      </button>
      {isErrorCliente || sinConexionCliente ? (
        <EstadoError
          mensaje={sinConexionCliente ? 'Sin conexión. Comprueba tu red.' : 'No se pudo cargar el cliente.'}
          onReintentar={reintentarCliente}
        />
      ) : (
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>{cliente?.nombre ?? '…'}</h1>
      )}

      {visitaIdAgendada && (
        <div className="card" style={{ background: 'var(--surface-1)' }}>
          <div className="label" style={{ marginTop: 0 }}>vas a</div>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>
            {visitaAgendada === undefined
              ? 'Cargando…'
              : visitaAgendada.objetivo?.trim() || 'sin objetivo definido'}
          </div>
        </div>
      )}

      {isErrorInterlocutores || sinConexionInterlocutores ? (
        <EstadoError
          mensaje={sinConexionInterlocutores ? 'Sin conexión. Comprueba tu red.' : 'No se pudo cargar los interlocutores conocidos.'}
          onReintentar={reintentarInterlocutores}
        />
      ) : (
        interlocutoresConocidos === undefined ? (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Cargando…</span>
        ) : interlocutoresConocidos.length ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {interlocutoresConocidos.map((i) => (
              <span key={i.id} className="chip" style={{ fontSize: 'var(--text-xs)' }}>
                {i.nombre}{i.cargo ? ` · ${i.cargo}` : ''}
              </span>
            ))}
          </div>
        ) : null
      )}

      {isErrorEcosistema || sinConexionEcosistema ? (
        <EstadoError
          mensaje={sinConexionEcosistema ? 'Sin conexión. Comprueba tu red.' : 'No se pudo cargar el ecosistema.'}
          onReintentar={reintentarEcosistema}
        />
      ) : ecosistema === undefined ? (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Cargando…</span>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ecosistema.map((item) => (
            <span
              key={item.termino_id}
              className={`chip${item.naturaleza === 'riesgo' ? ' chip--riesgo' : item.naturaleza === 'oportunidad' ? ' chip--oportunidad' : ''}`}
            >
              {item.nombre}
            </span>
          ))}
          {!ecosistema.length && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Sin ecosistema registrado todavía</span>}
        </div>
      )}

      {isErrorOportunidad || sinConexionOportunidad ? (
        <EstadoError
          mensaje={sinConexionOportunidad ? 'Sin conexión. Comprueba tu red.' : 'No se pudo cargar la oportunidad activa.'}
          onReintentar={reintentarOportunidad}
        />
      ) : (
        <div className="card">
          <div className="label" style={{ marginTop: 0 }}>oportunidad activa</div>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>
            {oportunidad === undefined ? 'Cargando…' : oportunidad ? `${oportunidad.titulo} · ${oportunidad.prioridad}` : 'ninguna oportunidad activa'}
          </div>
        </div>
      )}

      {isErrorProximoPaso || sinConexionProximoPaso ? (
        <EstadoError
          mensaje={sinConexionProximoPaso ? 'Sin conexión. Comprueba tu red.' : 'No se pudo cargar el próximo paso.'}
          onReintentar={reintentarProximoPaso}
        />
      ) : (
        <div className="card">
          <div className="label" style={{ marginTop: 0 }}>próximo paso pendiente</div>
          <div style={{ fontSize: 'var(--text-base)' }}>
            {proximoPaso === undefined ? 'Cargando…' : proximoPaso ? proximoPaso.descripcion : 'sin próximos pasos pendientes'}
          </div>
        </div>
      )}

      <button
        className="btn btn-primary"
        style={{ marginTop: 'auto' }}
        onClick={visitaIdAgendada ? iniciarVisitaPlanificada : () => setObjetivoModalAbierto(true)}
        disabled={iniciandoVisita.cargando}
      >
        {iniciandoVisita.cargando ? 'Iniciando…' : 'Iniciar visita →'}
      </button>
      {iniciandoVisita.error && <div className="field-error-text">{iniciandoVisita.error}</div>}
      <AvisoTardando visible={iniciandoVisita.tardando} />

      {objetivoModalAbierto && (
        <ObjetivoVisitaModal
          clienteNombre={cliente?.nombre}
          onConfirmar={iniciarVisitaConObjetivo}
          onCerrar={() => setObjetivoModalAbierto(false)}
        />
      )}
    </div>
  );
}
