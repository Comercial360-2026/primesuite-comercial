import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';

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

  const { data: pasos, isLoading } = useQuery({
    queryKey: ['mis-proximos-pasos', comercial?.id, filtro],
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

  async function marcarCompletado(id: string) {
    await supabase.from('proximo_paso').update({ estado: 'completado' }).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['mis-proximos-pasos'] });
  }

  function esVencido(fechaObjetivo: string | null) {
    if (!fechaObjetivo) return false;
    return new Date(fechaObjetivo) < new Date(new Date().toDateString());
  }

  return (
    <div className="screen">
      <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>mis próximos pasos</h1>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className={`chip${filtro === 'pendiente' ? ' chip--on' : ''}`}
          onClick={() => setFiltro('pendiente')}
        >
          pendientes
        </button>
        <button
          type="button"
          className={`chip${filtro === 'completado' ? ' chip--on' : ''}`}
          onClick={() => setFiltro('completado')}
        >
          completados
        </button>
      </div>

      {isLoading && <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando…</p>}

      {pasos?.map((p) => {
        const vencido = filtro === 'pendiente' && esVencido(p.fecha_objetivo);
        return (
          <div key={p.id} className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {filtro === 'pendiente' && (
              <button
                aria-label="marcar como completado"
                onClick={() => marcarCompletado(p.id)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  border: '1.5px solid var(--ink-200)',
                  background: 'none',
                  marginTop: 2,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              />
            )}
            <div
              style={{ flex: 1, cursor: p.oportunidad_id ? 'pointer' : 'default' }}
              onClick={() => p.oportunidad_id && navigate(`/oportunidades/${p.oportunidad_id}`)}
            >
              <div style={{ fontSize: 'var(--text-base)' }}>{p.descripcion}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: vencido ? 'var(--danger-600)' : 'var(--ink-400)' }}>
                {p.visita?.cliente?.nombre ?? 'Cliente'}
                {p.fecha_objetivo &&
                  ` · ${vencido ? 'vencido' : new Date(p.fecha_objetivo).toLocaleDateString('es-ES')}`}
              </div>
            </div>
          </div>
        );
      })}

      {!isLoading && pasos?.length === 0 && (
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>
          sin próximos pasos {filtro === 'pendiente' ? 'pendientes' : 'completados'}
        </p>
      )}
    </div>
  );
}
