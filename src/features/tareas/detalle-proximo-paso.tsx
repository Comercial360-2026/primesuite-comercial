import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

// Pantalla de edición de un próximo paso ya creado (desde Visita Activa,
// vía paso-rapido-modal.tsx). Mismo patrón que detalle-hallazgo.tsx:
// carga, edición con confirmación explícita de éxito, y borrado en dos
// pasos con comprobación de `count` (ver adenda_punto1_delete_silencioso.md
// — sin comprobar count, un DELETE sin política que lo autorice se ve
// como "éxito" aunque afecte a 0 filas).
export function DetalleProximoPaso() {
  const { pasoId } = useParams<{ pasoId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [descripcion, setDescripcion] = useState('');
  const [fechaObjetivo, setFechaObjetivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  const { data: paso, isLoading, isError } = useQuery({
    queryKey: ['proximo-paso', pasoId],
    enabled: !!pasoId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('proximo_paso')
        .select('id, descripcion, fecha_objetivo, estado, visita:visita_id(cliente:cliente_id(nombre))')
        .eq('id', pasoId!)
        .single();
      if (err) throw err;
      return data;
    },
  });

  useEffect(() => {
    if (!paso) return;
    setDescripcion(paso.descripcion);
    setFechaObjetivo(paso.fecha_objetivo ?? '');
  }, [paso]);

  async function guardar() {
    if (!pasoId || !descripcion.trim()) return;
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase
      .from('proximo_paso')
      .update({
        descripcion: descripcion.trim(),
        fecha_objetivo: fechaObjetivo || null,
      })
      .eq('id', pasoId);
    setGuardando(false);
    if (err) {
      setError(err.message);
      return;
    }
    setGuardadoConExito(true);
    queryClient.invalidateQueries({ queryKey: ['mis-proximos-pasos'] });
    queryClient.invalidateQueries({ queryKey: ['proximo-paso', pasoId] });
    // Misma pausa de 700ms que el resto de pantallas de detalle, para que
    // "guardado ✓" sea visible antes de volver.
    setTimeout(() => navigate(-1), 700);
  }

  async function confirmarBorrado() {
    if (!pasoId) return;
    setBorrando(true);
    setErrorBorrado(null);
    const { error: err, count } = await supabase
      .from('proximo_paso')
      .delete({ count: 'exact' })
      .eq('id', pasoId);
    setBorrando(false);
    if (err) {
      setErrorBorrado(err.message);
      return;
    }
    if (!count) {
      setErrorBorrado(
        'No se ha podido borrar (0 filas afectadas). Puede que no tengas permiso — solo el responsable o Dirección Comercial pueden borrar un próximo paso.'
      );
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['mis-proximos-pasos'] });
    navigate(-1);
  }

  if (isLoading || (!paso && !isError)) {
    return (
      <div className="screen">
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando…</p>
      </div>
    );
  }

  if (isError || !paso) {
    return (
      <div className="screen">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>
            ←
          </button>
          <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>próximo paso</h1>
        </div>
        <div className="field-error-text">No se pudo cargar este próximo paso.</div>
      </div>
    );
  }

  const clienteNombre = (paso.visita as unknown as { cliente: { nombre: string } | null })?.cliente?.nombre;

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => (confirmandoBorrado ? setConfirmandoBorrado(false) : navigate(-1))}
          style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}
        >
          ←
        </button>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>próximo paso</h1>
      </div>

      {clienteNombre && (
        <div className="card">
          <div className="label" style={{ marginTop: 0 }}>{clienteNombre}</div>
        </div>
      )}

      <div className="label" style={{ marginTop: 0 }}>descripción</div>
      <textarea
        className="field"
        style={{ height: 'auto', padding: 8 }}
        rows={2}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="volver a llamar en dos semanas, enviar propuesta…"
      />

      <div className="label">fecha objetivo (opcional)</div>
      <input
        className="field"
        type="date"
        value={fechaObjetivo}
        onChange={(e) => setFechaObjetivo(e.target.value)}
      />

      {error && <div className="field-error-text">{error}</div>}

      <button
        className="btn btn-primary"
        style={{ marginTop: 'auto' }}
        disabled={!descripcion.trim() || guardando || guardadoConExito}
        onClick={guardar}
      >
        {guardadoConExito ? 'Guardado ✓' : guardando ? 'Guardando…' : 'Guardar'}
      </button>

      {!confirmandoBorrado ? (
        <button
          className="btn btn-secondary"
          style={{ color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
          onClick={() => setConfirmandoBorrado(true)}
        >
          Borrar próximo paso
        </button>
      ) : (
        <div className="card card--riesgo">
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
            ¿Seguro? Esta acción no se puede deshacer.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={() => setConfirmandoBorrado(false)} disabled={borrando}>
              cancelar
            </button>
            <button
              className="btn btn-primary"
              style={{ background: 'var(--risk-600)' }}
              onClick={confirmarBorrado}
              disabled={borrando}
            >
              {borrando ? 'Borrando…' : 'Confirmar borrado'}
            </button>
          </div>
          {errorBorrado && <div className="field-error-text" style={{ marginTop: 8 }}>{errorBorrado}</div>}
        </div>
      )}
    </div>
  );
}
