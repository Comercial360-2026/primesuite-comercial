import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

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

  const { data: clientes, isLoading } = useQuery({
    queryKey: ['listado-clientes', busqueda],
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

      {!isLoading && clientes?.length === 0 && (
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Sin resultados.</p>
      )}

      <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={() => navigate('/clientes/nuevo')}>
        + nuevo cliente
      </button>
    </div>
  );
}
