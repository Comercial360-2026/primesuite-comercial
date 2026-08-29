import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { EstadoError } from '@/components/ui/estado-error';

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
  const { encolar } = useSyncQueue(undefined);
  const queryClient = useQueryClient();

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

  async function iniciarLaVisita() {
    if (!cliente || !comercial) return;

    let visitaId = visitaIdAgendada;
    if (!visitaId) {
      // Visita no agendada: se genera el id en cliente y se encola —
      // funciona igual con o sin red (ver lib/offline-queue).
      visitaId = crypto.randomUUID();
      await encolar(visitaId, 'visita', {
        clienteId: cliente.id,
        comercialResponsableId: comercial.id,
        tipoVisita: null,
      });
    }

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

      <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={iniciarLaVisita}>
        Iniciar visita →
      </button>
    </div>
  );
}
