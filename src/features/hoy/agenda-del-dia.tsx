import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { EstadoError } from '@/components/ui/estado-error';

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

      {visitas?.map((visita) => (
        <button
          key={visita.id}
          className="card"
          style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}
          onClick={() => abrirVisita(visita)}
        >
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
        </button>
      ))}

      <button className="btn btn-secondary" onClick={() => navigate('/clientes')}>
        + visita no agendada
      </button>
    </div>
  );
}
