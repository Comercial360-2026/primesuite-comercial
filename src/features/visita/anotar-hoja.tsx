import { useState } from 'react';
import { uuid } from '@/lib/uuid';
import type { HallazgoPayload, OportunidadPayload } from '@/lib/offline-queue/types';
import { SelectorTermino } from '@/components/ui/selector-termino';
import { AyudaNota } from '@/components/ui/ayuda-nota';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { Icono } from '@/components/ui/iconos';
import { useDictado } from '@/hooks/use-dictado';
import { NATURALEZA_LABEL, PRIORIDAD_LABEL, etiqueta } from '@/lib/etiquetas-visita';

interface AnotarHojaProps {
  visitaId: string;
  clienteId: string | undefined;
  comercialId: string;
  /** Guarda un hallazgo (los 3 chips que no son "Oportunidad de venta"). */
  onGuardarHallazgo: (payload: HallazgoPayload) => Promise<void>;
  /** Guarda una Oportunidad (entidad). El id se genera aquí para poder
   *  ofrecer "Completar ahora" nada más guardarla. */
  onGuardarOportunidad: (oportunidadId: string, payload: OportunidadPayload) => Promise<void>;
  /** Abre el Detalle de la oportunidad recién creada. */
  onCompletarOportunidad: (oportunidadId: string) => void;
  onCerrar: () => void;
}

interface TerminoSeleccionado {
  id: string;
  nombre: string;
}

// "¿Qué es?" — 3 son naturalezas de hallazgo, la 4ª crea una Oportunidad.
type QueEs = 'contexto' | 'competencia' | 'riesgo' | 'oportunidad';
const QUE_ES: { valor: QueEs; label: string }[] = [
  { valor: 'contexto', label: NATURALEZA_LABEL.contexto },
  { valor: 'competencia', label: NATURALEZA_LABEL.competencia },
  { valor: 'riesgo', label: NATURALEZA_LABEL.riesgo },
  { valor: 'oportunidad', label: 'Oportunidad de venta' },
];

const PRIORIDADES: OportunidadPayload['prioridad'][] = ['baja', 'media', 'alta', 'estrategica'];

// Un solo gesto de captura (prompt maestro 10, Paso 2): el comercial
// escribe o dicta lo que ha visto SIN decidir antes el tipo, y luego elige
// "¿qué es?". Fusiona las antiguas hojas "Hallazgo rápido" y "Oportunidad
// rápida" (borradas) y absorbe el flujo de "Nota" suelto — todo lo que se
// anota es ahora un hallazgo (o una oportunidad).
export function AnotarHoja({
  visitaId,
  clienteId,
  comercialId,
  onGuardarHallazgo,
  onGuardarOportunidad,
  onCompletarOportunidad,
  onCerrar,
}: AnotarHojaProps) {
  const [oportunidadId] = useState(() => uuid());
  const [texto, setTexto] = useState('');
  const [queEs, setQueEs] = useState<QueEs>('contexto');
  const [terminoSeleccionado, setTerminoSeleccionado] = useState<TerminoSeleccionado | null>(null);
  const [prioridad, setPrioridad] = useState<OportunidadPayload['prioridad']>('media');
  const [guardando, setGuardando] = useState(false);
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [oportunidadGuardada, setOportunidadGuardada] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dictado voz→texto: escribir en el móvil delante del cliente queda mal.
  // Mismo patrón que tenía la Nota: lo final se añade al texto, lo
  // provisional se pinta en vivo.
  const [dictadoProvisional, setDictadoProvisional] = useState('');
  const dictado = useDictado((frag, { final }) => {
    if (final) {
      setTexto((t) => (t.trim() ? `${t.trimEnd()} ${frag}` : frag));
      setDictadoProvisional('');
    } else {
      setDictadoProvisional(frag);
    }
  });
  const textoEnVivo =
    dictado.dictando && dictadoProvisional
      ? `${texto.trimEnd()}${texto.trim() ? ' ' : ''}${dictadoProvisional}`
      : texto;

  function textoConsolidado(): string {
    if (dictadoProvisional.trim()) {
      const t = `${texto.trimEnd()}${texto.trim() ? ' ' : ''}${dictadoProvisional.trim()}`;
      dictado.parar();
      setTexto(t);
      setDictadoProvisional('');
      return t;
    }
    return texto;
  }

  async function guardar() {
    const cuerpo = textoConsolidado().trim();
    if (!cuerpo) return;
    setGuardando(true);
    setError(null);
    try {
      if (queEs === 'oportunidad') {
        if (!clienteId) {
          setError('No se ha podido identificar el cliente de esta visita. Vuelve a intentarlo en unos segundos.');
          setGuardando(false);
          return;
        }
        await onGuardarOportunidad(oportunidadId, {
          clienteId,
          comercialAutorId: comercialId,
          visitaOrigenId: visitaId,
          titulo: cuerpo,
          prioridad,
        });
        setOportunidadGuardada(true);
      } else {
        await onGuardarHallazgo({
          visitaId,
          comercialAutorId: comercialId,
          terminoId: terminoSeleccionado?.id,
          naturaleza: queEs,
          nota: cuerpo,
        });
        // El cierre lo controla el padre (visita-activa.tsx) con 700ms de
        // retraso, para que "Guardado ✓" sea visible.
        setGuardadoConExito(true);
      }
    } catch (err) {
      setError(
        err instanceof Error ? `No se pudo guardar: ${err.message}` : 'No se pudo guardar. Inténtalo de nuevo.'
      );
    } finally {
      setGuardando(false);
    }
  }

  // Tras guardar una Oportunidad: completar ahora o seguir en la visita.
  if (oportunidadGuardada) {
    return (
      <HojaSuperior titulo="Anotar" onCerrar={onCerrar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--success-600)', fontWeight: 500 }}>
          <Icono nombre="check" size={16} /> Guardado como oportunidad
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', margin: '4px 0 12px' }}>
          «{texto.trim()}» — {etiqueta(PRIORIDAD_LABEL, prioridad)}. Puedes completarla ahora (etapa,
          horizonte, qué ya tiene el cliente, qué le proponemos…) o hacerlo luego desde el cliente.
        </div>
        <button className="btn btn-primary" onClick={() => onCompletarOportunidad(oportunidadId)}>
          Completar ahora
        </button>
        <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onCerrar}>
          Listo, sigo en la visita
        </button>
      </HojaSuperior>
    );
  }

  return (
    <HojaSuperior titulo="Anotar" onCerrar={onCerrar}>
      <textarea
        className="field"
        style={{ height: 'auto', padding: 8 }}
        rows={3}
        autoFocus
        value={textoEnVivo}
        onChange={(e) => setTexto(e.target.value)}
        readOnly={dictado.dictando && !!dictadoProvisional}
        placeholder="lo que has visto: qué falla, desde cuándo, quién lo puso, qué quiere el cliente…"
      />
      {dictado.soportado && (
        <button
          type="button"
          className={`chip${dictado.dictando ? ' chip--on' : ''}`}
          style={{ marginTop: 6 }}
          onClick={dictado.alternar}
        >
          <Icono nombre="audio" size={14} />
          {dictado.dictando ? 'Escuchando… tocar para parar' : 'Dictar'}
        </button>
      )}

      <div className="label">¿Qué es?</div>
      <AyudaNota concepto="naturaleza-hallazgo" />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {QUE_ES.map((q) => (
          <button
            key={q.valor}
            type="button"
            className={`chip${queEs === q.valor ? ' chip--on' : ''}`}
            onClick={() => setQueEs(q.valor)}
          >
            {q.label}
          </button>
        ))}
      </div>

      {queEs === 'oportunidad' ? (
        <>
          <div className="label">Prioridad</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {PRIORIDADES.map((p) => (
              <button
                key={p}
                type="button"
                className={`chip${prioridad === p ? ' chip--on' : ''}`}
                onClick={() => setPrioridad(p)}
              >
                {etiqueta(PRIORIDAD_LABEL, p)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="label">¿De qué marca o sistema? (opcional)</div>
          {terminoSeleccionado ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="chip chip--on">{terminoSeleccionado.nombre}</span>
              <button
                type="button"
                onClick={() => setTerminoSeleccionado(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}
              >
                quitar
              </button>
            </div>
          ) : (
            <SelectorTermino onSeleccionar={setTerminoSeleccionado} />
          )}
        </>
      )}

      <button
        className="btn btn-primary"
        style={{ marginTop: 12 }}
        disabled={!textoEnVivo.trim() || guardando || guardadoConExito}
        onClick={guardar}
      >
        {guardadoConExito ? (
          <><Icono nombre="check" size={16} /> Guardado</>
        ) : guardando ? (
          'Guardando…'
        ) : (
          'Guardar'
        )}
      </button>

      {/* Por qué "Guardar" está en gris: no basta con elegir "¿Qué es?",
          hace falta el texto de lo que has visto. */}
      {!textoEnVivo.trim() && !guardadoConExito && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
          Escribe o dicta arriba lo que has visto para poder guardarlo.
        </div>
      )}

      {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
    </HojaSuperior>
  );
}
