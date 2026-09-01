import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaDiaMes, fechaLarga, hora } from '@/lib/fechas';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { EstadoLista } from '@/components/ui/estado-lista';
import { CabeceraSeccion } from '@/components/ui/cabecera-seccion';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { Icono } from '@/components/ui/iconos';
import { franjaDe, etiquetaFranja } from '@/lib/franja-visita';
import { BloqueAhora } from './bloque-ahora';

interface VisitaAgenda {
  id: string;
  fecha: string;
  hora_definida: boolean;
  franja: string | null;
  objetivo: string | null;
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
// franja → "mañana" / "tarde". `conDia` antepone el día (para la lista de
// Próximas, que mezcla fechas).
function cuandoTexto(v: VisitaAgenda, conDia: boolean): string {
  const t = v.hora_definida
    ? hora(v.fecha)
    : etiquetaFranja(franjaDe(v.fecha, v.hora_definida, v.franja));
  return conDia ? `${fechaDiaMes(v.fecha)} · ${t}` : t;
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
  const [hechasAbiertas, setHechasAbiertas] = useState(false);

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
        .select('id, fecha, hora_definida, franja, objetivo, tipo_visita, estado_captura, cliente:cliente_id(id, nombre)')
        .gte('fecha', inicio)
        .lte('fecha', fin)
        .order('fecha', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VisitaAgenda[];
    },
  });

  // Visitas planificadas para días futuros. Sin esto, planificar una visita
  // para la semana que viene era un agujero: no se veía en ninguna parte
  // hasta que llegaba el día. Solo 'agendada' y solo hacia delante.
  const { data: visitasProximas } = useQuery({
    queryKey: ['visitas-proximas', comercial?.id, fin],
    enabled: !!comercial,
    refetchOnMount: 'always',
    queryFn: async (): Promise<VisitaAgenda[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, hora_definida, franja, objetivo, tipo_visita, estado_captura, cliente:cliente_id(id, nombre)')
        .gt('fecha', fin)
        .eq('estado_captura', 'agendada')
        .order('fecha', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as VisitaAgenda[];
    },
  });

  // Planificadas para una fecha que ya pasó y nadie las hizo. Sin esto se
  // quedaban 'agendada' con fecha vieja e invisibles. Van arriba para que se
  // resuelvan (empezar, reprogramar o cancelar en su detalle).
  const { data: visitasAtrasadas } = useQuery({
    queryKey: ['visitas-atrasadas', comercial?.id, inicio],
    enabled: !!comercial,
    refetchOnMount: 'always',
    queryFn: async (): Promise<VisitaAgenda[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, hora_definida, franja, objetivo, tipo_visita, estado_captura, cliente:cliente_id(id, nombre)')
        .lt('fecha', inicio)
        .eq('estado_captura', 'agendada')
        .order('fecha', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as VisitaAgenda[];
    },
  });

  // El responsable vive en visita_participante (rol 'responsable'), no en
  // la propia tabla `visita`. Se pide para hoy + próximas + atrasadas.
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

  // Todos los participantes de cada visita, para el filtro "Solo mías" — si
  // solo mirara el responsable, alguien añadido como participante nunca
  // vería la visita como suya aunque ya esté trabajando en ella.
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

  const hoyEnCurso = visitasFiltradas?.filter((v) => v.estado_captura === 'en_curso') ?? [];
  const hoyPendientes = visitasFiltradas?.filter((v) => v.estado_captura === 'agendada') ?? [];
  const hoyHechas = visitasFiltradas?.filter((v) => v.estado_captura === 'consolidada') ?? [];
  const proximas = proximasFiltradas ?? [];
  const atrasadas = atrasadasFiltradas ?? [];

  const ahoraMs = Date.now();
  const esDeHoy = (f: string) => {
    const t = new Date(f).getTime();
    return t >= new Date(inicio).getTime() && t <= new Date(fin).getTime();
  };
  // Planificada de hoy con hora fija que ya pasó y no se ha empezado.
  const sinEmpezarTarde = (v: VisitaAgenda) =>
    v.hora_definida && new Date(v.fecha).getTime() < ahoraMs;

  // La siguiente cosa que hacer: la primera pendiente de hoy, o la primera
  // futura si hoy no queda ninguna. (Solo se usa si no hay ninguna en curso.)
  const proxima = hoyPendientes[0] ?? proximas[0] ?? null;
  const proximaEsHoy = !!proxima && esDeHoy(proxima.fecha);

  const hechasNombres = hoyHechas
    .map((v) => v.cliente?.nombre)
    .filter(Boolean)
    .join(', ');

  const mostrarSeccionHoy = hoyPendientes.length > 0 || hoyHechas.length > 0;
  const sinNada =
    hoyEnCurso.length === 0 &&
    hoyPendientes.length === 0 &&
    hoyHechas.length === 0 &&
    proximas.length === 0 &&
    atrasadas.length === 0;

  const sinConexion = isPaused && visitas === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey });
    refetch();
  }

  function abrirVisita(visita: VisitaAgenda) {
    if (visita.estado_captura === 'en_curso') {
      navigate(`/visita/${visita.id}`);
      return;
    }
    if (visita.estado_captura === 'consolidada') {
      navigate(`/visita/${visita.id}/detalle`);
      return;
    }
    // Planificada para OTRO día (atrasada o futura) → pantalla de gestión
    // (empezar / reprogramar / anular), no el repaso.
    if (!esDeHoy(visita.fecha)) {
      navigate(`/visita/${visita.id}/planificada`);
      return;
    }
    // Planificada para hoy → repaso rápido antes de entrar.
    if (visita.cliente) {
      navigate(`/clientes/${visita.cliente.id}/repaso?visitaId=${visita.id}`);
    }
  }

  function renderVisita(visita: VisitaAgenda, conDia: boolean) {
    const responsableId = responsables?.[visita.id];
    const deOtro = !!responsableId && responsableId !== comercial?.id;
    const subtitulo =
      [visita.objetivo || null, deOtro ? `de ${nombresComerciales?.[responsableId] ?? '…'}` : null]
        .filter(Boolean)
        .join(' · ') || undefined;
    const cuando = cuandoTexto(visita, conDia);
    return (
      <FilaNavegable
        key={visita.id}
        icono={visita.estado_captura === 'consolidada' ? 'check' : 'hoy'}
        titulo={visita.cliente?.nombre ?? 'Cliente'}
        subtitulo={subtitulo}
        valor={cuando || undefined}
        onClick={() => abrirVisita(visita)}
        chevron
      />
    );
  }

  const fechaHoy = fechaLarga(new Date());

  return (
    <div className="screen screen--split">
      <CabeceraSeccion titulo="Hoy" icono="hoy" subtitulo={fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)} />

      {esDireccionComercial && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={`chip${!soloMias ? ' chip--on' : ''}`} onClick={() => setSoloMias(false)}>
            Todas
          </button>
          <button type="button" className={`chip${soloMias ? ' chip--on' : ''}`} onClick={() => setSoloMias(true)}>
            Solo mías
          </button>
        </div>
      )}

      <div className="screen__scroll">
        {isLoading && <EstadoLista estado="cargando" mensaje="Cargando agenda…" />}
        {sinConexion && <EstadoLista estado="sin-conexion" onReintentar={reintentar} />}
        {isError && (
          <EstadoLista estado="error" mensaje="No se pudieron cargar las visitas de hoy." onReintentar={reintentar} />
        )}

        {visitas && !isError && !sinConexion && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <BloqueAhora
              enCurso={hoyEnCurso}
              proxima={proxima}
              proximaEsHoy={proximaEsHoy}
              onAbrir={(v) => abrirVisita(v as VisitaAgenda)}
            />

            {atrasadas.length > 0 && (
              <section>
                <div className="hoy-atrasadas-cab">
                  <Icono nombre="atencion" size={14} /> Atrasadas ({atrasadas.length})
                </div>
                <SeccionLista>
                  {atrasadas.slice(0, 2).map((v) => (
                    <FilaNavegable
                      key={v.id}
                      icono="atencion"
                      tono="aviso"
                      titulo={v.cliente?.nombre ?? 'Cliente'}
                      subtitulo={
                        [v.objetivo || null, `era para el ${fechaDiaMes(v.fecha)}`].filter(Boolean).join(' · ')
                      }
                      onClick={() => abrirVisita(v)}
                      chevron
                    />
                  ))}
                  <FilaNavegable
                    tono="aviso"
                    titulo={atrasadas.length > 2 ? `Resolver las ${atrasadas.length}` : 'Ver en la agenda'}
                    to="/agenda"
                  />
                </SeccionLista>
              </section>
            )}

            {mostrarSeccionHoy && (
              <SeccionLista titulo="Hoy">
                {[...hoyPendientes]
                  .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
                  .map((v) => {
                    const responsableId = responsables?.[v.id];
                    const deOtro = !!responsableId && responsableId !== comercial?.id;
                    const subtitulo =
                      [v.objetivo || null, deOtro ? `de ${nombresComerciales?.[responsableId] ?? '…'}` : null]
                        .filter(Boolean)
                        .join(' · ') || undefined;
                    const tarde = sinEmpezarTarde(v);
                    return (
                      <FilaNavegable
                        key={v.id}
                        icono={tarde ? 'atencion' : 'hoy'}
                        tono={tarde ? 'aviso' : 'neutral'}
                        titulo={v.cliente?.nombre ?? 'Cliente'}
                        subtitulo={subtitulo}
                        valor={tarde ? `sin empezar · ${hora(v.fecha)}` : cuandoTexto(v, false) || undefined}
                        onClick={() => abrirVisita(v)}
                        chevron
                      />
                    );
                  })}

                {hoyHechas.length > 0 && (
                  <FilaNavegable
                    icono="check"
                    densidad="compacta"
                    titulo="Hecho hoy"
                    valor={hechasAbiertas ? 'ocultar' : hechasNombres || undefined}
                    chevron={false}
                    onClick={() => setHechasAbiertas((x) => !x)}
                  />
                )}
                {hechasAbiertas && hoyHechas.map((v) => renderVisita(v, false))}
              </SeccionLista>
            )}

            {proximas.length > 0 ? (
              <SeccionLista titulo="Próximas">
                {proximas.slice(0, 3).map((v) => renderVisita(v, true))}
                <FilaNavegable titulo="Ver toda la agenda" to="/agenda" />
              </SeccionLista>
            ) : (
              <SeccionLista>
                <FilaNavegable titulo="Ver toda la agenda" to="/agenda" />
              </SeccionLista>
            )}

            {sinNada && (
              <EstadoLista
                estado="vacio"
                mensaje={soloMias ? 'No tienes visitas para hoy.' : 'No hay visitas para hoy.'}
              />
            )}
          </div>
        )}
      </div>

      <button className="btn btn-secondary" onClick={() => navigate('/clientes')}>
        <Icono nombre="mas" size={18} />
        Empezar visita sin planificar
      </button>
    </div>
  );
}
