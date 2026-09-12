import type { useBorrarVisita } from '@/hooks/use-borrar-visita';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { Aviso } from '@/components/ui/aviso';
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

  // INCIDENTE 2026-09-12: "Borrar esta visita" dejaba pasar el borrado con
  // oportunidades abiertas colgando (SAPA, 2 oportunidades) — el texto de
  // abajo las mencionaba, pero era solo informativo, no un bloqueo real.
  // El servidor (eliminar_visita_completa) ya lo rechaza siempre, pero aquí
  // se corta ANTES de intentarlo: nada de botón "Sí, borrar" si hay alguna
  // abierta — hay que cerrarla primero, no hay atajo.
  if (previsualizacion.num_oportunidades_abiertas > 0) {
    return (
      <div className="card card--riesgo">
        <Aviso tipo="error">
          No se puede borrar: tiene{' '}
          {plural(previsualizacion.num_oportunidades_abiertas, 'oportunidad abierta', 'oportunidades abiertas')} sin
          cerrar. Ciérrala{previsualizacion.num_oportunidades_abiertas > 1 ? 's' : ''} antes de borrar la visita.
        </Aviso>
        <button className="btn btn-secondary" style={{ marginTop: 10, width: '100%' }} onClick={cancelar}>
          Entendido
        </button>
      </div>
    );
  }

  const vacia =
    previsualizacion.num_fotos === 0 &&
    previsualizacion.num_audios === 0 &&
    previsualizacion.num_notas === 0 &&
    previsualizacion.num_hallazgos === 0 &&
    previsualizacion.num_oportunidades === 0 &&
    previsualizacion.num_proximos_pasos === 0;

  return (
    <ConfirmacionBorrado
      onCancelar={cancelar}
      onConfirmar={confirmar}
      cargando={borrando.cargando}
      error={borrando.error}
      confirmar={vacia ? 'Sí, descartar la visita' : 'Sí, borrar la visita entera'}
    >
      {vacia ? (
        <>Esta visita no tiene nada anotado. Se elimina y desaparece de la lista.</>
      ) : (
        <>
          Esta visita arrastra: {plural(previsualizacion.num_fotos, 'foto', 'fotos')},{' '}
          {plural(previsualizacion.num_audios, 'audio', 'audios')},{' '}
          {plural(previsualizacion.num_notas, 'nota', 'notas')},{' '}
          {plural(previsualizacion.num_hallazgos, 'hallazgo', 'hallazgos')},{' '}
          {plural(previsualizacion.num_oportunidades, 'oportunidad', 'oportunidades')} y{' '}
          {plural(previsualizacion.num_proximos_pasos, 'próximo paso', 'próximos pasos')}. Todo eso se
          borrará también.
        </>
      )}
    </ConfirmacionBorrado>
  );
}
