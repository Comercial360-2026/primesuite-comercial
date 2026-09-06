import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta, haceRelativo } from '@/lib/fechas';
import { capitalizarFrase } from '@/lib/texto';
import { uuid } from '@/lib/uuid';
import { crearVisitaConResponsable } from '@/lib/rpc';
import { useEspacioEquipo } from '@/hooks/use-espacio-equipo';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaLocal } from '@/hooks/use-visita-local';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { useDictado } from '@/hooks/use-dictado';
import { comprimirImagen } from '@/lib/comprimir-imagen';
import { OportunidadRapidaHoja } from './oportunidad-rapida-hoja';
import { HallazgoRapidoHoja } from './hallazgo-rapido-hoja';
import { PasoRapidoHoja } from './paso-rapido-hoja';
import { InterlocutoresHoja } from './interlocutores-hoja';
import { ParticipantesHoja } from './participantes-hoja';
import { VisorFotos } from './visor-fotos';
import { Icono, type NombreIcono } from '@/components/ui/iconos';
import { Aviso } from '@/components/ui/aviso';
import { AyudaNota } from '@/components/ui/ayuda-nota';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { HojaInferior } from '@/components/ui/hoja-inferior';
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
        const p = h.payload as { terminoId: string; naturaleza: string };
        return itemFila(h.id, 'hallazgo', nombresTerminos?.[p.terminoId] ?? '…', etiqueta(NATURALEZA_LABEL, p.naturaleza));
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
  const queryClient = useQueryClient();
  const { comercial } = useSesionActual();
  const visitaLocal = useVisitaLocal(visitaId);
  const { iniciarVisita } = useVisitaActivaContext();
  const { operaciones, encolar } = useSyncQueue(visitaId);

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
  // El editor de zona se abre BAJO DEMANDA desde el chip de la fila del
  // título; no vive fijo entre el título y los botones (eso empujaba la
  // captura hacia abajo aunque ya no estuvieras marcando zonas).
  const [zonaEditorAbierto, setZonaEditorAbierto] = useState(false);
  // Etiqueta que se estampa en TODO lo que se captura ahora mismo (foto,
  // audio, nota, hallazgo, oportunidad, próximo paso). Vacía => undefined.
  const zonaParaCaptura = zonaActual.trim() || undefined;
  // Foto abierta en el visor a pantalla completa (tocar una miniatura).
  const [fotoVisorId, setFotoVisorId] = useState<string | null>(null);
  const [oportunidadAbierta, setOportunidadAbierta] = useState(false);
  // D1 (rediseño Zona 3): "En esta visita" agrupa por tipo por defecto; el
  // conmutador a "por zona" solo tiene sentido si la visita ha usado el
  // Recorrido (si no, no hay zonas que agrupar).
  const [ordenPorZona, setOrdenPorZona] = useState(false);
  const [hallazgoAbierto, setHallazgoAbierto] = useState(false);
  const [pasoAbierto, setPasoAbierto] = useState(false);
  const [interlocutoresAbierto, setInterlocutoresAbierto] = useState(false);
  const [participantesAbierto, setParticipantesAbierto] = useState(false);
  const [notaAbierta, setNotaAbierta] = useState(false);
  const [notaTitulo, setNotaTitulo] = useState('');
  const [notaTexto, setNotaTexto] = useState('');
  const [grabando, setGrabando] = useState(false);
  const [fotoPendiente, setFotoPendiente] = useState<Blob | null>(null);
  const [audioPendiente, setAudioPendiente] = useState<Blob | null>(null);
  const [tituloPendiente, setTituloPendiente] = useState('');
  // B6 · La zona se congela en el MOMENTO de capturar (disparo de la foto,
  // inicio de la grabación), no al pulsar "Guardar" en la hoja de título:
  // si entre medias cambias de zona, la captura anterior debe quedarse en
  // la suya. Nota/hallazgo/oportunidad/paso no lo necesitan — su hoja es
  // modal y tapa el campo de zona.
  const [zonaPendiente, setZonaPendiente] = useState<string | undefined>(undefined);
  const guardadoNota = useAccionAsync();
  const [guardadoNotaConExito, setGuardadoNotaConExito] = useState(false);
  // Dictado voz→texto para la nota: va añadiendo lo reconocido al final.
  const dictadoNota = useDictado((frag) =>
    setNotaTexto((t) => (t.trim() ? `${t.trimEnd()} ${frag}` : frag))
  );
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
    .map((h) => (h.payload as { terminoId: string }).terminoId)
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

  // Nombres (no solo el número) — Zona 1 los enseña de un vistazo: "Ana
  // López y 1 más". Solo cuentan los que siguen en el directorio del
  // cliente: si a uno se le da de baja ("Quitar del directorio"), su fila de
  // visita_interlocutor se conserva por el histórico de visitas cerradas,
  // pero deja de contar aquí.
  const { data: interlocutoresPresentes } = useQuery({
    queryKey: ['interlocutores-count', visitaId],
    enabled: !!visitaId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('visita_interlocutor')
        .select('interlocutor:interlocutor_id(nombre, activo)')
        .eq('visita_id', visitaId!);
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.interlocutor as unknown as { nombre: string; activo: boolean } | null)
        .filter((i): i is { nombre: string; activo: boolean } => !!i?.activo)
        .map((i) => i.nombre);
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

  // Nombre del proyecto (línea de negocio) de esta visita, para la Zona 1 —
  // el "General" es invisible por defecto (P9, regla 4), igual que en
  // Agenda: solo se nombra un proyecto real.
  const { data: proyectoVisita } = useQuery({
    queryKey: ['proyecto-nombre', visitaLocal?.proyectoId],
    enabled: !!visitaLocal?.proyectoId,
    queryFn: async (): Promise<{ nombre: string; es_general: boolean } | null> => {
      const { data, error } = await supabase
        .from('proyecto')
        .select('nombre, es_general')
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
    refetchInterval: 20000,
    queryFn: async (): Promise<{ id: string; clienteNombre: string }[]> => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select('visita_id, visita:visita_id!inner(id, estado_captura, cliente:cliente_id(nombre))')
        .eq('comercial_id', comercial!.id)
        .in('estado', ['pendiente', 'aceptado'])
        .eq('visita.estado_captura', 'en_curso')
        .neq('visita_id', visitaId!);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const v = r.visita as unknown as { id: string; cliente: { nombre: string } | null };
        return { id: v.id, clienteNombre: v.cliente?.nombre ?? 'un cliente' };
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

  function cerrarNota() {
    dictadoNota.parar();
    guardadoNota.limpiarError();
    setNotaAbierta(false);
  }

  async function guardarNota() {
    if (!notaTexto.trim()) return;
    const capturaId = uuid();
    await guardadoNota.ejecutar(
      () =>
        encolar(
          capturaId,
          'captura_libre',
          {
            visitaId: visitaId!,
            comercialAutorId: comercial!.id,
            tipo: 'nota',
            titulo: notaTitulo.trim() || undefined,
            contenidoTexto: notaTexto.trim(),
            zonaTexto: zonaParaCaptura,
          },
          { dependeDe: visitaId }
        ),
      {
        onExito: () => {
          setGuardadoNotaConExito(true);
          setTimeout(() => {
            setNotaTitulo('');
            setNotaTexto('');
            setNotaAbierta(false);
            setGuardadoNotaConExito(false);
          }, 700);
        },
        mensajeError: 'No se pudo guardar la nota. Inténtalo de nuevo.',
      }
    );
  }

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
    setTimeout(() => setHallazgoAbierto(false), 700);
  }

  async function guardarOportunidad(oportunidadId: string, payload: OportunidadPayload) {
    // El id lo genera el modal para poder ofrecer "Completar ahora". El
    // modal ya no se cierra solo: el comercial elige (completar / seguir).
    await encolar(oportunidadId, 'oportunidad', { ...payload, zonaTexto: zonaParaCaptura }, { dependeDe: visitaId });
  }

  function completarOportunidad(oportunidadId: string) {
    setOportunidadAbierta(false);
    navigate(`/oportunidades/${oportunidadId}`);
  }

  async function guardarPaso(payload: ProximoPasoPayload) {
    const pasoId = uuid();
    // En Recorrido, `zonaParaCaptura` estampa la zona; fuera del Recorrido
    // es undefined y `aPayloadSnakeCase` lo descarta.
    await encolar(pasoId, 'proximo_paso', { ...payload, zonaTexto: zonaParaCaptura }, { dependeDe: visitaId });
    setTimeout(() => setPasoAbierto(false), 700);
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
    if (!visitaLocal?.clienteId || !comercial) return;
    // Llamada directa, NO por la cola offline: igual que planificar desde la
    // ficha, para que aparezca en la agenda al momento.
    const nuevaId = uuid();
    const { error } = await crearVisitaConResponsable({
      pVisitaId: nuevaId,
      pClienteId: visitaLocal.clienteId,
      pComercialId: comercial.id,
      pFecha: new Date(`${fecha}T${hora || '09:00'}:00`).toISOString(),
      pEstadoCaptura: 'agendada',
    });
    if (error) throw new Error(error);
    // Sigue en el mismo proyecto (línea de negocio) que la visita desde la
    // que se planifica — continuidad, no "vuelve al General" por defecto.
    // Si aún no se conoce (visita muy reciente, todavía en cola local), se
    // omite: el servidor ya habrá aplicado su propia reserva al crearla.
    const parche: { objetivo?: string; hora_definida?: boolean; franja?: string | null; proyecto_id?: string } = {};
    if (visitaLocal.proyectoId) parche.proyecto_id = visitaLocal.proyectoId;
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
          .select('id, tipo, titulo, contenido_texto, comercial_autor_id, creado_en')
          .eq('visita_id', visitaId!)
          .neq('comercial_autor_id', comercial!.id),
        supabase
          .from('hallazgo')
          .select('id, naturaleza, comercial_autor_id, termino:termino_id(nombre)')
          .eq('visita_id', visitaId!)
          .neq('comercial_autor_id', comercial!.id),
        supabase
          .from('proximo_paso')
          .select('id, descripcion, fecha_objetivo, comercial_responsable_id')
          .eq('visita_id', visitaId!)
          .neq('comercial_responsable_id', comercial!.id),
        supabase
          .from('oportunidad')
          .select('id, titulo, etapa, comercial_autor_id')
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
          onVolver={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'))}
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
  const nFotos = fotosOwn.length;
  const nAudios = audiosOwn.length;
  const nNotas = notasOwn.length;

  // Con proyecto real (no el "General" invisible por defecto, P9): mismo
  // criterio que Agenda — el nombre se añade tal cual, sin la palabra
  // "Proyecto" delante.
  const proyectoTexto = proyectoVisita && !proyectoVisita.es_general ? proyectoVisita.nombre : '';

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
      ? [`${numeroVisita}.ª visita`, visitaAnterior ? `última hace ${haceRelativo(visitaAnterior.fecha)}` : null]
          .filter(Boolean)
          .join(' · ')
      : visitaAnterior
        ? `última visita hace ${haceRelativo(visitaAnterior.fecha)}`
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

  // Zona 3 — "En esta visita" fundido: lo tuyo + lo de compañeros, con un
  // único contador (D2) y un único indicador de sincronización (regla 5),
  // en vez de las cuatro listas de antes (capturas, oportunidades, próximos
  // pasos, de compañeros).
  const totalFotos = nFotos + fotosCompaneros.length;
  const totalAudios = nAudios + audiosCompaneros.length;
  const totalNotas = nNotas + notasCompaneros.length;
  const totalHallazgos = hallazgos.length + hallazgosCompaneros.length;
  const totalOportunidades = oportunidades.length + oportunidadesCompaneros.length;
  const totalPasos = pasos.length + pasosCompaneros.length;
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
  const pendientesSync = [...capturas, ...hallazgos, ...oportunidades, ...pasos].filter(
    (op) => op.estado !== 'completado'
  ).length;
  const estadoSyncTexto = pendientesSync === 0 ? 'todo subido' : `${pendientesSync} sin subir`;
  // B2 · Con varias capturas hechas pero sin ninguna oportunidad ni ningún
  // próximo paso, se recuerda AQUÍ (no solo al cerrar). Umbral 3 para no
  // saltar a la primera foto.
  const recordatorioFaltaTexto =
    totalEnVisita < 3
      ? null
      : totalOportunidades === 0 && totalPasos === 0
        ? 'No has apuntado ninguna oportunidad ni próximo paso. Si viste algo, apúntalo antes de cerrar.'
        : totalOportunidades === 0
          ? 'No has apuntado ninguna oportunidad. Si viste alguna, apúntala antes de cerrar.'
          : totalPasos === 0
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
        onVolver={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'))}
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
        {/* A0.2 · Otra visita abierta sin cerrar. */}
        {otrasVisitasEnCurso.length > 0 && (
          <Aviso
            tipo="atencion"
            titulo={
              otrasVisitasEnCurso.length === 1
                ? 'Tienes otra visita abierta'
                : `Tienes ${otrasVisitasEnCurso.length} visitas abiertas`
            }
          >
            {otrasVisitasEnCurso.length === 1 ? (
              <>
                Sigue sin cerrar la de {otrasVisitasEnCurso[0].clienteNombre}.{' '}
                <button
                  type="button"
                  className="btn-enlace"
                  style={{ padding: 0 }}
                  onClick={() => navigate(`/visita/${otrasVisitasEnCurso[0].id}`)}
                >
                  ir a ella
                </button>
              </>
            ) : (
              'Ciérralas cuando puedas para no mezclar capturas entre visitas.'
            )}
          </Aviso>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <span className="label" style={{ marginTop: 0 }}>Captura lo que veas</span>
          {/* Zona activa → pastilla sólida con el nombre (regla #11: se ve
              que hay zona sin depender del color). Sin zona → enlace
              discreto. Ambos abren la hoja de zona. */}
          {hayZonaActiva ? (
            <button
              type="button"
              className="zona-pill"
              onClick={() => setZonaEditorAbierto(true)}
              title={`Se guarda en ${zonaActual.trim()} · tocar para cambiar o quitar`}
            >
              <Icono nombre="ubicacion" size={14} weight="fill" />
              <span>{zonaActual.trim()}</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-enlace"
              style={{ padding: 0, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
              onClick={() => setZonaEditorAbierto(true)}
            >
              <Icono nombre="ubicacion" size={14} /> Marcar zonas
            </button>
          )}
        </div>

        {/* Rejilla de 6, todas al mismo peso (B3), 2 columnas. Hueco mayor
            entre las dos filas: separa la captura en caliente
            (foto/nota/audio) de la que abre un formulario, sin jerarquizar. */}
        <div className="capture-grid" style={{ rowGap: 'var(--space-4)' }}>
          <button
            className="capture-btn"
            disabled={capturaFoto.cargando || espacioBloqueado}
            onClick={() => inputFotoRef.current?.click()}
          >
            <Icono nombre="foto" size={22} />
            {capturaFoto.cargando ? 'Guardando…' : 'Foto'}
          </button>
          <button className="capture-btn" onClick={() => setNotaAbierta(true)}>
            <Icono nombre="nota" size={22} />
            Nota
          </button>
          <button
            className="capture-btn"
            disabled={(capturaAudio.cargando && !grabando) || (espacioBloqueado && !grabando)}
            onClick={iniciarODetenerAudio}
          >
            <Icono nombre="audio" size={22} />
            {grabando ? 'Detener' : capturaAudio.cargando ? 'Guardando…' : 'Audio'}
          </button>
          <button type="button" className="capture-btn" onClick={() => setHallazgoAbierto(true)}>
            <Icono nombre="hallazgo" size={22} />
            Hallazgo
          </button>
          <button type="button" className="capture-btn" onClick={() => setOportunidadAbierta(true)}>
            <Icono nombre="oportunidad" size={22} />
            Oportunidad
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
            El espacio del equipo está lleno. Las notas de texto siguen
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
        <div style={{ margin: '10px 2px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>En esta visita</span>
            {zonaUsada && (
              <button
                type="button"
                className="btn-enlace"
                style={{ marginLeft: 'auto', padding: 0, whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => setOrdenPorZona((v) => !v)}
              >
                {ordenPorZona ? 'ver por tipo' : 'ver por zona'}
              </button>
            )}
          </div>
          {totalEnVisita > 0 && (
            <div
              style={{
                display: 'flex', flexWrap: 'wrap', gap: '2px 8px', marginTop: 2,
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
            Aún no has capturado nada.<br />
            Toca Foto, Nota o Audio para empezar.
          </div>
        ) : (
          <div style={{ padding: '0 4px' }}>
            {ordenPorZona ? (
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
                {fotosOwn.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 0' }}>
                    {[...fotosOwn].reverse().map((f) => {
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
                {fotosCompaneros.map((c) =>
                  filaEnVisita(
                    c.id,
                    'foto',
                    capitalizarFrase(c.titulo || 'foto'),
                    `de ${nombresComerciales?.[c.comercial_autor_id] ?? '…'}`,
                    () => navigate(`/capturas/${c.id}`)
                  )
                )}
                {audiosOwn.map((a) =>
                  filaEnVisita(
                    a.id,
                    'audio',
                    capitalizarFrase((a.payload as { titulo?: string }).titulo || 'sin título'),
                    undefined,
                    () => navigate(`/capturas/${a.id}`)
                  )
                )}
                {audiosCompaneros.map((c) =>
                  filaEnVisita(
                    c.id,
                    'audio',
                    capitalizarFrase(c.titulo || 'sin título'),
                    `de ${nombresComerciales?.[c.comercial_autor_id] ?? '…'}`,
                    () => navigate(`/capturas/${c.id}`)
                  )
                )}
                {notasOwn.map((n) => {
                  const p = n.payload as { titulo?: string; contenidoTexto?: string };
                  return filaEnVisita(
                    n.id,
                    'nota',
                    capitalizarFrase(p.titulo || p.contenidoTexto || '(nota vacía)'),
                    undefined,
                    () => navigate(`/capturas/${n.id}`)
                  );
                })}
                {notasCompaneros.map((c) =>
                  filaEnVisita(
                    c.id,
                    'nota',
                    capitalizarFrase(c.titulo || c.contenido_texto || '(nota vacía)'),
                    `de ${nombresComerciales?.[c.comercial_autor_id] ?? '…'}`,
                    () => navigate(`/capturas/${c.id}`)
                  )
                )}
                {hallazgos.map((h) => {
                  const p = h.payload as { terminoId: string; naturaleza: string };
                  return filaEnVisita(h.id, 'hallazgo', nombresTerminos?.[p.terminoId] ?? '…', etiqueta(NATURALEZA_LABEL, p.naturaleza));
                })}
                {hallazgosCompaneros.map((h) =>
                  filaEnVisita(
                    h.id,
                    'hallazgo',
                    (h.termino as unknown as { nombre: string } | null)?.nombre ?? '…',
                    `${etiqueta(NATURALEZA_LABEL, h.naturaleza)} · de ${nombresComerciales?.[h.comercial_autor_id] ?? '…'}`,
                    () => navigate(`/hallazgos/${h.id}`)
                  )
                )}
                {oportunidades.map((o) => {
                  const p = o.payload as { titulo: string; prioridad?: string };
                  return filaEnVisita(
                    o.id,
                    'oportunidad',
                    capitalizarFrase(p.titulo),
                    p.prioridad,
                    () => navigate(`/oportunidades/${o.id}`)
                  );
                })}
                {oportunidadesCompaneros.map((o) =>
                  filaEnVisita(
                    o.id,
                    'oportunidad',
                    capitalizarFrase(o.titulo),
                    `de ${nombresComerciales?.[o.comercial_autor_id] ?? '…'}`,
                    () => navigate(`/oportunidades/${o.id}`)
                  )
                )}
                {pasos.map((p) => {
                  const payload = p.payload as { descripcion: string; fechaObjetivo?: string };
                  const fecha = payload.fechaObjetivo ? fechaCorta(payload.fechaObjetivo) : 'sin fecha objetivo';
                  return filaEnVisita(p.id, 'paso', capitalizarFrase(payload.descripcion), fecha);
                })}
                {pasosCompaneros.map((p) =>
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

      {oportunidadAbierta && (
        <OportunidadRapidaHoja
          visitaId={visitaId}
          clienteId={visitaLocal?.clienteId}
          comercialId={comercial.id}
          onGuardar={guardarOportunidad}
          onCompletar={completarOportunidad}
          onCerrar={() => setOportunidadAbierta(false)}
        />
      )}

      {hallazgoAbierto && (
        <HallazgoRapidoHoja
          visitaId={visitaId}
          comercialId={comercial.id}
          onGuardar={guardarHallazgo}
          onCerrar={() => setHallazgoAbierto(false)}
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

      {/* Zona — hoja inferior, como el resto de capturas (no una caja
          inline). Escribes la zona que recorres y todo lo que captures a
          partir de ahí queda atado a ella; vacía → «General». */}
      {zonaEditorAbierto && (
        <HojaInferior titulo="Zona de la captura" onCerrar={() => setZonaEditorAbierto(false)}>
          <AyudaNota concepto="zona-captura" />

          {/* Dónde se guarda AHORA — una sola cosa, y se ve (regla #11). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-500)' }}>Se guarda en:</span>
            {hayZonaActiva ? (
              <span className="zona-pill" style={{ cursor: 'default' }}>
                <Icono nombre="ubicacion" size={14} weight="fill" />
                <span>{zonaActual.trim()}</span>
                <button
                  type="button"
                  aria-label="Quitar la zona"
                  onClick={() => setZonaActual('')}
                  style={{
                    border: 'none', background: 'none', color: '#fff', cursor: 'pointer',
                    padding: 0, marginLeft: 2, display: 'flex', fontSize: 14, lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </span>
            ) : (
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>General</span>
            )}
          </div>

          <input
            className="field"
            value={zonaActual}
            onChange={(e) => setZonaActual(e.target.value)}
            placeholder="Escribe la zona · p. ej. Puerta muelle de carga"
            autoFocus
          />

          {zonasUsadas.length > 0 && (
            <>
              <div className="label" style={{ marginTop: 10 }}>Repetir una zona de esta visita</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {zonasUsadas.map((z) => (
                  <button
                    key={z}
                    type="button"
                    className="chip"
                    onClick={() => setZonaActual(z)}
                  >
                    {z}
                  </button>
                ))}
              </div>
            </>
          )}

          <button
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={() => setZonaEditorAbierto(false)}
          >
            Hecho
          </button>
        </HojaInferior>
      )}

      {/* Nota — misma hoja inferior que el resto de capturas (foto, audio,
          hallazgo, oportunidad, próximo paso): un solo gesto, un solo
          comportamiento. */}
      {notaAbierta && (
        <HojaInferior titulo="Nota" onCerrar={cerrarNota}>
          {/* El foco va al cuerpo, no al título: lo normal es querer
              escribir la nota ya; el título es opcional y casi nadie lo
              pone en caliente. */}
          <textarea
            className="field"
            style={{ height: 'auto', padding: 8 }}
            rows={3}
            autoFocus
            value={notaTexto}
            onChange={(e) => setNotaTexto(e.target.value)}
            placeholder="escribe o dicta la nota…"
          />
          {dictadoNota.soportado && (
            <button
              type="button"
              className={`chip${dictadoNota.dictando ? ' chip--on' : ''}`}
              style={{ marginTop: 6 }}
              onClick={dictadoNota.alternar}
            >
              <Icono nombre="audio" size={14} />
              {dictadoNota.dictando ? 'Escuchando… tocar para parar' : 'Dictar'}
            </button>
          )}
          <input
            className="field"
            style={{ marginTop: 8 }}
            value={notaTitulo}
            onChange={(e) => setNotaTitulo(e.target.value)}
            placeholder="título breve (opcional)"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary" disabled={guardadoNota.cargando} onClick={cerrarNota}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              disabled={guardadoNota.cargando || guardadoNotaConExito || !notaTexto.trim()}
              onClick={guardarNota}
            >
              {guardadoNotaConExito ? <><Icono nombre="check" size={16} /> Guardado</> : guardadoNota.cargando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          {guardadoNota.error && (
            <div className="field-error-text" style={{ marginTop: 8 }}>{guardadoNota.error}</div>
          )}
        </HojaInferior>
      )}

      {/* Foto / Audio — tras capturar el binario, la misma hoja para
          ponerle título y confirmar. Cerrar sin guardar descarta la
          captura (igual que el botón "Descartar"). */}
      {(fotoPendiente || audioPendiente) && (
        <HojaInferior titulo={fotoPendiente ? 'Foto' : 'Audio'} onCerrar={descartarPendiente}>
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
        </HojaInferior>
      )}

      {visorFotos}
    </div>
  );
}
