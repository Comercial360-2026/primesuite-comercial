import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { Segmentado } from '@/components/ui/segmentado';
import { reflejarRecategorizacionEnCola, RUTA_ITEM, type TipoItem } from '@/lib/recategorizar';

// Prompt maestro 11, Fase 3 — "Esto es: Nota · Hallazgo · Oportunidad".
// El comercial captura casi todo como nota; marcar que además es un
// hallazgo o una oportunidad (o desmarcarlo) es un gesto de después, que
// funciona igual con la visita en curso o cerrada. No se pierde nada al
// cambiar: lo garantiza la RPC `recategorizar_item`.

const LABEL: Record<TipoItem, string> = {
  nota: 'Nota',
  hallazgo: 'Hallazgo',
  oportunidad: 'Oportunidad',
};

interface Props {
  id: string;
  tipoActual: TipoItem;
  visitaId: string | undefined;
  /** Estado a estampar al navegar a la ficha del nuevo tipo (Regla #14):
   *  su ← debe volver a donde volvería el de esta ficha. */
  origen: { from?: string };
  /** El item aún vive solo en la cola local, sin subir: todavía no se
   *  puede recategorizar (la operación es contra el servidor). */
  sinSubir?: boolean;
  /** Motivo por el que NO se puede cambiar de tipo (no eres autor ni
   *  Dirección, u oportunidad ya en marcha). Deja el control a la vista
   *  pero inerte, con este texto debajo. */
  motivoBloqueo?: string;
}

export function RecategorizarItem({ id, tipoActual, visitaId, origen, sinSubir, motivoBloqueo }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmando, setConfirmando] = useState<TipoItem | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bloqueado = !!sinSubir || !!motivoBloqueo;

  function pedirCambio(t: TipoItem) {
    if (t === tipoActual || bloqueado || trabajando) return;
    setError(null);
    setConfirmando(t);
  }

  async function confirmar() {
    if (!confirmando) return;
    const destino = confirmando;
    setTrabajando(true);
    setError(null);
    const { error: err } = await supabase.rpc('recategorizar_item', {
      p_id: id,
      p_desde: tipoActual,
      p_hacia: destino,
    });
    if (err) {
      setTrabajando(false);
      setError(err.message || 'No se pudo cambiar de tipo.');
      return;
    }
    await reflejarRecategorizacionEnCola(id, destino);
    for (const key of [
      ['detalle-visita-cerrada', visitaId],
      ['hallazgo', id],
      ['hallazgo-areas', id],
      ['oportunidad', id],
      ['captura-contexto-visita', visitaId],
      ['capturas-companeros', visitaId],
      ['hallazgos-proyecto'],
      ['hallazgos-archivados-proyecto'],
      ['actividad-proyecto'],
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    // A la ficha del nuevo tipo (mismo id). `replace` para que el ← del
    // navegador no vuelva a la ficha del tipo viejo, que ya no existe.
    navigate(RUTA_ITEM[destino](id), { state: origen, replace: true });
  }

  const ayuda = sinSubir
    ? 'Podrás cambiarlo de tipo cuando termine de guardarse (unos segundos con conexión).'
    : motivoBloqueo
      ? motivoBloqueo
      : 'Nota: queda en la visita. Hallazgo: algo que tienen, suma al ecosistema del cliente. Oportunidad: algo para venderles, entra en el seguimiento.';

  return (
    <div>
      <div className="label" style={{ marginTop: 0 }}>
        Esto es
      </div>
      <div style={bloqueado ? { opacity: 0.55, pointerEvents: 'none' } : undefined}>
        <Segmentado
          opciones={
            [
              { valor: 'nota', etiqueta: 'Nota' },
              { valor: 'hallazgo', etiqueta: 'Hallazgo' },
              { valor: 'oportunidad', etiqueta: 'Oportunidad' },
            ] as const
          }
          valor={tipoActual}
          onCambio={(v) => pedirCambio(v as TipoItem)}
        />
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>{ayuda}</div>

      {confirmando && (
        <div className="card card--riesgo" style={{ marginTop: 6 }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Se convierte en <b>{LABEL[confirmando].toLowerCase()}</b>. El texto y todo lo demás se
            conservan.
            {tipoActual === 'hallazgo' &&
              ' Sus áreas del catálogo se guardan y vuelven si lo marcas otra vez como hallazgo.'}
          </p>
          {error && (
            <div className="field-error-text" style={{ marginTop: 6 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={trabajando}
              onClick={() => setConfirmando(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={trabajando}
              onClick={confirmar}
            >
              {trabajando ? 'Cambiando…' : `Sí, convertir en ${LABEL[confirmando].toLowerCase()}`}
            </button>
          </div>
        </div>
      )}

      {error && !confirmando && (
        <div className="field-error-text" style={{ marginTop: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
}
