import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta, haceRelativo, desdeHace } from '@/lib/fechas';
import { capitalizarFrase } from '@/lib/texto';
import { uuid } from '@/lib/uuid';
import { crearVisitaConResponsable } from '@/lib/rpc';
import { desde, useVolverA } from '@/lib/volver-a';
import { useEspacioEquipo } from '@/hooks/use-espacio-equipo';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaLocal } from '@/hooks/use-visita-local';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { comprimirImagen } from '@/lib/comprimir-imagen';
import { AnotarHoja } from './anotar-hoja';
import { PasoRapidoHoja } from './paso-rapido-hoja';
import { InterlocutoresHoja } from './interlocutores-hoja';
import { ParticipantesHoja } from './participantes-hoja';
import { PanelVisitasAbiertas } from './panel-visitas-abiertas';
import { VisorFotos } from './visor-fotos';
import { Icono, type NombreIcono } from '@/components/ui/iconos';
import { Aviso } from '@/components/ui/aviso';
import { AyudaNota } from '@/components/ui/ayuda-nota';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { Segmentado } from '@/components/ui/segmentado';
import { actualizarOperacion, eliminarOperacion } from '@/lib/offline-queue';
import { etiqueta, NATURALEZA_LABEL } from '@/lib/etiquetas-visita';
import type {
  OperacionPendiente,
  HallazgoPayload,
  OportunidadPayload,
  ProximoPasoPayload,
} from '@/lib/offline-queue/types';

// Formato de audio: iOS/Safari solo graba en audio/mp4 (AAC); Chrome y
// Firefox en webm. Antes se forzaba 'audio/webm' a pelo, así que en
// iPhone el blob quedaba mal etiquetado y el reproductor daba "Error".
// Se elige el primero que el navegador soporte de verdad.
const TIPOS_AUDIO = ['audio/mp4', 'audio/webm', 'audio/ogg'];
function elegirTipoAudio(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  return TIPOS_AUDIO.find((t) => MediaRecorder.isTypeSupported(t));
}

// Título de una fila de hallazgo. Desde "Anotar" (prompt maestro 10) un
// hallazgo puede no tener término: se usa su propio texto y, si tampoco,
// la naturaleza.
function tituloHallazgo(
  termino: string | undefined | null,
  nota: string | undefined | null,
  naturaleza: string
): string {
  return termino?.trim() || nota?.trim() || etiqueta(NATURALEZA_LABEL, naturaleza);
}

interface CapturasPorUbicacionProps {
  capturas: OperacionPendiente[];
  hallazgos: OperacionPendiente[];
  nombresUbicaciones: Record<string, string>;
  nombresTerminos?: Record<string, string>;
  onTocarCaptura: (id: string) => void;
  // Las fotos abren el visor a pantalla completa en vez de `onTocarCaptura`
  // (que sirve para audio/nota/hallazgo). Si no se pasa, la foto también
  // cae en `onTocarCaptura`.
  onAbrirFoto?: (id: string) => void;
}

// Vista "En esta visita" agrupada por zona (conmutador "ver por zona" de
// Visita activa): "General de la visita" arriba y abierta, luego una
// sección plegable por cada zona anotada, la más reciente también abierta.
// Las oportunidades tienen su propia sección en Visita activa, no se listan
// aquí.
function CapturasPorUbicacion({
  capturas,
  hallazgos,
  nombresUbicaciones,
  nombresTerminos,
  onTocarCaptura,
  onAbrirFoto,
}: CapturasPorUbicacionProps) {
  // Clave de agrupación por zona. Las capturas nuevas llevan `zonaTexto`
  // (etiqueta libre); las de visitas antiguas, `ubicacionId`.
  const claveDe = (op: OperacionPendiente) => {
    const p = op.payload as { zonaTexto?: string; ubicacionId?: string };
    return p.zonaTexto ?? p.ubicacionId ?? 'sin-ubicacion';
  };
  const tipoDe = (c: OperacionPendiente) => (c.payload as { tipo: string }).tipo;

  const claves = new Set<string>();
  [...capturas, ...hallazgos].forEach((op) => claves.add(claveDe(op)));

  // Fila de un elemento capturado dentro de una zona / "General": icono a la
  // izquierda (foto/audio/nota/hallazgo), texto, y una coletilla gris
  // opcional. Sustituye a la etiqueta "audio ·" / "nota ·" gris de antes.
  // C6 · Cuando la fila es pulsable, es un <button> de verdad (foco por
  // teclado, rol) — antes era un <div onClick> sin nada de eso. Misma clase
  // .va-item que la vista "por tipo", para que se lean igual.
  const itemFila = (key: string, icono: NombreIcono, texto: string, sub?: string, onClick?: () => void) => {
    const contenido = (
      <>
        <Icono nombre={icono} size={16} />
        <span className="va-item__texto">{texto}</span>
        {sub && <span className="va-item__sub">{sub}</span>}
      </>
    );
    return onClick ? (
      <button key={key} type="button" className="va-item" onClick={onClick}>
        {contenido}
      </button>
    ) : (
      <div key={key} className="va-item">{contenido}</div>
    );
  };

  const contenidoDe = (clave: string) => {
    const fotos = capturas.filter((c) => claveDe(c) === clave && tipoDe(c) === 'foto');
    const audios = capturas.filter((c) => claveDe(c) === clave && tipoDe(c) === 'audio');
    const notas = capturas.filter((c) => claveDe(c) === clave && tipoDe(c) === 'nota');
    const hz = hallazgos.filter((h) => claveDe(h) === clave);
    const total = fotos.length + audios.length + notas.length + hz.length;
    const reciente = Math.max(
      0,
      ...[...fotos, ...audios, ...notas, ...hz].map((o) =>
        new Date((o as { creadoEn?: string }).creadoEn ?? 0).getTime()
      )
    );
    const resumen = [
      fotos.length && `${fotos.length} foto${fotos.length > 1 ? 's' : ''}`,
      audios.length && `${audios.length} audio${audios.length > 1 ? 's' : ''}`,
      notas.length && `${notas.length} nota${notas.length > 1 ? 's' : ''}`,
      hz.length && `${hz.length} hallazgo${hz.length > 1 ? 's' : ''}`,
    ]
      .filter(Boolean)
      .join(' · ');
    return { fotos, audios, notas, hz, total, resumen, reciente };
  };

  const renderItems = (c: ReturnType<typeof contenidoDe>) => (
    <>
      {c.fotos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {[...c.fotos].reverse().map((f) => {
            const blob = f.archivoLocal as Blob | undefined;
            const titulo = (f.payload as { titulo?: string }).titulo;
            const abrir = () => (onAbrirFoto ?? onTocarCaptura)(f.id);
            return blob ? (
              <img
                key={f.id}
                src={URL.createObjectURL(blob)}
                alt={titulo ?? 'foto'}
                onClick={abrir}
                style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, flexShrink: 0, cursor: 'pointer' }}
              />
            ) : (
              <div
                key={f.id}
                onClick={abrir}
                style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--surface-1)', flexShrink: 0, cursor: 'pointer' }}
              />
            );
          })}
        </div>
      )}
      {c.audios.map((a) =>
        itemFila(a.id, 'audio', (a.payload as { titulo?: string }).titulo || 'sin título', undefined, () => onTocarCaptura(a.id))
      )}
      {c.notas.map((n) => {
        const p = n.payload as { titulo?: string; contenidoTexto?: string };
        return itemFila(n.id, 'nota', p.titulo || p.contenidoTexto || '(nota vacía)', undefined, () => onTocarCaptura(n.id));
      })}
      {c.hz.map((h) => {
        const p = h.payload as { terminoId?: string; naturaleza: string; nota?: string };
        const term = p.terminoId ? nombresTerminos?.[p.terminoId] : undefined;
        return itemFila(h.id, 'hallazgo', tituloHallazgo(term, p.nota, p.naturaleza), etiqueta(NATURALEZA_LABEL, p.naturaleza));
      })}
    </>
  );

  const zonasClaves = [...claves].filter((k) => k !== 'sin-ubicacion');
  // Zonas ordenadas por lo más reciente capturado en cada una.
  const zonas = zonasClaves.sort((a, b) => contenidoDe(b).reciente - contenidoDe(a).reciente);
  const general = claves.has('sin-ubicacion') ? contenidoDe('sin-ubicacion') : null;

  // Estado de plegado que el comercial ha tocado a mano: `tocadas` son las
  // secciones ABIERTas a mano; por defecto solo "General" y la zona más
  // reciente están abiertas.
  const [tocadas, setTocadas] = useState<Set<string>>(() => {
    const s = new Set<string>();
    s.add('sin-ubicacion'); // "General" abierta
    if (zonas[0]) s.add(zonas[0]); // zona más reciente abierta
    return s;
  });
  const estaAbierta = (k: string) => tocadas.has(k);
  const alternar = (k: string) => {
    setTocadas((prev) => {
      const s = new Set(prev);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      return s;
    });
  };

  if (claves.size === 0) return null;

  const seccion = (clave: string, opts: { nombre: string; general?: boolean }) => {
    const c = contenidoDe(clave);
    if (c.total === 0) return null;
    const abierta = estaAbierta(clave);
    return (
      <div
        key={clave}
        style={{
          borderLeft: '2px solid transparent',
          paddingLeft: 8,
          ...(opts.general ? { borderTop: '1px solid var(--ink-200)', paddingTop: 10 } : {}),
        }}
      >
        <button
          type="button"
          onClick={() => alternar(clave)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            border: 'none',
            background: 'none',
            padding: 0,
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
          }}
        >
          <span
            style={{
              fontSize: 18,
              lineHeight: 1,
              color: 'var(--ink-400)',
              display: 'inline-block',
              transform: abierta ? 'rotate(90deg)' : 'none',
              transition: 'transform 120ms ease',
              flexShrink: 0,
            }}
          >
            ›
          </span>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{opts.nombre}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>{c.resumen}</span>
        </button>
        {abierta && <div style={{ marginTop: 6 }}>{renderItems(c)}</div>}
      </div>
    );
  };

  const bloqueZonas = zonas.map((clave) => seccion(clave, { nombre: nombresUbicaciones[clave] ?? clave }));
  const bloqueGeneral =
    general && general.total > 0 ? seccion('sin-ubicacion', { nombre: 'General de la visita', general: true }) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {bloqueGeneral}
      {bloqueZonas}
    </div>
  );
}

export function VisitaActiva() {
  const { visitaId } = useParams<{ visitaId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Origen a estampar al abrir una captura/hallazgo/oportunidad o el
  // detalle de la visita: su ← vuelve a esta visita en curso (regla #14).
  const origen = desde(location);
  // A dónde vuelve el ← de esta pantalla: de donde se vino (ficha de
  // proyecto, de cliente, Agenda…) o, si no consta, Hoy.
  const volver = useVolverA('/');
  const queryClient = useQueryClient();
  const { comercial } = useSesionActual();
  const visitaLocal = useVisitaLocal(visitaId);
  const { iniciarVisita } = useVisitaActivaContext();
  const { operaciones, encolar, recargar: recargarCola } = useSyncQueue(visitaId);

  // Zona (opcional) de la captura: una ETIQUETA DE TEXTO LIBRE que el
  // comercial escribe sobre la marcha (la puerta / barrera / rincón que va
  // a revisar). No es una entidad de catálogo — no se guarda en ninguna
  // lista reutilizable, solo se copia en cada captura. Vacía => la captura
  // va al grupo "General". Antes esto era el "Modo Recorrido", una
  // pantalla aparte con su propio "¿en qué modo estoy?"; ahora es un campo
  // más de la zona de captura, siempre visible.
  const [zonaActual, setZonaActual] = useState('');
  // El objetivo ("A qué vienes") va plegado a una línea; se abre al tocarlo.
  const [objetivoAbierto, setObjetivoAbierto] = useState(false);
  // Panel de "otras visitas abiertas sin cerrar" — se abre sin salir de esta
  // visita en curso (nunca navegar fuera para ver una lista).
  const [panelAbiertasVisible, setPanelAbiertasVisible] = useState(false);
  // El editor de zona se abre BAJO DEMANDA desde el chip de la fila del
  // título; no vive fijo entre el título y los botones (eso empujaba la
  // captura hacia abajo aunque ya no estuvieras marcando zonas).
  const [zonaEditorAbierto, setZonaEditorAbierto] = useState(false);
  // Zona (de la lista de "zonas de esta visita") pendiente de confirmar su
  // borrado. Borrarla = sus capturas pasan a «General».
  // Panel de gestión de una zona (al pulsar la ✕ de un chip de "Zonas de
  // esta visita"): renombrar · pasar a «General» · borrar lo tuyo.
  const [zonaGestion, setZonaGestion] = useState<string | null>(null);
  const [zonaGestionModo, setZonaGestionModo] = useState<'menu' | 'renombrar' | 'borrar'>('menu');
  const [nombreZonaNuevo, setNombreZonaNuevo] = useState('');
  const [zonaGestionError, setZonaGestionError] = useState<string | null>(null);
  const [borrandoZona, setBorrandoZona] = useState(false);
  // Etiqueta que se estampa en TODO lo que se captura ahora mismo (foto,
  // audio, anotación/hallazgo, oportunidad, próximo paso). Vacía => undefined.
  const zonaParaCaptura = zonaActual.trim() || undefined;
  // Foto abierta en el visor a pantalla completa (tocar una miniatura).
  const [fotoVisorId, setFotoVisorId] = useState<string | null>(null);
  // D1 (rediseño Zona 3): "En esta visita" agrupa por tipo por defecto; el
  // conmutador a "por zona" solo tiene sentido si la visita ha usado el
  // Recorrido (si no, no hay zonas que agrupar).
  const [ordenPorZona, setOrdenPorZona] = useState(false);
  // "Anotar" (prompt maestro 10): una sola hoja que fusiona lo que antes
  // eran los botones "Hallazgo", "Oportunidad" y "Nota".
  const [anotarAbierto, setAnotarAbierto] = useState(false);
  const [pasoAbierto, setPasoAbierto] = useState(false);
  const [interlocutoresAbierto, setInterlocutoresAbierto] = useState(false);
  const [participantesAbierto, setParticipantesAbierto] = useState(false);
  const [grabando, setGrabando] = useState(false);
  // Segundos que lleva la grabación — el botón "Detener" enseña mm:ss
  // corriendo, para que se vea de un vistazo que está grabando (no solo
  // por el cambio de palabra).
  const [segsGrabando, setSegsGrabando] = useState(0);
  const [fotoPendiente, setFotoPendiente] = useState<Blob | null>(null);
  const [audioPendiente, setAudioPendiente] = useState<Blob | null>(null);
  const [tituloPendiente, setTituloPendiente] = useState('');
  // B6 · La zona se congela en el MOMENTO de capturar (disparo de la foto,
  // inicio de la grabación), no al pulsar "Guardar" en la hoja de título:
  // si entre medias cambias de zona, la captura anterior debe quedarse en
  // la suya. Anotar/paso no lo necesitan — su hoja es modal y tapa el campo
  // de zona.
  const [zonaPendiente, setZonaPendiente] = useState<string | undefined>(undefined);
  const capturaFoto = useAccionAsync();
  const capturaAudio = useAccionAsync();

  // Al 98% del pozo del equipo se cortan las subidas de binarios (fotos y
  // audios); las notas de texto siguen. Ver src/lib/espacio.ts.
  const { estado: espacioEquipo } = useEspacioEquipo();
  const espacioBloqueado = espacioEquipo?.nivel === 'bloqueo';
  const MSG_ESPACIO_LLENO =
    'Espacio del equipo lleno. No se pueden añadir fotos ni audios hasta que alguien libere (Yo → Mi espacio).';

  const inputFotoRef = useRef<HTMLInputElement>(null);
  // Coordenadas GPS de la última foto elegida. Best-effort: se pide en
  // cuanto se elige la foto (mientras el comercial pone el título), y si el
  // móvil no da permiso o tarda demasiado, la foto se guarda igual sin
  // coordenadas. Un ref, no estado: solo se lee al confirmar.
  const coordsFotoRef = useRef<{ lat: number; lng: number } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  // Clave distinta de ['cliente', clienteId] (la de Ficha de cliente, con
  // más columnas) — mismo motivo que en repaso-cliente.tsx y
  // ficha-proyecto.tsx: con la misma clave, TanStack Query serviría aquí la
  // caché de la ficha completa, o al revés.
  const { data: cliente } = useQuery({
    queryKey: ['cliente-nombre', visitaLocal?.clienteId],
    enabled: !!visitaLocal?.clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cliente')
        .select('id, nombre')
        .eq('id', visitaLocal!.clienteId)
        .single();
      if (error) throw error;
      return data;
    },
  });


  // Movido aquí (antes del `if (!visitaId || !comercial) return null`)
  // deliberadamente — un hook colocado después de ese return condicional
  // viola las reglas de Hooks de React: si `comercial` es null en algún
  // render (p.ej. durante un cambio de sesión), este hook dejaría de
  // ejecutarse ese render y de otro no, provocando el error real que esto
  // corrige: "Rendered more hooks than during the previous render".
  const hallazgosParaNombres = operaciones.filter((op) => op.entidad === 'hallazgo');
  const terminoIdsHallazgos = hallazgosParaNombres
    .map((h) => (h.payload as { terminoId?: string }).terminoId)
    .filter((id): id is string => !!id)
    .filter((id, i, arr) => arr.indexOf(id) === i);

  const { data: nombresTerminos } = useQuery({
    queryKey: ['nombres-terminos-hallazgos', terminoIdsHallazgos.join(',')],
    enabled: terminoIdsHallazgos.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('termino').select('id, nombre').in('id', terminoIdsHallazgos);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((t) => [t.id, t.nombre]));
    },
  });

  // Objetivo de la visita: se fija SIEMPRE al arrancarla (formulario de
  // planificar, o ventana "¿A qué vas?" para la visita sobre la marcha) y
  // aquí el comercial puede matizarlo si la realidad no coincide con lo
  // previsto. maybeSingle: una visita recién arrancada sin conexión todavía
  // no tiene fila en el servidor — en esos primeros segundos el objetivo se
  // lee de la cola local (visitaLocal.objetivo) y el campo es de solo
  // lectura hasta que sincroniza. refetchInterval sondea hasta que la fila
  // aparece y entonces se para. Va ANTES del efecto de `iniciarVisita` para
  // que ese efecto ya conozca `visitaCerrada` y no encienda el banner
  // "visita en curso" en una visita consolidada.
  const objetivoQueryKey = ['visita-objetivo', visitaId];
  const { data: visitaServidor } = useQuery({
    queryKey: objetivoQueryKey,
    enabled: !!visitaId,
    // Sondea rápido mientras la visita todavía no existe en el servidor
    // (primeros segundos de una visita local); una vez existe, cada 20 s
    // para enterarse si un compañero la ha cerrado mientras seguimos
    // capturando (A0.1). Deja de sondear cuando ya está consolidada.
    refetchInterval: (query) => {
      const d = query.state.data as { estado_captura?: string } | null | undefined;
      if (d == null) return 4000;
      return d.estado_captura === 'consolidada' ? false : 20000;
    },
    queryFn: async (): Promise<{ objetivo: string | null; estado_captura: string } | null> => {
      const { data, error } = await supabase
        .from('visita')
        .select('objetivo, estado_captura')
        .eq('id', visitaId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  // A0.1 · La visita ya está cerrada (por este comercial en otra pestaña, o
  // por un compañero). Solo lo sabemos cuando la fila del servidor ya
  // existe: mientras `visitaServidor` es null asumimos "en curso".
  const visitaCerrada = visitaServidor?.estado_captura === 'consolidada';

  // Asegura que el banner "visita en curso" aparece aunque se haya llegado
  // aquí directamente (por ejemplo, retomando desde Agenda), no solo tras
  // pasar por Repaso rápido de cliente. En una visita ya cerrada NO se
  // enciende (la pantalla mostrará el aviso de "cerrada", no captura).
  useEffect(() => {
    if (visitaId && cliente && !visitaCerrada) {
      iniciarVisita({ id: visitaId, clienteNombre: cliente.nombre });
    }
  }, [visitaId, cliente, visitaCerrada, iniciarVisita]);

  // El badge de "Interlocutores" en la cabecera cuenta los que hay DADOS DE
  // ALTA para este cliente (su directorio), no solo los marcados presentes
  // — así aparece el número en cuanto registras uno, igual que el badge de
  // Equipo. `queryKey` con `visitaId` porque quien lo invalida
  // (directorio-interlocutores / interlocutores-hoja) pasa `visitaId`.
  const { data: interlocutoresPresentes } = useQuery({
    queryKey: ['interlocutores-count', visitaId],
    enabled: !!visitaLocal?.clienteId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('interlocutor')
        .select('nombre')
        .eq('cliente_id', visitaLocal!.clienteId)
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return (data ?? []).map((i) => i.nombre);
    },
  });

  // Equipo de la visita: misma clave y misma forma de select que
  // participantes-hoja.tsx (comparten caché a propósito — ver
  // primesuite-query-key-colision, el riesgo es solo cuando el select
  // difiere, aquí es idéntico).
  const { data: participantesEquipo } = useQuery({
    queryKey: ['participantes-visita', visitaId],
    enabled: !!visitaId,
    queryFn: async (): Promise<{ comercial_id: string; rol: string; estado: string }[]> => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select('comercial_id, rol, estado')
        .eq('visita_id', visitaId!)
        .in('estado', ['pendiente', 'aceptado']);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: nombresComercialesEquipo } = useQuery({
    queryKey: ['comerciales-nombres'],
    enabled: !!participantesEquipo?.length,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.rpc('fn_comerciales_seleccionables');
      if (error) throw error;
      return new Map((data ?? []).map((c) => [c.id, c.nombre]));
    },
  });

  // Nombre del proyecto (línea de negocio) de esta visita, para la Zona 1.
  // Toda visita tiene proyecto con nombre (modelo estricto tras el fin de
  // `es_general`), así que siempre se muestra.
  const { data: proyectoVisita } = useQuery({
    queryKey: ['proyecto-nombre', visitaLocal?.proyectoId],
    enabled: !!visitaLocal?.proyectoId,
    queryFn: async (): Promise<{ nombre: string } | null> => {
      const { data, error } = await supabase
        .from('proyecto')
        .select('nombre')
        .eq('id', visitaLocal!.proyectoId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Ordinal de esta visita dentro de su proyecto y fecha de la anterior
  // (P11) — "3.ª visita · última hace 2 meses" de la Zona 1. Es un recuento
  // retrospectivo (como en Ficha de proyecto), no el "N de N" de un
  // recorrido.
  const { data: visitasProyectoOrdenadas } = useQuery({
    queryKey: ['visitas-proyecto-orden', visitaLocal?.proyectoId],
    enabled: !!visitaLocal?.proyectoId,
    queryFn: async (): Promise<{ id: string; fecha: string }[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha')
        .eq('proyecto_id', visitaLocal!.proyectoId!)
        .order('fecha', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // A0.2 · Otras visitas del comercial que siguen `en_curso`. El banner
  // "visita en curso" es un único slot: si se arranca otra sin cerrar
  // esta, una queda sin nada que la recuerde. Aviso no bloqueante con
  // enlace para volver a ella.
  const { data: otrasVisitasEnCurso = [] } = useQuery({
    queryKey: ['otras-visitas-en-curso', visitaId, comercial?.id],
    enabled: !!visitaId && !!comercial,
    refetchOnMount: 'always',
    refetchInterval: 20000,
    queryFn: async (): Promise<
      { id: string; clienteNombre: string; proyectoNombre: string | null; desde: string | null }[]
    > => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select(
          'visita_id, visita:visita_id!inner(id, estado_captura, fecha, en_curso_desde, proyecto:proyecto_id(nombre), cliente:cliente_id(nombre))'
        )
        .eq('comercial_id', comercial!.id)
        .in('estado', ['pendiente', 'aceptado'])
        .eq('visita.estado_captura', 'en_curso')
        .neq('visita_id', visitaId!);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const v = r.visita as unknown as {
          id: string;
          fecha: string | null;
          en_curso_desde: string | null;
          proyecto: { nombre: string } | null;
          cliente: { nombre: string } | null;
        };
        return {
          id: v.id,
          clienteNombre: v.cliente?.nombre ?? 'un cliente',
          proyectoNombre: v.proyecto?.nombre ?? null,
          desde: v.en_curso_desde ?? v.fecha,
        };
      });
    },
  });
  // Objetivo efectivo: el del servidor si ya está, si no el que viajó en la
  // cola al arrancar. Solo es editable cuando existe en el servidor.
  const objetivoActual = visitaServidor?.objetivo ?? visitaLocal?.objetivo ?? null;
  const objetivoEditable = !!visitaServidor;
  const [objetivoBorrador, setObjetivoBorrador] = useState<string | null>(null);
  const guardadoObjetivo = useAccionAsync();
  // B5 · El borrador se re-sincroniza con el valor real SIEMPRE que no
  // estés editándolo ahora mismo (antes solo se rellenaba una vez, con lo
  // que si un compañero cambiaba el objetivo no te enterabas nunca). Con
  // la hoja abierta no se pisa lo que estás escribiendo.
  useEffect(() => {
    if (objetivoActual != null && !objetivoAbierto) {
      setObjetivoBorrador(objetivoActual);
    }
  }, [objetivoActual, objetivoAbierto]);

  // NOTA: la guarda `if (!visitaId || !comercial) return null` va AL FINAL de
  // los hooks (justo antes del primer `return` de JSX), no aquí. Si va aquí,
  // los hooks siguientes (useRef del timeout de audio, useEffect de
  // visibilitychange, useQuery de capturas de compañeros, etc.) quedan
  // "después de un return condicional" y violan las reglas de Hooks: en el
  // render en que `comercial` sea null se llamarían menos hooks y React
  // lanza "Rendered more hooks than during the previous render". Todos los
  // hooks se llaman siempre; la guarda solo decide si se pinta contenido.

  // Límite de seguridad, por debajo del límite real del servidor (15 MB)
  // — con margen, para que el aviso llegue aquí y no como un fallo opaco
  // de Storage más adelante. La compresión ya deja casi todas las fotos
  // muy por debajo de esto; este límite solo salta si comprimirImagen()
  // tuvo que rendirse y devolver el archivo original sin comprimir (por
  // ejemplo, un formato que el navegador no sabe decodificar).
  const LIMITE_FOTO_BYTES = 12 * 1024 * 1024;

  // Pide la posición sin bloquear: cuando llega, queda en el ref para el
  // momento de confirmar. Silenciosa a propósito — si falla, la foto va sin
  // coordenadas.
  function pedirUbicacionFoto() {
    coordsFotoRef.current = null;
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        coordsFotoRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      },
      () => {
        /* permiso denegado, sin señal GPS, timeout… — se guarda sin coords */
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 }
    );
  }

  async function capturarFoto(archivo: File) {
    if (espacioBloqueado) {
      flushSync(() => setFotoPendiente(null));
      capturaFoto.establecerError(MSG_ESPACIO_LLENO);
      return;
    }
    pedirUbicacionFoto();
    const archivoComprimido = await comprimirImagen(archivo);
    if (archivoComprimido.size > LIMITE_FOTO_BYTES) {
      flushSync(() => setFotoPendiente(null));
      capturaFoto.establecerError(
        'Esta foto pesa demasiado incluso comprimida. Prueba a hacerla de nuevo con la cámara en menor calidad, si tu móvil lo permite.'
      );
      return;
    }
    capturaFoto.limpiarError();
    // Al volver de la cámara nativa del móvil (sobre todo en iOS), React
    // puede actualizar este estado sin que la pantalla llegue a
    // repintarse sola — se quedaba invisible hasta la siguiente
    // interacción (p.ej. "Salir"), donde de golpe aparecía la última
    // foto tomada. flushSync obliga a repintar ya, en el mismo instante.
    flushSync(() => {
      setFotoPendiente(archivoComprimido);
      setTituloPendiente('');
      setZonaPendiente(zonaParaCaptura); // B6 · zona del momento del disparo
    });
  }

  // Cerrar la hoja de Foto/Audio sin guardar = descartar el binario que se
  // acaba de capturar (mismo efecto que el botón "Descartar"). Se usa
  // también como `onCerrar` de la hoja (×, Esc, tocar fuera).
  function descartarPendiente() {
    setFotoPendiente(null);
    setAudioPendiente(null);
    setTituloPendiente('');
    setZonaPendiente(undefined);
    capturaFoto.limpiarError();
    capturaAudio.limpiarError();
  }

  async function confirmarCapturaPendiente() {
    if (fotoPendiente) {
      await capturaFoto.ejecutar(
        () =>
          encolar(
            uuid(),
            'captura_libre',
            {
              visitaId: visitaId!,
              comercialAutorId: comercial!.id,
              tipo: 'foto',
              titulo: tituloPendiente.trim() || undefined,
              zonaTexto: zonaPendiente,
              latitud: coordsFotoRef.current?.lat,
              longitud: coordsFotoRef.current?.lng,
            },
            { dependeDe: visitaId, archivoLocal: fotoPendiente }
          ),
        {
          mensajeError: 'No se pudo guardar la foto. Inténtalo de nuevo.',
          onExito: () => {
            setFotoPendiente(null);
            setTituloPendiente('');
            setZonaPendiente(undefined);
            coordsFotoRef.current = null;
          },
        }
      );
    } else if (audioPendiente) {
      await capturaAudio.ejecutar(
        () =>
          encolar(
            uuid(),
            'captura_libre',
            {
              visitaId: visitaId!,
              comercialAutorId: comercial!.id,
              tipo: 'audio',
              titulo: tituloPendiente.trim() || undefined,
              zonaTexto: zonaPendiente,
            },
            { dependeDe: visitaId, archivoLocal: audioPendiente }
          ),
        {
          mensajeError: 'No se pudo guardar el audio grabado. Inténtalo de nuevo.',
          onExito: () => {
            setAudioPendiente(null);
            setTituloPendiente('');
            setZonaPendiente(undefined);
          },
        }
      );
    }
  }

  const timeoutAudioRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sin este límite, la grabación seguía indefinidamente hasta que el
  // comercial se acordaba de tocar "Detener" — con riesgo real de perder
  // el audio entero si el archivo crecía demasiado antes de subir. 10
  // minutos es de sobra para una nota de voz de campo; se detiene sola.
  const DURACION_MAXIMA_AUDIO_MS = 10 * 60 * 1000;

  function soltarWakeLock() {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }

  async function iniciarODetenerAudio() {
    if (!grabando) {
      if (espacioBloqueado) {
        capturaAudio.establecerError(MSG_ESPACIO_LLENO);
        return;
      }
      await capturaAudio.ejecutar(
        async () => {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const tipo = elegirTipoAudio();
          const recorder = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
          audioChunksRef.current = [];
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
          };
          recorder.onstop = () => {
            // El tipo real que ha usado el navegador — NO uno inventado.
            const tipoReal = recorder.mimeType || tipo || audioChunksRef.current[0]?.type || 'audio/mp4';
            const blob = new Blob(audioChunksRef.current, { type: tipoReal });
            flushSync(() => {
              setAudioPendiente(blob);
              setTituloPendiente('');
            });
            stream.getTracks().forEach((t) => t.stop());
            soltarWakeLock();
            if (timeoutAudioRef.current) {
              clearTimeout(timeoutAudioRef.current);
              timeoutAudioRef.current = null;
            }
          };
          // timeslice: vuelca un trozo cada segundo. Si el sistema corta la
          // grabación (pantalla bloqueada, cambio de app), al menos queda lo
          // grabado hasta el último segundo en vez de un archivo vacío.
          recorder.start(1000);
          mediaRecorderRef.current = recorder;
          setGrabando(true);
          setZonaPendiente(zonaParaCaptura); // B6 · zona del inicio de la grabación
          // Mantiene la pantalla encendida mientras se graba — no evita un
          // bloqueo manual, pero sí el apagado automático por inactividad.
          try {
            const wl = (navigator as Navigator & {
              wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
            }).wakeLock;
            wakeLockRef.current = (await wl?.request('screen')) ?? null;
          } catch {
            /* no soportado o denegado — no pasa nada */
          }
          timeoutAudioRef.current = setTimeout(() => {
            if (mediaRecorderRef.current?.state === 'recording') {
              mediaRecorderRef.current.stop();
              setGrabando(false);
              capturaAudio.establecerError('Grabación detenida automáticamente a los 10 minutos. Se ha guardado hasta ese punto.');
            }
          }, DURACION_MAXIMA_AUDIO_MS);
        },
        { mensajeError: 'No se pudo acceder al micrófono. Comprueba los permisos.' }
      );
    } else {
      mediaRecorderRef.current?.stop();
      setGrabando(false);
      soltarWakeLock();
      if (timeoutAudioRef.current) {
        clearTimeout(timeoutAudioRef.current);
        timeoutAudioRef.current = null;
      }
    }
  }

  // Si la pantalla se bloquea o se cambia de app mientras se graba, iOS
  // suspende la página y el MediaRecorder queda inservible. Se para la
  // grabación de forma limpia para quedarnos con lo grabado hasta ese
  // momento (gracias al timeslice) en vez de un archivo corrupto.
  useEffect(() => {
    if (!grabando) return;
    const alOcultarse = () => {
      if (document.visibilityState === 'hidden' && mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
        setGrabando(false);
        soltarWakeLock();
        if (timeoutAudioRef.current) {
          clearTimeout(timeoutAudioRef.current);
          timeoutAudioRef.current = null;
        }
        capturaAudio.establecerError(
          'La grabación se detuvo al bloquearse la pantalla o cambiar de app. Se ha guardado lo grabado hasta ahí. Una app web no puede grabar en segundo plano.'
        );
      }
    };
    document.addEventListener('visibilitychange', alOcultarse);
    return () => document.removeEventListener('visibilitychange', alOcultarse);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabando]);

  // Cronómetro de la grabación.
  useEffect(() => {
    if (!grabando) {
      setSegsGrabando(0);
      return;
    }
    setSegsGrabando(0);
    const t = setInterval(() => setSegsGrabando((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [grabando]);

  async function guardarObjetivo() {
    await guardadoObjetivo.ejecutar(
      async () => {
        const nuevo = (objetivoBorrador ?? '').trim();
        // El objetivo es obligatorio: no se permite dejarlo en blanco.
        if (!nuevo) throw new Error('El objetivo de la visita no puede quedar vacío.');
        const { error, count } = await supabase
          .from('visita')
          .update({ objetivo: nuevo }, { count: 'exact' })
          .eq('id', visitaId!);
        if (error) throw new Error(error.message);
        if (!count) {
          throw new Error(
            'No se pudo guardar el objetivo (0 filas afectadas). Puede que la visita aún no haya sincronizado — inténtalo en unos segundos.'
          );
        }
      },
      {
        onExito: () => queryClient.invalidateQueries({ queryKey: objetivoQueryKey }),
        mensajeError: 'No se pudo guardar el objetivo.',
      }
    );
  }

  async function guardarHallazgo(payload: HallazgoPayload) {
    const hallazgoId = uuid();
    await encolar(hallazgoId, 'hallazgo', { ...payload, zonaTexto: zonaParaCaptura }, { dependeDe: visitaId });
    setTimeout(() => setAnotarAbierto(false), 700);
  }

  async function guardarOportunidad(oportunidadId: string, payload: OportunidadPayload) {
    // El id lo genera la hoja para poder ofrecer "Completar ahora". La hoja
    // no se cierra sola: el comercial elige (completar / seguir en la visita).
    await encolar(oportunidadId, 'oportunidad', { ...payload, zonaTexto: zonaParaCaptura }, { dependeDe: visitaId });
  }

  function completarOportunidad(oportunidadId: string) {
    setAnotarAbierto(false);
    navigate(`/oportunidades/${oportunidadId}`, { state: origen });
  }

  async function guardarPaso(payload: ProximoPasoPayload) {
    const pasoId = uuid();
    // En Recorrido, `zonaParaCaptura` estampa la zona; fuera del Recorrido
    // es undefined y `aPayloadSnakeCase` lo descarta.
    await encolar(pasoId, 'proximo_paso', { ...payload, zonaTexto: zonaParaCaptura }, { dependeDe: visitaId });
    setTimeout(() => setPasoAbierto(false), 700);
  }

  function cerrarGestionZona() {
    setZonaGestion(null);
    setZonaGestionModo('menu');
    setNombreZonaNuevo('');
    setZonaGestionError(null);
  }

  // Operaciones de la cola local que llevan esta zona (pendientes o ya
  // sincronizadas — hay que alinear la copia local con el cambio del
  // servidor o el chip seguiría saliendo hasta recargar).
  function localesConZona(zona: string) {
    return operaciones.filter((op) => (op.payload as { zonaTexto?: string }).zonaTexto === zona);
  }

  // "Pasar todo a «General»" — quita la etiqueta de zona, no borra nada.
  async function pasarZonaAGeneral(zona: string) {
    if (!visitaId) return;
    setBorrandoZona(true);
    setZonaGestionError(null);
    try {
      for (const op of localesConZona(zona)) {
        await actualizarOperacion(op.id, {
          payload: { ...(op.payload as object), zonaTexto: undefined } as OperacionPendiente['payload'],
        });
      }
      await Promise.all([
        supabase.from('captura_libre').update({ zona_texto: null }).eq('visita_id', visitaId).eq('zona_texto', zona),
        supabase.from('hallazgo').update({ zona_texto: null }).eq('visita_id', visitaId).eq('zona_texto', zona),
        supabase.from('oportunidad').update({ zona_texto: null }).eq('visita_origen_id', visitaId).eq('zona_texto', zona),
        supabase.from('proximo_paso').update({ zona_texto: null }).eq('visita_id', visitaId).eq('zona_texto', zona),
      ]);
      if (zonaActual.trim() === zona) setZonaActual('');
      await recargarCola();
      queryClient.invalidateQueries({ queryKey: ['capturas-companeros', visitaId] });
      cerrarGestionZona();
    } finally {
      setBorrandoZona(false);
    }
  }

  // "Renombrar la zona" — cambia el nombre en todo lo que la lleva (cola
  // local + servidor). Cubre el caso más frecuente: una errata.
  async function renombrarZona(zonaVieja: string, zonaNueva: string) {
    if (!visitaId || !zonaNueva.trim() || zonaNueva.trim() === zonaVieja) return;
    const nueva = zonaNueva.trim();
    setBorrandoZona(true);
    setZonaGestionError(null);
    try {
      for (const op of localesConZona(zonaVieja)) {
        await actualizarOperacion(op.id, {
          payload: { ...(op.payload as object), zonaTexto: nueva } as OperacionPendiente['payload'],
        });
      }
      await Promise.all([
        supabase.from('captura_libre').update({ zona_texto: nueva }).eq('visita_id', visitaId).eq('zona_texto', zonaVieja),
        supabase.from('hallazgo').update({ zona_texto: nueva }).eq('visita_id', visitaId).eq('zona_texto', zonaVieja),
        supabase.from('oportunidad').update({ zona_texto: nueva }).eq('visita_origen_id', visitaId).eq('zona_texto', zonaVieja),
        supabase.from('proximo_paso').update({ zona_texto: nueva }).eq('visita_id', visitaId).eq('zona_texto', zonaVieja),
      ]);
      if (zonaActual.trim() === zonaVieja) setZonaActual(nueva);
      await recargarCola();
      queryClient.invalidateQueries({ queryKey: ['capturas-companeros', visitaId] });
      cerrarGestionZona();
    } finally {
      setBorrandoZona(false);
    }
  }

  // "Borrar lo mío de la zona" — borra de verdad las capturas/hallazgos/
  // oportunidades/pasos que YO capturé con esa zona (+ su archivo en
  // Storage, + su copia en la cola local). Lo de los compañeros no se toca.
  async function borrarLoMioDeZona(zona: string) {
    if (!visitaId || !comercial) return;
    setBorrandoZona(true);
    setZonaGestionError(null);
    try {
      // Cola local: fuera.
      for (const op of localesConZona(zona)) {
        await eliminarOperacion(op.id);
      }
      // Capturas mías sincronizadas + su archivo de Storage.
      const { data: caps } = await supabase
        .from('captura_libre')
        .select('id, tipo, storage_path')
        .eq('visita_id', visitaId)
        .eq('zona_texto', zona)
        .eq('comercial_autor_id', comercial.id);
      for (const c of caps ?? []) {
        if (c.storage_path) {
          const bucket = c.tipo === 'foto' ? 'fotos-visita' : 'audios-visita';
          await supabase.storage.from(bucket).remove([c.storage_path]);
        }
      }
      await supabase
        .from('captura_libre')
        .delete()
        .eq('visita_id', visitaId)
        .eq('zona_texto', zona)
        .eq('comercial_autor_id', comercial.id);
      await supabase
        .from('hallazgo')
        .delete()
        .eq('visita_id', visitaId)
        .eq('zona_texto', zona)
        .eq('comercial_autor_id', comercial.id);
      await supabase
        .from('proximo_paso')
        .delete()
        .eq('visita_id', visitaId)
        .eq('zona_texto', zona)
        .eq('comercial_responsable_id', comercial.id);
      // Oportunidades: cascada por RPC (una a una).
      const { data: ops } = await supabase
        .from('oportunidad')
        .select('id')
        .eq('visita_origen_id', visitaId)
        .eq('zona_texto', zona)
        .eq('comercial_autor_id', comercial.id);
      for (const o of ops ?? []) {
        await supabase.rpc('eliminar_oportunidad_completa', { p_oportunidad_id: o.id });
      }
      if (zonaActual.trim() === zona) setZonaActual('');
      await recargarCola();
      queryClient.invalidateQueries({ queryKey: ['capturas-companeros', visitaId] });
      cerrarGestionZona();
    } finally {
      setBorrandoZona(false);
    }
  }

  async function planificarVisitaDesdePaso({
    fecha,
    hora,
    franja,
    objetivo,
  }: {
    fecha: string;
    hora: string;
    franja: '' | 'manana' | 'tarde';
    objetivo: string;
  }) {
    if (!visitaLocal?.clienteId || !comercial || !visitaLocal.proyectoId) return;
    // Llamada directa, NO por la cola offline: igual que planificar desde la
    // ficha, para que aparezca en la agenda al momento. Sigue en el mismo
    // proyecto (línea de negocio) que la visita desde la que se planifica —
    // continuidad.
    const nuevaId = uuid();
    const { error } = await crearVisitaConResponsable({
      pVisitaId: nuevaId,
      pClienteId: visitaLocal.clienteId,
      pComercialId: comercial.id,
      pProyectoId: visitaLocal.proyectoId,
      pFecha: new Date(`${fecha}T${hora || '09:00'}:00`).toISOString(),
      pEstadoCaptura: 'agendada',
    });
    if (error) throw new Error(error);
    const parche: { objetivo?: string; hora_definida?: boolean; franja?: string | null } = {};
    if (objetivo.trim()) parche.objetivo = objetivo.trim();
    if (!hora) {
      parche.hora_definida = false;
      parche.franja = franja || null;
    }
    if (Object.keys(parche).length) {
      const { error: errParche } = await supabase.from('visita').update(parche).eq('id', nuevaId);
      if (errParche) throw new Error(errParche.message);
    }
    for (const k of [
      ['visitas-hoy'],
      ['visitas-proximas'],
      ['visitas-atrasadas'],
      ['agenda-planificadas'],
      ['historial-visitas', visitaLocal.clienteId],
    ]) {
      queryClient.invalidateQueries({ queryKey: k });
    }
    setTimeout(() => setPasoAbierto(false), 700);
  }

  const capturas = operaciones.filter((op) => op.entidad === 'captura_libre');
  const oportunidades = operaciones.filter((op) => op.entidad === 'oportunidad');
  const hallazgos = operaciones.filter((op) => op.entidad === 'hallazgo');
  const pasos = operaciones.filter((op) => op.entidad === 'proximo_paso');

  // Lo que hay en `operaciones` es SOLO la cola local de este dispositivo
  // (por diseño, para que la visita siga funcionando sin conexión) — nunca
  // incluye lo que un compañero haya capturado desde el suyo. Sin esto, dos
  // comerciales trabajando la misma visita a la vez no se veían el uno al
  // otro hasta cerrarla y consultar el detalle aparte. Se pide directo a
  // Supabase, excluyendo lo mío (eso ya está cubierto por la cola local),
  // y se refresca cada 20s mientras la pantalla está abierta.
  const { data: deCompaneros } = useQuery({
    queryKey: ['capturas-companeros', visitaId, comercial?.id],
    enabled: !!visitaId && !!comercial,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [capturasRes, hallazgosRes, pasosRes, oportunidadesRes] = await Promise.all([
        supabase
          .from('captura_libre')
          .select('id, tipo, titulo, contenido_texto, comercial_autor_id, creado_en, zona_texto')
          .eq('visita_id', visitaId!)
          .neq('comercial_autor_id', comercial!.id),
        supabase
          .from('hallazgo')
          .select('id, naturaleza, nota, comercial_autor_id, zona_texto, termino:termino_id(nombre)')
          .eq('visita_id', visitaId!)
          .neq('comercial_autor_id', comercial!.id),
        supabase
          .from('proximo_paso')
          .select('id, descripcion, fecha_objetivo, comercial_responsable_id, zona_texto')
          .eq('visita_id', visitaId!)
          .neq('comercial_responsable_id', comercial!.id),
        supabase
          .from('oportunidad')
          .select('id, titulo, etapa, comercial_autor_id, zona_texto')
          .eq('visita_origen_id', visitaId!)
          .neq('comercial_autor_id', comercial!.id),
      ]);
      return {
        capturas: capturasRes.data ?? [],
        hallazgos: hallazgosRes.data ?? [],
        pasos: pasosRes.data ?? [],
        oportunidades: oportunidadesRes.data ?? [],
      };
    },
  });
  const notasCompaneros = deCompaneros?.capturas.filter((c) => c.tipo === 'nota') ?? [];
  const audiosCompaneros = deCompaneros?.capturas.filter((c) => c.tipo === 'audio') ?? [];
  // B4 · Las fotos de compañeros también cuentan y se listan (antes se
  // pedían pero no se pintaban). Van como fila de texto —igual que sus
  // notas/audios—, no como miniatura: el binario está en Storage, no en la
  // cola local, y abrir el detalle ya enseña la foto.
  const fotosCompaneros = deCompaneros?.capturas.filter((c) => c.tipo === 'foto') ?? [];
  const hallazgosCompaneros = deCompaneros?.hallazgos ?? [];
  const pasosCompaneros = deCompaneros?.pasos ?? [];
  const oportunidadesCompaneros = deCompaneros?.oportunidades ?? [];

  const hayCompaneros =
    notasCompaneros.length +
      audiosCompaneros.length +
      fotosCompaneros.length +
      hallazgosCompaneros.length +
      pasosCompaneros.length +
      oportunidadesCompaneros.length >
    0;
  const { data: nombresComerciales } = useQuery({
    queryKey: ['nombres-comerciales'],
    enabled: hayCompaneros,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from('comercial').select('id, nombre');
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((c) => [c.id, c.nombre]));
    },
  });

  // Solo para RESOLVER el nombre de capturas antiguas que todavía llevan
  // `ubicacion_id` (visitas de antes de que la zona pasara a texto libre).
  // Las capturas nuevas agrupan por `zonaTexto`, que ya ES el nombre.
  const { data: nombresUbicacionesVisita = {} } = useQuery({
    queryKey: ['ubicacion-nombres', visitaLocal?.clienteId],
    enabled: !!visitaLocal?.clienteId,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('ubicacion')
        .select('id, nombre')
        .eq('cliente_id', visitaLocal!.clienteId);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((u) => [u.id, u.nombre]));
    },
  });

  // Todas las fotos de la visita en este dispositivo, ordenadas de la más
  // reciente a la más antigua — es lo que recorre el visor a pantalla
  // completa con ‹ ›. Se memoiza sobre `operaciones` (referencia estable
  // entre recargas de la cola) para no recrear los object URL en cada
  // render; se revocan al cambiar la lista o al desmontar. El nombre de la
  // zona se resuelve aparte, al pintar, para no meter en la dependencia un
  // objeto que se recrea en cada render.
  const fotosVisor = useMemo(() => {
    return operaciones
      .filter(
        (op) => op.entidad === 'captura_libre' && (op.payload as { tipo?: string }).tipo === 'foto'
      )
      .sort((a, b) => (b.creadoEn ?? '').localeCompare(a.creadoEn ?? ''))
      .map((f) => {
        const p = f.payload as {
          titulo?: string;
          zonaTexto?: string;
          ubicacionId?: string;
          latitud?: number;
          longitud?: number;
        };
        const blob = f.archivoLocal as Blob | undefined;
        return {
          id: f.id,
          url: blob ? URL.createObjectURL(blob) : null,
          titulo: p.titulo ?? null,
          zonaTexto: p.zonaTexto ?? null,
          ubicacionId: p.ubicacionId ?? null,
          latitud: p.latitud ?? null,
          longitud: p.longitud ?? null,
        };
      });
  }, [operaciones]);

  useEffect(() => {
    return () => {
      fotosVisor.forEach((f) => f.url && URL.revokeObjectURL(f.url));
    };
  }, [fotosVisor]);

  const indiceVisor = fotoVisorId ? fotosVisor.findIndex((f) => f.id === fotoVisorId) : -1;
  const visorFotos =
    indiceVisor >= 0 ? (
      <VisorFotos
        fotos={fotosVisor.map((f) => ({
          id: f.id,
          url: f.url,
          titulo: f.titulo,
          ubicacion_nombre:
            f.zonaTexto ?? (f.ubicacionId ? nombresUbicacionesVisita[f.ubicacionId] ?? null : null),
          latitud: f.latitud,
          longitud: f.longitud,
        }))}
        indice={indiceVisor}
        onCerrar={() => setFotoVisorId(null)}
        onCambiar={(i) => setFotoVisorId(fotosVisor[i]?.id ?? null)}
        onEditar={(id) => {
          setFotoVisorId(null);
          navigate(`/capturas/${id}`);
        }}
      />
    ) : null;

  // Guarda al final de los hooks (ver nota más arriba). Sin `visitaId` no hay
  // pantalla que pintar; sin `comercial`, `RequireSession` ya habría
  // redirigido, pero se comprueba igual por si acaso.
  if (!visitaId || !comercial) return null;

  // A0.1 · Visita ya consolidada: no se captura más. En vez de dejar la
  // pantalla de captura viva (las capturas entrarían tarde, tras el
  // informe), se corta aquí y se lleva al detalle.
  if (visitaCerrada) {
    return (
      <div className="screen">
        <CabeceraDetalle
          titulo={cliente?.nombre ?? '…'}
          subtitulo="Visita cerrada"
          onVolver={() => navigate(volver)}
        />
        <div className="screen__scroll">
          <Aviso tipo="info" titulo="Esta visita ya está cerrada">
            No se pueden añadir más capturas. Si te falta algo, míralo en el
            detalle o empieza una visita nueva.
          </Aviso>
          <button
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => navigate(`/visita/${visitaId}/detalle`)}
          >
            Ver detalle de la visita
          </button>
        </div>
      </div>
    );
  }

  // Resumen de lo capturado, para la tira de arriba. Las fotos/audios/notas
  // van todas en `capturas` (captura_libre), se separan por su `tipo`.
  const fotosOwn = capturas.filter((c) => (c.payload as { tipo?: string }).tipo === 'foto');
  const audiosOwn = capturas.filter((c) => (c.payload as { tipo?: string }).tipo === 'audio');
  const notasOwn = capturas.filter((c) => (c.payload as { tipo?: string }).tipo === 'nota');

  // El nombre del proyecto se añade tal cual (sin la palabra "Proyecto"
  // delante), mismo criterio que Agenda. El `?? ''` es defensivo.
  const proyectoTexto = proyectoVisita?.nombre ?? '';

  // Zona 1 — "3.ª visita · última hace 2 meses" (P11): ordinal de ESTA
  // visita dentro de su proyecto, y cuándo fue la anterior.
  const indiceVisita = visitasProyectoOrdenadas?.findIndex((v) => v.id === visitaId) ?? -1;
  const numeroVisita = indiceVisita >= 0 ? indiceVisita + 1 : null;
  const visitaAnterior = indiceVisita > 0 ? visitasProyectoOrdenadas![indiceVisita - 1] : null;
  // "1.ª visita" a secas es ruido en la primera — solo aporta desde la 2.ª
  // ("3.ª visita · última hace 2 meses"). Se muestra el ordinal solo si > 1;
  // "última hace…" siempre que haya visita anterior.
  const contextoVisitaTexto =
    numeroVisita && numeroVisita > 1
      ? [`${numeroVisita}.ª visita`, visitaAnterior ? `última ${haceRelativo(visitaAnterior.fecha)}` : null]
          .filter(Boolean)
          .join(' · ')
      : visitaAnterior
        ? `última visita ${haceRelativo(visitaAnterior.fecha)}`
        : null;

  // Zona 1 — interlocutores presentes, de un vistazo.
  const nInterlocutores = interlocutoresPresentes?.length ?? 0;
  const interlocutoresTexto =
    nInterlocutores === 0
      ? 'Sin interlocutores registrados en esta visita'
      : nInterlocutores === 1
        ? interlocutoresPresentes![0]
        : nInterlocutores === 2
          ? `${interlocutoresPresentes![0]} y ${interlocutoresPresentes![1]}`
          : `${interlocutoresPresentes![0]} y ${nInterlocutores - 1} más`;

  // Zona 1 — equipo de la visita, "tú" primero.
  const nombresEquipo = (participantesEquipo ?? [])
    .filter((p) => p.comercial_id !== comercial.id)
    .map((p) => nombresComercialesEquipo?.get(p.comercial_id) ?? '…');
  const equipoTexto = ['tú', ...nombresEquipo].join(', ');

  // Zona activa como FILTRO de "En esta visita": con una zona marcada, la
  // lista (y su contador) muestran solo lo de esa zona — así, al volver a la
  // visita a completar un sitio, ves lo que ya hay ahí sin rebuscar entre
  // todo. El ✕ de la banda quita la zona y vuelve a verse todo.
  // `zonaParaCaptura` es `zonaActual.trim() || undefined`.
  const enZona = (z: string | null | undefined) => !zonaParaCaptura || (z ?? '') === zonaParaCaptura;
  const zTexto = (op: { payload: unknown }) => (op.payload as { zonaTexto?: string }).zonaTexto;
  const fotosOwnV = fotosOwn.filter((c) => enZona(zTexto(c)));
  const audiosOwnV = audiosOwn.filter((c) => enZona(zTexto(c)));
  const notasOwnV = notasOwn.filter((c) => enZona(zTexto(c)));
  const hallazgosV = hallazgos.filter((c) => enZona(zTexto(c)));
  const oportunidadesV = oportunidades.filter((c) => enZona(zTexto(c)));
  const pasosV = pasos.filter((c) => enZona(zTexto(c)));
  const fotosCompanerosV = fotosCompaneros.filter((c) => enZona(c.zona_texto));
  const audiosCompanerosV = audiosCompaneros.filter((c) => enZona(c.zona_texto));
  const notasCompanerosV = notasCompaneros.filter((c) => enZona(c.zona_texto));
  const hallazgosCompanerosV = hallazgosCompaneros.filter((c) => enZona(c.zona_texto));
  const oportunidadesCompanerosV = oportunidadesCompaneros.filter((c) => enZona(c.zona_texto));
  const pasosCompanerosV = pasosCompaneros.filter((c) => enZona(c.zona_texto));

  // Zona 3 — "En esta visita" fundido: lo tuyo + lo de compañeros, con un
  // único contador (D2) y un único indicador de sincronización (regla 5).
  // Los `total*` cuentan lo MOSTRADO (ya filtrado por zona si la hay).
  const totalFotos = fotosOwnV.length + fotosCompanerosV.length;
  const totalAudios = audiosOwnV.length + audiosCompanerosV.length;
  const totalNotas = notasOwnV.length + notasCompanerosV.length;
  const totalHallazgos = hallazgosV.length + hallazgosCompanerosV.length;
  const totalOportunidades = oportunidadesV.length + oportunidadesCompanerosV.length;
  const totalPasos = pasosV.length + pasosCompanerosV.length;
  const totalEnVisita = totalFotos + totalAudios + totalNotas + totalHallazgos + totalOportunidades + totalPasos;
  const desgloseTipos = [
    totalFotos && `${totalFotos} foto${totalFotos > 1 ? 's' : ''}`,
    totalAudios && `${totalAudios} audio${totalAudios > 1 ? 's' : ''}`,
    totalNotas && `${totalNotas} nota${totalNotas > 1 ? 's' : ''}`,
    totalHallazgos && `${totalHallazgos} hallazgo${totalHallazgos > 1 ? 's' : ''}`,
    totalOportunidades && `${totalOportunidades} oportunidad${totalOportunidades > 1 ? 'es' : ''}`,
    totalPasos && `${totalPasos} próximo${totalPasos > 1 ? 's pasos' : ' paso'}`,
  ].filter((t): t is string => !!t);
  // D2: desglose corto si hay pocos tipos, si no colapsa a "N elementos".
  const contadorEnVisita =
    desgloseTipos.length > 3 ? `${totalEnVisita} elemento${totalEnVisita === 1 ? '' : 's'}` : desgloseTipos.join(' · ');
  // Solo lo MÍO tiene estado de sincronización — lo de compañeros ya viene
  // del servidor. Regla 5: un único indicador en cristiano, no por ítem.
  // Whole-visita: el estado de subida no lo acota el filtro de zona.
  const pendientesSync = [...capturas, ...hallazgos, ...oportunidades, ...pasos].filter(
    (op) => op.estado !== 'completado'
  ).length;
  const estadoSyncTexto = pendientesSync === 0 ? 'todo subido' : `${pendientesSync} sin subir`;
  // B2 · Con varias capturas hechas pero sin ninguna oportunidad ni ningún
  // próximo paso, se recuerda AQUÍ (no solo al cerrar). Umbral 3 para no
  // saltar a la primera foto. Va sobre la visita ENTERA (no el filtro de
  // zona): es un aviso de "antes de cerrar", no de la vista actual.
  const oportunidadesEnVisita = oportunidades.length + oportunidadesCompaneros.length;
  const pasosEnVisita = pasos.length + pasosCompaneros.length;
  const totalTodoEnVisita =
    fotosOwn.length + fotosCompaneros.length +
    audiosOwn.length + audiosCompaneros.length +
    notasOwn.length + notasCompaneros.length +
    hallazgos.length + hallazgosCompaneros.length +
    oportunidadesEnVisita + pasosEnVisita;
  const recordatorioFaltaTexto =
    totalTodoEnVisita < 3
      ? null
      : oportunidadesEnVisita === 0 && pasosEnVisita === 0
        ? 'No has apuntado ninguna oportunidad ni próximo paso. Si viste algo, apúntalo antes de cerrar.'
        : oportunidadesEnVisita === 0
          ? 'No has apuntado ninguna oportunidad. Si viste alguna, apúntala antes de cerrar.'
          : pasosEnVisita === 0
            ? 'No has apuntado ningún próximo paso. Si queda algo pendiente, apúntalo antes de cerrar.'
            : null;
  // El conmutador "por zona" (D1) solo aparece si se han anotado zonas en
  // esta visita.
  const zonaUsada = [...capturas, ...hallazgos, ...oportunidades].some(
    (op) => !!(op.payload as { zonaTexto?: string }).zonaTexto
  );
  // Zonas ya anotadas en ESTA visita (cola local + lo sincronizado): chips
  // para volver a una sin reescribirla.
  const zonasUsadas = [
    ...new Set(
      [...capturas, ...hallazgos, ...oportunidades, ...pasos]
        .map((op) => (op.payload as { zonaTexto?: string }).zonaTexto)
        .filter((z): z is string => !!z && z.trim().length > 0)
    ),
  ].sort((a, b) => a.localeCompare(b, 'es'));
  const hayZonaActiva = !!zonaActual.trim();

  // Cuántas cosas hay en una zona: lo mío (cola local) y lo de compañeros.
  function cuentaZona(z: string) {
    const mio = [...capturas, ...hallazgos, ...oportunidades, ...pasos].filter(
      (op) => (op.payload as { zonaTexto?: string }).zonaTexto === z
    ).length;
    const comp = [
      ...(deCompaneros?.capturas ?? []),
      ...(deCompaneros?.hallazgos ?? []),
      ...(deCompaneros?.oportunidades ?? []),
      ...(deCompaneros?.pasos ?? []),
    ].filter((c) => (c as { zona_texto?: string | null }).zona_texto === z).length;
    return { mio, comp, total: mio + comp };
  }

  // Fila de "En esta visita": icono + texto + coletilla gris opcional
  // (naturaleza, prioridad, o "· de Fulano" en lo ajeno — regla 4). Cada
  // tipo se distingue por su icono; sin colores de texto, que en una lista
  // se leen como alarma. Mismo patrón que `itemFila` de
  // CapturasPorUbicacion, aquí sin agrupar por zona.
  const filaEnVisita = (
    key: string,
    icono: NombreIcono,
    texto: string,
    sub?: string,
    onClick?: () => void
  ) =>
    onClick ? (
      <button key={key} type="button" className="va-item" onClick={onClick}>
        <Icono nombre={icono} size={16} />
        <span className="va-item__texto">{texto}</span>
        {sub && <span className="va-item__sub">{sub}</span>}
      </button>
    ) : (
      <div key={key} className="va-item">
        <Icono nombre={icono} size={16} />
        <span className="va-item__texto">{texto}</span>
        {sub && <span className="va-item__sub">{sub}</span>}
      </div>
    );

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo={cliente?.nombre ?? '…'}
        subtitulo={proyectoTexto ? `Visita en curso · ${proyectoTexto}` : 'Visita en curso'}
        ayuda="visita-activa"
        onVolver={() => navigate(volver)}
        derecha={
          <>
            {/* Interlocutores y Equipo: acciones secundarias → botón-icono
                en la cabecera (patrón iOS de toolbar + patrón de la casa),
                con badge de recuento. No compiten con la captura. */}
            <button
              type="button"
              className="boton-icono"
              onClick={() => setInterlocutoresAbierto(true)}
              disabled={!visitaLocal?.clienteId}
              aria-label={`Interlocutores${nInterlocutores ? ` (${nInterlocutores})` : ''}`}
              title={interlocutoresTexto}
            >
              <Icono nombre="interlocutor" size={18} />
              {nInterlocutores > 0 && <span className="boton-icono__badge">{nInterlocutores}</span>}
            </button>
            <button
              type="button"
              className="boton-icono"
              onClick={() => setParticipantesAbierto(true)}
              aria-label={`Equipo (${nombresEquipo.length + 1})`}
              title={equipoTexto}
            >
              <Icono nombre="equipo" size={18} />
              <span className="boton-icono__badge">{nombresEquipo.length + 1}</span>
            </button>
          </>
        }
      />

      <div className="screen__scroll">
        {/* A0.2 · Otra visita abierta sin cerrar. Aviso SUTIL — una línea, no
            una tarjeta grande: es un recordatorio, no una alarma. */}
        {otrasVisitasEnCurso.length > 0 && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              margin: '2px 2px 8px', fontSize: 'var(--text-xs)', color: 'var(--ink-500)',
            }}
          >
            <Icono nombre="atencion" size={13} />
            <span style={{ flex: 1, minWidth: 0 }}>
              {otrasVisitasEnCurso.length === 1 ? (
                <>
                  La de {otrasVisitasEnCurso[0].clienteNombre}
                  {otrasVisitasEnCurso[0].proyectoNombre && (
                    <> · {otrasVisitasEnCurso[0].proyectoNombre}</>
                  )}
                  {otrasVisitasEnCurso[0].desde && (
                    <> · abierta <strong>{desdeHace(otrasVisitasEnCurso[0].desde)}</strong></>
                  )}
                  {' '}sigue sin cerrar.
                </>
              ) : (
                <>Tienes {otrasVisitasEnCurso.length} visitas abiertas sin cerrar.</>
              )}
            </span>
            <button
              type="button"
              aria-label="Ver las visitas abiertas"
              title="Ver las visitas abiertas"
              onClick={() => setPanelAbiertasVisible(true)}
              style={{
                flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer',
                color: 'var(--brand-600)', display: 'inline-flex', alignItems: 'center', gap: 2,
                padding: 2, font: 'inherit', fontSize: 'var(--text-xs)',
              }}
            >
              Ver
              <Icono nombre="chevron" size={16} />
            </button>
          </div>
        )}

        {panelAbiertasVisible && (
          <PanelVisitasAbiertas
            visitas={otrasVisitasEnCurso.map((v) => ({
              id: v.id,
              clienteNombre: v.clienteNombre,
              proyectoNombre: v.proyectoNombre,
              desde: v.desde,
              esMia: true,
            }))}
            onCerrar={() => setPanelAbiertasVisible(false)}
          />
        )}

        {/* Objetivo — el encabezado de sentido de la visita: primero de
            todo, una línea tenue. Tocar para matizarlo (ya lo escribiste al
            arrancar). Delante, "N.ª visita / última hace…" si aporta.
            Mientras la visita no ha sincronizado no es editable: se muestra
            sin lápiz y sin ruido, se vuelve tocable al sincronizar. */}
        {!objetivoAbierto ? (
          <button
            type="button"
            onClick={() => objetivoEditable && setObjetivoAbierto(true)}
            title={objetivoEditable ? 'Editar a qué vienes' : undefined}
            style={{
              display: 'flex', gap: 6, alignItems: 'baseline', width: '100%', textAlign: 'left',
              background: 'none', border: 'none', padding: '0 2px 12px', font: 'inherit',
              borderBottom: '1px solid var(--ink-100)', marginBottom: 14,
              cursor: objetivoEditable ? 'pointer' : 'default',
            }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', color: 'var(--ink-700)' }}>
              {contextoVisitaTexto && (
                <span style={{ color: 'var(--ink-400)' }}>{contextoVisitaTexto} · </span>
              )}
              {(objetivoActual ?? '').trim() || (objetivoEditable ? 'A qué vienes' : '…')}
            </span>
            {objetivoEditable && (
              <span style={{ color: 'var(--ink-400)', flexShrink: 0 }}><Icono nombre="editar" size={13} /></span>
            )}
          </button>
        ) : (
          <div style={{ border: '1px solid var(--ink-100)', borderRadius: 'var(--radius-field)', padding: 10, marginBottom: 8 }}>
            <div
              style={{
                display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6,
                color: 'var(--ink-400)', fontSize: 'var(--text-xs)',
              }}
            >
              <Icono nombre="editar" size={13} /> A qué vienes
            </div>
            <textarea
              className="field"
              style={{ height: 'auto', padding: 8 }}
              rows={2}
              autoFocus
              value={objetivoBorrador ?? ''}
              onChange={(e) => setObjetivoBorrador(e.target.value)}
              placeholder="a qué has venido: cerrar pedido, presentar gama, primera toma de contacto…"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 'var(--text-sm)' }}
                disabled={guardadoObjetivo.cargando}
                onClick={() => {
                  guardadoObjetivo.limpiarError();
                  setObjetivoBorrador(objetivoActual ?? '');
                  setObjetivoAbierto(false);
                }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ fontSize: 'var(--text-sm)' }}
                disabled={
                  guardadoObjetivo.cargando ||
                  !(objetivoBorrador ?? '').trim() ||
                  (objetivoBorrador ?? '') === (objetivoActual ?? '')
                }
                onClick={async () => {
                  await guardarObjetivo();
                  setObjetivoAbierto(false);
                }}
              >
                {guardadoObjetivo.cargando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            {guardadoObjetivo.error && (
              <div className="field-error-text" style={{ marginTop: 6 }}>{guardadoObjetivo.error}</div>
            )}
          </div>
        )}

        {/* Captura — es lo que se viene a hacer en esta pantalla. */}
        <input
          ref={inputFotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) void capturarFoto(archivo);
            e.target.value = '';
          }}
        />

        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between',
            marginBottom: 'var(--space-3)',
          }}
        >
          <span className="label" style={{ marginTop: 0 }}>Captura lo que veas</span>
          {/* Sin zona: chip (control, no un texto que hay que adivinar que
              se pincha). Con zona activa, desaparece y manda la banda. */}
          {!hayZonaActiva && (
            <button
              type="button"
              className={`chip${zonaEditorAbierto ? ' chip--on' : ''}`}
              style={{ flexShrink: 0 }}
              aria-expanded={zonaEditorAbierto}
              onClick={() => setZonaEditorAbierto((v) => !v)}
            >
              <Icono nombre="ubicacion" size={14} /> Marcar zonas
            </button>
          )}
        </div>

        {/* Banda de ZONA ACTIVA — siempre visible mientras hay zona, encima
            de los botones: con una zona marcada, TODO lo que se capture va a
            esa zona (no a «General») Y la lista "En esta visita" muestra solo
            lo de esa zona. Relleno sólido (regla #11: se ve sin depender del
            color). "cambiar" abre el campo; ✕ quita la zona (ver todo). */}
        {hayZonaActiva && (
          <div className="zona-banda">
            <Icono nombre="ubicacion" size={16} weight="fill" />
            <span>
              <strong>{zonaActual.trim()}</strong>
            </span>
            <button
              type="button"
              className="zona-banda__cambiar"
              onClick={() => setZonaEditorAbierto((v) => !v)}
            >
              cambiar
            </button>
            <button
              type="button"
              className="zona-banda__x"
              aria-label="Quitar la zona: ver todo y guardar en «General»"
              onClick={() => {
                setZonaActual('');
                setZonaEditorAbierto(false);
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Editor de zona — inline, en la propia pantalla (no una hoja).
            Tarjeta cerrable con la × de la casa (como las hojas), no un
            "cerrar" en texto. Escribe una zona o repite una ya usada. */}
        {zonaEditorAbierto && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
            <button
              type="button"
              className="hoja-cerrar"
              aria-label="Cerrar"
              style={{ position: 'absolute', top: 4, right: 6 }}
              onClick={() => setZonaEditorAbierto(false)}
            >
              ×
            </button>
            <AyudaNota concepto="zona-captura" />
            <input
              className="field"
              value={zonaActual}
              onChange={(e) => setZonaActual(e.target.value)}
              placeholder="Escribe la zona · p. ej. Puerta muelle de carga"
              autoFocus
            />

            {/* Confirmar / aplicar la zona escrita (nueva o no) — cierra el
                editor y deja la banda de zona activa arriba (guardas y ves
                solo esa zona). */}
            {zonaActual.trim() && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setZonaEditorAbierto(false)}
              >
                Usar zona «{zonaActual.trim()}»
              </button>
            )}

            {zonasUsadas.length > 0 && (
              <>
                <div className="label" style={{ marginTop: 4 }}>Zonas de esta visita</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {zonasUsadas.map((z) => (
                    <span key={z} style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="chip"
                        style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                        onClick={() => {
                          setZonaActual(z);
                          setZonaEditorAbierto(false);
                        }}
                      >
                        {z}
                      </button>
                      <button
                        type="button"
                        className="chip"
                        aria-label={`Gestionar la zona «${z}»`}
                        title={`Gestionar «${z}» (renombrar / quitar / borrar)`}
                        style={{
                          borderLeft: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0,
                          padding: '0 8px', color: 'var(--ink-400)',
                        }}
                        onClick={() => {
                          setZonaGestion(z);
                          setZonaGestionModo('menu');
                          setNombreZonaNuevo(z);
                          setZonaGestionError(null);
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </>
            )}

            {zonaGestion &&
              (() => {
                const c = cuentaZona(zonaGestion);
                return (
                  <div className="card" style={{ marginTop: 4, position: 'relative' }}>
                    <button
                      type="button"
                      className="hoja-cerrar"
                      aria-label="Cerrar"
                      style={{ position: 'absolute', top: 4, right: 6 }}
                      onClick={cerrarGestionZona}
                    >
                      ×
                    </button>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, paddingRight: 24 }}>
                      «{zonaGestion}»{' '}
                      <span style={{ color: 'var(--ink-400)', fontWeight: 400 }}>
                        · {c.total} cosa{c.total === 1 ? '' : 's'}
                      </span>
                    </div>

                    {zonaGestionModo === 'menu' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setZonaGestionModo('renombrar')}
                        >
                          Renombrar la zona
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={borrandoZona}
                          onClick={() => void pasarZonaAGeneral(zonaGestion)}
                        >
                          {borrandoZona ? 'Cambiando…' : 'Pasar todo a «General»'}
                        </button>
                        {c.mio > 0 && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-secondary--riesgo"
                            onClick={() => setZonaGestionModo('borrar')}
                          >
                            Borrar {c.mio} cosa{c.mio === 1 ? '' : 's'} mía{c.mio === 1 ? '' : 's'} de esta zona
                          </button>
                        )}
                      </div>
                    )}

                    {zonaGestionModo === 'renombrar' && (
                      <>
                        <input
                          className="field"
                          style={{ marginTop: 8 }}
                          autoFocus
                          value={nombreZonaNuevo}
                          onChange={(e) => setNombreZonaNuevo(e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setZonaGestionModo('menu')}
                            disabled={borrandoZona}
                          >
                            Volver
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={
                              !nombreZonaNuevo.trim() ||
                              nombreZonaNuevo.trim() === zonaGestion ||
                              borrandoZona
                            }
                            onClick={() => void renombrarZona(zonaGestion, nombreZonaNuevo)}
                          >
                            {borrandoZona ? 'Guardando…' : 'Guardar nombre'}
                          </button>
                        </div>
                      </>
                    )}

                    {zonaGestionModo === 'borrar' && (
                      <div className="card card--riesgo" style={{ marginTop: 8 }}>
                        <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                          ¿Borrar {c.mio} cosa{c.mio === 1 ? '' : 's'} tuya{c.mio === 1 ? '' : 's'} de «
                          {zonaGestion}»?
                          {c.comp > 0 && ` Lo de tus compañeros (${c.comp}) se queda.`} No se puede
                          deshacer.
                        </p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setZonaGestionModo('menu')}
                            disabled={borrandoZona}
                          >
                            No
                          </button>
                          <button
                            type="button"
                            className="btn btn-peligro"
                            disabled={borrandoZona}
                            onClick={() => void borrarLoMioDeZona(zonaGestion)}
                          >
                            {borrandoZona ? 'Borrando…' : `Sí, borrar ${c.mio}`}
                          </button>
                        </div>
                      </div>
                    )}

                    {zonaGestionError && (
                      <div className="field-error-text" style={{ marginTop: 8 }}>
                        {zonaGestionError}
                      </div>
                    )}
                  </div>
                );
              })()}
          </div>
        )}

        {/* Rejilla de 4, todas al mismo peso (B3), 2 columnas. "Anotar"
            (prompt maestro 10) fusiona lo que antes eran tres botones
            (Hallazgo, Oportunidad, Nota): se captura primero y se clasifica
            después. */}
        <div className="capture-grid" style={{ rowGap: 'var(--space-4)' }}>
          <button
            className="capture-btn"
            disabled={capturaFoto.cargando || espacioBloqueado}
            onClick={() => inputFotoRef.current?.click()}
          >
            <Icono nombre="foto" size={22} />
            {capturaFoto.cargando ? 'Guardando…' : 'Foto'}
          </button>
          <button
            className={`capture-btn${grabando ? ' capture-btn--rec' : ''}`}
            disabled={(capturaAudio.cargando && !grabando) || (espacioBloqueado && !grabando)}
            onClick={iniciarODetenerAudio}
          >
            {grabando ? (
              <>
                <span className="rec-dot" aria-hidden />
                Detener · {String(Math.floor(segsGrabando / 60)).padStart(2, '0')}:
                {String(segsGrabando % 60).padStart(2, '0')}
              </>
            ) : (
              <>
                <Icono nombre="audio" size={22} />
                {capturaAudio.cargando ? 'Guardando…' : 'Audio'}
              </>
            )}
          </button>
          <button type="button" className="capture-btn" onClick={() => setAnotarAbierto(true)}>
            <Icono nombre="nota" size={22} />
            Anotar
          </button>
          <button
            type="button"
            className="capture-btn"
            onClick={() => setPasoAbierto(true)}
            disabled={!visitaLocal?.clienteId}
          >
            <Icono nombre="paso" size={22} />
            Próximo paso
          </button>
        </div>

        {/* B7 · Motivo visible cuando Foto/Audio salen deshabilitados por el
            pozo del equipo lleno — antes solo se veía si conseguías pulsar. */}
        {espacioBloqueado && (
          <Aviso tipo="atencion" titulo="Sin espacio para fotos ni audios">
            El espacio del equipo está lleno. Anotar y Próximo paso siguen
            funcionando; para volver a subir fotos y audios, alguien tiene que
            liberar espacio en Yo → Mi espacio.
          </Aviso>
        )}

        {capturaFoto.error && <div className="field-error-text">{capturaFoto.error}</div>}
        {capturaAudio.error && <div className="field-error-text">{capturaAudio.error}</div>}
        {grabando && (
          <Aviso tipo="atencion" titulo="Grabando">
            No bloquees la pantalla ni cambies de app o la grabación se cortará.
          </Aviso>
        )}

        {/* Zona 3 · En esta visita: lo que hay. Una sola lista fundida (lo
            tuyo + oportunidades + próximos pasos + lo de compañeros, regla
            2) con un contador y un estado de sincronización únicos. Sin
            tarjeta con fondo: la lista fluye en el scroll de la pantalla —
            con una caja propia parecía tener su propio scroll y solo se
            veían 3 filas. */}
        <div style={{ margin: '16px 2px 4px' }}>
          {/* Primero el conmutador Tipo/Zona (arriba, a la derecha); debajo,
              el título "En esta visita" y el contador — no todo en la misma
              línea. El conmutador se oculta si hay una zona activa (la lista
              ya es de una sola zona). */}
          {zonaUsada && !zonaParaCaptura && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <Segmentado
                opciones={[
                  { valor: 'tipo', etiqueta: 'Tipo', icono: 'lista' },
                  { valor: 'zona', etiqueta: 'Zona', icono: 'ubicacion' },
                ]}
                valor={ordenPorZona ? 'zona' : 'tipo'}
                onCambio={(v) => setOrdenPorZona(v === 'zona')}
              />
            </div>
          )}
          <div
            style={{
              fontWeight: 700, fontSize: 'var(--text-sm)',
              paddingBottom: 6, borderBottom: '1px solid var(--ink-100)',
            }}
          >
            En esta visita{zonaParaCaptura ? ` · ${zonaParaCaptura}` : ''}
          </div>
          {totalEnVisita > 0 && (
            <div
              style={{
                display: 'flex', flexWrap: 'wrap', gap: '2px 8px', marginTop: 6,
                fontSize: 'var(--text-xs)', color: 'var(--ink-400)',
              }}
            >
              <span>{contadorEnVisita}</span>
              <span style={{ color: pendientesSync === 0 ? 'var(--success-600)' : 'var(--ink-400)' }}>
                {estadoSyncTexto}
              </span>
            </div>
          )}
        </div>

        {/* B2 · Recordatorio EN VIVO (antes solo llegaba en la pantalla de
            cierre, tarde): cuando ya has capturado unas cuantas cosas pero
            no hay ninguna oportunidad ni ningún próximo paso apuntado. */}
        {recordatorioFaltaTexto && (
          <div
            style={{
              display: 'flex', gap: 6, alignItems: 'flex-start', margin: '2px 2px 6px',
              fontSize: 'var(--text-xs)', color: 'var(--ink-500)',
            }}
          >
            <Icono nombre="info" size={13} />
            <span>{recordatorioFaltaTexto}</span>
          </div>
        )}

        {totalEnVisita === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-400)', fontSize: 'var(--text-sm)', padding: '12px 0' }}>
            {zonaParaCaptura ? (
              <>
                Aún no has capturado nada en «{zonaParaCaptura}».<br />
                Captura algo, o quita la zona (✕) para ver todo.
              </>
            ) : (
              <>
                Aún no has capturado nada.<br />
                Toca Foto, Audio o Anotar para empezar.
              </>
            )}
          </div>
        ) : (
          <div style={{ padding: '0 4px' }}>
            {ordenPorZona && !zonaParaCaptura ? (
              <CapturasPorUbicacion
                capturas={capturas}
                hallazgos={hallazgos}
                nombresUbicaciones={nombresUbicacionesVisita}
                nombresTerminos={nombresTerminos}
                onTocarCaptura={(id) => navigate(`/capturas/${id}`)}
                onAbrirFoto={setFotoVisorId}
              />
            ) : (
              <>
                {fotosOwnV.length > 0 && (
                  <div
                    style={{
                      display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 0',
                      borderTop: '1px solid var(--ink-100)',
                      borderBottom: '1px solid var(--ink-100)',
                    }}
                  >
                    {[...fotosOwnV].reverse().map((f) => {
                      const blob = f.archivoLocal as Blob | undefined;
                      const titulo = (f.payload as { titulo?: string }).titulo;
                      return blob ? (
                        <img
                          key={f.id}
                          src={URL.createObjectURL(blob)}
                          alt={titulo ?? 'foto'}
                          onClick={() => setFotoVisorId(f.id)}
                          style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, flexShrink: 0, cursor: 'pointer' }}
                        />
                      ) : (
                        <div
                          key={f.id}
                          onClick={() => setFotoVisorId(f.id)}
                          style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--surface-1)', flexShrink: 0, cursor: 'pointer' }}
                        />
                      );
                    })}
                  </div>
                )}
                {/* B4 · Fotos de compañeros: fila de texto (el binario está
                    en Storage, no en la cola local). */}
                {fotosCompanerosV.map((c) =>
                  filaEnVisita(
                    c.id,
                    'foto',
                    capitalizarFrase(c.titulo || 'foto'),
                    `de ${nombresComerciales?.[c.comercial_autor_id] ?? '…'}`,
                    () => navigate(`/capturas/${c.id}`)
                  )
                )}
                {audiosOwnV.map((a) =>
                  filaEnVisita(
                    a.id,
                    'audio',
                    capitalizarFrase((a.payload as { titulo?: string }).titulo || 'sin título'),
                    undefined,
                    () => navigate(`/capturas/${a.id}`)
                  )
                )}
                {audiosCompanerosV.map((c) =>
                  filaEnVisita(
                    c.id,
                    'audio',
                    capitalizarFrase(c.titulo || 'sin título'),
                    `de ${nombresComerciales?.[c.comercial_autor_id] ?? '…'}`,
                    () => navigate(`/capturas/${c.id}`)
                  )
                )}
                {notasOwnV.map((n) => {
                  const p = n.payload as { titulo?: string; contenidoTexto?: string };
                  return filaEnVisita(
                    n.id,
                    'nota',
                    capitalizarFrase(p.titulo || p.contenidoTexto || '(nota vacía)'),
                    undefined,
                    () => navigate(`/capturas/${n.id}`)
                  );
                })}
                {notasCompanerosV.map((c) =>
                  filaEnVisita(
                    c.id,
                    'nota',
                    capitalizarFrase(c.titulo || c.contenido_texto || '(nota vacía)'),
                    `de ${nombresComerciales?.[c.comercial_autor_id] ?? '…'}`,
                    () => navigate(`/capturas/${c.id}`)
                  )
                )}
                {hallazgosV.map((h) => {
                  const p = h.payload as { terminoId?: string; naturaleza: string; nota?: string };
                  const term = p.terminoId ? nombresTerminos?.[p.terminoId] : undefined;
                  // Se puede abrir para revisar/editar/borrar en cuanto ha
                  // subido (su detalle lee de la BD, no de la cola local).
                  return filaEnVisita(
                    h.id,
                    'hallazgo',
                    tituloHallazgo(term, p.nota, p.naturaleza),
                    etiqueta(NATURALEZA_LABEL, p.naturaleza),
                    h.estado === 'completado'
                      ? () => navigate(`/hallazgos/${h.id}`, { state: origen })
                      : undefined
                  );
                })}
                {hallazgosCompanerosV.map((h) =>
                  filaEnVisita(
                    h.id,
                    'hallazgo',
                    tituloHallazgo((h.termino as unknown as { nombre: string } | null)?.nombre, h.nota, h.naturaleza),
                    `${etiqueta(NATURALEZA_LABEL, h.naturaleza)} · de ${nombresComerciales?.[h.comercial_autor_id] ?? '…'}`,
                    () => navigate(`/hallazgos/${h.id}`, { state: origen })
                  )
                )}
                {oportunidadesV.map((o) => {
                  const p = o.payload as { titulo: string; prioridad?: string };
                  return filaEnVisita(
                    o.id,
                    'oportunidad',
                    capitalizarFrase(p.titulo),
                    p.prioridad,
                    () => navigate(`/oportunidades/${o.id}`, { state: origen })
                  );
                })}
                {oportunidadesCompanerosV.map((o) =>
                  filaEnVisita(
                    o.id,
                    'oportunidad',
                    capitalizarFrase(o.titulo),
                    `de ${nombresComerciales?.[o.comercial_autor_id] ?? '…'}`,
                    () => navigate(`/oportunidades/${o.id}`, { state: origen })
                  )
                )}
                {pasosV.map((p) => {
                  const payload = p.payload as { descripcion: string; fechaObjetivo?: string };
                  const fecha = payload.fechaObjetivo ? fechaCorta(payload.fechaObjetivo) : 'sin fecha objetivo';
                  return filaEnVisita(
                    p.id,
                    'paso',
                    capitalizarFrase(payload.descripcion),
                    fecha,
                    p.estado === 'completado'
                      ? () => navigate(`/proximos-pasos/${p.id}`, { state: origen })
                      : undefined
                  );
                })}
                {pasosCompanerosV.map((p) =>
                  filaEnVisita(
                    p.id,
                    'paso',
                    capitalizarFrase(p.descripcion),
                    `${p.fecha_objetivo ? fechaCorta(p.fecha_objetivo) : 'sin fecha'} · de ${nombresComerciales?.[p.comercial_responsable_id] ?? '…'}`
                  )
                )}
              </>
            )}
          </div>
        )}

        {/* A1 · Cerrar es el final de la visita: al final del scroll, tras
            "En esta visita" — cerrar obliga a pasar por el repaso de lo
            capturado y deja de ocupar la zona del pulgar. Secundario: el
            foco de la pantalla es capturar, no cerrar. */}
        <button
          className="btn btn-secondary"
          style={{ marginTop: 24 }}
          onClick={() => navigate(`/visita/${visitaId}/cierre`)}
        >
          Cerrar visita
        </button>
      </div>

      {anotarAbierto && (
        <AnotarHoja
          visitaId={visitaId}
          clienteId={visitaLocal?.clienteId}
          comercialId={comercial.id}
          onGuardarHallazgo={guardarHallazgo}
          onGuardarOportunidad={guardarOportunidad}
          onCompletarOportunidad={completarOportunidad}
          onCerrar={() => setAnotarAbierto(false)}
        />
      )}

      {pasoAbierto && visitaLocal?.clienteId && (
        <PasoRapidoHoja
          visitaId={visitaId}
          comercialId={comercial.id}
          onGuardar={guardarPaso}
          onPlanificarVisita={planificarVisitaDesdePaso}
          onCerrar={() => setPasoAbierto(false)}
        />
      )}

      {interlocutoresAbierto && visitaLocal?.clienteId && (
        <InterlocutoresHoja
          visitaId={visitaId}
          clienteId={visitaLocal.clienteId}
          onCerrar={() => setInterlocutoresAbierto(false)}
        />
      )}
      {participantesAbierto && visitaId && (
        <ParticipantesHoja visitaId={visitaId} onCerrar={() => setParticipantesAbierto(false)} />
      )}

      {/* Foto / Audio — tras capturar el binario, la misma hoja para
          ponerle título y confirmar. Cerrar sin guardar descarta la
          captura (igual que el botón "Descartar"). */}
      {(fotoPendiente || audioPendiente) && (
        <HojaSuperior titulo={fotoPendiente ? 'Foto' : 'Audio'} onCerrar={descartarPendiente}>
          {fotoPendiente && (
            <img
              src={URL.createObjectURL(fotoPendiente)}
              alt="vista previa"
              style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
            />
          )}
          {audioPendiente && (
            <audio controls src={URL.createObjectURL(audioPendiente)} style={{ width: '100%', marginBottom: 8 }} />
          )}
          {/* B7 · La zona en la que cae esta captura, aquí y ahora — para no
              descubrir al cerrar que una foto quedó en el sitio que no era. */}
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 6 }}>
            <Icono nombre="recorrido" size={12} />{' '}
            {zonaPendiente ? `Zona · ${zonaPendiente}` : 'Sin zona · va a «General»'}
          </div>
          {/* B7 · El título como algo que rellenar (rótulo visible), no un
              placeholder que se pasa por alto: con 8 fotos, el rótulo es lo
              único que las distingue luego. */}
          <div className="label" style={{ marginTop: 0 }}>
            {fotoPendiente ? 'Qué es esta foto' : 'Qué es este audio'}
          </div>
          <input
            className="field"
            autoFocus
            value={tituloPendiente}
            onChange={(e) => setTituloPendiente(e.target.value)}
            placeholder={fotoPendiente ? 'p. ej. lector averiado puerta 3 · opcional' : 'p. ej. notas del jefe de planta · opcional'}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="btn btn-secondary"
              disabled={capturaFoto.cargando || capturaAudio.cargando}
              onClick={descartarPendiente}
            >
              Descartar
            </button>
            <button
              className="btn btn-primary"
              disabled={capturaFoto.cargando || capturaAudio.cargando}
              onClick={confirmarCapturaPendiente}
            >
              {capturaFoto.cargando || capturaAudio.cargando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          {(capturaFoto.error || capturaAudio.error) && (
            <div className="field-error-text" style={{ marginTop: 8 }}>{capturaFoto.error || capturaAudio.error}</div>
          )}
        </HojaSuperior>
      )}

      {visorFotos}
    </div>
  );
}
