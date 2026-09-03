import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import {
  NATURALEZA_ORDEN,
  NATURALEZA_LABEL,
  ETAPA_LABEL,
  PRIORIDAD_LABEL,
  PRIORIDAD_ORDEN,
  TIPO_VISITA_LABEL,
  etiqueta,
} from '@/lib/etiquetas-visita';
import { useDescargarInforme, formatearMB } from '@/hooks/use-descargar-informe';
import { useBorrarVisita } from '@/hooks/use-borrar-visita';
import { ConfirmarBorradoVisita } from '@/features/visita/confirmar-borrado-visita';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { FilaAccion } from '@/components/ui/fila-accion';
import { FilaDato } from '@/components/ui/fila-dato';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Icono } from '@/components/ui/iconos';
import { VisorFotos } from './visor-fotos';

// Repaso de solo lectura de una visita ya cerrada. Cuenta lo mismo que el
// informe.pdf y en el mismo orden: cabecera + KPI → resumen → objetivo →
// oportunidades → hallazgos → próximos pasos → anexo (notas · fotos ·
// audios) → informe.

interface Foto {
  id: string;
  titulo: string | null;
  url: string | null;
  ubicacion_nombre: string | null;
}
interface DetalleVisita {
  fecha: string;
  tipo_visita: string | null;
  objetivo: string | null;
  estado_captura: string;
  resumen_texto: string | null;
  cliente_nombre: string;
  fotos: Foto[];
  audios: Array<{ id: string; titulo: string | null; url: string | null }>;
  notas: Array<{ id: string; titulo: string | null; contenido_texto: string | null }>;
  hallazgos: Array<{ id: string; naturaleza: string; nota: string | null; termino_nombre: string }>;
  oportunidades: Array<{ id: string; titulo: string; etapa: string; prioridad: string; valor_estimado: number | null }>;
  proximosPasos: Array<{ id: string; descripcion: string; fecha_objetivo: string | null; estado: string }>;
}

const URL_FIRMADA_SEGUNDOS = 60 * 10;

function esVencido(p: { fecha_objetivo: string | null; estado: string }): boolean {
  if (!p.fecha_objetivo || p.estado !== 'pendiente') return false;
  const f = new Date(p.fecha_objetivo);
  f.setHours(0, 0, 0, 0);
  return f < new Date(new Date().toDateString());
}

export function DetalleVisitaCerrada() {
  const { visitaId } = useParams<{ visitaId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { estadoDe, descargar } = useDescargarInforme();
  const borrar = useBorrarVisita({ onBorrada: () => navigate(-1) });
  const [visorIndice, setVisorIndice] = useState<number | null>(null);

  const queryKey = ['detalle-visita-cerrada', visitaId];
  const { data, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey,
    enabled: !!visitaId,
    queryFn: async (): Promise<DetalleVisita> => {
      const [
        { data: visita, error: errorVisita },
        { data: capturas, error: errorCapturas },
        { data: hallazgos, error: errorHallazgos },
        { data: oportunidades, error: errorOportunidades },
        { data: proximosPasos, error: errorProximosPasos },
      ] = await Promise.all([
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
          .select('id, titulo, etapa, prioridad, valor_estimado')
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
        oportunidades: (oportunidades ?? []) as DetalleVisita['oportunidades'],
        proximosPasos: proximosPasos ?? [],
      };
    },
  });

  const sinConexion = isPaused && data === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey });
    refetch();
  }

  const estadoLegible: Record<string, string> = {
    en_curso: 'en curso',
    consolidada: 'cerrada',
    agendada: 'planificada',
  };

  // --- Derivados (solo con datos) ---
  const opsOrdenadas = data
    ? [...data.oportunidades].sort((a, b) => (PRIORIDAD_ORDEN[a.prioridad] ?? 9) - (PRIORIDAD_ORDEN[b.prioridad] ?? 9))
    : [];
  const totalEuros = data ? data.oportunidades.reduce((s, o) => s + (o.valor_estimado ?? 0), 0) : 0;
  const riesgosN = data ? data.hallazgos.filter((h) => h.naturaleza === 'riesgo').length : 0;
  const vencidosN = data ? data.proximosPasos.filter(esVencido).length : 0;

  const conocidas = new Set<string>(NATURALEZA_ORDEN);
  const gruposHallazgos: { naturaleza: string; items: DetalleVisita['hallazgos'] }[] = data
    ? [
        ...NATURALEZA_ORDEN.map((n) => ({
          naturaleza: n as string,
          items: data.hallazgos.filter((h) => h.naturaleza === n),
        })).filter((g) => g.items.length > 0),
        ...(() => {
          const otras = data.hallazgos.filter((h) => !conocidas.has(h.naturaleza));
          return otras.length ? [{ naturaleza: otras[0].naturaleza, items: otras }] : [];
        })(),
      ]
    : [];

  const fotosPorUbi = new Map<string, { foto: Foto; idx: number }[]>();
  data?.fotos.forEach((foto, idx) => {
    const k = foto.ubicacion_nombre ?? 'Sin ubicación asignada';
    const lista = fotosPorUbi.get(k) ?? [];
    lista.push({ foto, idx });
    fotosPorUbi.set(k, lista);
  });

  const kpis: { texto: string; alerta: boolean }[] = [];
  if (totalEuros > 0) kpis.push({ texto: `${totalEuros.toLocaleString('es-ES')} € en oportunidades`, alerta: false });
  if (riesgosN > 0) kpis.push({ texto: `${riesgosN} riesgo${riesgosN === 1 ? '' : 's'}`, alerta: true });
  if (vencidosN > 0)
    kpis.push({ texto: `${vencidosN} paso${vencidosN === 1 ? '' : 's'} vencido${vencidosN === 1 ? '' : 's'}`, alerta: true });

  const estadoDescarga = visitaId ? estadoDe(visitaId) : 'inactivo';
  const descargaLista = typeof estadoDescarga === 'object' ? estadoDescarga : null;

  const sinNada =
    !!data &&
    !data.resumen_texto &&
    !data.objetivo?.trim() &&
    !data.notas.length &&
    !data.fotos.length &&
    !data.audios.length &&
    !data.hallazgos.length &&
    !data.oportunidades.length &&
    !data.proximosPasos.length;

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo={data?.cliente_nombre ?? 'visita'}
        ayuda="visita-cerrada"
        subtitulo={
          data
            ? `${fechaCorta(data.fecha)}${
                data.tipo_visita ? ` · ${etiqueta(TIPO_VISITA_LABEL, data.tipo_visita).toLowerCase()}` : ''
              } · ${estadoLegible[data.estado_captura] ?? data.estado_captura}`
            : undefined
        }
      />

      {isLoading && <EstadoLista estado="cargando" />}
      {sinConexion && <EstadoLista estado="sin-conexion" onReintentar={reintentar} />}
      {isError && <EstadoLista estado="error" mensaje="No se pudo cargar la visita." onReintentar={reintentar} />}

      {data && (
        <div className="screen__scroll" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {kpis.length > 0 && (
            <div className="dvc-kpis">
              {kpis.map((k) => (
                <span key={k.texto} className={`dvc-kpi${k.alerta ? ' dvc-kpi--alerta' : ''}`}>
                  {k.alerta && <Icono nombre="atencion" size={12} />}
                  {k.texto}
                </span>
              ))}
            </div>
          )}

          {sinNada && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>
              Esta visita no tiene ninguna captura registrada.
            </div>
          )}

          {/* Resumen — primero y destacado, como en el informe. */}
          {!sinNada && (
            <div className="dvc-bloque dvc-bloque--resumen">
              <div className="dvc-bloque__lb">Resumen</div>
              {data.resumen_texto ? (
                <div className="dvc-bloque__texto">{data.resumen_texto}</div>
              ) : (
                <div className="dvc-bloque__texto" style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>
                  Sin resumen registrado.
                </div>
              )}
            </div>
          )}

          {!sinNada && (
            <div className="dvc-bloque">
              <div className="dvc-bloque__lb">Objetivo de la visita</div>
              {data.objetivo?.trim() ? (
                <div className="dvc-bloque__texto">{data.objetivo}</div>
              ) : (
                <div className="dvc-bloque__texto" style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>
                  Sin objetivo registrado.
                </div>
              )}
            </div>
          )}

          {opsOrdenadas.length > 0 && (
            <SeccionLista titulo={`Oportunidades (${opsOrdenadas.length})`}>
              {opsOrdenadas.map((o) => (
                <FilaNavegable
                  key={o.id}
                  titulo={o.titulo}
                  subtitulo={`${etiqueta(ETAPA_LABEL, o.etapa)} · ${etiqueta(PRIORIDAD_LABEL, o.prioridad).toLowerCase()}`}
                  valor={o.valor_estimado != null ? `${o.valor_estimado.toLocaleString('es-ES')} €` : undefined}
                  to={`/oportunidades/${o.id}`}
                />
              ))}
              {totalEuros > 0 && <FilaDato etiqueta="Total estimado" valor={`${totalEuros.toLocaleString('es-ES')} €`} />}
            </SeccionLista>
          )}

          {gruposHallazgos.length > 0 && (
            <SeccionLista titulo={`Hallazgos (${data.hallazgos.length})`}>
              {gruposHallazgos.flatMap((g) => [
                <div
                  key={`sub-${g.naturaleza}`}
                  className={`seccion-lista__subcabecera${g.naturaleza === 'riesgo' ? ' seccion-lista__subcabecera--riesgo' : ''}`}
                >
                  {g.naturaleza === 'riesgo' && <Icono nombre="atencion" size={12} />}{' '}
                  {etiqueta(NATURALEZA_LABEL, g.naturaleza)} ({g.items.length})
                </div>,
                ...g.items.map((h) => (
                  <FilaNavegable
                    key={h.id}
                    titulo={h.termino_nombre || 'Hallazgo'}
                    subtitulo={h.nota ?? undefined}
                    tono={g.naturaleza === 'riesgo' ? 'riesgo' : 'neutral'}
                    to={`/hallazgos/${h.id}`}
                  />
                )),
              ])}
            </SeccionLista>
          )}

          {data.proximosPasos.length > 0 && (
            <SeccionLista titulo={`Próximos pasos (${data.proximosPasos.length})`}>
              {data.proximosPasos.map((p) => {
                const vencido = esVencido(p);
                return (
                  <FilaNavegable
                    key={p.id}
                    titulo={p.descripcion}
                    tono={vencido ? 'riesgo' : 'neutral'}
                    valor={
                      vencido ? (
                        <span style={{ color: 'var(--danger-600)', fontWeight: 600 }}>
                          Vencido{p.fecha_objetivo ? ` · ${fechaCorta(p.fecha_objetivo)}` : ''}
                        </span>
                      ) : p.fecha_objetivo ? (
                        fechaCorta(p.fecha_objetivo)
                      ) : undefined
                    }
                    to={`/proximos-pasos/${p.id}`}
                  />
                );
              })}
            </SeccionLista>
          )}

          {data.notas.length > 0 && (
            <div>
              <div className="seccion-lista__cabecera" style={{ paddingBottom: 6 }}>
                Anexo · Notas ({data.notas.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.notas.map((n) => (
                  <div key={n.id} className="dvc-bloque">
                    {n.titulo && <div style={{ fontWeight: 500, marginBottom: 2 }}>{n.titulo}</div>}
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-700)', lineHeight: 1.4 }}>
                      {n.contenido_texto}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.fotos.length > 0 && (
            <div>
              <div className="seccion-lista__cabecera" style={{ paddingBottom: 6 }}>
                Anexo · Fotos ({data.fotos.length})
              </div>
              {[...fotosPorUbi.entries()].map(([ubi, lista]) => (
                <div key={ubi} style={{ marginBottom: 8 }}>
                  <div className="dvc-fotos-ubi">{ubi}</div>
                  <div className="dvc-fotos-grid">
                    {lista.map(({ foto, idx }) =>
                      foto.url ? (
                        <button key={foto.id} type="button" onClick={() => setVisorIndice(idx)} aria-label={foto.titulo ?? 'ver foto'}>
                          <img src={foto.url} alt={foto.titulo ?? 'foto'} />
                        </button>
                      ) : (
                        <div key={foto.id} style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', alignSelf: 'center' }}>
                          {foto.titulo ?? 'no disponible'}
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.audios.length > 0 && (
            <div>
              <div className="seccion-lista__cabecera" style={{ paddingBottom: 6 }}>
                Anexo · Audios ({data.audios.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.audios.map((a) => (
                  <div key={a.id} className="dvc-bloque">
                    {a.titulo && <div style={{ fontSize: 'var(--text-sm)', marginBottom: 6 }}>{a.titulo}</div>}
                    {a.url ? (
                      <audio controls src={a.url} style={{ width: '100%' }} />
                    ) : (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>Audio no disponible</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {visitaId && (
            <SeccionLista>
              <FilaAccion
                densidad="compacta"
                titulo="Informe de la visita (PDF)"
                subtitulo={
                  descargaLista
                    ? `Copia descargada (${formatearMB(descargaLista.tamanoBytes)} MB)`
                    : estadoDescarga === 'generando'
                      ? 'Generando el PDF…'
                      : estadoDescarga === 'error'
                        ? 'No se pudo generar, toca de nuevo'
                        : 'Descárgalo o pásalo a otras áreas'
                }
                acciones={[
                  {
                    icono: 'descargar',
                    etiqueta: descargaLista ? 'Descargar el informe otra vez' : 'Descargar informe',
                    onClick: descargaLista ? undefined : () => descargar(visitaId),
                    href: descargaLista ? descargaLista.url : undefined,
                    disabled: estadoDescarga === 'generando',
                    tono: estadoDescarga === 'error' ? 'riesgo' : descargaLista ? 'brand' : 'neutral',
                  },
                ]}
              />
            </SeccionLista>
          )}
        </div>
      )}

      {data && visitaId && (
        <div style={{ marginTop: 4 }}>
          {borrar.visitaBorrarId === visitaId ? (
            <ConfirmarBorradoVisita ctrl={borrar} />
          ) : (
            <SeccionLista>
              <FilaNavegable
                icono="borrar"
                titulo="Borrar esta visita"
                tono="riesgo"
                chevron={false}
                onClick={() => void borrar.pedir(visitaId)}
              />
            </SeccionLista>
          )}
        </div>
      )}

      {visorIndice != null && data && (
        <VisorFotos
          fotos={data.fotos}
          indice={visorIndice}
          onCerrar={() => setVisorIndice(null)}
          onCambiar={setVisorIndice}
        />
      )}
    </div>
  );
}
