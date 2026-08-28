import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { EstadoError } from '@/components/ui/estado-error';

interface ConsumoComercial {
  comercial_id: string;
  nombre: string;
  bytes: number;
}

function formatearMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function ConsumoComerciales() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const queryKeyConsumo = ['espacio-por-comercial'];
  const { data: consumo, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey: queryKeyConsumo,
    queryFn: async (): Promise<ConsumoComercial[]> => {
      const { data, error } = await supabase.rpc('fn_espacio_por_comercial');
      if (error) throw error;
      return (data ?? []) as ConsumoComercial[];
    },
  });

  const { data: cuotaBytes } = useQuery({
    queryKey: ['cuota-comercial-bytes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_cuota_comercial_bytes');
      if (error) throw error;
      return data as number;
    },
  });

  // isPaused: mismo patrón ya corregido en el resto de la app.
  const sinConexion = isPaused && consumo === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey: queryKeyConsumo });
    refetch();
  }

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate('/yo')} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', padding: 0 }}>
          ←
        </button>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>consumo por comercial</h1>
      </div>

      {isLoading && <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando…</p>}

      {sinConexion && (
        <EstadoError mensaje="Sin conexión. Comprueba tu red e inténtalo de nuevo." onReintentar={reintentar} />
      )}

      {isError && (
        <EstadoError mensaje="No se pudo cargar el consumo por comercial." onReintentar={reintentar} />
      )}

      {consumo?.map((c) => {
        const porcentaje = cuotaBytes ? (c.bytes / cuotaBytes) * 100 : 0;
        const color = porcentaje < 70 ? 'var(--ink-400)' : porcentaje < 90 ? 'var(--warning-600)' : 'var(--risk-600)';
        return (
          <div key={c.comercial_id} className="card" style={{ borderColor: porcentaje >= 90 ? color : undefined }}>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>{c.nombre}</div>
            <div style={{ fontSize: 'var(--text-sm)', color }}>
              {cuotaBytes
                ? `${formatearMB(c.bytes)} MB de ${formatearMB(cuotaBytes)} MB (${porcentaje.toFixed(0)}%)`
                : `${formatearMB(c.bytes)} MB usados`}
            </div>
          </div>
        );
      })}

      {!isLoading && !isError && !sinConexion && consumo?.length === 0 && (
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>No hay comerciales activos.</p>
      )}
    </div>
  );
}
