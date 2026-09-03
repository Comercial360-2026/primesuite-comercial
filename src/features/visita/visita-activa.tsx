import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { uuid } from '@/lib/uuid';
import { crearVisitaConResponsable } from '@/lib/rpc';
import { useEspacioEquipo } from '@/hooks/use-espacio-equipo';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaLocal } from '@/hooks/use-visita-local';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { useUbicacionesCliente } from '@/hooks/use-ubicaciones-cliente';
import { comprimirImagen } from '@/lib/comprimir-imagen';
import { OportunidadRapidaModal } from './oportunidad-rapida-modal';
import { HallazgoRapidoModal } from './hallazgo-rapido-modal';
import { PasoRapidoModal } from './paso-rapido-modal';
import { InterlocutoresModal } from './interlocutores-modal';
import { ParticipantesModal } from './participantes-modal';
import { SelectorUbicacion } from './selector-ubicacion';
import { EditorCaptura } from './editor-captura';
import { Icono, type NombreIcono } from '@/components/ui/iconos';
import { Aviso } from '@/components/ui/aviso';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { FilaAccion } from '@/components/ui/fila-accion';
import { AyudaNota } from '@/components/ui/ayuda-nota';
import { etiqueta, NATURALEZA_LABEL } from '@/lib/etiquetas-visita';
import type { OperacionPendiente, HallazgoPayload, OportunidadPayload } from '@/lib/offline-queue/types';

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
  oportunidades: OperacionPendiente[];
  nombresUbicaciones: Record<string, string>;
  nombresTerminos?: Record<string, string>;
  ubicacionActivaId?: string;
  onTocarCaptura: (id: string) => void;
  // 'recorrido': zonas siempre abiertas, "General" plegada, al final.
  // 'normal': todo plegable, "General" arriba y abierta por defecto, zona
  // más reciente también abierta. La oportunidad NO se lista aquí en modo
  // 'normal' — tiene su propia sección (ver Visita Activa).
  contexto: 'recorrido' | 'normal';
}

// Contenido de la visita en dos cajones de primer nivel:
//  - Las ZONAS del recorrido (Puerta principal, Barrera…), con todo lo de
//    cada una junto. Zona activa / más reciente primero.
//  - "General de la visita": lo capturado hablando con el cliente, sin
//    recorrido. No es un descarte — es una fase real de la visita.
function CapturasPorUbicacion({
  capturas,
  hallazgos,
  oportunidades,
  nombresUbicaciones,
  nombresTerminos,
  ubicacionActivaId,
  onTocarCaptura,
  contexto,
}: CapturasPorUbicacionProps) {
  const claveDe = (op: OperacionPendiente) =>
    (op.payload as { ubicacionId?: string }).ubicacionId ?? 'sin-ubicacion';
  const tipoDe = (c: OperacionPendiente) => (c.payload as { tipo: string }).tipo;
  const incluirOportunidades = contexto === 'recorrido';

  const claves = new Set<string>();
  [...capturas, ...hallazgos, ...(incluirOportunidades ? oportunidades : [])].forEach((op) =>
    claves.add(claveDe(op))
  );

  // Fila de un elemento capturado dentro de una zona / "General": icono a la
  // izquierda (foto/audio/nota/hallazgo), texto, y una coletilla gris
  // opcional. Sustituye a la etiqueta "audio ·" / "nota ·" gris de antes.
  const itemFila = (icono: NombreIcono, texto: string, sub?: string, onClick?: () => void, acento?: boolean) => (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 0',
        fontSize: 'var(--text-sm)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{ color: 'var(--ink-400)', flexShrink: 0, display: 'flex' }}>
        <Icono nombre={icono} size={16} />
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          ...(acento ? { color: 'var(--signal-600)', fontWeight: 500 } : {}),
        }}
      >
        {texto}
      </span>
      {sub && (
        <span style={{ color: 'var(--ink-400)', fontSize: 'var(--text-xs)', flexShrink: 0 }}>{sub}</span>
      )}
    </div>
  );

  const contenidoDe = (clave: string) => {
    const fotos = capturas.filter((c) => claveDe(c) === clave && tipoDe(c) === 'foto');
    const audios = capturas.filter((c) => claveDe(c) === clave && tipoDe(c) === 'audio');
    const notas = capturas.filter((c) => claveDe(c) === clave && tipoDe(c) === 'nota');
    const hz = hallazgos.filter((h) => claveDe(h) === clave);
    const op = incluirOportunidades ? oportunidades.filter((o) => claveDe(o) === clave) : [];
    const total = fotos.length + audios.length + notas.length + hz.length + op.length;
    const reciente = Math.max(
      0,
      ...[...fotos, ...audios, ...notas, ...hz, ...op].map((o) =>
        new Date((o as { creadoEn?: string }).creadoEn ?? 0).getTime()
      )
    );
    const resumen = [
      fotos.length && `${fotos.length} foto${fotos.length > 1 ? 's' : ''}`,
      audios.length && `${audios.length} audio${audios.length > 1 ? 's' : ''}`,
      notas.length && `${notas.length} nota${notas.length > 1 ? 's' : ''}`,
      hz.length && `${hz.length} hallazgo${hz.length > 1 ? 's' : ''}`,
      op.length && `${op.length} oportunidad${op.length > 1 ? 'es' : ''}`,
    ]
      .filter(Boolean)
      .join(' · ');
    return { fotos, audios, notas, hz, op, total, resumen, reciente };
  };

  const renderItems = (c: ReturnType<typeof contenidoDe>) => (
    <>
      {c.fotos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {[...c.fotos].reverse().map((f) => {
            const blob = f.archivoLocal as Blob | undefined;
            const titulo = (f.payload as { titulo?: string }).titulo;
            return blob ? (
              <img
                key={f.id}
                src={URL.createObjectURL(blob)}
                alt={titulo ?? 'foto'}
                onClick={() => onTocarCaptura(f.id)}
                style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, flexShrink: 0, cursor: 'pointer' }}
              />
            ) : (
              <div
                key={f.id}
                onClick={() => onTocarCaptura(f.id)}
                style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--surface-1)', flexShrink: 0, cursor: 'pointer' }}
              />
            );
          })}
        </div>
      )}
      {c.audios.map((a) =>
        <div key={a.id}>
          {itemFila('audio', (a.payload as { titulo?: string }).titulo || 'sin título', undefined, () => onTocarCaptura(a.id))}
        </div>
      )}
      {c.notas.map((n) => {
        const p = n.payload as { titulo?: string; contenidoTexto?: string };
        return (
          <div key={n.id}>
            {itemFila('nota', p.titulo || p.contenidoTexto || '(nota vacía)', undefined, () => onTocarCaptura(n.id))}
          </div>
        );
      })}
      {c.hz.map((h) => {
        const p = h.payload as { terminoId: string; naturaleza: string };
        return (
          <div key={h.id}>
            {itemFila('hallazgo', nombresTerminos?.[p.terminoId] ?? '…', etiqueta(NATURALEZA_LABEL, p.naturaleza))}
          </div>
        );
      })}
      {c.op.map((o) => (
        <div key={o.id}>
          {itemFila('oportunidad', (o.payload as { titulo: string }).titulo, undefined, undefined, true)}
        </div>
      ))}
    </>
  );

  const claveActiva = ubicacionActivaId ?? null;
  const zonasClaves = [...claves].filter((k) => k !== 'sin-ubicacion');
  // Recorrido: zona activa primero, resto por nombre. Normal: por lo más
  // reciente capturado en cada zona.
  const zonas =
    contexto === 'recorrido'
      ? [
          ...(claveActiva && claves.has(claveActiva) ? [claveActiva] : []),
          ...zonasClaves
            .filter((k) => k !== claveActiva)
            .sort((a, b) => (nombresUbicaciones[a] ?? '').localeCompare(nombresUbicaciones[b] ?? '', 'es')),
        ]
      : zonasClaves.sort((a, b) => contenidoDe(b).reciente - contenidoDe(a).reciente);
  const general = claves.has('sin-ubicacion') ? contenidoDe('sin-ubicacion') : null;

  // Estado de plegado que el comercial ha tocado a mano. El SIGNIFICADO
  // depende del contexto:
  //  - recorrido: `tocadas` son secciones CERRADas a mano (todo abierto por
  //    defecto, incluidas las zonas nuevas que se creen sobre la marcha).
  //  - normal: `tocadas` son secciones ABIERTas a mano; por defecto solo
  //    "General" y la zona más reciente están abiertas.
  const [tocadas, setTocadas] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (contexto === 'recorrido') {
      s.add('sin-ubicacion'); // "General" plegada al entrar
    } else {
      s.add('sin-ubicacion'); // "General" abierta
      if (zonas[0]) s.add(zonas[0]); // zona más reciente abierta
    }
    return s;
  });
  const estaAbierta = (k: string) => (contexto === 'recorrido' ? !tocadas.has(k) : tocadas.has(k));
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
    const activa = contexto === 'recorrido' && clave === claveActiva;
    return (
      <div
        key={clave}
        style={{
          borderLeft: `2px solid ${activa ? 'var(--brand-600)' : 'transparent'}`,
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

  const bloqueZonas = zonas.map((clave) => seccion(clave, { nombre: nombresUbicaciones[clave] ?? '…' }));
  const bloqueGeneral =
    general && general.total > 0 ? seccion('sin-ubicacion', { nombre: 'General de la visita', general: true }) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {contexto === 'normal' && bloqueGeneral}
      {bloqueZonas}
      {contexto === 'recorrido' && bloqueGeneral}
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

  const [modoRecorrido, setModoRecorrido] = useState(false);
  const [ubicacionActual, setUbicacionActual] = useState<{ id: string; nombre: string } | undefined>(undefined);
  const [selectorUbicacionAbierto, setSelectorUbicacionAbierto] = useState(false);
  // En Recorrido no se captura nada hasta elegir una zona; "sin zona" es la
  // salida explícita para una captura suelta que no pertenece a ningún
  // punto concreto.
  const [sinZona, setSinZona] = useState(false);
  // Ubicación que se aplica a TODO lo que se captura ahora mismo (foto,
  // audio, nota, hallazgo, oportunidad): solo en Recorrido y solo si hay
  // zona elegida. "sin zona" o fuera del recorrido => undefined, como hoy.
  const ubicacionParaCaptura = modoRecorrido ? ubicacionActual?.id : undefined;
  const [capturaEditandoId, setCapturaEditandoId] = useState<string | null>(null);
  const [oportunidadAbierta, setOportunidadAbierta] = useState(false);
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
  const guardadoNota = useAccionAsync();
  const [guardadoNotaConExito, setGuardadoNotaConExito] = useState(false);
  const capturaFoto = useAccionAsync();
  const capturaAudio = useAccionAsync();

  // Al 98% del pozo del equipo se cortan las subidas de binarios (fotos y
  // audios); las notas de texto siguen. Ver src/lib/espacio.ts.
  const { estado: espacioEquipo } = useEspacioEquipo();
  const espacioBloqueado = espacioEquipo?.nivel === 'bloqueo';
  const MSG_ESPACIO_LLENO =
    'Espacio del equipo lleno. No se pueden añadir fotos ni audios hasta que alguien libere (Yo → Mi espacio).';

  const inputFotoRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const { data: cliente } = useQuery({
    queryKey: ['cliente', visitaLocal?.clienteId],
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

  // Asegura que el banner "visita en curso" aparece aunque se haya llegado
  // aquí directamente (por ejemplo, retomando desde Agenda), no solo tras
  // pasar por Repaso rápido de cliente.
  useEffect(() => {
    if (visitaId && cliente) {
      iniciarVisita({ id: visitaId, clienteNombre: cliente.nombre });
    }
  }, [visitaId, cliente, iniciarVisita]);

  const { data: numInterlocutores } = useQuery({
    queryKey: ['interlocutores-count', visitaId],
    enabled: !!visitaId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('visita_interlocutor')
        .select('*', { count: 'exact', head: true })
        .eq('visita_id', visitaId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Objetivo de la visita: se fija SIEMPRE al arrancarla (formulario de
  // planificar, o ventana "¿A qué vas?" para la visita sobre la marcha) y
  // aquí el comercial puede matizarlo si la realidad no coincide con lo
  // previsto. maybeSingle: una visita recién arrancada sin conexión todavía
  // no tiene fila en el servidor — en esos primeros segundos el objetivo se
  // lee de la cola local (visitaLocal.objetivo) y el campo es de solo
  // lectura hasta que sincroniza. refetchInterval sondea hasta que la fila
  // aparece y entonces se para.
  const objetivoQueryKey = ['visita-objetivo', visitaId];
  const { data: visitaServidor } = useQuery({
    queryKey: objetivoQueryKey,
    enabled: !!visitaId,
    refetchInterval: (query) => (query.state.data == null ? 4000 : false),
    queryFn: async (): Promise<{ objetivo: string | null } | null> => {
      const { data, error } = await supabase
        .from('visita')
        .select('objetivo')
        .eq('id', visitaId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  // Objetivo efectivo: el del servidor si ya está, si no el que viajó en la
  // cola al arrancar. Solo es editable cuando existe en el servidor.
  const objetivoActual = visitaServidor?.objetivo ?? visitaLocal?.objetivo ?? null;
  const objetivoEditable = !!visitaServidor;
  const [objetivoBorrador, setObjetivoBorrador] = useState<string | null>(null);
  const guardadoObjetivo = useAccionAsync();
  useEffect(() => {
    if (objetivoActual != null && objetivoBorrador === null) {
      setObjetivoBorrador(objetivoActual);
    }
  }, [objetivoActual, objetivoBorrador]);

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

  async function capturarFoto(archivo: File) {
    if (espacioBloqueado) {
      flushSync(() => setFotoPendiente(null));
      capturaFoto.establecerError(MSG_ESPACIO_LLENO);
      return;
    }
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
    });
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
              ubicacionId: ubicacionParaCaptura,
            },
            { dependeDe: visitaId, archivoLocal: fotoPendiente }
          ),
        {
          mensajeError: 'No se pudo guardar la foto. Inténtalo de nuevo.',
          onExito: () => {
            setFotoPendiente(null);
            setTituloPendiente('');
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
              ubicacionId: ubicacionParaCaptura,
            },
            { dependeDe: visitaId, archivoLocal: audioPendiente }
          ),
        {
          mensajeError: 'No se pudo guardar el audio grabado. Inténtalo de nuevo.',
          onExito: () => {
            setAudioPendiente(null);
            setTituloPendiente('');
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
            ubicacionId: ubicacionParaCaptura,
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
    await encolar(hallazgoId, 'hallazgo', { ...payload, ubicacionId: ubicacionParaCaptura }, { dependeDe: visitaId });
    setTimeout(() => setHallazgoAbierto(false), 700);
  }

  async function guardarOportunidad(payload: OportunidadPayload) {
    const oportunidadId = uuid();
    await encolar(oportunidadId, 'oportunidad', { ...payload, ubicacionId: ubicacionParaCaptura }, { dependeDe: visitaId });
    // Retraso para que "guardado ✓" del modal sea visible antes de que
    // desaparezca — sin esto, la confirmación pasa demasiado rápido.
    setTimeout(() => setOportunidadAbierta(false), 700);
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
  const hallazgosCompaneros = deCompaneros?.hallazgos ?? [];
  const pasosCompaneros = deCompaneros?.pasos ?? [];
  const oportunidadesCompaneros = deCompaneros?.oportunidades ?? [];

  const hayCompaneros =
    notasCompaneros.length +
      audiosCompaneros.length +
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

  // Para las cabeceras "Nave 1 (3)" del agrupado de miniaturas en Modo
  // Recorrido — sin esto, cada grupo solo tendría el id en bruto.
  const { ubicaciones: ubicacionesCliente } = useUbicacionesCliente(
    visitaLocal?.clienteId,
    comercial?.id ?? ''
  );
  const nombresUbicacionesVisita = Object.fromEntries(ubicacionesCliente.map((u) => [u.id, u.nombre]));

  // Guarda al final de los hooks (ver nota más arriba). Sin `visitaId` no hay
  // pantalla que pintar; sin `comercial`, `RequireSession` ya habría
  // redirigido, pero se comprueba igual por si acaso.
  if (!visitaId || !comercial) return null;

  if (modoRecorrido) {
    const zonaElegida = !!ubicacionActual || sinZona;
    const salirRecorrido = () => {
      setModoRecorrido(false);
      setSelectorUbicacionAbierto(false);
      setSinZona(false);
      setUbicacionActual(undefined);
      setNotaAbierta(false);
    };
    return (
      <div className="screen">
        {/* Cabecera: zona actual + salir */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {ubicacionActual ? (
              <>
                <button
                  type="button"
                  className="chip chip--on"
                  onClick={() => setSelectorUbicacionAbierto((v) => !v)}
                >
                  {ubicacionActual.nombre} ▾
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUbicacionActual(undefined);
                    setSinZona(false);
                    setSelectorUbicacionAbierto(false);
                    setNotaAbierta(false);
                  }}
                  style={{ border: 'none', background: 'none', color: 'var(--ink-400)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                >
                  quitar
                </button>
              </>
            ) : sinZona ? (
              <button
                type="button"
                onClick={() => setSinZona(false)}
                style={{ border: 'none', background: 'none', color: 'var(--ink-400)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}
              >
                Sin zona · elegir una →
              </button>
            ) : (
              <div style={{ fontSize: 'var(--text-md)', fontWeight: 500 }}>Recorrido</div>
            )}
          </div>
          <button className="btn btn-secondary" style={{ width: 'auto', padding: '0 16px', flexShrink: 0 }} onClick={salirRecorrido}>
            Salir
          </button>
        </div>

        {/* Nudge + selector de zona: obligatorio mientras no hay zona */}
        {(!zonaElegida || selectorUbicacionAbierto) && visitaLocal?.clienteId && (
          <>
            {!zonaElegida && (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-700)', marginTop: 4 }}>
                ¿Qué vas a revisar? Elige o crea la puerta, barrera o zona — todo lo que captures se
                guardará ahí.
              </div>
            )}
            <SelectorUbicacion
              clienteId={visitaLocal.clienteId}
              comercialId={comercial.id}
              titulo={zonaElegida ? 'cambiar de zona' : 'zona a revisar'}
              onSeleccionar={(u) => {
                setUbicacionActual(u);
                setSinZona(false);
                setSelectorUbicacionAbierto(false);
              }}
              onCerrar={zonaElegida ? () => setSelectorUbicacionAbierto(false) : undefined}
            />
            {!zonaElegida && (
              <button
                type="button"
                onClick={() => setSinZona(true)}
                style={{ border: 'none', background: 'none', color: 'var(--ink-400)', fontSize: 'var(--text-xs)', cursor: 'pointer', alignSelf: 'flex-start' }}
              >
                capturar sin asignar a una zona
              </button>
            )}
          </>
        )}

        {/* Captura: solo con zona elegida y el selector cerrado */}
        {zonaElegida && !selectorUbicacionAbierto && (
          <>
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

            {fotoPendiente || audioPendiente ? (
              <div className="card">
                {fotoPendiente && (
                  <img
                    src={URL.createObjectURL(fotoPendiente)}
                    alt="vista previa"
                    style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
                  />
                )}
                {audioPendiente && (
                  <audio controls src={URL.createObjectURL(audioPendiente)} style={{ width: '100%', marginBottom: 8 }} />
                )}
                <input
                  className="field"
                  autoFocus
                  value={tituloPendiente}
                  onChange={(e) => setTituloPendiente(e.target.value)}
                  placeholder={fotoPendiente ? 'qué es esta foto (opcional)' : 'qué es este audio (opcional)'}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    className="btn btn-secondary"
                    disabled={capturaFoto.cargando || capturaAudio.cargando}
                    onClick={() => {
                      setFotoPendiente(null);
                      setAudioPendiente(null);
                      setTituloPendiente('');
                    }}
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
              </div>
            ) : notaAbierta ? (
              <div className="card">
                <input
                  className="field"
                  style={{ marginBottom: 8 }}
                  autoFocus
                  value={notaTitulo}
                  onChange={(e) => setNotaTitulo(e.target.value)}
                  placeholder="título breve (opcional)"
                />
                <textarea
                  className="field"
                  style={{ height: 'auto', padding: 8 }}
                  rows={2}
                  value={notaTexto}
                  onChange={(e) => setNotaTexto(e.target.value)}
                  placeholder="escribe la nota…"
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    className="btn btn-secondary"
                    disabled={guardadoNota.cargando}
                    onClick={() => {
                      guardadoNota.limpiarError();
                      setNotaAbierta(false);
                    }}
                  >
                    Cancelar
                  </button>
                  <button className="btn btn-primary" disabled={guardadoNota.cargando || guardadoNotaConExito} onClick={guardarNota}>
                    {guardadoNotaConExito ? 'Guardado ✓' : guardadoNota.cargando ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
                {guardadoNota.error && (
                  <div className="field-error-text" style={{ marginTop: 8 }}>{guardadoNota.error}</div>
                )}
              </div>
            ) : (
              <>
                <div
                  style={{ minHeight: 180, border: '1px dashed var(--ink-200)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', color: 'var(--ink-400)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}
                  onClick={() => {
                    if (espacioBloqueado) {
                      capturaFoto.establecerError(MSG_ESPACIO_LLENO);
                      return;
                    }
                    inputFotoRef.current?.click();
                  }}
                >
                  <Icono nombre="foto" size={40} />
                  Toca para disparar
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 'var(--text-sm)', width: 'auto' }}
                    disabled={(capturaAudio.cargando && !grabando) || (espacioBloqueado && !grabando)}
                    onClick={iniciarODetenerAudio}
                  >
                    <Icono nombre="audio" size={18} />
                    {grabando ? 'Detener' : capturaAudio.cargando ? 'Guardando…' : 'Audio'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 'var(--text-sm)', width: 'auto' }}
                    onClick={() => setNotaAbierta(true)}
                  >
                    <Icono nombre="nota" size={18} />
                    Nota
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 'var(--text-sm)', width: 'auto' }}
                    onClick={() => setHallazgoAbierto(true)}
                  >
                    <Icono nombre="hallazgo" size={18} />
                    Hallazgo
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 'var(--text-sm)', width: 'auto' }}
                    onClick={() => setOportunidadAbierta(true)}
                  >
                    <Icono nombre="oportunidad" size={18} />
                    Oportunidad
                  </button>
                </div>
                {(capturaFoto.error || capturaAudio.error) && (
                  <div className="field-error-text">{capturaFoto.error || capturaAudio.error}</div>
                )}
                {grabando && (
                  <Aviso tipo="atencion" titulo="Grabando">
                    No bloquees la pantalla ni cambies de app o la grabación se cortará.
                  </Aviso>
                )}
              </>
            )}
          </>
        )}

        {(() => {
          const n = capturas.length + hallazgos.length + oportunidades.length;
          return (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
              {n} {n === 1 ? 'elemento' : 'elementos'} en esta visita
            </div>
          );
        })()}

        <CapturasPorUbicacion
          contexto="recorrido"
          capturas={capturas}
          hallazgos={hallazgos}
          oportunidades={oportunidades}
          nombresUbicaciones={nombresUbicacionesVisita}
          nombresTerminos={nombresTerminos}
          ubicacionActivaId={ubicacionActual?.id}
          onTocarCaptura={setCapturaEditandoId}
        />

        {capturaEditandoId && <EditorCaptura capturaId={capturaEditandoId} onCerrar={() => setCapturaEditandoId(null)} />}

        {/* Estos modales van también aquí: este `return` es anticipado y los
            del final del componente no se montan en Modo Recorrido. */}
        {hallazgoAbierto && (
          <HallazgoRapidoModal
            visitaId={visitaId}
            comercialId={comercial.id}
            onGuardar={guardarHallazgo}
            onCerrar={() => setHallazgoAbierto(false)}
          />
        )}
        {oportunidadAbierta && (
          <OportunidadRapidaModal
            visitaId={visitaId}
            clienteId={visitaLocal?.clienteId}
            comercialId={comercial.id}
            onGuardar={guardarOportunidad}
            onCerrar={() => setOportunidadAbierta(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo={cliente?.nombre ?? '…'}
        subtitulo="Visita en curso"
        ayuda="visita-activa"
        onVolver={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'))}
      />

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className={`chip${numInterlocutores ? ' chip--on' : ''}`}
          onClick={() => setInterlocutoresAbierto(true)}
        >
          Interlocutores{numInterlocutores ? ` · ${numInterlocutores}` : ''}
        </button>
        <button type="button" className="chip" onClick={() => setParticipantesAbierto(true)}>
          Participantes
        </button>
      </div>
      <AyudaNota concepto="interlocutor-participante" />

      {objetivoActual != null && (
        <div>
          <div className="label" style={{ marginTop: 0 }}>Objetivo de la visita</div>
          <textarea
            className="field"
            style={{ height: 'auto', padding: 8, opacity: objetivoEditable ? 1 : 0.7 }}
            rows={2}
            readOnly={!objetivoEditable}
            value={objetivoBorrador ?? ''}
            onChange={(e) => setObjetivoBorrador(e.target.value)}
            placeholder="a qué has venido: cerrar pedido, presentar gama, primera toma de contacto…"
          />
          {!objetivoEditable && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
              La visita se está guardando. Podrás editar el objetivo en un momento.
            </div>
          )}
          {objetivoEditable && (objetivoBorrador ?? '') !== (objetivoActual ?? '') && (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 'var(--text-sm)' }}
                disabled={guardadoObjetivo.cargando}
                onClick={() => {
                  guardadoObjetivo.limpiarError();
                  setObjetivoBorrador(objetivoActual ?? '');
                }}
              >
                Deshacer
              </button>
              <button
                className="btn btn-primary"
                style={{ fontSize: 'var(--text-sm)' }}
                disabled={guardadoObjetivo.cargando || !(objetivoBorrador ?? '').trim()}
                onClick={guardarObjetivo}
              >
                {guardadoObjetivo.cargando ? 'Guardando…' : 'Guardar objetivo'}
              </button>
            </div>
          )}
          {guardadoObjetivo.error && (
            <div className="field-error-text" style={{ marginTop: 6 }}>{guardadoObjetivo.error}</div>
          )}
        </div>
      )}

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

      {/* Todas las formas de añadir algo a la visita, juntas. Antes iban
          repartidas: Foto/Audio/Nota/Oportunidad arriba y Hallazgo/Próximo
          paso abajo, sin criterio visible. */}
      <div className="label" style={{ marginTop: 0 }}>Añadir a la visita</div>
      <div className="capture-grid">
        <button
          className="capture-btn"
          disabled={capturaFoto.cargando || espacioBloqueado}
          onClick={() => inputFotoRef.current?.click()}
        >
          <Icono nombre="foto" size={22} />
          {capturaFoto.cargando ? 'Guardando…' : 'Foto'}
        </button>
        <button
          className="capture-btn"
          disabled={(capturaAudio.cargando && !grabando) || (espacioBloqueado && !grabando)}
          onClick={iniciarODetenerAudio}
        >
          <Icono nombre="audio" size={22} />
          {grabando ? 'Detener' : capturaAudio.cargando ? 'Guardando…' : 'Audio'}
        </button>
        <button className="capture-btn" onClick={() => setNotaAbierta(true)}>
          <Icono nombre="nota" size={22} />
          Nota
        </button>
        <button className="capture-btn" onClick={() => setHallazgoAbierto(true)}>
          <Icono nombre="hallazgo" size={22} />
          Hallazgo
        </button>
        <button className="capture-btn" onClick={() => setOportunidadAbierta(true)}>
          <Icono nombre="oportunidad" size={22} />
          Oportunidad
        </button>
        <button className="capture-btn" onClick={() => setPasoAbierto(true)}>
          <Icono nombre="paso" size={22} />
          Próximo paso
        </button>
      </div>

      {capturaFoto.error && <div className="field-error-text">{capturaFoto.error}</div>}
      {capturaAudio.error && <div className="field-error-text">{capturaAudio.error}</div>}
      {grabando && (
        <Aviso tipo="atencion" titulo="Grabando">
          No bloquees la pantalla ni cambies de app o la grabación se cortará.
        </Aviso>
      )}

      {notaAbierta && (
        <div className="card">
          <input
            className="field"
            style={{ marginBottom: 8 }}
            autoFocus
            value={notaTitulo}
            onChange={(e) => setNotaTitulo(e.target.value)}
            placeholder="título breve (opcional)"
          />
          <textarea
            className="field"
            style={{ height: 'auto', padding: 8 }}
            rows={2}
            value={notaTexto}
            onChange={(e) => setNotaTexto(e.target.value)}
            placeholder="escribe la nota…"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              className="btn btn-secondary"
              disabled={guardadoNota.cargando}
              onClick={() => {
                guardadoNota.limpiarError();
                setNotaAbierta(false);
              }}
            >
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={guardadoNota.cargando || guardadoNotaConExito} onClick={guardarNota}>
              {guardadoNotaConExito ? 'Guardado ✓' : guardadoNota.cargando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          {guardadoNota.error && (
            <div className="field-error-text" style={{ marginTop: 8 }}>{guardadoNota.error}</div>
          )}
        </div>
      )}

      {(fotoPendiente || audioPendiente) && (
        <div className="card">
          {fotoPendiente && (
            <img
              src={URL.createObjectURL(fotoPendiente)}
              alt="vista previa"
              style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
            />
          )}
          {audioPendiente && <audio controls src={URL.createObjectURL(audioPendiente)} style={{ width: '100%', marginBottom: 8 }} />}
          <input
            className="field"
            autoFocus
            value={tituloPendiente}
            onChange={(e) => setTituloPendiente(e.target.value)}
            placeholder={fotoPendiente ? 'qué es esta foto (opcional)' : 'qué es este audio (opcional)'}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              className="btn btn-secondary"
              disabled={capturaFoto.cargando || capturaAudio.cargando}
              onClick={() => {
                setFotoPendiente(null);
                setAudioPendiente(null);
                setTituloPendiente('');
              }}
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
        </div>
      )}

      <div className="screen__scroll">
        {/* General de la visita + zonas del recorrido, agrupado y plegable.
            La oportunidad NO se lista aquí — tiene su sección propia debajo. */}
        <CapturasPorUbicacion
          contexto="normal"
          capturas={capturas}
          hallazgos={hallazgos}
          oportunidades={oportunidades}
          nombresUbicaciones={nombresUbicacionesVisita}
          nombresTerminos={nombresTerminos}
          onTocarCaptura={(id) => navigate(`/capturas/${id}`)}
        />

        {/* Oportunidades: sección propia (es el negocio de la visita), con
            etiqueta de la zona donde se detectó, si la hay. */}
        {oportunidades.length > 0 && (
          <SeccionLista titulo={`Oportunidades (${oportunidades.length})`}>
            {oportunidades.map((o) => {
              const p = o.payload as { titulo: string; prioridad?: string; ubicacionId?: string };
              const zona = p.ubicacionId ? nombresUbicacionesVisita[p.ubicacionId] : null;
              const sub = [p.prioridad, zona ? `en: ${zona}` : null].filter(Boolean).join(' · ');
              return (
                <FilaNavegable
                  key={o.id}
                  icono="oportunidad"
                  titulo={p.titulo}
                  subtitulo={sub || undefined}
                  onClick={() => navigate(`/oportunidades/${o.id}`)}
                />
              );
            })}
          </SeccionLista>
        )}

        {/* Próximos pasos: lo que va a pasar después de la visita. */}
        {pasos.length > 0 && (
          <SeccionLista titulo={`Próximos pasos (${pasos.length})`}>
            {pasos.map((p) => {
              const payload = p.payload as { descripcion: string; fechaObjetivo?: string };
              // OJO: p.estado es el estado de SINCRONIZACIÓN de la cola
              // offline (pendiente/subiendo/completado/error) — no tiene
              // nada que ver con el estado de NEGOCIO del próximo paso
              // (pendiente/completado, si el comercial ya lo hizo). Ambos
              // usan la palabra "completado" con significados distintos,
              // así que aquí se traduce explícitamente para no confundir
              // "ya se guardó en el servidor" con "ya está hecho".
              const etiquetaSync: Record<string, string> = {
                pendiente: 'guardando localmente…',
                subiendo: 'sincronizando…',
                completado: 'guardado en el servidor',
                error: 'error al sincronizar',
              };
              const fecha = payload.fechaObjetivo ? fechaCorta(payload.fechaObjetivo) : 'sin fecha objetivo';
              return (
                <FilaAccion
                  key={p.id}
                  icono="paso"
                  titulo={payload.descripcion}
                  subtitulo={`${fecha} · ${etiquetaSync[p.estado] ?? p.estado}`}
                />
              );
            })}
          </SeccionLista>
        )}

        {/* De compañeros: todo lo que ha capturado otro comercial en esta
            misma visita, en una sola sección. */}
        {hayCompaneros && (
          <SeccionLista titulo="De compañeros">
            {notasCompaneros.map((c) => (
              <FilaNavegable
                key={c.id}
                icono="nota"
                titulo={c.titulo || c.contenido_texto || '(nota vacía)'}
                subtitulo={`Nota · de ${nombresComerciales?.[c.comercial_autor_id] ?? '…'}`}
                onClick={() => navigate(`/capturas/${c.id}`)}
              />
            ))}
            {audiosCompaneros.map((c) => (
              <FilaNavegable
                key={c.id}
                icono="audio"
                titulo={c.titulo || 'sin título'}
                subtitulo={`Audio · de ${nombresComerciales?.[c.comercial_autor_id] ?? '…'}`}
                onClick={() => navigate(`/capturas/${c.id}`)}
              />
            ))}
            {hallazgosCompaneros.map((h) => (
              <FilaNavegable
                key={h.id}
                icono="hallazgo"
                titulo={(h.termino as unknown as { nombre: string } | null)?.nombre ?? '…'}
                subtitulo={`${etiqueta(NATURALEZA_LABEL, h.naturaleza)} · de ${nombresComerciales?.[h.comercial_autor_id] ?? '…'}`}
                onClick={() => navigate(`/hallazgos/${h.id}`)}
              />
            ))}
            {oportunidadesCompaneros.map((o) => (
              <FilaNavegable
                key={o.id}
                icono="oportunidad"
                titulo={o.titulo}
                subtitulo={`Oportunidad · de ${nombresComerciales?.[o.comercial_autor_id] ?? '…'}`}
                onClick={() => navigate(`/oportunidades/${o.id}`)}
              />
            ))}
            {pasosCompaneros.map((p) => (
              <FilaAccion
                key={p.id}
                icono="paso"
                titulo={p.descripcion}
                subtitulo={`${p.fecha_objetivo ? fechaCorta(p.fecha_objetivo) : 'sin fecha objetivo'} · de ${nombresComerciales?.[p.comercial_responsable_id] ?? '…'}`}
              />
            ))}
          </SeccionLista>
        )}

        {!capturas.length &&
          !hallazgos.length &&
          !oportunidades.length &&
          !pasos.length &&
          !hayCompaneros && (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
            Nada capturado todavía en esta visita.
          </div>
        )}
      </div>

      {/* Lo que NO es "añadir": el recorrido es un modo, y cerrar es el
          final. Van aparte de la rejilla de arriba. */}
      <button
        className="btn btn-secondary"
        style={{ color: 'var(--brand-600)', borderColor: 'var(--brand-600)' }}
        onClick={() => setModoRecorrido(true)}
      >
        <Icono nombre="recorrido" size={18} />
        Iniciar recorrido
      </button>
      <AyudaNota concepto="modo-recorrido" />
      <button className="btn btn-primary" onClick={() => navigate(`/visita/${visitaId}/cierre`)}>
        Cerrar visita
      </button>

      {oportunidadAbierta && (
        <OportunidadRapidaModal
          visitaId={visitaId}
          clienteId={visitaLocal?.clienteId}
          comercialId={comercial.id}
          onGuardar={guardarOportunidad}
          onCerrar={() => setOportunidadAbierta(false)}
        />
      )}

      {hallazgoAbierto && (
        <HallazgoRapidoModal
          visitaId={visitaId}
          comercialId={comercial.id}
          onGuardar={guardarHallazgo}
          onCerrar={() => setHallazgoAbierto(false)}
        />
      )}

      {pasoAbierto && visitaLocal?.clienteId && (
        <PasoRapidoModal
          visitaId={visitaId}
          comercialId={comercial.id}
          onGuardar={async (payload) => {
            const pasoId = uuid();
            await encolar(pasoId, 'proximo_paso', payload, { dependeDe: visitaId });
            setTimeout(() => setPasoAbierto(false), 700);
          }}
          onPlanificarVisita={async ({ fecha, hora, franja, objetivo }) => {
            // Llamada directa, NO por la cola offline: igual que planificar
            // desde la ficha, para que aparezca en la agenda al momento.
            const nuevaId = uuid();
            const { error } = await crearVisitaConResponsable({
              pVisitaId: nuevaId,
              pClienteId: visitaLocal.clienteId,
              pComercialId: comercial.id,
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
              const { error: errParche } = await supabase
                .from('visita')
                .update(parche)
                .eq('id', nuevaId);
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
          }}
          onCerrar={() => setPasoAbierto(false)}
        />
      )}

      {interlocutoresAbierto && visitaLocal?.clienteId && (
        <InterlocutoresModal
          visitaId={visitaId}
          clienteId={visitaLocal.clienteId}
          onCerrar={() => setInterlocutoresAbierto(false)}
        />
      )}
      {participantesAbierto && visitaId && (
        <ParticipantesModal visitaId={visitaId} onCerrar={() => setParticipantesAbierto(false)} />
      )}
    </div>
  );
}
