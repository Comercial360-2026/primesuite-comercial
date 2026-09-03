import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaAccion, type AccionFila } from '@/components/ui/fila-accion';
import { BarraSeleccion } from '@/components/ui/barra-seleccion';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { EstadoLista } from '@/components/ui/estado-lista';

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

// Resuelve las propuestas de vocabulario semiabierto (pestaña "Pendientes")
// y permite gestionar el catálogo completo (pestaña "catálogo completo"):
// crear/renombrar/borrar categorías, y añadir/mover/renombrar/quitar
// términos. Todo restringido a direccion_comercial vía RLS — ver
// 02_auth_rls.sql y 49_fix_termino_insert_direccion.sql.
//
// "Quitar" un término NO es un DELETE real — reutiliza el mecanismo ya
// existente de "Descartar" (estado_gobierno = 'descartado'), para no
// romper referencias históricas en hallazgo/oportunidad_termino que ya
// puedan apuntar a ese término. Un DELETE real solo se usa para categorías
// vacías, donde no hay ese riesgo.
export function ColaVocabulario() {
  const queryClient = useQueryClient();

  const [vista, setVista] = useState<'pendientes' | 'catalogo'>('pendientes');

  // --- estado de la pestaña "Pendientes" ---
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
  // Error pegado a una categoría concreta (borrar), para que se vea donde
  // has pulsado y no arriba del todo de una lista larga.
  const [errorPorCategoria, setErrorPorCategoria] = useState<{ id: string; msg: string } | null>(null);
  const [renombrandoTerminoId, setRenombrandoTerminoId] = useState<string | null>(null);
  const [textoRenombrarTermino, setTextoRenombrarTermino] = useState('');
  const [nuevoTerminoPorCategoria, setNuevoTerminoPorCategoria] = useState<Record<string, string>>({});

  // Categoría cuyo panel de "borrar" está abierto, y su nº REAL de términos
  // (incluye los descartados, que la lista oculta pero siguen referenciando
  // la categoría por la FK). null = todavía comprobando.
  const [borrandoCatId, setBorrandoCatId] = useState<string | null>(null);
  const [borrandoCatTotal, setBorrandoCatTotal] = useState<number | null>(null);

  // Categorías plegadas (solo se ve la cabecera). Vista, no dato: se pierde
  // al salir de la pantalla. En "modo seleccionar" se ignora (hay que ver
  // los términos para marcarlos).
  const [colapsadas, setColapsadas] = useState<Set<string>>(new Set());
  function alternarColapso(id: string) {
    setColapsadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  // --- modo seleccionar (catálogo): mover / quitar TÉRMINOS en lote ---
  const [seleccionandoCat, setSeleccionandoCat] = useState(false);
  const [marcadosTerm, setMarcadosTerm] = useState<Set<string>>(new Set());
  const [moverLoteAbierto, setMoverLoteAbierto] = useState(false);
  const [corriendoLote, setCorriendoLote] = useState(false);
  const [progresoLote, setProgresoLote] = useState<{ hecho: number; total: number } | null>(null);
  const [resultadoLote, setResultadoLote] = useState<string | null>(null);

  // --- modo ordenar (catálogo): reordenar las CATEGORÍAS a mano ---
  // `ordenLocal` es la lista de trabajo: las flechas la reordenan al
  // instante y cada movimiento persiste `orden` de todas las categorías de
  // una vez (upsert). Al salir el orden ya está guardado.
  const [ordenandoCat, setOrdenandoCat] = useState(false);
  const [ordenLocal, setOrdenLocal] = useState<{ id: string; nombre: string }[] | null>(null);
  const [guardandoOrden, setGuardandoOrden] = useState(false);

  const { data: propuestos, isLoading, isError, isPaused, refetch } = useQuery({
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
      type FilaPropuesta = Omit<TerminoPropuesto, 'categoria_nombre' | 'propuesto_por_nombre'> & {
        categoria: { nombre: string } | null;
        comercial: { nombre: string } | null;
      };
      return ((data ?? []) as unknown as FilaPropuesta[]).map((t) => ({
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
        .select('id, nombre, orden')
        .order('orden')
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
        .order('orden')
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
    // TODAS las claves que leen vocabulario, aquí y en otras pantallas
    // (SelectorTermino del hallazgo / oportunidad). Sin esto, renombrar o
    // mover un término aquí no llegaba al selector de Hallazgo.
    for (const k of [
      ['catalogo-completo-agrupado'],
      ['categorias'],
      ['terminos-propuestos'],
      ['catalogo-corporativo'],
      ['catalogo-terminos-selector'],
    ]) {
      queryClient.invalidateQueries({ queryKey: k });
    }
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
    // La nueva va al final: `orden` = el mayor que haya + 1 (así no compite
    // por el desempate alfabético con las que ya están ordenadas a mano).
    const ordenNueva = Math.max(0, ...(categorias ?? []).map((c) => c.orden ?? 0)) + 1;
    const { error: err } = await supabase
      .from('categoria_vocabulario')
      .insert({ nombre: nuevaCategoriaTexto.trim(), orden: ordenNueva });
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
    setErrorPorCategoria(null);
    const { error: err, count } = await supabase
      .from('categoria_vocabulario')
      .update({ nombre: textoRenombrarCategoria.trim() }, { count: 'exact' })
      .eq('id', id);
    if (err) {
      setErrorCatalogo(err.message);
      return;
    }
    if (!count) {
      setErrorCatalogo('No se ha podido guardar el cambio (0 filas afectadas). Solo Dirección Comercial puede editar el vocabulario.');
      return;
    }
    setRenombrandoCategoriaId(null);
    invalidarCatalogo();
  }

  function cerrarPanelBorrarCat() {
    setBorrandoCatId(null);
    setBorrandoCatTotal(null);
  }

  async function abrirPanelBorrarCat(id: string) {
    setErrorPorCategoria(null);
    setBorrandoCatId(id);
    setBorrandoCatTotal(null);
    // Cuenta REAL: incluye los descartados que la lista no enseña pero que
    // igualmente bloquean el DELETE por la FK.
    const { count } = await supabase
      .from('termino')
      .select('id', { count: 'exact', head: true })
      .eq('categoria_id', id);
    setBorrandoCatTotal(count ?? 0);
  }

  async function borrarCategoriaVacia(id: string) {
    setErrorPorCategoria(null);
    const { error: err, count } = await supabase
      .from('categoria_vocabulario')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (err) {
      setErrorPorCategoria({ id, msg: err.message });
      return;
    }
    if (!count) {
      setErrorPorCategoria({
        id,
        msg: 'No se ha podido borrar (0 filas afectadas). Solo Dirección Comercial puede editar el vocabulario.',
      });
      return;
    }
    cerrarPanelBorrarCat();
    invalidarCatalogo();
  }

  // Categoría con términos: no se puede borrar a secas (la FK es NOT NULL,
  // ON DELETE NO ACTION, y los términos no se borran nunca — pueden estar
  // referenciados por hallazgos/oportunidades). Así que primero pasan todos
  // a otra categoría y luego se borra la que queda vacía.
  async function borrarCategoriaTraspasando(id: string, destinoId: string) {
    setErrorPorCategoria(null);
    setCorriendoLote(true);
    const { error: errMover } = await supabase
      .from('termino')
      .update({ categoria_id: destinoId })
      .eq('categoria_id', id);
    if (errMover) {
      setCorriendoLote(false);
      setErrorPorCategoria({ id, msg: `No se han podido mover los términos: ${errMover.message}` });
      return;
    }
    const { error: errBorrar, count } = await supabase
      .from('categoria_vocabulario')
      .delete({ count: 'exact' })
      .eq('id', id);
    setCorriendoLote(false);
    if (errBorrar || !count) {
      setErrorPorCategoria({
        id,
        msg: 'Los términos se movieron, pero no se ha podido borrar la categoría. Solo Dirección Comercial puede editar el vocabulario.',
      });
      invalidarCatalogo();
      return;
    }
    cerrarPanelBorrarCat();
    invalidarCatalogo();
  }

  // ---- modo ordenar categorías ----

  function entrarOrden() {
    setOrdenandoCat(true);
    setOrdenLocal((categorias ?? []).map((c) => ({ id: c.id, nombre: c.nombre })));
    setErrorCatalogo(null);
    setSeleccionandoCat(false);
    setRenombrandoCategoriaId(null);
    setCreandoCategoria(false);
    cerrarPanelBorrarCat();
  }

  function salirOrden() {
    setOrdenandoCat(false);
    setOrdenLocal(null);
    invalidarCatalogo();
  }

  // Sube (dir=-1) o baja (dir=+1) la categoría de la posición `idx`. Mueve
  // la lista local al instante y guarda el `orden` de TODAS de una vez
  // (upsert): así el orden en BD siempre es 0..n-1 sin huecos ni empates.
  async function moverCat(idx: number, dir: -1 | 1) {
    if (!ordenLocal) return;
    const j = idx + dir;
    if (j < 0 || j >= ordenLocal.length) return;
    const next = [...ordenLocal];
    [next[idx], next[j]] = [next[j], next[idx]];
    setOrdenLocal(next);
    setGuardandoOrden(true);
    setErrorCatalogo(null);
    const { error: err } = await supabase
      .from('categoria_vocabulario')
      .upsert(
        next.map((c, i) => ({ id: c.id, nombre: c.nombre, orden: i })),
        { onConflict: 'id' }
      );
    setGuardandoOrden(false);
    if (err) {
      setErrorCatalogo(
        `No se ha podido guardar el orden: ${err.message}. Solo Dirección Comercial puede editar el vocabulario.`
      );
      return;
    }
    invalidarCatalogo();
  }

  // ---- gestión de términos ----

  async function renombrarTermino(id: string) {
    if (!textoRenombrarTermino.trim()) return;
    setErrorCatalogo(null);
    const { error: err, count } = await supabase
      .from('termino')
      .update({ nombre: textoRenombrarTermino.trim() }, { count: 'exact' })
      .eq('id', id);
    if (err) {
      setErrorCatalogo(err.message);
      return;
    }
    if (!count) {
      setErrorCatalogo('No se ha podido guardar el cambio (0 filas afectadas). Solo Dirección Comercial puede editar el vocabulario.');
      return;
    }
    setRenombrandoTerminoId(null);
    invalidarCatalogo();
  }

  // --- modo seleccionar: mover / quitar términos en lote ---

  function entrarSeleccionCat() {
    setSeleccionandoCat(true);
    setMarcadosTerm(new Set());
    setResultadoLote(null);
    setErrorCatalogo(null);
    setErrorPorCategoria(null);
    setRenombrandoTerminoId(null);
    setRenombrandoCategoriaId(null);
  }

  function salirSeleccionCat() {
    setSeleccionandoCat(false);
    setMarcadosTerm(new Set());
    setMoverLoteAbierto(false);
  }

  function alternarTerm(id: string) {
    setMarcadosTerm((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  // El lote = N × la operación individual, en bucle, con progreso y parte de
  // fallos parciales (08_sistema_diseno.md §"Modo seleccionar"). No hay RPC
  // de lote.
  async function quitarLote() {
    const ids = [...marcadosTerm];
    if (!ids.length) return;
    setCorriendoLote(true);
    setResultadoLote(null);
    setErrorCatalogo(null);
    let ok = 0;
    let fallo = 0;
    for (let i = 0; i < ids.length; i++) {
      setProgresoLote({ hecho: i, total: ids.length });
      const { error: err } = await supabase.rpc('resolver_termino_propuesto', {
        p_termino_id: ids[i],
        p_accion: 'descartar',
      });
      if (err) fallo++;
      else ok++;
    }
    setProgresoLote(null);
    setCorriendoLote(false);
    invalidarCatalogo();
    if (fallo) {
      setResultadoLote(`Quitados ${ok} · ${fallo} con error.`);
      setMarcadosTerm(new Set());
    } else {
      salirSeleccionCat();
    }
  }

  async function moverLote(categoriaId: string) {
    const ids = [...marcadosTerm];
    if (!ids.length) return;
    setCorriendoLote(true);
    setResultadoLote(null);
    setErrorCatalogo(null);
    let ok = 0;
    let fallo = 0;
    for (let i = 0; i < ids.length; i++) {
      setProgresoLote({ hecho: i, total: ids.length });
      const { error: err, count } = await supabase
        .from('termino')
        .update({ categoria_id: categoriaId }, { count: 'exact' })
        .eq('id', ids[i]);
      if (err || !count) fallo++;
      else ok++;
    }
    setProgresoLote(null);
    setCorriendoLote(false);
    setMoverLoteAbierto(false);
    invalidarCatalogo();
    if (fallo) {
      setResultadoLote(`Movidos ${ok} · ${fallo} con error (solo Dirección Comercial puede editar el vocabulario).`);
      setMarcadosTerm(new Set());
    } else {
      salirSeleccionCat();
    }
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
      <CabeceraDetalle titulo="Vocabulario" volverA="/yo" ayuda="cola-vocabulario" />

      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        <button
          type="button"
          className={`chip${vista === 'pendientes' ? ' chip--on' : ''}`}
          onClick={() => setVista('pendientes')}
        >
          Pendientes{propuestos?.length ? ` (${propuestos.length})` : ''}
        </button>
        <button
          type="button"
          className={`chip${vista === 'catalogo' ? ' chip--on' : ''}`}
          onClick={() => setVista('catalogo')}
        >
          Catálogo completo
        </button>
      </div>

      {vista === 'pendientes' ? (
        <>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', marginTop: 0 }}>
            Términos que comerciales han propuesto sobre la marcha, en espera de revisión.
          </p>

          {error && <div className="field-error-text">{error}</div>}

          {isLoading ? (
            <EstadoLista estado="cargando" />
          ) : isPaused && !propuestos ? (
            <EstadoLista estado="sin-conexion" onReintentar={() => refetch()} />
          ) : isError ? (
            <EstadoLista
              estado="error"
              mensaje="No se pudo cargar la lista. Comprueba tu conexión."
              onReintentar={() => refetch()}
            />
          ) : !propuestos?.length ? (
            <EstadoLista estado="vacio" mensaje="No hay términos pendientes de revisar." />
          ) : (
            <div className="lista-agrupada">
              <SeccionLista>
                {propuestos.map((t) => {
                  const meta =
                    `${t.categoria_nombre} · propuesto por ${t.propuesto_por_nombre}` +
                    (t.fecha_propuesta
                      ? ` · ${fechaCorta(t.fecha_propuesta)}`
                      : '');

                  if (fusionandoId === t.id) {
                    return (
                      <div key={t.id} className="fila-confirmacion">
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{t.nombre}</div>
                        <input
                          className="field"
                          autoFocus
                          style={{ marginTop: 6 }}
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
                          Cancelar
                        </button>
                      </div>
                    );
                  }

                  const acciones: AccionFila[] = [
                    {
                      icono: 'check',
                      etiqueta: 'Incorporar tal cual',
                      onClick: () => resolver(t.id, 'incorporar'),
                      disabled: procesandoId === t.id,
                    },
                    {
                      icono: 'fusionar',
                      etiqueta: 'Fusionar con un término existente',
                      onClick: () => { setFusionandoId(t.id); setTextoBusquedaFusion(''); },
                      disabled: procesandoId === t.id,
                    },
                    {
                      icono: 'borrar',
                      etiqueta: 'Descartar la propuesta',
                      tono: 'riesgo',
                      onClick: () => resolver(t.id, 'descartar'),
                      disabled: procesandoId === t.id,
                    },
                  ];

                  return (
                    <FilaAccion
                      key={t.id}
                      titulo={t.nombre}
                      subtitulo={procesandoId === t.id ? `${meta} · procesando…` : meta}
                      acciones={acciones}
                    />
                  );
                })}
              </SeccionLista>
            </div>
          )}
        </>
      ) : (
        <>
          {errorCatalogo && <div className="field-error-text">{errorCatalogo}</div>}
          {resultadoLote && <div className="field-error-text">{resultadoLote}</div>}

          {ordenandoCat ? (
            <div className="barra-seleccion">
              <span className="barra-seleccion__cuenta">
                {guardandoOrden ? 'Guardando…' : 'Ordena las categorías con las flechas'}
              </span>
              <div className="barra-seleccion__acciones">
                <button type="button" className="barra-seleccion__cancelar" onClick={salirOrden}>
                  Hecho
                </button>
              </div>
            </div>
          ) : seleccionandoCat ? (
            <BarraSeleccion
              n={marcadosTerm.size}
              onCancelar={salirSeleccionCat}
              acciones={[
                {
                  etiqueta:
                    corriendoLote && progresoLote
                      ? `Trabajando ${progresoLote.hecho} de ${progresoLote.total}…`
                      : `Mover a… (${marcadosTerm.size})`,
                  icono: 'mover',
                  onClick: () => setMoverLoteAbierto(true),
                  disabled: corriendoLote || marcadosTerm.size === 0,
                },
                {
                  etiqueta: corriendoLote ? 'Quitando…' : `Quitar (${marcadosTerm.size})`,
                  icono: 'borrar',
                  tono: 'riesgo',
                  onClick: quitarLote,
                  disabled: corriendoLote || marcadosTerm.size === 0,
                },
              ]}
            />
          ) : !creandoCategoria ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: 'auto', padding: '0 16px' }}
                onClick={() => setCreandoCategoria(true)}
              >
                + Nueva categoría
              </button>
              {(categorias?.length ?? 0) >= 2 && (
                <button type="button" className="chip" style={{ marginLeft: 'auto' }} onClick={entrarOrden}>
                  Ordenar
                </button>
              )}
              {!!catalogoAgrupado?.some((c) => c.terminos.length > 0) && (
                <button
                  type="button"
                  className="chip"
                  style={{ marginLeft: (categorias?.length ?? 0) >= 2 ? undefined : 'auto' }}
                  onClick={entrarSeleccionCat}
                >
                  Seleccionar
                </button>
              )}
            </div>
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
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" onClick={crearCategoria}>
                  Crear
                </button>
              </div>
            </div>
          )}

          {moverLoteAbierto && (
            <div className="card">
              <div className="label" style={{ marginTop: 0 }}>
                Mover {marcadosTerm.size} término{marcadosTerm.size === 1 ? '' : 's'} a:
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {categorias?.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="chip"
                    disabled={corriendoLote}
                    onClick={() => moverLote(c.id)}
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 8 }}
                onClick={() => setMoverLoteAbierto(false)}
              >
                Cancelar
              </button>
            </div>
          )}

          {cargandoCatalogo && <EstadoLista estado="cargando" />}

          {(() => {
            // En modo ordenar manda `ordenLocal` (movimiento al instante);
            // fuera de él, el orden que trae la consulta.
            const catsMostradas =
              ordenandoCat && ordenLocal
                ? ordenLocal
                    .map((o) => catalogoAgrupado?.find((c) => c.categoria_id === o.id))
                    .filter((c): c is CategoriaConTerminos => Boolean(c))
                : catalogoAgrupado;
            return (
          <div className="lista-agrupada">
            {catsMostradas?.map((cat, idxCat) => {
              // En "modo seleccionar" se ven siempre los términos.
              const colapsada = !seleccionandoCat && colapsadas.has(cat.categoria_id);
              return (
              <div key={cat.categoria_id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SeccionLista>
                  {/* Cabecera de la categoría: fila normal (más alta) con
                      chevron de plegar/desplegar, para que destaque frente a
                      los términos compactos. */}
                  {renombrandoCategoriaId === cat.categoria_id ? (
                    <div className="fila-confirmacion">
                      <input
                        className="field"
                        autoFocus
                        value={textoRenombrarCategoria}
                        onChange={(e) => setTextoRenombrarCategoria(e.target.value)}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button type="button" className="btn btn-secondary" onClick={() => setRenombrandoCategoriaId(null)}>
                          Cancelar
                        </button>
                        <button type="button" className="btn btn-primary" onClick={() => renombrarCategoria(cat.categoria_id)}>
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <FilaAccion
                      icono={colapsada ? 'chevron' : 'bajar'}
                      titulo={cat.categoria_nombre}
                      subtitulo={cat.terminos.length === 1 ? '1 término' : `${cat.terminos.length} términos`}
                      onClick={seleccionandoCat ? undefined : () => alternarColapso(cat.categoria_id)}
                      acciones={
                        ordenandoCat
                          ? ([
                              {
                                icono: 'subir',
                                etiqueta: 'Subir',
                                onClick: () => void moverCat(idxCat, -1),
                                disabled: idxCat === 0 || guardandoOrden,
                              },
                              {
                                icono: 'bajar',
                                etiqueta: 'Bajar',
                                onClick: () => void moverCat(idxCat, 1),
                                disabled: idxCat === (catsMostradas?.length ?? 0) - 1 || guardandoOrden,
                              },
                            ] as AccionFila[])
                          : seleccionandoCat
                          ? undefined
                          : ([
                              {
                                icono: 'editar',
                                etiqueta: 'Renombrar categoría',
                                onClick: () => {
                                  setErrorPorCategoria(null);
                                  setRenombrandoCategoriaId(cat.categoria_id);
                                  setTextoRenombrarCategoria(cat.categoria_nombre);
                                },
                              },
                              {
                                icono: 'borrar',
                                etiqueta: 'Borrar categoría',
                                tono: 'riesgo',
                                onClick: () => { setErrorPorCategoria(null); void abrirPanelBorrarCat(cat.categoria_id); },
                              },
                            ] as AccionFila[])
                      }
                    />
                  )}

                  {borrandoCatId === cat.categoria_id &&
                    (borrandoCatTotal === null ? (
                      <div className="card">
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Comprobando…</div>
                      </div>
                    ) : borrandoCatTotal === 0 ? (
                      <ConfirmacionBorrado
                        onCancelar={cerrarPanelBorrarCat}
                        onConfirmar={() => borrarCategoriaVacia(cat.categoria_id)}
                        cargando={corriendoLote}
                        error={errorPorCategoria?.id === cat.categoria_id ? errorPorCategoria.msg : undefined}
                        confirmar="Sí, borrar la categoría"
                      >
                        La categoría «{cat.categoria_nombre}» está vacía.
                      </ConfirmacionBorrado>
                    ) : (
                      <div className="card card--riesgo">
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
                          «{cat.categoria_nombre}» tiene {borrandoCatTotal} término
                          {borrandoCatTotal === 1 ? '' : 's'}
                          {borrandoCatTotal !== cat.terminos.length ? ' (algunos descartados que no se ven en la lista)' : ''}.
                          Elige a qué categoría pasan; después se borra esta.
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          {categorias
                            ?.filter((c) => c.id !== cat.categoria_id)
                            .map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                className="chip"
                                disabled={corriendoLote}
                                onClick={() => borrarCategoriaTraspasando(cat.categoria_id, c.id)}
                              >
                                {corriendoLote ? '…' : c.nombre}
                              </button>
                            ))}
                        </div>
                        {errorPorCategoria?.id === cat.categoria_id && (
                          <div className="field-error-text" style={{ marginTop: 8 }}>{errorPorCategoria.msg}</div>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ marginTop: 8 }}
                          disabled={corriendoLote}
                          onClick={cerrarPanelBorrarCat}
                        >
                          Cancelar
                        </button>
                      </div>
                    ))}

                  {borrandoCatId !== cat.categoria_id && errorPorCategoria?.id === cat.categoria_id && (
                    <div className="field-error-text" style={{ paddingInline: 'var(--fila-pad-x)' }}>
                      {errorPorCategoria.msg}
                    </div>
                  )}

                  {!colapsada && cat.terminos.map((t) => {
                    if (renombrandoTerminoId === t.id) {
                      return (
                        <div key={t.id} className="fila-confirmacion">
                          <input
                            className="field"
                            autoFocus
                            value={textoRenombrarTermino}
                            onChange={(e) => setTextoRenombrarTermino(e.target.value)}
                          />
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setRenombrandoTerminoId(null)}>
                              Cancelar
                            </button>
                            <button type="button" className="btn btn-primary" onClick={() => renombrarTermino(t.id)}>
                              Guardar
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <FilaAccion
                        key={t.id}
                        densidad="compacta"
                        titulo={t.nombre}
                        subtitulo={t.estado_gobierno === 'propuesto' ? 'pendiente de revisar' : undefined}
                        tono={t.estado_gobierno === 'propuesto' ? 'aviso' : 'neutral'}
                        seleccion={
                          seleccionandoCat
                            ? { activa: true, marcada: marcadosTerm.has(t.id), onToggle: () => alternarTerm(t.id) }
                            : undefined
                        }
                        acciones={
                          seleccionandoCat || ordenandoCat
                            ? undefined
                            : [
                                {
                                  icono: 'editar',
                                  etiqueta: 'Renombrar término',
                                  onClick: () => {
                                    setRenombrandoTerminoId(t.id);
                                    setTextoRenombrarTermino(t.nombre);
                                  },
                                },
                              ]
                        }
                      />
                    );
                  })}

                  {!colapsada && !cat.terminos.length && (
                    <FilaAccion densidad="compacta" titulo="Sin términos" tono="neutral" />
                  )}
                </SeccionLista>

                {!colapsada && !seleccionandoCat && !ordenandoCat && (
                  <div style={{ display: 'flex', gap: 6, paddingInline: 'var(--fila-pad-x)' }}>
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
                      Añadir
                    </button>
                  </div>
                )}
              </div>
              );
            })}
          </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
