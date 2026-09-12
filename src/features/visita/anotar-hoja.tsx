import { useRef, useState } from 'react';
import { uuid } from '@/lib/uuid';
import type { HallazgoPayload, OportunidadPayload } from '@/lib/offline-queue/types';
import type { Area } from '@/lib/vocabulario';
import { SelectorCategorias } from '@/components/ui/selector-categorias';
import { SelectorAreas } from '@/components/ui/selector-areas';
import { AyudaNota } from '@/components/ui/ayuda-nota';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { Icono } from '@/components/ui/iconos';
import { TextareaDictado, type RefCampoDictado } from '@/components/ui/campo-dictado';
import { useClasificacionDetallada } from '@/hooks/use-ajustes';
import { PRIORIDAD_LABEL, etiqueta } from '@/lib/etiquetas-visita';

interface AnotarHojaProps {
  visitaId: string;
  clienteId: string | undefined;
  comercialId: string;
  /** Sin marcar nada: se guarda como nota (captura_libre tipo 'nota'). */
  onGuardarNota: (texto: string) => Promise<void>;
  /** Marcó "Algo que tienen": se guarda como hallazgo. */
  onGuardarHallazgo: (payload: HallazgoPayload) => Promise<void>;
  /** Marcó "Algo para venderles": se guarda como oportunidad. El id se
   *  genera aquí para poder ofrecer "Completar ahora" nada más guardarla. */
  onGuardarOportunidad: (oportunidadId: string, payload: OportunidadPayload) => Promise<void>;
  /** Abre el Detalle de la oportunidad recién creada. */
  onCompletarOportunidad: (oportunidadId: string) => void;
  onCerrar: () => void;
}

// Qué es, además de una nota. 'nada' = nota suelta (el caso normal).
type Marca = 'nada' | 'hallazgo' | 'oportunidad';

const PRIORIDADES: OportunidadPayload['prioridad'][] = ['baja', 'media', 'alta', 'estrategica'];

// Cuántas veces se ha usado "Anotar" en este dispositivo: mientras sea poco,
// se enseña la línea de ayuda de primera vez. localStorage puede fallar
// (modo privado) — se envuelve en try/catch y se asume 0.
const CLAVE_USOS = 'anotar:usos';
function leerUsos(): number {
  try {
    return Number(localStorage.getItem(CLAVE_USOS)) || 0;
  } catch {
    return 0;
  }
}
function sumarUso() {
  try {
    localStorage.setItem(CLAVE_USOS, String(leerUsos() + 1));
  } catch {
    /* modo privado: sin memoria, no pasa nada */
  }
}

// "Anotar" (prompt maestro 11): ante todo, escribir una nota. Marcar que
// además es un hallazgo ("algo que tienen") o una oportunidad ("algo para
// venderles") es opcional y excluyente — o ninguna. El caso "es las dos"
// se resuelve luego desde la ficha, no en caliente.
export function AnotarHoja({
  visitaId,
  clienteId,
  comercialId,
  onGuardarNota,
  onGuardarHallazgo,
  onGuardarOportunidad,
  onCompletarOportunidad,
  onCerrar,
}: AnotarHojaProps) {
  const clasificacionDetallada = useClasificacionDetallada();
  const [oportunidadId] = useState(() => uuid());
  const [texto, setTexto] = useState('');
  const [marca, setMarca] = useState<Marca>('nada');
  const [areas, setAreas] = useState<Area[]>([]);
  const [prioridad, setPrioridad] = useState<OportunidadPayload['prioridad']>('media');
  const [guardando, setGuardando] = useState(false);
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [oportunidadGuardada, setOportunidadGuardada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarTip] = useState(() => leerUsos() < 2);

  // Dictado voz→texto: escribir en el móvil delante del cliente queda mal.
  // La acumulación final/provisional ahora vive en CampoDictado; aquí solo
  // hace falta pedirle el texto consolidado justo antes de guardar.
  const refDictado = useRef<RefCampoDictado>(null);

  function alternarMarca(m: Exclude<Marca, 'nada'>) {
    setMarca((actual) => (actual === m ? 'nada' : m));
  }

  async function guardar() {
    const cuerpo = (refDictado.current?.consolidar() ?? texto).trim();
    if (!cuerpo) return;
    setGuardando(true);
    setError(null);
    try {
      if (marca === 'oportunidad') {
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
        sumarUso();
        setOportunidadGuardada(true);
      } else if (marca === 'hallazgo') {
        await onGuardarHallazgo({
          visitaId,
          comercialAutorId: comercialId,
          // Hallazgo simplificado a "categorías + nota": una o varias
          // categorías del catálogo, opcional — término/modelo sigue
          // reservado para más adelante. El payload ya viajaba como array
          // (tabla puente `hallazgo_area`), no ha hecho falta tocar la
          // sincronización ni la base de datos.
          areas: areas.map((a) => ({ tipo: a.tipo, id: a.id })),
          nota: cuerpo,
        });
        sumarUso();
        // El cierre lo controla el padre (visita-activa.tsx) con 700ms de
        // retraso, para que "Guardado ✓" sea visible.
        setGuardadoConExito(true);
      } else {
        await onGuardarNota(cuerpo);
        sumarUso();
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

  const textoBoton =
    marca === 'hallazgo' ? 'Guardar hallazgo' : marca === 'oportunidad' ? 'Guardar oportunidad' : 'Guardar nota';

  return (
    <HojaSuperior titulo="Anotar" onCerrar={onCerrar}>
      {mostrarTip && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 8 }}>
          Apunta lo que veas. Si además es un hallazgo o una oportunidad, márcalo abajo.
        </div>
      )}

      <TextareaDictado
        ref={refDictado}
        rows={3}
        autoFocus
        valor={texto}
        onCambio={setTexto}
        placeholder="escribe o dicta lo que has visto…"
      />

      <div className="label">Se guarda como nota. Márcalo si además es:</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className={`marca-opcion${marca === 'hallazgo' ? ' marca-opcion--on' : ''}`}
          onClick={() => alternarMarca('hallazgo')}
        >
          <span className="marca-opcion__t">
            <Icono nombre="hallazgo" size={15} /> Hallazgo
          </span>
          <span className="marca-opcion__s">algo que tienen</span>
        </button>
        <button
          type="button"
          className={`marca-opcion${marca === 'oportunidad' ? ' marca-opcion--on' : ''}`}
          onClick={() => alternarMarca('oportunidad')}
        >
          <span className="marca-opcion__t">
            <Icono nombre="oportunidad" size={15} /> Oportunidad
          </span>
          <span className="marca-opcion__s">algo para venderles</span>
        </button>
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
        {marca === 'hallazgo'
          ? 'Hallazgo: algo del cliente. Se suma a su ficha.'
          : marca === 'oportunidad'
            ? 'Oportunidad: algo para venderle. Entra en el seguimiento.'
            : 'Sin marcar nada, se guarda como nota de la visita.'}
      </div>

      {marca === 'oportunidad' && (
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
      )}

      {marca === 'hallazgo' && (
        <>
          <div className="label">Categoría (opcional)</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 6 }}>
            Marca las que apliquen.
          </div>
          {clasificacionDetallada ? (
            <>
              <SelectorAreas seleccionadas={areas} onCambio={setAreas} />
              <AyudaNota concepto="termino-modelo" />
            </>
          ) : (
            <SelectorCategorias seleccionadas={areas} onCambio={setAreas} />
          )}
        </>
      )}

      <button
        className="btn btn-primary"
        style={{ marginTop: 12 }}
        disabled={!texto.trim() || guardando || guardadoConExito}
        onClick={guardar}
      >
        {guardadoConExito ? (
          <><Icono nombre="check" size={16} /> Guardado</>
        ) : guardando ? (
          'Guardando…'
        ) : (
          textoBoton
        )}
      </button>

      {!texto.trim() && !guardadoConExito && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
          Escribe o dicta arriba lo que has visto para poder guardarlo.
        </div>
      )}

      {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
    </HojaSuperior>
  );
}
