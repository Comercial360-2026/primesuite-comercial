import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { CLIENTE_ARCHIVADO, hayNombreDuplicado } from '@/lib/nombres-cliente';
import { useConfirmacionDuplicado } from '@/hooks/use-confirmacion-duplicado';
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
import { AvisoNombreDuplicado } from '@/components/ui/aviso-nombre-duplicado';
import { SelectorMedioVisita } from '@/components/ui/selector-medio-visita';
import { ResultadosCuentaCrm } from '@/features/clientes/cuenta-crm';
import type { MedioVisita } from '@/lib/medio-visita';
import { TextareaDictado, type RefCampoDictado } from '@/components/ui/campo-dictado';
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
  const [medio, setMedio] = useState<MedioVisita>('presencial');
  const [enlace, setEnlace] = useState('');
  const refDictadoObjetivo = useRef<RefCampoDictado>(null);
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
        .neq('estado_relacion', CLIENTE_ARCHIVADO)
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

  // Un solo proyecto vivo → se elige solo, no se muestra el paso. Solo una
  // vez por cliente: si el comercial retrocede a propósito (para crear uno
  // nuevo, ver `puedeVolverAProyecto`), no se re-autoselecciona de golpe.
  const autoSeleccionadoPara = useRef<string | null>(null);
  useEffect(() => {
    if (!proyectoId && proyectos?.length === 1 && autoSeleccionadoPara.current !== clienteId) {
      autoSeleccionadoPara.current = clienteId;
      setProyectoId(proyectos[0].id);
    }
  }, [proyectos, proyectoId, clienteId]);

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

  const proyectoDuplicado = hayNombreDuplicado(nombreProyectoNuevo, proyectos ?? []);
  const [dupProyectoConfirmado, confirmarDupProyecto] = useConfirmacionDuplicado(
    nombreProyectoNuevo.trim().toLowerCase()
  );

  async function crearProyectoYElegir() {
    const nombre = nombreProyectoNuevo.trim();
    if (!clienteId || !nombre || (proyectoDuplicado && !dupProyectoConfirmado)) return;
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

  async function lanzar(objetivoTexto: string) {
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
        medio,
        enlaceReunion: enlace,
      });
      onCerrar();
      navigate(`/visita/${visitaId}`);
    } catch (e) {
      setArrancando(false);
      setErrorAhora(e instanceof Error ? e.message : 'No se pudo empezar la visita.');
    }
  }

  function empezar() {
    const objetivoConsolidado = (refDictadoObjetivo.current?.consolidar() ?? objetivo).trim();
    if (!objetivoConsolidado) {
      setErrorAhora('Escribe a qué vas.');
      return;
    }
    if (visitaEnCurso) {
      setEnCursoAbierto(true);
      return;
    }
    void lanzar(objetivoConsolidado);
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
  // de proyecto siempre se puede rehacer aunque haya uno solo — es la única
  // forma de llegar a "Nuevo proyecto" cuando se autoseleccionó de golpe.
  const puedeVolverAProyecto = !!proyectoId;
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

  // Parámetros con los que se abre el alta de cliente desde aquí: el medio elegido arriba viaja con ella.
  function paramsAlta(base: Record<string, string>) {
    const q = new URLSearchParams(base);
    if (medio !== 'presencial') q.set('medio', medio);
    if (medio === 'teams' && enlace.trim()) q.set('enlace', enlace.trim());
    return q.toString();
  }

  return (
    <HojaSuperior titulo="empezar visita" onCerrar={cerrarORetroceder}>
      <div className="lista-agrupada" style={{ padding: '0 4px 8px' }}>
        {/* ¿Cómo es la visita? va ARRIBA y en todos los pasos (antes solo salía en el último, tras elegir cliente y proyecto,
            y parecía que no se podía elegir). Se arrastra al alta de cliente si hay que crearlo. */}
        <SelectorMedioVisita medio={medio} enlace={enlace} onMedio={setMedio} onEnlace={setEnlace} />

        {/* Paso 1 — cliente */}
        {!clienteId && (
          <div>
            <input
              className="field"
              autoFocus
              autoComplete="off"
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
            {/* Cuentas del CRM que aún no son cliente (3.700 en el CRM, solo unas pocas son clientes): el CRM nunca crea
                clientes solo, así que aquí se ofrecen. Tocar una abre el alta con esa cuenta ya elegida; si ya hay un
                cliente con esa cuenta (o una hermana), se sigue con ese. */}
            {termino.length >= 3 && (
              <ResultadosCuentaCrm
                texto={termino}
                titulo="En el CRM (aún no es cliente)"
                onElegir={(c, existente) => {
                  if (existente) {
                    setBusqueda('');
                    setClienteId(existente.id);
                    return;
                  }
                  onCerrar();
                  navigate(`/clientes/nuevo?${paramsAlta({ nombre: c.nombre, cuenta: c.accountid })}`, { state: desde(location) });
                }}
              />
            )}
            {termino.length >= 2 && !buscando && encontrados?.length === 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 8 }}>
                  Ningún cliente tuyo se llama así.
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    onCerrar();
                    navigate(`/clientes/nuevo?${paramsAlta({ nombre: termino })}`, { state: desde(location) });
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

        {/* Paso 2 — proyecto (se salta con autoselección si hay uno solo,
            pero sigue accesible retrocediendo para poder crear uno nuevo) */}
        {!!clienteId && !proyectoId && (
          <div>
            <div className="label" style={{ marginTop: 0 }}>
              {cliente?.nombre ? `${cliente.nombre} · ¿en qué proyecto?` : '¿En qué proyecto?'}
            </div>
            <SeccionLista>
              {proyectos?.map((p) => (
                <FilaNavegable
                  key={p.id}
                  avatar={p.nombre}
                  avatarForma="proyecto"
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
                  className={`field${creandoProyErr ? ' field--error' : ''}`}
                  autoFocus
                  autoComplete="off"
                  value={nombreProyectoNuevo}
                  onChange={(e) => setNombreProyectoNuevo(e.target.value)}
                  placeholder="p. ej. Mantenimiento, Obra nueva…"
                />
                {creandoProyErr && <div className="field-error-text">{creandoProyErr}</div>}
                {proyectoDuplicado && !dupProyectoConfirmado && (
                  <AvisoNombreDuplicado
                    titulo="Ya hay un proyecto con este nombre."
                    subtitulo="Si es una línea de negocio distinta, puedes crearlo igual."
                    onConfirmar={confirmarDupProyecto}
                  />
                )}
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
                    disabled={
                      creandoProyLoad || !nombreProyectoNuevo.trim() || (proyectoDuplicado && !dupProyectoConfirmado)
                    }
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
            {/* El proyecto al que irá la visita, a la vista y tocable: antes era un texto gris y,
                con un solo proyecto, se elegía solo sin que se notara. */}
            <SeccionLista>
              <FilaNavegable
                titulo={proyectoElegido?.nombre ?? '…'}
                subtitulo={`${cliente?.nombre ?? ''} · la visita irá a este proyecto — toca para cambiar`}
                onClick={() => setProyectoId('')}
              />
            </SeccionLista>

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
            <TextareaDictado
              ref={refDictadoObjetivo}
              rows={2}
              autoFocus
              placeholder="a qué vas: cerrar pedido, presentar gama, primera toma de contacto…"
              valor={objetivo}
              onCambio={setObjetivo}
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
            void lanzar(objetivo.trim());
          }}
          onCerrar={() => setEnCursoAbierto(false)}
        />
      )}
    </HojaSuperior>
  );
}
