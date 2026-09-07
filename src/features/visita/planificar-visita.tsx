import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { uuid } from '@/lib/uuid';
import { crearVisitaConResponsable } from '@/lib/rpc';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAvisoVisitaEnCurso } from '@/hooks/use-aviso-visita-en-curso';
import { VisitaEnCursoModal } from '@/features/visita/visita-en-curso-modal';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { desde } from '@/lib/volver-a';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';

interface Proyecto {
  id: string;
  nombre: string;
  es_general: boolean;
}

// "Nueva visita" — un solo sitio para crear una visita, se abre desde el
// "+" de Hoy y de la Agenda. Pasos: cliente → proyecto (solo si hay más de
// uno) → ¿cuándo?
//   · "Ahora"     → objetivo y arranca la visita en curso (cola offline),
//                    misma vía que "Iniciar visita ahora" de la ficha.
//   · "Otro día"  → fecha / objetivo / hora / franja / [para otro comercial,
//                    si eres Dirección] y queda agendada.
// También se abre desde la ficha de proyecto con ?clienteId=&proyectoId=
// ya puestos (se salta los dos primeros pasos).
export function PlanificarVisita() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { comercial } = useSesionActual();
  const esDireccion = comercial?.rol === 'direccion_comercial';
  const [params] = useSearchParams();

  const [clienteId, setClienteId] = useState(params.get('clienteId') ?? '');
  const [proyectoId, setProyectoId] = useState(params.get('proyectoId') ?? '');

  // --- Paso 1: buscar cliente ---
  const [busqueda, setBusqueda] = useState('');
  const termino = busqueda.trim();
  const { data: encontrados, isFetching: buscando } = useQuery({
    queryKey: ['planificar-buscar-cliente', termino],
    enabled: !clienteId && termino.length >= 2,
    queryFn: async (): Promise<Array<{ id: string; nombre: string }>> => {
      const { data, error } = await supabase
        .from('vw_semaforo_cliente')
        .select('cliente_id, cliente_nombre')
        .ilike('cliente_nombre', `%${termino}%`)
        .order('cliente_nombre')
        .limit(8);
      if (error) throw error;
      return (data ?? []).map((c) => ({ id: c.cliente_id as string, nombre: c.cliente_nombre as string }));
    },
  });

  const { data: cliente } = useQuery({
    queryKey: ['planificar-cliente-nombre', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.from('cliente').select('id, nombre').eq('id', clienteId).single();
      if (error) throw error;
      return data;
    },
  });

  // --- Paso 2: proyecto (solo si hay más de uno) ---
  const { data: proyectos } = useQuery({
    queryKey: ['planificar-proyectos', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<Proyecto[]> => {
      const { data, error } = await supabase
        .from('proyecto')
        .select('id, nombre, es_general')
        .eq('cliente_id', clienteId)
        .order('es_general', { ascending: false })
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Un solo proyecto (el General por defecto, P9): se elige solo, sin
  // pedirlo — el comercial no debería ni verlo.
  useEffect(() => {
    if (!proyectoId && proyectos && proyectos.length === 1) setProyectoId(proyectos[0].id);
  }, [proyectos, proyectoId]);

  // --- Paso 3: ¿cuándo? ---
  const [cuando, setCuando] = useState<'ahora' | 'otro'>('ahora');
  const hoyISO = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [hora, setHora] = useState('');
  const [franja, setFranja] = useState<'' | 'manana' | 'tarde'>('');
  const [comercialPlan, setComercialPlan] = useState('');
  const guardado = useAccionAsync();

  // Vía "Ahora" — misma que "Iniciar visita ahora" de la ficha de proyecto.
  const { iniciarVisita } = useVisitaActivaContext();
  const { encolar } = useSyncQueue(undefined);
  const { data: visitaEnCurso } = useAvisoVisitaEnCurso(clienteId || undefined, comercial?.id);
  const [enCursoAbierto, setEnCursoAbierto] = useState(false);
  const [errorAhora, setErrorAhora] = useState<string | null>(null);
  const [arrancando, setArrancando] = useState(false);

  const { data: comercialesActivos } = useQuery({
    queryKey: ['comerciales-activos'],
    enabled: esDireccion && !!proyectoId,
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

  async function lanzarVisitaAhora() {
    if (!comercial || !clienteId || !proyectoId) {
      setErrorAhora('Recarga la página e inténtalo de nuevo.');
      return;
    }
    setArrancando(true);
    setErrorAhora(null);
    try {
      const visitaId = uuid();
      await encolar(visitaId, 'visita', {
        clienteId,
        proyectoId,
        comercialResponsableId: comercial.id,
        tipoVisita: null,
        objetivo: objetivo.trim(),
      });
      iniciarVisita({ id: visitaId, clienteNombre: cliente?.nombre ?? '' });
      navigate(`/visita/${visitaId}`);
    } catch (e) {
      setArrancando(false);
      setErrorAhora(e instanceof Error ? e.message : 'No se pudo empezar la visita.');
    }
  }

  function empezarAhora() {
    if (!objetivo.trim()) {
      setErrorAhora('Escribe a qué vas.');
      return;
    }
    if (visitaEnCurso) {
      setEnCursoAbierto(true);
      return;
    }
    void lanzarVisitaAhora();
  }

  async function planificar() {
    await guardado.ejecutar(
      async () => {
        if (!navigator.onLine) {
          throw new Error('Sin conexión. Dejar una visita agendada necesita red; «Ahora» sí funciona sin cobertura.');
        }
        if (!comercial || !clienteId || !proyectoId) throw new Error('Recarga la página e inténtalo de nuevo.');
        if (!fecha) throw new Error('Elige una fecha para la visita.');
        if (!objetivo.trim()) throw new Error('Escribe el objetivo de la visita.');
        const responsableId = esDireccion && comercialPlan ? comercialPlan : comercial.id;
        const visitaId = uuid();
        const { error } = await crearVisitaConResponsable({
          pVisitaId: visitaId,
          pClienteId: clienteId,
          pComercialId: responsableId,
          pFecha: new Date(`${fecha}T${hora || '09:00'}:00`).toISOString(),
          pEstadoCaptura: 'agendada',
        });
        if (error) throw new Error(error);
        const parche: { objetivo: string; proyecto_id: string; hora_definida?: boolean; franja?: string | null } = {
          objetivo: objetivo.trim(),
          proyecto_id: proyectoId,
        };
        if (!hora) {
          parche.hora_definida = false;
          parche.franja = franja || null;
        }
        const { error: errParche } = await supabase.from('visita').update(parche).eq('id', visitaId);
        if (errParche) throw new Error(errParche.message);
      },
      {
        onExito: () => {
          for (const k of [['agenda-planificadas'], ['visitas-hoy'], ['visitas-proximas'], ['visitas-atrasadas']]) {
            queryClient.invalidateQueries({ queryKey: k });
          }
          if (clienteId) queryClient.invalidateQueries({ queryKey: ['historial-visitas-proyecto', proyectoId] });
          navigate('/');
        },
      }
    );
  }

  const proyectoElegido = useMemo(
    () => proyectos?.find((p) => p.id === proyectoId) ?? null,
    [proyectos, proyectoId]
  );
  const pasoProyecto = !!clienteId && !proyectoId;

  return (
    <div className="screen">
      <CabeceraDetalle
        titulo="Nueva visita"
        subtitulo={
          cliente
            ? `${cliente.nombre}${proyectoElegido && !proyectoElegido.es_general ? ` · ${proyectoElegido.nombre}` : ''}`
            : undefined
        }
        ayuda="planificar-visita"
      />

      <div className="lista-agrupada">
        {/* Paso 1 — cliente */}
        {!clienteId && (
          <div className="card">
            <div className="label" style={{ marginTop: 0 }}>¿A qué cliente?</div>
            <input
              className="field"
              autoFocus
              placeholder="nombre del cliente"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {termino.length === 1 && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
                Escribe al menos 2 letras.
              </div>
            )}
            {termino.length >= 2 && (
              <div style={{ marginTop: 8 }}>
                {buscando && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>Buscando…</div>}
                {!buscando && encontrados?.length === 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 8 }}>
                      No hay ningún cliente que se llame así.
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        navigate(`/clientes/nuevo?nombre=${encodeURIComponent(termino)}`, { state: desde(location) })
                      }
                    >
                      Crear «{termino}» y seguir
                    </button>
                  </div>
                )}
                {!!encontrados?.length && (
                  <SeccionLista>
                    {encontrados.map((c) => (
                      <FilaNavegable key={c.id} titulo={c.nombre} onClick={() => setClienteId(c.id)} chevron />
                    ))}
                  </SeccionLista>
                )}
              </div>
            )}
          </div>
        )}

        {/* Paso 2 — proyecto (solo si hay más de uno) */}
        {pasoProyecto && proyectos && proyectos.length > 1 && (
          <div className="card">
            <div className="label" style={{ marginTop: 0 }}>¿En qué proyecto?</div>
            <SeccionLista>
              {proyectos.map((p) => (
                <FilaNavegable
                  key={p.id}
                  titulo={p.nombre}
                  subtitulo={p.es_general ? 'Todo lo que no encaja en otro proyecto' : undefined}
                  onClick={() => setProyectoId(p.id)}
                  chevron
                />
              ))}
            </SeccionLista>
          </div>
        )}

        {/* Paso 3 — ¿cuándo? */}
        {!!proyectoId && (
          <div className="card">
            <div className="label" style={{ marginTop: 0 }}>¿Cuándo?</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(
                [
                  ['ahora', 'Ahora'],
                  ['otro', 'Otro día'],
                ] as const
              ).map(([val, txt]) => (
                <button
                  key={val}
                  type="button"
                  className={`chip${cuando === val ? ' chip--on' : ''}`}
                  onClick={() => setCuando(val)}
                >
                  {txt}
                </button>
              ))}
            </div>

            <div className="label">Objetivo</div>
            <textarea
              className="field"
              style={{ height: 'auto', padding: 8 }}
              rows={2}
              placeholder="a qué vas: cerrar pedido, presentar gama, primera toma de contacto…"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
            />

            {cuando === 'otro' && (
              <>
                <div className="label">Fecha de la visita</div>
                <input
                  type="date"
                  className="field"
                  min={hoyISO}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
                <div className="label">Hora (opcional)</div>
                <input type="time" className="field" value={hora} onChange={(e) => setHora(e.target.value)} />
                {!hora && (
                  <>
                    <div className="label">Sin hora concreta, ¿cuándo?</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(
                        [
                          ['manana', 'Mañana'],
                          ['tarde', 'Tarde'],
                          ['', 'Sin hora fija'],
                        ] as const
                      ).map(([val, txt]) => (
                        <button
                          key={val || 'sin'}
                          type="button"
                          className={`chip${franja === val ? ' chip--on' : ''}`}
                          onClick={() => setFranja(val)}
                        >
                          {txt}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {esDireccion && (
                  <>
                    <div className="label">Para</div>
                    <select className="field" value={comercialPlan} onChange={(e) => setComercialPlan(e.target.value)}>
                      <option value="">Yo ({comercial?.nombre ?? '—'})</option>
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
                {guardado.error && (
                  <div className="field-error-text" style={{ marginTop: 8 }}>{guardado.error}</div>
                )}
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 12 }}
                  disabled={guardado.cargando || !fecha || !objetivo.trim()}
                  onClick={planificar}
                >
                  {guardado.cargando ? 'Planificando…' : 'Planificar'}
                </button>
              </>
            )}

            {cuando === 'ahora' && (
              <>
                {errorAhora && (
                  <div className="field-error-text" style={{ marginTop: 8 }}>{errorAhora}</div>
                )}
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 12 }}
                  disabled={arrancando || !objetivo.trim()}
                  onClick={empezarAhora}
                >
                  {arrancando ? 'Empezando…' : 'Empezar'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {enCursoAbierto && visitaEnCurso && (
        <VisitaEnCursoModal
          clienteNombre={visitaEnCurso.clienteNombre}
          objetivo={visitaEnCurso.objetivo}
          onContinuar={() => navigate(`/visita/${visitaEnCurso.id}`)}
          onEmpezarOtra={() => {
            setEnCursoAbierto(false);
            void lanzarVisitaAhora();
          }}
          onCerrar={() => setEnCursoAbierto(false)}
        />
      )}
    </div>
  );
}
