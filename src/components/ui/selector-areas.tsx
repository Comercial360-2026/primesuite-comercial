import { Fragment, useMemo, useState } from 'react';
import { type Area, esCategoriaSinClasificar, mismaArea } from '@/lib/vocabulario';
import {
  useCatalogoVocabulario,
  type TerminoVocabulario,
} from '@/hooks/use-catalogo-vocabulario';
import { proponerTermino } from '@/lib/proponer-termino';
import { Icono } from '@/components/ui/iconos';
import { sinAcentos } from '@/lib/texto';

interface SelectorAreasProps {
  seleccionadas: Area[];
  onCambio: (areas: Area[]) => void;
}

// Selector de "áreas" de un hallazgo (prompt maestro 11, Fase 2). Habla el
// mismo idioma que SelectorTermino —mismo catálogo, mismas rutas, mismos
// estilos `.selector-*`— pero:
//  - un área puede ser una CATEGORÍA entera ("Hardware") o un TÉRMINO
//    concreto ("MIFARE › DESFire EV2"),
//  - es MULTI: no se cierra al elegir, vas marcando y cada área marcada
//    aparece como chip con ✕ arriba,
//  - se muestran TODAS las categorías definidas (menos "Sin clasificar",
//    que es la bandeja de propuestas), aunque estén vacías: la categoría en
//    sí es una elección válida,
//  - el buscador casa también con el nombre de la categoría.
export function SelectorAreas({ seleccionadas, onCambio }: SelectorAreasProps) {
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [categoriaAbiertaId, setCategoriaAbiertaId] = useState<string | null>(null);
  const [proponiendo, setProponiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { categorias, terminos, porId, hijosPorPadre, primerNivelDe, rutaDe, partesRuta } =
    useCatalogoVocabulario();

  // Todas las categorías reales (fuera "Sin clasificar").
  const categoriasArea = useMemo(
    () => categorias.filter((c) => !esCategoriaSinClasificar(c.nombre)),
    [categorias]
  );
  const categoriaAbierta = categoriasArea.find((c) => c.id === categoriaAbiertaId) ?? null;

  const estaSel = (a: Area) => seleccionadas.some((s) => mismaArea(s, a));
  function alternar(a: Area) {
    onCambio(estaSel(a) ? seleccionadas.filter((s) => !mismaArea(s, a)) : [...seleccionadas, a]);
  }

  // La franja de arriba solo lleva TÉRMINOS: una categoría marcada ya se ve
  // (relleno + ✓) y se quita tocando su propio nombre en la rejilla de
  // abajo — repetirla aquí con una × aparte era la misma selección con dos
  // mecanismos distintos en la misma pantalla (Cesar: "¿por qué repetir
  // arriba lo que ya está marcado abajo?"). Un término no tiene ese sitio
  // fijo — solo aparece si lo buscas — así que sí necesita vivir aquí para
  // poder verse y quitarse.
  const terminosSeleccionados = seleccionadas.filter((a) => a.tipo === 'termino');

  const q = sinAcentos(textoBusqueda.trim());

  const categoriasEncontradas = q
    ? categoriasArea.filter((c) => sinAcentos(c.nombre).includes(q))
    : [];
  const terminosEncontrados = q
    ? terminos
        .filter((t) => {
          if (sinAcentos(t.nombre).includes(q)) return true;
          const padre = t.parent_id ? porId.get(t.parent_id) : undefined;
          return padre ? sinAcentos(padre.nombre).includes(q) : false;
        })
        .slice(0, 10)
    : [];
  const existeTerminoExacto = terminos.some((t) => sinAcentos(t.nombre) === q);

  // Elegir una coincidencia real del catálogo desde la lista de resultados:
  // marca/desmarca Y vacía la búsqueda, igual que `proponerYMarcar`. Vaciar
  // no es cosmético: si el texto se queda, sigue colgando debajo el botón
  // "+ Proponer … como término nuevo" para algo que acabas de encontrar en
  // el catálogo. Todo resultado de la lista pasa por aquí, no por `alternar`
  // a pelo (el árbol de categorías de abajo sí usa `alternar`: ahí no hay
  // búsqueda que vaciar).
  function elegirDeBusqueda(area: Area) {
    alternar(area);
    setTextoBusqueda('');
  }

  async function proponerYMarcar() {
    if (!textoBusqueda.trim()) return;
    setProponiendo(true);
    setError(null);
    try {
      const nuevo = await proponerTermino(textoBusqueda);
      onCambio([...seleccionadas, { tipo: 'termino', id: nuevo.id, nombre: nuevo.nombre }]);
      setTextoBusqueda('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo proponer el término.');
    } finally {
      setProponiendo(false);
    }
  }

  // Fila de opción dentro del árbol de una categoría — misma pinta que
  // `.selector-term`, con un ✓ delante cuando está marcada.
  const filaOpcion = (marcada: boolean, etiqueta: string, onClick: () => void, badge?: number) => (
    <button
      type="button"
      className="selector-term"
      onClick={onClick}
      style={marcada ? { fontWeight: 600 } : undefined}
    >
      {marcada && <Icono nombre="check" size={14} />}
      <span className="selector-term__n">{etiqueta}</span>
      {badge !== undefined && badge > 0 && <span className="fila__badge">{badge}</span>}
    </button>
  );

  const ramaModelos = (padre: TerminoVocabulario) => {
    const hijos = hijosPorPadre.get(padre.id) ?? [];
    if (hijos.length === 0) return null;
    return (
      <div className="selector-rama">
        {hijos.map((h) => {
          const area: Area = { tipo: 'termino', id: h.id, nombre: rutaDe(h) };
          return (
            <button
              key={h.id}
              type="button"
              className="selector-model"
              onClick={() => alternar(area)}
              style={estaSel(area) ? { fontWeight: 600 } : undefined}
            >
              {estaSel(area) && <Icono nombre="check" size={13} />} {h.nombre}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="card">
      {terminosSeleccionados.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          {terminosSeleccionados.map((a) => (
            <span
              key={`${a.tipo}:${a.id}`}
              className="chip chip--on"
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {a.nombre}
              <button
                type="button"
                onClick={() => alternar(a)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}
                aria-label={`quitar ${a.nombre}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="campo-busca">
        <Icono nombre="buscar" size={16} />
        <input
          className="field"
          value={textoBusqueda}
          onChange={(e) => setTextoBusqueda(e.target.value)}
          placeholder="buscar categoría, término o modelo…"
        />
      </div>

      {textoBusqueda.trim() ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8, maxHeight: 240, overflowY: 'auto' }}>
            {categoriasEncontradas.map((c) => {
              const area: Area = { tipo: 'categoria', id: c.id, nombre: c.nombre };
              return (
                <button
                  key={`cat-${c.id}`}
                  type="button"
                  className="selector-opt"
                  onClick={() => elegirDeBusqueda(area)}
                >
                  {estaSel(area) && <Icono nombre="check" size={13} />}{' '}
                  <span className="selector-opt__tail">{c.nombre}</span>
                  <span className="selector-opt__lead"> · categoría</span>
                </button>
              );
            })}
            {terminosEncontrados.map((t) => {
              const { lead, tail } = partesRuta(t);
              const area: Area = { tipo: 'termino', id: t.id, nombre: rutaDe(t) };
              return (
                <button
                  key={`ter-${t.id}`}
                  type="button"
                  className="selector-opt"
                  onClick={() => elegirDeBusqueda(area)}
                >
                  {estaSel(area) && <Icono nombre="check" size={13} />}{' '}
                  {lead && <span className="selector-opt__lead">{lead}</span>}
                  <span className="selector-opt__tail">{tail}</span>
                  {t.estado_gobierno === 'propuesto' && (
                    <span style={{ color: 'var(--ink-400)', fontSize: 11 }}> · pendiente</span>
                  )}
                </button>
              );
            })}
            {categoriasEncontradas.length === 0 && terminosEncontrados.length === 0 && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', padding: '6px 2px' }}>
                Sin coincidencias en el catálogo.
              </div>
            )}
          </div>
          {!existeTerminoExacto && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 8 }}
              disabled={proponiendo}
              onClick={proponerYMarcar}
            >
              {proponiendo ? 'Proponiendo…' : `+ Proponer "${textoBusqueda.trim()}" como término nuevo`}
            </button>
          )}
        </>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {categoriasArea.map((c) => {
              const abierta = categoriaAbiertaId === c.id;
              const area: Area = { tipo: 'categoria', id: c.id, nombre: c.nombre };
              const marcada = estaSel(area);
              // Tocar el NOMBRE marca/desmarca la categoría entera al
              // instante, sin preguntar nada — mismo gesto que
              // SelectorCategorias en Anotar (ya definido así con Cesar); la
              // pastillita ▾/▴ aparte es SOLO para bajar al árbol de
              // términos, un gesto independiente. Antes ambos gestos
              // compartían el mismo botón (tocar = abrir árbol) y la
              // categoría marcada además usaba la MISMA clase `chip--on` que
              // el estado "árbol abierto" — visualmente indistinguibles: al
              // quitar una categoría con su × pero dejar el árbol abierto,
              // el chip seguía viéndose "marcado" (relleno sólido + ✓) sin
              // estarlo. Ahora `chip--on` refleja SIEMPRE `marcada`, nunca
              // `abierta`; abierta es solo un contorno.
              return (
                <span
                  key={c.id}
                  className={`chip${marcada ? ' chip--on' : ''}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    outline: abierta ? '2px solid var(--brand-600)' : undefined,
                  }}
                >
                  <button
                    type="button"
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'inherit' }}
                    onClick={() => alternar(area)}
                  >
                    {c.nombre}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoriaAbiertaId(abierta ? null : c.id)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 0 0 2px', display: 'inline-flex', color: 'inherit', opacity: 0.7 }}
                    aria-label={abierta ? `ocultar términos de ${c.nombre}` : `ver términos de ${c.nombre}`}
                  >
                    <Icono nombre={abierta ? 'subir' : 'bajar'} size={11} />
                  </button>
                </span>
              );
            })}
          </div>

          {categoriaAbierta && (
            <div className="selector-pick">
              {(() => {
                const area: Area = {
                  tipo: 'categoria',
                  id: categoriaAbierta.id,
                  nombre: categoriaAbierta.nombre,
                };
                return filaOpcion(
                  estaSel(area),
                  `Toda la categoría «${categoriaAbierta.nombre}»`,
                  () => alternar(area)
                );
              })()}
              {primerNivelDe(categoriaAbierta.id).map((t) => {
                const hijos = hijosPorPadre.get(t.id) ?? [];
                const area: Area = { tipo: 'termino', id: t.id, nombre: t.nombre };
                return (
                  <Fragment key={t.id}>
                    {filaOpcion(estaSel(area), t.nombre, () => alternar(area), hijos.length)}
                    {ramaModelos(t)}
                  </Fragment>
                );
              })}
              {primerNivelDe(categoriaAbierta.id).length === 0 && (
                <div className="voc-rama__vacio">
                  Aún no hay términos en esta categoría. Puedes marcar la categoría entera, o
                  buscar arriba y proponer uno.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <div className="field-error-text" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
