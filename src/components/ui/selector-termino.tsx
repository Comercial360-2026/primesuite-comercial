import { Fragment, useMemo, useState } from 'react';
import { useCatalogoVocabulario } from '@/hooks/use-catalogo-vocabulario';
import { proponerTermino } from '@/lib/proponer-termino';
import { Icono } from '@/components/ui/iconos';
import { sinAcentos } from '@/lib/texto';

interface SelectorTerminoProps {
  onSeleccionar: (termino: { id: string; nombre: string }) => void;
  onCerrar?: () => void;
  titulo?: string;
}

// Componente único, reutilizado en los tres sitios donde se elige UN
// término (Detalle de Oportunidad ×2, y antes en Hallazgo rápido). Combina
// las dos vías: buscador arriba (para cuando sabes el nombre) + categorías
// desplegables debajo (para cuando no lo sabes) — mismo patrón categoría→
// términos de Cola de vocabulario. El catálogo y los helpers de ruta viven
// en `useCatalogoVocabulario` (compartidos con SelectorAreas).
//
// Jerarquía: un término puede tener modelos dentro (1 nivel: "MIFARE" ›
// "DESFire EV2"). Padre y modelo son tags independientes, los dos
// seleccionables. Al elegir un modelo, `nombre` lleva la ruta completa
// "MIFARE › DESFire EV2" — solo es etiqueta para mostrar (aguas abajo solo
// se usa el `id`).
export function SelectorTermino({ onSeleccionar, onCerrar, titulo }: SelectorTerminoProps) {
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [categoriaAbiertaId, setCategoriaAbiertaId] = useState<string | null>(null);
  const [proponiendo, setProponiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { categorias, terminos, porId, hijosPorPadre, primerNivelDe, rutaDe, partesRuta } =
    useCatalogoVocabulario();

  // Categorías con al menos un término de primer nivel, cada una con esos
  // términos ya resueltos. Las vacías no se muestran aquí (no hay nada que
  // elegir en ellas — el catálogo lo gestiona Dirección desde Vocabulario).
  const categoriasConTerminos = useMemo(
    () =>
      categorias
        .map((c) => ({ ...c, primerNivel: primerNivelDe(c.id) }))
        .filter((c) => c.primerNivel.length > 0),
    [categorias, primerNivelDe]
  );
  const categoriaAbierta = categoriasConTerminos.find((c) => c.id === categoriaAbiertaId) ?? null;

  // C4 · Comparación sin acentos: "desfire" encuentra "DESFire".
  const q = sinAcentos(textoBusqueda.trim());

  // El buscador casa por el nombre del término Y por el de su padre: buscar
  // "MIFARE" saca también sus modelos; buscar "DESFire" saca el modelo con
  // su ruta.
  const resultadosBusqueda = q
    ? terminos
        .filter((t) => {
          if (sinAcentos(t.nombre).includes(q)) return true;
          const padre = t.parent_id ? porId.get(t.parent_id) : undefined;
          return padre ? sinAcentos(padre.nombre).includes(q) : false;
        })
        .slice(0, 10)
    : [];

  const existeExacto = terminos.some((t) => sinAcentos(t.nombre) === q);

  async function proponerYSeleccionar() {
    if (!textoBusqueda.trim()) return;
    setProponiendo(true);
    setError(null);
    try {
      onSeleccionar(await proponerTermino(textoBusqueda));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo proponer el término.');
    } finally {
      setProponiendo(false);
    }
  }

  return (
    <div className="card">
      {titulo && <div className="label" style={{ marginTop: 0 }}>{titulo}</div>}
      <div className="campo-busca">
        <Icono nombre="buscar" size={16} />
        <input
          className="field"
          autoFocus
          value={textoBusqueda}
          onChange={(e) => setTextoBusqueda(e.target.value)}
          placeholder="buscar término o modelo…"
        />
      </div>

      {textoBusqueda.trim() ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
            {resultadosBusqueda.map((t) => {
              const { lead, tail } = partesRuta(t);
              return (
                <button
                  key={t.id}
                  type="button"
                  className="selector-opt"
                  onClick={() => onSeleccionar({ id: t.id, nombre: rutaDe(t) })}
                >
                  {lead && <span className="selector-opt__lead">{lead}</span>}
                  <span className="selector-opt__tail">{tail}</span>
                  {t.estado_gobierno === 'propuesto' && (
                    <span style={{ color: 'var(--ink-400)', fontSize: 11 }}> · pendiente</span>
                  )}
                </button>
              );
            })}
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
          {/* Todas las categorías en una fila que envuelve; el árbol de la
              que abras aparece DEBAJO de la fila entera, no intercalado
              entre los chips. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {categoriasConTerminos.map((c) => {
              const abierta = categoriaAbiertaId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`chip${abierta ? ' chip--on' : ''}`}
                  onClick={() => setCategoriaAbiertaId(abierta ? null : c.id)}
                >
                  {c.nombre} ({c.primerNivel.length})
                </button>
              );
            })}
          </div>

          {categoriaAbierta && (
            <div className="selector-pick">
              {categoriaAbierta.primerNivel.map((t) => {
                const hijos = hijosPorPadre.get(t.id) ?? [];
                return (
                  <Fragment key={t.id}>
                    <button
                      type="button"
                      className="selector-term"
                      onClick={() => onSeleccionar({ id: t.id, nombre: t.nombre })}
                    >
                      <span className="selector-term__n">{t.nombre}</span>
                      {hijos.length > 0 && <span className="fila__badge">{hijos.length}</span>}
                    </button>
                    {hijos.length > 0 && (
                      <div className="selector-rama">
                        {hijos.map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            className="selector-model"
                            onClick={() => onSeleccionar({ id: h.id, nombre: rutaDe(h) })}
                          >
                            {h.nombre}
                          </button>
                        ))}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}
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
