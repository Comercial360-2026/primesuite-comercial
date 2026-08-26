import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

interface TerminoPropuesto {
  id: string;
  nombre: string;
  categoria_id: string;
  categoria_nombre: string;
  propuesto_por_id: string | null;
  propuesto_por_nombre: string | null;
  fecha_propuesta: string | null;
  visita_origen_id: string | null;
}

interface TerminoCorporativo {
  id: string;
  nombre: string;
}

interface TerminoDelCatalogo {
  id: string;
  nombre: string;
  estado_gobierno: string;
}

interface CategoriaConTerminos {
  categoria_id: string;
  categoria_nombre: string;
  terminos: TerminoDelCatalogo[];
}

// Resuelve las propuestas de vocabulario semiabierto (pestaña "pendientes")
// y permite gestionar el catálogo completo (pestaña "catálogo completo"):
// crear/renombrar/borrar categorías, y añadir/mover/renombrar/quitar
// términos. Todo restringido a direccion_comercial vía RLS — ver
// 02_auth_rls.sql y 49_fix_termino_insert_direccion.sql.
//
// "Quitar" un término NO es un DELETE real — reutiliza el mecanismo ya
// existente de "descartar" (estado_gobierno = 'descartado'), para no
// romper referencias históricas en hallazgo/oportunidad_termino que ya
// puedan apuntar a ese término. Un DELETE real solo se usa para categorías
// vacías, donde no hay ese riesgo.
export function ColaVocabulario() {
  const queryClient = useQueryClient();

  const [vista, setVista] = useState<'pendientes' | 'catalogo'>('pendientes');

  // --- estado de la pestaña "pendientes" ---
  const [fusionandoId, setFusionandoId] = useState<string | null>(null);
  const [textoBusquedaFusion, setTextoBusquedaFusion] = useState('');
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- estado de la pestaña "catálogo completo" ---
  const [nuevaCategoriaTexto, setNuevaCategoriaTexto] = useState('');
  const [creandoCategoria, setCreandoCategoria] = useState(false);
  const [renombrandoCategoriaId, setRenombrandoCategoriaId] = useState<string | null>(null);
  const [textoRenombrarCategoria, setTextoRenombrarCategoria] = useState('');
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [renombrandoTerminoId, setRenombrandoTerminoId] = useState<string | null>(null);
  const [textoRenombrarTermino, setTextoRenombrarTermino] = useState('');
  const [moviendoTerminoId, setMoviendoTerminoId] = useState<string | null>(null);
  const [nuevoTerminoPorCategoria, setNuevoTerminoPorCategoria] = useState<Record<string, string>>({});

  const { data: propuestos, isLoading, isError } = useQuery({
    queryKey: ['terminos-propuestos'],
    // Este término puede proponerse desde otras pantallas (Hallazgo rápido,
    // Detalle de Oportunidad) que no saben nada de esta consulta y no
    // pueden invalidarla — hueco real detectado: "prueba 1" se creó bien,
    // pero la pantalla seguía mostrando la lista vieja de una visita
    // anterior a esta pestaña. Forzar la comprobación cada vez que se
    // entra a la pantalla es más fiable que depender de que otra pantalla
    // recuerde avisar a esta.
    refetchOnMount: 'always',
    queryFn: async (): Promise<TerminoPropuesto[]> => {
      const { data, error: err } = await supabase
        .from('termino')
        .select(
          'id, nombre, categoria_id, fecha_propuesta, visita_origen_id, propuesto_por_id, categoria:categoria_id(nombre), comercial:propuesto_por_id(nombre)'
        )
        .eq('estado_gobierno', 'propuesto')
        .order('fecha_propuesta', { ascending: true });
      if (err) throw err;
      return (data ?? []).map((t: any) => ({
        id: t.id,
        nombre: t.nombre,
        categoria_id: t.categoria_id,
        categoria_nombre: t.categoria?.nombre ?? '—',
        propuesto_por_id: t.propuesto_por_id,
        propuesto_por_nombre: t.comercial?.nombre ?? '—',
        fecha_propuesta: t.fecha_propuesta,
        visita_origen_id: t.visita_origen_id,
      }));
    },
  });

  const { data: catalogoCorporativo } = useQuery({
    queryKey: ['catalogo-corporativo'],
    enabled: fusionandoId !== null,
    queryFn: async (): Promise<TerminoCorporativo[]> => {
      const { data, error: err } = await supabase
        .from('termino')
        .select('id, nombre')
        .eq('estado_gobierno', 'corporativo')
        .order('nombre');
      if (err) throw err;
      return data ?? [];
    },
  });

  const { data: categorias } = useQuery({
    queryKey: ['categorias'],
    enabled: vista === 'catalogo',
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('categoria_vocabulario')
        .select('id, nombre')
        .order('nombre');
      if (err) throw err;
      return data ?? [];
    },
  });

  const { data: catalogoAgrupado, isLoading: cargandoCatalogo } = useQuery({
    queryKey: ['catalogo-completo-agrupado'],
    enabled: vista === 'catalogo',
    queryFn: async (): Promise<CategoriaConTerminos[]> => {
      const { data: cats, error: errCat } = await supabase
        .from('categoria_vocabulario')
        .select('id, nombre')
        .order('nombre');
      if (errCat) throw errCat;

      const { data: terminos, error: errTerm } = await supabase
        .from('termino')
        .select('id, nombre, categoria_id, estado_gobierno')
        .neq('estado_gobierno', 'descartado')
        .order('nombre');
      if (errTerm) throw errTerm;

      return (cats ?? []).map((c) => ({
        categoria_id: c.id,
        categoria_nombre: c.nombre,
        terminos: (terminos ?? [])
          .filter((t) => t.categoria_id === c.id)
          .map((t) => ({ id: t.id, nombre: t.nombre, estado_gobierno: t.estado_gobierno })),
      }));
    },
  });

  function invalidarCatalogo() {
    queryClient.invalidateQueries({ queryKey: ['catalogo-completo-agrupado'] });
    queryClient.invalidateQueries({ queryKey: ['categorias'] });
    queryClient.invalidateQueries({ queryKey: ['terminos-propuestos'] });
  }

  async function resolver(
    terminoId: string,
    accion: 'incorporar' | 'fusionar' | 'descartar',
    terminoDestinoId?: string
  ) {
    setProcesandoId(terminoId);
    setError(null);
    const { error: err } = await supabase.rpc('resolver_termino_propuesto', {
      p_termino_id: terminoId,
      p_accion: accion,
      p_termino_destino_id: terminoDestinoId ?? undefined,
    });
    setProcesandoId(null);
    if (err) {
      setError(err.message);
      return;
    }
    setFusionandoId(null);
    setTextoBusquedaFusion('');
    invalidarCatalogo();
  }

  // ---- gestión de categorías ----

  async function crearCategoria() {
    if (!nuevaCategoriaTexto.trim()) return;
    setErrorCatalogo(null);
    const { error: err } = await supabase
      .from('categoria_vocabulario')
      .insert({ nombre: nuevaCategoriaTexto.trim() });
    if (err) {
      setErrorCatalogo(err.message);
      return;
    }
    setNuevaCategoriaTexto('');
    setCreandoCategoria(false);
    invalidarCatalogo();
  }

  async function renombrarCategoria(id: string) {
    if (!textoRenombrarCategoria.trim()) return;
    setErrorCatalogo(null);
    const { error: err } = await supabase
      .from('categoria_vocabulario')
      .update({ nombre: textoRenombrarCategoria.trim() })
      .eq('id', id);
    if (err) {
      setErrorCatalogo(err.message);
      return;
    }
    setRenombrandoCategoriaId(null);
    invalidarCatalogo();
  }

  async function borrarCategoria(id: string, tieneTerminos: boolean) {
    if (tieneTerminos) {
      setErrorCatalogo('No se puede borrar: mueve o quita antes todos sus términos.');
      return;
    }
    setErrorCatalogo(null);
    const { error: err } = await supabase.from('categoria_vocabulario').delete().eq('id', id);
    if (err) {
      setErrorCatalogo(err.message);
      return;
    }
    invalidarCatalogo();
  }

  // ---- gestión de términos ----

  async function renombrarTermino(id: string) {
    if (!textoRenombrarTermino.trim()) return;
    setErrorCatalogo(null);
    const { error: err } = await supabase
      .from('termino')
      .update({ nombre: textoRenombrarTermino.trim() })
      .eq('id', id);
    if (err) {
      setErrorCatalogo(err.message);
      return;
    }
    setRenombrandoTerminoId(null);
    invalidarCatalogo();
  }

  async function moverTermino(id: string, nuevaCategoriaId: string) {
    setErrorCatalogo(null);
    const { error: err } = await supabase
      .from('termino')
      .update({ categoria_id: nuevaCategoriaId })
      .eq('id', id);
    if (err) {
      setErrorCatalogo(err.message);
      return;
    }
    setMoviendoTerminoId(null);
    invalidarCatalogo();
  }

  async function quitarTermino(id: string) {
    setErrorCatalogo(null);
    const { error: err } = await supabase.rpc('resolver_termino_propuesto', {
      p_termino_id: id,
      p_accion: 'descartar',
    });
    if (err) {
      setErrorCatalogo(err.message);
      return;
    }
    invalidarCatalogo();
  }

  async function crearTerminoDirecto(categoriaId: string) {
    const texto = (nuevoTerminoPorCategoria[categoriaId] ?? '').trim();
    if (!texto) return;
    setErrorCatalogo(null);
    const { error: err } = await supabase
      .from('termino')
      .insert({ nombre: texto, categoria_id: categoriaId, rol_funcional: 'ambos', estado_gobierno: 'corporativo' });
    if (err) {
      setErrorCatalogo(err.message);
      return;
    }
    setNuevoTerminoPorCategoria((prev) => ({ ...prev, [categoriaId]: '' }));
    invalidarCatalogo();
  }

  return (
    <div className="screen">
      <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>vocabulario</h1>

      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        <button
          type="button"
          className={`chip${vista === 'pendientes' ? ' chip--on' : ''}`}
          onClick={() => setVista('pendientes')}
        >
          pendientes{propuestos?.length ? ` (${propuestos.length})` : ''}
        </button>
        <button
          type="button"
          className={`chip${vista === 'catalogo' ? ' chip--on' : ''}`}
          onClick={() => setVista('catalogo')}
        >
          catálogo completo
        </button>
      </div>

      {vista === 'pendientes' ? (
        <>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', marginTop: 0 }}>
            Términos que comerciales han propuesto sobre la marcha, en espera de revisión.
          </p>

          {isLoading && <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando…</p>}
          {isError && (
            <div className="card card--riesgo">
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)' }}>
                No se pudo cargar la lista. Comprueba tu conexión.
              </div>
            </div>
          )}
          {error && <div className="field-error-text">{error}</div>}

          {!isLoading && !isError && !propuestos?.length && (
            <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>No hay términos pendientes de revisar.</p>
          )}

          {propuestos?.map((t) => (
            <div key={t.id} className="card">
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>{t.nombre}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 2 }}>
                categoría: {t.categoria_nombre} · propuesto por {t.propuesto_por_nombre}
                {t.fecha_propuesta && ` · ${new Date(t.fecha_propuesta).toLocaleDateString('es-ES')}`}
              </div>

              {fusionandoId === t.id ? (
                <div style={{ marginTop: 8 }}>
                  <input
                    className="field"
                    autoFocus
                    value={textoBusquedaFusion}
                    onChange={(e) => setTextoBusquedaFusion(e.target.value)}
                    placeholder="buscar término corporativo destino…"
                  />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, maxHeight: 140, overflowY: 'auto' }}>
                    {catalogoCorporativo
                      ?.filter(
                        (c) =>
                          textoBusquedaFusion.trim() &&
                          c.nombre.toLowerCase().includes(textoBusquedaFusion.trim().toLowerCase())
                      )
                      .slice(0, 8)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="chip"
                          disabled={procesandoId === t.id}
                          onClick={() => resolver(t.id, 'fusionar', c.id)}
                        >
                          {c.nombre}
                        </button>
                      ))}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginTop: 8 }}
                    onClick={() => { setFusionandoId(null); setTextoBusquedaFusion(''); }}
                  >
                    cancelar
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: 'auto', padding: '0 16px' }}
                    disabled={procesandoId === t.id}
                    onClick={() => resolver(t.id, 'incorporar')}
                  >
                    {procesandoId === t.id ? '…' : 'incorporar tal cual'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '0 16px' }}
                    disabled={procesandoId === t.id}
                    onClick={() => { setFusionandoId(t.id); setTextoBusquedaFusion(''); }}
                  >
                    fusionar con existente
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '0 16px', color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
                    disabled={procesandoId === t.id}
                    onClick={() => resolver(t.id, 'descartar')}
                  >
                    descartar
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      ) : (
        <>
          {errorCatalogo && <div className="field-error-text">{errorCatalogo}</div>}

          {!creandoCategoria ? (
            <button type="button" className="btn btn-secondary" onClick={() => setCreandoCategoria(true)}>
              + nueva categoría
            </button>
          ) : (
            <div className="card">
              <input
                className="field"
                autoFocus
                value={nuevaCategoriaTexto}
                onChange={(e) => setNuevaCategoriaTexto(e.target.value)}
                placeholder="nombre de la categoría nueva"
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setCreandoCategoria(false); setNuevaCategoriaTexto(''); }}>
                  cancelar
                </button>
                <button type="button" className="btn btn-primary" onClick={crearCategoria}>
                  crear
                </button>
              </div>
            </div>
          )}

          {cargandoCatalogo && <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando…</p>}

          {catalogoAgrupado?.map((cat) => (
            <div key={cat.categoria_id} className="card">
              {renombrandoCategoriaId === cat.categoria_id ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    className="field"
                    autoFocus
                    value={textoRenombrarCategoria}
                    onChange={(e) => setTextoRenombrarCategoria(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn btn-secondary" style={{ width: 'auto', padding: '0 10px' }} onClick={() => setRenombrandoCategoriaId(null)}>
                    cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: 'auto', padding: '0 10px' }}
                    onClick={() => renombrarCategoria(cat.categoria_id)}
                  >
                    guardar
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div className="label" style={{ marginTop: 0 }}>
                    {cat.categoria_nombre} ({cat.terminos.length})
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: 'auto', padding: '0 10px' }}
                      onClick={() => { setRenombrandoCategoriaId(cat.categoria_id); setTextoRenombrarCategoria(cat.categoria_nombre); }}
                    >
                      renombrar
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: 'auto', padding: '0 10px', color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
                      onClick={() => borrarCategoria(cat.categoria_id, cat.terminos.length > 0)}
                    >
                      borrar
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cat.terminos.map((t) => (
                  <div key={t.id}>
                    {renombrandoTerminoId === t.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          className="field"
                          autoFocus
                          value={textoRenombrarTermino}
                          onChange={(e) => setTextoRenombrarTermino(e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <button type="button" className="btn btn-secondary" style={{ width: 'auto', padding: '0 8px' }} onClick={() => setRenombrandoTerminoId(null)}>
                          cancelar
                        </button>
                        <button type="button" className="btn btn-primary" style={{ width: 'auto', padding: '0 8px' }} onClick={() => renombrarTermino(t.id)}>
                          guardar
                        </button>
                      </div>
                    ) : moviendoTerminoId === t.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'var(--text-sm)' }}>{t.nombre} →</span>
                        {categorias
                          ?.filter((c) => c.id !== cat.categoria_id)
                          .map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="chip"
                              onClick={() => moverTermino(t.id, c.id)}
                            >
                              {c.nombre}
                            </button>
                          ))}
                        <button type="button" className="btn btn-secondary" style={{ width: 'auto', padding: '0 8px' }} onClick={() => setMoviendoTerminoId(null)}>
                          cancelar
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 'var(--text-sm)' }}>
                          {t.nombre}
                          {t.estado_gobierno === 'propuesto' && (
                            <span style={{ color: 'var(--ink-400)', fontSize: 11 }}> · pendiente</span>
                          )}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ width: 'auto', padding: '0 8px', fontSize: 12 }}
                            onClick={() => { setRenombrandoTerminoId(t.id); setTextoRenombrarTermino(t.nombre); }}
                          >
                            renombrar
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ width: 'auto', padding: '0 8px', fontSize: 12 }}
                            onClick={() => setMoviendoTerminoId(t.id)}
                          >
                            mover
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ width: 'auto', padding: '0 8px', fontSize: 12, color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
                            onClick={() => quitarTermino(t.id)}
                          >
                            quitar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {!cat.terminos.length && (
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>sin términos</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <input
                  className="field"
                  value={nuevoTerminoPorCategoria[cat.categoria_id] ?? ''}
                  onChange={(e) =>
                    setNuevoTerminoPorCategoria((prev) => ({ ...prev, [cat.categoria_id]: e.target.value }))
                  }
                  placeholder="+ nuevo término en esta categoría…"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: 'auto', padding: '0 12px' }}
                  onClick={() => crearTerminoDirecto(cat.categoria_id)}
                >
                  añadir
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
