import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';

interface ParticipantesModalProps {
  visitaId: string;
  onCerrar: () => void;
}

interface Participante {
  comercial_id: string;
  rol: string;
  nombre: string;
}

// Antes de esto, el modelo de "varios comerciales en la misma visita"
// existía entero en la base de datos (tabla visita_participante, política
// RLS ya cerrada, un responsable creado siempre al iniciar la visita) pero
// no había ningún sitio en la app para materializarlo — confirmado el
// 29/8/2026 buscando en todo el código. Esta es esa pieza.
//
// Solo Dirección Comercial puede añadir (decisión de producto, 29/8/2026):
// para que un comercial normal pudiera elegir a quién añadir, primero
// tendría que poder VER la lista de los demás comerciales, y la política
// RLS de `comercial` se lo impide a ese rol — no tiene sentido construir
// un selector que no puede leer sus propias opciones. Cualquiera puede
// ver quién participa ya, eso no depende de esa política.
export function ParticipantesModal({ visitaId, onCerrar }: ParticipantesModalProps) {
  const { comercial } = useSesionActual();
  const esDireccionComercial = comercial?.rol === 'direccion_comercial';
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [añadiendoId, setAñadiendoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pidiendoAyuda, setPidiendoAyuda] = useState(false);
  const [notaAyuda, setNotaAyuda] = useState('');
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
  const [solicitudEnviada, setSolicitudEnviada] = useState(false);

  const { data: participantes } = useQuery({
    queryKey: ['participantes-visita', visitaId],
    queryFn: async (): Promise<Participante[]> => {
      const { data, error: err } = await supabase
        .from('visita_participante')
        .select('comercial_id, rol, comercial:comercial_id(nombre)')
        .eq('visita_id', visitaId);
      if (err) throw err;
      return (data ?? []).map((p) => ({
        comercial_id: p.comercial_id,
        rol: p.rol,
        nombre: (p.comercial as unknown as { nombre: string } | null)?.nombre ?? '…',
      }));
    },
  });

  // Solo se pide si hace falta (Dirección Comercial, para elegir a quién
  // añadir) — un comercial normal ni lo intenta, la política se lo negaría.
  const { data: comercialesActivos } = useQuery({
    queryKey: ['comerciales-activos'],
    enabled: esDireccionComercial,
    queryFn: async (): Promise<{ id: string; nombre: string }[]> => {
      const { data, error: err } = await supabase.from('comercial').select('id, nombre').eq('activo', true).order('nombre');
      if (err) throw err;
      return data ?? [];
    },
  });

  const idsYaParticipantes = new Set(participantes?.map((p) => p.comercial_id));
  const candidatos = comercialesActivos?.filter(
    (c) => !idsYaParticipantes.has(c.id) && c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  );

  // Para no dejar que alguien mande la misma solicitud varias veces sin
  // darse cuenta — si ya tiene una pendiente para esta visita, se avisa en
  // vez de mostrar el formulario otra vez.
  const { data: solicitudPropia } = useQuery({
    queryKey: ['solicitud-propia-visita', visitaId, comercial?.id],
    enabled: !esDireccionComercial && !!comercial,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('solicitud_reasignacion')
        .select('id, estado')
        .eq('visita_id', visitaId)
        .eq('comercial_solicitante_id', comercial!.id)
        .eq('estado', 'pendiente')
        .maybeSingle();
      if (err) throw err;
      return data;
    },
  });

  async function pedirAyuda() {
    if (!comercial) return;
    setEnviandoSolicitud(true);
    setError(null);
    const { error: err } = await supabase
      .from('solicitud_reasignacion')
      .insert({ visita_id: visitaId, comercial_solicitante_id: comercial.id, nota: notaAyuda.trim() || null });
    setEnviandoSolicitud(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSolicitudEnviada(true);
    setPidiendoAyuda(false);
    setNotaAyuda('');
    queryClient.invalidateQueries({ queryKey: ['solicitud-propia-visita', visitaId, comercial.id] });
  }

  async function añadir(comercialId: string) {
    setAñadiendoId(comercialId);
    setError(null);
    const { error: err } = await supabase
      .from('visita_participante')
      .insert({ visita_id: visitaId, comercial_id: comercialId, rol: 'participante' });
    setAñadiendoId(null);
    if (err) {
      setError(err.message);
      return;
    }
    setBusqueda('');
    queryClient.invalidateQueries({ queryKey: ['participantes-visita', visitaId] });
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'var(--surface-0)', display: 'flex', alignItems: 'flex-end', zIndex: 10 }}
      onClick={onCerrar}
    >
      <div
        className="card"
        style={{ width: '100%', boxSizing: 'border-box', margin: 'var(--space-5)', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 500 }}>Participantes</div>
          <button
            type="button"
            onClick={onCerrar}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {participantes?.map((p) => (
            <div key={p.comercial_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-sm)' }}>{p.nombre}</span>
              <span className="chip" style={{ fontSize: 11 }}>{p.rol}</span>
            </div>
          ))}
          {!participantes?.length && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Cargando…</span>
          )}
        </div>

        {esDireccionComercial ? (
          <div style={{ marginTop: 12 }}>
            <input
              className="field"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="buscar comercial para añadir…"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {candidatos?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="chip"
                  style={{ textAlign: 'left', justifyContent: 'space-between', display: 'flex' }}
                  disabled={añadiendoId === c.id}
                  onClick={() => añadir(c.id)}
                >
                  <span>{c.nombre}</span>
                  <span>{añadiendoId === c.id ? 'Añadiendo…' : '+ Añadir'}</span>
                </button>
              ))}
              {busqueda.trim() && candidatos?.length === 0 && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>Sin coincidencias.</span>
              )}
            </div>
          </div>
        ) : solicitudPropia || solicitudEnviada ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 12 }}>
            Ya has pedido ayuda con esta visita — Dirección Comercial lo verá en su lista de pendientes.
          </div>
        ) : pidiendoAyuda ? (
          <div style={{ marginTop: 12 }}>
            <input
              className="field"
              autoFocus
              value={notaAyuda}
              onChange={(e) => setNotaAyuda(e.target.value)}
              placeholder="por qué necesitas ayuda (opcional)"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPidiendoAyuda(false)} disabled={enviandoSolicitud}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={pedirAyuda} disabled={enviandoSolicitud}>
                {enviandoSolicitud ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setPidiendoAyuda(true)}>
            Pedir ayuda con esta visita
          </button>
        )}

        {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
