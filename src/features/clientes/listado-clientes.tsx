import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaDiaMes } from '@/lib/fechas';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { EtiquetaSemaforo } from '@/components/ui/etiqueta-semaforo';
import { CabeceraSeccion } from '@/components/ui/cabecera-seccion';
import { Icono } from '@/components/ui/iconos';

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

  // Responsable (Fase 6b) y creador de cada cliente — no viven en
  // vw_semaforo_cliente, se traen aparte de `cliente`. "Solo míos" filtra
  // por RESPONSABLE (la cartera); si además NO lo creé yo, es un cliente
  // "heredado" (traspasado a mí) y se marca. Cualquiera puede seguir viendo
  // y trabajando el cliente de otro.
  const idsClientes = clientes?.map((c) => c.cliente_id) ?? [];
  const { data: meta } = useQuery({
    queryKey: ['meta-clientes', idsClientes.join(',')],
    enabled: idsClientes.length > 0,
    queryFn: async (): Promise<Record<string, { creado_por: string | null; responsable_id: string | null }>> => {
      const { data, error } = await supabase
        .from('cliente')
        .select('id, creado_por, responsable_id')
        .in('id', idsClientes);
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((c) => [c.id, { creado_por: c.creado_por, responsable_id: c.responsable_id }])
      );
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
    (c) => !soloMios || meta?.[c.cliente_id]?.responsable_id === comercial?.id
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
      <CabeceraSeccion titulo="Clientes" icono="clientes" ayuda="clientes" />

      <input
        className="field"
        placeholder="buscar cliente…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      {esDireccionComercial && (
        <div style={{ display: 'flex', gap: 6 }}>
          {/* El seleccionado por defecto (Solo míos) va primero. */}
          <button
            type="button"
            className={`chip${soloMios ? ' chip--on' : ''}`}
            onClick={() => setSoloMios(true)}
          >
            Solo míos
          </button>
          <button
            type="button"
            className={`chip${!soloMios ? ' chip--on' : ''}`}
            onClick={() => setSoloMios(false)}
          >
            Todos
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
              const m = meta?.[c.cliente_id];
              const respId = m?.responsable_id ?? null;
              const creadorId = m?.creado_por ?? null;
              // "Heredado": es de mi cartera (responsable) pero NO lo creé yo
              // → me lo traspasaron. Marca azul para no confundirlo con los
              // míos de siempre.
              const heredado = respId === comercial?.id && !!creadorId && creadorId !== comercial?.id;
              const sinResponsable = !soloMios && !respId;
              const subtitulo =
                [
                  // En "Todos" (Dirección): quién lleva la cuenta, o el aviso.
                  !soloMios ? (respId ? nombresComerciales?.[respId] ?? '…' : '⚠ Sin responsable') : null,
                  heredado ? `antes de ${nombresComerciales?.[creadorId] ?? '…'}` : null,
                  c.ultima_visita ? `última visita ${fechaDiaMes(c.ultima_visita)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined;
              return (
                <FilaNavegable
                  key={c.cliente_id}
                  titulo={
                    heredado ? (
                      <>
                        {c.cliente_nombre} <span className="info-tag">Heredado</span>
                      </>
                    ) : (
                      c.cliente_nombre
                    )
                  }
                  subtitulo={subtitulo}
                  // Cliente frío ("Sin visitar") o sin responsable → barra de
                  // atención; lo sano (verde/amarillo) no distrae.
                  tono={sinResponsable ? 'aviso' : c.semaforo === 'rojo' ? 'alerta' : 'neutral'}
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
        <Icono nombre="mas" size={18} />
        Nuevo cliente
      </button>
    </div>
  );
}
