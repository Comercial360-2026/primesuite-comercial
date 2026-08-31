import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { EstadoError } from '@/components/ui/estado-error';

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

      {isLoading && <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando…</p>}

      {sinConexion && (
        <EstadoError mensaje="Sin conexión. Comprueba tu red e inténtalo de nuevo." onReintentar={reintentar} />
      )}

      {isError && (
        <EstadoError mensaje="No se pudieron cargar los próximos pasos." onReintentar={reintentar} />
      )}

      {errorGuardado && (
        <p style={{ color: 'var(--risk-600)', fontSize: 'var(--text-xs)' }}>{errorGuardado}</p>
      )}

      {!sinConexion && !isError && pasos?.map((p) => {
        const vencido = filtro === 'pendiente' && esVencido(p.fecha_objetivo);
        const guardandoEsta = guardandoId === p.id;
        return (
          <div key={p.id} className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {filtro === 'pendiente' && (
              <button
                aria-label="marcar como completado"
                onClick={() => marcarCompletado(p.id)}
                disabled={guardandoEsta}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  border: '1.5px solid var(--ink-200)',
                  background: guardandoEsta ? 'var(--ink-200)' : 'none',
                  marginTop: 2,
                  cursor: guardandoEsta ? 'default' : 'pointer',
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate(`/proximos-pasos/${p.id}`)}>
              <div style={{ fontSize: 'var(--text-base)' }}>
                {p.descripcion}
                {guardandoEsta && (
                  <span style={{ color: 'var(--ink-400)', fontSize: 'var(--text-xs)' }}> · guardando…</span>
                )}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: vencido ? 'var(--danger-600)' : 'var(--ink-400)' }}>
                {p.visita?.cliente?.nombre ?? 'Cliente'}
                {p.fecha_objetivo &&
                  ` · ${vencido ? 'vencido' : new Date(p.fecha_objetivo).toLocaleDateString('es-ES')}`}
              </div>
            </div>
          </div>
        );
      })}

      {!isLoading && !isError && !sinConexion && pasos?.length === 0 && (
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>
          sin próximos pasos {filtro === 'pendiente' ? 'pendientes' : 'completados'}
        </p>
      )}
    </div>
  );
}
