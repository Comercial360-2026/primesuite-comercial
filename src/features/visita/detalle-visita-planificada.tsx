import { useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta, fechaLarga, hora } from '@/lib/fechas';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Icono } from '@/components/ui/iconos';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { FilaDato } from '@/components/ui/fila-dato';
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
  franja: string | null;
  objetivo: string | null;
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
  const [franjaNueva, setFranjaNueva] = useState<'' | 'manana' | 'tarde'>('');
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
        .select('id, fecha, hora_definida, franja, objetivo, tipo_visita, estado_captura, cliente:cliente_id(id, nombre)')
        .eq('id', visitaId!)
        .single();
      if (error) throw error;
      const cli = fila.cliente as unknown as { id: string; nombre: string } | null;
      return {
        id: fila.id,
        fecha: fila.fecha,
        hora_definida: fila.hora_definida,
        franja: fila.franja,
        objetivo: fila.objetivo,
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
            franja: horaNueva ? null : franjaNueva || null,
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
          setFranjaNueva('');
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
  const franja = data ? franjaDe(data.fecha, data.hora_definida, data.franja) : null;
  const horaTexto =
    data && data.hora_definida
      ? hora(fechaVisita!)
      : null;

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Visita planificada" />

      {isLoading && <EstadoLista estado="cargando" />}
      {(isError || isPaused) && (
        <EstadoLista
          estado={isPaused ? 'sin-conexion' : 'error'}
          mensaje="No se pudo cargar la visita planificada."
          onReintentar={() => refetch()}
        />
      )}

      {data && (
        <>
          <div className="lista-agrupada">
            <SeccionLista>
              <FilaNavegable
                icono="clientes"
                titulo={data.cliente_nombre}
                to={`/clientes/${data.cliente_id}`}
              />
              <FilaDato
                etiqueta="Fecha"
                valor={fechaLarga(fechaVisita!)}
              />
              <FilaDato
                etiqueta="Cuándo"
                valor={
                  horaTexto
                    ? `${horaTexto} (${etiquetaFranja(franja!)})`
                    : franja === 'sin_hora'
                      ? 'sin hora fija'
                      : `${etiquetaFranja(franja!)} (sin hora fija)`
                }
              />
              <FilaDato etiqueta="Objetivo" valor={data.objetivo ?? 'sin objetivo definido'} />
            </SeccionLista>
            {esPasada && (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--warning-600)', fontWeight: 500, paddingInline: 'var(--fila-pad-x)' }}>
                Atrasada — esta visita estaba planificada para una fecha que ya pasó.
              </div>
            )}
            {esHoy && (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>Es hoy.</div>
            )}
          </div>

          {/* Empezar */}
          {confirmando === 'empezar' ? (
            <div className="card" style={{ borderColor: 'var(--warning-600)' }}>
              <div style={{ fontSize: 'var(--text-sm)' }}>
                Esta visita es para el{' '}
                {fechaCorta(fechaVisita!)}. ¿Empezarla ahora
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
              Iniciar visita
              <Icono nombre="chevron" size={18} />
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
              {!horaNueva && (
                <>
                  <div className="label">sin hora concreta, ¿cuándo?</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([
                      ['manana', 'Mañana'],
                      ['tarde', 'Tarde'],
                      ['', 'Sin hora fija'],
                    ] as const).map(([val, txt]) => (
                      <button
                        key={val || 'sin'}
                        type="button"
                        className={`chip${franjaNueva === val ? ' chip--on' : ''}`}
                        onClick={() => setFranjaNueva(val)}
                      >
                        {txt}
                      </button>
                    ))}
                  </div>
                </>
              )}
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
                setFranjaNueva(
                  data.franja === 'manana' || data.franja === 'tarde' ? data.franja : ''
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
                {fechaCorta(fechaVisita!)}. No se puede deshacer.
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
