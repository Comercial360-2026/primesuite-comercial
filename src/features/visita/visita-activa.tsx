import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
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
import { SelectorUbicacion } from './selector-ubicacion';
import { EditorCaptura } from './editor-captura';
import type { OperacionPendiente } from '@/lib/offline-queue/types';

interface FotosPorUbicacionProps {
  capturas: OperacionPendiente[];
  nombresUbicaciones: Record<string, string>;
  ubicacionActivaId?: string;
  onTocarFoto: (capturaId: string) => void;
}

// Mismo agrupado en las dos pantallas donde se ven fotos de la visita (Modo
// Recorrido y la vista normal de Visita Activa) — antes solo existía dentro
// de Modo Recorrido, así que al volver a la vista normal las fotos volvían
// a aparecer todas juntas sin agrupar, incluidas las tomadas fuera de
// cualquier ubicación con el botón "foto" normal, sin ninguna marca que
// avisara de que no tenían ubicación asignada. Encontrado en pruebas reales
// con datos reales (ARCELOR), no en local.
function FotosPorUbicacion({ capturas, nombresUbicaciones, ubicacionActivaId, onTocarFoto }: FotosPorUbicacionProps) {
  const fotosVisita = capturas.filter((c) => (c.payload as { tipo: string }).tipo === 'foto');
  if (fotosVisita.length === 0) return null;

  const grupos = new Map<string, typeof fotosVisita>();
  for (const f of fotosVisita) {
    const clave = (f.payload as { ubicacionId?: string }).ubicacionId ?? 'sin-ubicacion';
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(f);
  }

  const claveActiva = ubicacionActivaId ?? 'sin-ubicacion';
  const clavesOrdenadas = [
    ...(grupos.has(claveActiva) ? [claveActiva] : []),
    ...Array.from(grupos.keys()).filter((k) => k !== claveActiva && k !== 'sin-ubicacion'),
    ...(grupos.has('sin-ubicacion') && claveActiva !== 'sin-ubicacion' ? ['sin-ubicacion'] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="label" style={{ marginTop: 0 }}>
        fotos ({fotosVisita.length})
      </div>
      {clavesOrdenadas.map((clave) => {
        const items = grupos.get(clave)!;
        const nombre = clave === 'sin-ubicacion' ? 'sin ubicación' : nombresUbicaciones[clave] ?? '…';
        return (
          <div key={clave}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 4 }}>
              {nombre} ({items.length})
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {[...items].reverse().map((f) => {
                const blob = f.archivoLocal as Blob | undefined;
                const payload = f.payload as { titulo?: string };
                return blob ? (
                  <img
                    key={f.id}
                    src={URL.createObjectURL(blob)}
                    alt={payload.titulo ?? 'foto'}
                    onClick={() => onTocarFoto(f.id)}
                    style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, flexShrink: 0, cursor: 'pointer' }}
                  />
                ) : (
                  <div
                    key={f.id}
                    onClick={() => onTocarFoto(f.id)}
                    style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--surface-1)', flexShrink: 0, cursor: 'pointer' }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function VisitaActiva() {
  const { visitaId } = useParams<{ visitaId: string }>();
  const navigate = useNavigate();
  const { comercial } = useSesionActual();
  const visitaLocal = useVisitaLocal(visitaId);
  const { iniciarVisita } = useVisitaActivaContext();
  const { operaciones, encolar } = useSyncQueue(visitaId);

  const [modoRecorrido, setModoRecorrido] = useState(false);
  const [ubicacionActual, setUbicacionActual] = useState<{ id: string; nombre: string } | undefined>(undefined);
  const [selectorUbicacionAbierto, setSelectorUbicacionAbierto] = useState(false);
  const [capturaEditandoId, setCapturaEditandoId] = useState<string | null>(null);
  const [oportunidadAbierta, setOportunidadAbierta] = useState(false);
  const [hallazgoAbierto, setHallazgoAbierto] = useState(false);
  const [pasoAbierto, setPasoAbierto] = useState(false);
  const [interlocutoresAbierto, setInterlocutoresAbierto] = useState(false);
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

  const inputFotoRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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

  if (!visitaId || !comercial) return null;

  async function capturarFoto(archivo: File) {
    const archivoComprimido = await comprimirImagen(archivo);
    setFotoPendiente(archivoComprimido);
    setTituloPendiente('');
  }

  async function confirmarCapturaPendiente() {
    if (fotoPendiente) {
      await capturaFoto.ejecutar(
        () =>
          encolar(
            crypto.randomUUID(),
            'captura_libre',
            {
              visitaId: visitaId!,
              comercialAutorId: comercial!.id,
              tipo: 'foto',
              titulo: tituloPendiente.trim() || undefined,
              ubicacionId: modoRecorrido ? ubicacionActual?.id : undefined,
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
            crypto.randomUUID(),
            'captura_libre',
            {
              visitaId: visitaId!,
              comercialAutorId: comercial!.id,
              tipo: 'audio',
              titulo: tituloPendiente.trim() || undefined,
              ubicacionId: modoRecorrido ? ubicacionActual?.id : undefined,
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

  async function iniciarODetenerAudio() {
    if (!grabando) {
      await capturaAudio.ejecutar(
        async () => {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const recorder = new MediaRecorder(stream);
          audioChunksRef.current = [];
          recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
          recorder.onstop = () => {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            setAudioPendiente(blob);
            setTituloPendiente('');
            stream.getTracks().forEach((t) => t.stop());
          };
          recorder.start();
          mediaRecorderRef.current = recorder;
          setGrabando(true);
        },
        { mensajeError: 'No se pudo acceder al micrófono. Comprueba los permisos.' }
      );
    } else {
      mediaRecorderRef.current?.stop();
      setGrabando(false);
    }
  }

  async function guardarNota() {
    if (!notaTexto.trim()) return;
    const capturaId = crypto.randomUUID();
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
            ubicacionId: modoRecorrido ? ubicacionActual?.id : undefined,
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

  const capturas = operaciones.filter((op) => op.entidad === 'captura_libre');
  const oportunidades = operaciones.filter((op) => op.entidad === 'oportunidad');
  const hallazgos = operaciones.filter((op) => op.entidad === 'hallazgo');
  const pasos = operaciones.filter((op) => op.entidad === 'proximo_paso');

  // Para las cabeceras "Nave 1 (3)" del agrupado de miniaturas en Modo
  // Recorrido — sin esto, cada grupo solo tendría el id en bruto.
  const { ubicaciones: ubicacionesCliente } = useUbicacionesCliente(visitaLocal?.clienteId, comercial.id);
  const nombresUbicacionesVisita = Object.fromEntries(ubicacionesCliente.map((u) => [u.id, u.nombre]));

  if (modoRecorrido) {
    return (
      <div className="screen">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className={`chip${ubicacionActual ? ' chip--on' : ''}`}
              onClick={() => setSelectorUbicacionAbierto((v) => !v)}
            >
              {ubicacionActual?.nombre ?? 'Sin ubicación'} ▾
            </button>
            {ubicacionActual && (
              <button
                type="button"
                onClick={() => setUbicacionActual(undefined)}
                style={{ border: 'none', background: 'none', color: 'var(--ink-400)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
              >
                quitar
              </button>
            )}
          </div>
          <button className="btn btn-secondary" style={{ width: 'auto', padding: '0 16px' }} onClick={() => setModoRecorrido(false)}>
            Salir
          </button>
        </div>

        {selectorUbicacionAbierto && visitaLocal?.clienteId && (
          <SelectorUbicacion
            clienteId={visitaLocal.clienteId}
            comercialId={comercial.id}
            titulo="ubicación de las fotos"
            onSeleccionar={(u) => {
              setUbicacionActual(u);
              setSelectorUbicacionAbierto(false);
            }}
            onCerrar={() => setSelectorUbicacionAbierto(false)}
          />
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

        {fotoPendiente ? (
          // Mismo bloque de confirmación que en captura normal (vista previa +
          // comentario opcional + guardar/descartar) — antes SOLO existía fuera
          // de este return anticipado de Modo Recorrido, así que una foto
          // tomada aquí quedaba "atascada" en memoria sin ninguna pantalla que
          // la mostrara: no se guardaba, no aparecía en el contador, y la
          // única forma de recuperarla era salir del modo por completo. Fallo
          // real, encontrado inyectando una foto de prueba y viendo que no
          // pasaba nada — no una carencia de diseño menor.
          <div className="card">
            <img
              src={URL.createObjectURL(fotoPendiente)}
              alt="vista previa"
              style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
            />
            <input
              className="field"
              autoFocus
              value={tituloPendiente}
              onChange={(e) => setTituloPendiente(e.target.value)}
              placeholder="qué es esta foto (opcional)"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="btn btn-secondary"
                disabled={capturaFoto.cargando}
                onClick={() => {
                  setFotoPendiente(null);
                  setTituloPendiente('');
                }}
              >
                Descartar
              </button>
              <button className="btn btn-primary" disabled={capturaFoto.cargando} onClick={confirmarCapturaPendiente}>
                {capturaFoto.cargando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            {capturaFoto.error && <div className="field-error-text" style={{ marginTop: 8 }}>{capturaFoto.error}</div>}
          </div>
        ) : (
          <div
            style={{ flex: 1, minHeight: 220, border: '1px dashed var(--ink-200)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}
            onClick={() => inputFotoRef.current?.click()}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            Toca para disparar
          </div>
        )}

        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
          {capturas.filter((c) => c.entidad === 'captura_libre').length} capturas en esta visita
        </div>

        <FotosPorUbicacion
          capturas={capturas}
          nombresUbicaciones={nombresUbicacionesVisita}
          ubicacionActivaId={ubicacionActual?.id}
          onTocarFoto={setCapturaEditandoId}
        />

        {capturaEditandoId && <EditorCaptura capturaId={capturaEditandoId} onCerrar={() => setCapturaEditandoId(null)} />}
      </div>
    );
  }

  return (
    <div className="screen screen--split">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/')} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', padding: 0 }}>
            ←
          </button>
          <div>
            <div className="label" style={{ marginTop: 0 }}>visita en curso</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 500 }}>{cliente?.nombre ?? '…'}</div>
          </div>
        </div>
        <button
          type="button"
          className={`chip${numInterlocutores ? ' chip--on' : ''}`}
          onClick={() => setInterlocutoresAbierto(true)}
        >
          interlocutores{numInterlocutores ? ` (${numInterlocutores})` : ''}
        </button>
      </div>

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

      <div className="capture-grid">
        <button className="capture-btn" disabled={capturaFoto.cargando} onClick={() => inputFotoRef.current?.click()}>
          {capturaFoto.cargando ? 'Guardando…' : 'Foto'}
        </button>
        <button className="capture-btn" disabled={capturaAudio.cargando && !grabando} onClick={iniciarODetenerAudio}>
          {grabando ? 'Detener' : capturaAudio.cargando ? 'Guardando…' : 'Audio'}
        </button>
        <button className="capture-btn" onClick={() => setNotaAbierta(true)}>
          Nota
        </button>
        <button className="capture-btn capture-btn--oportunidad" onClick={() => setOportunidadAbierta(true)}>
          Oportunidad
        </button>
      </div>

      {capturaFoto.error && <div className="field-error-text">{capturaFoto.error}</div>}
      {capturaAudio.error && <div className="field-error-text">{capturaAudio.error}</div>}

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
              cancelar
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
        {capturas.filter((c) => (c.payload as { tipo: string }).tipo === 'nota').length > 0 && (
          <>
            <div className="label" style={{ marginTop: 0 }}>
              notas ({capturas.filter((c) => (c.payload as { tipo: string }).tipo === 'nota').length})
            </div>
            {capturas
              .filter((c) => (c.payload as { tipo: string }).tipo === 'nota')
              .map((c) => {
                const payload = c.payload as { titulo?: string; contenidoTexto?: string };
                return (
                  <div
                    key={c.id}
                    className="card"
                    style={{ display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}
                    onClick={() => navigate(`/capturas/${c.id}`)}
                  >
                    <span style={{ fontSize: 'var(--text-sm)' }}>
                      {payload.titulo || payload.contenidoTexto || '(nota vacía)'}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>{c.estado}</span>
                  </div>
                );
              })}
          </>
        )}

        <FotosPorUbicacion
          capturas={capturas}
          nombresUbicaciones={nombresUbicacionesVisita}
          onTocarFoto={(capturaId) => navigate(`/capturas/${capturaId}`)}
        />

        {capturas.filter((c) => (c.payload as { tipo: string }).tipo === 'audio').length > 0 && (
          <>
            <div className="label">
              audios ({capturas.filter((c) => (c.payload as { tipo: string }).tipo === 'audio').length})
            </div>
            {capturas
              .filter((c) => (c.payload as { tipo: string }).tipo === 'audio')
              .map((c) => {
                const payload = c.payload as { titulo?: string };
                const hora = new Date(c.creadoEn).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                return (
                  <div
                    key={c.id}
                    className="card"
                    style={{ display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}
                    onClick={() => navigate(`/capturas/${c.id}`)}
                  >
                    <span style={{ fontSize: 'var(--text-sm)' }}>{payload.titulo ? `${payload.titulo} · ${hora}` : `audio · ${hora}`}</span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>{c.estado}</span>
                  </div>
                );
              })}
          </>
        )}

        {hallazgos.length > 0 && (
          <>
            <div className="label">hallazgos ({hallazgos.length})</div>
            {hallazgos.map((h) => {
              const payload = h.payload as { terminoId: string; naturaleza: string };
              return (
                <div key={h.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/hallazgos/${h.id}`)}>
                  <span style={{ fontSize: 'var(--text-sm)' }}>{nombresTerminos?.[payload.terminoId] ?? '…'}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginLeft: 6 }}>
                    {payload.naturaleza.replace('_', ' ')}
                  </span>
                </div>
              );
            })}
          </>
        )}

        {oportunidades.length > 0 && (
          <>
            <div className="label">oportunidades ({oportunidades.length})</div>
            {oportunidades.map((o) => (
              <div
                key={o.id}
                className="card card--oportunidad"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/oportunidades/${o.id}`)}
              >
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--signal-600)', fontWeight: 500 }}>
                  {(o.payload as { titulo: string }).titulo}
                </span>
              </div>
            ))}
          </>
        )}

        {pasos.length > 0 && (
          <>
            <div className="label">próximos pasos ({pasos.length})</div>
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
              return (
                <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 'var(--text-sm)' }}>{payload.descripcion}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                    {payload.fechaObjetivo
                      ? new Date(payload.fechaObjetivo).toLocaleDateString('es-ES')
                      : 'sin fecha objetivo'}
                    {' · '}
                    {etiquetaSync[p.estado] ?? p.estado}
                  </span>
                </div>
              );
            })}
          </>
        )}

        {!capturas.length && !hallazgos.length && !oportunidades.length && !pasos.length && (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
            Nada capturado todavía en esta visita.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 'var(--text-sm)', color: 'var(--brand-600)', borderColor: 'var(--brand-600)' }}
          onClick={() => setModoRecorrido(true)}
        >
          Iniciar recorrido
        </button>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 'var(--text-sm)' }}
          onClick={() => setHallazgoAbierto(true)}
        >
          Hallazgo
        </button>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 'var(--text-sm)' }}
          onClick={() => setPasoAbierto(true)}
        >
          Próximo paso
        </button>
      </div>
      <button className="btn btn-primary" onClick={() => navigate(`/visita/${visitaId}/cierre`)}>
        Cerrar visita
      </button>

      {oportunidadAbierta && (
        <OportunidadRapidaModal
          visitaId={visitaId}
          clienteId={visitaLocal?.clienteId}
          comercialId={comercial.id}
          onGuardar={async (payload) => {
            const oportunidadId = crypto.randomUUID();
            await encolar(oportunidadId, 'oportunidad', payload, { dependeDe: visitaId });
            // Retraso para que "guardado ✓" del modal sea visible antes de
            // que desaparezca — sin esto, la confirmación pasa demasiado
            // rápido para notarla.
            setTimeout(() => setOportunidadAbierta(false), 700);
          }}
          onCerrar={() => setOportunidadAbierta(false)}
        />
      )}

      {hallazgoAbierto && (
        <HallazgoRapidoModal
          visitaId={visitaId}
          comercialId={comercial.id}
          onGuardar={async (payload) => {
            const hallazgoId = crypto.randomUUID();
            await encolar(hallazgoId, 'hallazgo', payload, { dependeDe: visitaId });
            setTimeout(() => setHallazgoAbierto(false), 700);
          }}
          onCerrar={() => setHallazgoAbierto(false)}
        />
      )}

      {pasoAbierto && (
        <PasoRapidoModal
          visitaId={visitaId}
          comercialId={comercial.id}
          onGuardar={async (payload) => {
            const pasoId = crypto.randomUUID();
            await encolar(pasoId, 'proximo_paso', payload, { dependeDe: visitaId });
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
    </div>
  );
}
