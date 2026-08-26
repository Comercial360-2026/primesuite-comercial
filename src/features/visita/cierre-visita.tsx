import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useAccionAsync } from '@/hooks/use-accion-async';

const TIPOS_VISITA = ['comercial', 'demo', 'tecnica', 'seguimiento', 'relacion'] as const;

// Consolidación de la visita es un UPDATE, no un INSERT — el resto de la
// cola offline (db.ts/sync-engine.ts) solo modela creación de registros
// nuevos (ver 09_arquitectura_tecnica.md §4 y la decisión ya cerrada de no
// tocar más infraestructura). Para no reabrir esa capa, este único caso se
// resuelve aquí con un intento directo + reintento ligero en localStorage
// si no hay red en el momento del cierre — es una corrección puntual, no
// una ampliación del motor de sincronización.
function intentarConsolidarOffline(visitaId: string, tipoVisita: string | null) {
  localStorage.setItem(
    `consolidar-pendiente-${visitaId}`,
    JSON.stringify({ estado_captura: 'consolidada', tipo_visita: tipoVisita })
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

  const [tipoVisita, setTipoVisita] = useState<string | null>(null);
  const [vista, setVista] = useState<'cierre' | 'confirmar' | 'resumen'>('cierre');
  const [sincronizada, setSincronizada] = useState(true);
  const consolidacion = useAccionAsync();

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

  if (!visitaId) return null;

  const capturas = operaciones.filter((op) => op.entidad === 'captura_libre');
  const oportunidades = operaciones.filter((op) => op.entidad === 'oportunidad');
  const hallazgos = operaciones.filter((op) => op.entidad === 'hallazgo');
  const fotos = capturas.filter((c) => (c.payload as { tipo: string }).tipo === 'foto');
  const audios = capturas.filter((c) => (c.payload as { tipo: string }).tipo === 'audio');
  const notas = capturas.filter((c) => (c.payload as { tipo: string }).tipo === 'nota');

  // Agrupación por ubicación — evita revisar fotos una a una, tal como se
  // decidió en la auditoría del modelo físico.
  const fotosPorUbicacion = fotos.reduce<Record<string, number>>((acc, c) => {
    const ubicacionId = (c.payload as { ubicacionId?: string }).ubicacionId ?? 'sin ubicación';
    acc[ubicacionId] = (acc[ubicacionId] ?? 0) + 1;
    return acc;
  }, {});

  const capturasPendientes = capturas.filter((c) => c.estado !== 'completado');

  async function consolidar() {
    if (!visitaId) return;

    await consolidacion.ejecutar(
      async () => {
        if (navigator.onLine) {
          const { error } = await supabase
            .from('visita')
            .update({ estado_captura: 'consolidada', tipo_visita: tipoVisita })
            .eq('id', visitaId);
          if (error) {
            intentarConsolidarOffline(visitaId, tipoVisita);
            return { sincronizada: false };
          }
          return { sincronizada: true };
        } else {
          intentarConsolidarOffline(visitaId, tipoVisita);
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
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>resumen de la visita</h1>

        {!sincronizada && (
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
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="chip">{fotos.length} fotos</span>
            <span className="chip">{audios.length} audios</span>
            <span className="chip">{notas.length} notas</span>
            <span className="chip">{hallazgos.length} hallazgos</span>
            <span className="chip">{oportunidades.length} oportunidades</span>
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
        </div>

        <button className="btn btn-primary" onClick={volverAHoy}>
          volver a hoy
        </button>
      </div>
    );
  }

  if (vista === 'confirmar') {
    return (
      <div className="screen screen--split">
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>¿confirmas el cierre?</h1>

        <div className="screen__scroll">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="chip">{fotos.length} fotos</span>
            <span className="chip">{audios.length} audios</span>
            <span className="chip">{notas.length} notas</span>
            <span className="chip">{hallazgos.length} hallazgos</span>
            <span className="chip">{oportunidades.length} oportunidades</span>
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
            {consolidacion.cargando ? 'cerrando…' : 'sí, cerrar visita'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen screen--split">
      <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>cerrar visita</h1>

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
      </div>

      <div className="screen__scroll">
        <div className="label" style={{ marginTop: 0 }}>revisar por ubicación</div>
        {Object.entries(fotosPorUbicacion).map(([ubicacionId, cantidad]) => (
          <div key={ubicacionId} className="card">
            {ubicacionId === 'sin ubicación' ? 'sin ubicación' : ubicacionId} · {cantidad} foto(s) sin vincular
          </div>
        ))}

        <div className="label">tipo de visita</div>
        <select className="field" value={tipoVisita ?? ''} onChange={(e) => setTipoVisita(e.target.value || null)}>
          <option value="">sin especificar</option>
          {TIPOS_VISITA.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <button className="btn btn-primary" onClick={() => setVista('confirmar')}>
        consolidar visita
      </button>
    </div>
  );
}
