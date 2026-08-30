import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { useDescargarInforme, BotonDescargarInforme } from '@/hooks/use-descargar-informe';
import { crearVisitaConResponsable } from '@/lib/rpc';

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

interface PrevisualizacionBorradoCliente extends PrevisualizacionBorrado {
  num_visitas: number;
  num_ubicaciones: number;
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
  const { estadoDe, descargar } = useDescargarInforme();

  const [confirmandoBorrarCliente, setConfirmandoBorrarCliente] = useState(false);
  const [previsualizacionCliente, setPrevisualizacionCliente] = useState<PrevisualizacionBorradoCliente | null>(null);
  const previsualizandoCliente = useAccionAsync();
  const borrandoCliente = useAccionAsync();

  const esDireccionComercial = comercial?.rol === 'direccion_comercial';
  // ?planificar=1 → se llega aquí desde "Nuevo cliente" con la intención de
  // planificar una visita: el formulario se abre solo.
  const [searchParams] = useSearchParams();
  const [planificando, setPlanificando] = useState(searchParams.get('planificar') === '1');
  const planificarRef = useRef<HTMLDivElement>(null);
  const [fechaPlan, setFechaPlan] = useState('');
  const [horaPlan, setHoraPlan] = useState('');
  const [comercialPlan, setComercialPlan] = useState('');
  const [planificadaPara, setPlanificadaPara] = useState<string | null>(null);
  const planificacion = useAccionAsync();
  const hoyISO = new Date().toISOString().slice(0, 10);

  // Solo Dirección Comercial puede planificar una visita para otro comercial;
  // el resto planifica siempre para sí mismo, así que ni se pide la lista.
  const { data: comercialesActivos } = useQuery({
    queryKey: ['comerciales-activos'],
    enabled: esDireccionComercial && planificando,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comercial')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });

  async function planificarVisita() {
    await planificacion.ejecutar(
      async () => {
        if (!cliente || !comercial) {
          throw new Error('No se ha podido identificar el cliente o tu sesión. Recarga la página.');
        }
        if (!fechaPlan) throw new Error('Elige una fecha para la visita.');
        const responsableId = esDireccionComercial && comercialPlan ? comercialPlan : comercial.id;
        // Llamada directa, NO por la cola offline: planificar una visita para
        // otro día se hace organizando, con conexión. Si fuera por la cola,
        // la visita tardaría en llegar al servidor y no aparecería en "Hoy"
        // hasta que algo volviera a pedir la lista — daba sensación de que
        // no se guardaba.
        const visitaId = crypto.randomUUID();
        const { error } = await crearVisitaConResponsable({
          pVisitaId: visitaId,
          pClienteId: cliente.id,
          pComercialId: responsableId,
          // `fecha` siempre lleva hora (para ordenar). Si el comercial no
          // metió una, se usa 09:00 de relleno y se marca hora_definida=false
          // — la agenda la mostrará como "sin hora".
          pFecha: new Date(`${fechaPlan}T${horaPlan || '09:00'}:00`).toISOString(),
          pEstadoCaptura: 'agendada',
        });
        if (error) throw new Error(error);
        if (!horaPlan) {
          const { error: errHora } = await supabase
            .from('visita')
            .update({ hora_definida: false })
            .eq('id', visitaId);
          if (errHora) throw new Error(errHora.message);
        }
        return fechaPlan;
      },
      {
        onExito: (fecha) => {
          setPlanificadaPara(fecha);
          setPlanificando(false);
          setFechaPlan('');
          setHoraPlan('');
          setComercialPlan('');
          for (const k of [
            ['historial-visitas', clienteId],
            ['visitas-hoy'],
            ['visitas-proximas'],
            ['visitas-atrasadas'],
            ['num-grupos-duplicados'],
          ]) {
            queryClient.invalidateQueries({ queryKey: k });
          }
        },
      }
    );
  }

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

  // Aviso suave si ya hay una visita planificada (hoy o futura) con este
  // cliente — para no acumular planes duplicados sin querer. No bloquea.
  const visitaYaPlanificada = historialVisitas?.find(
    (v) => v.estado_captura === 'agendada' && new Date(v.fecha).getTime() >= new Date().setHours(0, 0, 0, 0)
  );

  // Al llegar con ?planificar=1 el formulario ya está abierto, pero vive al
  // final de la pantalla — se acerca a la vista para que se vea.
  useEffect(() => {
    if (planificando && searchParams.get('planificar') === '1') {
      planificarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [planificando, searchParams]);

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
          // La "última visita" que se ve en la lista de Clientes puede
          // cambiar al borrar una visita — mismo hueco que el borrado de
          // cliente completo, corregido a la vez.
          queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
        },
      }
    );
  }

  async function pedirBorradoCliente() {
    setConfirmandoBorrarCliente(true);
    setPrevisualizacionCliente(null);
    await previsualizandoCliente.ejecutar(async () => {
      const { data, error } = await supabase
        .rpc('previsualizar_borrado_cliente', { p_cliente_id: clienteId! })
        .single();
      if (error) throw new Error(error.message);
      return data as PrevisualizacionBorradoCliente;
    }, {
      onExito: (data) => setPrevisualizacionCliente(data),
    });
  }

  function cancelarBorradoCliente() {
    setConfirmandoBorrarCliente(false);
    setPrevisualizacionCliente(null);
    previsualizandoCliente.limpiarError();
    borrandoCliente.limpiarError();
  }

  async function confirmarBorradoCliente() {
    const rutas = previsualizacionCliente?.rutas_storage ?? [];

    await borrandoCliente.ejecutar(
      async () => {
        // Mismo orden obligatorio que en el borrado de una visita suelta:
        // primero los binarios de Storage, mientras las filas de
        // visita_participante todavía existen (la política de Storage lo
        // exige) — eliminar_cliente_completo() las borra como parte de la
        // cascada, así que si se hiciera al revés, fallaría sin permiso.
        if (rutas.length) {
          await Promise.all([
            supabase.storage.from('fotos-visita').remove(rutas),
            supabase.storage.from('audios-visita').remove(rutas),
          ]);
        }
        const { error } = await supabase.rpc('eliminar_cliente_completo', { p_cliente_id: clienteId! });
        if (error) throw new Error(error.message);
      },
      {
        onExito: () => {
          // Sin esto, "Clientes" seguía mostrando el cliente ya borrado
          // hasta que la caché de 60s caducaba sola o el usuario refrescaba
          // a mano — mismo patrón que ya se cubría al borrar una visita
          // suelta, pero que faltaba aquí.
          queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
          navigate('/clientes');
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
        {!confirmandoBorrarCliente && (
          <button
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '4px 10px', fontSize: 'var(--text-xs)', color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
            onClick={pedirBorradoCliente}
          >
            Borrar cliente
          </button>
        )}
      </div>

      {confirmandoBorrarCliente && (
        <div className="card" style={{ borderColor: 'var(--risk-600)' }}>
          {previsualizandoCliente.cargando || !previsualizacionCliente ? (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>calculando qué se va a borrar…</div>
          ) : (
            <div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
                Este cliente arrastra: {previsualizacionCliente.num_visitas} visita(s) completas,{' '}
                {previsualizacionCliente.num_fotos} foto(s), {previsualizacionCliente.num_audios} audio(s),{' '}
                {previsualizacionCliente.num_notas} nota(s), {previsualizacionCliente.num_hallazgos} hallazgo(s),{' '}
                {previsualizacionCliente.num_oportunidades} oportunidad(es), {' '}
                {previsualizacionCliente.num_proximos_pasos} próximo(s) paso(s) y{' '}
                {previsualizacionCliente.num_ubicaciones} ubicación(es). Todo eso se borrará también,
                para siempre. No se puede deshacer.
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
                Esto no genera copias de seguridad automáticamente — si quieres conservar alguna visita, descárgala
                antes desde "mi espacio".
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={cancelarBorradoCliente} disabled={borrandoCliente.cargando}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  style={{ background: 'var(--risk-600)' }}
                  onClick={confirmarBorradoCliente}
                  disabled={borrandoCliente.cargando}
                >
                  {borrandoCliente.cargando ? 'Borrando…' : 'Confirmar borrado del cliente completo'}
                </button>
              </div>
              {borrandoCliente.error && <div className="field-error-text" style={{ marginTop: 8 }}>{borrandoCliente.error}</div>}
            </div>
          )}
        </div>
      )}

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

          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', cursor: 'pointer' }}
            onClick={() => navigate(`/clientes/${clienteId}/ubicaciones`)}
          >
            <span className="label" style={{ marginTop: 0, marginBottom: 0 }}>ubicaciones</span>
            <span style={{ fontSize: 'var(--text-sm)' }}>ver ›</span>
          </div>

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
                        Cancelar
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{ background: 'var(--risk-600)' }}
                        onClick={confirmarBorradoVisita}
                        disabled={borrandoVisita.cargando}
                      >
                        {borrandoVisita.cargando ? 'Borrando…' : 'Confirmar borrado de la visita completa'}
                      </button>
                    </div>
                    {borrandoVisita.error && <div className="field-error-text" style={{ marginTop: 8 }}>{borrandoVisita.error}</div>}
                  </div>
                )
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flex: 1, padding: '4px 0' }}
                    onClick={() =>
                      navigate(
                        v.estado_captura === 'agendada'
                          ? `/visita/${v.id}/planificada`
                          : `/visita/${v.id}/detalle`
                      )
                    }
                  >
                    <div>
                      <div style={{ fontSize: 'var(--text-base)' }}>
                        {new Date(v.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                        {v.tipo_visita ?? 'sin tipo'} · {v.estado_captura === 'agendada' ? 'planificada' : v.estado_captura}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-300)' }}>
                        {v.estado_captura === 'agendada' ? 'gestionar' : 'ver contenido'}
                      </span>
                      <span style={{ fontSize: 20, color: 'var(--ink-300)' }}>›</span>
                    </div>
                  </div>
                  {v.estado_captura !== 'agendada' && (
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <BotonDescargarInforme
                        estado={estadoDe(v.id)}
                        onDescargar={() => descargar(v.id)}
                        compacto
                      />
                      <button
                        className="btn btn-secondary"
                        style={{ width: 'auto', padding: '4px 12px', color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
                        onClick={() => pedirPrevisualizacion(v.id)}
                      >
                        Borrar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        ) : (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>sin visitas registradas</div>
        )}
      </div>

      {planificadaPara && !planificando && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
          Visita planificada para el{' '}
          {new Date(`${planificadaPara}T09:00:00`).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
          })}
          . Aparecerá en «Hoy» ese día.
        </div>
      )}

      {planificando ? (
        <div className="card" ref={planificarRef}>
          {visitaYaPlanificada && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning-600)', marginBottom: 8 }}>
              Ya tienes una visita planificada con este cliente el{' '}
              {new Date(visitaYaPlanificada.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}. Puedes
              planificar otra igualmente.
            </div>
          )}
          <div className="label" style={{ marginTop: 0 }}>fecha de la visita</div>
          <input
            type="date"
            className="field"
            min={hoyISO}
            value={fechaPlan}
            onChange={(e) => setFechaPlan(e.target.value)}
          />
          <div className="label">hora (opcional)</div>
          <input
            type="time"
            className="field"
            value={horaPlan}
            onChange={(e) => setHoraPlan(e.target.value)}
          />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
            Si la dejas en blanco, la visita se planifica "sin hora fija".
          </div>
          {esDireccionComercial && (
            <>
              <div className="label">para</div>
              <select
                className="field"
                value={comercialPlan}
                onChange={(e) => setComercialPlan(e.target.value)}
              >
                <option value="">yo ({comercial?.nombre ?? '—'})</option>
                {comercialesActivos
                  ?.filter((c) => c.id !== comercial?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </select>
            </>
          )}
          {planificacion.error && <div className="field-error-text" style={{ marginTop: 8 }}>{planificacion.error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              className="btn btn-secondary"
              disabled={planificacion.cargando}
              onClick={() => {
                setPlanificando(false);
                planificacion.limpiarError();
              }}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              disabled={planificacion.cargando || !fechaPlan}
              onClick={planificarVisita}
            >
              {planificacion.cargando ? 'Planificando…' : 'Planificar'}
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-secondary"
          disabled={iniciandoVisita.cargando}
          onClick={() => {
            setPlanificadaPara(null);
            setPlanificando(true);
          }}
        >
          Planificar visita para otro día
        </button>
      )}

      <button className="btn btn-primary" disabled={iniciandoVisita.cargando} onClick={iniciarVisitaAdHoc}>
        {iniciandoVisita.cargando ? 'Iniciando…' : 'Iniciar visita ahora →'}
      </button>
      {iniciandoVisita.error && <div className="field-error-text">{iniciandoVisita.error}</div>}
    </div>
  );
}
