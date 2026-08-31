import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { AvisoTardando } from '@/components/ui/aviso-tardando';

// Consolidación de la visita es un UPDATE, no un INSERT — el resto de la
// cola offline (db.ts/sync-engine.ts) solo modela creación de registros
// nuevos (ver 09_arquitectura_tecnica.md §4 y la decisión ya cerrada de no
// tocar más infraestructura). Para no reabrir esa capa, este único caso se
// resuelve aquí con un intento directo + reintento ligero en localStorage
// si no hay red en el momento del cierre — es una corrección puntual, no
// una ampliación del motor de sincronización.
function intentarConsolidarOffline(visitaId: string) {
  localStorage.setItem(
    `consolidar-pendiente-${visitaId}`,
    JSON.stringify({ estado_captura: 'consolidada' })
  );
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
  const { operaciones } = useSyncQueue(visitaId);
  const { cerrarVisita } = useVisitaActivaContext();

  const [vista, setVista] = useState<'cierre' | 'confirmar' | 'resumen'>('cierre');
  const [sincronizada, setSincronizada] = useState(true);
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

  // Agrupación por zona: todo lo capturado en el recorrido (fotos, audios,
  // notas, hallazgos, oportunidades) para repasarlo zona a zona antes de
  // cerrar, no elemento a elemento.
  const zonaDe = (op: (typeof operaciones)[number]) =>
    (op.payload as { ubicacionId?: string }).ubicacionId ?? 'sin ubicación';
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

    await consolidacion.ejecutar(
      async () => {
        if (navigator.onLine) {
          const { error } = await supabase
            .from('visita')
            .update({ estado_captura: 'consolidada' })
            .eq('id', visitaId);
          if (error) {
            // Con conexión presente, un error de Supabase es un fallo real
            // (RLS, validación, servidor) — no desconexión. Se lanza para
            // que useAccionAsync lo trate como error recuperable visible,
            // en vez de disfrazarlo de "pendiente de conexión".
            throw error;
          }
          return { sincronizada: true };
        } else {
          intentarConsolidarOffline(visitaId);
          return { sincronizada: false };
        }
      },
      {
        onExito: ({ sincronizada }) => {
          setSincronizada(sincronizada);
          setVista('resumen');
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
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>Resumen de la visita</h1>

        {sincronizada ? (
          <div className="card" style={{ borderColor: 'var(--success-600)' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--success-600)', fontWeight: 500 }}>
              ✓ visita consolidada correctamente
            </div>
          </div>
        ) : (
          <div className="card" style={{ borderColor: 'var(--warning-600)' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--warning-600)', fontWeight: 500 }}>
              guardado localmente, pendiente de conexión
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
              El cierre se confirmará con el servidor automáticamente en cuanto recuperes conexión. No hace falta que hagas nada más.
            </div>
          </div>
        )}

        <div className="screen__scroll">
          {visitaObjetivo?.objetivo?.trim() && (
            <div className="card" style={{ background: 'var(--surface-1)' }}>
              <div className="label" style={{ marginTop: 0 }}>ibas a</div>
              <div style={{ fontSize: 'var(--text-sm)' }}>{visitaObjetivo.objetivo}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="chip">{fotos.length} fotos</span>
            <span className="chip">{audios.length} audios</span>
            <span className="chip">{notas.length} notas</span>
            <span className="chip">{hallazgos.length} hallazgos</span>
            <span className="chip">{oportunidades.length} oportunidades</span>
            <span className="chip">{pasos.length} próximos pasos</span>
          </div>

          {oportunidades.length > 0 && (
            <div className="card card--oportunidad" style={{ padding: '10px 16px' }}>
              {oportunidades.map((o) => (
                <div key={o.id} style={{ fontSize: 'var(--text-sm)' }}>
                  {(o.payload as { titulo: string }).titulo}
                </div>
              ))}
            </div>
          )}

          {hallazgos.length > 0 && (
            <div className="card" style={{ padding: '10px 16px' }}>
              {hallazgos.map((h) => {
                const payload = h.payload as { terminoId: string; naturaleza: string };
                return (
                  <div key={h.id} style={{ fontSize: 'var(--text-sm)' }}>
                    {nombresTerminos?.[payload.terminoId] ?? '…'} · {payload.naturaleza.replace('_', ' ')}
                  </div>
                );
              })}
            </div>
          )}

          {pasos.length > 0 && (
            <div className="card" style={{ padding: '10px 16px' }}>
              {pasos.map((p) => {
                const payload = p.payload as { descripcion: string; fechaObjetivo?: string };
                return (
                  <div key={p.id} style={{ fontSize: 'var(--text-sm)' }}>
                    {payload.descripcion}
                    {payload.fechaObjetivo && ` · ${new Date(payload.fechaObjetivo).toLocaleDateString('es-ES')}`}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button className="btn btn-primary" onClick={volverAHoy}>
          Volver a hoy
        </button>
      </div>
    );
  }

  if (vista === 'confirmar') {
    return (
      <div className="screen screen--split">
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>¿Confirmas el cierre?</h1>

        <div className="screen__scroll">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="chip">{fotos.length} fotos</span>
            <span className="chip">{audios.length} audios</span>
            <span className="chip">{notas.length} notas</span>
            <span className="chip">{hallazgos.length} hallazgos</span>
            <span className="chip">{oportunidades.length} oportunidades</span>
            <span className="chip">{pasos.length} próximos pasos</span>
          </div>

          {capturasPendientes.length > 0 && (
            <div className="card" style={{ borderColor: 'var(--warning-600)' }}>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--warning-600)', fontWeight: 500 }}>
                {capturasPendientes.length} captura(s) todavía sin confirmar en el servidor
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
                Puedes cerrar igualmente — se seguirán sincronizando en segundo plano — pero si tienes conexión estable, espera unos segundos para asegurarte de que todo suba antes de cerrar.
              </div>
            </div>
          )}

          {consolidacion.error && <div className="field-error-text">{consolidacion.error}</div>}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            disabled={consolidacion.cargando}
            onClick={() => {
              consolidacion.limpiarError();
              setVista('cierre');
            }}
          >
            volver
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate(`/visita/${visitaId}`)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', padding: 0 }}>
          ←
        </button>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>Cerrar visita</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 500 }}>{fotos.length}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>fotos</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 500 }}>{audios.length}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>audios</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 500 }}>{notas.length}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>notas</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 500 }}>{oportunidades.length}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>oportunidades</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 500 }}>{hallazgos.length}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>hallazgos</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 500 }}>{pasos.length}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>próximos pasos</div>
        </div>
      </div>

      {visitaObjetivo?.objetivo?.trim() && (
        <div className="card" style={{ background: 'var(--surface-1)' }}>
          <div className="label" style={{ marginTop: 0 }}>ibas a</div>
          <div style={{ fontSize: 'var(--text-sm)' }}>{visitaObjetivo.objetivo}</div>
        </div>
      )}

      <div className="screen__scroll">
        <div className="label" style={{ marginTop: 0 }}>revisar por ubicación</div>
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
            <div key={ubicacionId} className="card">
              {ubicacionId === 'sin ubicación' ? 'sin ubicación' : (nombresUbicaciones?.[ubicacionId] ?? '…')}
              {' · '}
              {resumen}
            </div>
          );
        })}
      </div>

      <button className="btn btn-primary" onClick={() => setVista('confirmar')}>
        Consolidar visita
      </button>
    </div>
  );
}
