import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { Modal } from '@/components/ui/modal';

interface InterlocutoresModalProps {
  visitaId: string;
  clienteId: string;
  onCerrar: () => void;
}

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

const FORMULARIO_VACIO: FormularioInterlocutor = { nombre: '', cargo: '', telefono: '', email: '', tipo: '', relevancia: '' };

// Baja frecuencia por visita — de ahí que viva en un chip de cabecera, no
// en la cuadrícula principal. No pasa por la cola offline: ni interlocutor
// ni visita_interlocutor están entre las 5 entidades sincronizables.
//
// "Quitar" un interlocutor del directorio es baja lógica (activo=false),
// no DELETE real — si ya se usó en visitas anteriores, borrar la fila
// rompería esas referencias históricas. Mismo criterio que "descartar" en
// el catálogo de vocabulario.
export function InterlocutoresModal({ visitaId, clienteId, onCerrar }: InterlocutoresModalProps) {
  const queryClient = useQueryClient();
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [formNuevo, setFormNuevo] = useState<FormularioInterlocutor>(FORMULARIO_VACIO);
  // Al alta, marcar la persona como presente en ESTA visita. Activado por
  // defecto (es el caso normal: tienes a alguien delante sin registrar),
  // pero se puede desmarcar para registrar a alguien de quien te hablan y
  // no estaba en la reunión.
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

  const { data: presentesIds } = useQuery({
    queryKey: ['interlocutores-presentes', visitaId],
    queryFn: async (): Promise<string[]> => {
      const { data, error: err } = await supabase
        .from('visita_interlocutor')
        .select('interlocutor_id')
        .eq('visita_id', visitaId);
      if (err) throw err;
      return (data ?? []).map((r) => r.interlocutor_id);
    },
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['interlocutores-presentes', visitaId] });
    queryClient.invalidateQueries({ queryKey: ['interlocutores-count', visitaId] });
    queryClient.invalidateQueries({ queryKey: ['interlocutores-cliente', clienteId] });
  }

  async function alternarPresencia(interlocutorId: string, presente: boolean) {
    setError(null);
    if (presente) {
      const { error: err, count } = await supabase
        .from('visita_interlocutor')
        .delete({ count: 'exact' })
        .eq('visita_id', visitaId)
        .eq('interlocutor_id', interlocutorId);
      if (err) {
        setError(err.message);
        return;
      }
      if (!count) {
        setError('No se ha podido quitar (0 filas afectadas). Puede que no tengas permiso.');
        return;
      }
    } else {
      const { error: err } = await supabase
        .from('visita_interlocutor')
        .insert({ visita_id: visitaId, interlocutor_id: interlocutorId });
      if (err) {
        setError(err.message);
        return;
      }
    }
    invalidar();
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

    // Solo si el comercial lo ha dejado marcado (por defecto, sí).
    if (nuevoPresente) {
      const { error: errRel } = await supabase
        .from('visita_interlocutor')
        .insert({ visita_id: visitaId, interlocutor_id: nuevo.id });
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
    setEditandoId(null);
    invalidar();
  }

  // La × / Esc / tocar fuera cierran primero la edición o el alta si están
  // abiertas — no todo el modal de golpe.
  const cerrar = () => {
    if (editandoId) setEditandoId(null);
    else if (creandoNuevo) cancelarAlta();
    else onCerrar();
  };

  return (
    <Modal titulo="Interlocutores" onCerrar={cerrar}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 8 }}>
          Quién ha estado presente en esta visita
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {directorio?.map((i) => {
            const presente = presentesIds?.includes(i.id) ?? false;

            if (editandoId === i.id) {
              return (
                <div key={i.id} className="card">
                  <input
                    className="field"
                    autoFocus
                    value={formEdicion.nombre}
                    onChange={(e) => setFormEdicion({ ...formEdicion, nombre: e.target.value })}
                    placeholder="nombre"
                  />
                  <input
                    className="field"
                    style={{ marginTop: 6 }}
                    value={formEdicion.cargo}
                    onChange={(e) => setFormEdicion({ ...formEdicion, cargo: e.target.value })}
                    placeholder="cargo (opcional)"
                  />
                  <input
                    className="field"
                    style={{ marginTop: 6 }}
                    type="tel"
                    value={formEdicion.telefono}
                    onChange={(e) => setFormEdicion({ ...formEdicion, telefono: e.target.value })}
                    placeholder="teléfono (opcional)"
                  />
                  <input
                    className="field"
                    style={{ marginTop: 6 }}
                    type="email"
                    value={formEdicion.email}
                    onChange={(e) => setFormEdicion({ ...formEdicion, email: e.target.value })}
                    placeholder="email (opcional)"
                  />
                  <input
                    className="field"
                    style={{ marginTop: 6 }}
                    value={formEdicion.relevancia}
                    onChange={(e) => setFormEdicion({ ...formEdicion, relevancia: e.target.value })}
                    placeholder="por qué importa (opcional)"
                  />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {TIPOS_INFLUENCIA.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`chip${formEdicion.tipo === t ? ' chip--on' : ''}`}
                        onClick={() => setFormEdicion({ ...formEdicion, tipo: t })}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditandoId(null)} disabled={guardando}>
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

            return (
              <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  className={`chip${presente ? ' chip--on' : ''}`}
                  style={{ textAlign: 'left', justifyContent: 'flex-start', flex: 1 }}
                  onClick={() => alternarPresencia(i.id, presente)}
                >
                  <div>{i.nombre}{i.cargo && <span style={{ color: 'var(--ink-400)' }}> · {i.cargo}</span>}</div>
                  {(i.telefono || i.email) && (
                    <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                      {i.telefono}{i.telefono && i.email && ' · '}{i.email}
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                  onClick={() => abrirEdicion(i)}
                >
                  Editar
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
          <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => setCreandoNuevo(true)}>
            + Nuevo interlocutor
          </button>
        ) : (
          <div style={{ marginTop: 10 }}>
            <input
              className="field"
              autoFocus
              value={formNuevo.nombre}
              onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
              placeholder="nombre"
            />
            <input
              className="field"
              style={{ marginTop: 6 }}
              value={formNuevo.cargo}
              onChange={(e) => setFormNuevo({ ...formNuevo, cargo: e.target.value })}
              placeholder="cargo (opcional)"
            />
            <input
              className="field"
              style={{ marginTop: 6 }}
              type="tel"
              value={formNuevo.telefono}
              onChange={(e) => setFormNuevo({ ...formNuevo, telefono: e.target.value })}
              placeholder="teléfono (opcional)"
            />
            <input
              className="field"
              style={{ marginTop: 6 }}
              type="email"
              value={formNuevo.email}
              onChange={(e) => setFormNuevo({ ...formNuevo, email: e.target.value })}
              placeholder="email (opcional)"
            />
            <input
              className="field"
              style={{ marginTop: 6 }}
              value={formNuevo.relevancia}
              onChange={(e) => setFormNuevo({ ...formNuevo, relevancia: e.target.value })}
              placeholder="por qué importa (opcional)"
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {TIPOS_INFLUENCIA.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip${formNuevo.tipo === t ? ' chip--on' : ''}`}
                  onClick={() => setFormNuevo({ ...formNuevo, tipo: t })}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* Por defecto se marca presente en esta visita (caso normal:
                alguien delante sin registrar). Desmárcalo para registrar a
                quien te nombran pero no estaba en la reunión. */}
            <button
              type="button"
              className={`chip${nuevoPresente ? ' chip--on' : ''}`}
              style={{ marginTop: 8 }}
              onClick={() => setNuevoPresente((v) => !v)}
            >
              Estaba presente en esta visita
            </button>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={cancelarAlta}
                disabled={guardando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!formNuevo.nombre.trim() || guardando}
                onClick={crearInterlocutor}
              >
                {guardando
                  ? 'Guardando…'
                  : nuevoPresente
                    ? 'Añadir y marcar presente'
                    : 'Añadir'}
              </button>
            </div>
          </div>
        )}

        {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
    </Modal>
  );
}
