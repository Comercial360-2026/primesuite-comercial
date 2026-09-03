import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { formatearMB, type NivelEspacio } from '@/lib/espacio';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaAccion } from '@/components/ui/fila-accion';
import { FilaDato } from '@/components/ui/fila-dato';
import { EstadoLista } from '@/components/ui/estado-lista';
import { BarraSeleccion } from '@/components/ui/barra-seleccion';
import { Aviso } from '@/components/ui/aviso';
import { useEspacioEquipo } from '@/hooks/use-espacio-equipo';
import { useSesionActual } from '@/hooks/use-sesion-actual';

interface ConsumoComercial {
  comercial_id: string;
  nombre: string;
  bytes: number;
}

function colorBarra(nivel: NivelEspacio | undefined): string {
  if (nivel === 'bloqueo' || nivel === 'critico_equipo') return 'var(--risk-600)';
  if (nivel === 'aviso_equipo') return 'var(--warning-600)';
  return 'var(--success-600)';
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

  // Modo seleccionar → pedir a varios de una pasada. No hay RPC de lote: es
  // N× el mismo insert en bucle, con progreso.
  const [seleccionando, setSeleccionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<{ tipo: 'exito' | 'atencion'; texto: string } | null>(null);
  const corriendo = progreso !== null;

  function alternarMarca(id: string) {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function entrarSeleccion() {
    setResultado(null);
    setSeleccionando(true);
  }

  function salirSeleccion() {
    if (corriendo) return;
    setSeleccionando(false);
    setMarcadas(new Set());
    setConfirmando(false);
  }

  // ¿Se le puede pedir a este comercial? A ti no; a quien ya está avisado y
  // aún no lo ha mirado, tampoco (sería repetir). Si ya lo miró, sí se
  // puede volver a pedir.
  function elegible(c: ConsumoComercial): boolean {
    if (c.comercial_id === comercial?.id) return false;
    const u = avisos?.[c.comercial_id];
    return !(u && !u.atendido_en);
  }

  async function enviarLote() {
    if (!comercial) return;
    const ids = [...marcadas];
    setConfirmando(false);
    setProgreso({ hecho: 0, total: ids.length });
    let ok = 0;
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase
        .from('aviso_liberar_espacio')
        .insert({ comercial_id: ids[i], pedido_por: comercial.id });
      if (!error) ok++;
      setProgreso({ hecho: i + 1, total: ids.length });
    }
    setProgreso(null);
    setSeleccionando(false);
    setMarcadas(new Set());
    setResultado(
      ok === ids.length
        ? {
            tipo: 'exito',
            texto: `Se ha pedido a ${ok} compañero${ok === 1 ? '' : 's'} que liberen espacio.`,
          }
        : { tipo: 'atencion', texto: `Se envió a ${ok} de ${ids.length}. Inténtalo otra vez con el resto.` }
    );
    queryClient.invalidateQueries({ queryKey: ['avisos-liberar-pendientes'] });
  }

  // isPaused: mismo patrón ya corregido en el resto de la app.
  const sinConexion = isPaused && consumo === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey: queryKeyConsumo });
    refetch();
  }

  const hayElegibles = (consumo ?? []).some(elegible);
  const nombresMarcados = (consumo ?? [])
    .filter((c) => marcadas.has(c.comercial_id))
    .map((c) => c.nombre)
    .join(', ');

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Consumo por comercial" volverA="/yo" ayuda="consumo-comerciales" />

      <div className="lista-agrupada">
        {/* Medidor del EQUIPO, igual que en "Mi espacio": es el pozo común
            lo que manda; la parte por comercial de abajo es orientativa. */}
        <div className="medidor">
          <div className="medidor__lb">Espacio del equipo</div>
          <div className="medidor__barra">
            <div
              className="medidor__relleno"
              style={{
                width: `${Math.min(espacioEquipo?.pctEquipo ?? 0, 100)}%`,
                background: colorBarra(espacioEquipo?.nivel),
              }}
            />
          </div>
          <div className="medidor__cifra">
            {espacioEquipo
              ? `${Math.round(espacioEquipo.pctEquipo)}% · quedan ${formatearMB(
                  Math.max(espacioEquipo.presupuesto - espacioEquipo.usadoTotal, 0)
                )} MB de ${formatearMB(espacioEquipo.presupuesto)} MB`
              : 'Calculando…'}
          </div>
        </div>

        {resultado && !seleccionando && <Aviso tipo={resultado.tipo}>{resultado.texto}</Aviso>}

        {isLoading ? (
          <EstadoLista estado="cargando" />
        ) : sinConexion ? (
          <EstadoLista estado="sin-conexion" onReintentar={reintentar} />
        ) : isError ? (
          <EstadoLista estado="error" mensaje="No se pudo cargar el consumo por comercial." onReintentar={reintentar} />
        ) : consumo?.length === 0 ? (
          <EstadoLista estado="vacio" mensaje="No hay comerciales activos." />
        ) : (
          <>
            {!seleccionando && hayElegibles && (
              <div style={{ display: 'flex', paddingInline: 'var(--fila-pad-x)' }}>
                <button type="button" className="chip" style={{ marginLeft: 'auto' }} onClick={entrarSeleccion}>
                  Seleccionar
                </button>
              </div>
            )}

            {seleccionando && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingInline: 'var(--fila-pad-x)' }}>
                <BarraSeleccion
                  n={marcadas.size}
                  onCancelar={salirSeleccion}
                  acciones={[
                    {
                      etiqueta: corriendo
                        ? `Enviando ${progreso!.hecho} de ${progreso!.total}…`
                        : `Pedir que liberen (${marcadas.size})`,
                      icono: 'solicitudes',
                      onClick: () => setConfirmando(true),
                      disabled: corriendo || marcadas.size === 0,
                    },
                  ]}
                />
                {confirmando && (
                  <div
                    className="fila-confirmacion"
                    style={{ border: '1px solid var(--ink-100)', borderRadius: 'var(--radius-control)' }}
                  >
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-900)' }}>
                      Se enviará un aviso a {marcadas.size} compañero{marcadas.size === 1 ? '' : 's'} ({nombresMarcados})
                      para que liberen espacio.
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmando(false)}>
                        Cancelar
                      </button>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={enviarLote}>
                        Sí, avisar a {marcadas.size}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <SeccionLista titulo="Por comercial">
              {consumo?.map((c) => {
                const pct = cuotaBytes ? (c.bytes / cuotaBytes) * 100 : 0;
                const mb = formatearMB(c.bytes);
                const esYo = c.comercial_id === comercial?.id;
                const ultimo = avisos?.[c.comercial_id];
                const pendienteSinMirar = !!ultimo && !ultimo.atendido_en;

                // Jerarquía: la cifra (MB · % de su parte) es EL dato de la
                // pantalla → valor a la derecha, en negro. La pista de estado
                // (por qué mirar esta fila, o si ya se le avisó) va debajo en
                // gris pequeño. El tono + su icono `atencion` marcan la fila
                // sin depender del color (usuario daltónico).
                let tono: 'neutral' | 'aviso' | 'riesgo' = 'neutral';
                let motivo: string | null = null;
                if (cuotaBytes && pct >= 100) {
                  tono = 'riesgo';
                  motivo = 'pasado de su parte';
                } else if (cuotaBytes && pct >= 85) {
                  tono = 'aviso';
                  motivo = 'cerca del límite';
                }
                const nota = esYo
                  ? 'eres tú'
                  : pendienteSinMirar
                    ? `avisado ${fechaCorta(ultimo!.creado_en)}, sin mirar`
                    : ultimo?.atendido_en
                      ? `lo miró ${fechaCorta(ultimo.atendido_en)}`
                      : motivo;

                const cifra = cuotaBytes ? `${mb} MB · ${Math.round(pct)}%` : `${mb} MB`;
                const puedo = elegible(c);

                const fila = seleccionando ? (
                  <FilaAccion
                    key={c.comercial_id}
                    titulo={c.nombre}
                    subtitulo={`${cuotaBytes ? `${cifra} de su parte` : cifra}${nota ? ` · ${nota}` : ''}`}
                    tono={tono}
                    seleccion={
                      puedo
                        ? {
                            activa: true,
                            marcada: marcadas.has(c.comercial_id),
                            onToggle: () => alternarMarca(c.comercial_id),
                          }
                        : undefined
                    }
                  />
                ) : (
                  <FilaDato
                    key={c.comercial_id}
                    etiqueta={c.nombre}
                    icono={tono === 'neutral' ? undefined : 'atencion'}
                    tono={tono}
                    valor={
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span>{cifra}</span>
                        {nota && (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', fontWeight: 400 }}>
                            {nota}
                          </span>
                        )}
                      </span>
                    }
                  />
                );

                return seleccionando && !puedo ? (
                  <div key={c.comercial_id} style={{ opacity: 0.5 }}>
                    {fila}
                  </div>
                ) : (
                  fila
                );
              })}
            </SeccionLista>
          </>
        )}
      </div>
    </div>
  );
}
