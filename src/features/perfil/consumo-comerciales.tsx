import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaDato } from '@/components/ui/fila-dato';
import { TarjetaAccion } from '@/components/ui/tarjeta-accion';
import { EstadoLista } from '@/components/ui/estado-lista';
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

  // Último aviso "libera espacio" de cada comercial (pendiente o atendido),
  // para no repetir la petición nada más atenderla.
  const { data: avisos } = useQuery({
    queryKey: ['avisos-liberar-pendientes'],
    queryFn: async (): Promise<Record<string, { creado_en: string; atendido_en: string | null }>> => {
      const { data, error } = await supabase
        .from('aviso_liberar_espacio')
        .select('comercial_id, creado_en, atendido_en')
        .order('creado_en', { ascending: false });
      if (error) throw error;
      const m: Record<string, { creado_en: string; atendido_en: string | null }> = {};
      for (const a of data ?? []) {
        if (!m[a.comercial_id]) m[a.comercial_id] = { creado_en: a.creado_en, atendido_en: a.atendido_en };
      }
      return m;
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
      <CabeceraDetalle titulo="Consumo por comercial" volverA="/yo" />

      <div className="lista-agrupada">
        {espacioEquipo && (
          <SeccionLista titulo="Espacio del equipo">
            <FilaDato
              etiqueta="Usado"
              valor={`${formatearMB(espacioEquipo.usadoTotal)} de ${formatearMB(espacioEquipo.presupuesto)} MB (${espacioEquipo.pctEquipo.toFixed(0)}%)`}
              tono={espacioEquipo.pctEquipo >= 95 ? 'riesgo' : espacioEquipo.pctEquipo >= 85 ? 'aviso' : 'neutral'}
            />
            <FilaDato
              etiqueta="Parte orientativa por comercial"
              valor={`${formatearMB(espacioEquipo.cuotaBase)} MB`}
            />
          </SeccionLista>
        )}

        {isLoading ? (
          <EstadoLista estado="cargando" />
        ) : sinConexion ? (
          <EstadoLista estado="sin-conexion" onReintentar={reintentar} />
        ) : isError ? (
          <EstadoLista estado="error" mensaje="No se pudo cargar el consumo por comercial." onReintentar={reintentar} />
        ) : consumo?.length === 0 ? (
          <EstadoLista estado="vacio" mensaje="No hay comerciales activos." />
        ) : (
          consumo?.map((c) => {
            const porcentaje = cuotaBytes ? (c.bytes / cuotaBytes) * 100 : 0;
            const esYo = c.comercial_id === comercial?.id;
            const ultimo = avisos?.[c.comercial_id];
            const pendiente = !!ultimo && !ultimo.atendido_en;
            return (
              <TarjetaAccion
                key={c.comercial_id}
                titulo={esYo ? `${c.nombre} · tú` : c.nombre}
                tono={porcentaje >= 90 ? 'riesgo' : porcentaje >= 70 ? 'aviso' : 'neutral'}
                accion={
                  esYo
                    ? undefined
                    : {
                        etiqueta: pendiente ? 'Ya avisado' : 'Pedir que libere espacio',
                        icono: pendiente ? 'check' : 'solicitudes',
                        onClick: () => pedirLiberar(c.comercial_id),
                        disabled: pendiente,
                        cargando: pidiendo === c.comercial_id,
                        etiquetaCargando: 'Enviando…',
                      }
                }
              >
                {cuotaBytes
                  ? `${formatearMB(c.bytes)} MB de ${formatearMB(cuotaBytes)} MB (${porcentaje.toFixed(0)}%)`
                  : `${formatearMB(c.bytes)} MB usados`}
                {!esYo && ultimo && (
                  <div className="tarjeta-accion__estado">
                    {pendiente
                      ? `Avisado el ${fechaCorta(ultimo.creado_en)} — aún no lo ha mirado`
                      : `Lo miró el ${fechaCorta(ultimo.atendido_en!)}`}
                  </div>
                )}
              </TarjetaAccion>
            );
          })
        )}
      </div>
    </div>
  );
}
