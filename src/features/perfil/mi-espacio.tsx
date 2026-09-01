import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { useDescargarInforme } from '@/hooks/use-descargar-informe';
import { useEspacioEquipo } from '@/hooks/use-espacio-equipo';
import { useAvisoLiberar } from '@/hooks/use-aviso-liberar';
import type { NivelEspacio } from '@/lib/espacio';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaDato } from '@/components/ui/fila-dato';
import { FilaAccion, type AccionFila } from '@/components/ui/fila-accion';
import { EstadoLista } from '@/components/ui/estado-lista';
import { BarraSeleccion } from '@/components/ui/barra-seleccion';

// Cuota por comercial (Fase A del sistema de backup/borrado). Ya no es un
// número fijo — se calcula dinámicamente en fn_cuota_comercial_bytes()
// según cuántos comerciales activos hay (ver 60_cuota_dinamica_por_comercial.sql).

type VisitaEspacio = {
  visita_id: string;
  cliente_nombre: string;
  creado_en: string;
  bytes: number;
};

interface PrevisualizacionBorrado {
  num_fotos: number;
  num_audios: number;
  num_notas: number;
  num_hallazgos: number;
  num_oportunidades: number;
  num_proximos_pasos: number;
  rutas_storage: string[] | null;
}

// Cuántas "más antiguas" se resumen en la pista de liberar espacio.
const N_ANTIGUAS = 5;

function formatearMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

// Fecha corta ("31 ago") — en las filas compactas el año casi nunca aporta
// y ocupa sitio; la lista va ordenada, el contexto lo da el orden.
function formatearFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

// Un solo sitio traduce el nivel de espacio a tono de fila y a color del
// medidor. Mismos umbrales que el resto de la app: gris con holgura, ámbar
// en aviso (>=85%), rojo en crítico/bloqueo (>=95%).
function tonoDeNivel(nivel: NivelEspacio | undefined): 'neutral' | 'aviso' | 'riesgo' {
  if (nivel === 'critico_equipo' || nivel === 'bloqueo') return 'riesgo';
  if (nivel === 'aviso_mio' || nivel === 'aviso_equipo') return 'aviso';
  return 'neutral';
}

const COLOR_TONO: Record<'neutral' | 'aviso' | 'riesgo', string> = {
  neutral: 'var(--ink-400)',
  aviso: 'var(--warning-600)',
  riesgo: 'var(--risk-600)',
};

export function MiEspacio() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Descarga de copia de una visita: misma lógica centralizada que usan Hoy,
  // la ficha de cliente y el detalle de la visita (use-descargar-informe.tsx).
  const { estadoDe, descargar } = useDescargarInforme();
  const [visitaBorrarId, setVisitaBorrarId] = useState<string | null>(null);
  const [previsualizacion, setPrevisualizacion] = useState<PrevisualizacionBorrado | null>(null);
  const previsualizando = useAccionAsync();
  const borrandoVisita = useAccionAsync();

  // Modo seleccionar → borrar varias visitas de una pasada. El borrado en
  // lote es N× la operación individual (previsualizar → Storage → RPC) en
  // bucle: no hay RPC de lote y cada visita arrastra ficheros de Storage
  // fuera de SQL. Progreso "Borrando 3 de 7…" + parte de fallos parciales.
  const [seleccionando, setSeleccionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
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
    cancelarBorrado(); // cierra la confirmación individual si estaba abierta
    setResultadoLote(null);
    setMarcadas(new Set());
    setSeleccionando(true);
  }

  function salirSeleccion() {
    if (corriendoLote) return;
    setSeleccionando(false);
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
      // Las que fallaron se quedan marcadas para reintentar.
      setMarcadas(new Set(fallos));
      setResultadoLote(
        `Se borraron ${ids.length - fallos.length}. ${fallos.length} no se pudieron borrar.`
      );
    }
  }

  async function pedirBorrado(visitaId: string) {
    setVisitaBorrarId(visitaId);
    setPrevisualizacion(null);
    await previsualizando.ejecutar(async () => {
      const { data, error } = await supabase.rpc('previsualizar_borrado_visita', { p_visita_id: visitaId }).single();
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

  async function confirmarBorrado() {
    if (!visitaBorrarId) return;
    const rutas = previsualizacion?.rutas_storage ?? [];

    await borrandoVisita.ejecutar(
      async () => {
        // Orden obligatorio: primero los binarios de Storage, mientras el
        // comercial todavía es "participante" de la visita (la política de
        // borrado de Storage lo exige) — el RPC de abajo borra esa fila de
        // participante como parte de la cascada, así que si se hiciera al
        // revés, el borrado de ficheros quedaría sin permiso y fallaría.
        if (rutas.length) {
          await Promise.all([
            supabase.storage.from('fotos-visita').remove(rutas),
            supabase.storage.from('audios-visita').remove(rutas),
          ]);
        }
        const { error } = await supabase.rpc('eliminar_visita_completa', { p_visita_id: visitaBorrarId });
        if (error) throw new Error(error.message);
      },
      {
        onExito: () => {
          setVisitaBorrarId(null);
          setPrevisualizacion(null);
          queryClient.invalidateQueries({ queryKey: espacioQueryKey });
          // Misma "última visita" que se ve en la lista de Clientes puede
          // cambiar al borrar una visita — mismo hueco corregido en
          // ficha-cliente.tsx a la vez.
          queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
        },
      }
    );
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
  // isPaused: mismo hueco ya corregido en agenda-del-dia.tsx,
  // listado-clientes.tsx y repaso-cliente.tsx — TanStack Query pausa la
  // consulta en vez de marcarla como error cuando decide que la red no es
  // fiable, y sin este caso la pantalla se queda en blanco.
  const sinConexion = isPaused && visitas === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey: espacioQueryKey });
    refetch();
  }

  // Reparto blando: tu parte (cuota base) es orientativa; lo que manda es
  // el pozo del equipo. Ver src/lib/espacio.ts.
  const { estado } = useEspacioEquipo();

  // Si Dirección Comercial pidió que liberes espacio, al abrir esta
  // pantalla el aviso se da por atendido (has venido a mirarlo). Se guarda
  // quién lo pidió para dejar una línea visible mientras estás aquí.
  const { aviso: avisoLiberar, marcarAtendido } = useAvisoLiberar();
  const [pidioLiberar, setPidioLiberar] = useState<string | null>(null);
  // Para liberar espacio interesa ver primero lo viejo (o lo que más pesa).
  const [orden, setOrden] = useState<'antiguas' | 'tamano'>('antiguas');
  useEffect(() => {
    if (avisoLiberar) {
      setPidioLiberar(avisoLiberar.pedidoPorNombre);
      marcarAtendido();
    }
  }, [avisoLiberar, marcarAtendido]);

  const tono = tonoDeNivel(estado?.nivel);
  const colorAviso = COLOR_TONO[tono];

  const mensajeEspacio =
    estado?.nivel === 'aviso_mio'
      ? `Vas usando bastante espacio (${estado.pctMio.toFixed(0)}% de tu parte). Aún hay margen del equipo, pero archiva visitas antiguas cuando puedas.`
      : estado?.nivel === 'aviso_equipo'
        ? `El espacio del equipo va al ${estado.pctEquipo.toFixed(0)}%. Ayuda a liberar borrando visitas antiguas.`
        : estado?.nivel === 'critico_equipo'
          ? `El espacio del equipo está al ${estado.pctEquipo.toFixed(0)}%. Libera visitas antiguas cuanto antes.`
          : estado?.nivel === 'bloqueo'
            ? `Espacio del equipo lleno (${estado.pctEquipo.toFixed(0)}%). No se pueden subir fotos ni audios hasta que se libere.`
            : null;
  // Cuando vas sobrado, una línea tranquila en vez de nada.
  const textoEstado =
    mensajeEspacio ??
    (estado && estado.nivel === 'ok' && estado.pctMio < 70 ? 'Vas sobrado de espacio.' : null);

  const visitasOrdenadas = [...(visitas ?? [])].sort((a, b) =>
    orden === 'tamano' ? b.bytes - a.bytes : a.creado_en.localeCompare(b.creado_en)
  );
  // Pista de "qué liberar": las N más antiguas, siempre por fecha
  // independientemente del orden elegido para la lista.
  const masAntiguas = [...(visitas ?? [])]
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en))
    .slice(0, N_ANTIGUAS);
  const bytesMasAntiguas = masAntiguas.reduce((s, v) => s + v.bytes, 0);

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Mi espacio" volverA="/yo" />

      <div className="lista-agrupada">
        {pidioLiberar && (
          <div className="card card--riesgo" style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)' }}>
            {pidioLiberar} te ha pedido que liberes espacio. Descarga copia de las visitas antiguas que
            quieras conservar y bórralas.
          </div>
        )}

        {/* Medidor: barra fina de tu parte + una línea. El desglose numérico
            (tu parte, equipo) va abajo en filas de dato. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingInline: 'var(--fila-pad-x)' }}>
          <div style={{ height: 4, borderRadius: 'var(--radius-chip)', background: 'var(--ink-100)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(estado?.pctMio ?? 0, 100)}%`,
                background: colorAviso,
                borderRadius: 'var(--radius-chip)',
              }}
            />
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
            {estado ? `${formatearMB(estado.miUso)} de ${formatearMB(estado.cuotaBase)} MB usados` : 'Calculando…'}
          </div>
        </div>

        <SeccionLista titulo="Resumen">
          <FilaDato
            etiqueta="Tu parte"
            valor={estado ? `${estado.pctMio.toFixed(0)}%` : '…'}
            tono={tono}
          />
          <FilaDato
            etiqueta="Espacio del equipo"
            valor={estado ? `${estado.pctEquipo.toFixed(0)}%` : '…'}
            tono={tono}
          />
        </SeccionLista>

        {textoEstado && (
          <div style={{ fontSize: 'var(--text-xs)', color: colorAviso, paddingInline: 'var(--fila-pad-x)' }}>
            {textoEstado}
          </div>
        )}

        {isLoading && <div style={{ color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>Cargando…</div>}

        {sinConexion && <EstadoLista estado="sin-conexion" onReintentar={reintentar} />}

        {isError && (
          <EstadoLista
            estado="error"
            mensaje="No se pudo cargar tu espacio. Comprueba tu conexión e inténtalo de nuevo."
            onReintentar={reintentar}
          />
        )}

        {!isLoading && !isError && !sinConexion && visitas?.length === 0 && (
          <div style={{ color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>Todavía no tienes visitas.</div>
        )}

        {!!visitas?.length && masAntiguas.length >= 2 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>
            Las {masAntiguas.length} más antiguas ocupan {formatearMB(bytesMasAntiguas)} MB
          </div>
        )}

        {!!visitas?.length && !seleccionando && (
          <div style={{ display: 'flex', gap: 6, paddingInline: 'var(--fila-pad-x)' }}>
            <button
              type="button"
              className={`chip${orden === 'antiguas' ? ' chip--on' : ''}`}
              onClick={() => setOrden('antiguas')}
            >
              Más antiguas primero
            </button>
            <button
              type="button"
              className={`chip${orden === 'tamano' ? ' chip--on' : ''}`}
              onClick={() => setOrden('tamano')}
            >
              Las que más ocupan
            </button>
            <button
              type="button"
              className="chip"
              style={{ marginLeft: 'auto' }}
              onClick={entrarSeleccion}
            >
              Seleccionar
            </button>
          </div>
        )}

        {seleccionando && (
          <div style={{ paddingInline: 'var(--fila-pad-x)' }}>
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
                  onClick: borrarLote,
                  disabled: corriendoLote || marcadas.size === 0,
                },
              ]}
            />
          </div>
        )}

        {resultadoLote && (
          <div className="field-error-text" style={{ paddingInline: 'var(--fila-pad-x)' }}>{resultadoLote}</div>
        )}

        {!!visitas?.length && (
          <SeccionLista titulo={visitas.length === 1 ? '1 visita' : `${visitas.length} visitas`}>
            {visitasOrdenadas.map((v) => {
              const estadoDescarga = estadoDe(v.visita_id);
              const listo = typeof estadoDescarga === 'object' ? estadoDescarga : null;

              if (seleccionando) {
                return (
                  <FilaAccion
                    key={v.visita_id}
                    densidad="compacta"
                    titulo={v.cliente_nombre}
                    subtitulo={`${formatearFecha(v.creado_en)} · ${formatearMB(v.bytes)} MB`}
                    seleccion={{
                      activa: true,
                      marcada: marcadas.has(v.visita_id),
                      onToggle: () => alternarMarca(v.visita_id),
                    }}
                  />
                );
              }

              if (visitaBorrarId === v.visita_id) {
                return (
                  <div key={v.visita_id} className="fila-confirmacion">
                    {previsualizando.cargando || !previsualizacion ? (
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
                        Calculando qué se va a borrar…
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
                          {v.cliente_nombre} — esta visita arrastra: {previsualizacion.num_fotos} foto(s),{' '}
                          {previsualizacion.num_audios} audio(s), {previsualizacion.num_notas} nota(s),{' '}
                          {previsualizacion.num_hallazgos} hallazgo(s), {previsualizacion.num_oportunidades} oportunidad(es).
                          Todo eso se borra también, junto con {previsualizacion.num_proximos_pasos} próximo(s) paso(s)
                          vinculados. No se puede deshacer.
                        </div>
                        {!listo && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
                            ¿Quieres descargar una copia antes de borrar?
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <button className="btn btn-secondary" onClick={cancelarBorrado} disabled={borrandoVisita.cargando}>
                            Cancelar
                          </button>
                          {listo ? (
                            <a
                              href={listo.url}
                              className="btn btn-secondary"
                              style={{ display: 'inline-flex', alignItems: 'center' }}
                            >
                              Descargar de nuevo ({formatearMB(listo.tamanoBytes)} MB)
                            </a>
                          ) : (
                            <button
                              className="btn btn-secondary"
                              disabled={estadoDescarga === 'generando'}
                              onClick={() => descargar(v.visita_id)}
                            >
                              {estadoDescarga === 'generando' ? 'Generando copia…' : 'Descargar copia primero'}
                            </button>
                          )}
                          <button
                            className="btn btn-primary"
                            style={{ background: 'var(--risk-600)' }}
                            onClick={confirmarBorrado}
                            disabled={borrandoVisita.cargando}
                          >
                            {borrandoVisita.cargando ? 'Borrando…' : 'Confirmar borrado'}
                          </button>
                        </div>
                        {borrandoVisita.error && (
                          <div className="field-error-text" style={{ marginTop: 8 }}>{borrandoVisita.error}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              const accionDescargar: AccionFila = {
                icono: 'descargar',
                etiqueta: listo
                  ? `Descargar la copia otra vez (${formatearMB(listo.tamanoBytes)} MB)`
                  : estadoDescarga === 'generando'
                    ? 'Generando copia…'
                    : estadoDescarga === 'error'
                      ? 'Error al generar la copia, reintentar'
                      : 'Descargar copia',
                onClick: listo ? undefined : () => descargar(v.visita_id),
                href: listo ? listo.url : undefined,
                disabled: estadoDescarga === 'generando',
                tono: listo ? 'brand' : estadoDescarga === 'error' ? 'riesgo' : 'neutral',
              };

              // El botón de descarga es solo icono → sus 3 estados
              // (generando / listo / error) serían invisibles. Se reflejan
              // en el subtítulo de la fila para que se vean.
              const textoDescarga = listo
                ? `Copia descargada (${formatearMB(listo.tamanoBytes)} MB)`
                : estadoDescarga === 'generando'
                  ? 'Generando copia…'
                  : estadoDescarga === 'error'
                    ? 'Error al generar la copia, toca de nuevo'
                    : null;

              const accionBorrar: AccionFila = {
                icono: 'borrar',
                etiqueta: `Borrar visita de ${v.cliente_nombre}`,
                onClick: () => pedirBorrado(v.visita_id),
                tono: 'riesgo',
              };

              return (
                <FilaAccion
                  key={v.visita_id}
                  densidad="compacta"
                  titulo={v.cliente_nombre}
                  subtitulo={
                    `${formatearFecha(v.creado_en)} · ${formatearMB(v.bytes)} MB` +
                    (textoDescarga ? ` · ${textoDescarga}` : '')
                  }
                  onClick={() => navigate(`/visita/${v.visita_id}/detalle`)}
                  acciones={[accionDescargar, accionBorrar]}
                />
              );
            })}
          </SeccionLista>
        )}
      </div>
    </div>
  );
}
