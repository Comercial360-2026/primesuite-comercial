import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { useDescargarInforme, BotonDescargarInforme } from '@/hooks/use-descargar-informe';
import { EstadoError } from '@/components/ui/estado-error';

interface PrevisualizacionBorrado {
  num_fotos: number;
  num_audios: number;
  num_notas: number;
  num_hallazgos: number;
  num_oportunidades: number;
  num_proximos_pasos: number;
  rutas_storage: string[] | null;
}

interface VisitaAgenda {
  id: string;
  fecha: string;
  tipo_visita: string | null;
  estado_captura: 'en_curso' | 'consolidada';
  cliente: { id: string; nombre: string } | null;
}

// Rango del día en curso, hora local del dispositivo — suficiente para v1
// (no hay comerciales operando en zonas horarias distintas a la vez).
function rangoDeHoy() {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

export function AgendaDelDia() {
  const navigate = useNavigate();
  const { comercial } = useSesionActual();
  const { inicio, fin } = useMemo(rangoDeHoy, []);
  const queryClient = useQueryClient();

  const queryKey = ['visitas-hoy', comercial?.id, inicio];
  const {
    data: visitas,
    isLoading,
    isError,
    isPaused,
    refetch,
  } = useQuery({
    queryKey,
    enabled: !!comercial,
    queryFn: async (): Promise<VisitaAgenda[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, tipo_visita, estado_captura, cliente:cliente_id(id, nombre)')
        .gte('fecha', inicio)
        .lte('fecha', fin)
        .order('fecha', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VisitaAgenda[];
    },
  });
  // isPaused: TanStack Query pausa la consulta en vez de marcarla como
  // error cuando decide que la red no es fiable (networkMode 'online' por
  // defecto) — sin esto, la pantalla se queda en blanco, ni cargando ni
  // error, el mismo problema de fondo que este punto quería resolver.
  const sinConexion = isPaused && visitas === undefined;
  // reintentar() en vez de refetch() a secas: una consulta "paused" no
  // siempre reacciona a un refetch() manual — resetQueries fuerza un
  // intento realmente nuevo, verificado en pruebas reales de red rota.
  function reintentar() {
    queryClient.resetQueries({ queryKey });
    refetch();
  }

  function abrirVisita(visita: VisitaAgenda) {
    // Si la visita ya está en_curso, se va directa a Visita activa
    // (retomar); si aún no se ha iniciado, primero pasa por el Repaso
    // rápido de cliente, coherente con la arquitectura de navegación.
    if (visita.estado_captura === 'en_curso') {
      navigate(`/visita/${visita.id}`);
    } else if (visita.cliente) {
      navigate(`/clientes/${visita.cliente.id}/repaso?visitaId=${visita.id}`);
    }
  }

  // Borrar una visita creada por error (duplicada, o iniciada sin querer)
  // — antes solo se podía borrar entrando a la ficha del cliente y
  // buscando la visita correcta entre su historial, nada intuitivo ni
  // rápido cuando el error se ve aquí mismo, en Hoy. Mismo patrón de
  // previsualización + confirmación en dos pasos ya usado en la ficha de
  // cliente, reutilizando las mismas funciones RPC.
  const [visitaBorrarId, setVisitaBorrarId] = useState<string | null>(null);
  const [previsualizacion, setPrevisualizacion] = useState<PrevisualizacionBorrado | null>(null);
  const previsualizando = useAccionAsync();
  const borrando = useAccionAsync();
  const { estadoDe, descargar } = useDescargarInforme();

  async function pedirBorrado(visitaId: string) {
    setVisitaBorrarId(visitaId);
    setPrevisualizacion(null);
    await previsualizando.ejecutar(
      async () => {
        const { data, error } = await supabase.rpc('previsualizar_borrado_visita', { p_visita_id: visitaId }).single();
        if (error) throw new Error(error.message);
        return data as PrevisualizacionBorrado;
      },
      { onExito: (data) => setPrevisualizacion(data) }
    );
  }

  function cancelarBorrado() {
    setVisitaBorrarId(null);
    setPrevisualizacion(null);
    previsualizando.limpiarError();
    borrando.limpiarError();
  }

  async function confirmarBorrado() {
    if (!visitaBorrarId) return;
    const rutas = previsualizacion?.rutas_storage ?? [];
    await borrando.ejecutar(
      async () => {
        const { error } = await supabase.rpc('eliminar_visita_completa', { p_visita_id: visitaBorrarId });
        if (error) throw new Error(error.message);
        if (rutas.length) {
          await Promise.all([
            supabase.storage.from('fotos-visita').remove(rutas),
            supabase.storage.from('audios-visita').remove(rutas),
          ]);
        }
      },
      {
        onExito: () => {
          setVisitaBorrarId(null);
          setPrevisualizacion(null);
          queryClient.invalidateQueries({ queryKey });
          queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
        },
      }
    );
  }

  return (
    <div className="screen">
      <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>Hoy</h1>

      {isLoading && <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando agenda…</p>}

      {sinConexion && (
        <EstadoError
          mensaje="Sin conexión. Comprueba tu red e inténtalo de nuevo."
          onReintentar={reintentar}
        />
      )}

      {isError && (
        <EstadoError
          mensaje="No se pudieron cargar las visitas de hoy."
          onReintentar={reintentar}
        />
      )}

      {!isLoading && !isError && !sinConexion && visitas?.length === 0 && (
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>
          No hay visitas agendadas hoy. Puedes iniciar una visita no planificada desde Clientes.
        </p>
      )}

      {visitas?.map((visita) =>
        visitaBorrarId === visita.id ? (
          <div key={visita.id} className="card">
            {previsualizando.cargando || !previsualizacion ? (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Calculando qué se va a borrar…</div>
            ) : (
              <>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
                  Esta visita arrastra: {previsualizacion.num_fotos} foto(s), {previsualizacion.num_audios} audio(s),{' '}
                  {previsualizacion.num_notas} nota(s), {previsualizacion.num_hallazgos} hallazgo(s),{' '}
                  {previsualizacion.num_oportunidades} oportunidad(es) y {previsualizacion.num_proximos_pasos} próximo(s)
                  paso(s). Todo eso se borrará también. No se puede deshacer.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-secondary" onClick={cancelarBorrado} disabled={borrando.cargando}>
                    Cancelar
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ background: 'var(--risk-600)' }}
                    onClick={confirmarBorrado}
                    disabled={borrando.cargando}
                  >
                    {borrando.cargando ? 'Borrando…' : 'Confirmar borrado de la visita completa'}
                  </button>
                </div>
                {borrando.error && <div className="field-error-text" style={{ marginTop: 8 }}>{borrando.error}</div>}
              </>
            )}
          </div>
        ) : (
          <div key={visita.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => abrirVisita(visita)}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                {new Date(visita.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={{ fontSize: 'var(--text-md)', fontWeight: 500, marginTop: 2 }}>
                {visita.cliente?.nombre ?? 'Cliente'}
              </div>
              {visita.tipo_visita && <span className="chip" style={{ marginTop: 6 }}>{visita.tipo_visita}</span>}
              {visita.estado_captura === 'en_curso' && (
                <span className="chip chip--on" style={{ marginLeft: 6, marginTop: 6 }}>
                  en curso
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
              <BotonDescargarInforme estado={estadoDe(visita.id)} onDescargar={() => descargar(visita.id)} compacto />
              <button
                type="button"
                onClick={() => void pedirBorrado(visita.id)}
                style={{ border: 'none', background: 'none', color: 'var(--risk-600)', fontSize: 'var(--text-xs)', cursor: 'pointer', padding: 4 }}
              >
                Borrar
              </button>
            </div>
          </div>
        )
      )}

      <button className="btn btn-secondary" onClick={() => navigate('/clientes')}>
        + Visita no agendada
      </button>
    </div>
  );
}
