import type { useBorrarVisita } from '@/hooks/use-borrar-visita';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { plural } from '@/lib/texto';

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
      Esta visita arrastra: {plural(previsualizacion.num_fotos, 'foto', 'fotos')},{' '}
      {plural(previsualizacion.num_audios, 'audio', 'audios')},{' '}
      {plural(previsualizacion.num_notas, 'nota', 'notas')},{' '}
      {plural(previsualizacion.num_hallazgos, 'hallazgo', 'hallazgos')},{' '}
      {plural(previsualizacion.num_oportunidades, 'oportunidad', 'oportunidades')} y{' '}
      {plural(previsualizacion.num_proximos_pasos, 'próximo paso', 'próximos pasos')}. Todo eso se borrará
      también.
    </ConfirmacionBorrado>
  );
}
