import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { obtenerOperacion, actualizarOperacion } from '@/lib/offline-queue';
import type { OperacionPendiente, CapturaLibrePayload } from '@/lib/offline-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';

// Pantalla de solo-una-captura: nota (con edición), foto o audio.
// El binario (Blob) de foto/audio se lee siempre desde IndexedDB local —
// el motor de sincronización nunca lo borra tras subir (ver sync-engine.ts),
// así que funciona igual esté la captura ya sincronizada o no.
export function DetalleCaptura() {
  const { capturaId } = useParams<{ capturaId: string }>();
  const navigate = useNavigate();

  const [operacion, setOperacion] = useState<OperacionPendiente<'captura_libre'> | null>(null);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [tituloEdit, setTituloEdit] = useState('');
  const [textoEdit, setTextoEdit] = useState('');
  const [urlMedia, setUrlMedia] = useState<string | null>(null);
  const guardado = useAccionAsync();

  useEffect(() => {
    if (!capturaId) return;
    obtenerOperacion(capturaId).then((op) => {
      if (op && op.entidad === 'captura_libre') {
        setOperacion(op as OperacionPendiente<'captura_libre'>);
        const payload = op.payload as CapturaLibrePayload;
        setTituloEdit(payload.titulo ?? '');
        setTextoEdit(payload.contenidoTexto ?? '');
      }
      setCargandoInicial(false);
    });
  }, [capturaId]);

  useEffect(() => {
    if (operacion?.archivoLocal) {
      const url = URL.createObjectURL(operacion.archivoLocal);
      setUrlMedia(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [operacion]);

  async function guardarEdicion() {
    if (!operacion) return;

    await guardado.ejecutar(
      async () => {
        const payloadNuevo: CapturaLibrePayload = {
          ...(operacion.payload as CapturaLibrePayload),
          titulo: tituloEdit.trim() || undefined,
          contenidoTexto: textoEdit.trim(),
        };

        if (operacion.estado === 'completado') {
          // Ya sincronizada con Supabase: la edición requiere UPDATE directo
          // contra la tabla, no pasa por la cola de creación (que es solo
          // append-only). Si la política RLS no permite UPDATE al comercial
          // sobre sus propias capturas, este error se mostrará tal cual,
          // sin fallo silencioso.
          const { error } = await supabase
            .from('captura_libre')
            .update({ contenido_texto: payloadNuevo.contenidoTexto })
            .eq('id', operacion.id);
          if (error) throw new Error(error.message);
        }

        // Se actualiza también la copia local, tanto si estaba pendiente
        // (única fuente de verdad hasta que sincronice) como si ya estaba
        // completada (para que la UI no dependa de una nueva lectura remota).
        await actualizarOperacion(operacion.id, { payload: payloadNuevo });

        return payloadNuevo;
      },
      {
        onExito: (payloadNuevo) => {
          setOperacion((prev) => (prev ? { ...prev, payload: payloadNuevo } : prev));
        },
        mensajeError:
          'No se pudo actualizar. Si la nota ya estaba sincronizada, puede que falte permiso de edición en el servidor.',
      }
    );
  }

  if (cargandoInicial) return null;

  if (!operacion) {
    return (
      <div className="screen">
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', alignSelf: 'flex-start' }}>
          ←
        </button>
        <p style={{ color: 'var(--ink-400)' }}>No se ha encontrado esta captura.</p>
      </div>
    );
  }

  const payload = operacion.payload as CapturaLibrePayload;

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>
          ←
        </button>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>
          {payload.tipo === 'nota' ? 'nota' : payload.tipo === 'foto' ? 'foto' : 'audio'}
        </h1>
      </div>

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
        {new Date(operacion.creadoEn).toLocaleString('es-ES')} · {operacion.estado}
      </div>

      {payload.tipo === 'foto' && urlMedia && (
        <img src={urlMedia} alt="captura" style={{ width: '100%', borderRadius: 12 }} />
      )}

      {payload.tipo === 'audio' && urlMedia && (
        <audio controls src={urlMedia} style={{ width: '100%' }} />
      )}

      {payload.tipo === 'nota' && (
        <>
          <input
            className="field"
            value={tituloEdit}
            onChange={(e) => setTituloEdit(e.target.value)}
            placeholder="título breve (opcional)"
          />
          <textarea
            className="field"
            style={{ height: 'auto', padding: 8 }}
            rows={6}
            autoFocus
            value={textoEdit}
            onChange={(e) => setTextoEdit(e.target.value)}
          />
          <button
            className="btn btn-primary"
            disabled={guardado.cargando || !textoEdit.trim()}
            onClick={guardarEdicion}
          >
            {guardado.cargando ? 'guardando…' : 'guardar cambios'}
          </button>
          {guardado.error && <div className="field-error-text">{guardado.error}</div>}
        </>
      )}
    </div>
  );
}
