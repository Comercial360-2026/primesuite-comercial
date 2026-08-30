import { useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { EstadoError } from '@/components/ui/estado-error';
import { franjaDe, etiquetaFranja } from '@/lib/franja-visita';

// Gestión de una visita planificada (estado 'agendada') para otro día:
// verla, reprogramarla, cancelarla o empezarla. Es a donde llevan las
// listas de "próximas" y "atrasadas" de Hoy y las filas 'agendada' del
// historial de la ficha. NO es el repaso: al repaso solo se va cuando de
// verdad vas a hacer la visita (hoy o improvisada), y allí el botón grande
// "Iniciar visita" tiene sentido; aquí, en una visita para dentro de una
// semana, ese botón sería una trampa.

interface VisitaPlan {
  id: string;
  fecha: string;
  hora_definida: boolean;
  tipo_visita: string | null;
  estado_captura: string;
  cliente_id: string;
  cliente_nombre: string;
}

function esMismoDia(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

// YYYY-MM-DD en hora local (para prefijar un <input type="date">).
function fechaLocalISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CLAVES_LISTAS = [
  ['visitas-hoy'],
  ['visitas-proximas'],
  ['visitas-atrasadas'],
  ['num-grupos-duplicados'],
];

export function DetalleVisitaPlanificada() {
  const { visitaId } = useParams<{ visitaId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [reprogramando, setReprogramando] = useState(false);
  const [fechaNueva, setFechaNueva] = useState('');
  const [horaNueva, setHoraNueva] = useState('');
  const [confirmando, setConfirmando] = useState<null | 'cancelar' | 'empezar'>(null);
  const reprogramar = useAccionAsync();
  const cancelar = useAccionAsync();
  const hoyISO = new Date().toISOString().slice(0, 10);

  const queryKey = ['visita-planificada', visitaId];
  const { data, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey,
    enabled: !!visitaId,
    queryFn: async (): Promise<VisitaPlan> => {
      const { data: fila, error } = await supabase
        .from('visita')
        .select('id, fecha, hora_definida, tipo_visita, estado_captura, cliente:cliente_id(id, nombre)')
        .eq('id', visitaId!)
        .single();
      if (error) throw error;
      const cli = fila.cliente as unknown as { id: string; nombre: string } | null;
      return {
        id: fila.id,
        fecha: fila.fecha,
        hora_definida: fila.hora_definida,
        tipo_visita: fila.tipo_visita,
        estado_captura: fila.estado_captura,
        cliente_id: cli?.id ?? '',
        cliente_nombre: cli?.nombre ?? 'cliente',
      };
    },
  });

  function invalidarListas() {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ['historial-visitas', data?.cliente_id] });
    for (const k of CLAVES_LISTAS) queryClient.invalidateQueries({ queryKey: k });
  }

  async function guardarReprograma() {
    if (!fechaNueva) return;
    await reprogramar.ejecutar(
      async () => {
        const { error } = await supabase
          .from('visita')
          .update({
            fecha: new Date(`${fechaNueva}T${horaNueva || '09:00'}:00`).toISOString(),
            hora_definida: !!horaNueva,
          })
          .eq('id', visitaId!)
          .eq('estado_captura', 'agendada');
        if (error) throw new Error(error.message);
      },
      {
        onExito: () => {
          setReprogramando(false);
          setFechaNueva('');
          setHoraNueva('');
          invalidarListas();
          refetch();
        },
      }
    );
  }

  async function confirmarCancelar() {
    await cancelar.ejecutar(
      async () => {
        const { error } = await supabase.rpc('eliminar_visita_completa', { p_visita_id: visitaId! });
        if (error) throw new Error(error.message);
      },
      {
        onExito: () => {
          invalidarListas();
          navigate(-1);
        },
      }
    );
  }

  function empezar() {
    if (!data) return;
    navigate(`/clientes/${data.cliente_id}/repaso?visitaId=${data.id}`);
  }

  // Si ya no está planificada (alguien la empezó o cerró desde otro sitio),
  // esta no es la pantalla — se redirige a donde corresponde.
  if (data?.estado_captura === 'en_curso') return <Navigate to={`/visita/${data.id}`} replace />;
  if (data?.estado_captura === 'consolidada') return <Navigate to={`/visita/${data.id}/detalle`} replace />;

  const fechaVisita = data ? new Date(data.fecha) : null;
  const esHoy = fechaVisita ? esMismoDia(fechaVisita, new Date()) : false;
  const esPasada = fechaVisita ? fechaVisita.getTime() < new Date().setHours(0, 0, 0, 0) : false;
  const franja = data ? franjaDe(data.fecha, data.hora_definida) : null;
  const horaTexto =
    data && data.hora_definida
      ? fechaVisita!.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : null;

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>
          ←
        </button>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>Visita planificada</h1>
      </div>

      {isLoading && <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando…</p>}
      {(isError || isPaused) && (
        <EstadoError mensaje="No se pudo cargar la visita planificada." onReintentar={() => refetch()} />
      )}

      {data && (
        <>
          <div className="card">
            <div className="label" style={{ marginTop: 0 }}>cliente</div>
            <div
              style={{ fontSize: 'var(--text-lg)', fontWeight: 500, cursor: 'pointer' }}
              onClick={() => navigate(`/clientes/${data.cliente_id}`)}
            >
              {data.cliente_nombre} ›
            </div>

            <div className="label">fecha</div>
            <div style={{ fontSize: 'var(--text-base)' }}>
              {fechaVisita!.toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
              {horaTexto ? `${horaTexto} (${etiquetaFranja(franja!)})` : 'sin hora fija'}
            </div>
            {esPasada && (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--warning-600)', fontWeight: 500, marginTop: 4 }}>
                Atrasada — esta visita estaba planificada para una fecha que ya pasó.
              </div>
            )}
            {esHoy && (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', marginTop: 4 }}>Es hoy.</div>
            )}

            <div className="label">tipo</div>
            <div style={{ fontSize: 'var(--text-base)' }}>{data.tipo_visita ?? 'sin especificar'}</div>
          </div>

          {/* Empezar */}
          {confirmando === 'empezar' ? (
            <div className="card" style={{ borderColor: 'var(--warning-600)' }}>
              <div style={{ fontSize: 'var(--text-sm)' }}>
                Esta visita es para el{' '}
                {fechaVisita!.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}. ¿Empezarla ahora
                igualmente?
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-secondary" onClick={() => setConfirmando(null)}>
                  No
                </button>
                <button className="btn btn-primary" onClick={empezar}>
                  Sí, empezar ahora
                </button>
              </div>
            </div>
          ) : esHoy ? (
            <button className="btn btn-primary" onClick={empezar}>
              Iniciar visita →
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={() => setConfirmando('empezar')}>
              Empezar ahora de todos modos
            </button>
          )}

          {/* Reprogramar */}
          {reprogramando ? (
            <div className="card">
              <div className="label" style={{ marginTop: 0 }}>nueva fecha</div>
              <input
                type="date"
                className="field"
                min={hoyISO}
                value={fechaNueva}
                onChange={(e) => setFechaNueva(e.target.value)}
              />
              <div className="label">hora (opcional)</div>
              <input
                type="time"
                className="field"
                value={horaNueva}
                onChange={(e) => setHoraNueva(e.target.value)}
              />
              {reprogramar.error && <div className="field-error-text" style={{ marginTop: 8 }}>{reprogramar.error}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  className="btn btn-secondary"
                  disabled={reprogramar.cargando}
                  onClick={() => {
                    setReprogramando(false);
                    reprogramar.limpiarError();
                  }}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  disabled={reprogramar.cargando || !fechaNueva}
                  onClick={guardarReprograma}
                >
                  {reprogramar.cargando ? 'Guardando…' : 'Guardar fecha'}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setConfirmando(null);
                // Prefijar con la fecha/hora actuales para que reprogramar sea
                // un ajuste, no volver a empezar de cero.
                setFechaNueva(fechaLocalISO(new Date(data.fecha)));
                setHoraNueva(
                  data.hora_definida ? new Date(data.fecha).toTimeString().slice(0, 5) : ''
                );
                setReprogramando(true);
              }}
            >
              Reprogramar
            </button>
          )}

          {/* Cancelar */}
          {confirmando === 'cancelar' ? (
            <div className="card" style={{ borderColor: 'var(--risk-600)' }}>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
                Se eliminará la visita planificada a {data.cliente_nombre} del{' '}
                {fechaVisita!.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}. No se puede deshacer.
              </div>
              {cancelar.error && <div className="field-error-text" style={{ marginTop: 8 }}>{cancelar.error}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-secondary" disabled={cancelar.cargando} onClick={() => setConfirmando(null)}>
                  No, dejarla
                </button>
                <button
                  className="btn btn-primary"
                  style={{ background: 'var(--risk-600)' }}
                  disabled={cancelar.cargando}
                  onClick={confirmarCancelar}
                >
                  {cancelar.cargando ? 'Cancelando…' : 'Sí, cancelar la visita'}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-secondary"
              style={{ color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
              onClick={() => {
                setReprogramando(false);
                setConfirmando('cancelar');
              }}
            >
              Cancelar visita planificada
            </button>
          )}
        </>
      )}
    </div>
  );
}
