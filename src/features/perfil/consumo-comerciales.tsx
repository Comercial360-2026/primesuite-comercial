import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { EstadoError } from '@/components/ui/estado-error';
import { useEspacioEquipo } from '@/hooks/use-espacio-equipo';
import { useSesionActual } from '@/hooks/use-sesion-actual';

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

  const { estado: espacioEquipo } = useEspacioEquipo();
  const { comercial } = useSesionActual();

  // Avisos "libera espacio" sin atender, para no repetir la petición.
  const { data: pendientes } = useQuery({
    queryKey: ['avisos-liberar-pendientes'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('aviso_liberar_espacio')
        .select('comercial_id, creado_en')
        .is('atendido_en', null);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((a) => [a.comercial_id, a.creado_en]));
    },
  });
  const [pidiendo, setPidiendo] = useState<string | null>(null);

  async function pedirLiberar(comercialId: string) {
    if (!comercial || pidiendo) return;
    setPidiendo(comercialId);
    await supabase
      .from('aviso_liberar_espacio')
      .insert({ comercial_id: comercialId, pedido_por: comercial.id });
    setPidiendo(null);
    queryClient.invalidateQueries({ queryKey: ['avisos-liberar-pendientes'] });
  }

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

      {espacioEquipo && (
        <div
          className="card"
          style={{
            borderColor:
              espacioEquipo.pctEquipo >= 95
                ? 'var(--risk-600)'
                : espacioEquipo.pctEquipo >= 85
                  ? 'var(--warning-600)'
                  : undefined,
          }}
        >
          <div className="label" style={{ marginTop: 0 }}>espacio del equipo</div>
          <div style={{ fontSize: 'var(--text-base)' }}>
            {formatearMB(espacioEquipo.usadoTotal)} MB de {formatearMB(espacioEquipo.presupuesto)} MB (
            {espacioEquipo.pctEquipo.toFixed(0)}%)
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 2 }}>
            parte orientativa por comercial: {formatearMB(espacioEquipo.cuotaBase)} MB
          </div>
        </div>
      )}

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
        const yaPedido = pendientes?.[c.comercial_id];
        const esYo = c.comercial_id === comercial?.id;
        return (
          <div key={c.comercial_id} className="card" style={{ borderColor: porcentaje >= 90 ? color : undefined }}>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>{c.nombre}</div>
            <div style={{ fontSize: 'var(--text-sm)', color }}>
              {cuotaBytes
                ? `${formatearMB(c.bytes)} MB de ${formatearMB(cuotaBytes)} MB (${porcentaje.toFixed(0)}%)`
                : `${formatearMB(c.bytes)} MB usados`}
            </div>
            {!esYo &&
              (yaPedido ? (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
                  Avisado el {new Date(yaPedido).toLocaleDateString('es-ES')} — pendiente de que lo mire
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: 8, width: 'auto', padding: '0 16px' }}
                  disabled={pidiendo === c.comercial_id}
                  onClick={() => pedirLiberar(c.comercial_id)}
                >
                  {pidiendo === c.comercial_id ? 'Enviando…' : 'Pedir que libere espacio'}
                </button>
              ))}
          </div>
        );
      })}

      {!isLoading && !isError && !sinConexion && consumo?.length === 0 && (
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>No hay comerciales activos.</p>
      )}
    </div>
  );
}
