import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaLocal } from '@/hooks/use-visita-local';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { OportunidadRapidaModal } from './oportunidad-rapida-modal';
import { HallazgoRapidoModal } from './hallazgo-rapido-modal';
import { InterlocutoresModal } from './interlocutores-modal';

export function VisitaActiva() {
  const { visitaId } = useParams<{ visitaId: string }>();
  const navigate = useNavigate();
  const { comercial } = useSesionActual();
  const visitaLocal = useVisitaLocal(visitaId);
  const { iniciarVisita } = useVisitaActivaContext();
  const { operaciones, encolar } = useSyncQueue(visitaId);

  const [modoRecorrido, setModoRecorrido] = useState(false);
  const [ubicacionActual, setUbicacionActual] = useState<string | undefined>(undefined);
  const [oportunidadAbierta, setOportunidadAbierta] = useState(false);
  const [hallazgoAbierto, setHallazgoAbierto] = useState(false);
  const [interlocutoresAbierto, setInterlocutoresAbierto] = useState(false);
  const [notaAbierta, setNotaAbierta] = useState(false);
  const [notaTitulo, setNotaTitulo] = useState('');
  const [notaTexto, setNotaTexto] = useState('');
  const [grabando, setGrabando] = useState(false);
  const guardadoNota = useAccionAsync();
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

  const { data: ubicaciones } = useQuery({
    queryKey: ['ubicaciones', visitaLocal?.clienteId],
    enabled: !!visitaLocal?.clienteId && modoRecorrido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ubicacion')
        .select('id, nombre')
        .eq('cliente_id', visitaLocal!.clienteId);
      if (error) throw error;
      return data ?? [];
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
    await capturaFoto.ejecutar(
      () =>
        encolar(
          crypto.randomUUID(),
          'captura_libre',
          {
            visitaId: visitaId!,
            comercialAutorId: comercial!.id,
            tipo: 'foto',
            ubicacionId: modoRecorrido ? ubicacionActual : undefined,
          },
          { dependeDe: visitaId, archivoLocal: archivo }
        ),
      { mensajeError: 'No se pudo guardar la foto. Inténtalo de nuevo.' }
    );
  }

  async function iniciarODetenerAudio() {
    if (!grabando) {
      await capturaAudio.ejecutar(
        async () => {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const recorder = new MediaRecorder(stream);
          audioChunksRef.current = [];
          recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
          recorder.onstop = async () => {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            try {
              await encolar(
                crypto.randomUUID(),
                'captura_libre',
                {
                  visitaId: visitaId!,
                  comercialAutorId: comercial!.id,
                  tipo: 'audio',
                  ubicacionId: modoRecorrido ? ubicacionActual : undefined,
                },
                { dependeDe: visitaId, archivoLocal: blob }
              );
            } catch {
              // El guardado ocurre en este callback, posterior a que
              // ejecutar() ya resolviera al iniciar la grabación — se expone
              // el error directamente en vez de perderlo en silencio.
              capturaAudio.establecerError('No se pudo guardar el audio grabado. Inténtalo de nuevo.');
            }
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
            ubicacionId: modoRecorrido ? ubicacionActual : undefined,
          },
          { dependeDe: visitaId }
        ),
      {
        onExito: () => {
          setNotaTitulo('');
          setNotaTexto('');
          setNotaAbierta(false);
        },
        mensajeError: 'No se pudo guardar la nota. Inténtalo de nuevo.',
      }
    );
  }

  const capturas = operaciones.filter((op) => op.entidad === 'captura_libre');
  const oportunidades = operaciones.filter((op) => op.entidad === 'oportunidad');
  const hallazgos = operaciones.filter((op) => op.entidad === 'hallazgo');

  if (modoRecorrido) {
    return (
      <div className="screen">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <select
            className="chip"
            value={ubicacionActual ?? ''}
            onChange={(e) => setUbicacionActual(e.target.value || undefined)}
          >
            <option value="">sin ubicación ▾</option>
            {ubicaciones?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary" style={{ width: 'auto', padding: '0 16px' }} onClick={() => setModoRecorrido(false)}>
            salir
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

        <div
          style={{ flex: 1, minHeight: 220, border: '1px dashed var(--ink-200)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}
          onClick={() => inputFotoRef.current?.click()}
        >
          toca para disparar
        </div>

        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
          {capturas.filter((c) => c.entidad === 'captura_libre').length} capturas en esta visita
        </div>
      </div>
    );
  }

  return (
    <div className="screen screen--split">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="label" style={{ marginTop: 0 }}>visita en curso</div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 500 }}>{cliente?.nombre ?? '…'}</div>
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
          {capturaFoto.cargando ? 'guardando…' : 'foto'}
        </button>
        <button className="capture-btn" disabled={capturaAudio.cargando && !grabando} onClick={iniciarODetenerAudio}>
          {grabando ? 'detener' : capturaAudio.cargando ? 'guardando…' : 'audio'}
        </button>
        <button className="capture-btn" onClick={() => setNotaAbierta(true)}>
          nota
        </button>
        <button className="capture-btn capture-btn--oportunidad" onClick={() => setOportunidadAbierta(true)}>
          oportunidad
        </button>
      </div>

      {capturaFoto.error && <div className="field-error-text">{capturaFoto.error}</div>}
      {capturaAudio.error && <div className="field-error-text">{capturaAudio.error}</div>}

      {notaAbierta && (
        <div className="card">
          <input
            className="field"
            style={{ marginBottom: 8 }}
            value={notaTitulo}
            onChange={(e) => setNotaTitulo(e.target.value)}
            placeholder="título breve (opcional)"
          />
          <textarea
            className="field"
            style={{ height: 'auto', padding: 8 }}
            rows={2}
            autoFocus
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
            <button className="btn btn-primary" disabled={guardadoNota.cargando} onClick={guardarNota}>
              {guardadoNota.cargando ? 'guardando…' : 'guardar'}
            </button>
          </div>
          {guardadoNota.error && (
            <div className="field-error-text" style={{ marginTop: 8 }}>{guardadoNota.error}</div>
          )}
        </div>
      )}

      <div className="screen__scroll">
        <div className="label" style={{ marginTop: 0 }}>capturado en esta visita</div>
        {capturas.map((c) => {
          const payload = c.payload as { tipo: string; titulo?: string; contenidoTexto?: string };
          const hora = new Date(c.creadoEn).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          const etiqueta =
            payload.tipo === 'nota'
              ? payload.titulo || payload.contenidoTexto || '(nota vacía)'
              : payload.tipo === 'foto'
                ? `foto · ${hora}`
                : `audio · ${hora}`;
          return (
            <div
              key={c.id}
              className="card"
              style={{ display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}
              onClick={() => navigate(`/capturas/${c.id}`)}
            >
              <span style={{ fontSize: 'var(--text-sm)' }}>{etiqueta}</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>{c.estado}</span>
            </div>
          );
        })}
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
        {hallazgos.map((h) => {
          const payload = h.payload as { terminoId: string; naturaleza: string };
          return (
            <div key={h.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/hallazgos/${h.id}`)}>
              <span style={{ fontSize: 'var(--text-sm)' }}>
                {nombresTerminos?.[payload.terminoId] ?? '…'}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginLeft: 6 }}>
                {payload.naturaleza.replace('_', ' ')}
              </span>
            </div>
          );
        })}
      </div>

      <button className="btn btn-secondary" onClick={() => setHallazgoAbierto(true)}>
        + hallazgo
      </button>
      <button className="btn btn-secondary" onClick={() => setModoRecorrido(true)}>
        modo recorrido →
      </button>
      <button className="btn btn-primary" onClick={() => navigate(`/visita/${visitaId}/cierre`)}>
        cerrar visita
      </button>

      {oportunidadAbierta && (
        <OportunidadRapidaModal
          visitaId={visitaId}
          clienteId={visitaLocal?.clienteId}
          comercialId={comercial.id}
          onGuardar={async (payload) => {
            const oportunidadId = crypto.randomUUID();
            await encolar(oportunidadId, 'oportunidad', payload, { dependeDe: visitaId });
            setOportunidadAbierta(false);
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
            setHallazgoAbierto(false);
          }}
          onCerrar={() => setHallazgoAbierto(false)}
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
