import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { FilaAccion, type AccionFila } from '@/components/ui/fila-accion';
import { EstadoLista } from '@/components/ui/estado-lista';

interface ProximoPaso {
  id: string;
  descripcion: string;
  fecha_objetivo: string | null;
  estado: string;
  oportunidad_id: string | null;
  visita: { cliente: { nombre: string } | null } | null;
}

// NOTA DE ALCANCE: hoy no existe ningún botón en el flujo crítico que cree
// un proximo_paso — la entidad y esta pantalla existen, pero la creación
// solo es posible vía SQL/REST directo por ahora. Igual que Hallazgo, es
// una pieza del modelo sin flujo de creación en UI todavía.
export function MisProximosPasos() {
  const navigate = useNavigate();
  const { comercial } = useSesionActual();
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<'pendiente' | 'completado'>('pendiente');
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  const queryKey = ['mis-proximos-pasos', comercial?.id, filtro];
  const {
    data: pasos,
    isLoading,
    isError,
    isPaused,
    refetch,
  } = useQuery({
    queryKey,
    enabled: !!comercial,
    queryFn: async (): Promise<ProximoPaso[]> => {
      const { data, error } = await supabase
        .from('proximo_paso')
        .select('id, descripcion, fecha_objetivo, estado, oportunidad_id, visita:visita_id(cliente:cliente_id(nombre))')
        .eq('comercial_responsable_id', comercial!.id)
        .eq('estado', filtro)
        .order('fecha_objetivo', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProximoPaso[];
    },
  });
  // isPaused: mismo hueco corregido hoy en el resto de pantallas —
  // TanStack Query pausa la consulta en vez de marcarla como error cuando
  // decide que la red no es fiable, y sin este caso la pantalla se queda
  // en blanco. También aplica aquí, aunque no estaba en la lista original
  // del encargo — se detectó al revisar este fichero por otro motivo.
  const sinConexion = isPaused && pasos === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey });
    refetch();
  }

  async function marcarCompletado(id: string) {
    // Protección contra doble pulsación: si ya se está guardando esta
    // fila, ignora el segundo clic en vez de disparar dos UPDATE.
    if (guardandoId) return;
    setGuardandoId(id);
    setErrorGuardado(null);
    const { error, count } = await supabase
      .from('proximo_paso')
      .update({ estado: 'completado' }, { count: 'exact' })
      .eq('id', id);
    setGuardandoId(null);
    // count 0 sin error explícito es el mismo patrón de guardado
    // silenciosamente fallido ya detectado y corregido en el resto de la
    // app (adenda_punto1_delete_silencioso.md) — se trata igual como fallo real.
    if (error || count === 0) {
      setErrorGuardado('No se pudo marcar como completado. Inténtalo de nuevo.');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['mis-proximos-pasos'] });
  }

  function esVencido(fechaObjetivo: string | null) {
    if (!fechaObjetivo) return false;
    return new Date(fechaObjetivo) < new Date(new Date().toDateString());
  }

  return (
    <div className="screen">
      <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>Mis próximos pasos</h1>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className={`chip${filtro === 'pendiente' ? ' chip--on' : ''}`}
          onClick={() => setFiltro('pendiente')}
        >
          Pendientes
        </button>
        <button
          type="button"
          className={`chip${filtro === 'completado' ? ' chip--on' : ''}`}
          onClick={() => setFiltro('completado')}
        >
          Completados
        </button>
      </div>

      {isLoading && <EstadoLista estado="cargando" />}

      {sinConexion && <EstadoLista estado="sin-conexion" onReintentar={reintentar} />}

      {isError && (
        <EstadoLista
          estado="error"
          mensaje="No se pudieron cargar los próximos pasos."
          onReintentar={reintentar}
        />
      )}

      {errorGuardado && (
        <p style={{ color: 'var(--risk-600)', fontSize: 'var(--text-xs)' }}>{errorGuardado}</p>
      )}

      {!sinConexion && !isError && !!pasos?.length && (
        <div className="lista-agrupada">
          <SeccionLista>
            {pasos.map((p) => {
              const vencido = filtro === 'pendiente' && esVencido(p.fecha_objetivo);
              const guardandoEsta = guardandoId === p.id;
              const cliente = p.visita?.cliente?.nombre ?? 'Cliente';
              const cuando = p.fecha_objetivo
                ? ` · ${vencido ? 'vencido' : new Date(p.fecha_objetivo).toLocaleDateString('es-ES')}`
                : '';
              const subtitulo = `${cliente}${cuando}${guardandoEsta ? ' · guardando…' : ''}`;

              // 'completado' → sin acción, solo se abre el detalle.
              if (filtro === 'completado') {
                return (
                  <FilaNavegable
                    key={p.id}
                    titulo={p.descripcion}
                    subtitulo={subtitulo}
                    to={`/proximos-pasos/${p.id}`}
                  />
                );
              }

              // 'pendiente' → el cuerpo abre el detalle; la marca de
              // verificación a la derecha lo cierra como completado. Son
              // hermanos (FilaAccion), así que marcar no abre el detalle.
              const completar: AccionFila = {
                icono: 'check',
                etiqueta: 'Marcar como completado',
                onClick: () => marcarCompletado(p.id),
                tono: 'brand',
                disabled: guardandoEsta,
              };
              return (
                <FilaAccion
                  key={p.id}
                  titulo={p.descripcion}
                  subtitulo={subtitulo}
                  tono={vencido ? 'riesgo' : 'neutral'}
                  onClick={() => navigate(`/proximos-pasos/${p.id}`)}
                  acciones={[completar]}
                />
              );
            })}
          </SeccionLista>
        </div>
      )}

      {!isLoading && !isError && !sinConexion && pasos?.length === 0 && (
        <EstadoLista
          estado="vacio"
          mensaje={`Sin próximos pasos ${filtro === 'pendiente' ? 'pendientes' : 'completados'}.`}
        />
      )}
    </div>
  );
}
