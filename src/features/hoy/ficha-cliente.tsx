import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';

interface OportunidadActiva {
  id: string;
  titulo: string;
  prioridad: string;
}

interface ProximoPasoPendiente {
  id: string;
  descripcion: string;
  fecha_objetivo: string | null;
}

interface EcosistemaItem {
  termino_id: string;
  naturaleza: string;
}

export function FichaCliente() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const navigate = useNavigate();
  const { comercial } = useSesionActual();
  const { iniciarVisita } = useVisitaActivaContext();
  const { encolar } = useSyncQueue(undefined);

  const { data: cliente } = useQuery({
    queryKey: ['cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cliente')
        .select('id, nombre, estado_relacion, sector')
        .eq('id', clienteId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: semaforo } = useQuery({
    queryKey: ['semaforo-cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_semaforo_cliente')
        .select('semaforo, ultima_visita')
        .eq('cliente_id', clienteId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: oportunidades } = useQuery({
    queryKey: ['oportunidades-activas', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<OportunidadActiva[]> => {
      const { data, error } = await supabase
        .from('oportunidad')
        .select('id, titulo, prioridad')
        .eq('cliente_id', clienteId!)
        .not('etapa', 'in', '(ganada,perdida,descartada)')
        .order('creado_en', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: proximosPasos } = useQuery({
    queryKey: ['proximos-pasos-cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<ProximoPasoPendiente[]> => {
      const { data, error } = await supabase
        .from('proximo_paso')
        .select('id, descripcion, fecha_objetivo, visita:visita_id!inner(cliente_id)')
        .eq('visita.cliente_id', clienteId!)
        .eq('estado', 'pendiente')
        .order('fecha_objetivo', { ascending: true })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as unknown as ProximoPasoPendiente[];
    },
  });

  const { data: ecosistema } = useQuery({
    queryKey: ['ecosistema-completo', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<Array<EcosistemaItem & { nombre: string }>> => {
      const { data: items, error } = await supabase
        .from('vw_ecosistema_actual_cliente')
        .select('termino_id, naturaleza')
        .eq('cliente_id', clienteId!);
      if (error) throw error;

      // La vista permite termino_id/naturaleza nulos a nivel de tipo (columnas
      // derivadas); en la práctica nunca lo son para una fila real, pero hay
      // que filtrarlo explícitamente para que el tipo se estreche a `string`.
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

  async function iniciarVisitaAdHoc() {
    if (!cliente || !comercial) return;
    const visitaId = crypto.randomUUID();
    await encolar(visitaId, 'visita', {
      clienteId: cliente.id,
      comercialResponsableId: comercial.id,
      tipoVisita: null,
    });
    iniciarVisita({ id: visitaId, clienteNombre: cliente.nombre });
    navigate(`/visita/${visitaId}`);
  }

  return (
    <div className="screen screen--split">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate('/clientes')} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 500 }}>{cliente?.nombre ?? '…'}</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
            {cliente?.estado_relacion} {cliente?.sector ? `· ${cliente.sector}` : ''}
          </div>
        </div>
        {semaforo && <span className={`chip chip--${semaforo.semaforo}`}>{semaforo.semaforo}</span>}
      </div>

      <div className="screen__scroll">
        <div className="card">
          <div className="label" style={{ marginTop: 0 }}>oportunidades activas</div>
          {oportunidades?.length ? (
            oportunidades.map((o) => (
              <div
                key={o.id}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer' }}
                onClick={() => navigate(`/oportunidades/${o.id}`)}
              >
                <span style={{ fontSize: 'var(--text-base)' }}>{o.titulo}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--signal-600)', fontWeight: 500 }}>{o.prioridad}</span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>ninguna oportunidad activa</div>
          )}

          <div style={{ borderTop: '1px solid var(--ink-100)', margin: '12px 0' }} />
          <div className="label" style={{ marginTop: 0 }}>próximos pasos</div>
          {proximosPasos?.length ? (
            proximosPasos.map((p) => (
              <div key={p.id} style={{ fontSize: 'var(--text-base)', padding: '4px 0' }}>
                {p.descripcion}
                {p.fecha_objetivo && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                    {' '}· {new Date(p.fecha_objetivo).toLocaleDateString('es-ES')}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>sin próximos pasos pendientes</div>
          )}

          <div style={{ borderTop: '1px solid var(--ink-100)', margin: '12px 0' }} />
          <div className="label" style={{ marginTop: 0 }}>última actividad</div>
          <div style={{ fontSize: 'var(--text-base)' }}>
            {semaforo?.ultima_visita
              ? new Date(semaforo.ultima_visita).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
              : 'sin visitas registradas'}
          </div>
        </div>

        <div className="label">ecosistema</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ecosistema?.map((item) => (
            <span
              key={item.termino_id}
              className={`chip${item.naturaleza === 'riesgo' ? ' chip--riesgo' : item.naturaleza === 'oportunidad' ? ' chip--oportunidad' : ''}`}
            >
              {item.nombre}
            </span>
          ))}
          {!ecosistema?.length && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>sin ecosistema registrado todavía</span>}
        </div>
      </div>

      <button className="btn btn-primary" onClick={iniciarVisitaAdHoc}>
        iniciar visita →
      </button>
    </div>
  );
}
