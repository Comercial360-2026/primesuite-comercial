import { useEffect, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { useDescargarInforme } from '@/hooks/use-descargar-informe';
import { useEspacioEquipo } from '@/hooks/use-espacio-equipo';
import { useAvisoLiberar } from '@/hooks/use-aviso-liberar';
import { IconoDescargar, IconoBorrar } from '@/components/ui/iconos';

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

// Caja de un botón de acción de fila (⬇ / 🗑). Misma para <button> y <a>.
const cajaIcono: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  flexShrink: 0,
  boxSizing: 'border-box',
  border: '1px solid var(--ink-200)',
  borderRadius: 'var(--radius-field)',
  background: 'var(--surface-1)',
  color: 'var(--ink-700)',
  cursor: 'pointer',
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
  // Color de estado — mismos umbrales que el resto de la app: gris cuando
  // hay holgura, ámbar en aviso (>=85%), rojo en crítico/bloqueo (>=95%).
  // Todo por token: otra paleta = tokens.css, esta pantalla no se toca.
  const colorAviso =
    estado?.nivel === 'critico_equipo' || estado?.nivel === 'bloqueo'
      ? 'var(--risk-600)'
      : estado?.nivel === 'aviso_mio' || estado?.nivel === 'aviso_equipo'
        ? 'var(--warning-600)'
        : 'var(--ink-400)';
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate('/yo')} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', padding: 0 }}>
          ←
        </button>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>Mi espacio</h1>
      </div>

      {pidioLiberar && (
        <div
          className="card card--riesgo"
          style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)' }}
        >
          {pidioLiberar} te ha pedido que liberes espacio. Descarga copia de las visitas antiguas que
          quieras conservar y bórralas.
        </div>
      )}

      {/* Resumen: barra fina + una línea. Antes era una tarjeta con una
          etiqueta por métrica y ocupaba media pantalla. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 'var(--text-sm)' }}>
          <span style={{ color: 'var(--ink-700)' }}>Tu almacenamiento</span>
          <span style={{ color: colorAviso, fontWeight: 500 }}>{estado ? `${estado.pctMio.toFixed(0)}%` : '…'}</span>
        </div>
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
          {estado
            ? `${formatearMB(estado.miUso)} de ${formatearMB(estado.cuotaBase)} MB · equipo al ${estado.pctEquipo.toFixed(0)}%`
            : 'Calculando…'}
        </div>
        {textoEstado && (
          <div style={{ fontSize: 'var(--text-xs)', color: colorAviso, marginTop: 2 }}>{textoEstado}</div>
        )}
      </div>

      {isLoading && <div style={{ color: 'var(--ink-400)' }}>Cargando…</div>}

      {sinConexion && (
        <div className="card card--riesgo">
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
            Sin conexión. Comprueba tu red e inténtalo de nuevo.
          </div>
          <button className="btn btn-secondary" style={{ marginTop: 8, width: 'auto', padding: '0 16px' }} onClick={reintentar}>
            Reintentar
          </button>
        </div>
      )}

      {isError && (
        <div className="card card--riesgo">
          No se pudo cargar tu espacio. Comprueba tu conexión e inténtalo de nuevo.
        </div>
      )}

      {!isLoading && !isError && !sinConexion && visitas?.length === 0 && (
        <div style={{ color: 'var(--ink-400)' }}>Todavía no tienes visitas.</div>
      )}

      {!!visitas?.length && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
          {visitas.length} {visitas.length === 1 ? 'visita' : 'visitas'}
          {masAntiguas.length >= 2 &&
            ` · las ${masAntiguas.length} más antiguas ocupan ${formatearMB(bytesMasAntiguas)} MB`}
        </div>
      )}

      {!!visitas?.length && (
        <div style={{ display: 'flex', gap: 6 }}>
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
        </div>
      )}

      {visitasOrdenadas.map((v) => {
        const estadoDescarga = estadoDe(v.visita_id);
        const listo = typeof estadoDescarga === 'object' ? estadoDescarga : null;

        if (visitaBorrarId === v.visita_id) {
          return (
            <div key={v.visita_id} className="card card--riesgo">
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
                        Descargar zip ({formatearMB(listo.tamanoBytes)} MB)
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

        return (
          <div
            key={v.visita_id}
            className="card"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)' }}
          >
            <div
              style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
              onClick={() => navigate(`/visita/${v.visita_id}/detalle`)}
            >
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {v.cliente_nombre}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                {formatearFecha(v.creado_en)} · {formatearMB(v.bytes)} MB
              </div>
            </div>

            {listo ? (
              <a
                href={listo.url}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Descargar copia (${formatearMB(listo.tamanoBytes)} MB)`}
                title={`Descargar copia (${formatearMB(listo.tamanoBytes)} MB)`}
                style={{ ...cajaIcono, color: 'var(--brand-600)' }}
              >
                <IconoDescargar />
              </a>
            ) : (
              <button
                type="button"
                aria-label={
                  estadoDescarga === 'generando'
                    ? 'Generando copia…'
                    : estadoDescarga === 'error'
                      ? 'Error al generar la copia, reintentar'
                      : 'Descargar copia'
                }
                title={
                  estadoDescarga === 'generando'
                    ? 'Generando copia…'
                    : estadoDescarga === 'error'
                      ? 'Error, reintentar'
                      : 'Descargar copia'
                }
                disabled={estadoDescarga === 'generando'}
                onClick={(e) => {
                  e.stopPropagation();
                  descargar(v.visita_id);
                }}
                style={{
                  ...cajaIcono,
                  color: estadoDescarga === 'error' ? 'var(--danger-600)' : 'var(--ink-700)',
                  opacity: estadoDescarga === 'generando' ? 0.45 : 1,
                }}
              >
                <IconoDescargar />
              </button>
            )}

            <button
              type="button"
              aria-label={`Borrar visita de ${v.cliente_nombre}`}
              title="Borrar visita"
              onClick={(e) => {
                e.stopPropagation();
                pedirBorrado(v.visita_id);
              }}
              style={{ ...cajaIcono, color: 'var(--risk-600)' }}
            >
              <IconoBorrar />
            </button>
          </div>
        );
      })}
    </div>
  );
}
