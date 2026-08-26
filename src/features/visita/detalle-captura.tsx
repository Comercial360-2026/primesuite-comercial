import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { obtenerOperacion, actualizarOperacion, eliminarOperacion } from '@/lib/offline-queue';
import type { OperacionPendiente, CapturaLibrePayload } from '@/lib/offline-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';

export function DetalleCaptura() {
  const { capturaId } = useParams<{ capturaId: string }>();
  const navigate = useNavigate();

  const [operacion, setOperacion] = useState<OperacionPendiente<'captura_libre'> | null>(null);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [tituloEdit, setTituloEdit] = useState('');
  const [textoEdit, setTextoEdit] = useState('');
  const [urlMedia, setUrlMedia] = useState<string | null>(null);
  const guardado = useAccionAsync();
  const borrado = useAccionAsync();
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

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
          const { error } = await supabase
            .from('captura_libre')
            .update({ contenido_texto: payloadNuevo.contenidoTexto, titulo: payloadNuevo.titulo ?? null })
            .eq('id', operacion.id);
          if (error) throw new Error(error.message);
        }

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
              console.error('No se pudo borrar el archivo de Storage, se continúa con el borrado de la fila:', errStorage.message);
            }
          }

          const { error: errDelete, count } = await supabase
            .from('captura_libre')
            .delete({ count: 'exact' })
            .eq('id', operacion.id);
          if (errDelete) throw new Error(errDelete.message);
          if (!count) {
            throw new Error(
              'No se ha podido borrar (0 filas afectadas). Puede que no tengas permiso — solo el autor o Dirección Comercial pueden borrar una captura.'
            );
          }
        }

        await eliminarOperacion(operacion.id);
      },
      {
        onExito: () => navigate(-1),
        mensajeError: 'No se pudo borrar la captura. Inténtalo de nuevo.',
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

      {!confirmandoBorrado ? (
        <button
          className="btn btn-secondary"
          style={{ marginTop: 'auto', color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
          onClick={() => setConfirmandoBorrado(true)}
        >
          borrar {payload.tipo}
        </button>
      ) : (
        <div className="card card--riesgo" style={{ marginTop: 'auto' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
            ¿Seguro? {payload.tipo !== 'nota' ? 'El archivo se borrará también del almacenamiento. ' : ''}
            No se puede deshacer.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={() => setConfirmandoBorrado(false)} disabled={borrado.cargando}>
              cancelar
            </button>
            <button
              className="btn btn-primary"
              style={{ background: 'var(--risk-600)' }}
              onClick={confirmarBorrado}
              disabled={borrado.cargando}
            >
              {borrado.cargando ? 'borrando…' : 'confirmar borrado'}
            </button>
          </div>
          {borrado.error && <div className="field-error-text" style={{ marginTop: 8 }}>{borrado.error}</div>}
        </div>
      )}
    </div>
  );
}
