import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

interface Termino {
  id: string;
  nombre: string;
  categoria_id: string;
  estado_gobierno: string;
}

interface Categoria {
  id: string;
  nombre: string;
}

interface SelectorTerminoProps {
  onSeleccionar: (termino: { id: string; nombre: string }) => void;
  onCerrar?: () => void;
  titulo?: string;
}

// Componente único, reutilizado en los tres sitios donde se elige un
// término (Detalle de Oportunidad ×2, Hallazgo rápido ×1) — antes cada uno
// tenía su propio buscador de texto libre, sin forma de explorar el
// catálogo si no recordabas el nombre exacto. Ahora combina las dos vías:
// buscador arriba (para cuando sabes el nombre) + categorías desplegables
// debajo (para cuando no lo sabes) — reutiliza el mismo patrón categoría→
// términos ya construido en Cola de vocabulario.
export function SelectorTermino({ onSeleccionar, onCerrar, titulo }: SelectorTerminoProps) {
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [categoriaAbiertaId, setCategoriaAbiertaId] = useState<string | null>(null);
  const [proponiendo, setProponiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: categorias } = useQuery({
    queryKey: ['categorias'],
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error: err } = await supabase.from('categoria_vocabulario').select('id, nombre').order('nombre');
      if (err) throw err;
      return data ?? [];
    },
  });

  const { data: terminos } = useQuery({
    queryKey: ['catalogo-terminos-selector'],
    queryFn: async (): Promise<Termino[]> => {
      const { data, error: err } = await supabase
        .from('termino')
        .select('id, nombre, categoria_id, estado_gobierno')
        .neq('estado_gobierno', 'descartado')
        .order('nombre');
      if (err) throw err;
      return data ?? [];
    },
  });

  const resultadosBusqueda = textoBusqueda.trim()
    ? (terminos ?? []).filter((t) => t.nombre.toLowerCase().includes(textoBusqueda.trim().toLowerCase())).slice(0, 10)
    : [];

  const existeExacto = (terminos ?? []).some((t) => t.nombre.toLowerCase() === textoBusqueda.trim().toLowerCase());

  async function proponerYSeleccionar() {
    if (!textoBusqueda.trim()) return;
    setProponiendo(true);
    setError(null);

    const { data: sesion } = await supabase.auth.getSession();
    const usuarioId = sesion.session?.user.id;

    const { data: categoriaRespaldo, error: errCat } = await supabase
      .from('categoria_vocabulario')
      .select('id')
      .order('nombre')
      .limit(1)
      .single();
    if (errCat || !categoriaRespaldo) {
      setProponiendo(false);
      setError('No se pudo determinar una categoría para el término nuevo.');
      return;
    }

    const { data: nuevo, error: errIns } = await supabase
      .from('termino')
      .insert({
        nombre: textoBusqueda.trim(),
        categoria_id: categoriaRespaldo.id,
        rol_funcional: 'ambos',
        propuesto_por_id: usuarioId,
        fecha_propuesta: new Date().toISOString(),
      })
      .select('id, nombre')
      .single();
    setProponiendo(false);
    if (errIns || !nuevo) {
      setError(errIns?.message ?? 'No se pudo proponer el término.');
      return;
    }
    onSeleccionar(nuevo);
  }

  return (
    <div className="card">
      {titulo && <div className="label" style={{ marginTop: 0 }}>{titulo}</div>}
      <input
        className="field"
        autoFocus
        value={textoBusqueda}
        onChange={(e) => setTextoBusqueda(e.target.value)}
        placeholder="buscar término…"
      />

      {textoBusqueda.trim() ? (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, maxHeight: 140, overflowY: 'auto' }}>
            {resultadosBusqueda.map((t) => (
              <button key={t.id} type="button" className="chip" onClick={() => onSeleccionar(t)}>
                {t.nombre}
                {t.estado_gobierno === 'propuesto' && (
                  <span style={{ color: 'var(--ink-400)', fontSize: 11 }}> · pendiente</span>
                )}
              </button>
            ))}
          </div>
          {!existeExacto && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 8 }}
              disabled={proponiendo}
              onClick={proponerYSeleccionar}
            >
              {proponiendo ? 'Proponiendo…' : `+ Proponer "${textoBusqueda.trim()}" como término nuevo`}
            </button>
          )}
        </>
      ) : (
        <div style={{ marginTop: 8 }}>
          {categorias?.map((c) => {
            const terminosDeCategoria = (terminos ?? []).filter((t) => t.categoria_id === c.id);
            const abierta = categoriaAbiertaId === c.id;
            return (
              <div key={c.id} style={{ marginBottom: 6 }}>
                <button
                  type="button"
                  className={`chip${abierta ? ' chip--on' : ''}`}
                  onClick={() => setCategoriaAbiertaId(abierta ? null : c.id)}
                >
                  {c.nombre} ({terminosDeCategoria.length})
                </button>
                {abierta && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, paddingLeft: 8 }}>
                    {terminosDeCategoria.length ? (
                      terminosDeCategoria.map((t) => (
                        <button key={t.id} type="button" className="chip" onClick={() => onSeleccionar(t)}>
                          {t.nombre}
                        </button>
                      ))
                    ) : (
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>sin términos</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {onCerrar && (
        <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onCerrar}>
          Cerrar
        </button>
      )}
      {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
