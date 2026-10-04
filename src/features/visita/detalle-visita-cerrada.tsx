import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta, esFechaVencida } from '@/lib/fechas';
import {
  ETAPA_LABEL,
  PRIORIDAD_LABEL,
  PRIORIDAD_ORDEN,
  TIPO_VISITA_LABEL,
  etiqueta,
} from '@/lib/etiquetas-visita';
import type { Area } from '@/lib/vocabulario';
import { areasDeHallazgos } from '@/lib/hallazgo-areas';
import { useDescargarInforme } from '@/hooks/use-descargar-informe';
import { DescargasVisita } from '@/features/visita/descargas-visita';
import { useBorrarVisita } from '@/hooks/use-borrar-visita';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { conReintentoDeSesion } from '@/lib/con-reintento-de-sesion';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { ConfirmarBorradoVisita } from '@/features/visita/confirmar-borrado-visita';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { useVolverA, desde } from '@/lib/volver-a';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { SeccionColapsable } from '@/components/ui/seccion-colapsable';
import { TextareaDictado, type RefCampoDictado } from '@/components/ui/campo-dictado';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { FilaDato } from '@/components/ui/fila-dato';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Aviso } from '@/components/ui/aviso';
import { Icono } from '@/components/ui/iconos';
import { Segmentado } from '@/components/ui/segmentado';
import { ordenarZonasPorUso } from '@/lib/zonas-visita';
import { MapaFotos } from '@/components/ui/mapa-fotos';
import { PreguntaIAHoja, usePuedePreguntarIA } from '@/features/clientes/pregunta-ia-hoja';
import { BriefingHoja } from '@/features/visita/briefing-hoja';
import { plural } from '@/lib/texto';
import { uuid } from '@/lib/uuid';
import { ACCEPT_DOCUMENTO, LIMITE_DOCUMENTO_BYTES, formatearBytes as formatearTamano, mimeDeDocumento, motivoRechazoSubida } from '@/lib/documentos-visita';
import { regenerarResumenSiAuto } from '@/lib/regenerar-resumen';
import { MEDIO_VISITA, medioDe, esNoPresencial } from '@/lib/medio-visita';
import { VisorFotos } from './visor-fotos';

// Repaso de solo lectura de una visita ya cerrada. Cuenta lo mismo que el
// informe.pdf y en el mismo orden: cabecera + KPI → resumen → objetivo →
// oportunidades → hallazgos → próximos pasos → anexo (notas · fotos ·
// audios) → informe.

interface Foto {
  id: string;
  titulo: string | null;
  url: string | null;
  ubicacion_nombre: string | null;
  latitud: number | null;
  longitud: number | null;
  archivadaSharepoint: boolean;
}
interface DetalleVisita {
  fecha: string;
  tipo_visita: string | null;
  medio: string;
  objetivo: string | null;
  estado_captura: string;
  cerrada_en: string | null;
  reabierta_en: string | null;
  resumen_texto: string | null;
  resumen_origen: string | null;
  /** Cerrada sola por inactividad (migración 135), no por el comercial. */
  cierre_automatico: boolean;
  cliente_id: string | null;
  cliente_nombre: string;
  fotos: Foto[];
  audios: Array<{ id: string; titulo: string | null; url: string | null; archivadaSharepoint: boolean; zona_texto: string | null }>;
  hayArchivadoSharepoint: boolean;
  notas: Array<{ id: string; titulo: string | null; contenido_texto: string | null; zona_texto: string | null }>;
  documentos: Array<{ id: string; titulo: string | null; nombre_original: string | null; bytes: number | null }>;
  hallazgos: Array<{ id: string; nota: string | null; zona_texto: string | null; areas: Area[] }>;
  oportunidades: Array<{ id: string; titulo: string; etapa: string; prioridad: string; valor_estimado: number | null; zona_texto: string | null }>;
  proximosPasos: Array<{ id: string; descripcion: string; fecha_objetivo: string | null; estado: string; zona_texto: string | null }>;
}

const URL_FIRMADA_SEGUNDOS = 60 * 10;

// Enlace de descarga de una foto/audio: firmado de Supabase Storage mientras
// siga ahí, o el enlace temporal de SharePoint (obtener-url-archivo-
// sharepoint) una vez archivado — nunca guardado, se pide al vuelo cada vez
// que se abre la visita (ver diseño, "Flujo de lectura").
async function urlsDeCapturas(
  lista: { id: string; storage_path: string | null; ubicacion_archivo?: string | null }[],
  bucket: 'fotos-visita' | 'audios-visita'
): Promise<Map<string, string | null>> {
  const urls = new Map<string, string | null>();
  // Las que siguen en Storage se firman TODAS en una sola petición (antes una por foto: con 34 fotos
  // la pantalla tardaba 6-14 s en salir).
  const enStorage = lista.filter((c) => c.storage_path);
  if (enStorage.length > 0) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(
      enStorage.map((c) => c.storage_path!),
      URL_FIRMADA_SEGUNDOS
    );
    // Se casan por ruta (no por posición); si una falla viene con error y sin enlace.
    const porRuta = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
    enStorage.forEach((c) => urls.set(c.id, porRuta.get(c.storage_path!) ?? null));
  }
  await Promise.all(
    lista
      .filter((c) => !c.storage_path)
      .map(async (c) => {
        if (c.ubicacion_archivo !== 'sharepoint') return urls.set(c.id, null);
        const { data, error } = await supabase.functions.invoke('obtener-url-archivo-sharepoint', {
          body: { capturaId: c.id },
        });
        urls.set(c.id, error || !data?.url ? null : (data.url as string));
      })
  );
  return urls;
}

function esVencido(p: { fecha_objetivo: string | null; estado: string }): boolean {
  if (p.estado !== 'pendiente') return false;
  return esFechaVencida(p.fecha_objetivo);
}

export function DetalleVisitaCerrada() {
  const { visitaId } = useParams<{ visitaId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  // Se llega desde Hoy, la Agenda, Mi espacio, el historial del proyecto o
  // el cierre de la propia visita. El ← vuelve al origen; si no consta, a Hoy.
  const volver = useVolverA('/');
  // Esta pantalla es a su vez origen de hallazgo/oportunidad/próximo paso:
  // estampa su URL para que el ← de esas vuelva aquí, no a Hoy.
  const origen = desde(location);

  const { estadoDe, descargar, progresoDe, motivoDe } = useDescargarInforme();
  const [visorIndice, setVisorIndice] = useState<number | null>(null);

  // Editar a mano el resumen de la visita (pasa a `resumen_origen = 'manual'`).
  // UPDATE directo, sin cola offline — requiere conexión, como "Editar datos"
  // del cliente.
  const [editandoResumen, setEditandoResumen] = useState(false);
  const [borradorResumen, setBorradorResumen] = useState('');
  const refDictadoResumen = useRef<RefCampoDictado>(null);
  const guardadoResumen = useAccionAsync();

  const { comercial } = useSesionActual();
  const esDireccionComercial = comercial?.rol === 'direccion_comercial';
  // Mismo criterio que el backend (eliminar_visita_completa: responsable de
  // la visita o Dirección) — ver hallazgo gemelo en Ficha de cliente
  // (auditoría 2026-09-05): la UI no debe ofrecer "Borrar" a un simple
  // acompañante, aunque el servidor lo fuera a rechazar igualmente. Se pide
  // rol+estado juntos (no solo si "soy responsable") porque también decide
  // si puedo pedir reabrir la visita como participante normal.
  const { data: miParticipacion } = useQuery({
    queryKey: ['mi-participacion-visita', visitaId, comercial?.id],
    enabled: !!visitaId && !!comercial?.id && !esDireccionComercial,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('visita_participante')
        .select('rol, estado')
        .eq('visita_id', visitaId!)
        .eq('comercial_id', comercial!.id)
        .maybeSingle();
      if (err) throw err;
      return data;
    },
  });
  const soyResponsable = miParticipacion?.rol === 'responsable' && miParticipacion?.estado === 'aceptado';
  const puedeBorrarVisita = esDireccionComercial || soyResponsable;

  // Archivado a SharePoint con problemas: solo Dirección lo ve. Para el
  // comercial no cambia nada (el archivo sigue en Supabase y el cron lo
  // reintenta cada día); Dirección necesita el motivo para saber si hay que
  // revisar el flujo de Power Automate.
  const { data: fallosArchivado } = useQuery({
    queryKey: ['fallos-archivado', visitaId],
    enabled: !!visitaId && esDireccionComercial,
    queryFn: async (): Promise<string[]> => {
      const hace1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('captura_libre')
        .select('error_archivado, intento_archivado_en')
        .eq('visita_id', visitaId!)
        .eq('ubicacion_archivo', 'supabase')
        .not('storage_path', 'is', null)
        .or(`error_archivado.not.is.null,intento_archivado_en.lt.${hace1h}`);
      if (error) throw error;
      return (data ?? []).map((c) => c.error_archivado ?? 'Sin respuesta de SharePoint tras el envío (revisar el flujo de Power Automate).');
    },
  });
  // Reabrir directo: mismo criterio que borrar (responsable de la visita o
  // Dirección — lo hace cumplir también el trigger de la BD, esto solo
  // decide si se ofrece el botón). El resto de participantes aceptados no
  // pueden reabrir solos: piden y el responsable/Dirección decide.
  const puedeReabrirDirecto = puedeBorrarVisita;
  const puedeSolicitarReapertura =
    !puedeReabrirDirecto && miParticipacion?.rol !== 'responsable' && miParticipacion?.estado === 'aceptado';

  const queryKey = ['detalle-visita-cerrada', visitaId];
  const { data, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey,
    enabled: !!visitaId,
    queryFn: async (): Promise<DetalleVisita> => {
      const [
        { data: visita, error: errorVisita },
        { data: capturas, error: errorCapturas },
        { data: hallazgos, error: errorHallazgos },
        { data: oportunidades, error: errorOportunidades },
        { data: proximosPasos, error: errorProximosPasos },
      ] = await Promise.all([
        supabase
          .from('visita')
          .select(
            'fecha, tipo_visita, medio, objetivo, estado_captura, cerrada_en, reabierta_en, resumen_texto, resumen_origen, cierre_automatico, cliente_id, cliente:cliente_id(nombre)'
          )
          .eq('id', visitaId!)
          .single(),
        supabase
          .from('captura_libre')
          .select(
            'id, tipo, titulo, contenido_texto, storage_path, latitud, longitud, zona_texto, nombre_original, bytes, ubicacion:ubicacion_id(nombre), ubicacion_archivo, ruta_sharepoint'
          )
          .eq('visita_id', visitaId!)
          .order('creado_en', { ascending: true }),
        supabase
          .from('hallazgo')
          .select('id, nota, zona_texto')
          .eq('visita_id', visitaId!)
          .order('creado_en', { ascending: true }),
        supabase
          .from('oportunidad')
          .select('id, titulo, etapa, prioridad, valor_estimado, zona_texto')
          .eq('visita_origen_id', visitaId!),
        supabase
          .from('proximo_paso')
          .select('id, descripcion, fecha_objetivo, estado, zona_texto')
          .eq('visita_id', visitaId!)
          .order('fecha_objetivo', { ascending: true }),
      ]);

      if (errorVisita) throw errorVisita;
      if (errorCapturas) throw errorCapturas;
      if (errorHallazgos) throw errorHallazgos;
      if (errorOportunidades) throw errorOportunidades;
      if (errorProximosPasos) throw errorProximosPasos;

      const fotosBrutas = (capturas ?? []).filter((c) => c.tipo === 'foto');
      const audiosBrutos = (capturas ?? []).filter((c) => c.tipo === 'audio');
      const notas = (capturas ?? []).filter((c) => c.tipo === 'nota');
      const documentos = (capturas ?? []).filter((c) => c.tipo === 'documento');

      const [urlsFotos, urlsAudios] = await Promise.all([
        urlsDeCapturas(fotosBrutas, 'fotos-visita'),
        urlsDeCapturas(audiosBrutos, 'audios-visita'),
      ]);
      const fotos = await Promise.all(
        fotosBrutas.map(async (f) => {
          const ubicacion_nombre =
            (f as { zona_texto?: string | null }).zona_texto ??
            (f.ubicacion as unknown as { nombre: string } | null)?.nombre ??
            null;
          const geo = { latitud: f.latitud ?? null, longitud: f.longitud ?? null };
          const url = urlsFotos.get(f.id) ?? null;
          const archivadaSharepoint = f.ubicacion_archivo === 'sharepoint';
          return { id: f.id, titulo: f.titulo, url, ubicacion_nombre, archivadaSharepoint, ...geo };
        })
      );
      const audios = await Promise.all(
        audiosBrutos.map(async (a) => {
          const url = urlsAudios.get(a.id) ?? null;
          return {
            id: a.id,
            titulo: a.titulo,
            url,
            archivadaSharepoint: a.ubicacion_archivo === 'sharepoint',
            zona_texto: (a as { zona_texto?: string | null }).zona_texto ?? null,
          };
        })
      );

      // Áreas del catálogo de cada hallazgo (prompt maestro 11, Fase 2).
      const mapaAreasHz = await areasDeHallazgos((hallazgos ?? []).map((h) => h.id));

      return {
        fecha: visita!.fecha,
        tipo_visita: visita!.tipo_visita,
        medio: visita!.medio,
        objetivo: visita!.objetivo,
        estado_captura: visita!.estado_captura,
        cerrada_en: (visita as { cerrada_en?: string | null }).cerrada_en ?? null,
        reabierta_en: (visita as { reabierta_en?: string | null }).reabierta_en ?? null,
        resumen_texto: visita!.resumen_texto,
        resumen_origen: visita!.resumen_origen,
        cierre_automatico: visita!.cierre_automatico,
        cliente_id: (visita! as { cliente_id: string | null }).cliente_id,
        cliente_nombre: (visita!.cliente as unknown as { nombre: string } | null)?.nombre ?? 'cliente',
        fotos,
        audios,
        hayArchivadoSharepoint: fotos.some((f) => f.archivadaSharepoint) || audios.some((a) => a.archivadaSharepoint),
        notas: notas.map((n) => ({
          id: n.id,
          titulo: n.titulo,
          contenido_texto: n.contenido_texto,
          zona_texto: (n as { zona_texto?: string | null }).zona_texto ?? null,
        })),
        documentos: documentos.map((d) => ({
          id: d.id,
          titulo: d.titulo,
          nombre_original: d.nombre_original,
          bytes: d.bytes,
        })),
        hallazgos: (hallazgos ?? []).map((h) => ({
          id: h.id,
          nota: h.nota,
          zona_texto: h.zona_texto,
          areas: mapaAreasHz.get(h.id) ?? [],
        })),
        oportunidades: (oportunidades ?? []) as DetalleVisita['oportunidades'],
        proximosPasos: proximosPasos ?? [],
      };
    },
  });

  // Memoizado, no recalculado (y con nueva referencia de array) en cada
  // render del padre: MapaFotos usa la referencia de `fotos` para decidir
  // si remontar el mapa — sin esto, cualquier re-render (el intervalo del
  // cronómetro, escribir en un campo hermano…) perdía el zoom/pan que el
  // comercial acababa de hacer a mano.
  const fotosMapa = useMemo(() => {
    const situadas = (data?.fotos ?? []).filter(
      (f): f is Foto & { latitud: number; longitud: number } => f.latitud != null && f.longitud != null
    );
    return situadas.map((f) => ({
      id: f.id,
      url: f.url,
      titulo: f.titulo,
      lat: f.latitud,
      lng: f.longitud,
    }));
  }, [data?.fotos]);

  // Una visita cerrada sola por inactividad (migración 135) nace SIN resumen: su texto
  // lo genera el cliente (reglas), así que se genera la primera vez que se abre.
  // Solo si es el automático ('reglas'): uno escrito a mano nunca se toca.
  const resumenGenerado = useRef(false);
  useEffect(() => {
    if (!data || resumenGenerado.current) return;
    if (data.estado_captura !== 'consolidada' || data.resumen_texto || data.resumen_origen !== 'reglas') return;
    resumenGenerado.current = true;
    void regenerarResumenSiAuto(visitaId).then(() =>
      queryClient.invalidateQueries({ queryKey: ['detalle-visita-cerrada', visitaId] })
    );
  }, [data, visitaId, queryClient]);

  const sinConexion = isPaused && data === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey });
    refetch();
  }

  // Al borrar, la visita deja de existir: `navigate(-1)` puede devolver a su
  // propia pantalla de cierre (`/visita/:id/cierre`), una ruta muerta pintada
  // con caché. Vamos a la ficha del cliente (destino vivo) y con `replace`
  // para que el ← del navegador tampoco vuelva a la visita borrada.
  const borrar = useBorrarVisita({
    onBorrada: () =>
      navigate(data?.cliente_id ? `/clientes/${data.cliente_id}` : '/', { replace: true }),
  });

  // Cola local de esta visita: hasta saber que está cerrada no se consulta (esta misma ruta la usa
  // también Mi espacio para visitas 'agendada', planificadas y aún sin cerrar).
  const idCerrada = data?.estado_captura === 'consolidada' ? visitaId : undefined;
  const { operaciones: colaLocalVisita } = useSyncQueue(idCerrada);

  const puedeEditarResumen = puedeBorrarVisita;

  // Reabrir la visita (responsable/Dirección, directo) o pedirlo (el resto
  // de participantes aceptados): un botón que abre un ConfirmacionBorrado
  // antes de escribir nada.
  const { iniciarVisita } = useVisitaActivaContext();
  const [queriendoReabrir, setQueriendoReabrir] = useState(false);
  const [queriendoSolicitar, setQueriendoSolicitar] = useState(false);
  const reabriendo = useAccionAsync();
  const solicitando = useAccionAsync();

  // Si ya pedí reabrir esta visita y sigue sin resolver, no se ofrece pedirlo
  // otra vez (la BD también lo impediría con el índice único) — se avisa de
  // que ya se pidió.
  const { data: miSolicitudPendiente } = useQuery({
    queryKey: ['mi-solicitud-reapertura', visitaId, comercial?.id],
    enabled: !!visitaId && !!comercial?.id && puedeSolicitarReapertura,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('visita_solicitud_reapertura')
        .select('id')
        .eq('visita_id', visitaId!)
        .eq('solicitado_por', comercial!.id)
        .eq('estado', 'pendiente')
        .maybeSingle();
      if (err) throw err;
      return data;
    },
  });

  async function reabrirDirecto() {
    if (!visitaId || !comercial) return;
    await reabriendo.ejecutar(
      async () => {
        await conReintentoDeSesion(
          () =>
            supabase
              .from('visita')
              .update(
                { estado_captura: 'en_curso', reabierta_en: new Date().toISOString(), reabierta_por: comercial.id },
                { count: 'exact' }
              )
              .eq('id', visitaId),
          'No se ha podido reabrir (0 filas afectadas). Puede que no tengas permiso.'
        );
      },
      {
        onExito: () => {
          iniciarVisita({ id: visitaId, clienteNombre: data?.cliente_nombre ?? '' });
          navigate(`/visita/${visitaId}`);
        },
      }
    );
  }

  async function pedirReapertura() {
    if (!visitaId || !comercial) return;
    await solicitando.ejecutar(
      async () => {
        await conReintentoDeSesion(
          () =>
            supabase
              .from('visita_solicitud_reapertura')
              .insert({ visita_id: visitaId, solicitado_por: comercial.id }, { count: 'exact' }),
          'No se ha podido enviar la solicitud (0 filas afectadas).'
        );
      },
      {
        onExito: () => {
          setQueriendoSolicitar(false);
          queryClient.invalidateQueries({ queryKey: ['mi-solicitud-reapertura', visitaId, comercial.id] });
        },
      }
    );
  }

  function abrirEditarResumen() {
    setBorradorResumen(data?.resumen_texto ?? '');
    guardadoResumen.limpiarError();
    setEditandoResumen(true);
  }

  async function guardarResumen() {
    if (!visitaId) return;
    if (!navigator.onLine) {
      guardadoResumen.establecerError('Necesitas conexión para editar el resumen.');
      return;
    }
    const texto = (refDictadoResumen.current?.consolidar() ?? borradorResumen).trim();
    await guardadoResumen.ejecutar(
      async () => {
        await conReintentoDeSesion(
          () =>
            supabase
              .from('visita')
              .update({ resumen_texto: texto || null, resumen_origen: 'manual' }, { count: 'exact' })
              .eq('id', visitaId),
          'No se ha podido guardar el resumen (0 filas afectadas). Puede que no tengas permiso.'
        );
      },
      {
        onExito: () => {
          setEditandoResumen(false);
          queryClient.invalidateQueries({ queryKey });
        },
      }
    );
  }

  const estadoLegible: Record<string, string> = {
    en_curso: 'en curso',
    consolidada: 'cerrada',
    agendada: 'planificada',
  };

  // --- Derivados (solo con datos) ---
  const totalEuros = data ? data.oportunidades.reduce((s, o) => s + (o.valor_estimado ?? 0), 0) : 0;
  const hallazgosN = data ? data.hallazgos.length : 0;
  const vencidosN = data ? data.proximosPasos.filter(esVencido).length : 0;

  const fotosPorUbi = new Map<string, { foto: Foto; idx: number }[]>();
  data?.fotos.forEach((foto, idx) => {
    const k = foto.ubicacion_nombre ?? 'Sin ubicación asignada';
    const lista = fotosPorUbi.get(k) ?? [];
    lista.push({ foto, idx });
    fotosPorUbi.set(k, lista);
  });

  const kpis: { texto: string; alerta: boolean }[] = [];
  if (totalEuros > 0) kpis.push({ texto: `${totalEuros.toLocaleString('es-ES')} € en oportunidades`, alerta: false });
  if (hallazgosN > 0) kpis.push({ texto: `${hallazgosN} hallazgo${hallazgosN === 1 ? '' : 's'}`, alerta: false });
  if (vencidosN > 0)
    kpis.push({ texto: `${vencidosN} paso${vencidosN === 1 ? '' : 's'} vencido${vencidosN === 1 ? '' : 's'}`, alerta: true });

  // --- Zonas: si la visita tiene zonas, se cuenta zona a zona (todo lo de una zona junto) y lo que no
  // tiene zona va al final como «Sin zona»; «Tipo» es la alternativa. Mismo criterio que los informes. ---
  const zonaDeTexto = (z: string | null | undefined) => (z ?? '').trim();
  const contadorZonas = new Map<string, number>();
  const cuentaZona = (z: string | null | undefined) => contadorZonas.set(zonaDeTexto(z), (contadorZonas.get(zonaDeTexto(z)) ?? 0) + 1);
  data?.fotos.forEach((f) => cuentaZona(f.ubicacion_nombre));
  data?.audios.forEach((a) => cuentaZona(a.zona_texto));
  data?.notas.forEach((n) => cuentaZona(n.zona_texto));
  data?.hallazgos.forEach((h) => cuentaZona(h.zona_texto));
  data?.oportunidades.forEach((o) => cuentaZona(o.zona_texto));
  data?.proximosPasos.forEach((p) => cuentaZona(p.zona_texto));
  const zonasOrden = ordenarZonasPorUso(contadorZonas);
  const hayZonas = zonasOrden.some((z) => z !== '');
  const [verPorZona, setVerPorZona] = useState<boolean | null>(null);
  const porZona = hayZonas && (verPorZona ?? true);

  type Datos = NonNullable<typeof data>;
  const bloqueOportunidades = (lista: Datos['oportunidades'], enZona = false) =>
    lista.length > 0 && (
      <SeccionLista titulo={`Oportunidades (${lista.length})`}>
        {[...lista]
          .sort((a, b) => (PRIORIDAD_ORDEN[a.prioridad] ?? 9) - (PRIORIDAD_ORDEN[b.prioridad] ?? 9))
          .map((o) => (
            <FilaNavegable
              key={o.id}
              titulo={o.titulo}
              subtitulo={[
                `${etiqueta(ETAPA_LABEL, o.etapa)} · ${etiqueta(PRIORIDAD_LABEL, o.prioridad).toLowerCase()}`,
                enZona ? null : o.zona_texto?.trim() || null,
              ]
                .filter(Boolean)
                .join(' · ')}
              valor={o.valor_estimado != null ? `${o.valor_estimado.toLocaleString('es-ES')} €` : undefined}
              to={`/oportunidades/${o.id}`}
              state={origen}
            />
          ))}
        {lista.reduce((t, o) => t + (o.valor_estimado ?? 0), 0) > 0 && (
          <FilaDato
            etiqueta="Total estimado"
            valor={`${lista.reduce((t, o) => t + (o.valor_estimado ?? 0), 0).toLocaleString('es-ES')} €`}
          />
        )}
      </SeccionLista>
    );

  const bloqueHallazgos = (lista: Datos['hallazgos'], enZona = false) =>
    lista.length > 0 && (
      <SeccionLista titulo={`Hallazgos (${lista.length})`}>
        {lista.map((h) => (
          <FilaNavegable
            key={h.id}
            titulo={h.nota?.trim() || 'Hallazgo'}
            subtitulo={enZona ? undefined : h.zona_texto?.trim() || undefined}
            valor={h.areas.map((a) => a.nombre).join(' · ') || undefined}
            valorTenue
            to={`/hallazgos/${h.id}`}
            state={origen}
          />
        ))}
      </SeccionLista>
    );

  const bloquePasos = (lista: Datos['proximosPasos'], enZona = false) =>
    lista.length > 0 && (
      <SeccionLista titulo={`Próximos pasos (${lista.length})`}>
        {lista.map((p) => {
          const vencido = esVencido(p);
          return (
            <FilaNavegable
              key={p.id}
              titulo={p.descripcion}
              subtitulo={enZona ? undefined : p.zona_texto?.trim() || undefined}
              tono={vencido ? 'riesgo' : 'neutral'}
              valor={
                vencido ? (
                  <span style={{ color: 'var(--danger-600)', fontWeight: 600 }}>
                    Vencido{p.fecha_objetivo ? ` · ${fechaCorta(p.fecha_objetivo)}` : ''}
                  </span>
                ) : p.fecha_objetivo ? (
                  fechaCorta(p.fecha_objetivo)
                ) : undefined
              }
              to={`/proximos-pasos/${p.id}`}
              state={origen}
            />
          );
        })}
      </SeccionLista>
    );

  const bloqueNotas = (lista: Datos['notas'], enZona = false) =>
    lista.length > 0 && (
      <div>
        <div className="seccion-lista__cabecera" style={{ paddingBottom: 6 }}>
          {enZona ? '' : 'Anexo · '}Notas ({lista.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lista.map((n) => (
            <button
              key={n.id}
              type="button"
              className="dvc-bloque dvc-bloque--accion"
              onClick={() => navigate(`/capturas/${n.id}`, { state: origen })}
            >
              {n.titulo && <div style={{ fontWeight: 500, marginBottom: 2 }}>{n.titulo}</div>}
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-700)', lineHeight: 1.4 }}>{n.contenido_texto}</div>
              {!enZona && n.zona_texto?.trim() && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>{n.zona_texto}</div>
              )}
              <span aria-hidden className="dvc-bloque__editar">
                <Icono nombre="editar" size={14} />
              </span>
            </button>
          ))}
        </div>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--ink-400)',
            marginTop: 4,
            paddingInline: 'var(--fila-pad-x)',
          }}
        >
          Toca una nota para revisarla, editarla o marcarla como hallazgo u oportunidad.
        </div>
      </div>
    );

  const bloqueMapa =
    fotosMapa.length > 0 && (
      <SeccionColapsable recordarComo={`visita-${visitaId}-mapa`} titulo="Mapa de fotos" cantidad={fotosMapa.length}>
        <MapaFotos fotos={fotosMapa} />
      </SeccionColapsable>
    );

  // `grupos`: fotos agrupadas (por zona en «Tipo»; una sola en «Zona», donde el título ya es la zona).
  const bloqueFotos = (grupos: [string, { foto: Foto; idx: number }[]][], enZona = false) => {
    const total = grupos.reduce((t, [, l]) => t + l.length, 0);
    return (
      total > 0 && (
        <div>
          <div className="seccion-lista__cabecera" style={{ paddingBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-flex', color: 'var(--tipo-foto)' }}>
              <Icono nombre="foto" size={14} />
            </span>
            {enZona ? '' : 'Anexo · '}Fotos ({total})
          </div>
          {grupos.map(([ubi, lista]) => (
            <div key={ubi} style={{ marginBottom: 8 }}>
              {!enZona && <div className="dvc-fotos-ubi">{ubi}</div>}
              <div className="dvc-fotos-grid">
                {lista.map(({ foto, idx }) =>
                  foto.url ? (
                    <button key={foto.id} type="button" onClick={() => setVisorIndice(idx)} aria-label={foto.titulo ?? 'ver foto'}>
                      {/* lazy + async: son los ORIGINALES (varios MB) hechos miniatura; cargar y decodificar decenas a la vez agota la memoria del móvil y las que no caben se quedan en blanco. */}
                      <img src={foto.url} alt={foto.titulo ?? 'foto'} loading="lazy" decoding="async" />
                    </button>
                  ) : (
                    <div key={foto.id} style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', alignSelf: 'center' }}>
                      {foto.titulo ?? 'no disponible'}
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )
    );
  };

  const bloqueAudios = (lista: Datos['audios'], enZona = false) =>
    lista.length > 0 && (
      <div>
        <div className="seccion-lista__cabecera" style={{ paddingBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-flex', color: 'var(--tipo-audio)' }}>
            <Icono nombre="audio" size={14} />
          </span>
          {enZona ? '' : 'Anexo · '}Audios ({lista.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lista.map((a) => (
            <div key={a.id} className="dvc-bloque">
              {a.titulo && <div style={{ fontSize: 'var(--text-sm)', marginBottom: 6 }}>{a.titulo}</div>}
              {!enZona && a.zona_texto?.trim() && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 6 }}>{a.zona_texto}</div>
              )}
              {a.url ? (
                <audio controls src={a.url} style={{ width: '100%' }} />
              ) : (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>Audio no disponible</div>
              )}
            </div>
          ))}
        </div>
      </div>
    );

  // Una zona entera: todo lo suyo junto, en el orden de los informes.
  const bloquesDeZona = (z: string) => {
    if (!data) return null;
    const delaZona = <T,>(lista: T[], zona: (x: T) => string | null | undefined) => lista.filter((x) => zonaDeTexto(zona(x)) === z);
    const fotosZ = data.fotos.map((foto, idx) => ({ foto, idx })).filter(({ foto }) => zonaDeTexto(foto.ubicacion_nombre) === z);
    return (
      // Plegadas: con decenas de capturas, una lista seguida de miles de píxeles no se puede recorrer en el móvil.
      // Con una sola zona va abierta.
      <SeccionColapsable key={z || 'sin-zona'} recordarComo={`visita-${visitaId}-zona-${z}`} titulo={z || 'Sin zona'} cantidad={contadorZonas.get(z) ?? 0} defaultAbierta={zonasOrden.length === 1}>
        {bloqueOportunidades(delaZona(data.oportunidades, (o) => o.zona_texto), true)}
        {bloqueHallazgos(delaZona(data.hallazgos, (h) => h.zona_texto), true)}
        {bloquePasos(delaZona(data.proximosPasos, (p) => p.zona_texto), true)}
        {bloqueNotas(delaZona(data.notas, (n) => n.zona_texto), true)}
        {bloqueAudios(delaZona(data.audios, (a) => a.zona_texto), true)}
        {bloqueFotos([[z, fotosZ]], true)}
      </SeccionColapsable>
    );
  };

  // Avisos antes de borrar la visita: oportunidad abierta colgando (si no,
  // `eliminar_visita_completa` se la llevaría por delante; el servidor lo
  // rechaza igualmente) y cambios de este dispositivo sin subir (la cola no se
  // purga tras sincronizar — queda 'completado' para siempre, ver
  // sync-engine.ts). Esta ruta la usa también Mi espacio para visitas todavía
  // 'agendada', de ahí que solo se avise en visitas cerradas.
  const visitaCerrada = data?.estado_captura === 'consolidada';
  // Colgar un documento de una visita ya cerrada: directo a Supabase (esta
  // pantalla ya exige conexión, igual que "Editar resumen"). Pueden Dirección
  // y los participantes aceptados; el servidor solo exige ser el autor.
  const puedeAdjuntar = visitaCerrada && (esDireccionComercial || miParticipacion?.estado === 'aceptado');
  const adjuntandoDocumento = useAccionAsync();
  const inputDocumentoRef = useRef<HTMLInputElement>(null);
  // Devuelve false si no se pudo (aviso ya puesto): con varios archivos, se para ahí.
  async function adjuntarDocumento(archivo: File): Promise<boolean> {
    if (!visitaId || !comercial || !data?.cliente_id) return false;
    const mime = mimeDeDocumento(archivo);
    if (!mime) {
      adjuntandoDocumento.establecerError(`«${archivo.name}»: ese tipo de archivo no se puede adjuntar. Vale PDF, Word, Excel, PowerPoint, TXT y CSV.`);
      return false;
    }
    if (archivo.size > LIMITE_DOCUMENTO_BYTES) {
      adjuntandoDocumento.establecerError(`«${archivo.name}» pesa más de 25 MB. Prueba con una versión más ligera.`);
      return false;
    }
    let ok = false;
    await adjuntandoDocumento.ejecutar(
      async () => {
        const id = uuid();
        const extension = archivo.name.split('.').pop()?.toLowerCase() ?? '';
        const ruta = `${visitaId}/${id}.${/^[a-z0-9]{1,5}$/.test(extension) ? extension : 'bin'}`;
        const { error: errSubida } = await supabase.storage
          .from('documentos-visita')
          .upload(ruta, archivo.type === mime ? archivo : new Blob([archivo], { type: mime }), { contentType: mime });
        if (errSubida) throw new Error(errSubida.message);
        const { error: errFila } = await supabase.from('captura_libre').insert({
          id,
          visita_id: visitaId,
          cliente_id: data.cliente_id!,
          comercial_autor_id: comercial.id,
          tipo: 'documento',
          storage_path: ruta,
          estado_subida: 'completado',
          nombre_original: archivo.name,
          mime,
          bytes: archivo.size,
        });
        if (errFila) {
          // Sin fila no hay quien lo borre luego: no dejar el archivo huérfano.
          await supabase.storage.from('documentos-visita').remove([ruta]);
          throw new Error(errFila.message);
        }
      },
      {
        onExito: () => {
          ok = true;
          queryClient.invalidateQueries({ queryKey });
        },
        mensajeError: (err) => {
          const motivo = motivoRechazoSubida(err instanceof Error ? err.message : '');
          if (motivo === 'tamano') return `«${archivo.name}» pesa más de lo que admite el servidor (máx. 25 MB). Prueba con una versión más ligera.`;
          if (motivo === 'formato') return `«${archivo.name}» tiene un formato que el servidor no admite. Vale PDF, Word, Excel, PowerPoint, TXT y CSV.`;
          return `No se pudo adjuntar «${archivo.name}». Inténtalo de nuevo.`;
        },
      }
    );
    return ok;
  }
  const oportunidadesAbiertas = data ? data.oportunidades.filter((o) => o.etapa !== 'cerrada') : [];
  const haySinSubirLocal = colaLocalVisita.some((op) => op.estado !== 'completado');
  const [preguntaIAAbierta, setPreguntaIAAbierta] = useState(false);
  const puedePreguntarIA = usePuedePreguntarIA(data?.cliente_id);

  // Briefing: siempre disponible en la visita cerrada (verlo o generarlo).
  const [briefingAbierto, setBriefingAbierto] = useState(false);

  const sinNada =
    !!data &&
    !data.resumen_texto &&
    !data.objetivo?.trim() &&
    !data.notas.length &&
    !data.fotos.length &&
    !data.audios.length &&
    !data.documentos.length &&
    !data.hallazgos.length &&
    !data.oportunidades.length &&
    !data.proximosPasos.length;

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo={data?.cliente_nombre ?? 'visita'}
        ayuda="visita-cerrada"
        // Con el resumen en edición, ← cierra la edición (paso anterior) y no saca de la visita.
        onVolver={() => (editandoResumen ? setEditandoResumen(false) : navigate(volver))}
        subtitulo={
          data
            ? `${fechaCorta(data.fecha)}${
                data.tipo_visita ? ` · ${etiqueta(TIPO_VISITA_LABEL, data.tipo_visita).toLowerCase()}` : ''
              }${esNoPresencial(medioDe(data.medio)) ? ` · ${MEDIO_VISITA[medioDe(data.medio)].etiqueta}` : ''}${
                // «cerrada · cerrada el …» repetía la palabra y en móvil el subtítulo se cortaba antes de la fecha.
                data.estado_captura === 'consolidada' && data.cerrada_en
                  ? ` · cerrada el ${fechaCorta(data.cerrada_en)}`
                  : ` · ${estadoLegible[data.estado_captura] ?? data.estado_captura}${data.cerrada_en ? ` · cerrada el ${fechaCorta(data.cerrada_en)}` : ''}`
              }${data.reabierta_en ? ` · reabierta el ${fechaCorta(data.reabierta_en)}` : ''}`
            : undefined
        }
        derecha={
          <>
            {puedePreguntarIA && (
              <button
                type="button"
                className="boton-icono"
                aria-label="Pregunta a la IA"
                title="Pregunta a la IA sobre este cliente"
                onClick={() => setPreguntaIAAbierta(true)}
              >
                <Icono nombre="ia" size={18} />
              </button>
            )}
            {!!data?.cliente_id && (
              <button
                type="button"
                className="boton-icono"
                aria-label="Briefing"
                title="Briefing de esta visita"
                onClick={() => setBriefingAbierto(true)}
              >
                <Icono nombre="briefing" size={18} />
              </button>
            )}
          </>
        }
      />

      {isLoading && <EstadoLista estado="cargando" />}
      {sinConexion && <EstadoLista estado="sin-conexion" onReintentar={reintentar} />}
      {isError && <EstadoLista estado="error" mensaje="No se pudo cargar la visita." onReintentar={reintentar} />}

      {data && (
        <div className="screen__scroll" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {data.cierre_automatico && data.estado_captura === 'consolidada' && (
            <Aviso tipo="info" titulo="Cerrada automáticamente">
              Esta visita se cerró sola tras muchas horas sin actividad. Si faltaba algo por capturar,
              {puedeReabrirDirecto || puedeSolicitarReapertura ? ' reábrela con la fila de abajo.' : ' pide al responsable que la reabra.'}
            </Aviso>
          )}
          {/* El estado (cerrada) y la acción que lo cambia (reabrir) van juntos y arriba: al final de una visita con decenas de capturas nadie los encontraba. */}
          {data && visitaId && visitaCerrada && (puedeReabrirDirecto || puedeSolicitarReapertura || miSolicitudPendiente) && (
        <div style={{ marginTop: 4 }}>
          {puedeReabrirDirecto &&
            (queriendoReabrir ? (
              <div style={{ marginBottom: 8 }}>
                <ConfirmacionBorrado
                  onCancelar={() => {
                    reabriendo.limpiarError();
                    setQueriendoReabrir(false);
                  }}
                  onConfirmar={reabrirDirecto}
                  cargando={reabriendo.cargando}
                  error={reabriendo.error}
                  confirmar="Sí, reabrir"
                  cargandoTexto="Reabriendo…"
                  reversible="Vuelve a estar en curso y se podrán añadir más fotos, notas y hallazgos. Mientras esté reabierta, deja de ser visible para el resto de la empresa: solo la verán el responsable y los participantes. Al cerrarla otra vez, si algo ha cambiado, se genera un informe nuevo en SharePoint y el anterior se queda ahí; si no ha cambiado nada, no se duplica."
                >
                  Vas a reabrir esta visita.
                </ConfirmacionBorrado>
              </div>
            ) : (
              <SeccionLista>
                <FilaNavegable
                  icono="restaurar"
                  titulo={data.cerrada_en ? `Cerrada el ${fechaCorta(data.cerrada_en)}` : 'Visita cerrada'}
                  subtitulo="Toca para reabrirla y añadir fotos o corregir"
                  chevron={false}
                  onClick={() => setQueriendoReabrir(true)}
                />
              </SeccionLista>
            ))}

          {puedeSolicitarReapertura &&
            (miSolicitudPendiente ? (
              <div style={{ paddingInline: 'var(--fila-pad-x)', marginBottom: 8 }}>
                <Aviso tipo="info">
                  Solicitud de reapertura enviada — esperando respuesta del responsable.
                </Aviso>
              </div>
            ) : queriendoSolicitar ? (
              <div style={{ marginBottom: 8 }}>
                <ConfirmacionBorrado
                  onCancelar={() => {
                    solicitando.limpiarError();
                    setQueriendoSolicitar(false);
                  }}
                  onConfirmar={pedirReapertura}
                  cargando={solicitando.cargando}
                  error={solicitando.error}
                  confirmar="Sí, pedir reapertura"
                  cargandoTexto="Enviando…"
                  reversible="Se le pide al responsable de la visita que la reabra — no se reabre hasta que lo acepte."
                >
                  Vas a pedir reabrir esta visita.
                </ConfirmacionBorrado>
              </div>
            ) : (
              <SeccionLista>
                <FilaNavegable
                  icono="restaurar"
                  titulo={data.cerrada_en ? `Cerrada el ${fechaCorta(data.cerrada_en)}` : 'Visita cerrada'}
                  subtitulo="Toca para pedir al responsable que la reabra"
                  chevron={false}
                  onClick={() => setQueriendoSolicitar(true)}
                />
              </SeccionLista>
            ))}
        </div>
      )}
          {kpis.length > 0 && (
            <div className="dvc-kpis">
              {kpis.map((k) => (
                <span key={k.texto} className={`dvc-kpi${k.alerta ? ' dvc-kpi--alerta' : ''}`}>
                  {k.alerta && <Icono nombre="atencion" size={12} />}
                  {k.texto}
                </span>
              ))}
            </div>
          )}

          {sinNada && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>
              Esta visita no tiene ninguna captura registrada.
            </div>
          )}

          {!sinNada && (
            <div className="dvc-bloque">
              <div className="dvc-bloque__lb">Objetivo de la visita</div>
              {data.objetivo?.trim() ? (
                <div className="dvc-bloque__texto">{data.objetivo}</div>
              ) : (
                <div className="dvc-bloque__texto" style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>
                  Sin objetivo registrado.
                </div>
              )}
            </div>
          )}
          {!sinNada && puedeEditarResumen && data.resumen_origen === 'reglas' && !editandoResumen && (
            <SeccionLista>
              <FilaNavegable
                icono="editar"
                titulo="Escribir resumen"
                subtitulo="Cómo fue la visita, en tus palabras (sustituye al automático en los informes)"
                chevron={false}
                onClick={abrirEditarResumen}
              />
            </SeccionLista>
          )}
          {/* Resumen: solo el escrito a mano. El automático («Ibas a: … Oportunidad: …»)
              repetía el objetivo y las listas de debajo y ocupaba el primer pantallazo;
              sigue yendo en los informes. Quien puede editarlo lo escribe con la fila de arriba. */}
          {!sinNada && (data.resumen_origen !== 'reglas' || editandoResumen) && (
            <div className="dvc-bloque dvc-bloque--resumen">
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
              >
                <div className="dvc-bloque__lb">Resumen</div>
                {puedeEditarResumen && !editandoResumen && (
                  <button
                    type="button"
                    className="boton-icono"
                    aria-label={data.resumen_texto ? 'Editar resumen' : 'Escribir resumen'}
                    title={data.resumen_texto ? 'Editar resumen' : 'Escribir resumen'}
                    onClick={abrirEditarResumen}
                  >
                    <Icono nombre="editar" size={16} />
                  </button>
                )}
              </div>

              {editandoResumen ? (
                <div style={{ marginTop: 6 }}>
                  <TextareaDictado
                    ref={refDictadoResumen}
                    rows={4}
                    autoFocus
                    valor={borradorResumen}
                    onCambio={setBorradorResumen}
                    placeholder="cómo fue la visita: sensación, siguiente movimiento…"
                  />
                  {guardadoResumen.error && (
                    <div className="field-error-text" style={{ marginTop: 6 }}>{guardadoResumen.error}</div>
                  )}
                  <div className="fila-btns" style={{ marginTop: 8 }}>
                    <button
                      className="btn btn-secondary"
                      disabled={guardadoResumen.cargando}
                      onClick={() => {
                        guardadoResumen.limpiarError();
                        setEditandoResumen(false);
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      className="btn btn-primary"
                      disabled={guardadoResumen.cargando}
                      onClick={guardarResumen}
                    >
                      {guardadoResumen.cargando ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </div>
              ) : data.resumen_texto ? (
                <div className="dvc-bloque__texto">{data.resumen_texto}</div>
              ) : (
                <div className="dvc-bloque__texto" style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>
                  Sin resumen registrado.
                </div>
              )}
            </div>
          )}

          {/* Descargas plegadas en una línea: siguen a un toque (25 sept: al fondo nadie las encontraba) sin ocupar el primer pantallazo. */}
          {visitaId && visitaCerrada && (
            <SeccionColapsable recordarComo={`visita-${visitaId}-descargas`} titulo="Descargas" cantidad={3}>
              <DescargasVisita visitaId={visitaId} estadoDe={estadoDe} descargar={descargar} progresoDe={progresoDe} motivoDe={motivoDe} />
            </SeccionColapsable>
          )}

          {/* Documentos justo bajo las descargas: al final de una visita con decenas de capturas nadie los encontraba. */}
          {data && visitaId && (data.documentos.length > 0 || puedeAdjuntar) && (
        <SeccionLista
          titulo={`Documentos (${data.documentos.length})`}
          accion={
            puedeAdjuntar ? (
              <button
                type="button"
                className="boton-icono"
                aria-label="Adjuntar un documento"
                title="Adjuntar un documento (PDF, Word, Excel, PowerPoint, TXT o CSV)"
                disabled={adjuntandoDocumento.cargando}
                onClick={() => inputDocumentoRef.current?.click()}
              >
                <Icono nombre="mas" size={18} />
              </button>
            ) : undefined
          }
        >
          {data.documentos.map((d) => (
            <FilaNavegable
              key={d.id}
              icono="documento"
              titulo={d.titulo || d.nombre_original || 'Documento'}
              subtitulo={d.bytes != null ? formatearTamano(d.bytes) : undefined}
              to={`/capturas/${d.id}`}
              state={origen}
            />
          ))}
          {puedeAdjuntar && (
            <input
              ref={inputDocumentoRef}
              type="file"
              accept={ACCEPT_DOCUMENTO}
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const archivos = Array.from(e.target.files ?? []);
                e.target.value = '';
                void (async () => {
                  for (const archivo of archivos) if (!(await adjuntarDocumento(archivo))) break;
                })();
              }}
            />
          )}
          {adjuntandoDocumento.error && <Aviso tipo="error">{adjuntandoDocumento.error}</Aviso>}
        </SeccionLista>
      )}

          {!!fallosArchivado?.length && (
            <div style={{ paddingInline: 'var(--fila-pad-x)' }}>
              <Aviso tipo="atencion">
                No se pudo archivar {fallosArchivado.length === 1 ? '1 archivo' : `${fallosArchivado.length} archivos`} a
                SharePoint. Siguen en PrimeNotes y se reintenta solo hasta 5 veces; si sigue fallando, se reintenta a mano desde Yo → «Copia a SharePoint». Motivo: {[...new Set(fallosArchivado)].join(' · ')}
              </Aviso>
            </div>
          )}

          {data.hayArchivadoSharepoint && (
            <div style={{ paddingInline: 'var(--fila-pad-x)' }}>
              <Aviso tipo="info">
                Algunas fotos o audios de esta visita se archivaron en SharePoint (más de 30 días cerrada). Se
                siguen viendo igual que siempre, solo tardan un poco más en cargar.
              </Aviso>
            </div>
          )}

          {hayZonas && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Segmentado
                opciones={[
                  { valor: 'zona', etiqueta: 'Zona', icono: 'ubicacion' },
                  { valor: 'tipo', etiqueta: 'Tipo', icono: 'lista' },
                ]}
                valor={porZona ? 'zona' : 'tipo'}
                onCambio={(v) => setVerPorZona(v === 'zona')}
              />
            </div>
          )}

          {porZona ? (
            <>
              {bloqueMapa}
              {zonasOrden.map(bloquesDeZona)}
            </>
          ) : (
            <>
              {bloqueOportunidades(data.oportunidades)}
              {bloqueHallazgos(data.hallazgos)}
              {bloquePasos(data.proximosPasos)}
              {bloqueNotas(data.notas)}
              {bloqueMapa}
              {bloqueFotos([...fotosPorUbi.entries()])}
              {bloqueAudios(data.audios)}
            </>
          )}

      {data && visitaId && puedeBorrarVisita && (
        <div style={{ marginTop: 4 }}>
          {visitaCerrada && oportunidadesAbiertas.length > 0 && (
            <div style={{ paddingInline: 'var(--fila-pad-x)', marginBottom: 8 }}>
              <Aviso tipo="atencion">
                Tiene {plural(oportunidadesAbiertas.length, 'oportunidad abierta', 'oportunidades abiertas')} sin
                cerrar:{' '}
                {oportunidadesAbiertas.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && ', '}
                    <Link to={`/oportunidades/${o.id}`} state={origen}>
                      {o.titulo}
                    </Link>
                  </span>
                ))}
                . Ciérrala{oportunidadesAbiertas.length > 1 ? 's' : ''} antes de borrar la visita.
              </Aviso>
            </div>
          )}
          {visitaCerrada && haySinSubirLocal && (
            <div style={{ paddingInline: 'var(--fila-pad-x)', marginBottom: 8 }}>
              <Aviso tipo="atencion">
                Esta visita tiene cambios de este dispositivo sin subir todavía. Conéctate y espera a que
                sincronicen antes de borrar la visita.
              </Aviso>
            </div>
          )}
          {/* ConfirmarBorradoVisita corta en seco si hay alguna oportunidad abierta (no deja ni
              confirmar) y eliminar_visita_completa lo rechaza también en el servidor pase lo que
              pase en el cliente: desde el incidente 2026-09-12 (SAPA borrada con 2 oportunidades
              abiertas) este botón no es un bypass de ese candado. */}
          {(borrar.visitaBorrarId === visitaId ? (
              <ConfirmarBorradoVisita ctrl={borrar} />
            ) : (
              <SeccionLista>
                <FilaNavegable
                  icono="borrar"
                  titulo="Borrar esta visita"
                  tono="riesgo"
                  chevron={false}
                  onClick={() => void borrar.pedir(visitaId)}
                />
              </SeccionLista>
            ))}
        </div>
      )}
        </div>
      )}

      {visorIndice != null && data && (
        <VisorFotos
          fotos={data.fotos}
          indice={visorIndice}
          onCerrar={() => setVisorIndice(null)}
          onCambiar={setVisorIndice}
        />
      )}

      {briefingAbierto && data?.cliente_id && (
        <BriefingHoja
          visitaId={visitaId!}
          clienteId={data.cliente_id}
          clienteNombre={data.cliente_nombre}
          onCerrar={() => setBriefingAbierto(false)}
        />
      )}

      {preguntaIAAbierta && data?.cliente_id && (
        <PreguntaIAHoja
          clienteId={data.cliente_id}
          clienteNombre={data.cliente_nombre}
          visitaId={visitaId}
          onCerrar={() => setPreguntaIAAbierta(false)}
        />
      )}
    </div>
  );
}
