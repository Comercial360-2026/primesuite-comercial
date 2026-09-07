import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVolverA } from '@/lib/volver-a';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { plural } from '@/lib/texto';
import { generarResumenReglas } from '@/lib/resumen-visita';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useVisitaLocal } from '@/hooks/use-visita-local';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { AvisoTardando } from '@/components/ui/aviso-tardando';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaAccion } from '@/components/ui/fila-accion';
import { FilaDato } from '@/components/ui/fila-dato';
import { Aviso } from '@/components/ui/aviso';
import { useDescargarInforme, formatearMB } from '@/hooks/use-descargar-informe';
import { HojaDetalleCierre, type GrupoCierre } from './hoja-detalle-cierre';
import type { OperacionPendiente } from '@/lib/offline-queue/types';

// Consolidación de la visita es un UPDATE, no un INSERT — el resto de la
// cola offline (db.ts/sync-engine.ts) solo modela creación de registros
// nuevos (ver 09_arquitectura_tecnica.md §4 y la decisión ya cerrada de no
// tocar más infraestructura). Para no reabrir esa capa, este único caso se
// resuelve aquí con un intento directo + reintento ligero en localStorage
// si no hay red en el momento del cierre — es una corrección puntual, no
// una ampliación del motor de sincronización.
interface ParcheCierre {
  estado_captura: 'consolidada';
  resumen_texto?: string;
  resumen_origen?: 'reglas';
}

function intentarConsolidarOffline(visitaId: string, parche: ParcheCierre) {
  localStorage.setItem(`consolidar-pendiente-${visitaId}`, JSON.stringify(parche));
  const reintentar = async () => {
    const clave = `consolidar-pendiente-${visitaId}`;
    const pendiente = localStorage.getItem(clave);
    if (!pendiente) return;
    const { error } = await supabase.from('visita').update(JSON.parse(pendiente)).eq('id', visitaId);
    if (!error) {
      localStorage.removeItem(clave);
      window.removeEventListener('online', reintentar);
    }
  };
  window.addEventListener('online', reintentar);
}

export function CierreVisita() {
  const { visitaId } = useParams<{ visitaId: string }>();
  const navigate = useNavigate();
  // El ← respeta de dónde se llegó (panel de "visitas abiertas", Hoy…); si no
  // consta, a la propia visita en curso. Regla #14 del modelo de UI.
  const volverDeCierre = useVolverA(`/visita/${visitaId}`);
  const { operaciones } = useSyncQueue(visitaId);
  // El objetivo puede no estar aún en el servidor si se cierra la visita en
  // los primeros segundos (viaja en la cola de creación y se aplica con un
  // UPDATE posterior). La cola local lo tiene desde el arranque — se usa
  // como fallback para que el resumen automático nunca salga sin él.
  const visitaLocal = useVisitaLocal(visitaId);
  const { cerrarVisita } = useVisitaActivaContext();

  const [vista, setVista] = useState<'cierre' | 'confirmar' | 'resumen'>('cierre');
  const [sincronizada, setSincronizada] = useState(true);
  const { estadoDe, descargar } = useDescargarInforme();
  // Casilla cuyo detalle se está mirando (Fotos, Próximos pasos…). Se
  // congelan los items al abrir: así el modal tiene una lista estable y las
  // URLs de blob de fotos/audios no se recrean/revocan con cada re-render.
  const [detalle, setDetalle] = useState<{ grupo: GrupoCierre; items: OperacionPendiente[] } | null>(null);
  const consolidacion = useAccionAsync();

  // "Ibas a…": el objetivo con el que se planificó la visita, para cerrarla
  // teniéndolo delante. Solo lectura aquí — si hay que matizarlo se hace en
  // Visita Activa. maybeSingle porque una visita ad-hoc offline aún no
  // tiene fila en el servidor.
  const { data: visitaObjetivo } = useQuery({
    queryKey: ['visita-objetivo', visitaId],
    enabled: !!visitaId,
    queryFn: async (): Promise<{ objetivo: string | null } | null> => {
      const { data, error } = await supabase
        .from('visita')
        .select('objetivo')
        .eq('id', visitaId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Regla 6 (contexto siempre visible): ninguna de las 3 vistas de esta
  // pantalla decía de qué cliente era la visita que se está cerrando, solo
  // el objetivo cuando existía. maybeSingle: una visita ad-hoc offline puede
  // no tener fila en el servidor todavía (mismo motivo que `visitaObjetivo`
  // arriba). El proyecto (siempre con nombre) se añade al contexto.
  const { data: contextoVisita } = useQuery({
    queryKey: ['visita-contexto-cierre', visitaId],
    enabled: !!visitaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visita')
        .select('cliente:cliente_id(nombre), proyecto:proyecto_id(nombre)')
        .eq('id', visitaId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const contextoTexto = [
    contextoVisita?.cliente?.nombre,
    contextoVisita?.proyecto?.nombre ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  // Prechequeo antes de cerrar (aviso NO bloqueante): una visita sin
  // interlocutores registrados es un hueco real ("¿con quién hablaste?"),
  // y un cliente recién creado suele quedarse sin sector/tamaño/ubicación
  // (salen en la cabecera de cada informe).
  const { data: prechequeoCierre } = useQuery({
    queryKey: ['prechequeo-cierre', visitaId],
    enabled: !!visitaId,
    queryFn: async () => {
      const { data: v } = await supabase
        .from('visita')
        .select('cliente_id')
        .eq('id', visitaId!)
        .maybeSingle();
      if (!v?.cliente_id) return null;
      const [{ data: inters }, { data: cli }] = await Promise.all([
        supabase
          .from('visita_interlocutor')
          .select('interlocutor:interlocutor_id(activo)')
          .eq('visita_id', visitaId!),
        supabase
          .from('cliente')
          .select('sector, tamano_aprox, ubicacion_general')
          .eq('id', v.cliente_id)
          .maybeSingle(),
      ]);
      const nInterlocutores = (inters ?? []).filter(
        (r) => (r.interlocutor as unknown as { activo?: boolean } | null)?.activo
      ).length;
      const sinDatosCliente =
        !!cli && !cli.sector && !cli.tamano_aprox && !cli.ubicacion_general;
      return { nInterlocutores, sinDatosCliente };
    },
  });

  const hallazgosParaResumen = operaciones.filter((op) => op.entidad === 'hallazgo');
  const terminoIdsHallazgos = hallazgosParaResumen
    .map((h) => (h.payload as { terminoId: string }).terminoId)
    .filter((id, i, arr) => arr.indexOf(id) === i);

  const { data: nombresTerminos } = useQuery({
    queryKey: ['nombres-terminos-cierre', terminoIdsHallazgos.join(',')],
    enabled: terminoIdsHallazgos.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('termino').select('id, nombre').in('id', terminoIdsHallazgos);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((t) => [t.id, t.nombre]));
    },
  });

  // Ids de zona presentes en CUALQUIER elemento (capturas, hallazgos,
  // oportunidades) — el recorrido ata los cinco tipos a una zona.
  const ubicacionIds = operaciones
    .filter((op) => ['captura_libre', 'hallazgo', 'oportunidad'].includes(op.entidad))
    .map((op) => (op.payload as { ubicacionId?: string }).ubicacionId)
    .filter((id): id is string => !!id)
    .filter((id, i, arr) => arr.indexOf(id) === i);

  // Sin esto, "revisar por ubicación" mostraba el UUID en bruto en vez del
  // nombre — invisible mientras no existían ubicaciones reales, pero un
  // fallo real en cuanto se empezó a usar Modo Recorrido de verdad.
  const { data: nombresUbicaciones } = useQuery({
    queryKey: ['nombres-ubicaciones-cierre', ubicacionIds.join(',')],
    enabled: ubicacionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('ubicacion').select('id, nombre').in('id', ubicacionIds);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((u) => [u.id, u.nombre]));
    },
  });

  if (!visitaId) return null;

  const capturas = operaciones.filter((op) => op.entidad === 'captura_libre');
  const oportunidades = operaciones.filter((op) => op.entidad === 'oportunidad');
  const hallazgos = operaciones.filter((op) => op.entidad === 'hallazgo');
  const pasos = operaciones.filter((op) => op.entidad === 'proximo_paso');
  const fotos = capturas.filter((c) => (c.payload as { tipo: string }).tipo === 'foto');
  const audios = capturas.filter((c) => (c.payload as { tipo: string }).tipo === 'audio');
  const notas = capturas.filter((c) => (c.payload as { tipo: string }).tipo === 'nota');

  // Las seis casillas del resumen: cada una abre su detalle al pulsarla.
  // La etiqueta concuerda en número con el recuento ("1 nota", no "1 Notas").
  const casillasCierre: Array<{
    grupo: GrupoCierre;
    sing: string;
    plur: string;
    items: OperacionPendiente[];
  }> = [
    { grupo: 'fotos', sing: 'Foto', plur: 'Fotos', items: fotos },
    { grupo: 'audios', sing: 'Audio', plur: 'Audios', items: audios },
    { grupo: 'notas', sing: 'Nota', plur: 'Notas', items: notas },
    { grupo: 'oportunidades', sing: 'Oportunidad', plur: 'Oportunidades', items: oportunidades },
    { grupo: 'hallazgos', sing: 'Hallazgo', plur: 'Hallazgos', items: hallazgos },
    { grupo: 'pasos', sing: 'Próximo paso', plur: 'Próximos pasos', items: pasos },
  ];

  // Tira de chips con el recuento — misma en "¿Confirmas el cierre?" y en
  // el resumen. Concordancia de número correcta ("1 nota", no "1 notas").
  const chipsRecuento = [
    plural(fotos.length, 'foto', 'fotos'),
    plural(audios.length, 'audio', 'audios'),
    plural(notas.length, 'nota', 'notas'),
    plural(hallazgos.length, 'hallazgo', 'hallazgos'),
    plural(oportunidades.length, 'oportunidad', 'oportunidades'),
    plural(pasos.length, 'próximo paso', 'próximos pasos'),
  ];

  // Resumen "por reglas" que se guarda al cerrar (visita.resumen_texto). Es
  // una micro-historia legible, no el recuento; el comercial puede
  // reescribirlo luego desde el detalle de la visita. Cadena barata de
  // construir sobre arrays pequeños — no necesita memo.
  const resumenReglas = generarResumenReglas({
    objetivo: visitaObjetivo?.objetivo ?? visitaLocal?.objetivo,
    hallazgos: hallazgos.map((h) => {
      const p = h.payload as { terminoId: string; naturaleza: string; nota?: string };
      return {
        terminoNombre: nombresTerminos?.[p.terminoId] ?? 'un término',
        naturaleza: p.naturaleza,
        nota: p.nota ?? null,
      };
    }),
    oportunidades: oportunidades.map((o) => ({ titulo: (o.payload as { titulo: string }).titulo })),
    pasos: pasos.map((p) => {
      const pl = p.payload as { descripcion: string; fechaObjetivo?: string };
      return { descripcion: pl.descripcion, fecha: pl.fechaObjetivo ?? null };
    }),
    nFotos: fotos.length,
    nAudios: audios.length,
    nNotas: notas.length,
  });

  // Agrupación por zona: todo lo capturado con una zona anotada (fotos,
  // audios, notas, hallazgos, oportunidades) para repasarlo zona a zona
  // antes de cerrar, no elemento a elemento. La zona es la etiqueta de
  // texto libre `zonaTexto`; `ubicacionId` es el campo antiguo de
  // catálogo, solo por si una visita quedó abierta desde antes del cambio.
  const zonaDe = (op: (typeof operaciones)[number]) => {
    const p = op.payload as { zonaTexto?: string; ubicacionId?: string };
    return p.zonaTexto?.trim() || p.ubicacionId || 'sin ubicación';
  };
  const elementosPorUbicacion = (() => {
    const acc: Record<
      string,
      { fotos: number; audios: number; notas: number; hallazgos: number; oportunidades: number }
    > = {};
    const bump = (zona: string, k: keyof (typeof acc)[string]) => {
      acc[zona] = acc[zona] ?? { fotos: 0, audios: 0, notas: 0, hallazgos: 0, oportunidades: 0 };
      acc[zona][k] += 1;
    };
    fotos.forEach((c) => bump(zonaDe(c), 'fotos'));
    audios.forEach((c) => bump(zonaDe(c), 'audios'));
    notas.forEach((c) => bump(zonaDe(c), 'notas'));
    hallazgos.forEach((h) => bump(zonaDe(h), 'hallazgos'));
    oportunidades.forEach((o) => bump(zonaDe(o), 'oportunidades'));
    return acc;
  })();

  const capturasPendientes = capturas.filter((c) => c.estado !== 'completado');

  async function consolidar() {
    if (!visitaId) return;

    // El resumen "por reglas" se guarda junto con el cierre. `resumen_origen`
    // nace 'reglas' por defecto en la BD; solo se fija explícito para dejar
    // claro el origen aunque cambie el default.
    const parche: ParcheCierre = { estado_captura: 'consolidada' };
    if (resumenReglas) {
      parche.resumen_texto = resumenReglas;
      parche.resumen_origen = 'reglas';
    }

    await consolidacion.ejecutar(
      async () => {
        if (navigator.onLine) {
          const { error } = await supabase.from('visita').update(parche).eq('id', visitaId);
          if (error) {
            // Con conexión presente, un error de Supabase es un fallo real
            // (RLS, validación, servidor) — no desconexión. Se lanza para
            // que useAccionAsync lo trate como error recuperable visible,
            // en vez de disfrazarlo de "pendiente de conexión".
            throw error;
          }
          return { sincronizada: true };
        } else {
          intentarConsolidarOffline(visitaId, parche);
          return { sincronizada: false };
        }
      },
      {
        onExito: ({ sincronizada }) => {
          setSincronizada(sincronizada);
          setVista('resumen');
          // La visita ya no está en curso: quitar el banner ya, no al
          // pulsar "volver" (1.6 — antes seguía abajo en la pantalla de
          // resumen, lo que se contradecía con "visita cerrada").
          cerrarVisita();
        },
        mensajeError: 'No se pudo cerrar la visita. Inténtalo de nuevo.',
      }
    );
  }

  function volverAHoy() {
    cerrarVisita();
    navigate('/');
  }

  if (vista === 'resumen') {
    return (
      <div className="screen screen--split">
        <CabeceraDetalle
          titulo="Resumen de la visita"
          subtitulo={contextoTexto || undefined}
          onVolver={volverAHoy}
          ayuda="cierre-visita"
        />

        {sincronizada ? (
          <Aviso tipo="exito">Visita cerrada correctamente.</Aviso>
        ) : (
          <Aviso tipo="atencion" titulo="Guardado localmente, pendiente de conexión">
            El cierre se confirmará con el servidor automáticamente en cuanto recuperes conexión. No hace falta que
            hagas nada más.
          </Aviso>
        )}

        <div className="screen__scroll">
          {resumenReglas && (
            <SeccionLista titulo="Resumen">
              <div style={{ padding: '2px var(--fila-pad-x) 6px', fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
                {resumenReglas}
              </div>
              <div style={{ padding: '0 var(--fila-pad-x) 4px', fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                Generado automáticamente. Puedes reescribirlo desde el detalle de la visita.
              </div>
            </SeccionLista>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {chipsRecuento.map((c) => (
              <span key={c} className="chip">{c}</span>
            ))}
          </div>

          {notas.length > 0 && (
            <SeccionLista titulo="Notas">
              {notas.map((n) => {
                const p = n.payload as { titulo?: string; contenidoTexto?: string };
                return (
                  <FilaDato
                    key={n.id}
                    etiqueta={p.titulo || p.contenidoTexto || '(nota vacía)'}
                    valor=""
                  />
                );
              })}
            </SeccionLista>
          )}

          {oportunidades.length > 0 && (
            <SeccionLista titulo="Oportunidades">
              {oportunidades.map((o) => (
                <FilaDato key={o.id} etiqueta={(o.payload as { titulo: string }).titulo} valor="" />
              ))}
            </SeccionLista>
          )}

          {hallazgos.length > 0 && (
            <SeccionLista titulo="Hallazgos">
              {hallazgos.map((h) => {
                const payload = h.payload as { terminoId: string; naturaleza: string };
                return (
                  <FilaDato
                    key={h.id}
                    etiqueta={nombresTerminos?.[payload.terminoId] ?? '…'}
                    valor={payload.naturaleza.replace('_', ' ')}
                    valorTenue
                    tono={payload.naturaleza === 'riesgo' ? 'riesgo' : 'neutral'}
                  />
                );
              })}
            </SeccionLista>
          )}

          {pasos.length > 0 && (
            <SeccionLista titulo="Próximos pasos">
              {pasos.map((p) => {
                const payload = p.payload as { descripcion: string; fechaObjetivo?: string };
                return (
                  <FilaDato
                    key={p.id}
                    etiqueta={payload.descripcion}
                    valor={payload.fechaObjetivo ? fechaCorta(payload.fechaObjetivo) : ''}
                    valorTenue
                  />
                );
              })}
            </SeccionLista>
          )}

          {/* El informe solo se puede generar si la visita ya está en el
              servidor; sin conexión, se descarga luego desde el historial. */}
          {sincronizada && visitaId && (() => {
            const estadoDescarga = estadoDe(visitaId);
            const descargaLista = typeof estadoDescarga === 'object' ? estadoDescarga : null;
            return (
              <SeccionLista>
                <FilaAccion
                  densidad="compacta"
                  titulo="Informe de la visita"
                  subtitulo={
                    descargaLista
                      ? `Descargado (${formatearMB(descargaLista.tamanoBytes)} MB)`
                      : estadoDescarga === 'generando'
                        ? 'Generando el informe…'
                        : estadoDescarga === 'sin-red'
                          ? 'Sin conexión. Inténtalo cuando tengas red'
                          : estadoDescarga === 'error'
                            ? 'No se pudo generar, toca de nuevo'
                            : 'PDF con las fotos y los audios, en un ZIP'
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
            );
          })()}
        </div>

        <button className="btn btn-primary" onClick={volverAHoy}>
          Volver a hoy
        </button>
      </div>
    );
  }

  if (vista === 'confirmar') {
    return (
      <div className="screen">
        <CabeceraDetalle
          titulo="¿Confirmas el cierre?"
          subtitulo={contextoTexto || undefined}
          onVolver={() => {
            consolidacion.limpiarError();
            setVista('cierre');
          }}
          ayuda="cierre-visita"
        />

        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', margin: 0 }}>
          Al cerrar, la visita queda fija y en solo lectura. Esto es lo que se guarda:
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chipsRecuento.map((c) => (
            <span key={c} className="chip">{c}</span>
          ))}
        </div>

        {capturasPendientes.length > 0 && (
          <Aviso tipo="atencion" titulo={`${plural(capturasPendientes.length, 'captura', 'capturas')} todavía sin confirmar en el servidor`}>
            Puedes cerrar igualmente — se seguirán sincronizando en segundo plano — pero si tienes conexión estable,
            espera unos segundos para asegurarte de que todo suba antes de cerrar.
          </Aviso>
        )}

        {consolidacion.error && <Aviso tipo="error">{consolidacion.error}</Aviso>}

        <div style={{ display: 'flex', gap: 8, marginTop: 'var(--space-2)' }}>
          <button
            className="btn btn-secondary"
            disabled={consolidacion.cargando}
            onClick={() => {
              consolidacion.limpiarError();
              setVista('cierre');
            }}
          >
            Volver
          </button>
          <button className="btn btn-primary" disabled={consolidacion.cargando} onClick={consolidar}>
            {consolidacion.cargando ? 'Cerrando…' : 'Sí, cerrar visita'}
          </button>
        </div>
        <AvisoTardando visible={consolidacion.tardando} />
      </div>
    );
  }

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo="Cerrar visita"
        subtitulo={contextoTexto || undefined}
        onVolver={() => navigate(volverDeCierre)}
        ayuda="cierre-visita"
      />

      {/* Todo el contenido (recuento, objetivo, avisos y "Revisar por
          zona") va en el MISMO scroll: antes el recuento y los avisos
          quedaban fijos y, con un aviso largo, "Revisar por zona" se
          quedaba aplastado en una tira de 40px imposible de leer. */}
      <div className="screen__scroll" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {casillasCierre.map(({ grupo, sing, plur, items }) => (
          <button
            key={grupo}
            type="button"
            className="card cierre-casilla"
            disabled={items.length === 0}
            onClick={() => setDetalle({ grupo, items })}
          >
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 500 }}>{items.length}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
              {items.length === 1 ? sing : plur}
            </div>
          </button>
        ))}
      </div>

      {visitaObjetivo?.objetivo?.trim() && (
        <div className="ficha-vitals">
          <span>Ibas a: <b>{visitaObjetivo.objetivo}</b></span>
        </div>
      )}

      {prechequeoCierre &&
        (prechequeoCierre.nInterlocutores === 0 ||
          prechequeoCierre.sinDatosCliente ||
          pasos.length === 0 ||
          oportunidades.length === 0) && (
          <Aviso tipo="atencion" titulo="Antes de cerrar">
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {prechequeoCierre.nInterlocutores === 0 && (
                <li>
                  No has registrado con quién hablaste.{' '}
                  <button
                    type="button"
                    className="btn-enlace"
                    style={{ padding: 0 }}
                    onClick={() => navigate(`/visita/${visitaId}`)}
                  >
                    Volver a la visita
                  </button>{' '}
                  para añadir interlocutores.
                </li>
              )}
              {pasos.length === 0 && (
                <li>
                  No has apuntado ningún próximo paso. Si acordasteis algo (mandar oferta, llamar,
                  otra visita),{' '}
                  <button
                    type="button"
                    className="btn-enlace"
                    style={{ padding: 0 }}
                    onClick={() => navigate(`/visita/${visitaId}`)}
                  >
                    vuelve a la visita
                  </button>{' '}
                  para dejarlo anotado.
                </li>
              )}
              {oportunidades.length === 0 && (
                <li>No has registrado ninguna oportunidad. Si viste alguna, apúntala antes de cerrar.</li>
              )}
              {prechequeoCierre.sinDatosCliente && (
                <li>
                  Este cliente no tiene sector, tamaño ni ubicación. Salen en la cabecera de cada
                  informe — complétalos desde su ficha cuando puedas.
                </li>
              )}
            </ul>
          </Aviso>
        )}

        {Object.keys(elementosPorUbicacion).some((k) => k !== 'sin ubicación') && (
          <SeccionLista titulo="Revisar por zona">
            {Object.entries(elementosPorUbicacion).map(([ubicacionId, n]) => {
              const resumen = [
                n.fotos && `${n.fotos} foto${n.fotos > 1 ? 's' : ''}`,
                n.audios && `${n.audios} audio${n.audios > 1 ? 's' : ''}`,
                n.notas && `${n.notas} nota${n.notas > 1 ? 's' : ''}`,
                n.hallazgos && `${n.hallazgos} hallazgo${n.hallazgos > 1 ? 's' : ''}`,
                n.oportunidades && `${n.oportunidades} oportunidad${n.oportunidades > 1 ? 'es' : ''}`,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <FilaDato
                  key={ubicacionId}
                  etiqueta={ubicacionId === 'sin ubicación' ? 'General' : nombresUbicaciones?.[ubicacionId] ?? ubicacionId}
                  valor={resumen}
                  valorTenue
                />
              );
            })}
          </SeccionLista>
        )}
      </div>

      <button className="btn btn-primary" onClick={() => setVista('confirmar')}>
        Cerrar visita
      </button>

      {detalle && (
        <HojaDetalleCierre
          grupo={detalle.grupo}
          items={detalle.items}
          nombresTerminos={nombresTerminos}
          onCerrar={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
