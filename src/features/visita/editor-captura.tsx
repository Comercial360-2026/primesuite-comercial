import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { obtenerOperacion, actualizarOperacion, eliminarOperacion } from '@/lib/offline-queue';
import type { OperacionPendiente, CapturaLibrePayload } from '@/lib/offline-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';

interface EditorCapturaProps {
  capturaId: string;
  onCerrar: () => void;
}

// Mismo comportamiento que la pantalla de detalle de captura
// (src/features/visita/detalle-captura.tsx: editar comentario, borrar con
// limpieza de Storage), pero como tarjeta en línea en vez de una pantalla
// aparte — así se puede editar/borrar una foto sin salir de Modo Recorrido,
// que perdería su estado (ubicación elegida, etc.) al desmontarse la
// pantalla completa. Se abre al tocar una miniatura.
export function EditorCaptura({ capturaId, onCerrar }: EditorCapturaProps) {
  const [operacion, setOperacion] = useState<OperacionPendiente<'captura_libre'> | null>(null);
  const [tituloEdit, setTituloEdit] = useState('');
  const [urlMedia, setUrlMedia] = useState<string | null>(null);
  const guardado = useAccionAsync();
  const borrado = useAccionAsync();
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  useEffect(() => {
    obtenerOperacion(capturaId).then((op) => {
      if (op && op.entidad === 'captura_libre') {
        const captura = op as OperacionPendiente<'captura_libre'>;
        setOperacion(captura);
        setTituloEdit((captura.payload as CapturaLibrePayload).titulo ?? '');
      }
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
        const payloadNuevo: CapturaLibrePayload = { ...(operacion.payload as CapturaLibrePayload), titulo: tituloEdit.trim() || undefined };
        if (operacion.estado === 'completado') {
          const { error } = await supabase.from('captura_libre').update({ titulo: payloadNuevo.titulo ?? null }).eq('id', operacion.id);
          if (error) throw new Error(error.message);
        }
        await actualizarOperacion(operacion.id, { payload: payloadNuevo });
        return payloadNuevo;
      },
      {
        onExito: () => {
          setGuardadoConExito(true);
          setTimeout(onCerrar, 700);
        },
        mensajeError: 'No se pudo actualizar el comentario. Si la foto ya estaba sincronizada, puede que falte permiso.',
      }
    );
  }

  async function confirmarBorrado() {
    if (!operacion) return;
    await borrado.ejecutar(
      async () => {
        if (operacion.estado === 'completado') {
          const { data: fila, error: errLectura } = await supabase
            .from('captura_libre')
            .select('storage_path, tipo')
            .eq('id', operacion.id)
            .single();
          if (errLectura) throw new Error(errLectura.message);

          if (fila?.storage_path) {
            const bucket = fila.tipo === 'foto' ? 'fotos-visita' : 'audios-visita';
            const { error: errStorage } = await supabase.storage.from(bucket).remove([fila.storage_path]);
            if (errStorage) {
              // eslint-disable-next-line no-console
              console.error('No se pudo borrar el archivo de Storage, se continúa con el borrado de la fila:', errStorage.message);
            }
          }

          const { error: errDelete, count } = await supabase.from('captura_libre').delete({ count: 'exact' }).eq('id', operacion.id);
          if (errDelete) throw new Error(errDelete.message);
          if (!count) {
            throw new Error('No se ha podido borrar (0 filas afectadas). Puede que no tengas permiso.');
          }
        }
        await eliminarOperacion(operacion.id);
      },
      { onExito: onCerrar, mensajeError: 'No se pudo borrar la foto. Inténtalo de nuevo.' }
    );
  }

  if (!operacion) {
    return (
      <div className="card">
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Cargando…</div>
      </div>
    );
  }

  return (
    <div className="card">
      {urlMedia && (
        <img src={urlMedia} alt="foto" style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
      )}

      {!confirmandoBorrado ? (
        <>
          <input
            className="field"
            value={tituloEdit}
            onChange={(e) => setTituloEdit(e.target.value)}
            placeholder="qué es esta foto (opcional)"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={onCerrar} disabled={guardado.cargando}>
              Cerrar
            </button>
            <button
              className="btn btn-secondary"
              style={{ color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
              onClick={() => setConfirmandoBorrado(true)}
              disabled={guardado.cargando}
            >
              borrar
            </button>
            <button className="btn btn-primary" onClick={guardarEdicion} disabled={guardado.cargando}>
              {guardadoConExito ? 'Guardado ✓' : guardado.cargando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          {guardado.error && <div className="field-error-text" style={{ marginTop: 8 }}>{guardado.error}</div>}
        </>
      ) : (
        <>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)' }}>¿Seguro? Esta acción no se puede deshacer.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={() => setConfirmandoBorrado(false)} disabled={borrado.cargando}>
              cancelar
            </button>
            <button className="btn btn-primary" style={{ background: 'var(--risk-600)' }} onClick={confirmarBorrado} disabled={borrado.cargando}>
              {borrado.cargando ? 'Borrando…' : 'Confirmar borrado'}
            </button>
          </div>
          {borrado.error && <div className="field-error-text" style={{ marginTop: 8 }}>{borrado.error}</div>}
        </>
      )}
    </div>
  );
}
