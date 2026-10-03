import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { conReintentoDeSesion } from '@/lib/con-reintento-de-sesion';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { obtenerOperacionesConError, procesarCola, eliminarOperacion, EVENTO_COLA_PROCESADA } from '@/lib/offline-queue';
import { useEspacioEquipo } from '@/hooks/use-espacio-equipo';
import { useEspacioManualActivo } from '@/hooks/use-ajustes';
import { formatearMB } from '@/lib/espacio';
import { esSinRed } from '@/lib/red';
import { fechaCorta } from '@/lib/fechas';
import { useAvisosParticipacion } from '@/hooks/use-avisos-participacion';
import { useAvisosGestion } from '@/hooks/use-avisos-gestion';
import { ReportarProblemaHoja } from '@/features/perfil/reportar-problema-hoja';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { FilaDato } from '@/components/ui/fila-dato';
import { TarjetaAccion } from '@/components/ui/tarjeta-accion';
import { CabeceraSeccion } from '@/components/ui/cabecera-seccion';
import { Avatar } from '@/components/ui/avatar';
import { AyudaNota } from '@/components/ui/ayuda-nota';
import { Aviso } from '@/components/ui/aviso';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { Icono } from '@/components/ui/iconos';

// La copia automática salta a los 7 días; a los 8 sin una confirmada es que algo falla.
const DIAS_AVISO_BACKUP = 8;

const ETIQUETA_ROL: Record<string, string> = {
  comercial: 'Comercial',
  direccion_comercial: 'Dirección comercial',
};

// Pantalla "Yo" — mismo sitio en el bottom nav para cualquier rol, siempre.
// El acceso a Vocabulario (antes ocupaba este mismo hueco del menú solo
// para direccion_comercial, quitándole a ese rol su propio acceso a "Yo" y
// por tanto al cierre de sesión) vive ahora dentro de esta pantalla, como
// una fila más — no compite por la posición fija del menú.
//
// Distribución por intención (ver 08_sistema_diseno.md §"Sistema de filas"):
//   · cabecera de identidad (nombre + rol), sin sección
//   · aviso rojo "N sin sincronizar" si lo hay — destaca, no es una fila
//   · "Tu espacio" (solo comercial normal): Mi espacio, con lo que ocupan
//     tus visitas como dato
//   · "El equipo" (solo dir. comercial): una única fila "Almacenamiento"
//     — lleva a "Mi espacio", que por dentro ya trae el segmentado "Mis
//     visitas / Por comercial"; el % del pozo del equipo va como valor de
//     esa fila. Debajo, Actividad por comercial y la copia de seguridad
//     (TarjetaAccion — lleva barra de antigüedad y su propio botón).
//   · "Gestión" (solo dir. comercial): accesos de administración
//   · SeccionLista suelta: Cerrar sesión (fila roja, al final)
//
// Para Dirección esto eran antes tres filas de espacio en dos secciones
// ("Mi espacio" en "Tu espacio"; la FilaDato "Espacio del equipo" y
// "Consumo por comercial" en "El equipo"), y dos de ellas abrían la misma
// pantalla. Ahora es una sola fila.
export function Yo() {
  const { comercial } = useSesionActual();
  const { cerrarVisita } = useVisitaActivaContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [errorExportacion, setErrorExportacion] = useState<string | null>(null);
  const [reportando, setReportando] = useState(false);

  const {
    invitaciones,
    rechazos,
    expulsiones,
    solicitudesReapertura,
    rechazosReapertura,
    aceptar,
    rechazar,
    marcarRechazoVisto,
    marcarExpulsionVista,
    aceptarReapertura,
    rechazarReapertura,
    marcarRechazoReaperturaVisto,
  } = useAvisosParticipacion();
  const [procesandoAviso, setProcesandoAviso] = useState<string | null>(null);
  const [errorAviso, setErrorAviso] = useState<string | null>(null);

  async function resolverAviso(id: string, accion: () => Promise<void>) {
    setProcesandoAviso(id);
    setErrorAviso(null);
    try {
      await accion();
    } catch (err) {
      setErrorAviso(
        esSinRed(err) ? 'Sin conexión. Inténtalo cuando tengas red.' : 'No se pudo guardar. Inténtalo de nuevo.'
      );
    } finally {
      setProcesandoAviso(null);
    }
  }

  // Tocar el aviso de «Copia a SharePoint»: vuelve a dar 5 intentos a las copias
  // agotadas (el cron las retoma en ≤10 min) y refresca el aviso.
  async function reintentarArchivado() {
    await supabase.rpc('fn_reintentar_archivado');
    void queryClient.invalidateQueries({ queryKey: ['avisos-estado-archivado'] });
  }

  const esDireccionComercial = comercial?.rol === 'direccion_comercial';
  const etiquetaRol = comercial?.rol ? ETIQUETA_ROL[comercial.rol] ?? comercial.rol : '—';

  // Los 3 avisos de "Gestión" (peticiones de acceso, solicitudes de ayuda,
  // clientes duplicados) — compartidos con el punto de la pestaña "Yo" en
  // LayoutShell, ver use-avisos-gestion.ts.
  const { numSolicitudesPendientes, numPeticionesAcceso, numGruposDuplicados, topeBriefing, estadoArchivado } = useAvisosGestion();

  // Partes de "algo va mal" sin resolver — se muestran aquí mismo (como las
  // visitas de equipo), no en una pantalla aparte.
  const { data: reportesPendientes } = useQuery({
    queryKey: ['reportes-problema-pendientes'],
    refetchOnMount: 'always',
    enabled: esDireccionComercial,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('reporte_problema')
        .select('id, texto, creado_en, contexto, comercial:comercial_id(nombre)')
        .is('resuelto_en', null)
        .order('creado_en', { ascending: false });
      if (err) throw err;
      return data ?? [];
    },
  });

  async function marcarReporteVisto(id: string) {
    await conReintentoDeSesion(
      () =>
        supabase
          .from('reporte_problema')
          .update({ resuelto_en: new Date().toISOString(), resuelto_por: comercial!.id }, { count: 'exact' })
          .eq('id', id),
      'No se ha podido marcar como visto (0 filas afectadas).'
    );
    queryClient.invalidateQueries({ queryKey: ['reportes-problema-pendientes'] });
  }

  // Visible para cualquier comercial, no solo Dirección Comercial: es la
  // cola local de SU PROPIO dispositivo, no un dato compartido. Antes, un
  // fallo permanente (5 intentos agotados, o heredado de un padre que
  // falló) era invisible salvo mirando IndexedDB con herramientas de
  // desarrollador — ninguna pantalla lo mostraba nunca.
  const { data: operacionesConError } = useQuery({
    queryKey: ['operaciones-con-error'],
    refetchOnMount: 'always',
    refetchInterval: 60_000,
    queryFn: obtenerOperacionesConError,
  });

  // El motor de sincronización avisa al terminar cada pasada; también al
  // recuperar conexión. Así "N sin sincronizar" se actualiza al instante en
  // cuanto algo sube, sin esperar al intervalo de 60 s.
  useEffect(() => {
    const refrescar = () =>
      queryClient.invalidateQueries({ queryKey: ['operaciones-con-error'] });
    window.addEventListener(EVENTO_COLA_PROCESADA, refrescar);
    window.addEventListener('online', refrescar);
    return () => {
      window.removeEventListener(EVENTO_COLA_PROCESADA, refrescar);
      window.removeEventListener('online', refrescar);
    };
  }, [queryClient]);

  // "N sin sincronizar" son operaciones que YA agotaron sus 5 reintentos —
  // no es un problema de conexión (el motor las reintenta solas cada 60s o
  // al reconectar y sigue fallando), así que el mensaje no puede decir "se
  // sube solo en cuanto haya conexión": eso no explica nada y confunde
  // (Cesar lo reportó: "por qué aparece si tengo conexión"). Cada una
  // enseña su `ultimoError` real y deja reintentar ya mismo o descartarla.
  const [reintentandoCola, setReintentandoCola] = useState(false);
  const [descartandoOpId, setDescartandoOpId] = useState<string | null>(null);
  const [errorDescarte, setErrorDescarte] = useState<string | null>(null);

  async function reintentarAhora() {
    setReintentandoCola(true);
    // El motor automático (60s/online/arranque) ya NO reintenta solo lo que
    // está en 'error' — solo esta acción explícita lo hace (ver
    // obtenerPendientes en db.ts).
    await procesarCola({ incluirErrores: true });
    queryClient.invalidateQueries({ queryKey: ['operaciones-con-error'] });
    setReintentandoCola(false);
  }

  async function descartarOperacion(id: string) {
    setErrorDescarte(null);
    try {
      await eliminarOperacion(id);
    } catch (err) {
      setErrorDescarte(err instanceof Error ? err.message : String(err));
      return;
    }
    setDescartandoOpId(null);
    queryClient.invalidateQueries({ queryKey: ['operaciones-con-error'] });
  }

  const ETIQUETA_ENTIDAD: Record<string, string> = {
    cliente: 'cliente',
    proyecto: 'proyecto',
    visita: 'visita',
    visita_objetivo: 'objetivo de visita',
    hallazgo: 'hallazgo',
    captura_libre: 'captura',
    oportunidad: 'oportunidad',
    proximo_paso: 'próximo paso',
    ubicacion: 'ubicación',
  };

  // Últimos intentos de copia (automática o manual): la última confirmada decide el aviso; mientras
  // hay una enviada esperando a SharePoint se consulta cada 5 s.
  const { data: intentosBackup } = useQuery({
    queryKey: ['ultimo-backup-completo'],
    enabled: esDireccionComercial,
    refetchOnMount: 'always',
    refetchInterval: (q) => (q.state.data?.[0]?.estado === 'enviada' ? 5000 : false),
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('registro_backup_completo')
        .select('estado, creado_en, error')
        .order('creado_en', { ascending: false })
        .limit(10);
      if (err) throw err;
      return data;
    },
  });
  const ultimoBackup = intentosBackup?.find((i) => i.estado === 'confirmada')?.creado_en ?? null;
  const ultimoIntento = intentosBackup?.[0];
  const copiaEnCurso = ultimoIntento?.estado === 'enviada';
  const copiaFallida = ultimoIntento?.estado === 'fallida';

  const diasDesdeBackup = ultimoBackup
    ? Math.floor((Date.now() - new Date(ultimoBackup).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const backupPendiente = diasDesdeBackup === null || diasDesdeBackup >= DIAS_AVISO_BACKUP || copiaFallida;

  // La copia la hace el servidor (generar-copia-seguridad) y la sube a SharePoint; aquí solo se pide.
  async function hacerCopiaCompleta() {
    if (!navigator.onLine) {
      setErrorExportacion('Sin conexión. Vuelve a intentarlo cuando tengas red.');
      return;
    }
    setExportando(true);
    setErrorExportacion(null);
    try {
      const { data, error: err } = await supabase.functions.invoke('generar-copia-seguridad', { body: { forzar: true } });
      if (err) throw err;
      if (data?.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ['ultimo-backup-completo'] });
    } catch (err) {
      setErrorExportacion(
        esSinRed(err)
          ? 'Sin conexión. Vuelve a intentarlo cuando tengas red.'
          : 'No se pudo iniciar la copia. Inténtalo de nuevo.'
      );
    } finally {
      setExportando(false);
    }
  }

  // Espacio del equipo (el pozo común de Storage). Misma fuente que el
  // medidor de "Mi espacio" y el banner de la cáscara — antes esta pantalla
  // lo pedía por su cuenta con fn_espacio_storage_usado y lo pintaba como
  // una tarjeta aparte con el mismo número.
  const { estado: espacioEquipo } = useEspacioEquipo();
  const espacioManual = useEspacioManualActivo() === true;
  const tonoEquipo: 'neutral' | 'aviso' | 'riesgo' =
    espacioEquipo == null
      ? 'neutral'
      : espacioEquipo.nivel === 'bloqueo' || espacioEquipo.nivel === 'critico_equipo'
        ? 'riesgo'
        : espacioEquipo.nivel === 'aviso_equipo'
          ? 'aviso'
          : 'neutral';

  async function cerrarSesion() {
    setCerrando(true);
    setError(null);
    const { error: err } = await supabase.auth.signOut();
    setCerrando(false);
    if (err) {
      setError('No se pudo cerrar la sesión. Inténtalo de nuevo.');
      return;
    }
    // El logout no recarga la página (navegación de React, no un F5 real),
    // así que el banner "visita en curso" — estado solo de memoria, ver
    // use-visita-activa-context.tsx — sobrevive al cierre de sesión si no
    // se limpia explícitamente aquí. Hueco real: mostraba la visita de la
    // sesión anterior como si perteneciera a la nueva sesión.
    cerrarVisita();
    navigate('/login', { replace: true });
  }

  const numErrores = operacionesConError?.length ?? 0;

  return (
    <div className="screen">
      <CabeceraSeccion titulo="Yo" icono="yo" ayuda="yo" />

      <div className="lista-agrupada">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingInline: 'var(--fila-pad-x)' }}>
          {comercial?.nombre && <Avatar nombre={comercial.nombre} size="md" />}
          <div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, letterSpacing: '-0.008em' }}>{comercial?.nombre ?? '—'}</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', marginTop: 2 }}>{etiquetaRol}</div>
          </div>
        </div>

        {numErrores > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Aviso tipo="error" titulo={`${numErrores} elemento${numErrores > 1 ? 's' : ''} sin sincronizar`}>
              No se han podido guardar en el servidor tras varios intentos — el motivo va debajo de cada uno, no siempre es falta de conexión.
            </Aviso>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {operacionesConError!.map((op, i) => (
                <div
                  key={op.id}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 6,
                    padding: '10px 0', borderTop: i === 0 ? undefined : '1px solid var(--ink-100)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                        {ETIQUETA_ENTIDAD[op.entidad] ?? op.entidad}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 2 }}>
                        {op.ultimoError ?? 'Sin detalle del error.'}
                        {' · '}{op.intentos} intento{op.intentos === 1 ? '' : 's'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="boton-icono"
                      aria-label="Descartar"
                      title="Descartar"
                      onClick={() => { setErrorDescarte(null); setDescartandoOpId(op.id); }}
                    >
                      <Icono nombre="borrar" size={18} />
                    </button>
                  </div>
                  {descartandoOpId === op.id && (
                    <ConfirmacionBorrado
                      onCancelar={() => setDescartandoOpId(null)}
                      onConfirmar={() => descartarOperacion(op.id)}
                      error={errorDescarte}
                      confirmar="Sí, descartar"
                      reversible="No podrás recuperarlo: descarta este cambio guardado sin subir, no lo reintenta más."
                    >
                      Vas a descartar este {ETIQUETA_ENTIDAD[op.entidad] ?? op.entidad}.
                    </ConfirmacionBorrado>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 8 }}
                disabled={reintentandoCola}
                onClick={reintentarAhora}
              >
                {reintentandoCola ? 'Reintentando…' : 'Reintentar ahora'}
              </button>
            </div>

            <AyudaNota concepto="sincronizacion" />
          </div>
        )}

        {(invitaciones.length > 0 ||
          rechazos.length > 0 ||
          expulsiones.length > 0 ||
          solicitudesReapertura.length > 0 ||
          rechazosReapertura.length > 0) && (
          <div className="card">
            <div className="label" style={{ marginTop: 0 }}>Visitas de equipo</div>

            {solicitudesReapertura.map((sol) => (
              <div key={sol.id} style={{ marginTop: 'var(--space-3)' }}>
                <div style={{ fontSize: 'var(--text-sm)' }}>
                  {sol.solicitadoPorNombre} quiere reabrir la visita de {sol.clienteNombre}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 2 }}>
                  {fechaCorta(sol.fechaVisita)}
                </div>
                <div className="fila-btns" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={procesandoAviso === sol.id}
                    onClick={() => resolverAviso(sol.id, () => aceptarReapertura(sol.id))}
                  >
                    {procesandoAviso === sol.id ? 'Guardando…' : 'Aceptar'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={procesandoAviso === sol.id}
                    onClick={() => resolverAviso(sol.id, () => rechazarReapertura(sol.id))}
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}

            {rechazosReapertura.map((r) => (
              <div key={r.id} style={{ marginTop: 'var(--space-3)' }}>
                <div style={{ fontSize: 'var(--text-sm)' }}>
                  Te han rechazado reabrir la visita de {r.clienteNombre}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 2 }}>
                  {fechaCorta(r.fechaVisita)}
                </div>
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={procesandoAviso === r.id}
                    onClick={() => resolverAviso(r.id, () => marcarRechazoReaperturaVisto(r.id))}
                  >
                    {procesandoAviso === r.id ? 'Guardando…' : 'Entendido'}
                  </button>
                </div>
              </div>
            ))}

            {invitaciones.map((inv) => (
              <div key={inv.id} style={{ marginTop: 'var(--space-3)' }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{inv.clienteNombre}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 2 }}>
                  {fechaCorta(inv.fechaVisita)} · te añadió {inv.anadidoPorNombre}
                </div>
                <div className="fila-btns" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={procesandoAviso === inv.id}
                    onClick={() => resolverAviso(inv.id, () => aceptar(inv.id))}
                  >
                    {procesandoAviso === inv.id ? 'Guardando…' : 'Aceptar'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={procesandoAviso === inv.id}
                    onClick={() => resolverAviso(inv.id, () => rechazar(inv.id))}
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}

            {rechazos.map((r) => (
              <div key={r.id} style={{ marginTop: 'var(--space-3)' }}>
                <div style={{ fontSize: 'var(--text-sm)' }}>
                  {r.comercialNombre} ha rechazado la visita de {r.clienteNombre}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 2 }}>
                  {fechaCorta(r.fechaVisita)}
                </div>
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={procesandoAviso === r.id}
                    onClick={() => resolverAviso(r.id, () => marcarRechazoVisto(r.id))}
                  >
                    {procesandoAviso === r.id ? 'Guardando…' : 'Entendido'}
                  </button>
                </div>
              </div>
            ))}

            {expulsiones.map((e) => (
              <div key={e.id} style={{ marginTop: 'var(--space-3)' }}>
                <div style={{ fontSize: 'var(--text-sm)' }}>
                  Te han quitado de la visita de {e.clienteNombre}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 2 }}>
                  {fechaCorta(e.fechaVisita)}
                </div>
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={procesandoAviso === e.id}
                    onClick={() => resolverAviso(e.id, () => marcarExpulsionVista(e.id))}
                  >
                    {procesandoAviso === e.id ? 'Guardando…' : 'Entendido'}
                  </button>
                </div>
              </div>
            ))}

            {errorAviso && (
              <div className="field-error-text" style={{ marginTop: 8 }}>{errorAviso}</div>
            )}
          </div>
        )}

        {esDireccionComercial && (reportesPendientes?.length ?? 0) > 0 && (
          <div className="card">
            <div className="label" style={{ marginTop: 0 }}>Problemas reportados</div>
            {reportesPendientes!.map((r) => {
              const ctx = (r.contexto ?? {}) as { version?: string; url?: string };
              return (
                <div key={r.id} style={{ marginTop: 'var(--space-3)' }}>
                  <div style={{ fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap' }}>{r.texto}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 2 }}>
                    {(r.comercial as unknown as { nombre: string } | null)?.nombre ?? '—'} · {fechaCorta(r.creado_en)}
                    {ctx.version ? ` · v${ctx.version}` : ''}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={procesandoAviso === r.id}
                      onClick={() => resolverAviso(r.id, () => marcarReporteVisto(r.id))}
                    >
                      {procesandoAviso === r.id ? 'Guardando…' : 'Entendido'}
                    </button>
                  </div>
                </div>
              );
            })}
            {errorAviso && (
              <div className="field-error-text" style={{ marginTop: 8 }}>{errorAviso}</div>
            )}
          </div>
        )}

        {!esDireccionComercial && espacioManual && (
          <SeccionLista titulo="Tu espacio">
            <FilaNavegable
              icono="almacenamiento"
              titulo="Mi espacio"
              subtitulo="Tus visitas y lo que ocupan"
              valor={
                espacioEquipo ? (
                  <span style={{ color: 'var(--ink-900)', fontWeight: 500 }}>
                    {formatearMB(espacioEquipo.miUso)} MB
                  </span>
                ) : undefined
              }
              to="/mi-espacio"
            />
          </SeccionLista>
        )}

        {esDireccionComercial && (
          <div data-tour="direccion-equipo" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <SeccionLista titulo="El equipo">
              {/* Una sola fila de almacenamiento: lleva a "Mi espacio", que
                  por dentro ya tiene el segmentado "Mis visitas / Por
                  comercial". El % del equipo (el dato que manda) va como
                  valor, con su tono; antes esto eran tres filas —"Mi
                  espacio", la FilaDato "Espacio del equipo" y "Consumo por
                  comercial"— repartidas en dos secciones y dos de ellas
                  abrían la misma pantalla. */}
              {espacioManual ? (
                <FilaNavegable
                  icono="almacenamiento"
                  titulo="Almacenamiento"
                  subtitulo="Tus visitas y el consumo del equipo"
                  tono={tonoEquipo}
                  valor={espacioEquipo ? `${Math.round(espacioEquipo.pctEquipo)}%` : 'Calculando…'}
                  to="/mi-espacio"
                />
              ) : (
                // Sin liberación manual solo queda el dato: cuánto lleva el pozo del equipo.
                <FilaDato
                  icono="almacenamiento"
                  etiqueta="Espacio del equipo"
                  tono={tonoEquipo}
                  valor={espacioEquipo ? `${Math.round(espacioEquipo.pctEquipo)}%` : 'Calculando…'}
                />
              )}
              <FilaNavegable
                icono="equipo"
                titulo="Actividad por comercial"
                subtitulo="Visitas, hallazgos y oportunidades de cada uno"
                to="/actividad-comerciales"
              />
            </SeccionLista>

            <TarjetaAccion
              titulo="Copia de seguridad"
              tono={backupPendiente ? 'aviso' : 'neutral'}
              barra={diasDesdeBackup === null ? 100 : Math.min((diasDesdeBackup / DIAS_AVISO_BACKUP) * 100, 100)}
              error={errorExportacion ?? undefined}
              accion={{
                icono: 'subir',
                etiqueta: 'Hacer copia ahora',
                onClick: hacerCopiaCompleta,
                disabled: exportando || copiaEnCurso,
                cargando: exportando || copiaEnCurso,
                etiquetaCargando: 'Copiando a SharePoint…',
                enfasis: backupPendiente ? 'primario' : 'secundario',
              }}
            >
              {copiaFallida
                ? 'La última copia falló · revisa el flujo de Power Automate'
                : diasDesdeBackup === null
                  ? 'Aún sin copia en SharePoint · se hace sola cada semana'
                  : diasDesdeBackup === 0
                    ? 'Última: hoy · en SharePoint, cada semana'
                    : `Última: hace ${diasDesdeBackup} día${diasDesdeBackup === 1 ? '' : 's'} · en SharePoint, cada semana${
                        backupPendiente ? ' · algo falla' : ''
                      }`}
            </TarjetaAccion>
          </div>
        )}

        {esDireccionComercial && (
          <SeccionLista titulo="Gestión">
            {/* Primero lo que puede estar esperando una respuesta (llevan
                badge / tono aviso cuando hay algo); luego los catálogos. */}
            {!!numPeticionesAcceso && (
              <FilaNavegable
                icono="solicitudes"
                titulo="Peticiones de acceso"
                subtitulo="Comerciales que han perdido su contraseña"
                badge={numPeticionesAcceso}
                tono="aviso"
                to="/comerciales"
              />
            )}
            <FilaNavegable
              icono="solicitudes"
              titulo="Solicitudes de ayuda"
              subtitulo="Comerciales que piden que alguien les cubra una visita"
              badge={numSolicitudesPendientes || undefined}
              tono={numSolicitudesPendientes ? 'aviso' : 'neutral'}
              to="/solicitudes-reasignacion"
            />
            {!!numGruposDuplicados && (
              <FilaNavegable
                icono="duplicados"
                titulo="Clientes duplicados"
                subtitulo={
                  numGruposDuplicados === 1
                    ? 'Un grupo de fichas del mismo cliente — revisar y juntar'
                    : `${numGruposDuplicados} grupos de fichas del mismo cliente — revisar y juntar`
                }
                badge={numGruposDuplicados}
                tono="aviso"
                to="/deduplicacion"
              />
            )}
            {!!estadoArchivado &&
              Number(estadoArchivado.sin_copiar) + Number(estadoArchivado.agotadas) + Number(estadoArchivado.posibles_duplicados) > 0 && (
                <FilaNavegable
                  icono="almacenamiento"
                  titulo="Copia a SharePoint"
                  subtitulo={[
                    Number(estadoArchivado.agotadas) > 0 &&
                      `${estadoArchivado.agotadas} sin copiar tras 5 intentos — revisar el flujo de Power Automate y tocar aquí para reintentar`,
                    Number(estadoArchivado.sin_copiar) > 0 && `${estadoArchivado.sin_copiar} esperando copia desde hace horas`,
                    Number(estadoArchivado.posibles_duplicados) > 0 &&
                      `${estadoArchivado.posibles_duplicados} con posible duplicado «(reintento …)» en SharePoint`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  badge={
                    Number(estadoArchivado.sin_copiar) + Number(estadoArchivado.agotadas) + Number(estadoArchivado.posibles_duplicados)
                  }
                  tono="aviso"
                  chevron={false}
                  // Tocar la fila reintenta las copias agotadas (vuelven a la cola): se dice en el subtítulo.
                  onClick={() => void reintentarArchivado()}
                />
              )}
            <FilaNavegable
              icono="clientes"
              titulo="Equipo"
              subtitulo="Dar de alta, editar o dar de baja comerciales"
              to="/comerciales"
            />
            <FilaNavegable
              icono="vocabulario"
              titulo="Categorías"
              subtitulo="Revisar propuestas y organizar el catálogo"
              to="/vocabulario"
            />
            <FilaNavegable
              icono="vocabulario"
              titulo="Sectores"
              subtitulo="La lista de sectores que se elige en la ficha de cliente"
              to="/sectores"
            />
            <FilaNavegable
              icono="briefing"
              titulo="Briefings"
              subtitulo={
                topeBriefing?.alcanzado
                  ? `Tope diario alcanzado (${topeBriefing.enviados_hoy}/${topeBriefing.tope}): el resto espera a mañana`
                  : 'Consumo del agente de Copilot y controles'
              }
              tono={topeBriefing?.alcanzado ? 'aviso' : 'neutral'}
              to="/briefings"
            />
          </SeccionLista>
        )}

        <SeccionLista>
          <FilaNavegable
            icono="ayuda"
            titulo="Cómo funciona PrimeNotes"
            subtitulo="Manual de la app, pantalla por pantalla"
            to="/ayuda"
          />
          <FilaNavegable
            icono="atencion"
            titulo="Reportar un problema"
            subtitulo="Algo va mal o no se entiende — se lo cuentas a Dirección"
            onClick={() => setReportando(true)}
          />
        </SeccionLista>

        <SeccionLista>
          <FilaNavegable
            icono="salir"
            titulo={cerrando ? 'Cerrando sesión…' : 'Cerrar sesión'}
            tono="riesgo"
            disabled={cerrando}
            onClick={cerrarSesion}
          />
        </SeccionLista>
        {error && (
          <div className="field-error-text" style={{ paddingInline: 'var(--fila-pad-x)' }}>
            {error}
          </div>
        )}

        <div
          style={{
            paddingInline: 'var(--fila-pad-x)',
            marginTop: 'var(--space-4)',
            fontSize: 'var(--text-xs)',
            color: 'var(--ink-400)',
          }}
        >
          PrimeNotes · v{__APP_VERSION__} · {__BUILD_DATE__}
        </div>
      </div>

      {reportando && comercial && (
        <ReportarProblemaHoja
          comercialId={comercial.id}
          rol={comercial.rol}
          onCerrar={() => {
            setReportando(false);
            if (esDireccionComercial) {
              queryClient.invalidateQueries({ queryKey: ['reportes-problema-pendientes'] });
            }
          }}
        />
      )}
    </div>
  );
}
