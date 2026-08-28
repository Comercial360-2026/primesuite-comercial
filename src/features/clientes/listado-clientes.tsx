import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { EstadoError } from '@/components/ui/estado-error';

interface ClienteConSemaforo {
  cliente_id: string;
  cliente_nombre: string;
  semaforo: 'verde' | 'amarillo' | 'rojo';
  ultima_visita: string | null;
}

// Lee directamente de vw_semaforo_cliente (ya cerrada en el modelo físico)
// en vez de recalcular la regla en el cliente — una sola fuente de verdad
// para "verde/amarillo/rojo", coherente con el resto del proyecto.
export function ListadoClientes() {
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const queryClient = useQueryClient();

  const queryKey = ['listado-clientes', busqueda];
  const {
    data: clientes,
    isLoading,
    isError,
    isPaused,
    refetch,
  } = useQuery({
    queryKey,
    // networkMode 'online' (por defecto): si TanStack Query decide que la
    // red no es fiable, la consulta queda "paused" en vez de pasar a
    // isError — sin datos, sin isLoading, sin isError. Sin este caso
    // aparte, la pantalla se queda completamente en blanco, el mismo
    // problema de fondo que el punto 1 del encargo quería resolver, en
    // un caso que ninguna de las tres condiciones originales cubría.
    queryFn: async (): Promise<ClienteConSemaforo[]> => {
      let query = supabase
        .from('vw_semaforo_cliente')
        .select('cliente_id, cliente_nombre, semaforo, ultima_visita')
        .order('cliente_nombre', { ascending: true });

      if (busqueda.trim()) {
        query = query.ilike('cliente_nombre', `%${busqueda.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ClienteConSemaforo[];
    },
  });
  const sinConexion = isPaused && clientes === undefined;
  // reintentar() en vez de refetch() a secas: una consulta "paused" no
  // siempre reacciona a un refetch() manual (depende del gestor de
  // conexión interno de la librería) — resetQueries fuerza un intento
  // realmente nuevo, igual que si la clave de consulta cambiase.
  function reintentar() {
    queryClient.resetQueries({ queryKey });
    refetch();
  }

  return (
    <div className="screen">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>Clientes</h1>
      </div>

      <input
        className="field"
        placeholder="buscar cliente…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      {isLoading && <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando…</p>}

      {sinConexion && (
        <EstadoError
          mensaje="Sin conexión. Comprueba tu red e inténtalo de nuevo."
          onReintentar={reintentar}
        />
      )}

      {isError && (
        <EstadoError
          mensaje="No se pudo cargar el listado de clientes."
          onReintentar={reintentar}
        />
      )}

      {clientes?.map((c) => (
        <button
          key={c.cliente_id}
          className="card"
          style={{ textAlign: 'left', width: '100%', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          onClick={() => navigate(`/clientes/${c.cliente_id}`)}
        >
          <div>
            <div style={{ fontSize: 'var(--text-md)', fontWeight: 500 }}>{c.cliente_nombre}</div>
            {c.ultima_visita && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                última visita {new Date(c.ultima_visita).toLocaleDateString('es-ES')}
              </div>
            )}
          </div>
          <span className={`chip chip--${c.semaforo}`}>{c.semaforo}</span>
        </button>
      ))}

      {!isLoading && !isError && !sinConexion && clientes?.length === 0 && (
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Sin resultados.</p>
      )}

      <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={() => navigate('/clientes/nuevo')}>
        + nuevo cliente
      </button>
    </div>
  );
}
