import type { useBorrarVisita } from '@/hooks/use-borrar-visita';

// Tarjeta de confirmación del borrado de una visita — el "paso 2" de
// useBorrarVisita: enseña qué arrastra la visita y pide confirmar. Se
// renderiza donde toque (fila de una lista, pie de una pantalla de
// detalle) pasándole el `ctrl` que devuelve el hook.
export function ConfirmarBorradoVisita({
  ctrl,
}: {
  ctrl: ReturnType<typeof useBorrarVisita>;
}) {
  const { previsualizacion, previsualizando, borrando, cancelar, confirmar } = ctrl;

  return (
    <div className="card card--riesgo">
      {previsualizando.cargando || !previsualizacion ? (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
          Calculando qué se va a borrar…
        </div>
      ) : (
        <>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
            Esta visita arrastra: {previsualizacion.num_fotos} foto(s), {previsualizacion.num_audios} audio(s),{' '}
            {previsualizacion.num_notas} nota(s), {previsualizacion.num_hallazgos} hallazgo(s),{' '}
            {previsualizacion.num_oportunidades} oportunidad(es) y {previsualizacion.num_proximos_pasos} próximo(s)
            paso(s). Todo eso se borrará también. No se puede deshacer.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={cancelar} disabled={borrando.cargando}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              style={{ background: 'var(--risk-600)' }}
              onClick={confirmar}
              disabled={borrando.cargando}
            >
              {borrando.cargando ? 'Borrando…' : 'Confirmar borrado de la visita completa'}
            </button>
          </div>
        </>
      )}
      {(previsualizando.error || borrando.error) && (
        <div className="field-error-text" style={{ marginTop: 8 }}>
          {previsualizando.error || borrando.error}
        </div>
      )}
    </div>
  );
}
