import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';

interface SolicitudPendiente {
  id: string;
  visita_id: string;
  nota: string | null;
  creado_en: string;
  cliente_nombre: string;
  fecha_visita: string;
  solicitante_nombre: string;
}

// Cola de "necesito ayuda con esta visita", mismo patrón que Pendientes en
// vocabulario: un comercial propone (aquí, pide ayuda), Dirección
// Comercial revisa y resuelve. Solo alcanzable para ese rol — la política
// RLS de solicitud_reasignacion ya lo exige también a nivel de datos, esto
// es solo para no enseñar un enlace que fallaría al abrirlo.
export function SolicitudesReasignacion() {
  const queryClient = useQueryClient();
  const [asignandoId, setAsignandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: solicitudes } = useQuery({
    queryKey: ['solicitudes-reasignacion-pendientes'],
    queryFn: async (): Promise<SolicitudPendiente[]> => {
      const { data, error: err } = await supabase
        .from('solicitud_reasignacion')
        .select(
          'id, visita_id, nota, creado_en, visita:visita_id(fecha, cliente:cliente_id(nombre)), solicitante:comercial_solicitante_id(nombre)'
        )
        .eq('estado', 'pendiente')
        .order('creado_en', { ascending: true });
      if (err) throw err;
      return (data ?? []).map((s) => {
        const visita = s.visita as unknown as { fecha: string; cliente: { nombre: string } | null } | null;
        const solicitante = s.solicitante as unknown as { nombre: string } | null;
        return {
          id: s.id,
          visita_id: s.visita_id,
          nota: s.nota,
          creado_en: s.creado_en,
          cliente_nombre: visita?.cliente?.nombre ?? '…',
          fecha_visita: visita?.fecha ?? s.creado_en,
          solicitante_nombre: solicitante?.nombre ?? '…',
        };
      });
    },
  });

  const { data: comercialesActivos } = useQuery({
    queryKey: ['comerciales-activos'],
    queryFn: async () => {
      const { data, error: err } = await supabase.from('comercial').select('id, nombre').eq('activo', true).order('nombre');
      if (err) throw err;
      return data ?? [];
    },
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['solicitudes-reasignacion-pendientes'] });
  }

  async function asignar(solicitud: SolicitudPendiente, comercialId: string) {
    setProcesando(solicitud.id);
    setError(null);
    // Dos pasos, no una única transacción de servidor — riesgo asumido:
    // es una acción de administración de bajo volumen, y si el segundo
    // paso fallara, la solicitud simplemente sigue viéndose como
    // pendiente (se puede reintentar), no se pierde ni se duplica nada.
    const { error: errParticipante } = await supabase
      .from('visita_participante')
      .insert({ visita_id: solicitud.visita_id, comercial_id: comercialId, rol: 'participante' });
    if (errParticipante) {
      setProcesando(null);
      setError(errParticipante.message);
      return;
    }
    const { error: errSolicitud } = await supabase
      .from('solicitud_reasignacion')
      .update({ estado: 'resuelta', comercial_asignado_id: comercialId, resuelto_en: new Date().toISOString() })
      .eq('id', solicitud.id);
    setProcesando(null);
    if (errSolicitud) {
      setError(errSolicitud.message);
      return;
    }
    setAsignandoId(null);
    setBusqueda('');
    invalidar();
  }

  async function descartar(id: string) {
    setProcesando(id);
    setError(null);
    const { error: err } = await supabase
      .from('solicitud_reasignacion')
      .update({ estado: 'descartada', resuelto_en: new Date().toISOString() })
      .eq('id', id);
    setProcesando(null);
    if (err) {
      setError(err.message);
      return;
    }
    invalidar();
  }

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Solicitudes de ayuda" />

      {!solicitudes?.length && (
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>No hay solicitudes pendientes.</p>
      )}

      {solicitudes?.map((s) => (
        <div key={s.id} className="card">
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>{s.cliente_nombre}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
            {new Date(s.fecha_visita).toLocaleDateString('es-ES')} · pedida por {s.solicitante_nombre}
          </div>
          {s.nota && <div style={{ fontSize: 'var(--text-sm)', marginTop: 6 }}>{s.nota}</div>}

          {asignandoId === s.id ? (
            <div style={{ marginTop: 10 }}>
              <input
                className="field"
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="buscar comercial…"
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {comercialesActivos
                  ?.filter((c) => c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="chip"
                      style={{ textAlign: 'left' }}
                      disabled={procesando === s.id}
                      onClick={() => asignar(s, c.id)}
                    >
                      {c.nombre}
                    </button>
                  ))}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 8 }}
                onClick={() => setAsignandoId(null)}
                disabled={procesando === s.id}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
                onClick={() => descartar(s.id)}
                disabled={procesando === s.id}
              >
                Descartar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setAsignandoId(s.id)} disabled={procesando === s.id}>
                Asignar a alguien
              </button>
            </div>
          )}
          {error && procesando === null && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
        </div>
      ))}
    </div>
  );
}
