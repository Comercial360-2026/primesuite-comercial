import { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaDiaMes, hora } from '@/lib/fechas';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { BarraSeleccion } from '@/components/ui/barra-seleccion';
import { SeccionColapsable } from '@/components/ui/seccion-colapsable';
import { Segmentado } from '@/components/ui/segmentado';
import { Icono } from '@/components/ui/iconos';
import { CalendarioMes } from '@/features/hoy/calendario-mes';
import { franjaDe, ordenFranja } from '@/lib/franja-visita';
import { desde } from '@/lib/volver-a';

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Pantalla de planificación: todo lo que está agendado (agendada), pasado y
// futuro. "Hoy" solo enseña el día de hoy y un enlace aquí; el detalle de
// cada visita (reprogramar / cancelar / empezar) vive en
// detalle-visita-planificada. Aquí solo se ve y se navega.
//
// Atrasadas arriba del todo. El resto, agrupado por día, y dentro de cada
// día por franja (mañana → tarde → sin hora).

interface VisitaAgenda {
  id: string;
  fecha: string;
  hora_definida: boolean;
  franja: string | null;
  objetivo: string | null;
  tipo_visita: string | null;
  cliente: { id: string; nombre: string } | null;
  proyecto: { nombre: string } | null;
}

function inicioDeHoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function claveDia(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Cabecera de día: siempre el mismo formato y con la fecha real. El prefijo
// "Hoy"/"Mañana" ayuda, pero nunca va suelto — así no choca con la franja
// "mañana" ni con "viernes, 4 de septiembre de 2026" en la de al lado.
function etiquetaDia(d: Date) {
  const hoy = inicioDeHoy();
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);
  const fecha = cap(fechaDiaMes(d)); // "Mié 2 sept"
  if (claveDia(d) === claveDia(hoy)) return `Hoy · ${fecha}`;
  if (claveDia(d) === claveDia(manana)) return `Mañana · ${fecha}`;
  return fecha;
}

// Listas que refrescar tras cancelar visitas (mismo juego que
// use-borrar-visita.ts). Prefijo: las claves llevan clienteId/fecha dentro.
const CLAVES_LISTAS_VISITAS = [
  ['agenda-planificadas'],
  ['visitas-hoy'],
  ['visitas-proximas'],
  ['visitas-atrasadas'],
  ['historial-visitas'],
  ['listado-clientes'],
  ['semaforo-cliente'],
];

export function Agenda() {
  const { comercial } = useSesionActual();
  const queryClient = useQueryClient();
  const esDireccionComercial = comercial?.rol === 'direccion_comercial';
  // Dirección Comercial entra viendo TODO el equipo — si no, una visita que
  // planificó para un compañero le desaparecería de la vista. Un comercial
  // normal solo ve lo suyo y no puede cambiarlo.
  // Igual que Hoy y Clientes: se entra viendo lo tuyo; "Todas" es abrir el
  // foco al equipo, un toque. (Antes esta pantalla entraba en "Todas" y
  // rompía la coherencia con el resto.)
  const [vistaDireccion, setVistaDireccion] = useState<'mias' | 'todas'>('mias');
  const soloMias = esDireccionComercial ? vistaDireccion === 'mias' : true;

  // Lista (por defecto) o rejilla de mes. La lista es mejor para "qué toca
  // ahora"; el mes, para ver de un vistazo cómo viene la planificación.
  const [vista, setVista] = useState<'lista' | 'mes'>('lista');
  const navigate = useNavigate();
  const location = useLocation();

  const { data: visitas, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey: ['agenda-planificadas', comercial?.id],
    enabled: !!comercial,
    refetchOnMount: 'always',
    queryFn: async (): Promise<VisitaAgenda[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select(
          'id, fecha, hora_definida, franja, objetivo, tipo_visita, cliente:cliente_id(id, nombre), proyecto:proyecto_id(nombre)'
        )
        .eq('estado_captura', 'agendada')
        .order('fecha', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VisitaAgenda[];
    },
  });

  const ids = visitas?.map((v) => v.id) ?? [];
  const { data: responsables } = useQuery({
    queryKey: ['agenda-responsables', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select('visita_id, comercial_id')
        .eq('rol', 'responsable')
        .in('visita_id', ids);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.visita_id, p.comercial_id]));
    },
  });

  const { data: participantes } = useQuery({
    queryKey: ['agenda-participantes', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select('visita_id, comercial_id')
        .in('visita_id', ids)
        // Quien rechazó o fue expulsado no cuenta como participante.
        .in('estado', ['pendiente', 'aceptado']);
      if (error) throw error;
      const m: Record<string, string[]> = {};
      for (const p of data ?? []) (m[p.visita_id] ??= []).push(p.comercial_id);
      return m;
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

  const { atrasadas, dias, mias } = useMemo(() => {
    const hoy0 = inicioDeHoy().getTime();
    const mias = (visitas ?? []).filter(
      (v) => !soloMias || (!!comercial && !!participantes?.[v.id]?.includes(comercial.id))
    );
    const atr = mias.filter((v) => new Date(v.fecha).getTime() < hoy0);
    const resto = mias.filter((v) => new Date(v.fecha).getTime() >= hoy0);

    const porDia = new Map<string, { fecha: Date; visitas: VisitaAgenda[] }>();
    for (const v of resto) {
      const d = new Date(v.fecha);
      const k = claveDia(d);
      if (!porDia.has(k)) porDia.set(k, { fecha: d, visitas: [] });
      porDia.get(k)!.visitas.push(v);
    }
    const listaDias = [...porDia.values()].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    for (const dia of listaDias) {
      dia.visitas.sort((a, b) => {
        const fa = franjaDe(a.fecha, a.hora_definida, a.franja);
        const fb = franjaDe(b.fecha, b.hora_definida, b.franja);
        return ordenFranja[fa] - ordenFranja[fb] || a.fecha.localeCompare(b.fecha);
      });
    }
    return { atrasadas: atr, dias: listaDias, mias };
  }, [visitas, participantes, soloMias, comercial]);

  // Modo seleccionar → cancelar varias planificadas de una pasada. Cancelar
  // = eliminar_visita_completa (una 'agendada' no tiene fotos/audios). Solo
  // sobre visitas propias: las "de otro" salen deshabilitadas.
  const [seleccionando, setSeleccionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [progresoLote, setProgresoLote] = useState<{ hecho: number; total: number } | null>(null);
  const [resultadoLote, setResultadoLote] = useState<string | null>(null);
  const corriendoLote = progresoLote !== null;

  function alternarMarca(id: string) {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function entrarSeleccion() {
    setResultadoLote(null);
    setMarcadas(new Set());
    setSeleccionando(true);
  }

  function salirSeleccion() {
    if (corriendoLote) return;
    setSeleccionando(false);
    setMarcadas(new Set());
    setResultadoLote(null);
  }

  async function cancelarLote() {
    if (corriendoLote) return;
    const ids = mias.map((v) => v.id).filter((id) => marcadas.has(id));
    if (!ids.length) return;
    if (!navigator.onLine) {
      setResultadoLote('Necesitas conexión para anular visitas.');
      return;
    }
    setResultadoLote(null);
    setProgresoLote({ hecho: 0, total: ids.length });
    const fallos: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase.rpc('eliminar_visita_completa', { p_visita_id: ids[i] });
      if (error) fallos.push(ids[i]);
      setProgresoLote({ hecho: i + 1, total: ids.length });
    }
    for (const k of CLAVES_LISTAS_VISITAS) queryClient.invalidateQueries({ queryKey: k });
    setProgresoLote(null);
    if (fallos.length === 0) {
      setSeleccionando(false);
      setMarcadas(new Set());
    } else {
      setMarcadas(new Set(fallos));
      setResultadoLote(
        `Se anularon ${ids.length - fallos.length}. ${fallos.length} no se pudieron anular.`
      );
    }
  }

  // Anular una sola visita — la acción que revela el gesto de deslizar.
  async function anularUna(id: string) {
    if (!navigator.onLine) {
      setResultadoLote('Necesitas conexión para anular visitas.');
      return;
    }
    setResultadoLote(null);
    const { error } = await supabase.rpc('eliminar_visita_completa', { p_visita_id: id });
    if (error) {
      setResultadoLote('No se pudo anular la visita. Inténtalo de nuevo.');
      return;
    }
    for (const k of CLAVES_LISTAS_VISITAS) queryClient.invalidateQueries({ queryKey: k });
  }

  // `atrasada` = fila de la sección Atrasadas: icono ⚠, tono aviso, y en vez
  // de la hora, para cuándo estaba. Las filas de un día llevan icono de
  // calendario y su hora (ya no hay subcabecera de franja que lo diga).
  function fila(v: VisitaAgenda, atrasada: boolean) {
    const resp = responsables?.[v.id];
    const deOtro = resp && resp !== comercial?.id;
    const deQuien = deOtro ? `de ${nombresComerciales?.[resp] ?? '…'}` : '';
    const horaTexto = v.hora_definida ? hora(v.fecha) : 'sin hora';
    // Toda visita cuelga de un proyecto con nombre (modelo estricto tras el
    // fin de `es_general`), así que se muestra siempre. El `?? ''` es solo
    // defensivo por si el join no trae la fila.
    const proyectoTexto = v.proyecto?.nombre ?? '';
    return (
      <FilaNavegable
        key={v.id}
        icono={atrasada ? 'atencion' : 'hoy'}
        tono={atrasada ? 'aviso' : 'neutral'}
        titulo={v.cliente?.nombre ?? 'Cliente'}
        subtitulo={
          // El "de X" (visita de otro comercial) va en el subtítulo, NO en
          // `valor`: ahí es largo y en un iPhone estrecho aplasta el título
          // hasta partirlo en varias líneas. `valor` se queda solo con la hora.
          (atrasada
            ? [v.objetivo, proyectoTexto, `era para el ${cap(fechaDiaMes(v.fecha))}`, deQuien]
            : [v.objetivo, proyectoTexto, deQuien]
          )
            .filter(Boolean)
            .join(' · ') || undefined
        }
        valor={atrasada ? undefined : horaTexto}
        to={`/visita/${v.id}/planificada`}
        state={desde(location)}
        seleccion={
          seleccionando
            ? { activa: true, marcada: marcadas.has(v.id), onToggle: () => alternarMarca(v.id) }
            : undefined
        }
        disabled={seleccionando && !!deOtro}
        swipe={
          deOtro
            ? undefined
            : { etiqueta: 'Anular', icono: 'borrar', tono: 'riesgo', onAccion: () => anularUna(v.id) }
        }
      />
    );
  }

  const vacio = !isLoading && !isError && atrasadas.length === 0 && dias.length === 0;

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo="Agenda"
        ayuda="agenda"
        volverA="/"
        derecha={
          !seleccionando ? (
            <button
              type="button"
              className="boton-icono"
              aria-label="Planificar visita"
              title="Planificar visita"
              onClick={() => navigate('/planificar')}
            >
              <Icono nombre="mas" size={18} />
            </button>
          ) : undefined
        }
      />

      {!seleccionando && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Segmentado
            opciones={
              [
                { valor: 'lista', etiqueta: 'Lista' },
                { valor: 'mes', etiqueta: 'Mes' },
              ] as const
            }
            valor={vista}
            onCambio={setVista}
          />
          {vista === 'lista' && (atrasadas.length > 0 || dias.length > 0) && (
            <button type="button" className="chip" style={{ marginLeft: 'auto' }} onClick={entrarSeleccion}>
              Seleccionar
            </button>
          )}
        </div>
      )}

      {esDireccionComercial && !seleccionando && (
        <Segmentado
          opciones={
            [
              { valor: 'mias', etiqueta: 'Solo mías' },
              { valor: 'todas', etiqueta: 'Todas' },
            ] as const
          }
          valor={vistaDireccion}
          onCambio={setVistaDireccion}
        />
      )}

      {seleccionando && (
        <>
          <BarraSeleccion
            n={marcadas.size}
            onCancelar={salirSeleccion}
            acciones={[
              {
                etiqueta: corriendoLote
                  ? `Anulando ${progresoLote!.hecho} de ${progresoLote!.total}…`
                  : `Anular (${marcadas.size})`,
                icono: 'borrar',
                tono: 'riesgo',
                onClick: cancelarLote,
                disabled: corriendoLote || marcadas.size === 0,
              },
            ]}
          />
          {resultadoLote && <div className="field-error-text">{resultadoLote}</div>}
        </>
      )}

      {!seleccionando && resultadoLote && (
        <div className="field-error-text">{resultadoLote}</div>
      )}

      <div className="screen__scroll">
        {isLoading && <EstadoLista estado="cargando" />}
        {!isLoading && !isError && isPaused && (
          <EstadoLista estado="sin-conexion" onReintentar={() => refetch()} />
        )}
        {isError && (
          <EstadoLista estado="error" mensaje="No se pudo cargar la agenda." onReintentar={() => refetch()} />
        )}

        {!isLoading && !isError && vista === 'mes' && (
          <CalendarioMes visitas={mias} renderVisita={(v) => fila(v, false)} />
        )}

        {vista === 'lista' && vacio && (
          <EstadoLista
            estado="vacio"
            mensaje="No hay visitas planificadas. Toca «+» para planificar una."
          />
        )}

        {vista === 'lista' && (atrasadas.length > 0 || dias.length > 0) && (
          <div className="lista-agrupada">
            {/* Atrasadas: un montón a resolver, no a ojear. Plegable y cerrado
                de inicio para que no empuje hacia abajo los días que sí miras.
                Icono de atención + tono ámbar, igual que en "Hoy" — no un
                "⚠" suelto en el texto (única grieta de emoji de esta
                pantalla; el resto de la app ya no lo usa). */}
            {atrasadas.length > 0 && (
              <SeccionColapsable
                titulo={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icono nombre="atencion" size={14} /> Atrasadas
                  </span>
                }
                cantidad={atrasadas.length}
                tono="aviso"
              >
                <div className="seccion-lista__grupo">{atrasadas.map((v) => fila(v, true))}</div>
              </SeccionColapsable>
            )}

            {/* Un grupo por día. Dentro, las visitas ya vienen ordenadas
                mañana → tarde → sin hora (useMemo); cada fila lleva su hora, así
                que no hacen falta subcabeceras de franja. */}
            {dias.map((dia) => (
              <SeccionLista key={claveDia(dia.fecha)} titulo={etiquetaDia(dia.fecha)}>
                {dia.visitas.map((v) => fila(v, false))}
              </SeccionLista>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
