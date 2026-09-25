import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { conReintentoDeSesion } from '@/lib/con-reintento-de-sesion';
import { useVolverA } from '@/lib/volver-a';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { EstadoLista } from '@/components/ui/estado-lista';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaDato } from '@/components/ui/fila-dato';
import { Segmentado } from '@/components/ui/segmentado';
import { Aviso } from '@/components/ui/aviso';

// Consumo y controles del briefing del agente de Copilot Studio (migraciones
// 122/123). Solo Dirección Comercial: el contador sale de briefing_uso (un
// registro por cada envío al agente) y los controles de ajustes_app.

const MOTIVOS: Record<string, string> = {
  planificar: 'Al planificar una visita',
  nocturno: 'La noche anterior',
  manual: 'Pedidos a mano',
};

export function BriefingsUso() {
  const volver = useVolverA('/yo');
  const queryClient = useQueryClient();
  const guardado = useAccionAsync();
  const [topeNuevo, setTopeNuevo] = useState<string | null>(null);

  const { data: uso, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey: ['briefing-uso'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_uso_briefings');
      if (error) throw error;
      const orden = Object.keys(MOTIVOS);
      return (data ?? []).sort((x, y) => orden.indexOf(x.motivo) - orden.indexOf(y.motivo));
    },
  });

  const { data: ajustes } = useQuery({
    queryKey: ['briefing-ajustes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ajustes_app')
        .select('clave, valor, valor_numero')
        .in('clave', ['briefing_pausado', 'briefing_tope_diario']);
      if (error) throw error;
      const por = Object.fromEntries((data ?? []).map((a) => [a.clave, a]));
      return { pausado: !!por.briefing_pausado?.valor, tope: por.briefing_tope_diario?.valor_numero ?? null };
    },
  });

  const { data: tope } = useQuery({
    queryKey: ['briefing-tope'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_tope_briefing').maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function guardar(cambio: { clave: string; valor?: boolean; valor_numero?: number }) {
    const { clave, ...campos } = cambio;
    await guardado.ejecutar(
      () =>
        conReintentoDeSesion(
          () =>
            supabase
              .from('ajustes_app')
              .update({ ...campos, actualizado_en: new Date().toISOString() }, { count: 'exact' })
              .eq('clave', clave),
          'No se ha podido guardar (0 filas afectadas). Solo Dirección Comercial puede cambiarlo.'
        ),
      {
        onExito: () => {
          setTopeNuevo(null);
          queryClient.invalidateQueries({ queryKey: ['briefing-ajustes'] });
          queryClient.invalidateQueries({ queryKey: ['briefing-tope'] });
          queryClient.invalidateQueries({ queryKey: ['avisos-briefing-tope'] });
        },
      }
    );
  }

  const topeTexto = topeNuevo ?? String(ajustes?.tope ?? '');
  const topeValido = /^\d+$/.test(topeTexto) && Number(topeTexto) > 0;
  const total = (uso ?? []).reduce((s, u) => ({ hoy: s.hoy + Number(u.hoy), mes: s.mes + Number(u.mes) }), { hoy: 0, mes: 0 });

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Briefings" ayuda="briefings-uso" volverA={volver} />
      <div className="screen__scroll">
        {isLoading && <EstadoLista estado="cargando" />}
        {(isError || (isPaused && !uso)) && (
          <EstadoLista estado={isPaused ? 'sin-conexion' : 'error'} onReintentar={() => refetch()} />
        )}

        {tope?.alcanzado && (
          <Aviso tipo="atencion" titulo="Tope diario alcanzado">
            Hoy se han enviado {tope.enviados_hoy} de {tope.tope} briefings. Los que falten esperan a mañana. Si
            hace falta, sube el tope aquí abajo.
          </Aviso>
        )}

        {uso && (
          <div className="lista-agrupada">
            <SeccionLista titulo="Enviados al agente">
              {uso.map((u) => (
                <FilaDato
                  key={u.motivo}
                  etiqueta={MOTIVOS[u.motivo] ?? u.motivo}
                  valor={`hoy ${u.hoy} · mes ${u.mes}`}
                />
              ))}
              <FilaDato etiqueta="Total" valor={`hoy ${total.hoy} · mes ${total.mes}`} />
            </SeccionLista>

            <div className="card">
              <div className="label" style={{ marginTop: 0 }}>Briefings automáticos</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
                Al planificar una visita de los próximos 7 días y la noche anterior. Pausados, solo se generan
                cuando un comercial lo pide a mano.
              </div>
              <div style={{ marginTop: 8 }}>
                <Segmentado
                  opciones={[
                    { valor: 'activos', etiqueta: 'Activos' },
                    { valor: 'pausados', etiqueta: 'Pausados' },
                  ] as const}
                  valor={ajustes?.pausado ? 'pausados' : 'activos'}
                  onCambio={(v) => guardar({ clave: 'briefing_pausado', valor: v === 'pausados' })}
                />
              </div>

              <div className="label">Tope diario (todos los briefings)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="field"
                  inputMode="numeric"
                  value={topeTexto}
                  onChange={(e) => setTopeNuevo(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  disabled={guardado.cargando || !topeValido || Number(topeTexto) === ajustes?.tope}
                  onClick={() => guardar({ clave: 'briefing_tope_diario', valor_numero: Number(topeTexto) })}
                >
                  Guardar
                </button>
              </div>
              {guardado.cargando && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>Guardando…</div>
              )}
              {guardado.error && <div className="field-error-text" style={{ marginTop: 6 }}>{guardado.error}</div>}
            </div>

            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>
              El consumo real de la licencia de Copilot se ve en el centro de administración de Power Platform;
              este contador es el de la app, para compararlo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
