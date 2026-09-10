import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Icono } from '@/components/ui/iconos';

interface ProyectoOpcion {
  id: string;
  nombre: string;
  estado?: string;
}

interface ObjetivoVisitaModalProps {
  // Nombre del cliente para encabezar la ventana ("Visita a …").
  clienteNombre?: string;
  // Proyectos del cliente. Con `onCrearProyecto`, siempre se muestra el
  // selector (con la opción de crear uno nuevo); sin él, solo si hay 2+.
  proyectos?: ProyectoOpcion[];
  // Proyecto preseleccionado. Sirve también de valor devuelto cuando no hay
  // selector (p. ej. desde la ficha de un proyecto concreto).
  proyectoInicial?: string;
  // Crea una línea de negocio nueva para este cliente y devuelve su id. Si se
  // pasa, la ventana ofrece «+ Nuevo proyecto» aunque el cliente tenga uno solo.
  onCrearProyecto?: (nombre: string) => Promise<string>;
  // Arranca la visita con el objetivo escrito y el proyecto elegido. El
  // cierre de la ventana y la navegación los controla quien la abre, igual
  // que el resto de modales.
  onConfirmar: (objetivo: string, proyectoId: string) => Promise<void> | void;
  onCerrar: () => void;
}

// Ventana obligatoria al arrancar una visita "sobre la marcha" (los caminos
// de "Iniciar visita ahora", que no pasan por planificación). El objetivo de
// una visita se piensa ANTES de entrar al cliente — una visita planificada
// ya lo pregunta en su formulario; esta es su equivalente para la visita
// improvisada. No se puede empezar sin escribirlo.
export function ObjetivoVisitaModal({
  clienteNombre,
  proyectos,
  proyectoInicial,
  onCrearProyecto,
  onConfirmar,
  onCerrar,
}: ObjetivoVisitaModalProps) {
  const [objetivo, setObjetivo] = useState('');
  // Proyectos creados desde esta misma ventana, para que aparezcan en el
  // selector sin esperar a que la lista de origen se recargue.
  const [opcionesLocales, setOpcionesLocales] = useState<ProyectoOpcion[]>([]);
  const opciones = [...(proyectos ?? []), ...opcionesLocales].filter(
    (p) => p.estado !== 'terminado'
  );
  const [proyectoId, setProyectoId] = useState(proyectoInicial ?? opciones[0]?.id ?? '');
  const [arrancando, setArrancando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // «+ Nuevo proyecto» inline.
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [creandoCarga, setCreandoCarga] = useState(false);
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);

  // El bloque de proyecto se muestra si hay que elegir (2+) o si se puede
  // crear uno nuevo aquí mismo.
  const mostrarProyecto = !!onCrearProyecto || opciones.length > 1;

  async function crearProyecto() {
    const nombre = nombreNuevo.trim();
    if (!nombre || !onCrearProyecto || creandoCarga) return;
    setCreandoCarga(true);
    setErrorNuevo(null);
    try {
      const id = await onCrearProyecto(nombre);
      setOpcionesLocales((prev) => [...prev, { id, nombre, estado: 'activo' }]);
      setProyectoId(id);
      setCreando(false);
      setNombreNuevo('');
    } catch (err) {
      setErrorNuevo(err instanceof Error ? err.message : 'No se pudo crear el proyecto.');
    } finally {
      setCreandoCarga(false);
    }
  }

  async function empezar() {
    if (!objetivo.trim() || arrancando) return;
    setArrancando(true);
    setError(null);
    try {
      await onConfirmar(objetivo.trim(), proyectoId);
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo empezar la visita: ${err.message}`
          : 'No se pudo empezar la visita. Inténtalo de nuevo.'
      );
      setArrancando(false);
    }
  }

  return (
    <Modal titulo={`¿A qué vas${clienteNombre ? ` a ${clienteNombre}` : ''}?`} onCerrar={onCerrar}>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', margin: '8px 0' }}>
        el objetivo de la visita. Podrás matizarlo dentro.
      </div>
      <textarea
        className="field"
        style={{ height: 'auto', padding: 8 }}
        rows={2}
        autoFocus
        value={objetivo}
        onChange={(e) => setObjetivo(e.target.value)}
        placeholder="cerrar el pedido pendiente, presentar la nueva gama, primera toma de contacto…"
      />

      {mostrarProyecto && (
        <>
          <div className="label">Proyecto</div>
          {opciones.length > 0 && (
            <select
              className="field"
              value={proyectoId}
              onChange={(e) => setProyectoId(e.target.value)}
            >
              {opciones.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          )}
          {onCrearProyecto && !creando && (
            <button
              type="button"
              className="eco-tag-mas"
              style={{ marginTop: 6, alignSelf: 'flex-start' }}
              onClick={() => setCreando(true)}
            >
              <Icono nombre="mas" size={13} /> Nuevo proyecto
            </button>
          )}
          {creando && (
            <div style={{ marginTop: 8 }}>
              <input
                className={`field${errorNuevo ? ' field--error' : ''}`}
                autoFocus
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                placeholder="p. ej. Mantenimiento, Obra nueva, Postventa…"
              />
              {errorNuevo && <div className="field-error-text">{errorNuevo}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={creandoCarga}
                  onClick={() => {
                    setCreando(false);
                    setNombreNuevo('');
                    setErrorNuevo(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={creandoCarga || !nombreNuevo.trim()}
                  onClick={crearProyecto}
                >
                  {creandoCarga ? 'Creando…' : 'Crear'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <button
        className="btn btn-primary"
        style={{ marginTop: 12 }}
        disabled={!objetivo.trim() || arrancando}
        onClick={empezar}
      >
        {arrancando ? 'Empezando…' : 'Empezar visita'}
      </button>

      {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
    </Modal>
  );
}
