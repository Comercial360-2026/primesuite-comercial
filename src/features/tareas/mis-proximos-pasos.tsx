import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta, haceRelativo } from '@/lib/fechas';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { FilaAccion, type AccionFila } from '@/components/ui/fila-accion';
import { EstadoLista } from '@/components/ui/estado-lista';
import { CabeceraSeccion } from '@/components/ui/cabecera-seccion';
import { Icono } from '@/components/ui/iconos';

interface ProximoPaso {
  id: string;
  descripcion: string;
  fecha_objetivo: string | null;
  estado: string;
  oportunidad_id: string | null;
  visita: { cliente: { id: string; nombre: string } | null } | null;
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
        .select('id, descripcion, fecha_objetivo, estado, oportunidad_id, visita:visita_id(cliente:cliente_id(id, nombre))')
        .eq('comercial_responsable_id', comercial!.id)
        .eq('estado', filtro)
        .order('fecha_objetivo', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProximoPaso[];
    },
  });

  // "Tarea" vs "Próxima visita": la elección se hace al crear el paso
  // (PasoRapidoModal) y una "próxima visita" NO crea proximo_paso — planifica
  // una visita. Así que aquí todo son tareas. Lo útil de distinguir en esta
  // pantalla es cuáles ya han derivado en una revisita planificada: se
  // cruza cada paso pendiente con las visitas 'agendada' futuras de su
  // cliente (dato que ya existe, sin tocar el modelo). Esas bajan de
  // prioridad y llevan la nota "revisita planificada · <fecha>".
  const idsClientesPasos = [
    ...new Set((pasos ?? []).map((p) => p.visita?.cliente?.id).filter((x): x is string => !!x)),
  ];
  const { data: revisitasPorCliente } = useQuery({
    queryKey: ['mpp-revisitas-planificadas', idsClientesPasos.join(',')],
    enabled: filtro === 'pendiente' && idsClientesPasos.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const hoyISO = new Date(new Date().toDateString()).toISOString();
      const { data, error } = await supabase
        .from('visita')
        .select('cliente_id, fecha')
        .eq('estado_captura', 'agendada')
        .in('cliente_id', idsClientesPasos)
        .gte('fecha', hoyISO)
        .order('fecha', { ascending: true });
      if (error) throw error;
      // La primera fecha por cliente (la consulta viene ordenada asc).
      const m: Record<string, string> = {};
      for (const v of data ?? []) if (!m[v.cliente_id]) m[v.cliente_id] = v.fecha;
      return m;
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

  const inicioHoy = new Date(new Date().toDateString()).getTime();
  const en7dias = inicioHoy + 7 * 86_400_000;

  function esVencido(fechaObjetivo: string | null) {
    if (!fechaObjetivo) return false;
    return new Date(fechaObjetivo).getTime() < inicioHoy;
  }

  // Fecha de la primera visita planificada del cliente de este paso, o
  // null si no hay ninguna (solo en el filtro "pendiente").
  function revisitaDe(p: ProximoPaso): string | null {
    const cid = p.visita?.cliente?.id;
    return (cid && revisitasPorCliente?.[cid]) || null;
  }

  // Cubo de urgencia para el filtro "pendiente" — lo primero que quiere
  // ver el comercial es qué está vencido y qué es de esta semana.
  function cuboDe(p: ProximoPaso): 'revisita' | 'vencida' | 'semana' | 'adelante' {
    if (revisitaDe(p)) return 'revisita';
    if (esVencido(p.fecha_objetivo)) return 'vencida';
    const t = p.fecha_objetivo ? new Date(p.fecha_objetivo).getTime() : Infinity;
    return t <= en7dias ? 'semana' : 'adelante';
  }
  const pendientesPorCubo = (cubo: string) =>
    (pasos ?? []).filter((p) => cuboDe(p) === cubo);

  function renderFila(p: ProximoPaso) {
    const revisita = revisitaDe(p);
    const vencido = filtro === 'pendiente' && !revisita && esVencido(p.fecha_objetivo);
    const guardandoEsta = guardandoId === p.id;
    const cliente = p.visita?.cliente?.nombre ?? 'Cliente';
    const cuando = p.fecha_objetivo
      ? ` · ${vencido ? `vencido ${haceRelativo(p.fecha_objetivo)}` : fechaCorta(p.fecha_objetivo)}`
      : '';
    const notaRevisita = revisita ? ` · revisita ${fechaCorta(revisita)}` : '';
    const subtitulo = `${cliente}${cuando}${notaRevisita}${guardandoEsta ? ' · guardando…' : ''}`;

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

    // El cuerpo abre el detalle; la marca de verificación a la derecha lo
    // cierra como completado (hermanos FilaAccion, marcar no abre el detalle).
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
  }

  return (
    <div className="screen">
      <CabeceraSeccion titulo="Mis próximos pasos" icono="tareas" />

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
          {filtro === 'completado' ? (
            <SeccionLista>{pasos.map((p) => renderFila(p))}</SeccionLista>
          ) : (
            <>
              {pendientesPorCubo('vencida').length > 0 && (
                <div>
                  <div className="hoy-atrasadas-cab">
                    <Icono nombre="atencion" size={13} />
                    Vencidas
                  </div>
                  <div className="seccion-lista__grupo">
                    {pendientesPorCubo('vencida').map((p) => renderFila(p))}
                  </div>
                </div>
              )}
              {pendientesPorCubo('semana').length > 0 && (
                <SeccionLista titulo="Esta semana">
                  {pendientesPorCubo('semana').map((p) => renderFila(p))}
                </SeccionLista>
              )}
              {pendientesPorCubo('adelante').length > 0 && (
                <SeccionLista titulo="Más adelante">
                  {pendientesPorCubo('adelante').map((p) => renderFila(p))}
                </SeccionLista>
              )}
              {pendientesPorCubo('revisita').length > 0 && (
                <SeccionLista titulo="Con revisita planificada" prominencia="tenue">
                  {pendientesPorCubo('revisita').map((p) => renderFila(p))}
                </SeccionLista>
              )}
            </>
          )}
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
