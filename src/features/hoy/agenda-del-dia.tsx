import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { useDescargarInforme, BotonDescargarInforme } from '@/hooks/use-descargar-informe';
import { EstadoError } from '@/components/ui/estado-error';
import { SeccionColapsable } from '@/components/ui/seccion-colapsable';
import { franjaDe, etiquetaFranja } from '@/lib/franja-visita';

interface PrevisualizacionBorrado {
  num_fotos: number;
  num_audios: number;
  num_notas: number;
  num_hallazgos: number;
  num_oportunidades: number;
  num_proximos_pasos: number;
  rutas_storage: string[] | null;
}

interface VisitaAgenda {
  id: string;
  fecha: string;
  hora_definida: boolean;
  franja: string | null;
  tipo_visita: string | null;
  estado_captura: 'agendada' | 'en_curso' | 'consolidada';
  cliente: { id: string; nombre: string } | null;
}

// Rango del día en curso, hora local del dispositivo — suficiente para v1
// (no hay comerciales operando en zonas horarias distintas a la vez).
function rangoDeHoy() {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

// Texto de "cuándo" de una visita. Con hora → "09:00"; sin hora pero con
// franja → "mañana" / "tarde"; sin nada → "sin hora". conDia antepone el día
// (para la lista de Próximas, que mezcla fechas).
function cuandoTexto(v: VisitaAgenda, conDia: boolean, bajoFranja = false): string {
  const d = new Date(v.fecha);
  // Bajo una cabecera de franja ("Tarde", "Sin hora"), una visita sin hora no
  // repite la franja — no aporta nada. Con hora sí: la hora concreta informa.
  if (bajoFranja && !v.hora_definida) return '';
  const dia = conDia
    ? d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    : '';
  const hora = v.hora_definida
    ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : etiquetaFranja(franjaDe(v.fecha, v.hora_definida, v.franja));
  return dia ? `${dia} · ${hora}` : hora;
}

export function AgendaDelDia() {
  const navigate = useNavigate();
  const { comercial } = useSesionActual();
  const { inicio, fin } = useMemo(rangoDeHoy, []);
  const queryClient = useQueryClient();
  // Decisión de producto (29/8/2026): mismo criterio que en Clientes — un
  // comercial normal ve siempre solo sus propias visitas de hoy, sin poder
  // cambiarlo; el interruptor "Todos" es exclusivo de Dirección Comercial.
  const esDireccionComercial = comercial?.rol === 'direccion_comercial';
  const [soloMiasElegido, setSoloMias] = useState(true);
  const soloMias = esDireccionComercial ? soloMiasElegido : true;

  const queryKey = ['visitas-hoy', comercial?.id, inicio];
  const {
    data: visitas,
    isLoading,
    isError,
    isPaused,
    refetch,
  } = useQuery({
    queryKey,
    enabled: !!comercial,
    queryFn: async (): Promise<VisitaAgenda[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, hora_definida, franja, tipo_visita, estado_captura, cliente:cliente_id(id, nombre)')
        .gte('fecha', inicio)
        .lte('fecha', fin)
        .order('fecha', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VisitaAgenda[];
    },
  });

  // Visitas planificadas para días futuros. Sin esto, planificar una visita
  // para la semana que viene era un agujero: no se veía en ninguna parte
  // hasta que llegaba el día. Solo 'agendada' (las que ya se empezaron o
  // cerraron no son "próximas") y solo hacia delante.
  const { data: visitasProximas } = useQuery({
    queryKey: ['visitas-proximas', comercial?.id, fin],
    enabled: !!comercial,
    refetchOnMount: 'always',
    queryFn: async (): Promise<VisitaAgenda[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, hora_definida, franja, tipo_visita, estado_captura, cliente:cliente_id(id, nombre)')
        .gt('fecha', fin)
        .eq('estado_captura', 'agendada')
        .order('fecha', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as VisitaAgenda[];
    },
  });

  // Planificadas para una fecha que ya pasó y nadie las hizo. Sin esto se
  // quedaban 'agendada' con fecha vieja y desaparecían de todas las listas
  // (Hoy filtra por hoy, Próximas por futuro): invisibles. Van arriba del
  // todo para que se resuelvan (empezar, reprogramar o cancelar).
  const { data: visitasAtrasadas } = useQuery({
    queryKey: ['visitas-atrasadas', comercial?.id, inicio],
    enabled: !!comercial,
    refetchOnMount: 'always',
    queryFn: async (): Promise<VisitaAgenda[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, hora_definida, franja, tipo_visita, estado_captura, cliente:cliente_id(id, nombre)')
        .lt('fecha', inicio)
        .eq('estado_captura', 'agendada')
        .order('fecha', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as VisitaAgenda[];
    },
  });

  // Igual que en Clientes: "Hoy" mostraba las visitas de TODO el equipo sin
  // distinguir de quién eran — encontrado probando multiparticipante, no
  // era intencionado dejarlo así solo aquí y arreglarlo solo en Clientes.
  // El responsable vive en visita_participante (rol 'responsable'), no en
  // la propia tabla `visita` — ver crear-visita-con-responsable.ts.
  // Se piden participantes para las de hoy Y las próximas de una vez.
  const idsVisitas = [
    ...(visitas?.map((v) => v.id) ?? []),
    ...(visitasProximas?.map((v) => v.id) ?? []),
    ...(visitasAtrasadas?.map((v) => v.id) ?? []),
  ];
  const { data: responsables } = useQuery({
    queryKey: ['responsables-visitas-hoy', idsVisitas.join(',')],
    enabled: idsVisitas.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select('visita_id, comercial_id')
        .eq('rol', 'responsable')
        .in('visita_id', idsVisitas);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.visita_id, p.comercial_id]));
    },
  });

  // Aparte del mapa de responsables (para la etiqueta "de [nombre]"), hace
  // falta saber TODOS los participantes de cada visita para el filtro
  // "Solo mías" — si solo mirara el responsable, alguien añadido como
  // participante (no responsable) nunca vería la visita como suya, aunque
  // ya esté trabajando en ella. Encontrado probando la solicitud de ayuda
  // recién construida: Dirección Comercial se asignaba a sí mismo y la
  // visita seguía sin aparecer en su "Solo mías".
  const { data: participantesPorVisita } = useQuery({
    queryKey: ['participantes-visitas-hoy', idsVisitas.join(',')],
    enabled: idsVisitas.length > 0,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select('visita_id, comercial_id')
        .in('visita_id', idsVisitas);
      if (error) throw error;
      const mapa: Record<string, string[]> = {};
      for (const p of data ?? []) {
        (mapa[p.visita_id] ??= []).push(p.comercial_id);
      }
      return mapa;
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

  const esMia = (id: string) =>
    !soloMias || (!!comercial && !!participantesPorVisita?.[id]?.includes(comercial.id));

  const visitasFiltradas = visitas?.filter((v) => esMia(v.id));
  const proximasFiltradas = visitasProximas?.filter((v) => esMia(v.id));
  const atrasadasFiltradas = visitasAtrasadas?.filter((v) => esMia(v.id));

  // La pantalla Hoy se organiza en secciones plegables por el ciclo de vida
  // de la visita: en curso (arriba, ya empezada) → pendientes por franja
  // (agendadas para hoy sin empezar) → hechas hoy (consolidadas, solo para
  // descargar el informe o borrar un error). Una consolidada no cuenta como
  // "Visita de tarde" pendiente.
  const hoyEnCurso = visitasFiltradas?.filter((v) => v.estado_captura === 'en_curso') ?? [];
  const hoyPendientes = visitasFiltradas?.filter((v) => v.estado_captura === 'agendada') ?? [];
  const hoyHechas = visitasFiltradas?.filter((v) => v.estado_captura === 'consolidada') ?? [];
  const hoyManana = hoyPendientes.filter((v) => franjaDe(v.fecha, v.hora_definida, v.franja) === 'manana');
  const hoyTarde = hoyPendientes.filter((v) => franjaDe(v.fecha, v.hora_definida, v.franja) === 'tarde');
  const hoySinHora = hoyPendientes.filter((v) => franjaDe(v.fecha, v.hora_definida, v.franja) === 'sin_hora');
  const proximas = proximasFiltradas ?? [];
  const proximasVisibles = proximas.slice(0, 5);
  const sinNadaHoy =
    hoyEnCurso.length === 0 && hoyPendientes.length === 0 && hoyHechas.length === 0;

  function renderVisita(visita: VisitaAgenda, mostrarDia: boolean, bajoFranja = false) {
    if (visitaBorrarId === visita.id) {
      return (
        <div key={visita.id} className="card">
          {previsualizando.cargando || !previsualizacion ? (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Calculando qué se va a borrar…</div>
          ) : (
            <>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
                Esta visita arrastra: {previsualizacion.num_fotos} foto(s), {previsualizacion.num_audios} audio(s),{' '}
                {previsualizacion.num_notas} nota(s), {previsualizacion.num_hallazgos} hallazgo(s),{' '}
                {previsualizacion.num_oportunidades} oportunidad(es) y {previsualizacion.num_proximos_pasos} próximo(s)
                paso(s). Todo eso se borrará también. No se puede deshacer.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={cancelarBorrado} disabled={borrando.cargando}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  style={{ background: 'var(--risk-600)' }}
                  onClick={confirmarBorrado}
                  disabled={borrando.cargando}
                >
                  {borrando.cargando ? 'Borrando…' : 'Confirmar borrado de la visita completa'}
                </button>
              </div>
              {borrando.error && <div className="field-error-text" style={{ marginTop: 8 }}>{borrando.error}</div>}
            </>
          )}
        </div>
      );
    }
    return (
      <div key={visita.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => abrirVisita(visita)}>
          {(() => {
            const texto = cuandoTexto(visita, mostrarDia, bajoFranja);
            return texto ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>{texto}</div>
            ) : null;
          })()}
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 500, marginTop: 2 }}>
            {visita.cliente?.nombre ?? 'Cliente'}
          </div>
          {visita.tipo_visita && <span className="chip" style={{ marginTop: 6 }}>{visita.tipo_visita}</span>}
          {visita.estado_captura === 'en_curso' && (
            <span className="chip chip--on" style={{ marginLeft: 6, marginTop: 6 }}>
              en curso
            </span>
          )}
          {visita.estado_captura === 'agendada' && (
            <span className="chip" style={{ marginLeft: 6, marginTop: 6 }}>
              planificada
            </span>
          )}
          {responsables?.[visita.id] && responsables[visita.id] !== comercial?.id && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
              de {nombresComerciales?.[responsables[visita.id]] ?? '…'}
            </div>
          )}
        </div>
        {visita.estado_captura !== 'agendada' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
            <BotonDescargarInforme estado={estadoDe(visita.id)} onDescargar={() => descargar(visita.id)} compacto />
            <button
              type="button"
              onClick={() => void pedirBorrado(visita.id)}
              style={{ border: 'none', background: 'none', color: 'var(--risk-600)', fontSize: 'var(--text-xs)', cursor: 'pointer', padding: 4 }}
            >
              Borrar
            </button>
          </div>
        )}
      </div>
    );
  }

  // isPaused: TanStack Query pausa la consulta en vez de marcarla como
  // error cuando decide que la red no es fiable (networkMode 'online' por
  // defecto) — sin esto, la pantalla se queda en blanco, ni cargando ni
  // error, el mismo problema de fondo que este punto quería resolver.
  const sinConexion = isPaused && visitas === undefined;
  // reintentar() en vez de refetch() a secas: una consulta "paused" no
  // siempre reacciona a un refetch() manual — resetQueries fuerza un
  // intento realmente nuevo, verificado en pruebas reales de red rota.
  function reintentar() {
    queryClient.resetQueries({ queryKey });
    refetch();
  }

  const esDeHoy = (f: string) => {
    const t = new Date(f).getTime();
    return t >= new Date(inicio).getTime() && t <= new Date(fin).getTime();
  };

  function abrirVisita(visita: VisitaAgenda) {
    // en_curso → retomar en Visita activa.
    if (visita.estado_captura === 'en_curso') {
      navigate(`/visita/${visita.id}`);
      return;
    }
    // Planificada para OTRO día (atrasada o futura) → pantalla de gestión,
    // no el repaso: el repaso invita a empezarla ya y no es lo que quieres
    // con una visita para dentro de una semana.
    if (visita.estado_captura === 'agendada' && !esDeHoy(visita.fecha)) {
      navigate(`/visita/${visita.id}/planificada`);
      return;
    }
    // Planificada para hoy, o improvisada → repaso rápido antes de entrar.
    if (visita.cliente) {
      navigate(`/clientes/${visita.cliente.id}/repaso?visitaId=${visita.id}`);
    }
  }

  // Borrar una visita creada por error (duplicada, o iniciada sin querer)
  // — antes solo se podía borrar entrando a la ficha del cliente y
  // buscando la visita correcta entre su historial, nada intuitivo ni
  // rápido cuando el error se ve aquí mismo, en Hoy. Mismo patrón de
  // previsualización + confirmación en dos pasos ya usado en la ficha de
  // cliente, reutilizando las mismas funciones RPC.
  const [visitaBorrarId, setVisitaBorrarId] = useState<string | null>(null);
  const [previsualizacion, setPrevisualizacion] = useState<PrevisualizacionBorrado | null>(null);
  const previsualizando = useAccionAsync();
  const borrando = useAccionAsync();
  const { estadoDe, descargar } = useDescargarInforme();

  async function pedirBorrado(visitaId: string) {
    setVisitaBorrarId(visitaId);
    setPrevisualizacion(null);
    await previsualizando.ejecutar(
      async () => {
        const { data, error } = await supabase.rpc('previsualizar_borrado_visita', { p_visita_id: visitaId }).single();
        if (error) throw new Error(error.message);
        return data as PrevisualizacionBorrado;
      },
      { onExito: (data) => setPrevisualizacion(data) }
    );
  }

  function cancelarBorrado() {
    setVisitaBorrarId(null);
    setPrevisualizacion(null);
    previsualizando.limpiarError();
    borrando.limpiarError();
  }

  async function confirmarBorrado() {
    if (!visitaBorrarId) return;
    const rutas = previsualizacion?.rutas_storage ?? [];
    await borrando.ejecutar(
      async () => {
        const { error } = await supabase.rpc('eliminar_visita_completa', { p_visita_id: visitaBorrarId });
        if (error) throw new Error(error.message);
        if (rutas.length) {
          await Promise.all([
            supabase.storage.from('fotos-visita').remove(rutas),
            supabase.storage.from('audios-visita').remove(rutas),
          ]);
        }
      },
      {
        onExito: () => {
          setVisitaBorrarId(null);
          setPrevisualizacion(null);
          queryClient.invalidateQueries({ queryKey });
          queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
        },
      }
    );
  }

  return (
    <div className="screen">
      <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>Hoy</h1>

      {visitas && (hoyPendientes.length > 0 || (atrasadasFiltradas?.length ?? 0) > 0) && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', marginTop: -8 }}>
          {hoyPendientes.length > 0 &&
            `${hoyPendientes.length} planificada${hoyPendientes.length === 1 ? '' : 's'} hoy`}
          {hoyPendientes.length > 0 && (atrasadasFiltradas?.length ?? 0) > 0 && ' · '}
          {(atrasadasFiltradas?.length ?? 0) > 0 &&
            `${atrasadasFiltradas!.length} atrasada${atrasadasFiltradas!.length === 1 ? '' : 's'}`}
        </div>
      )}

      {esDireccionComercial && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={`chip${!soloMias ? ' chip--on' : ''}`} onClick={() => setSoloMias(false)}>
            Todos
          </button>
          <button type="button" className={`chip${soloMias ? ' chip--on' : ''}`} onClick={() => setSoloMias(true)}>
            Solo mías
          </button>
        </div>
      )}

      {atrasadasFiltradas && atrasadasFiltradas.length > 0 && (
        <div
          className="card"
          style={{ cursor: 'pointer', borderColor: 'var(--warning-600)' }}
          onClick={() => navigate('/agenda')}
        >
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--warning-600)', fontWeight: 500 }}>
            {atrasadasFiltradas.length} visita{atrasadasFiltradas.length === 1 ? '' : 's'} atrasada
            {atrasadasFiltradas.length === 1 ? '' : 's'} — revisar en Agenda →
          </div>
        </div>
      )}

      {isLoading && <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando agenda…</p>}

      {sinConexion && (
        <EstadoError
          mensaje="Sin conexión. Comprueba tu red e inténtalo de nuevo."
          onReintentar={reintentar}
        />
      )}

      {isError && (
        <EstadoError
          mensaje="No se pudieron cargar las visitas de hoy."
          onReintentar={reintentar}
        />
      )}

      {!isLoading && !isError && !sinConexion && sinNadaHoy && (
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>
          {soloMias ? 'No tienes visitas para hoy.' : 'No hay visitas para hoy.'}
        </p>
      )}

      {/* Se espera a tener datos (visitas !== undefined) antes de montar las
          secciones: SeccionColapsable fija su estado abierto/cerrado en el
          primer render, y con la lista aún vacía "En curso" y la franja en
          curso arrancarían cerradas por error. */}
      {visitas && !isError && !sinConexion && (
        <>
          {/* En curso arriba del todo, abierta si hay alguna: una visita ya
              empezada no está "pendiente", va en su propia sección y no en
              la franja, para no contarla dos veces. */}
          <SeccionColapsable
            titulo="En curso"
            cantidad={hoyEnCurso.length}
            defaultAbierta={hoyEnCurso.length > 0}
          >
            {hoyEnCurso.map((visita) => renderVisita(visita, false))}
          </SeccionColapsable>
          {/* Una sola "Visitas de hoy" con mañana / tarde / sin hora dentro
              como etiquetas (no secciones sueltas). El contador son las
              pendientes de empezar; abierta por defecto si hay alguna. */}
          <SeccionColapsable
            titulo="Visitas de hoy"
            cantidad={hoyPendientes.length}
            defaultAbierta={hoyPendientes.length > 0}
          >
            {(
              [
                ['manana', 'Mañana', hoyManana],
                ['tarde', 'Tarde', hoyTarde],
                ['sin_hora', 'Sin hora', hoySinHora],
              ] as const
            ).map(([clave, etiqueta, lista]) =>
              lista.length === 0 ? null : (
                <div key={clave}>
                  <div className="label" style={{ marginTop: clave === 'manana' ? 0 : undefined }}>
                    {etiqueta}
                  </div>
                  {lista.map((visita) => renderVisita(visita, false, true))}
                </div>
              )
            )}
          </SeccionColapsable>
          <SeccionColapsable titulo="Hechas hoy" cantidad={hoyHechas.length}>
            {hoyHechas.map((visita) => renderVisita(visita, false))}
          </SeccionColapsable>
          <SeccionColapsable titulo="Próximas visitas" cantidad={proximas.length}>
            {proximasVisibles.map((visita) => renderVisita(visita, true))}
            {proximas.length > proximasVisibles.length && (
              <div
                style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', cursor: 'pointer', paddingLeft: 4 }}
                onClick={() => navigate('/agenda')}
              >
                y {proximas.length - proximasVisibles.length} más — ver todas en Agenda →
              </div>
            )}
          </SeccionColapsable>
        </>
      )}

      <div
        className="card"
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}
        onClick={() => navigate('/agenda')}
      >
        <span style={{ fontSize: 'var(--text-sm)' }}>Ver agenda completa</span>
        <span style={{ fontSize: 20, color: 'var(--ink-300)' }}>›</span>
      </div>

      <button className="btn btn-secondary" onClick={() => navigate('/clientes')}>
        + Visita no agendada
      </button>
    </div>
  );
}
