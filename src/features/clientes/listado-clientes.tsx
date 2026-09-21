import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { desde } from '@/lib/volver-a';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaDiaMes } from '@/lib/fechas';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { EtiquetaSemaforo } from '@/components/ui/etiqueta-semaforo';
import { CabeceraSeccion } from '@/components/ui/cabecera-seccion';
import { Segmentado } from '@/components/ui/segmentado';
import { useBuscador, BotonBuscar, CampoBuscar } from '@/components/ui/buscador';
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
  const location = useLocation();
  const { comercial } = useSesionActual();
  const [busqueda, setBusqueda] = useState('');
  const buscador = useBuscador(!!busqueda);
  // Decisión de producto (29/8/2026, ajustada 2026-09-05): un comercial
  // normal ve por defecto solo su cartera — el interruptor "Todos" es
  // exclusivo de Dirección. PERO al escribir en el buscador cualquiera
  // encuentra cualquier cliente (cubrir a un compañero, no crear
  // duplicados). No es una restricción de permisos (la BD lo permite a
  // todos), es qué se muestra por defecto en esta pantalla.
  const esDireccionComercial = comercial?.rol === 'direccion_comercial';
  // Filtro en la URL (?vista=todos), no solo en memoria: si viviera en un
  // useState a secas, volver desde la ficha de un cliente remonta esta
  // pantalla y el filtro nace siempre en "mios" — igual que ya se
  // resolvió en mi-espacio.tsx (?vista=equipo), aquí faltaba aplicarlo.
  const [searchParams, setSearchParams] = useSearchParams();
  const [vistaDireccion, setVistaDireccionState] = useState<'mios' | 'todos'>(
    esDireccionComercial && searchParams.get('vista') === 'todos' ? 'todos' : 'mios'
  );
  // El rol puede resolverse después del primer render (arranque en frío):
  // si venías con ?vista=todos, respétalo en cuanto sepamos que sí diriges.
  useEffect(() => {
    if (esDireccionComercial && searchParams.get('vista') === 'todos') setVistaDireccionState('todos');
    else if (!esDireccionComercial) setVistaDireccionState('mios');
  }, [esDireccionComercial, searchParams]);

  function cambiarVistaDireccion(v: 'mios' | 'todos') {
    setVistaDireccionState(v);
    setSearchParams(v === 'todos' ? { vista: 'todos' } : {}, { replace: true });
  }

  const soloMios = esDireccionComercial ? vistaDireccion === 'mios' : true;
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
  const { data: meta, isLoading: metaCargando } = useQuery({
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

  // Al buscar, cualquiera encuentra CUALQUIER cliente (cubrir a un
  // compañero, comprobar antes de dar de alta un duplicado) — un buscador
  // que esconde coincidencias confunde. Sin búsqueda, un comercial normal
  // ve solo su cartera y Dirección respeta su interruptor "Solo míos".
  const buscando = !!busqueda.trim();
  const restringirACartera = soloMios && !buscando;
  const clientesFiltrados = clientes?.filter(
    (c) => !restringirACartera || meta?.[c.cliente_id]?.responsable_id === comercial?.id
  );
  // Mientras "meta" sigue en vuelo, el filtro de arriba da longitud 0 por un
  // `undefined === id` — sin esto, cualquier comercial veía un parpadeo real
  // de "Todavía no tienes clientes" antes de que apareciera su cartera.
  const cargandoDeVerdad = isLoading || (restringirACartera && idsClientes.length > 0 && metaCargando);

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
      <CabeceraSeccion
        titulo="Clientes"
        icono="clientes"
        ayuda="clientes"
        derecha={
          <>
            {!buscador.abierto && <BotonBuscar etiqueta="buscar cliente…" onClick={buscador.abrir} />}
            <button
              type="button"
              className="boton-icono"
              aria-label="Nuevo cliente"
              title="Nuevo cliente"
              onClick={() => navigate('/clientes/nuevo')}
            >
              <Icono nombre="mas" size={18} />
            </button>
          </>
        }
      />

      {buscador.abierto && (
        <CampoBuscar
          value={busqueda}
          onChange={setBusqueda}
          placeholder="buscar cliente…"
          onCerrar={() => {
            setBusqueda('');
            buscador.cerrar();
          }}
        />
      )}

      {esDireccionComercial && (
        <Segmentado
          opciones={
            [
              { valor: 'mios', etiqueta: 'Solo míos' },
              { valor: 'todos', etiqueta: 'Todos' },
            ] as const
          }
          valor={vistaDireccion}
          onCambio={cambiarVistaDireccion}
        />
      )}

      {!!clientesFiltrados?.length && (
        <div className="contador">
          {clientesFiltrados.length} {clientesFiltrados.length === 1 ? 'cliente' : 'clientes'}
        </div>
      )}

      <div className="screen__scroll">
      {cargandoDeVerdad && <EstadoLista estado="cargando" />}

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
                  !soloMios ? (respId ? nombresComerciales?.[respId] ?? '…' : 'Sin responsable') : null,
                  heredado ? `antes de ${nombresComerciales?.[creadorId] ?? '…'}` : null,
                  c.ultima_visita ? `última visita ${fechaDiaMes(c.ultima_visita)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined;
              return (
                <FilaNavegable
                  key={c.cliente_id}
                  avatar={c.cliente_nombre}
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
                  state={desde(location)}
                />
              );
            })}
          </SeccionLista>
        </div>
      )}

      {!cargandoDeVerdad && !isError && !sinConexion && clientesFiltrados?.length === 0 && (
        <EstadoLista
          estado="vacio"
          mensaje={
            buscando
              ? 'Sin resultados.'
              : restringirACartera
                ? 'Todavía no tienes clientes en tu cartera. Crea uno con «+», o usa el buscador para encontrar cualquier cliente.'
                : 'No hay clientes.'
          }
        />
      )}
      </div>
    </div>
  );
}
