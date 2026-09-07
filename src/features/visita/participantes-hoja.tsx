import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { Icono } from '@/components/ui/iconos';
import { FilaToggle } from '@/components/ui/fila-toggle';
import { useBuscador, BotonBuscar, CampoBuscar } from '@/components/ui/buscador';

interface ParticipantesHojaProps {
  visitaId: string;
  onCerrar: () => void;
}

interface ParticipanteCrudo {
  comercial_id: string;
  rol: string;
  estado: string;
}

interface Participante extends ParticipanteCrudo {
  nombre: string;
}

// Antes de esto, el modelo de "varios comerciales en la misma visita"
// existía entero en la base de datos (tabla visita_participante, política
// RLS ya cerrada, un responsable creado siempre al iniciar la visita) pero
// no había ningún sitio en la app para materializarlo — confirmado el
// 29/8/2026 buscando en todo el código. Esta es esa pieza.
//
// Quién puede añadir (opción C, 4/9/2026): Dirección Comercial y el
// RESPONSABLE de la visita. El resto ve "pedir ayuda con esta visita".
// Un comercial normal no puede leer la tabla `comercial` (RLS), así que
// el selector se llena con la RPC fn_comerciales_seleccionables
// (SECURITY DEFINER, solo id + nombre de activos).
export function ParticipantesHoja({ visitaId, onCerrar }: ParticipantesHojaProps) {
  const { comercial } = useSesionActual();
  const esDireccionComercial = comercial?.rol === 'direccion_comercial';
  const queryClient = useQueryClient();
  const buscador = useBuscador(false);
  const [busqueda, setBusqueda] = useState('');
  // Modo "añadir": aparece la lista de candidatos con casilla; marcas a
  // uno o varios y confirmas "Añadir N" — mismo patrón que "Seleccionar"
  // del resto de listas.
  const [modoAñadir, setModoAñadir] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [añadiendoLote, setAñadiendoLote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pidiendoAyuda, setPidiendoAyuda] = useState(false);
  const [notaAyuda, setNotaAyuda] = useState('');
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
  const [solicitudEnviada, setSolicitudEnviada] = useState(false);
  const [confirmandoQuitar, setConfirmandoQuitar] = useState<string | null>(null);
  const [quitandoId, setQuitandoId] = useState<string | null>(null);

  const { data: participantesCrudos } = useQuery({
    queryKey: ['participantes-visita', visitaId],
    queryFn: async (): Promise<ParticipanteCrudo[]> => {
      const { data, error: err } = await supabase
        .from('visita_participante')
        .select('comercial_id, rol, estado')
        .eq('visita_id', visitaId)
        // Fuera de la visita quien rechazó o fue expulsado: no se listan.
        .in('estado', ['pendiente', 'aceptado']);
      if (err) throw err;
      return data ?? [];
    },
  });

  // Quiénes rechazaron esta visita — para marcarlos en la lista de
  // "añadir" y dejar claro que es una reinvitación, no un alta nueva.
  const { data: rechazadosVisita } = useQuery({
    queryKey: ['participantes-rechazados', visitaId],
    enabled: !!comercial,
    queryFn: async (): Promise<string[]> => {
      const { data, error: err } = await supabase
        .from('visita_participante')
        .select('comercial_id')
        .eq('visita_id', visitaId)
        .eq('estado', 'rechazado');
      if (err) throw err;
      return (data ?? []).map((r) => r.comercial_id);
    },
  });

  // Ídem para quienes fueron expulsados: al volver a la lista de "añadir"
  // deben salir marcados ("expulsado · reinvitar"), no como un alta nueva.
  const { data: expulsadosVisita } = useQuery({
    queryKey: ['participantes-expulsados', visitaId],
    enabled: !!comercial,
    queryFn: async (): Promise<string[]> => {
      const { data, error: err } = await supabase
        .from('visita_participante')
        .select('comercial_id')
        .eq('visita_id', visitaId)
        .eq('estado', 'expulsado');
      if (err) throw err;
      return (data ?? []).map((r) => r.comercial_id);
    },
  });

  // id -> nombre. Un comercial normal no puede leer la tabla `comercial`
  // (RLS), así que el nombre de cualquier participante y de los
  // candidatos se resuelve con esta RPC SECURITY DEFINER (activos).
  const { data: nombresPorId } = useQuery({
    queryKey: ['comerciales-nombres'],
    enabled: !!comercial,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error: err } = await supabase.rpc('fn_comerciales_seleccionables');
      if (err) throw err;
      return new Map((data ?? []).map((c) => [c.id, c.nombre]));
    },
  });

  const participantes = useMemo<Participante[]>(
    () =>
      (participantesCrudos ?? []).map((p) => ({
        ...p,
        nombre: nombresPorId?.get(p.comercial_id) ?? '…',
      })),
    [participantesCrudos, nombresPorId]
  );

  // Puede añadir: Dirección Comercial, o el responsable de esta visita.
  const esResponsable =
    !!comercial && participantes.some((p) => p.rol === 'responsable' && p.comercial_id === comercial.id);
  const puedeAñadir = esDireccionComercial || esResponsable;

  const comercialesActivos = useMemo(
    () => (nombresPorId ? [...nombresPorId].map(([id, nombre]) => ({ id, nombre })) : undefined),
    [nombresPorId]
  );

  const idsYaParticipantes = new Set(participantes.map((p) => p.comercial_id));
  const rechazadosSet = new Set(rechazadosVisita ?? []);
  const expulsadosSet = new Set(expulsadosVisita ?? []);
  // El resto del equipo (no participantes de esta visita). Se ven SIEMPRE
  // al entrar (lista); al pulsar "+" salen con casilla para elegir a quién
  // añadir. El buscador solo filtra en modo añadir.
  const otrosDelEquipo = comercialesActivos
    ?.filter(
      (c) =>
        !idsYaParticipantes.has(c.id) &&
        c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
    )
    .map((c) => ({ ...c, rechazoPrevio: rechazadosSet.has(c.id), expulsadoPrevio: expulsadosSet.has(c.id) }));

  // Para no dejar que alguien mande la misma solicitud varias veces sin
  // darse cuenta — si ya tiene una pendiente para esta visita, se avisa en
  // vez de mostrar el formulario otra vez.
  const { data: solicitudPropia } = useQuery({
    queryKey: ['solicitud-propia-visita', visitaId, comercial?.id],
    enabled: !puedeAñadir && !!comercial,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('solicitud_reasignacion')
        .select('id, estado')
        .eq('visita_id', visitaId)
        .eq('comercial_solicitante_id', comercial!.id)
        .eq('estado', 'pendiente')
        .maybeSingle();
      if (err) throw err;
      return data;
    },
  });

  async function pedirAyuda() {
    if (!comercial) return;
    setEnviandoSolicitud(true);
    setError(null);
    const { error: err } = await supabase
      .from('solicitud_reasignacion')
      .insert({ visita_id: visitaId, comercial_solicitante_id: comercial.id, nota: notaAyuda.trim() || null });
    setEnviandoSolicitud(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSolicitudEnviada(true);
    setPidiendoAyuda(false);
    setNotaAyuda('');
    queryClient.invalidateQueries({ queryKey: ['solicitud-propia-visita', visitaId, comercial.id] });
    // El badge de "Solicitudes de ayuda" en la pantalla Yo de Dirección.
    queryClient.invalidateQueries({ queryKey: ['num-solicitudes-reasignacion-pendientes'] });
  }

  async function añadir(comercialId: string) {
    setError(null);
    // Si te añade otro, la fila nace 'pendiente' y a ese comercial le sale
    // un aviso en "Yo" para aceptar o rechazar. Si te añades a ti mismo,
    // nace 'aceptado'. `upsert` y no `insert` porque puede existir ya una
    // fila 'rechazado' de un intento anterior (hay único visita+comercial):
    // en ese caso se reactiva como 'pendiente'.
    const propio = comercialId === comercial?.id;
    const { error: err } = await supabase.from('visita_participante').upsert(
      {
        visita_id: visitaId,
        comercial_id: comercialId,
        rol: 'participante',
        estado: propio ? 'aceptado' : 'pendiente',
        anadido_por: comercial?.id ?? null,
        rechazo_visto: false,
      },
      { onConflict: 'visita_id,comercial_id' }
    );
    if (err) {
      setError(err.message);
      return;
    }
    for (const clave of [
      ['participantes-visita', visitaId],
      ['participantes-rechazados', visitaId],
      ['participantes-expulsados', visitaId],
      ['invitaciones-visita'],
      ['expulsiones-participacion'],
      ['participantes-visitas-hoy'],
      ['agenda-participantes'],
    ]) {
      queryClient.invalidateQueries({ queryKey: clave });
    }
  }

  function alternarSeleccion(id: string) {
    setSeleccionados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function salirModoAñadir() {
    setModoAñadir(false);
    setSeleccionados(new Set());
    buscador.cerrar();
    setBusqueda('');
  }

  async function añadirSeleccionados() {
    if (seleccionados.size === 0 || añadiendoLote) return;
    setAñadiendoLote(true);
    setError(null);
    for (const id of seleccionados) {
      await añadir(id);
    }
    setAñadiendoLote(false);
    salirModoAñadir();
  }

  // Quitar a alguien de la visita:
  //   · si me saco YO -> DELETE limpio (no hay a quién avisar).
  //   · si expulso a OTRO -> la fila pasa a 'expulsado' para que al
  //     afectado le llegue un aviso en "Yo"; queda fuera igual porque las
  //     listas filtran a 'pendiente'/'aceptado'.
  // La fila del responsable no se puede tocar (lo impide el trigger), así
  // que no se ofrece el botón para esa fila.
  async function quitar(comercialId: string) {
    setQuitandoId(comercialId);
    setError(null);
    const salgoYo = comercialId === comercial?.id;
    const { error: err } = salgoYo
      ? await supabase.from('visita_participante').delete().eq('visita_id', visitaId).eq('comercial_id', comercialId)
      : await supabase
          .from('visita_participante')
          .update({ estado: 'expulsado', rechazo_visto: false })
          .eq('visita_id', visitaId)
          .eq('comercial_id', comercialId);
    setQuitandoId(null);
    setConfirmandoQuitar(null);
    if (err) {
      setError(err.message);
      return;
    }
    for (const clave of [
      ['participantes-visita', visitaId],
      ['participantes-rechazados', visitaId],
      ['participantes-expulsados', visitaId],
      ['invitaciones-visita'],
      ['rechazos-participacion'],
      ['expulsiones-participacion'],
      ['participantes-visitas-hoy'],
      ['agenda-participantes'],
    ]) {
      queryClient.invalidateQueries({ queryKey: clave });
    }
  }

  return (
    <HojaSuperior
      titulo="Equipo"
      onCerrar={onCerrar}
      derecha={
        puedeAñadir ? (
          <>
            {!buscador.abierto && (
              <BotonBuscar
                etiqueta="buscar comercial…"
                onClick={() => {
                  // Buscar = querer añadir a alguien: se entra en modo
                  // seleccionar y además se abre el campo de búsqueda.
                  setModoAñadir(true);
                  buscador.abrir();
                }}
              />
            )}
            {!modoAñadir && (
              <button
                type="button"
                className="boton-icono"
                aria-label="Añadir al equipo"
                title="Añadir al equipo"
                onClick={() => setModoAñadir(true)}
              >
                <Icono nombre="mas" size={18} />
              </button>
            )}
          </>
        ) : undefined
      }
    >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {participantes.map((p) => {
            const esYo = p.comercial_id === comercial?.id;
            const puedeQuitar = p.rol !== 'responsable' && (puedeAñadir || esYo);
            return (
              <div
                key={p.comercial_id}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
              >
                <span style={{ fontSize: 'var(--text-sm)' }}>{p.nombre}</span>
                {confirmandoQuitar === p.comercial_id ? (
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                      {esYo ? '¿Salir?' : '¿Quitar?'}
                    </span>
                    <button
                      type="button"
                      className="chip"
                      style={{ fontSize: 11, color: 'var(--risk-600)' }}
                      disabled={quitandoId === p.comercial_id}
                      onClick={() => quitar(p.comercial_id)}
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      className="chip"
                      style={{ fontSize: 11 }}
                      disabled={quitandoId === p.comercial_id}
                      onClick={() => setConfirmandoQuitar(null)}
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {p.estado === 'pendiente' && (
                      <span className="chip" style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                        sin aceptar
                      </span>
                    )}
                    <span className="chip" style={{ fontSize: 11 }}>{p.rol}</span>
                    {puedeQuitar && (
                      <button
                        type="button"
                        className="chip"
                        style={{ fontSize: 11, color: 'var(--ink-400)' }}
                        aria-label={esYo ? 'Salir de la visita' : `Quitar a ${p.nombre}`}
                        onClick={() => setConfirmandoQuitar(p.comercial_id)}
                      >
                        {esYo ? 'salir' : 'quitar'}
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
          {participantesCrudos == null && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Cargando…</span>
          )}
          {participantesCrudos != null && participantes.length === 0 && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Ya no participas en esta visita.</span>
          )}
        </div>

        {/* Resto del equipo. Al entrar: lista (para ver quién hay). Con "+":
            casilla en cada uno para elegir a quién añadir. */}
        {comercialesActivos != null && (otrosDelEquipo?.length || modoAñadir || buscador.abierto) ? (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--ink-100)', paddingTop: 12 }}>
            <div className="label" style={{ marginTop: 0 }}>
              {modoAñadir ? 'Añadir al equipo — marca a quién' : 'Resto del equipo'}
            </div>
            {buscador.abierto && (
              <div style={{ marginBottom: 6 }}>
                <CampoBuscar
                  value={busqueda}
                  onChange={setBusqueda}
                  placeholder="buscar comercial…"
                  onCerrar={() => {
                    buscador.cerrar();
                    setBusqueda('');
                  }}
                />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: modoAñadir ? 2 : 4 }}>
              {otrosDelEquipo?.map((c) => {
                const nota = c.expulsadoPrevio ? 'expulsado · se reinvita' : c.rechazoPrevio ? 'rechazó · se reinvita' : null;
                if (!modoAñadir) {
                  return (
                    <div
                      key={c.id}
                      style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', padding: '4px 0' }}
                    >
                      {c.nombre}
                      {nota && <span style={{ fontSize: 'var(--text-xs)' }}> · {nota}</span>}
                    </div>
                  );
                }
                const marcado = seleccionados.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="interlocutor-fila__cuerpo"
                    style={{ width: '100%' }}
                    aria-pressed={marcado}
                    onClick={() => alternarSeleccion(c.id)}
                  >
                    <FilaToggle marcada={marcado} />
                    <span className="interlocutor-fila__datos">
                      <span className="interlocutor-fila__nombre">{c.nombre}</span>
                      {nota && <span className="interlocutor-fila__sub">{nota}</span>}
                    </span>
                  </button>
                );
              })}
              {busqueda.trim() && otrosDelEquipo?.length === 0 && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>Sin coincidencias.</span>
              )}
              {!busqueda.trim() && otrosDelEquipo?.length === 0 && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                  Todo el equipo activo ya está en esta visita.
                </span>
              )}
            </div>
            {modoAñadir && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={salirModoAñadir} disabled={añadiendoLote}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={seleccionados.size === 0 || añadiendoLote}
                  onClick={añadirSeleccionados}
                >
                  {añadiendoLote
                    ? 'Añadiendo…'
                    : seleccionados.size > 0
                      ? `Añadir ${seleccionados.size}`
                      : 'Añadir'}
                </button>
              </div>
            )}
          </div>
        ) : null}

        {puedeAñadir ? null : solicitudPropia || solicitudEnviada ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 12 }}>
            Ya has pedido ayuda con esta visita — Dirección Comercial lo verá en su lista de pendientes.
          </div>
        ) : pidiendoAyuda ? (
          <div style={{ marginTop: 12 }}>
            <input
              className="field"
              autoFocus
              value={notaAyuda}
              onChange={(e) => setNotaAyuda(e.target.value)}
              placeholder="por qué necesitas ayuda (opcional)"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPidiendoAyuda(false)} disabled={enviandoSolicitud}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={pedirAyuda} disabled={enviandoSolicitud}>
                {enviandoSolicitud ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setPidiendoAyuda(true)}>
            Pedir ayuda con esta visita
          </button>
        )}

        {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
    </HojaSuperior>
  );
}
