import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';

const NATURALEZAS = [
  'contexto',
  'oportunidad',
  'riesgo',
  'competencia',
  'fortaleza',
  'proyecto_activo',
] as const;

const TIPOS_FECHA = ['vencimiento_contrato', 'renovacion', 'auditoria', 'presupuesto', 'implantacion', 'otro'];

// Pantalla de edición (no de creación): el Hallazgo se crea con captura
// mínima (término + naturaleza) desde el botón "Hallazgo" en Visita Activa
// (ver hallazgo-rapido-modal.tsx). Esta pantalla sirve para
// estructurar/completar después (nota, ubicación, fecha relevante),
// tal como se cerró en el flujo funcional.
export function DetalleHallazgo() {
  const { hallazgoId } = useParams<{ hallazgoId: string }>();
  const navigate = useNavigate();

  const [naturaleza, setNaturaleza] = useState<string>('contexto');
  const [nota, setNota] = useState('');
  const [ubicacionId, setUbicacionId] = useState<string>('');
  const [fechaRelevante, setFechaRelevante] = useState('');
  const [tipoFechaRelevante, setTipoFechaRelevante] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  const { data: hallazgo, isLoading } = useQuery({
    queryKey: ['hallazgo', hallazgoId],
    enabled: !!hallazgoId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('hallazgo')
        .select('id, cliente_id, naturaleza, nota, ubicacion_id, fecha_relevante, tipo_fecha_relevante, termino:termino_id(id, nombre, categoria_id)')
        .eq('id', hallazgoId!)
        .single();
      if (err) throw err;
      return data;
    },
  });

  useEffect(() => {
    if (!hallazgo) return;
    setNaturaleza(hallazgo.naturaleza);
    setNota(hallazgo.nota ?? '');
    setUbicacionId(hallazgo.ubicacion_id ?? '');
    setFechaRelevante(hallazgo.fecha_relevante ?? '');
    setTipoFechaRelevante(hallazgo.tipo_fecha_relevante ?? '');
  }, [hallazgo]);

  const { data: ubicaciones } = useQuery({
    queryKey: ['ubicaciones-cliente', hallazgo?.cliente_id],
    enabled: !!hallazgo?.cliente_id,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('ubicacion')
        .select('id, nombre')
        .eq('cliente_id', hallazgo!.cliente_id);
      if (err) throw err;
      return data ?? [];
    },
  });

  async function guardar() {
    if (!hallazgoId) return;
    // fecha_relevante y tipo_fecha_relevante van juntos o ninguno — refleja
    // el CHECK chk_hallazgo_fecha_relevante_tipo de 01_schema.sql; validar
    // aquí antes de enviar evita un rechazo silencioso del servidor.
    if (fechaRelevante && !tipoFechaRelevante) {
      setError('Si indicas una fecha relevante, indica también su tipo.');
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase
      .from('hallazgo')
      .update({
        naturaleza,
        nota: nota.trim() || null,
        ubicacion_id: ubicacionId || null,
        fecha_relevante: fechaRelevante || null,
        tipo_fecha_relevante: fechaRelevante ? tipoFechaRelevante : null,
      })
      .eq('id', hallazgoId!);
    setGuardando(false);
    if (err) {
      setError(err.message);
      return;
    }
    setGuardadoConExito(true);
    // Breve pausa para que "guardado ✓" sea visible de verdad antes de
    // volver — antes saltaba a la pantalla anterior sin ninguna
    // confirmación, ni siquiera un flash.
    setTimeout(() => navigate(-1), 700);
  }

  // Borrado individual — encargo técnico punto 2/3: comprobación explícita
  // de `count` devuelto por Supabase. Sin una política RLS que autorice el
  // DELETE, Supabase no devuelve error — ejecuta la sentencia "con éxito"
  // afectando a 0 filas (verificado en producción, ver
  // adenda_punto1_delete_silencioso.md). Tratar count 0 como fallo real es
  // la única forma de no mostrar "eliminado" cuando en realidad no lo está.
  async function confirmarBorrado() {
    if (!hallazgoId) return;
    setBorrando(true);
    setErrorBorrado(null);
    const { error: err, count } = await supabase
      .from('hallazgo')
      .delete({ count: 'exact' })
      .eq('id', hallazgoId);
    setBorrando(false);
    if (err) {
      setErrorBorrado(err.message);
      return;
    }
    if (!count) {
      setErrorBorrado('No se ha podido borrar (0 filas afectadas). Puede que no tengas permiso — solo el autor o Dirección Comercial pueden borrar un hallazgo.');
      return;
    }
    navigate(-1);
  }

  if (isLoading || !hallazgo) {
    return (
      <div className="screen">
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando…</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <CabeceraDetalle
        titulo="Hallazgo"
        subtitulo={(hallazgo.termino as unknown as { nombre: string })?.nombre ?? undefined}
        onVolver={() => (confirmandoBorrado ? setConfirmandoBorrado(false) : navigate(-1))}
      />

      <div className="label">naturaleza</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {NATURALEZAS.map((n) => (
          <button
            key={n}
            type="button"
            className={`chip${naturaleza === n ? ' chip--on' : ''}`}
            onClick={() => setNaturaleza(n)}
          >
            {n.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="label">nota</div>
      <textarea
        className="field"
        style={{ height: 'auto', padding: 8 }}
        rows={2}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="envejecido, cliente insatisfecho…"
      />

      <div className="label">ubicación</div>
      <select className="field" value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
        <option value="">sin ubicación</option>
        {ubicaciones?.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre}
          </option>
        ))}
      </select>

      <div className="label">fecha relevante (opcional)</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="field"
          type="date"
          value={fechaRelevante}
          onChange={(e) => setFechaRelevante(e.target.value)}
        />
        <select
          className="field"
          value={tipoFechaRelevante}
          onChange={(e) => setTipoFechaRelevante(e.target.value)}
        >
          <option value="">tipo…</option>
          {TIPOS_FECHA.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="field-error-text">{error}</div>}

      <button className="btn btn-primary" style={{ marginTop: 'auto' }} disabled={guardando || guardadoConExito} onClick={guardar}>
        {guardadoConExito ? 'Guardado ✓' : guardando ? 'Guardando…' : 'Guardar'}
      </button>

      {!confirmandoBorrado ? (
        <button
          className="btn btn-secondary"
          style={{ color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
          onClick={() => setConfirmandoBorrado(true)}
        >
          Borrar hallazgo
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
