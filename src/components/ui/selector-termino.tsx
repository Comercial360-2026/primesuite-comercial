import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { AyudaNota } from '@/components/ui/ayuda-nota';
import { NOMBRE_CATEGORIA_SIN_CLASIFICAR } from '@/lib/vocabulario';

interface Termino {
  id: string;
  nombre: string;
  categoria_id: string;
  estado_gobierno: string;
  parent_id: string | null;
  orden: number;
}

interface Categoria {
  id: string;
  nombre: string;
  orden: number;
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
//
// Jerarquía (fase 2): un término puede tener modelos dentro (1 nivel:
// "MIFARE" › "DESFire EV2"). Padre y modelo son tags independientes, los
// dos seleccionables. Al elegir un modelo, `nombre` lleva la ruta completa
// "MIFARE › DESFire EV2" — sólo es etiqueta para mostrar (aguas abajo sólo
// se usa el `id`), así el chip del hallazgo / la oportunidad enseña de qué
// familia es el modelo sin tener que volver a consultar el padre.
export function SelectorTermino({ onSeleccionar, onCerrar, titulo }: SelectorTerminoProps) {
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [categoriaAbiertaId, setCategoriaAbiertaId] = useState<string | null>(null);
  const [proponiendo, setProponiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: categorias } = useQuery({
    queryKey: ['categorias'],
    queryFn: async (): Promise<Categoria[]> => {
      // Mismo orden que el catálogo (`cola-vocabulario.tsx`): primero el
      // `orden` manual, el nombre sólo desempata. Antes esto ordenaba sólo
      // por nombre e ignoraba el orden que Dirección fija a mano.
      const { data, error: err } = await supabase
        .from('categoria_vocabulario')
        .select('id, nombre, orden')
        .order('orden')
        .order('nombre');
      if (err) throw err;
      return data ?? [];
    },
  });

  const { data: terminos } = useQuery({
    queryKey: ['catalogo-terminos-selector'],
    queryFn: async (): Promise<Termino[]> => {
      const { data, error: err } = await supabase
        .from('termino')
        .select('id, nombre, categoria_id, estado_gobierno, parent_id, orden')
        .neq('estado_gobierno', 'descartado')
        .order('orden')
        .order('nombre');
      if (err) throw err;
      return data ?? [];
    },
  });

  const terminosLista = useMemo(() => terminos ?? [], [terminos]);
  const porId = useMemo(() => new Map(terminosLista.map((t) => [t.id, t])), [terminosLista]);
  const hijosPorPadre = useMemo(() => {
    const m = new Map<string, Termino[]>();
    for (const t of terminosLista) {
      if (!t.parent_id) continue;
      const arr = m.get(t.parent_id) ?? [];
      arr.push(t);
      m.set(t.parent_id, arr);
    }
    return m;
  }, [terminosLista]);

  // "MIFARE › DESFire EV2" para un modelo; sólo el nombre para un término
  // de primer nivel (o si el padre está descartado y no aparece).
  function rutaDe(t: Termino): string {
    const padre = t.parent_id ? porId.get(t.parent_id) : undefined;
    return padre ? `${padre.nombre} › ${t.nombre}` : t.nombre;
  }

  const q = textoBusqueda.trim().toLowerCase();

  // El buscador casa por el nombre del término Y por el de su padre: buscar
  // "MIFARE" saca también sus modelos; buscar "DESFire" saca el modelo con
  // su ruta.
  const resultadosBusqueda = q
    ? terminosLista
        .filter((t) => {
          if (t.nombre.toLowerCase().includes(q)) return true;
          const padre = t.parent_id ? porId.get(t.parent_id) : undefined;
          return padre ? padre.nombre.toLowerCase().includes(q) : false;
        })
        .slice(0, 10)
    : [];

  const existeExacto = terminosLista.some((t) => t.nombre.toLowerCase() === q);

  async function proponerYSeleccionar() {
    if (!textoBusqueda.trim()) return;
    setProponiendo(true);
    setError(null);

    const { data: sesion } = await supabase.auth.getSession();
    const usuarioId = sesion.session?.user.id;

    // Las propuestas sobre la marcha caen en "Sin clasificar" (bandeja fija,
    // migración 80). Si por lo que sea no existe, se usa la primera categoría
    // como red de seguridad —- el término se propone igual y Dirección lo
    // recoloca al aprobarlo.
    const { data: cats, error: errCat } = await supabase
      .from('categoria_vocabulario')
      .select('id, nombre')
      .order('nombre');
    const categoriaDestino =
      cats?.find((c) => c.nombre.trim().toLowerCase() === NOMBRE_CATEGORIA_SIN_CLASIFICAR.toLowerCase()) ??
      cats?.[0];
    if (errCat || !categoriaDestino) {
      setProponiendo(false);
      setError('No se pudo determinar una categoría para el término nuevo.');
      return;
    }

    const { data: nuevo, error: errIns } = await supabase
      .from('termino')
      .insert({
        nombre: textoBusqueda.trim(),
        categoria_id: categoriaDestino.id,
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
        placeholder="buscar término o modelo…"
      />
      <AyudaNota concepto="termino-modelo" />

      {textoBusqueda.trim() ? (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, maxHeight: 140, overflowY: 'auto' }}>
            {resultadosBusqueda.map((t) => (
              <button
                key={t.id}
                type="button"
                className="chip"
                onClick={() => onSeleccionar({ id: t.id, nombre: rutaDe(t) })}
              >
                {rutaDe(t)}
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
            const primerNivel = terminosLista.filter(
              (t) => t.categoria_id === c.id && (!t.parent_id || !porId.get(t.parent_id))
            );
            const abierta = categoriaAbiertaId === c.id;
            return (
              <div key={c.id} style={{ marginBottom: 6 }}>
                <button
                  type="button"
                  className={`chip${abierta ? ' chip--on' : ''}`}
                  onClick={() => setCategoriaAbiertaId(abierta ? null : c.id)}
                >
                  {c.nombre} ({primerNivel.length})
                </button>
                {abierta && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, paddingLeft: 8 }}>
                    {primerNivel.length ? (
                      primerNivel.map((t) => {
                        const hijos = hijosPorPadre.get(t.id) ?? [];
                        return (
                          <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="chip"
                                onClick={() => onSeleccionar({ id: t.id, nombre: t.nombre })}
                              >
                                {t.nombre}
                              </button>
                            </div>
                            {hijos.length > 0 && (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 12 }}>
                                {hijos.map((h) => (
                                  <button
                                    key={h.id}
                                    type="button"
                                    className="chip"
                                    onClick={() => onSeleccionar({ id: h.id, nombre: rutaDe(h) })}
                                  >
                                    › {h.nombre}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Sin términos</span>
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
