import type { useBorrarVisita } from '@/hooks/use-borrar-visita';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';

// Tarjeta de confirmación del borrado de una visita — el "paso 2" de
// useBorrarVisita: enseña qué arrastra la visita y pide confirmar. Se
// renderiza donde toque (fila de una lista, pie de una pantalla de
// detalle) pasándole el `ctrl` que devuelve el hook. El aspecto lo pone
// <ConfirmacionBorrado>, común a toda la app.
export function ConfirmarBorradoVisita({
  ctrl,
}: {
  ctrl: ReturnType<typeof useBorrarVisita>;
}) {
  const { previsualizacion, previsualizando, borrando, cancelar, confirmar } = ctrl;

  if (previsualizando.cargando || !previsualizacion) {
    return (
      <div className="card card--riesgo">
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Calculando qué se va a borrar…</div>
        {previsualizando.error && (
          <div className="field-error-text" style={{ marginTop: 8 }}>
            {previsualizando.error}
          </div>
        )}
      </div>
    );
  }

  return (
    <ConfirmacionBorrado
      onCancelar={cancelar}
      onConfirmar={confirmar}
      cargando={borrando.cargando}
      error={borrando.error}
      confirmar="Sí, borrar la visita entera"
    >
      Esta visita arrastra: {previsualizacion.num_fotos} foto(s), {previsualizacion.num_audios} audio(s),{' '}
      {previsualizacion.num_notas} nota(s), {previsualizacion.num_hallazgos} hallazgo(s),{' '}
      {previsualizacion.num_oportunidades} oportunidad(es) y {previsualizacion.num_proximos_pasos} próximo(s) paso(s).
      Todo eso se borrará también.
    </ConfirmacionBorrado>
  );
}
