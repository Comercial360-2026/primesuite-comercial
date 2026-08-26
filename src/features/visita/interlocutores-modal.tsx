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
  tipo_influencia: string | null;
}

const TIPOS_INFLUENCIA = ['decisor', 'influenciador', 'tecnico', 'usuario', 'compras', 'otro'];

// Baja frecuencia por visita (se marca una vez, quizá se ajusta puntualmente)
// — de ahí que viva en un chip de cabecera, no en la cuadrícula principal
// de capturas, a diferencia de Hallazgo. No pasa por la cola offline: ni
// interlocutor ni visita_interlocutor están entre las 5 entidades
// sincronizables (visita, hallazgo, captura_libre, oportunidad,
// proximo_paso) — es una acción directa, de bajo riesgo si falla sin red
// (se reintenta sin más, no hay archivo binario ni datos complejos que
// perder).
export function InterlocutoresModal({ visitaId, clienteId, onCerrar }: InterlocutoresModalProps) {
  const queryClient = useQueryClient();
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [cargoNuevo, setCargoNuevo] = useState('');
  const [tipoNuevo, setTipoNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: directorio } = useQuery({
    queryKey: ['interlocutores-cliente', clienteId],
    queryFn: async (): Promise<Interlocutor[]> => {
      const { data, error: err } = await supabase
        .from('interlocutor')
        .select('id, nombre, cargo, tipo_influencia')
        .eq('cliente_id', clienteId)
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
      const { error: err } = await supabase
        .from('visita_interlocutor')
        .delete()
        .eq('visita_id', visitaId)
        .eq('interlocutor_id', interlocutorId);
      if (err) {
        setError(err.message);
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
    if (!nombreNuevo.trim()) return;
    setGuardando(true);
    setError(null);

    const { data: nuevo, error: errIns } = await supabase
      .from('interlocutor')
      .insert({
        cliente_id: clienteId,
        nombre: nombreNuevo.trim(),
        cargo: cargoNuevo.trim() || null,
        tipo_influencia: tipoNuevo || null,
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

    setNombreNuevo('');
    setCargoNuevo('');
    setTipoNuevo('');
    setCreandoNuevo(false);
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
            onClick={onCerrar}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}
            aria-label="cerrar"
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
            return (
              <button
                key={i.id}
                type="button"
                className={`chip${presente ? ' chip--on' : ''}`}
                style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                onClick={() => alternarPresencia(i.id, presente)}
              >
                {i.nombre}
                {i.cargo && <span style={{ color: 'var(--ink-400)' }}> · {i.cargo}</span>}
              </button>
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
            + nuevo interlocutor
          </button>
        ) : (
          <div style={{ marginTop: 10 }}>
            <input
              className="field"
              autoFocus
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              placeholder="nombre"
            />
            <input
              className="field"
              style={{ marginTop: 6 }}
              value={cargoNuevo}
              onChange={(e) => setCargoNuevo(e.target.value)}
              placeholder="cargo (opcional)"
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {TIPOS_INFLUENCIA.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip${tipoNuevo === t ? ' chip--on' : ''}`}
                  onClick={() => setTipoNuevo(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setCreandoNuevo(false)} disabled={guardando}>
                cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!nombreNuevo.trim() || guardando}
                onClick={crearYMarcarPresente}
              >
                {guardando ? 'guardando…' : 'añadir y marcar presente'}
              </button>
            </div>
          </div>
        )}

        {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
