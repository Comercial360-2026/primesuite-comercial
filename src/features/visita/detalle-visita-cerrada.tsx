import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { EstadoError } from '@/components/ui/estado-error';
import { useDescargarInforme, BotonDescargarInforme } from '@/hooks/use-descargar-informe';
import { useBorrarVisita } from '@/hooks/use-borrar-visita';
import { ConfirmarBorradoVisita } from '@/features/visita/confirmar-borrado-visita';

// Pantalla de solo lectura para repasar una visita ya cerrada — hasta hoy
// no existía ninguna: /visita/:id siempre abría VisitaActiva (pensada para
// captura en curso), así que no había forma de volver a ver fotos, audios,
// notas, hallazgos u oportunidad de una visita pasada sin "reabrirla".

interface DetalleVisita {
  fecha: string;
  tipo_visita: string | null;
  objetivo: string | null;
  estado_captura: string;
  resumen_texto: string | null;
  cliente_nombre: string;
  fotos: Array<{ id: string; titulo: string | null; url: string | null; ubicacion_nombre: string | null }>;
  audios: Array<{ id: string; titulo: string | null; url: string | null }>;
  notas: Array<{ id: string; titulo: string | null; contenido_texto: string | null }>;
  hallazgos: Array<{ id: string; naturaleza: string; nota: string | null; termino_nombre: string }>;
  oportunidades: Array<{ id: string; titulo: string; etapa: string }>;
  proximosPasos: Array<{ id: string; descripcion: string; fecha_objetivo: string | null; estado: string }>;
}

const URL_FIRMADA_SEGUNDOS = 60 * 10; // 10 min, de sobra para repasar la pantalla.

export function DetalleVisitaCerrada() {
  const { visitaId } = useParams<{ visitaId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Descargar el informe en PDF de la visita, desde el sitio donde alguien
  // iría a buscarlo. Misma lógica y mismo botón que en Hoy, la ficha de
  // cliente y Mi espacio — centralizados en use-descargar-informe.tsx para
  // que una corrección llegue a los cuatro sitios a la vez.
  const { estadoDe, descargar } = useDescargarInforme();
  // Borrar la visita se hace desde aquí (no desde cada fila del historial):
  // al borrarla, se vuelve atrás porque ya no existe.
  const borrar = useBorrarVisita({ onBorrada: () => navigate(-1) });

  const queryKey = ['detalle-visita-cerrada', visitaId];
  const { data, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey,
    enabled: !!visitaId,
    queryFn: async (): Promise<DetalleVisita> => {
      const [{ data: visita, error: errorVisita }, { data: capturas, error: errorCapturas }, { data: hallazgos, error: errorHallazgos }, { data: oportunidades, error: errorOportunidades }, { data: proximosPasos, error: errorProximosPasos }] =
        await Promise.all([
          supabase
            .from('visita')
            .select('fecha, tipo_visita, objetivo, estado_captura, resumen_texto, cliente:cliente_id(nombre)')
            .eq('id', visitaId!)
            .single(),
          supabase
            .from('captura_libre')
            .select('id, tipo, titulo, contenido_texto, storage_path, ubicacion:ubicacion_id(nombre)')
            .eq('visita_id', visitaId!)
            .order('creado_en', { ascending: true }),
          supabase
            .from('hallazgo')
            .select('id, nota, naturaleza, termino:termino_id(nombre)')
            .eq('visita_id', visitaId!)
            .order('creado_en', { ascending: true }),
          supabase
            .from('oportunidad')
            .select('id, titulo, etapa')
            .eq('visita_origen_id', visitaId!),
          supabase
            .from('proximo_paso')
            .select('id, descripcion, fecha_objetivo, estado')
            .eq('visita_id', visitaId!)
            .order('fecha_objetivo', { ascending: true }),
        ]);

      if (errorVisita) throw errorVisita;
      if (errorCapturas) throw errorCapturas;
      if (errorHallazgos) throw errorHallazgos;
      if (errorOportunidades) throw errorOportunidades;
      if (errorProximosPasos) throw errorProximosPasos;

      const fotosBrutas = (capturas ?? []).filter((c) => c.tipo === 'foto');
      const audiosBrutos = (capturas ?? []).filter((c) => c.tipo === 'audio');
      const notas = (capturas ?? []).filter((c) => c.tipo === 'nota');

      const fotos = await Promise.all(
        fotosBrutas.map(async (f) => {
          const ubicacion_nombre = (f.ubicacion as unknown as { nombre: string } | null)?.nombre ?? null;
          if (!f.storage_path) return { id: f.id, titulo: f.titulo, url: null, ubicacion_nombre };
          const { data: firmada } = await supabase.storage
            .from('fotos-visita')
            .createSignedUrl(f.storage_path, URL_FIRMADA_SEGUNDOS);
          return { id: f.id, titulo: f.titulo, url: firmada?.signedUrl ?? null, ubicacion_nombre };
        })
      );
      const audios = await Promise.all(
        audiosBrutos.map(async (a) => {
          if (!a.storage_path) return { id: a.id, titulo: a.titulo, url: null };
          const { data: firmada } = await supabase.storage
            .from('audios-visita')
            .createSignedUrl(a.storage_path, URL_FIRMADA_SEGUNDOS);
          return { id: a.id, titulo: a.titulo, url: firmada?.signedUrl ?? null };
        })
      );

      return {
        fecha: visita!.fecha,
        tipo_visita: visita!.tipo_visita,
        objetivo: visita!.objetivo,
        estado_captura: visita!.estado_captura,
        resumen_texto: visita!.resumen_texto,
        cliente_nombre: (visita!.cliente as unknown as { nombre: string } | null)?.nombre ?? 'cliente',
        fotos,
        audios,
        notas: notas.map((n) => ({ id: n.id, titulo: n.titulo, contenido_texto: n.contenido_texto })),
        hallazgos: (hallazgos ?? []).map((h) => ({
          id: h.id,
          naturaleza: h.naturaleza,
          nota: h.nota,
          termino_nombre: (h.termino as unknown as { nombre: string } | null)?.nombre ?? '',
        })),
        oportunidades: oportunidades ?? [],
        proximosPasos: proximosPasos ?? [],
      };
    },
  });

  // isPaused: mismo patrón corregido hoy en el resto de la app.
  const sinConexion = isPaused && data === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey });
    refetch();
  }

  const estadoLegible: Record<string, string> = { en_curso: 'en curso', consolidada: 'cerrada', agendada: 'planificada' };

  return (
    <div className="screen screen--split">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate(-1)} aria-label="volver" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 500 }}>{data?.cliente_nombre ?? 'visita'}</div>
          {data && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
              {new Date(data.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              {data.tipo_visita ? ` · ${data.tipo_visita}` : ''} · {estadoLegible[data.estado_captura] ?? data.estado_captura}
            </div>
          )}
        </div>
      </div>

      {isLoading && <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando…</p>}

      {sinConexion && (
        <EstadoError mensaje="Sin conexión. Comprueba tu red e inténtalo de nuevo." onReintentar={reintentar} />
      )}

      {isError && (
        <EstadoError mensaje="No se pudo cargar la visita." onReintentar={reintentar} />
      )}

      {data && (
        <div className="screen__scroll">
          {data.objetivo?.trim() && (
            <div className="card" style={{ background: 'var(--surface-1)' }}>
              <div className="label" style={{ marginTop: 0 }}>objetivo de la visita</div>
              <div style={{ fontSize: 'var(--text-base)' }}>{data.objetivo}</div>
            </div>
          )}

          {data.resumen_texto && (
            <div className="card">
              <div className="label" style={{ marginTop: 0 }}>resumen</div>
              <div style={{ fontSize: 'var(--text-base)' }}>{data.resumen_texto}</div>
            </div>
          )}

          {data.notas.length > 0 && (
            <>
              <div className="label">notas ({data.notas.length})</div>
              {data.notas.map((n) => (
                <div key={n.id} className="card">
                  {n.titulo && <div style={{ fontWeight: 500 }}>{n.titulo}</div>}
                  <div style={{ fontSize: 'var(--text-sm)' }}>{n.contenido_texto}</div>
                </div>
              ))}
            </>
          )}

          {data.fotos.length > 0 && (
            <>
              <div className="label">fotos ({data.fotos.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                {data.fotos.map((f) =>
                  f.url ? (
                    <div key={f.id}>
                      <img src={f.url} alt={f.titulo ?? 'foto'} style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                      {(f.titulo || f.ubicacion_nombre) && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                          {f.titulo}
                          {f.titulo && f.ubicacion_nombre && ' · '}
                          {f.ubicacion_nombre}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div key={f.id} style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                      {f.titulo ?? 'foto no disponible'}
                      {f.ubicacion_nombre && ` · ${f.ubicacion_nombre}`}
                    </div>
                  )
                )}
              </div>
            </>
          )}

          {data.audios.length > 0 && (
            <>
              <div className="label">audios ({data.audios.length})</div>
              {data.audios.map((a) => (
                <div key={a.id} className="card">
                  {a.titulo && <div style={{ fontSize: 'var(--text-sm)', marginBottom: 6 }}>{a.titulo}</div>}
                  {a.url ? (
                    <audio controls src={a.url} style={{ width: '100%' }} />
                  ) : (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>audio no disponible</div>
                  )}
                </div>
              ))}
            </>
          )}

          {data.hallazgos.length > 0 && (
            <>
              <div className="label">hallazgos ({data.hallazgos.length})</div>
              {data.hallazgos.map((h) => (
                <div
                  key={h.id}
                  className="card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/hallazgos/${h.id}`)}
                >
                  <span className={`chip${h.naturaleza === 'riesgo' ? ' chip--riesgo' : h.naturaleza === 'oportunidad' ? ' chip--oportunidad' : ''}`}>
                    {h.termino_nombre}
                  </span>
                  {h.nota && <div style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>{h.nota}</div>}
                </div>
              ))}
            </>
          )}

          {data.oportunidades.length > 0 && (
            <>
              <div className="label">oportunidades originadas ({data.oportunidades.length})</div>
              {data.oportunidades.map((o) => (
                <div
                  key={o.id}
                  className="card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/oportunidades/${o.id}`)}
                >
                  {o.titulo} — {o.etapa}
                </div>
              ))}
            </>
          )}

          {data.proximosPasos.length > 0 && (
            <>
              <div className="label">próximos pasos ({data.proximosPasos.length})</div>
              {data.proximosPasos.map((p) => (
                <div key={p.id} className="card">
                  {p.descripcion}
                  {p.fecha_objetivo && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                      {' '}· {new Date(p.fecha_objetivo).toLocaleDateString('es-ES')}
                    </span>
                  )}
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}> [{p.estado}]</span>
                </div>
              ))}
            </>
          )}

          {!data.resumen_texto &&
            !data.notas.length &&
            !data.fotos.length &&
            !data.audios.length &&
            !data.hallazgos.length &&
            !data.oportunidades.length &&
            !data.proximosPasos.length && (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
                Esta visita no tiene ninguna captura registrada.
              </div>
            )}
        </div>
      )}

      {data && visitaId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {borrar.visitaBorrarId === visitaId ? (
            <ConfirmarBorradoVisita ctrl={borrar} />
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <BotonDescargarInforme estado={estadoDe(visitaId)} onDescargar={() => descargar(visitaId)} />
              <button
                className="btn btn-secondary"
                style={{ width: 'auto', padding: '0 16px', color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
                onClick={() => void borrar.pedir(visitaId)}
              >
                Borrar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
