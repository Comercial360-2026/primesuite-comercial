import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { Icono } from '@/components/ui/iconos';
import { FilaToggle } from '@/components/ui/fila-toggle';

interface Interlocutor {
  id: string;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  email: string | null;
  tipo_influencia: string | null;
  relevancia: string | null;
}

const TIPOS_INFLUENCIA = ['decisor', 'influenciador', 'tecnico', 'usuario', 'compras', 'otro'];

interface FormularioInterlocutor {
  nombre: string;
  cargo: string;
  telefono: string;
  email: string;
  tipo: string;
  relevancia: string;
}

const FORMULARIO_VACIO: FormularioInterlocutor = {
  nombre: '',
  cargo: '',
  telefono: '',
  email: '',
  tipo: '',
  relevancia: '',
};

// Modo "presencia": solo se pasa desde una visita en curso. Añade a cada
// fila el chip de "estaba presente en ESTA visita" y una casilla en el alta.
// Sin este prop (p. ej. desde la ficha de cliente) es un directorio a secas.
interface PresenciaProps {
  visitaId: string;
  presentesIds: string[];
  onTogglePresencia: (interlocutorId: string, presente: boolean) => Promise<void>;
}

interface Props {
  clienteId: string;
  presencia?: PresenciaProps;
  /** Alta controlada desde fuera: si se pasa, el "+" vive en la cabecera
   *  del contenedor (hoja de Interlocutores) y aquí se oculta el botón
   *  "+ Nuevo interlocutor" del final. */
  crearNuevo?: { abierto: boolean; onCambio: (abierto: boolean) => void };
}

// Directorio de personas de contacto de un cliente (`interlocutor`, ligado a
// `cliente_id`). Vive en la ficha de cliente (dato del cliente, no de una
// visita) y también dentro de la hoja de Interlocutores de una visita en
// curso, que le pasa `presencia`.
//
// "Quitar" es baja lógica (`activo=false`), no DELETE — si ya se usó en
// visitas anteriores, borrar la fila rompería el histórico. Mismo criterio
// que "descartar" en el catálogo de vocabulario.
export function DirectorioInterlocutores({ clienteId, presencia, crearNuevo }: Props) {
  const queryClient = useQueryClient();
  const [creandoInterno, setCreandoInterno] = useState(false);
  const creandoNuevo = crearNuevo ? crearNuevo.abierto : creandoInterno;
  const setCreandoNuevo = crearNuevo ? crearNuevo.onCambio : setCreandoInterno;
  const [formNuevo, setFormNuevo] = useState<FormularioInterlocutor>(FORMULARIO_VACIO);
  const [nuevoPresente, setNuevoPresente] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdicion, setFormEdicion] = useState<FormularioInterlocutor>(FORMULARIO_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: directorio } = useQuery({
    queryKey: ['interlocutores-cliente', clienteId],
    queryFn: async (): Promise<Interlocutor[]> => {
      const { data, error: err } = await supabase
        .from('interlocutor')
        .select('id, nombre, cargo, telefono, email, tipo_influencia, relevancia')
        .eq('cliente_id', clienteId)
        .eq('activo', true)
        .order('nombre');
      if (err) throw err;
      return data ?? [];
    },
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['interlocutores-cliente', clienteId] });
    if (presencia) {
      queryClient.invalidateQueries({ queryKey: ['interlocutores-presentes', presencia.visitaId] });
      queryClient.invalidateQueries({ queryKey: ['interlocutores-count', presencia.visitaId] });
    }
  }

  function cancelarAlta() {
    setCreandoNuevo(false);
    setFormNuevo(FORMULARIO_VACIO);
    setNuevoPresente(true);
  }

  async function crearInterlocutor() {
    if (!formNuevo.nombre.trim()) return;
    setGuardando(true);
    setError(null);

    const { data: nuevo, error: errIns } = await supabase
      .from('interlocutor')
      .insert({
        cliente_id: clienteId,
        nombre: formNuevo.nombre.trim(),
        cargo: formNuevo.cargo.trim() || null,
        telefono: formNuevo.telefono.trim() || null,
        email: formNuevo.email.trim() || null,
        tipo_influencia: formNuevo.tipo || null,
        relevancia: formNuevo.relevancia.trim() || null,
      })
      .select('id')
      .single();

    if (errIns || !nuevo) {
      setGuardando(false);
      setError(errIns?.message ?? 'No se pudo crear el interlocutor.');
      return;
    }

    if (presencia && nuevoPresente) {
      const { error: errRel } = await supabase
        .from('visita_interlocutor')
        .insert({ visita_id: presencia.visitaId, interlocutor_id: nuevo.id });
      if (errRel) {
        setGuardando(false);
        setError(errRel.message);
        return;
      }
    }

    setGuardando(false);
    setFormNuevo(FORMULARIO_VACIO);
    setNuevoPresente(true);
    setCreandoNuevo(false);
    invalidar();
  }

  function abrirEdicion(i: Interlocutor) {
    setEditandoId(i.id);
    setFormEdicion({
      nombre: i.nombre,
      cargo: i.cargo ?? '',
      telefono: i.telefono ?? '',
      email: i.email ?? '',
      tipo: i.tipo_influencia ?? '',
      relevancia: i.relevancia ?? '',
    });
  }

  async function guardarEdicion() {
    if (!editandoId || !formEdicion.nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase
      .from('interlocutor')
      .update({
        nombre: formEdicion.nombre.trim(),
        cargo: formEdicion.cargo.trim() || null,
        telefono: formEdicion.telefono.trim() || null,
        email: formEdicion.email.trim() || null,
        tipo_influencia: formEdicion.tipo || null,
        relevancia: formEdicion.relevancia.trim() || null,
      })
      .eq('id', editandoId);
    setGuardando(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditandoId(null);
    invalidar();
  }

  async function quitarDelDirectorio(id: string) {
    setError(null);
    const { error: err } = await supabase.from('interlocutor').update({ activo: false }).eq('id', id);
    if (err) {
      setError(err.message);
      return;
    }
    // Si se quita en mitad de una visita, tampoco cuenta como presente en
    // ella. Las visitas ya cerradas conservan su fila — no se reescribe el
    // histórico.
    if (presencia) {
      await supabase
        .from('visita_interlocutor')
        .delete()
        .eq('visita_id', presencia.visitaId)
        .eq('interlocutor_id', id);
    }
    setEditandoId(null);
    invalidar();
  }

  function camposComunes(form: FormularioInterlocutor, set: (f: FormularioInterlocutor) => void) {
    return (
      <>
        <input
          className="field"
          autoFocus
          value={form.nombre}
          onChange={(e) => set({ ...form, nombre: e.target.value })}
          placeholder="nombre"
        />
        <input
          className="field"
          style={{ marginTop: 6 }}
          value={form.cargo}
          onChange={(e) => set({ ...form, cargo: e.target.value })}
          placeholder="cargo (opcional)"
        />
        <input
          className="field"
          style={{ marginTop: 6 }}
          type="tel"
          value={form.telefono}
          onChange={(e) => set({ ...form, telefono: e.target.value })}
          placeholder="teléfono (opcional)"
        />
        <input
          className="field"
          style={{ marginTop: 6 }}
          type="email"
          value={form.email}
          onChange={(e) => set({ ...form, email: e.target.value })}
          placeholder="email (opcional)"
        />
        <input
          className="field"
          style={{ marginTop: 6 }}
          value={form.relevancia}
          onChange={(e) => set({ ...form, relevancia: e.target.value })}
          placeholder="por qué importa (opcional)"
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {TIPOS_INFLUENCIA.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip${form.tipo === t ? ' chip--on' : ''}`}
              onClick={() => set({ ...form, tipo: t })}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <div>
      {presencia && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-500)', marginBottom: 10 }}>
          Marca quién estuvo presente en esta visita — toca su nombre.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {directorio?.map((i) => {
          const presente = presencia?.presentesIds.includes(i.id) ?? false;

          if (editandoId === i.id) {
            return (
              <div key={i.id} className="card" style={{ margin: '6px 0' }}>
                {camposComunes(formEdicion, setFormEdicion)}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditandoId(null)}
                    disabled={guardando}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-secondary--riesgo"
                    onClick={() => quitarDelDirectorio(i.id)}
                    disabled={guardando}
                  >
                    Quitar del directorio
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!formEdicion.nombre.trim() || guardando}
                    onClick={guardarEdicion}
                  >
                    {guardando ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            );
          }

          const datos = (
            <span className="interlocutor-fila__datos">
              <span className="interlocutor-fila__nombre">
                <b>{i.nombre}</b>
                {i.cargo && <span style={{ color: 'var(--ink-400)' }}> · {i.cargo}</span>}
                {presente && (
                  <span style={{ color: 'var(--success-600)', fontWeight: 600 }}> · presente</span>
                )}
              </span>
              {(i.telefono || i.email) && (
                <span className="interlocutor-fila__sub">
                  {[i.telefono, i.email].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
          );

          return (
            <div key={i.id} className="interlocutor-fila">
              {presencia ? (
                <button
                  type="button"
                  className={`interlocutor-fila__cuerpo${presente ? ' interlocutor-fila__cuerpo--presente' : ''}`}
                  onClick={() => presencia.onTogglePresencia(i.id, presente)}
                  aria-pressed={presente}
                >
                  <FilaToggle marcada={presente} />
                  {datos}
                </button>
              ) : (
                <div className="interlocutor-fila__cuerpo">{datos}</div>
              )}
              <button
                type="button"
                className="boton-icono"
                onClick={() => abrirEdicion(i)}
                aria-label={`Editar ${i.nombre}`}
                title="Editar"
              >
                <Icono nombre="editar" size={18} />
              </button>
            </div>
          );
        })}
        {!directorio?.length && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
            Todavía no hay interlocutores registrados para este cliente
          </span>
        )}
      </div>

      {!creandoNuevo ? (
        // Con `crearNuevo` el disparador vive en la cabecera del contenedor
        // (un "+", como en el resto de la app) — aquí no se pinta botón.
        crearNuevo ? null : (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 10 }}
            onClick={() => setCreandoNuevo(true)}
          >
            + Nuevo interlocutor
          </button>
        )
      ) : (
        <div style={{ marginTop: 10 }}>
          {camposComunes(formNuevo, setFormNuevo)}

          {presencia && (
            <button
              type="button"
              className={`chip${nuevoPresente ? ' chip--on' : ''}`}
              style={{ marginTop: 8 }}
              onClick={() => setNuevoPresente((v) => !v)}
            >
              Estaba presente en esta visita
            </button>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={cancelarAlta} disabled={guardando}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!formNuevo.nombre.trim() || guardando}
              onClick={crearInterlocutor}
            >
              {guardando ? 'Guardando…' : presencia && nuevoPresente ? 'Añadir y marcar presente' : 'Añadir'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="field-error-text" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
