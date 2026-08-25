import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';

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

interface VisitaHistorial {
  id: string;
  fecha: string;
  tipo_visita: string | null;
  estado_captura: string;
}

interface PrevisualizacionBorrado {
  num_fotos: number;
  num_audios: number;
  num_notas: number;
  num_hallazgos: number;
  num_oportunidades: number;
  num_proximos_pasos: number;
  rutas_storage: string[] | null;
}

export function FichaCliente() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const navigate = useNavigate();
  const { comercial } = useSesionActual();
  const { iniciarVisita } = useVisitaActivaContext();
  const { encolar } = useSyncQueue(undefined);
  const iniciandoVisita = useAccionAsync();
  const queryClient = useQueryClient();

  const [visitaBorrarId, setVisitaBorrarId] = useState<string | null>(null);
  const [previsualizacion, setPrevisualizacion] = useState<PrevisualizacionBorrado | null>(null);
  const previsualizando = useAccionAsync();
  const borrandoVisita = useAccionAsync();

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
    await iniciandoVisita.ejecutar(
      async () => {
        if (!cliente || !comercial) {
          throw new Error('No se ha podido identificar el cliente o tu sesión. Recarga la página.');
        }
        const visitaId = crypto.randomUUID();
        await encolar(visitaId, 'visita', {
          clienteId: cliente.id,
          comercialResponsableId: comercial.id,
          tipoVisita: null,
        });
        return { visitaId, clienteNombre: cliente.nombre };
      },
      {
        onExito: ({ visitaId, clienteNombre }) => {
          iniciarVisita({ id: visitaId, clienteNombre });
          navigate(`/visita/${visitaId}`);
        },
      }
    );
  }

  const { data: historialVisitas } = useQuery({
    queryKey: ['historial-visitas', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<VisitaHistorial[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, tipo_visita, estado_captura')
        .eq('cliente_id', clienteId!)
        .order('fecha', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function pedirPrevisualizacion(visitaId: string) {
    setVisitaBorrarId(visitaId);
    setPrevisualizacion(null);
    await previsualizando.ejecutar(async () => {
      const { data, error } = await supabase
        .rpc('previsualizar_borrado_visita', { p_visita_id: visitaId })
        .single();
      if (error) throw new Error(error.message);
      return data as PrevisualizacionBorrado;
    }, {
      onExito: (data) => setPrevisualizacion(data),
    });
  }

  function cancelarBorrado() {
    setVisitaBorrarId(null);
    setPrevisualizacion(null);
    previsualizando.limpiarError();
    borrandoVisita.limpiarError();
  }

  async function confirmarBorradoVisita() {
    if (!visitaBorrarId) return;
    const rutas = previsualizacion?.rutas_storage ?? [];

    await borrandoVisita.ejecutar(
      async () => {
        const { error } = await supabase.rpc('eliminar_visita_completa', { p_visita_id: visitaBorrarId });
        if (error) throw new Error(error.message);

        if (rutas.length) {
          await Promise.all([
            supabase.storage.from('fotos-visita').remove(rutas),
            supabase.storage.from('audios-visita').remove(rutas),
          ]);
        }
      },
      {
        onExito: () => {
          setVisitaBorrarId(null);
          setPrevisualizacion(null);
          queryClient.invalidateQueries({ queryKey: ['historial-visitas', clienteId] });
          queryClient.invalidateQueries({ queryKey: ['semaforo-cliente', clienteId] });
          queryClient.invalidateQueries({ queryKey: ['ecosistema-completo', clienteId] });
        },
      }
    );
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

        <div className="label">historial de visitas</div>
        {historialVisitas?.length ? (
          historialVisitas.map((v) => (
            <div key={v.id} className="card" style={{ marginBottom: 8 }}>
              {visitaBorrarId === v.id ? (
                previsualizando.cargando || !previsualizacion ? (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>calculando qué se va a borrar…</div>
                ) : (
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
                      Esta visita arrastra: {previsualizacion.num_fotos} foto(s), {previsualizacion.num_audios} audio(s),{' '}
                      {previsualizacion.num_notas} nota(s), {previsualizacion.num_hallazgos} hallazgo(s),{' '}
                      {previsualizacion.num_oportunidades} oportunidad(es). Todo eso se borrará también. Los{' '}
                      {previsualizacion.num_proximos_pasos} próximo(s) paso(s) vinculados también se borrarán. No se puede deshacer.
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="btn btn-secondary" onClick={cancelarBorrado} disabled={borrandoVisita.cargando}>
                        cancelar
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{ background: 'var(--risk-600)' }}
                        onClick={confirmarBorradoVisita}
                        disabled={borrandoVisita.cargando}
                      >
                        {borrandoVisita.cargando ? 'borrando…' : 'confirmar borrado de la visita completa'}
                      </button>
                    </div>
                    {borrandoVisita.error && <div className="field-error-text" style={{ marginTop: 8 }}>{borrandoVisita.error}</div>}
                  </div>
                )
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 'var(--text-base)' }}>
                      {new Date(v.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                      {v.tipo_visita ?? 'sin tipo'} · {v.estado_captura}
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '4px 12px', color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
                    onClick={() => pedirPrevisualizacion(v.id)}
                  >
                    borrar
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>sin visitas registradas</div>
        )}
      </div>

      <button className="btn btn-primary" disabled={iniciandoVisita.cargando} onClick={iniciarVisitaAdHoc}>
        {iniciandoVisita.cargando ? 'iniciando…' : 'iniciar visita →'}
      </button>
      {iniciandoVisita.error && <div className="field-error-text">{iniciandoVisita.error}</div>}
    </div>
  );
}
