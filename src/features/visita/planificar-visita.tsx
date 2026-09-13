import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { conReintentoDeSesion } from '@/lib/con-reintento-de-sesion';
import { uuid } from '@/lib/uuid';
import { crearVisitaConResponsable } from '@/lib/rpc';
import { crearProyectoRapido } from '@/lib/crear-proyecto-rapido';
import { arrancarVisitaAhora } from '@/lib/arrancar-visita';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAvisoVisitaEnCurso } from '@/hooks/use-aviso-visita-en-curso';
import { VisitaEnCursoModal } from '@/features/visita/visita-en-curso-modal';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { desde, useVolverA } from '@/lib/volver-a';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { TextareaDictado, type RefCampoDictado } from '@/components/ui/campo-dictado';

interface Proyecto {
  id: string;
  nombre: string;
  estado: string;
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
  // El ← vuelve a donde se abrió «Nueva visita» (ficha de cliente, ficha de
  // proyecto…) o, si no consta, a Hoy. Regla #14.
  const volver = useVolverA('/');
  const queryClient = useQueryClient();
  const { comercial } = useSesionActual();
  const esDireccion = comercial?.rol === 'direccion_comercial';
  const [params] = useSearchParams();

  const [clienteId, setClienteId] = useState(params.get('clienteId') ?? '');
  const [proyectoId, setProyectoId] = useState(params.get('proyectoId') ?? '');
  // Lo que vino fijado por la URL (deep link desde una ficha) no es un "paso"
  // que se eligiera aquí: el ← no debe des-hacerlo, sale directo.
  const clienteFijado = !!params.get('clienteId');
  const proyectoFijado = !!params.get('proyectoId');

  // El ← de una pantalla-asistente retrocede DE PASO, no sale de golpe:
  //   paso 3 (¿cuándo?) → paso 2 (¿qué proyecto?) → paso 1 (¿qué cliente?) → salir.
  // Solo sale del todo desde el primer paso visible (o si todo vino fijado).
  function alVolver() {
    if (clienteId && proyectoId && !proyectoFijado) {
      setProyectoId('');
      return;
    }
    if (clienteId && !clienteFijado) {
      setClienteId('');
      setProyectoId('');
      return;
    }
    navigate(volver);
  }

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
      const { data, error } = await supabase
        .from('cliente')
        .select('id, nombre, responsable_id, responsable:responsable_id(nombre)')
        .eq('id', clienteId)
        .single();
      if (error) throw error;
      return data as unknown as {
        id: string;
        nombre: string;
        responsable_id: string | null;
        responsable: { nombre: string } | null;
      };
    },
  });

  // Cliente de otro comercial: se puede visitar igualmente, pero se avisa y
  // se pide confirmar antes de arrancar (la visita queda a nombre de quien
  // la abre). Dirección con el selector «Para» de «Otro día» ya elige.
  const clienteDeOtro =
    !!cliente?.responsable_id && !!comercial && cliente.responsable_id !== comercial.id
      ? cliente.responsable?.nombre ?? 'otro comercial'
      : null;
  const [confirmadoDeOtro, setConfirmadoDeOtro] = useState(false);
  useEffect(() => setConfirmadoDeOtro(false), [clienteId]);

  // --- Paso 2: proyecto (solo si hay más de uno) ---
  const { data: proyectosTodos } = useQuery({
    queryKey: ['planificar-proyectos', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<Proyecto[]> => {
      const { data, error } = await supabase
        .from('proyecto')
        .select('id, nombre, estado')
        .eq('cliente_id', clienteId)
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Un proyecto terminado es de solo consulta: no se le planifican visitas,
  // así que no se ofrece aquí.
  const proyectos = useMemo(
    () => proyectosTodos?.filter((p) => p.estado !== 'terminado'),
    [proyectosTodos]
  );

  // El `?proyectoId=` de la URL puede venir de un enlace viejo a un proyecto
  // ya terminado o borrado. Si no está entre los elegibles, se descarta y se
  // vuelve al paso "¿en qué proyecto?".
  useEffect(() => {
    if (proyectoId && proyectos && !proyectos.some((p) => p.id === proyectoId)) {
      setProyectoId('');
    }
  }, [proyectos, proyectoId]);

  // --- Paso 3: ¿cuándo? ---
  const [cuando, setCuando] = useState<'ahora' | 'otro'>('ahora');
  const hoyISO = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const refDictadoObjetivo = useRef<RefCampoDictado>(null);
  const [hora, setHora] = useState('');
  const [franja, setFranja] = useState<'' | 'manana' | 'tarde'>('');
  const [comercialPlan, setComercialPlan] = useState('');
  const guardado = useAccionAsync();

  // Paso 2 — «+ Nuevo proyecto»: crea una línea de negocio nueva sin salir
  // del flujo y dirige la visita a ella.
  const [creandoProyecto, setCreandoProyecto] = useState(false);
  const [nombreProyectoNuevo, setNombreProyectoNuevo] = useState('');
  const creacionProyecto = useAccionAsync();

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

  async function lanzarVisitaAhora(objetivoTexto: string) {
    if (!comercial || !clienteId || !proyectoId) {
      setErrorAhora('Recarga la página e inténtalo de nuevo.');
      return;
    }
    setArrancando(true);
    setErrorAhora(null);
    try {
      const visitaId = await arrancarVisitaAhora({
        encolar,
        iniciarVisita,
        comercialId: comercial.id,
        clienteId,
        proyectoId,
        clienteNombre: cliente?.nombre ?? '',
        objetivo: objetivoTexto,
      });
      navigate(`/visita/${visitaId}`);
    } catch (e) {
      setArrancando(false);
      setErrorAhora(e instanceof Error ? e.message : 'No se pudo empezar la visita.');
    }
  }

  function empezarAhora() {
    const objetivoConsolidado = (refDictadoObjetivo.current?.consolidar() ?? objetivo).trim();
    if (!objetivoConsolidado) {
      setErrorAhora('Escribe a qué vas.');
      return;
    }
    if (visitaEnCurso) {
      setEnCursoAbierto(true);
      return;
    }
    void lanzarVisitaAhora(objetivoConsolidado);
  }

  async function planificar() {
    const objetivoConsolidado = (refDictadoObjetivo.current?.consolidar() ?? objetivo).trim();
    await guardado.ejecutar(
      async () => {
        if (!navigator.onLine) {
          throw new Error('Sin conexión. Dejar una visita agendada necesita red; «Ahora» sí funciona sin cobertura.');
        }
        if (!comercial || !clienteId || !proyectoId) throw new Error('Recarga la página e inténtalo de nuevo.');
        if (!fecha) throw new Error('Elige una fecha para la visita.');
        if (!objetivoConsolidado) throw new Error('Escribe el objetivo de la visita.');
        const responsableId = esDireccion && comercialPlan ? comercialPlan : comercial.id;
        const visitaId = uuid();
        const { error } = await crearVisitaConResponsable({
          pVisitaId: visitaId,
          pClienteId: clienteId,
          pComercialId: responsableId,
          pProyectoId: proyectoId,
          pFecha: new Date(`${fecha}T${hora || '09:00'}:00`).toISOString(),
          pEstadoCaptura: 'agendada',
        });
        if (error) throw new Error(error);
        const parche: { objetivo: string; hora_definida?: boolean; franja?: string | null } = {
          objetivo: objetivoConsolidado,
        };
        if (!hora) {
          parche.hora_definida = false;
          parche.franja = franja || null;
        }
        // La visita se acaba de crear por RPC, pero el UPDATE que le pone
        // el objetivo es una llamada aparte con su propia RLS — si
        // Dirección planifica en nombre de otro comercial y esa RLS no lo
        // cubriera, "tendría éxito" con 0 filas sin dar error, y la visita
        // se quedaría sin objetivo en silencio.
        await conReintentoDeSesion(
          () => supabase.from('visita').update(parche, { count: 'exact' }).eq('id', visitaId),
          'La visita se creó, pero no se ha podido fijar el objetivo (0 filas afectadas).'
        );
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
  // El cliente es de otro y aún no se ha confirmado seguir. Si Dirección
  // asigna la visita a alguien con «Para» (vía «Otro día»), no aplica.
  const bloqueadoPorOtro =
    !!clienteDeOtro && !confirmadoDeOtro && !(cuando === 'otro' && !!comercialPlan);

  async function crearProyectoYElegir() {
    const nombre = nombreProyectoNuevo.trim();
    if (!clienteId || !nombre) return;
    await creacionProyecto.ejecutar(
      () => crearProyectoRapido(clienteId, nombre, encolar),
      {
        onExito: (id) => {
          // Se añade a la caché de la lista ANTES de elegirlo: si no, el
          // efecto que descarta un `proyectoId` no listado lo borraría hasta
          // que el refetch trajera la fila nueva (carrera).
          queryClient.setQueryData<Proyecto[]>(['planificar-proyectos', clienteId], (old) => [
            ...(old ?? []),
            { id, nombre, estado: 'activo' },
          ]);
          setProyectoId(id);
          setCreandoProyecto(false);
          setNombreProyectoNuevo('');
        },
      }
    );
  }

  return (
    <div className="screen">
      <CabeceraDetalle
        titulo="Nueva visita"
        subtitulo={
          cliente
            ? `${cliente.nombre}${proyectoElegido ? ` · ${proyectoElegido.nombre}` : ''}`
            : undefined
        }
        ayuda="planificar-visita"
        onVolver={alVolver}
      />

      <div className="lista-agrupada">
        {/* Paso 1 — cliente */}
        {!clienteId && (
          <div className="card">
            <div className="label" style={{ marginTop: 0 }}>¿A qué cliente?</div>
            <input
              className="field"
              autoFocus
              autoComplete="off"
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

        {/* Paso 2 — proyecto. Siempre que haya cliente y no haya proyecto
            elegido: se listan los proyectos vigentes y se puede crear uno
            nuevo en el momento. */}
        {pasoProyecto && proyectos && (
          <div className="card">
            <div className="label" style={{ marginTop: 0 }}>¿En qué proyecto?</div>
            <SeccionLista>
              {proyectos.map((p) => (
                <FilaNavegable
                  key={p.id}
                  titulo={p.nombre}
                  onClick={() => setProyectoId(p.id)}
                  chevron
                />
              ))}
              {!creandoProyecto && (
                <FilaNavegable
                  icono="mas"
                  titulo="Nuevo proyecto"
                  chevron={false}
                  onClick={() => setCreandoProyecto(true)}
                />
              )}
            </SeccionLista>
            {creandoProyecto && (
              <div style={{ marginTop: 8 }}>
                <input
                  className={`field${creacionProyecto.error ? ' field--error' : ''}`}
                  autoFocus
                  autoComplete="off"
                  value={nombreProyectoNuevo}
                  onChange={(e) => setNombreProyectoNuevo(e.target.value)}
                  placeholder="p. ej. Mantenimiento, Obra nueva, Postventa…"
                />
                {creacionProyecto.error && (
                  <div className="field-error-text">{creacionProyecto.error}</div>
                )}
                <div className="fila-btns" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={creacionProyecto.cargando}
                    onClick={() => {
                      setCreandoProyecto(false);
                      setNombreProyectoNuevo('');
                      creacionProyecto.limpiarError();
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={creacionProyecto.cargando || !nombreProyectoNuevo.trim()}
                    onClick={crearProyectoYElegir}
                  >
                    {creacionProyecto.cargando ? 'Creando…' : 'Crear y seguir'}
                  </button>
                </div>
              </div>
            )}
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

            {clienteDeOtro && (
              <div
                className="card--riesgo"
                style={{ padding: 10, borderRadius: 8, marginTop: 10, fontSize: 'var(--text-sm)' }}
              >
                <div style={{ color: 'var(--risk-600)', fontWeight: 500 }}>
                  Este cliente es de {clienteDeOtro}.
                </div>
                <div style={{ color: 'var(--ink-500)', marginTop: 2 }}>
                  Puedes visitarlo igualmente; la visita quedará a tu nombre.
                </div>
                {bloqueadoPorOtro && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginTop: 8 }}
                    onClick={() => setConfirmadoDeOtro(true)}
                  >
                    Sí, visitar de todas formas
                  </button>
                )}
              </div>
            )}

            <div className="label">Objetivo</div>
            <TextareaDictado
              ref={refDictadoObjetivo}
              rows={2}
              placeholder="a qué vas: cerrar pedido, presentar gama, primera toma de contacto…"
              valor={objetivo}
              onCambio={setObjetivo}
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
                  disabled={guardado.cargando || !fecha || !objetivo.trim() || bloqueadoPorOtro}
                  onClick={planificar}
                >
                  {guardado.cargando ? 'Planificando…' : 'Planificar'}
                </button>
                {(!fecha || !objetivo.trim()) && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
                    {!fecha
                      ? 'Elige una fecha para continuar.'
                      : 'Escribe a qué vas para continuar.'}
                  </div>
                )}
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
                  disabled={arrancando || !objetivo.trim() || bloqueadoPorOtro}
                  onClick={empezarAhora}
                >
                  {arrancando ? 'Empezando…' : 'Empezar'}
                </button>
                {!objetivo.trim() && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
                    Escribe a qué vas para continuar.
                  </div>
                )}
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
            void lanzarVisitaAhora(objetivo.trim());
          }}
          onCerrar={() => setEnCursoAbierto(false)}
        />
      )}
    </div>
  );
}
