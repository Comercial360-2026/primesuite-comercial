import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { EtiquetaSemaforo } from '@/components/ui/etiqueta-semaforo';
import { CabeceraSeccion } from '@/components/ui/cabecera-seccion';

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
  const { comercial } = useSesionActual();
  const [busqueda, setBusqueda] = useState('');
  // Decisión de producto (29/8/2026): un comercial normal ve siempre solo
  // lo suyo, sin posibilidad de cambiarlo — el interruptor "Todos" es
  // exclusivo de Dirección Comercial. No es una restricción de permisos
  // (a nivel de base de datos sigue siendo visible para todos, igual que
  // siempre), es una decisión de qué mostrar en esta pantalla en concreto.
  const esDireccionComercial = comercial?.rol === 'direccion_comercial';
  const [soloMiosElegido, setSoloMios] = useState(true);
  const soloMios = esDireccionComercial ? soloMiosElegido : true;
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

  // El "quién lo creó" no vive en vw_semaforo_cliente (ni en la vista de la
  // que depende, vw_cliente_resuelto) — se trae aparte de `cliente` y se
  // cruza aquí, en vez de tocar esas vistas SQL ya cerradas y usadas en
  // más sitios. Todo comercial ve todos los clientes por diseño (no hay
  // "cartera" en el modelo, confirmado el 24/8); esto es solo un filtro
  // visual para encontrar los propios más rápido — cualquiera puede seguir
  // viendo y trabajando el cliente de otro si hace falta.
  const idsClientes = clientes?.map((c) => c.cliente_id) ?? [];
  const { data: autores } = useQuery({
    queryKey: ['autores-clientes', idsClientes.join(',')],
    enabled: idsClientes.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from('cliente').select('id, creado_por').in('id', idsClientes);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((c) => [c.id, c.creado_por as string]));
    },
  });

  const { data: nombresComerciales } = useQuery({
    queryKey: ['nombres-comerciales'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from('comercial').select('id, nombre');
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((c) => [c.id, c.nombre]));
    },
  });

  const clientesFiltrados = clientes?.filter(
    (c) => !soloMios || autores?.[c.cliente_id] === comercial?.id
  );

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
    <div className="screen screen--split">
      <CabeceraSeccion titulo="Clientes" icono="clientes" />

      <input
        className="field"
        placeholder="buscar cliente…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      {esDireccionComercial && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`chip${!soloMios ? ' chip--on' : ''}`}
            onClick={() => setSoloMios(false)}
          >
            Todos
          </button>
          <button
            type="button"
            className={`chip${soloMios ? ' chip--on' : ''}`}
            onClick={() => setSoloMios(true)}
          >
            Solo míos
          </button>
        </div>
      )}

      <div className="screen__scroll">
      {isLoading && <EstadoLista estado="cargando" />}

      {sinConexion && <EstadoLista estado="sin-conexion" onReintentar={reintentar} />}

      {isError && (
        <EstadoLista
          estado="error"
          mensaje="No se pudo cargar el listado de clientes."
          onReintentar={reintentar}
        />
      )}

      {!!clientesFiltrados?.length && (
        <div className="lista-agrupada">
          <SeccionLista>
            {clientesFiltrados.map((c) => {
              const autorId = autores?.[c.cliente_id];
              const esMio = autorId === comercial?.id;
              const subtitulo =
                [
                  c.ultima_visita &&
                    `última visita ${new Date(c.ultima_visita).toLocaleDateString('es-ES')}`,
                  !esMio && autorId && `de ${nombresComerciales?.[autorId] ?? '…'}`,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined;
              return (
                <FilaNavegable
                  key={c.cliente_id}
                  titulo={c.cliente_nombre}
                  subtitulo={subtitulo}
                  valor={<EtiquetaSemaforo valor={c.semaforo} />}
                  to={`/clientes/${c.cliente_id}`}
                />
              );
            })}
          </SeccionLista>
        </div>
      )}

      {!isLoading && !isError && !sinConexion && clientesFiltrados?.length === 0 && (
        <EstadoLista estado="vacio" mensaje="Sin resultados." />
      )}
      </div>

      <button className="btn btn-primary" onClick={() => navigate('/clientes/nuevo')}>
        + Nuevo cliente
      </button>
    </div>
  );
}
