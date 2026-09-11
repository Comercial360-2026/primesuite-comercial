import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { desde } from '@/lib/volver-a';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useAvisoVisitaEnCurso } from '@/hooks/use-aviso-visita-en-curso';
import { crearProyectoRapido } from '@/lib/crear-proyecto-rapido';
import { arrancarVisitaAhora } from '@/lib/arrancar-visita';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { VisitaEnCursoModal } from '@/features/visita/visita-en-curso-modal';

// "Empezar visita" — hoja sobre Hoy que resuelve el 90% (arrancar una visita
// AHORA) sin cambiar de pantalla hasta entrar en la visita. Se abre desde el
// "+" de Hoy. El camino "otro día" (agenda) sigue en `/planificar`,
// alcanzable desde el pie de esta hoja. Detalle: docs/prompt-maestro-09-*.
interface Cli {
  id: string;
  nombre: string;
}
interface Proyecto {
  id: string;
  nombre: string;
  estado: string;
}

export function EmpezarVisitaHoja({ onCerrar }: { onCerrar: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { comercial } = useSesionActual();
  const { iniciarVisita } = useVisitaActivaContext();
  const { encolar } = useSyncQueue(undefined);

  const [clienteId, setClienteId] = useState('');
  const [proyectoId, setProyectoId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [creandoProyecto, setCreandoProyecto] = useState(false);
  const [nombreProyectoNuevo, setNombreProyectoNuevo] = useState('');
  const [creandoProyErr, setCreandoProyErr] = useState<string | null>(null);
  const [creandoProyLoad, setCreandoProyLoad] = useState(false);
  const [confirmadoDeOtro, setConfirmadoDeOtro] = useState(false);
  const [enCursoAbierto, setEnCursoAbierto] = useState(false);
  const [errorAhora, setErrorAhora] = useState<string | null>(null);
  const [arrancando, setArrancando] = useState(false);

  const termino = busqueda.trim();

  // Clientes recientes: los que YO he visitado (participante), más nuevos
  // primero, deduplicados. Es lo que un comercial espera ver al abrir sin
  // teclear — no una lista en blanco.
  const { data: recientes } = useQuery({
    queryKey: ['empezar-visita-recientes', comercial?.id],
    enabled: !!comercial && !clienteId,
    queryFn: async (): Promise<Cli[]> => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select('visita:visita_id!inner(fecha, cliente:cliente_id(id, nombre))')
        .eq('comercial_id', comercial!.id)
        .order('visita(fecha)', { ascending: false })
        .limit(40);
      if (error) throw error;
      const vistos = new Set<string>();
      const out: Cli[] = [];
      for (const r of data ?? []) {
        const c = (r.visita as unknown as { cliente: Cli | null }).cliente;
        if (c && !vistos.has(c.id)) {
          vistos.add(c.id);
          out.push(c);
        }
        if (out.length >= 8) break;
      }
      return out;
    },
  });

  const { data: encontrados, isFetching: buscando } = useQuery({
    queryKey: ['empezar-visita-buscar', termino],
    enabled: !clienteId && termino.length >= 2,
    queryFn: async (): Promise<Cli[]> => {
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
    queryKey: ['empezar-visita-cliente', clienteId],
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

  const { data: proyectosTodos } = useQuery({
    queryKey: ['empezar-visita-proyectos', clienteId],
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
  const proyectos = useMemo(
    () => proyectosTodos?.filter((p) => p.estado !== 'terminado'),
    [proyectosTodos]
  );

  // Un solo proyecto vivo → se elige solo, no se muestra el paso.
  useEffect(() => {
    if (!proyectoId && proyectos && proyectos.length === 1) {
      setProyectoId(proyectos[0].id);
    }
  }, [proyectos, proyectoId]);

  useEffect(() => {
    setConfirmadoDeOtro(false);
    setProyectoId('');
    setCreandoProyecto(false);
    setNombreProyectoNuevo('');
  }, [clienteId]);

  const { data: visitaEnCurso } = useAvisoVisitaEnCurso(clienteId || undefined, comercial?.id);

  const clienteDeOtro =
    !!cliente?.responsable_id && !!comercial && cliente.responsable_id !== comercial.id
      ? cliente.responsable?.nombre ?? 'otro comercial'
      : null;
  const bloqueadoPorOtro = !!clienteDeOtro && !confirmadoDeOtro;

  const listaClientes = termino.length >= 2 ? encontrados : recientes;

  async function crearProyectoYElegir() {
    const nombre = nombreProyectoNuevo.trim();
    if (!clienteId || !nombre) return;
    setCreandoProyLoad(true);
    setCreandoProyErr(null);
    try {
      const id = await crearProyectoRapido(clienteId, nombre, encolar);
      queryClient.setQueryData<Proyecto[]>(['empezar-visita-proyectos', clienteId], (old) => [
        ...(old ?? []),
        { id, nombre, estado: 'activo' },
      ]);
      setProyectoId(id);
      setCreandoProyecto(false);
      setNombreProyectoNuevo('');
    } catch (e) {
      setCreandoProyErr(e instanceof Error ? e.message : 'No se pudo crear el proyecto.');
    } finally {
      setCreandoProyLoad(false);
    }
  }

  async function lanzar() {
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
        objetivo,
      });
      onCerrar();
      navigate(`/visita/${visitaId}`);
    } catch (e) {
      setArrancando(false);
      setErrorAhora(e instanceof Error ? e.message : 'No se pudo empezar la visita.');
    }
  }

  function empezar() {
    if (!objetivo.trim()) {
      setErrorAhora('Escribe a qué vas.');
      return;
    }
    if (visitaEnCurso) {
      setEnCursoAbierto(true);
      return;
    }
    void lanzar();
  }

  function irAPlanificar() {
    const q = new URLSearchParams();
    if (clienteId) q.set('clienteId', clienteId);
    if (proyectoId) q.set('proyectoId', proyectoId);
    onCerrar();
    navigate(`/planificar${q.toString() ? `?${q}` : ''}`, { state: desde(location) });
  }

  // La × / Esc / tocar fuera RETROCEDE de paso, no sale de golpe (misma regla
  // que el ← de /planificar): objetivo → proyecto → cliente → cerrar. El paso
  // de proyecto solo se rehace si de verdad había que elegir (>1 proyecto);
  // con uno solo se salta directo al de cliente para no re-autoseleccionarlo.
  const puedeVolverAProyecto = !!proyectoId && (proyectos?.length ?? 0) > 1;
  function cerrarORetroceder() {
    if (puedeVolverAProyecto) {
      setProyectoId('');
      return;
    }
    if (clienteId) {
      setClienteId('');
      return;
    }
    onCerrar();
  }

  const proyectoElegido = proyectos?.find((p) => p.id === proyectoId) ?? null;

  return (
    <HojaSuperior titulo="empezar visita" onCerrar={cerrarORetroceder}>
      <div className="lista-agrupada" style={{ padding: '0 4px 8px' }}>
        {/* Paso 1 — cliente */}
        {!clienteId && (
          <div>
            <input
              className="field"
              autoFocus
              placeholder="buscar cliente"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {termino.length === 1 && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
                Escribe al menos 2 letras.
              </div>
            )}
            {termino.length >= 2 && buscando && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>Buscando…</div>
            )}
            {termino.length >= 2 && !buscando && encontrados?.length === 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 8 }}>
                  No hay ningún cliente que se llame así.
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    onCerrar();
                    navigate(`/clientes/nuevo?nombre=${encodeURIComponent(termino)}`, { state: desde(location) });
                  }}
                >
                  Crear «{termino}» y seguir
                </button>
              </div>
            )}
            {!!listaClientes?.length && (
              <>
                {termino.length < 2 && (
                  <div className="label" style={{ marginTop: 10 }}>Recientes</div>
                )}
                <SeccionLista>
                  {listaClientes.map((c) => (
                    <FilaNavegable key={c.id} titulo={c.nombre} onClick={() => setClienteId(c.id)} chevron />
                  ))}
                </SeccionLista>
              </>
            )}
          </div>
        )}

        {/* Paso 2 — proyecto (solo si hay más de uno) */}
        {!!clienteId && !proyectoId && (
          <div>
            <div className="label" style={{ marginTop: 0 }}>
              {cliente?.nombre ? `${cliente.nombre} · ¿en qué proyecto?` : '¿En qué proyecto?'}
            </div>
            <SeccionLista>
              {proyectos?.map((p) => (
                <FilaNavegable key={p.id} titulo={p.nombre} onClick={() => setProyectoId(p.id)} chevron />
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
                  className={`field${creandoProyErr ? ' field--error' : ''}`}
                  autoFocus
                  value={nombreProyectoNuevo}
                  onChange={(e) => setNombreProyectoNuevo(e.target.value)}
                  placeholder="p. ej. Mantenimiento, Obra nueva…"
                />
                {creandoProyErr && <div className="field-error-text">{creandoProyErr}</div>}
                <div className="fila-btns" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={creandoProyLoad}
                    onClick={() => {
                      setCreandoProyecto(false);
                      setNombreProyectoNuevo('');
                      setCreandoProyErr(null);
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={creandoProyLoad || !nombreProyectoNuevo.trim()}
                    onClick={crearProyectoYElegir}
                  >
                    {creandoProyLoad ? 'Creando…' : 'Crear y seguir'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Paso 3 — objetivo + empezar */}
        {!!clienteId && !!proyectoId && (
          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
              {cliente?.nombre}
              {proyectoElegido && (
                <span style={{ color: 'var(--ink-400)', fontWeight: 400 }}> · {proyectoElegido.nombre}</span>
              )}
            </div>

            {clienteDeOtro && (
              <div
                className="card--riesgo"
                style={{ padding: 10, borderRadius: 8, marginTop: 10, fontSize: 'var(--text-sm)' }}
              >
                <div style={{ color: 'var(--risk-600)', fontWeight: 500 }}>Este cliente es de {clienteDeOtro}.</div>
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
            <textarea
              className="field"
              style={{ height: 'auto', padding: 8 }}
              rows={2}
              autoFocus
              placeholder="a qué vas: cerrar pedido, presentar gama, primera toma de contacto…"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
            />
            {errorAhora && <div className="field-error-text" style={{ marginTop: 8 }}>{errorAhora}</div>}
            <button
              className="btn btn-primary"
              style={{ marginTop: 12, width: '100%' }}
              disabled={arrancando || !objetivo.trim() || bloqueadoPorOtro}
              onClick={empezar}
            >
              {arrancando ? 'Empezando…' : 'Empezar'}
            </button>
          </div>
        )}

        <SeccionLista>
          <FilaNavegable
            icono="hoy"
            titulo="Planificar para otro día"
            onClick={irAPlanificar}
            chevron
          />
        </SeccionLista>
      </div>

      {enCursoAbierto && visitaEnCurso && (
        <VisitaEnCursoModal
          clienteNombre={visitaEnCurso.clienteNombre}
          objetivo={visitaEnCurso.objetivo}
          proyectoNombre={visitaEnCurso.proyectoNombre}
          enCursoDesde={visitaEnCurso.enCursoDesde}
          onContinuar={() => {
            onCerrar();
            navigate(`/visita/${visitaEnCurso.id}`);
          }}
          onEmpezarOtra={() => {
            setEnCursoAbierto(false);
            void lanzar();
          }}
          onCerrar={() => setEnCursoAbierto(false)}
        />
      )}
    </HojaSuperior>
  );
}
