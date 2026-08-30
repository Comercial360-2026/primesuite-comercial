import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

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

  async function crearYMarcarPresente() {
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

    const { error: errRel } = await supabase
      .from('visita_interlocutor')
      .insert({ visita_id: visitaId, interlocutor_id: nuevo.id });
    setGuardando(false);
    if (errRel) {
      setError(errRel.message);
      return;
    }

    setFormNuevo(FORMULARIO_VACIO);
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

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'var(--surface-0)', display: 'flex', alignItems: 'flex-end', zIndex: 10 }}
      onClick={onCerrar}
    >
      <div
        className="card"
        style={{ width: '100%', boxSizing: 'border-box', margin: 'var(--space-5)', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 500 }}>interlocutores</div>
          <button
            type="button"
            onClick={() => {
              // Si hay una edición o alta abiertas, la "×" cierra primero
              // eso — no todo el modal de golpe. Es la misma "×" siempre
              // visible en el mismo sitio, así que debe salir de lo más
              // cercano primero, no saltar directo a la pantalla anterior.
              if (editandoId) {
                setEditandoId(null);
              } else if (creandoNuevo) {
                setCreandoNuevo(false);
              } else {
                onCerrar();
              }
            }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 8 }}>
          quién ha estado presente en esta visita
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
                        {t}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditandoId(null)} disabled={guardando}>
                      cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
                      onClick={() => quitarDelDirectorio(i.id)}
                      disabled={guardando}
                    >
                      quitar del directorio
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
              todavía no hay interlocutores registrados para este cliente
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
                  {t}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setCreandoNuevo(false); setFormNuevo(FORMULARIO_VACIO); }}
                disabled={guardando}
              >
                cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!formNuevo.nombre.trim() || guardando}
                onClick={crearYMarcarPresente}
              >
                {guardando ? 'Guardando…' : 'Añadir y marcar presente'}
              </button>
            </div>
          </div>
        )}

        {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
