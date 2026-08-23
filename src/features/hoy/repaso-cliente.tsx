import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';

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

  const { data: cliente } = useQuery({
    queryKey: ['cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.from('cliente').select('id, nombre').eq('id', clienteId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: ecosistema } = useQuery({
    queryKey: ['ecosistema-actual', clienteId],
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

  const { data: oportunidad } = useQuery({
    queryKey: ['oportunidad-activa', clienteId],
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

  const { data: proximoPaso } = useQuery({
    queryKey: ['proximo-paso-pendiente', clienteId],
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
      <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>{cliente?.nombre ?? '…'}</h1>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ecosistema?.map((item) => (
          <span
            key={item.termino_id}
            className={`chip${item.naturaleza === 'riesgo' ? ' chip--riesgo' : item.naturaleza === 'oportunidad' ? ' chip--oportunidad' : ''}`}
          >
            {item.nombre}
          </span>
        ))}
        {!ecosistema?.length && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Sin ecosistema registrado todavía</span>}
      </div>

      <div className="card">
        <div className="label" style={{ marginTop: 0 }}>oportunidad activa</div>
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>
          {oportunidad ? `${oportunidad.titulo} · ${oportunidad.prioridad}` : 'ninguna oportunidad activa'}
        </div>
      </div>

      <div className="card">
        <div className="label" style={{ marginTop: 0 }}>próximo paso pendiente</div>
        <div style={{ fontSize: 'var(--text-base)' }}>
          {proximoPaso ? proximoPaso.descripcion : 'sin próximos pasos pendientes'}
        </div>
      </div>

      <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={iniciarLaVisita}>
        iniciar visita →
      </button>
    </div>
  );
}
