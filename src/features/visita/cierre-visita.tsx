import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';

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
  const [vista, setVista] = useState<'cierre' | 'resumen'>('cierre');

  if (!visitaId) return null;

  const capturas = operaciones.filter((op) => op.entidad === 'captura_libre');
  const oportunidades = operaciones.filter((op) => op.entidad === 'oportunidad');
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

  async function consolidar() {
    if (!visitaId) return;
    if (navigator.onLine) {
      const { error } = await supabase
        .from('visita')
        .update({ estado_captura: 'consolidada', tipo_visita: tipoVisita })
        .eq('id', visitaId);
      if (error) {
        intentarConsolidarOffline(visitaId, tipoVisita);
      }
    } else {
      intentarConsolidarOffline(visitaId, tipoVisita);
    }
    // Optimista: el comercial no espera confirmación de red para terminar
    // su flujo, coherente con "nada bloquea el avance".
    setVista('resumen');
  }

  function volverAHoy() {
    cerrarVisita();
    navigate('/');
  }

  if (vista === 'resumen') {
    return (
      <div className="screen">
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>resumen de la visita</h1>

        <div className="card">
          <div className="label" style={{ marginTop: 0 }}>resumen ejecutivo</div>
          <div style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>
            {fotos.length} fotos, {audios.length} audios y {notas.length} notas capturadas.
            {oportunidades.length > 0 && ` ${oportunidades.length} oportunidad(es) detectada(s).`}
          </div>
        </div>

        {oportunidades.length > 0 && (
          <div className="card card--oportunidad">
            <div className="label" style={{ marginTop: 0 }}>oportunidades</div>
            {oportunidades.map((o) => (
              <div key={o.id} style={{ fontSize: 'var(--text-sm)' }}>
                {(o.payload as { titulo: string }).titulo}
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={volverAHoy}>
          volver a hoy
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
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
      </div>

      <div className="label">revisar por ubicación</div>
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

      <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={consolidar}>
        consolidar visita
      </button>
    </div>
  );
}
