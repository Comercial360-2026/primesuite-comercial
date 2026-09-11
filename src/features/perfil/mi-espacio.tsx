import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { desde } from '@/lib/volver-a';
import { useEspacioEquipo } from '@/hooks/use-espacio-equipo';
import { useAvisoLiberar } from '@/hooks/use-aviso-liberar';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { formatearMB, type NivelEspacio } from '@/lib/espacio';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { FilaAccion } from '@/components/ui/fila-accion';
import { FilaDato } from '@/components/ui/fila-dato';
import { EstadoLista } from '@/components/ui/estado-lista';
import { BarraSeleccion } from '@/components/ui/barra-seleccion';
import { Aviso } from '@/components/ui/aviso';
import { Segmentado } from '@/components/ui/segmentado';
import { Avatar } from '@/components/ui/avatar';
import { GraficoBarras } from '@/components/ui/grafico-barras';

type VisitaEspacio = {
  visita_id: string;
  cliente_nombre: string;
  creado_en: string;
  bytes: number;
};

interface PrevisualizacionBorrado {
  rutas_storage: string[] | null;
}

interface ConsumoComercial {
  comercial_id: string;
  nombre: string;
  bytes: number;
}

// Cuántas "más antiguas" se resumen en la pista de liberar espacio, y a
// partir de qué fracción del pozo del equipo esa pista aporta algo (por
// debajo, borrarlas no libera nada útil → es ruido).
const N_ANTIGUAS = 5;
const PISTA_ANTIGUAS_MIN_FRAC = 0.05;

// El nivel de espacio del equipo se traduce a un solo aviso. `aviso_mio`
// (tu parte orientativa alta, pero el pozo del equipo con sitio) no sale
// aquí: en esta pantalla manda el equipo.
function avisoDeNivel(nivel: NivelEspacio | undefined): { tipo: 'atencion' | 'error'; texto: string } | null {
  if (nivel === 'bloqueo')
    return { tipo: 'error', texto: 'El espacio del equipo está lleno. No se pueden subir fotos ni audios hasta que se libere.' };
  if (nivel === 'critico_equipo')
    return { tipo: 'error', texto: 'El espacio del equipo está casi lleno. Libera visitas antiguas cuanto antes.' };
  if (nivel === 'aviso_equipo')
    return { tipo: 'atencion', texto: 'El espacio del equipo va alto. Ayuda a liberar borrando visitas antiguas.' };
  return null;
}

function colorBarra(nivel: NivelEspacio | undefined): string {
  if (nivel === 'bloqueo' || nivel === 'critico_equipo') return 'var(--risk-600)';
  if (nivel === 'aviso_equipo') return 'var(--warning-600)';
  return 'var(--success-600)';
}

// "Mi espacio" y "Consumo por comercial" eran dos pantallas del mismo tema
// (espacio en disco), solo cambiaba el alcance yo/equipo, y ambas repetían
// el medidor "Espacio del equipo". Ahora son una sola pantalla: el medidor
// del equipo, único, arriba; y un segmentado (solo Dirección) para pasar de
// "mis visitas" a "por comercial". Un comercial normal ve directamente sus
// visitas, sin segmentado.
type Vista = 'mias' | 'equipo';

export function MiEspacio() {
  const { comercial } = useSesionActual();
  const esDireccion = comercial?.rol === 'direccion_comercial';

  const [searchParams, setSearchParams] = useSearchParams();
  const [vista, setVista] = useState<Vista>(
    esDireccion && searchParams.get('vista') === 'equipo' ? 'equipo' : 'mias'
  );
  // Si el rol se resuelve después de montar (arranque en frío) y venías con
  // ?vista=equipo, respétalo en cuanto sepamos que es Dirección.
  useEffect(() => {
    if (esDireccion && searchParams.get('vista') === 'equipo') setVista('equipo');
    else if (!esDireccion) setVista('mias');
  }, [esDireccion, searchParams]);

  function cambiarVista(v: Vista) {
    setVista(v);
    setSearchParams(v === 'equipo' ? { vista: 'equipo' } : {}, { replace: true });
  }

  const { estado } = useEspacioEquipo();
  const vistaEquipo = esDireccion && vista === 'equipo';
  const aviso = avisoDeNivel(estado?.nivel);

  return (
    <div className="screen">
      {vistaEquipo ? (
        <CabeceraDetalle titulo="Consumo por comercial" volverA="/yo" ayuda="consumo-comerciales" />
      ) : (
        <CabeceraDetalle titulo="Mi espacio" volverA="/yo" ayuda="mi-espacio" />
      )}

      <div className="lista-agrupada">
        {esDireccion && (
          <div style={{ paddingInline: 'var(--fila-pad-x)' }}>
            <Segmentado
              opciones={
                [
                  { valor: 'mias', etiqueta: 'Mis visitas' },
                  { valor: 'equipo', etiqueta: 'Por comercial' },
                ] as const
              }
              valor={vista}
              onCambio={cambiarVista}
            />
          </div>
        )}

        {/* Medidor: el espacio del EQUIPO, que es lo que manda — común a las
            dos vistas. En positivo cuando hay holgura; el Aviso avisa cuando
            aprieta. */}
        <div className="medidor">
          <div className="medidor__lb">Espacio del equipo</div>
          <div className="medidor__barra">
            <div
              className="medidor__relleno"
              style={{
                width: `${Math.min(estado?.pctEquipo ?? 0, 100)}%`,
                background: colorBarra(estado?.nivel),
              }}
            />
          </div>
          <div className="medidor__cifra">
            {estado
              ? `${Math.round(estado.pctEquipo)}% · quedan ${formatearMB(
                  Math.max(estado.presupuesto - estado.usadoTotal, 0)
                )} MB de ${formatearMB(estado.presupuesto)} MB`
              : 'Calculando…'}
          </div>
        </div>

        {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

        {vistaEquipo ? <PorComercial /> : <MisVisitas />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Vista "Mis visitas": tus visitas y lo que ocupan, ordenar y borrar en lote.
// ─────────────────────────────────────────────────────────────────────────
function MisVisitas() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Modo seleccionar → borrar varias visitas de una pasada. El borrado en
  // lote es N× la operación individual (previsualizar → Storage → RPC) en
  // bucle: no hay RPC de lote y cada visita arrastra ficheros de Storage.
  const [seleccionando, setSeleccionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [confirmandoLote, setConfirmandoLote] = useState(false);
  const [progresoLote, setProgresoLote] = useState<{ hecho: number; total: number } | null>(null);
  const [resultadoLote, setResultadoLote] = useState<string | null>(null);
  const corriendoLote = progresoLote !== null;

  function alternarMarca(id: string) {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function entrarSeleccion() {
    setResultadoLote(null);
    setConfirmandoLote(false);
    setMarcadas(new Set());
    setSeleccionando(true);
  }

  function salirSeleccion() {
    if (corriendoLote) return;
    setSeleccionando(false);
    setConfirmandoLote(false);
    setMarcadas(new Set());
    setResultadoLote(null);
  }

  async function borrarLote() {
    if (corriendoLote) return;
    const ids = (visitas ?? []).map((v) => v.visita_id).filter((id) => marcadas.has(id));
    if (!ids.length) return;
    if (!navigator.onLine) {
      setResultadoLote('Necesitas conexión para borrar visitas.');
      return;
    }
    setConfirmandoLote(false);
    setResultadoLote(null);
    setProgresoLote({ hecho: 0, total: ids.length });
    const fallos: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        const { data, error } = await supabase
          .rpc('previsualizar_borrado_visita', { p_visita_id: id })
          .single();
        if (error) throw new Error(error.message);
        const rutas = (data as PrevisualizacionBorrado).rutas_storage ?? [];
        // Mismo orden obligatorio que el borrado individual: Storage antes
        // que el RPC (que borra la fila de participante de la cascada).
        if (rutas.length) {
          await Promise.all([
            supabase.storage.from('fotos-visita').remove(rutas),
            supabase.storage.from('audios-visita').remove(rutas),
          ]);
        }
        const { error: errDel } = await supabase.rpc('eliminar_visita_completa', { p_visita_id: id });
        if (errDel) throw new Error(errDel.message);
      } catch {
        fallos.push(id);
      }
      setProgresoLote({ hecho: i + 1, total: ids.length });
    }
    queryClient.invalidateQueries({ queryKey: espacioQueryKey });
    queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
    setProgresoLote(null);
    if (fallos.length === 0) {
      setSeleccionando(false);
      setMarcadas(new Set());
    } else {
      setMarcadas(new Set(fallos));
      setResultadoLote(`Se borraron ${ids.length - fallos.length}. ${fallos.length} no se pudieron borrar.`);
    }
  }

  const espacioQueryKey = ['mis-visitas-espacio'];
  const { data: visitas, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey: espacioQueryKey,
    refetchOnMount: 'always',
    queryFn: async (): Promise<VisitaEspacio[]> => {
      const { data, error } = await supabase.rpc('fn_mis_visitas_espacio');
      if (error) throw error;
      return (data ?? []) as VisitaEspacio[];
    },
  });
  const sinConexion = isPaused && visitas === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey: espacioQueryKey });
    refetch();
  }

  const { estado } = useEspacioEquipo();

  // Si Dirección Comercial pidió que liberes espacio, al abrir esta pantalla
  // el aviso se da por atendido. Se guarda quién lo pidió para dejar una
  // línea visible mientras estás aquí.
  const { aviso: avisoLiberar, marcarAtendido } = useAvisoLiberar();
  const [pidioLiberar, setPidioLiberar] = useState<string | null>(null);
  const [orden, setOrden] = useState<'antiguas' | 'tamano'>('antiguas');
  useEffect(() => {
    if (avisoLiberar) {
      setPidioLiberar(avisoLiberar.pedidoPorNombre);
      marcarAtendido();
    }
  }, [avisoLiberar, marcarAtendido]);

  const visitasOrdenadas = [...(visitas ?? [])].sort((a, b) =>
    orden === 'tamano' ? b.bytes - a.bytes : a.creado_en.localeCompare(b.creado_en)
  );
  const masAntiguas = [...(visitas ?? [])]
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en))
    .slice(0, N_ANTIGUAS);
  const bytesMasAntiguas = masAntiguas.reduce((s, v) => s + v.bytes, 0);
  const pistaAntiguasVale =
    masAntiguas.length >= 2 &&
    !!estado &&
    estado.presupuesto > 0 &&
    bytesMasAntiguas >= estado.presupuesto * PISTA_ANTIGUAS_MIN_FRAC;

  const bytesMarcadas = (visitas ?? [])
    .filter((v) => marcadas.has(v.visita_id))
    .reduce((s, v) => s + v.bytes, 0);

  return (
    <>
      {pidioLiberar && (
        <Aviso tipo="atencion" titulo={`${pidioLiberar} te ha pedido liberar espacio`}>
          Abre y descarga las visitas que quieras conservar, y borra las que ya no necesites.
        </Aviso>
      )}

      {isLoading && <EstadoLista estado="cargando" mensaje="Cargando tus visitas…" />}
      {sinConexion && <EstadoLista estado="sin-conexion" onReintentar={reintentar} />}
      {isError && (
        <EstadoLista
          estado="error"
          mensaje="No se pudo cargar tu espacio. Comprueba tu conexión e inténtalo de nuevo."
          onReintentar={reintentar}
        />
      )}
      {!isLoading && !isError && !sinConexion && visitas?.length === 0 && (
        <EstadoLista estado="vacio" mensaje="Todavía no tienes visitas." />
      )}

      {pistaAntiguasVale && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>
          Las {masAntiguas.length} más antiguas ocupan {formatearMB(bytesMasAntiguas)} MB
        </div>
      )}

      {!!visitas?.length && !seleccionando && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingInline: 'var(--fila-pad-x)' }}>
          <Segmentado
            opciones={
              [
                { valor: 'antiguas', etiqueta: 'Más antiguas primero' },
                { valor: 'tamano', etiqueta: 'Las que más ocupan' },
              ] as const
            }
            valor={orden}
            onCambio={setOrden}
          />
          <button type="button" className="chip" style={{ marginLeft: 'auto' }} onClick={entrarSeleccion}>
            Seleccionar
          </button>
        </div>
      )}

      {seleccionando && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingInline: 'var(--fila-pad-x)' }}>
          <BarraSeleccion
            n={marcadas.size}
            onCancelar={salirSeleccion}
            acciones={[
              {
                etiqueta: corriendoLote
                  ? `Borrando ${progresoLote!.hecho} de ${progresoLote!.total}…`
                  : `Borrar (${marcadas.size})`,
                icono: 'borrar',
                tono: 'riesgo',
                onClick: () => setConfirmandoLote(true),
                disabled: corriendoLote || marcadas.size === 0,
              },
            ]}
          />
          {confirmandoLote && (
            <div className="fila-confirmacion" style={{ border: '1px solid var(--ink-100)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
                Vas a borrar {marcadas.size} visita{marcadas.size === 1 ? '' : 's'} y todo su contenido (fotos,
                audios, notas, hallazgos, oportunidades). Libera {formatearMB(bytesMarcadas)} MB. No se puede
                deshacer.
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
                Si quieres conservar alguna, cancela, ábrela y descárgala antes de borrar.
              </div>
              <div className="fila-btns" style={{ marginTop: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmandoLote(false)}>
                  Cancelar
                </button>
                <button className="btn btn-peligro" style={{ flex: 1 }} onClick={borrarLote}>
                  Sí, borrar {marcadas.size}
                </button>
              </div>
            </div>
          )}
          {resultadoLote && <div className="field-error-text">{resultadoLote}</div>}
        </div>
      )}

      {!!visitas?.length && (
        <SeccionLista titulo={visitas.length === 1 ? '1 visita' : `${visitas.length} visitas`}>
          {visitasOrdenadas.map((v) =>
            seleccionando ? (
              <FilaAccion
                key={v.visita_id}
                densidad="compacta"
                titulo={v.cliente_nombre}
                subtitulo={`${fechaCorta(v.creado_en)} · ${formatearMB(v.bytes)} MB`}
                seleccion={{
                  activa: true,
                  marcada: marcadas.has(v.visita_id),
                  onToggle: () => alternarMarca(v.visita_id),
                }}
              />
            ) : (
              <FilaNavegable
                key={v.visita_id}
                densidad="compacta"
                titulo={v.cliente_nombre}
                subtitulo={fechaCorta(v.creado_en)}
                valor={<span style={{ color: 'var(--ink-900)', fontWeight: 500 }}>{formatearMB(v.bytes)} MB</span>}
                onClick={() => navigate(`/visita/${v.visita_id}/detalle`, { state: desde(location) })}
                chevron
              />
            )
          )}
        </SeccionLista>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Vista "Por comercial" (solo Dirección): cuánto ocupa cada uno del pozo
// común, y "pedir que liberen" en lote.
// ─────────────────────────────────────────────────────────────────────────
function PorComercial() {
  const queryClient = useQueryClient();

  const queryKeyConsumo = ['espacio-por-comercial'];
  const { data: consumo, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey: queryKeyConsumo,
    queryFn: async (): Promise<ConsumoComercial[]> => {
      const { data, error } = await supabase.rpc('fn_espacio_por_comercial');
      if (error) throw error;
      return (data ?? []) as ConsumoComercial[];
    },
  });

  const { data: cuotaBytes } = useQuery({
    queryKey: ['cuota-comercial-bytes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_cuota_comercial_bytes');
      if (error) throw error;
      return data as number;
    },
  });

  const { comercial } = useSesionActual();

  // Último aviso "libera espacio" de cada comercial (pendiente o atendido),
  // para no repetir la petición nada más atenderla.
  const { data: avisos } = useQuery({
    queryKey: ['avisos-liberar-pendientes'],
    queryFn: async (): Promise<Record<string, { creado_en: string; atendido_en: string | null }>> => {
      const { data, error } = await supabase
        .from('aviso_liberar_espacio')
        .select('comercial_id, creado_en, atendido_en')
        .order('creado_en', { ascending: false });
      if (error) throw error;
      const m: Record<string, { creado_en: string; atendido_en: string | null }> = {};
      for (const a of data ?? []) {
        if (!m[a.comercial_id]) m[a.comercial_id] = { creado_en: a.creado_en, atendido_en: a.atendido_en };
      }
      return m;
    },
  });

  // Modo seleccionar → pedir a varios de una pasada. No hay RPC de lote: es
  // N× el mismo insert en bucle, con progreso.
  const [seleccionando, setSeleccionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<{ tipo: 'exito' | 'atencion'; texto: string } | null>(null);
  const corriendo = progreso !== null;

  function alternarMarca(id: string) {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function entrarSeleccion() {
    setResultado(null);
    setSeleccionando(true);
  }

  function salirSeleccion() {
    if (corriendo) return;
    setSeleccionando(false);
    setMarcadas(new Set());
    setConfirmando(false);
  }

  // ¿Se le puede pedir a este comercial? A ti no; a quien ya está avisado y
  // aún no lo ha mirado, tampoco (sería repetir). Si ya lo miró, sí se
  // puede volver a pedir.
  function elegible(c: ConsumoComercial): boolean {
    if (c.comercial_id === comercial?.id) return false;
    const u = avisos?.[c.comercial_id];
    return !(u && !u.atendido_en);
  }

  async function enviarLote() {
    if (!comercial) return;
    const ids = [...marcadas];
    setConfirmando(false);
    setProgreso({ hecho: 0, total: ids.length });
    let ok = 0;
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase
        .from('aviso_liberar_espacio')
        .insert({ comercial_id: ids[i], pedido_por: comercial.id });
      if (!error) ok++;
      setProgreso({ hecho: i + 1, total: ids.length });
    }
    setProgreso(null);
    setSeleccionando(false);
    setMarcadas(new Set());
    setResultado(
      ok === ids.length
        ? {
            tipo: 'exito',
            texto: `Se ha pedido a ${ok} compañero${ok === 1 ? '' : 's'} que liberen espacio.`,
          }
        : { tipo: 'atencion', texto: `Se envió a ${ok} de ${ids.length}. Inténtalo otra vez con el resto.` }
    );
    queryClient.invalidateQueries({ queryKey: ['avisos-liberar-pendientes'] });
  }

  // isPaused: mismo patrón ya corregido en el resto de la app.
  const sinConexion = isPaused && consumo === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey: queryKeyConsumo });
    refetch();
  }

  const hayElegibles = (consumo ?? []).some(elegible);
  const nombresMarcados = (consumo ?? [])
    .filter((c) => marcadas.has(c.comercial_id))
    .map((c) => c.nombre)
    .join(', ');

  return (
    <>
      {resultado && !seleccionando && <Aviso tipo={resultado.tipo}>{resultado.texto}</Aviso>}

      {isLoading ? (
        <EstadoLista estado="cargando" />
      ) : sinConexion ? (
        <EstadoLista estado="sin-conexion" onReintentar={reintentar} />
      ) : isError ? (
        <EstadoLista estado="error" mensaje="No se pudo cargar el consumo por comercial." onReintentar={reintentar} />
      ) : consumo?.length === 0 ? (
        <EstadoLista estado="vacio" mensaje="No hay comerciales activos." />
      ) : (
        <>
          {!seleccionando && hayElegibles && (
            <div style={{ display: 'flex', paddingInline: 'var(--fila-pad-x)' }}>
              <button type="button" className="chip" style={{ marginLeft: 'auto' }} onClick={entrarSeleccion}>
                Seleccionar
              </button>
            </div>
          )}

          {seleccionando && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingInline: 'var(--fila-pad-x)' }}>
              <BarraSeleccion
                n={marcadas.size}
                onCancelar={salirSeleccion}
                acciones={[
                  {
                    etiqueta: corriendo
                      ? `Enviando ${progreso!.hecho} de ${progreso!.total}…`
                      : `Pedir que liberen (${marcadas.size})`,
                    icono: 'solicitudes',
                    onClick: () => setConfirmando(true),
                    disabled: corriendo || marcadas.size === 0,
                  },
                ]}
              />
              {confirmando && (
                <div
                  className="fila-confirmacion"
                  style={{ border: '1px solid var(--ink-100)', borderRadius: 'var(--radius-control)' }}
                >
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-900)' }}>
                    Se enviará un aviso a {marcadas.size} compañero{marcadas.size === 1 ? '' : 's'} ({nombresMarcados})
                    para que liberen espacio.
                  </div>
                  <div className="fila-btns" style={{ marginTop: 10 }}>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmando(false)}>
                      Cancelar
                    </button>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={enviarLote}>
                      Sí, avisar a {marcadas.size}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!seleccionando && (
            <GraficoBarras
              items={[...(consumo ?? [])]
                .sort((a, b) => b.bytes - a.bytes)
                .map((c) => {
                  const pctBarra = cuotaBytes ? (c.bytes / cuotaBytes) * 100 : 0;
                  const colorBarraFila =
                    cuotaBytes && pctBarra >= 100
                      ? 'var(--risk-600)'
                      : cuotaBytes && pctBarra >= 85
                        ? 'var(--warning-600)'
                        : 'var(--brand-600)';
                  return {
                    id: c.comercial_id,
                    etiqueta: (
                      <>
                        <Avatar nombre={c.nombre} /> {c.nombre}
                      </>
                    ),
                    valor: c.bytes,
                    valorTexto: cuotaBytes
                      ? `${formatearMB(c.bytes)} MB · ${Math.round(pctBarra)}%`
                      : `${formatearMB(c.bytes)} MB`,
                    color: colorBarraFila,
                  };
                })}
            />
          )}

          <SeccionLista titulo="Por comercial">
            {consumo?.map((c) => {
              const pct = cuotaBytes ? (c.bytes / cuotaBytes) * 100 : 0;
              const mb = formatearMB(c.bytes);
              const esYo = c.comercial_id === comercial?.id;
              const ultimo = avisos?.[c.comercial_id];
              const pendienteSinMirar = !!ultimo && !ultimo.atendido_en;

              // Jerarquía: la cifra (MB · % de su parte) es EL dato de la
              // pantalla → valor a la derecha, en negro. La pista de estado
              // (por qué mirar esta fila, o si ya se le avisó) va debajo en
              // gris pequeño. El tono + su icono `atencion` marcan la fila
              // sin depender del color (usuario daltónico).
              let tono: 'neutral' | 'aviso' | 'riesgo' = 'neutral';
              let motivo: string | null = null;
              if (cuotaBytes && pct >= 100) {
                tono = 'riesgo';
                motivo = 'pasado de su parte';
              } else if (cuotaBytes && pct >= 85) {
                tono = 'aviso';
                motivo = 'cerca del límite';
              }
              const nota = esYo
                ? 'eres tú'
                : pendienteSinMirar
                  ? `avisado ${fechaCorta(ultimo!.creado_en)}, sin mirar`
                  : ultimo?.atendido_en
                    ? `lo miró ${fechaCorta(ultimo.atendido_en)}`
                    : motivo;

              const cifra = cuotaBytes ? `${mb} MB · ${Math.round(pct)}%` : `${mb} MB`;
              const puedo = elegible(c);

              const fila = seleccionando ? (
                <FilaAccion
                  key={c.comercial_id}
                  avatar={c.nombre}
                  titulo={c.nombre}
                  subtitulo={`${cuotaBytes ? `${cifra} de su parte` : cifra}${nota ? ` · ${nota}` : ''}`}
                  tono={tono}
                  seleccion={
                    puedo
                      ? {
                          activa: true,
                          marcada: marcadas.has(c.comercial_id),
                          onToggle: () => alternarMarca(c.comercial_id),
                        }
                      : undefined
                  }
                />
              ) : (
                <FilaDato
                  key={c.comercial_id}
                  etiqueta={c.nombre}
                  icono={tono === 'neutral' ? undefined : 'atencion'}
                  avatar={c.nombre}
                  tono={tono}
                  valor={
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span>{cifra}</span>
                      {nota && (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', fontWeight: 400 }}>
                          {nota}
                        </span>
                      )}
                    </span>
                  }
                />
              );

              return seleccionando && !puedo ? (
                <div key={c.comercial_id} style={{ opacity: 0.5 }}>
                  {fila}
                </div>
              ) : (
                fila
              );
            })}
          </SeccionLista>
        </>
      )}
    </>
  );
}
