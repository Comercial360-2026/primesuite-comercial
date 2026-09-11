import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { capitalizarFrase } from '@/lib/texto';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { Segmentado } from '@/components/ui/segmentado';
import { useBuscador, BotonBuscar, CampoBuscar } from '@/components/ui/buscador';
import { FilaAccion, type AccionFila } from '@/components/ui/fila-accion';
import { BarraSeleccion } from '@/components/ui/barra-seleccion';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Icono } from '@/components/ui/iconos';
import { esCategoriaSinClasificar } from '@/lib/vocabulario';

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

interface TerminoNodo {
  id: string;
  nombre: string;
  estado_gobierno: string;
  categoria_id: string;
  orden: number;
  parent_id: string | null;
  rol_funcional: string;
  /** Nº de hallazgos + oportunidades que ya lo usan (para avisar antes de
   *  renombrar / descartar / mover). */
  usos: number;
  /** Modelos que cuelgan de este término. Solo los de primer nivel los tienen. */
  hijos: TerminoNodo[];
}

interface CategoriaConTerminos {
  categoria_id: string;
  categoria_nombre: string;
  /** Solo términos de primer nivel; sus modelos van en `.hijos`. */
  terminos: TerminoNodo[];
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

  const [vista, setVista] = useState<'pendientes' | 'catalogo'>('catalogo');

  // --- estado de la pestaña "Pendientes" ---
  const [fusionandoId, setFusionandoId] = useState<string | null>(null);
  const [textoBusquedaFusion, setTextoBusquedaFusion] = useState('');
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Contexto de una propuesta (auditoría 2026-09-05: la fila no llevaba a
  // ningún sitio, no había forma de ver de dónde salió el término antes de
  // decidir). Se despliega inline, sin pantalla nueva: cliente/fecha de la
  // visita donde se propuso + el hallazgo que lo usa, si ya existe.
  const [contextoAbiertoId, setContextoAbiertoId] = useState<string | null>(null);

  // Modo seleccionar de "Pendientes": marcar propuestas y aprobar /
  // descartar en lote, o fusionar una sola. Mismo patrón que el catálogo.
  const [seleccionandoPend, setSeleccionandoPend] = useState(false);
  const [marcadosPend, setMarcadosPend] = useState<Set<string>>(new Set());
  const [corriendoPend, setCorriendoPend] = useState(false);
  const [progresoPend, setProgresoPend] = useState<{ hecho: number; total: number } | null>(null);
  const [resultadoPend, setResultadoPend] = useState<string | null>(null);
  // "Aprobar en…": al aprobar propuestas, elegir en qué categoría quedan
  // (las propuestas sobre la marcha nacen en "Sin clasificar").
  const [aprobarEnAbierto, setAprobarEnAbierto] = useState(false);

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
  // "+ modelo dentro de X": texto por id de término padre.
  const [nuevoModeloPorPadre, setNuevoModeloPorPadre] = useState<Record<string, string>>({});
  // El campo de "+ término"/"+ modelo" no vive siempre abierto (ensuciaría
  // toda categoría/término vacíos con una caja de texto permanente) — se
  // revela solo al tocar la fila "+ Añadir…", una categoría o un término a
  // la vez. Se cierra sola al plegar/cambiar de vista (efectos más abajo).
  const [categoriaAnadiendoTermino, setCategoriaAnadiendoTermino] = useState<string | null>(null);
  const [terminoAnadiendoModelo, setTerminoAnadiendoModelo] = useState<string | null>(null);
  // Menú "⋯" de una categoría (Añadir término / Editar / Borrar): un solo
  // icono genérico, igual en todas las categorías — nada de enlaces de
  // texto repetidos fila a fila, que con muchas categorías ensucian la
  // vista. Una sola categoría con el menú abierto a la vez.
  const [menuCategoriaId, setMenuCategoriaId] = useState<string | null>(null);
  // Buscador del catálogo: filtra términos/modelos y abre las ramas que casan.
  const [busqueda, setBusqueda] = useState('');
  const buscador = useBuscador(!!busqueda);

  // Categoría cuyo panel de "borrar" está abierto, y su nº REAL de términos
  // (incluye los descartados, que la lista oculta pero siguen referenciando
  // la categoría por la FK). null = todavía comprobando.
  const [borrandoCatId, setBorrandoCatId] = useState<string | null>(null);
  const [borrandoCatTotal, setBorrandoCatTotal] = useState<number | null>(null);

  // Al entrar, todas las categorías van plegadas (solo cabecera); se
  // guardan aquí las que el usuario despliega a mano. Vista, no dato: se
  // pierde al salir de la pantalla. En "modo seleccionar" se ignora (hay
  // que ver los términos para marcarlos).
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  function alternarColapso(id: string) {
    setExpandidas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }
  // Todo lo que se puede desplegar: cada categoría + cada término que tiene
  // modelos dentro. Se usa para "Desplegar / plegar todo" y para entrar en
  // los modos ordenar/seleccionar con el árbol abierto.
  function idsDesplegables(): string[] {
    return [
      ...(catalogoAgrupado?.map((c) => c.categoria_id) ?? []),
      ...(catalogoAgrupado?.flatMap((c) => c.terminos.filter((t) => t.hijos.length).map((t) => t.id)) ?? []),
    ];
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

  const propuestaAbierta = propuestos?.find((t) => t.id === contextoAbiertoId) ?? null;
  const { data: contextoTermino, isLoading: cargandoContexto } = useQuery({
    queryKey: ['contexto-termino-propuesto', contextoAbiertoId],
    enabled: !!contextoAbiertoId,
    queryFn: async () => {
      const [visita, hallazgos] = await Promise.all([
        propuestaAbierta?.visita_origen_id
          ? supabase
              .from('visita')
              .select('fecha, cliente:cliente_id(nombre)')
              .eq('id', propuestaAbierta.visita_origen_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        // Los hallazgos que usan este término van por la tabla puente
        // `hallazgo_area` (prompt maestro 11, Fase 2).
        supabase
          .from('hallazgo_area')
          .select('hallazgo:hallazgo_id(id, nota, creado_en, comercial:comercial_autor_id(nombre))')
          .eq('termino_id', contextoAbiertoId!),
      ]);
      if (visita.error) throw visita.error;
      if (hallazgos.error) throw hallazgos.error;
      type VisitaContexto = { fecha: string; cliente: { nombre: string } | null } | null;
      type HallazgoContexto = { id: string; nota: string | null; creado_en: string; comercial: { nombre: string } | null };
      const hallazgosContexto = ((hallazgos.data ?? []) as unknown as { hallazgo: HallazgoContexto | null }[])
        .map((f) => f.hallazgo)
        .filter((h): h is HallazgoContexto => h !== null)
        .sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1));
      return {
        visita: visita.data as unknown as VisitaContexto,
        hallazgos: hallazgosContexto,
      };
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
    // También en "Pendientes" al seleccionar: "Aprobar en…" necesita la
    // lista de categorías destino.
    enabled: vista === 'catalogo' || seleccionandoPend,
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
      const [cats, terms, usoH, usoO] = await Promise.all([
        supabase.from('categoria_vocabulario').select('id, nombre').order('orden').order('nombre'),
        supabase
          .from('termino')
          .select('id, nombre, categoria_id, parent_id, orden, rol_funcional, estado_gobierno')
          .neq('estado_gobierno', 'descartado')
          .order('orden')
          .order('nombre'),
        // Uso en hallazgos: por la tabla puente `hallazgo_area` (prompt
        // maestro 11, Fase 2); solo cuentan las filas de tipo término.
        supabase.from('hallazgo_area').select('termino_id').not('termino_id', 'is', null),
        supabase.from('oportunidad_termino').select('termino_id'),
      ]);
      if (cats.error) throw cats.error;
      if (terms.error) throw terms.error;

      // Recuento de uso: cuántos hallazgos + oportunidades apuntan a cada término.
      const usos = new Map<string, number>();
      for (const r of [...(usoH.data ?? []), ...(usoO.data ?? [])]) {
        const id = (r as { termino_id: string | null }).termino_id;
        if (id) usos.set(id, (usos.get(id) ?? 0) + 1);
      }

      const nodos: TerminoNodo[] = (terms.data ?? []).map((t) => ({
        id: t.id,
        nombre: t.nombre,
        estado_gobierno: t.estado_gobierno,
        categoria_id: t.categoria_id,
        orden: t.orden ?? 0,
        parent_id: t.parent_id,
        rol_funcional: t.rol_funcional,
        usos: usos.get(t.id) ?? 0,
        hijos: [],
      }));
      const porId = new Map(nodos.map((n) => [n.id, n]));
      const primerNivel: TerminoNodo[] = [];
      for (const n of nodos) {
        const padre = n.parent_id ? porId.get(n.parent_id) : undefined;
        if (padre) padre.hijos.push(n);
        else primerNivel.push(n); // sin padre, o padre descartado → sube a primer nivel
      }
      // El orden ya viene de la consulta (orden, nombre) para hermanos y modelos.

      return (cats.data ?? []).map((c) => ({
        categoria_id: c.id,
        categoria_nombre: c.nombre,
        terminos: primerNivel.filter((t) => t.categoria_id === c.id),
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

  // Busca un nombre ya existente en el catálogo (término o modelo), sin
  // distinguir mayúsculas. Solo para AVISAR al crear, no bloquea.
  function nombreDuplicado(texto: string): string | null {
    const n = texto.trim().toLowerCase();
    if (!n) return null;
    for (const c of catalogoAgrupado ?? []) {
      for (const t of c.terminos) {
        if (t.nombre.trim().toLowerCase() === n) return c.categoria_nombre;
        for (const h of t.hijos) {
          if (h.nombre.trim().toLowerCase() === n) return `${c.categoria_nombre} › ${t.nombre}`;
        }
      }
    }
    return null;
  }
  function categoriaDuplicada(texto: string): boolean {
    const n = texto.trim().toLowerCase();
    return !!n && (categorias ?? []).some((c) => c.nombre.trim().toLowerCase() === n);
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
    setMarcadosPend(new Set());
    invalidarCatalogo();
  }

  // ---- modo seleccionar de "Pendientes" ----

  function entrarSeleccionPend() {
    setSeleccionandoPend(true);
    setMarcadosPend(new Set());
    setResultadoPend(null);
    setError(null);
    setFusionandoId(null);
    setAprobarEnAbierto(false);
    setContextoAbiertoId(null);
  }
  function salirSeleccionPend() {
    setSeleccionandoPend(false);
    setMarcadosPend(new Set());
    setFusionandoId(null);
    setAprobarEnAbierto(false);
  }
  function alternarPend(id: string) {
    setMarcadosPend((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  // Lote = N × la RPC individual, en bucle, con progreso y parte de fallos
  // (igual que quitarLote / moverLote del catálogo). Al aprobar
  // ("incorporar") se puede pasar `destinoCategoriaId` para recolocar cada
  // término antes de aprobarlo — el uso típico es sacarlos de "Sin
  // clasificar" a su categoría definitiva.
  async function resolverLote(accion: 'incorporar' | 'descartar', destinoCategoriaId?: string) {
    const ids = [...marcadosPend];
    if (!ids.length) return;
    setCorriendoPend(true);
    setResultadoPend(null);
    setError(null);
    setAprobarEnAbierto(false);
    let ok = 0;
    let fallo = 0;
    for (let i = 0; i < ids.length; i++) {
      setProgresoPend({ hecho: i, total: ids.length });
      if (accion === 'incorporar' && destinoCategoriaId) {
        // Sin comprobar `count`, un UPDATE bloqueado por RLS "tendría
        // éxito" con 0 filas — el término seguiría en "Sin clasificar" pero
        // la RPC de abajo lo marcaría igualmente como incorporado.
        const { error: errMover, count } = await supabase
          .from('termino')
          .update({ categoria_id: destinoCategoriaId }, { count: 'exact' })
          .eq('id', ids[i]);
        if (errMover || !count) {
          fallo++;
          continue;
        }
      }
      const { error: err } = await supabase.rpc('resolver_termino_propuesto', {
        p_termino_id: ids[i],
        p_accion: accion,
      });
      if (err) fallo++;
      else ok++;
    }
    setProgresoPend(null);
    setCorriendoPend(false);
    invalidarCatalogo();
    if (fallo) {
      setResultadoPend(`${accion === 'incorporar' ? 'Aprobados' : 'Descartados'} ${ok} · ${fallo} con error.`);
      setMarcadosPend(new Set());
    } else {
      salirSeleccionPend();
    }
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
    setRenombrandoTerminoId(null);
    setCreandoCategoria(false);
    setCategoriaAnadiendoTermino(null);
    setMenuCategoriaId(null);
    setTerminoAnadiendoModelo(null);
    setBusqueda('');
    cerrarPanelBorrarCat();
    // Con todo desplegado se ven las flechas de términos y modelos.
    setExpandidas(new Set(idsDesplegables()));
  }

  function salirOrden() {
    setOrdenandoCat(false);
    setOrdenLocal(null);
    setExpandidas(new Set());
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
    setCategoriaAnadiendoTermino(null);
    setMenuCategoriaId(null);
    setTerminoAnadiendoModelo(null);
    setBusqueda('');
    // Se entra con todo desplegado (categorías y términos con modelos) para
    // poder marcar; se puede plegar lo que no interese.
    setExpandidas(new Set(idsDesplegables()));
  }

  function salirSeleccionCat() {
    setSeleccionandoCat(false);
    setMarcadosTerm(new Set());
    setMoverLoteAbierto(false);
    // Al salir, todo vuelve a plegado (en "seleccionar" se enseñan todos
    // los términos; si no se resetea, las categorías se quedan abiertas).
    setExpandidas(new Set());
  }

  // Cambiar de pestaña deja SIEMPRE la pantalla limpia: sin modos activos
  // y con las categorías plegadas.
  function cambiarVista(v: 'pendientes' | 'catalogo') {
    setVista(v);
    setSeleccionandoCat(false);
    setSeleccionandoPend(false);
    setOrdenandoCat(false);
    setOrdenLocal(null);
    setMarcadosTerm(new Set());
    setMarcadosPend(new Set());
    setContextoAbiertoId(null);
    setExpandidas(new Set());
    setAprobarEnAbierto(false);
    setCategoriaAnadiendoTermino(null);
    setMenuCategoriaId(null);
    setTerminoAnadiendoModelo(null);
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
    // Descartar un término padre arrastra sus modelos.
    const marcados = new Set(marcadosTerm);
    for (const c of catalogoAgrupado ?? []) {
      for (const t of c.terminos) {
        if (marcados.has(t.id)) for (const h of t.hijos) marcados.add(h.id);
      }
    }
    const ids = [...marcados];
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

  // Destino de "Mover a…": una categoría (el término pasa a primer nivel) o
  // un término padre (el término se anida como modelo). El trigger de BD
  // rechaza anidar un término que ya tiene modelos; aquí esas opciones
  // salen deshabilitadas para no llegar al error.
  async function moverLote(destino: { categoriaId: string } | { parentId: string }) {
    const ids = [...marcadosTerm];
    if (!ids.length) return;
    setCorriendoLote(true);
    setResultadoLote(null);
    setErrorCatalogo(null);
    const payload =
      'parentId' in destino
        ? { parent_id: destino.parentId }
        : { parent_id: null as string | null, categoria_id: destino.categoriaId };
    let ok = 0;
    let fallo = 0;
    for (let i = 0; i < ids.length; i++) {
      setProgresoLote({ hecho: i, total: ids.length });
      const { error: err, count } = await supabase
        .from('termino')
        .update(payload, { count: 'exact' })
        .eq('id', ids[i]);
      if (err || !count) fallo++;
      else ok++;
    }
    setProgresoLote(null);
    setCorriendoLote(false);
    setMoverLoteAbierto(false);
    invalidarCatalogo();
    if (fallo) {
      setResultadoLote(`Movidos ${ok} · ${fallo} con error (revisa que no anides un término que ya tiene modelos).`);
      setMarcadosTerm(new Set());
    } else {
      salirSeleccionCat();
    }
  }

  async function crearTerminoDirecto(categoriaId: string) {
    const texto = (nuevoTerminoPorCategoria[categoriaId] ?? '').trim();
    if (!texto) return;
    setErrorCatalogo(null);
    const cat = (catalogoAgrupado ?? []).find((c) => c.categoria_id === categoriaId);
    const ordenNuevo = Math.max(-1, ...(cat?.terminos ?? []).map((t) => t.orden)) + 1;
    const { error: err } = await supabase.from('termino').insert({
      nombre: texto,
      categoria_id: categoriaId,
      rol_funcional: 'ambos',
      estado_gobierno: 'corporativo',
      orden: ordenNuevo,
    });
    if (err) {
      setErrorCatalogo(err.message);
      return;
    }
    setNuevoTerminoPorCategoria((prev) => ({ ...prev, [categoriaId]: '' }));
    invalidarCatalogo();
  }

  // Crea un modelo colgando de un término padre. Hereda su categoría (lo
  // fuerza también el trigger) y su rol_funcional; nace corporativo.
  async function crearModelo(padre: TerminoNodo) {
    const texto = (nuevoModeloPorPadre[padre.id] ?? '').trim();
    if (!texto) return;
    setErrorCatalogo(null);
    const ordenNuevo = Math.max(-1, ...padre.hijos.map((h) => h.orden)) + 1;
    const { error: err } = await supabase.from('termino').insert({
      nombre: texto,
      categoria_id: padre.categoria_id,
      parent_id: padre.id,
      rol_funcional: padre.rol_funcional,
      estado_gobierno: 'corporativo',
      orden: ordenNuevo,
    });
    if (err) {
      setErrorCatalogo(err.message);
      return;
    }
    setNuevoModeloPorPadre((prev) => ({ ...prev, [padre.id]: '' }));
    invalidarCatalogo();
  }

  // Reordena un grupo de hermanos (términos de una categoría, o modelos de
  // un padre) reescribiendo `orden` = 0..n-1 de golpe (como moverCat).
  async function moverTermino(grupo: TerminoNodo[], t: TerminoNodo, dir: -1 | 1) {
    const idx = grupo.findIndex((x) => x.id === t.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= grupo.length) return;
    const next = [...grupo];
    [next[idx], next[j]] = [next[j], next[idx]];
    setGuardandoOrden(true);
    setErrorCatalogo(null);
    const { error: err } = await supabase.from('termino').upsert(
      next.map((x, i) => ({
        id: x.id,
        nombre: x.nombre,
        categoria_id: x.categoria_id,
        rol_funcional: x.rol_funcional,
        orden: i,
      })),
      { onConflict: 'id' }
    );
    setGuardandoOrden(false);
    if (err) {
      setErrorCatalogo(`No se ha podido guardar el orden: ${err.message}`);
      return;
    }
    invalidarCatalogo();
  }

  // --- buscador del catálogo ---
  const q = busqueda.trim().toLowerCase();
  const buscando = q.length > 0;
  const casa = (t: TerminoNodo) => t.nombre.toLowerCase().includes(q);
  function filtrarCats(cats: CategoriaConTerminos[]): CategoriaConTerminos[] {
    if (!buscando) return cats;
    return cats
      .map((c) => ({
        ...c,
        terminos: c.terminos
          .map((t) => (casa(t) ? t : { ...t, hijos: t.hijos.filter(casa) }))
          .filter((t) => casa(t) || t.hijos.length > 0),
      }))
      .filter((c) => c.terminos.length > 0 || c.categoria_nombre.toLowerCase().includes(q));
  }

  // Fila de un término: primer nivel o modelo (recursivo, 1 nivel).
  //  - término (esModelo=false): fila blanca normal; si tiene modelos,
  //    insignia con el número y chevron para plegar su rama.
  //  - modelo (esModelo=true): cuelga de `.voc-rama` (raíl vertical),
  //    texto menor y en gris; al buscar, lleva la ruta "Padre › Modelo".
  function filaTermino(t: TerminoNodo, grupo: TerminoNodo[], esModelo: boolean, padreNombre?: string) {
    if (renombrandoTerminoId === t.id) {
      return (
        <div key={t.id} className="fila-confirmacion">
          <input
            className="field"
            autoFocus
            value={textoRenombrarTermino}
            onChange={(e) => setTextoRenombrarTermino(e.target.value)}
          />
          {t.usos > 0 && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
              Se usa en {t.usos} {t.usos === 1 ? 'ficha' : 'fichas'} ya guardadas; el nombre cambia también ahí.
            </div>
          )}
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
    const tieneModelos = t.hijos.length > 0;
    // Cualquier término de primer nivel se puede desplegar para meterle
    // modelos (aunque aún no tenga ninguno). Un modelo, nunca (1 nivel).
    const desplegable = !esModelo;
    const plegado = desplegable && !buscando && !expandidas.has(t.id);
    const idx = grupo.findIndex((x) => x.id === t.id);
    const sub =
      [
        t.estado_gobierno === 'propuesto' ? 'pendiente de revisar' : null,
        t.usos > 0 ? `en ${t.usos} ${t.usos === 1 ? 'ficha' : 'fichas'}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined;
    const avisoModelo = desplegable ? nombreDuplicado(nuevoModeloPorPadre[t.id] ?? '') : null;
    // El campo "+ modelo dentro de X…" solo cuando no estás en un modo.
    const modoEdicionModelos = !seleccionandoCat && !ordenandoCat && !buscando;
    // Al buscar, un modelo se muestra con su ruta para no quedar suelto.
    const titulo = esModelo && buscando && padreNombre ? `${padreNombre} › ${t.nombre}` : t.nombre;

    return (
      <Fragment key={t.id}>
        <FilaAccion
          densidad={esModelo ? 'compacta' : 'normal'}
          icono={desplegable ? (plegado ? 'chevron' : 'bajar') : undefined}
          titulo={titulo}
          subtitulo={sub}
          badge={!esModelo && tieneModelos ? String(t.hijos.length) : undefined}
          tono={t.estado_gobierno === 'propuesto' ? 'aviso' : 'neutral'}
          onClick={desplegable && !seleccionandoCat && !buscando ? () => alternarColapso(t.id) : undefined}
          seleccion={
            seleccionandoCat
              ? { activa: true, marcada: marcadosTerm.has(t.id), onToggle: () => alternarTerm(t.id) }
              : undefined
          }
          acciones={
            ordenandoCat && !buscando
              ? ([
                  {
                    icono: 'subir',
                    etiqueta: 'Subir',
                    onClick: () => void moverTermino(grupo, t, -1),
                    disabled: idx <= 0 || guardandoOrden,
                  },
                  {
                    icono: 'bajar',
                    etiqueta: 'Bajar',
                    onClick: () => void moverTermino(grupo, t, 1),
                    disabled: idx === grupo.length - 1 || guardandoOrden,
                  },
                ] as AccionFila[])
              : undefined
          }
        />
        {/* La rama solo se pinta si hay algo dentro: modelos, o el campo para
            añadir el primero. Sin esto, un término vacío en modo
            Seleccionar/Ordenar/búsqueda dejaría un raíl huérfano. */}
        {desplegable && !plegado && (tieneModelos || modoEdicionModelos) && (
          <div className="voc-rama">
            {t.hijos.map((h) => filaTermino(h, t.hijos, true, t.nombre))}
            {modoEdicionModelos && (
              <>
                {!tieneModelos && <div className="voc-rama__vacio">Aún no tiene modelos.</div>}
                {terminoAnadiendoModelo === t.id ? (
                  <div className="voc-fila-input">
                    <input
                      className="field"
                      autoFocus
                      value={nuevoModeloPorPadre[t.id] ?? ''}
                      onChange={(e) => setNuevoModeloPorPadre((p) => ({ ...p, [t.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') crearModelo(t); }}
                      placeholder={`+ modelo dentro de ${t.nombre}…`}
                    />
                    <button
                      type="button"
                      className="boton-icono"
                      aria-label="Añadir modelo"
                      title="Añadir modelo"
                      disabled={!(nuevoModeloPorPadre[t.id] ?? '').trim()}
                      onClick={() => crearModelo(t)}
                    >
                      <Icono nombre="mas" size={18} />
                    </button>
                    <button
                      type="button"
                      className="campo-cerrar"
                      aria-label="Cancelar"
                      onClick={() => setTerminoAnadiendoModelo(null)}
                    >
                      <Icono nombre="error" size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="voc-fila-add"
                    onClick={() => setTerminoAnadiendoModelo(t.id)}
                  >
                    <Icono nombre="mas" size={14} /> Añadir modelo
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {avisoModelo && (
          <div className="voc-aviso-dup">
            «{(nuevoModeloPorPadre[t.id] ?? '').trim()}» ya existe en {avisoModelo}.
          </div>
        )}
      </Fragment>
    );
  }

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo="Vocabulario"
        volverA="/yo"
        ayuda="cola-vocabulario"
        derecha={
          vista === 'catalogo' && !creandoCategoria ? (
            <>
              {!buscador.abierto && !ordenandoCat && !seleccionandoCat && !!catalogoAgrupado?.length && (
                <BotonBuscar etiqueta="buscar término o modelo…" onClick={buscador.abrir} />
              )}
              <button
                type="button"
                className="boton-icono"
                aria-label="Nueva categoría"
                title="Nueva categoría"
                onClick={() => setCreandoCategoria(true)}
              >
                <Icono nombre="mas" size={18} />
              </button>
            </>
          ) : undefined
        }
      />

      <Segmentado
        opciones={
          [
            { valor: 'catalogo', etiqueta: 'Catálogo completo' },
            { valor: 'pendientes', etiqueta: `Pendientes${propuestos?.length ? ` (${propuestos.length})` : ''}` },
          ] as const
        }
        valor={vista}
        onCambio={cambiarVista}
      />

      {vista === 'pendientes' ? (
        <>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', marginTop: 0 }}>
            Términos que comerciales han propuesto sobre la marcha, en espera de revisión.
          </p>

          {error && <div className="field-error-text">{error}</div>}
          {resultadoPend && <div className="field-error-text">{resultadoPend}</div>}

          {seleccionandoPend ? (
            <BarraSeleccion
              n={marcadosPend.size}
              onCancelar={salirSeleccionPend}
              acciones={[
                {
                  etiqueta:
                    corriendoPend && progresoPend
                      ? `Trabajando ${progresoPend.hecho} de ${progresoPend.total}…`
                      : `Aprobar (${marcadosPend.size})`,
                  icono: 'check',
                  onClick: () => setAprobarEnAbierto(true),
                  disabled: corriendoPend || marcadosPend.size === 0,
                },
                {
                  etiqueta: 'Fusionar',
                  icono: 'fusionar',
                  onClick: () => {
                    const id = [...marcadosPend][0];
                    if (id) { setFusionandoId(id); setTextoBusquedaFusion(''); }
                  },
                  disabled: corriendoPend || marcadosPend.size !== 1,
                },
                {
                  etiqueta: corriendoPend ? 'Descartando…' : `Descartar (${marcadosPend.size})`,
                  icono: 'borrar',
                  tono: 'riesgo',
                  onClick: () => resolverLote('descartar'),
                  disabled: corriendoPend || marcadosPend.size === 0,
                },
              ]}
            />
          ) : (
            !!propuestos?.length && (
              <div style={{ display: 'flex' }}>
                <button
                  type="button"
                  className="chip"
                  style={{ marginLeft: 'auto' }}
                  onClick={entrarSeleccionPend}
                >
                  Seleccionar
                </button>
              </div>
            )
          )}

          {aprobarEnAbierto && (
            <div className="card">
              <div className="label" style={{ marginTop: 0 }}>
                Aprobar {marcadosPend.size} término{marcadosPend.size === 1 ? '' : 's'} en:
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
                Elige la categoría definitiva (las propuestas sobre la marcha nacen en «Sin
                clasificar»), o déjalos donde están.
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {categorias?.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="chip"
                    disabled={corriendoPend}
                    onClick={() => resolverLote('incorporar', c.id)}
                  >
                    {corriendoPend ? '…' : capitalizarFrase(c.nombre)}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={corriendoPend}
                  onClick={() => setAprobarEnAbierto(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={corriendoPend}
                  onClick={() => resolverLote('incorporar')}
                >
                  Dejar donde están
                </button>
              </div>
            </div>
          )}

          <div className="screen__scroll">
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
                  // El subtítulo se quedaba en "categoría · propuesto por X ·
                  // 1 sept 20…" y la fecha se cortaba. Ahora: categoría +
                  // fecha en el subtítulo; "propuesto por X" baja al bloque
                  // de contexto que se despliega al tocar.
                  const meta =
                    capitalizarFrase(t.categoria_nombre) +
                    (t.fecha_propuesta ? ` · ${fechaCorta(t.fecha_propuesta)}` : '');

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
                                {capitalizarFrase(c.nombre)}
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

                  const contextoAbierto = contextoAbiertoId === t.id;
                  return (
                    <Fragment key={t.id}>
                      <FilaAccion
                        titulo={t.nombre}
                        subtitulo={procesandoId === t.id ? `${meta} · procesando…` : meta}
                        seleccion={
                          seleccionandoPend
                            ? { activa: true, marcada: marcadosPend.has(t.id), onToggle: () => alternarPend(t.id) }
                            : undefined
                        }
                        onClick={
                          seleccionandoPend ? undefined : () => setContextoAbiertoId(contextoAbierto ? null : t.id)
                        }
                      />
                      {contextoAbierto && (
                        <div style={{ padding: '2px var(--fila-pad-x) 10px', fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                          {cargandoContexto ? (
                            'Cargando contexto…'
                          ) : (
                            <>
                              <div>Propuesto por {t.propuesto_por_nombre}.</div>
                              {contextoTermino?.visita ? (
                                <div>
                                  Propuesto en visita a <strong>{contextoTermino.visita.cliente?.nombre ?? '—'}</strong>
                                  {' · '}
                                  {fechaCorta(contextoTermino.visita.fecha)}
                                </div>
                              ) : (
                                <div>Sin visita de origen registrada.</div>
                              )}
                              {contextoTermino?.hallazgos.length ? (
                                contextoTermino.hallazgos.map((h) => (
                                  <div key={h.id} style={{ marginTop: 4 }}>
                                    {h.nota ? `«${h.nota}»` : 'Sin nota'} — {h.comercial?.nombre ?? '—'}
                                  </div>
                                ))
                              ) : (
                                <div style={{ marginTop: 4 }}>Todavía no se ha usado en ningún hallazgo.</div>
                              )}
                            </>
                          )}

                          {/* Acciones por ítem: antes solo se podía aprobar /
                              descartar entrando en "Seleccionar" (3 toques
                              para un término). Aquí van directas; "Fusionar"
                              abre el buscador de destino inline de siempre.
                              El lote sigue existiendo para varios a la vez. */}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                            <button
                              type="button"
                              className="chip"
                              disabled={procesandoId === t.id}
                              onClick={() => resolver(t.id, 'incorporar')}
                            >
                              Aprobar en «{capitalizarFrase(t.categoria_nombre)}»
                            </button>
                            <button
                              type="button"
                              className="chip"
                              disabled={procesandoId === t.id}
                              onClick={() => { setContextoAbiertoId(null); setFusionandoId(t.id); }}
                            >
                              Fusionar con…
                            </button>
                            <button
                              type="button"
                              className="chip"
                              disabled={procesandoId === t.id}
                              onClick={() => resolver(t.id, 'descartar')}
                            >
                              Descartar
                            </button>
                          </div>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </SeccionLista>
            </div>
          )}
          </div>
        </>
      ) : (
        <>
          {errorCatalogo && <div className="field-error-text">{errorCatalogo}</div>}
          {resultadoLote && <div className="field-error-text">{resultadoLote}</div>}

          {ordenandoCat ? (
            <div className="barra-seleccion">
              <span className="barra-seleccion__cuenta">
                {guardandoOrden ? 'Guardando…' : 'Ordena con las flechas (categorías, términos y modelos)'}
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
                  etiqueta: 'Renombrar',
                  icono: 'editar',
                  onClick: () => {
                    const id = [...marcadosTerm][0];
                    const term = catalogoAgrupado
                      ?.flatMap((c) => c.terminos.flatMap((t) => [t, ...t.hijos]))
                      .find((t) => t.id === id);
                    if (term) {
                      setRenombrandoTerminoId(term.id);
                      setTextoRenombrarTermino(term.nombre);
                    }
                  },
                  disabled: corriendoLote || marcadosTerm.size !== 1,
                },
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
            // "+ Categoría" vive en el "+" de la cabecera (mismo lenguaje que
            // Clientes/Comerciales): es la acción de crear, no un ajuste de
            // vista como las de aquí abajo. Estas sí son puramente
            // esporádicas y del mismo peso entre sí — un chip cada una.
            <div className="voc-acciones">
              {(categorias?.length ?? 0) >= 2 && (
                <button type="button" className="chip" onClick={entrarOrden}>
                  Ordenar
                </button>
              )}
              {!!catalogoAgrupado?.some((c) => c.terminos.length > 0) && (
                <button type="button" className="chip" onClick={entrarSeleccionCat}>
                  Seleccionar
                </button>
              )}
              {!buscando && !!catalogoAgrupado?.length && (() => {
                const ids = idsDesplegables();
                const todoAbierto = ids.length > 0 && ids.every((id) => expandidas.has(id));
                return (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => setExpandidas(todoAbierto ? new Set() : new Set(ids))}
                  >
                    {todoAbierto ? 'Plegar todo' : 'Desplegar todo'}
                  </button>
                );
              })()}
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
              {categoriaDuplicada(nuevaCategoriaTexto) && (
                <div className="field-error-text" style={{ color: 'var(--ink-400)', marginTop: 4 }}>
                  «{nuevaCategoriaTexto.trim()}» ya existe como categoría.
                </div>
              )}
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

          {buscador.abierto && !ordenandoCat && !seleccionandoCat && !creandoCategoria && !!catalogoAgrupado?.length && (
            <CampoBuscar
              value={busqueda}
              onChange={(v) => {
                setBusqueda(v);
                setCategoriaAnadiendoTermino(null);
                setMenuCategoriaId(null);
                setTerminoAnadiendoModelo(null);
              }}
              placeholder="buscar término o modelo…"
              onCerrar={() => {
                setBusqueda('');
                buscador.cerrar();
              }}
            />
          )}

          {moverLoteAbierto && (() => {
            // Un término marcado que YA tiene modelos no se puede anidar bajo
            // otro (crearía un nieto): para esos, solo destino categoría.
            const marcadosConModelos = (catalogoAgrupado ?? [])
              .flatMap((c) => c.terminos)
              .some((t) => marcadosTerm.has(t.id) && t.hijos.length > 0);
            return (
              <div className="card">
                <div className="label" style={{ marginTop: 0 }}>
                  Mover {marcadosTerm.size} término{marcadosTerm.size === 1 ? '' : 's'} a:
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
                  Elige una categoría (pasa a primer nivel) o un término (se anida como modelo).
                </div>
                {(catalogoAgrupado ?? []).map((c) => {
                  // Destino "dentro de": cualquier término de primer nivel que
                  // no esté marcado. Anidar bajo un modelo lo impide el trigger.
                  const destinosTermino = c.terminos.filter((t) => !marcadosTerm.has(t.id));
                  return (
                    <div key={c.categoria_id} style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="chip chip--on"
                          disabled={corriendoLote}
                          onClick={() => moverLote({ categoriaId: c.categoria_id })}
                        >
                          {capitalizarFrase(c.categoria_nombre)}
                        </button>
                        {destinosTermino.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="chip"
                            disabled={corriendoLote || marcadosConModelos}
                            title={
                              marcadosConModelos ? 'Un término que ya tiene modelos no se puede anidar' : undefined
                            }
                            onClick={() => moverLote({ parentId: t.id })}
                          >
                            › {t.nombre}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {marcadosConModelos && (
                  <div className="field-error-text" style={{ color: 'var(--ink-400)', marginTop: 8 }}>
                    Has marcado un término que ya tiene modelos: solo puede ir a una categoría, no dentro de otro término.
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: 8 }}
                  onClick={() => setMoverLoteAbierto(false)}
                >
                  Cancelar
                </button>
              </div>
            );
          })()}

          <div className="screen__scroll">
          {cargandoCatalogo && <EstadoLista estado="cargando" />}

          {buscando && !filtrarCats(catalogoAgrupado ?? []).length && (
            <EstadoLista estado="vacio" mensaje={`Nada coincide con «${busqueda.trim()}».`} />
          )}

          {(() => {
            // En modo ordenar manda `ordenLocal` (movimiento al instante);
            // fuera de él, el orden que trae la consulta. El buscador filtra
            // el árbol y fuerza que se vea todo lo que casa.
            const base =
              ordenandoCat && ordenLocal
                ? ordenLocal
                    .map((o) => catalogoAgrupado?.find((c) => c.categoria_id === o.id))
                    .filter((c): c is CategoriaConTerminos => Boolean(c))
                : (catalogoAgrupado ?? []);
            const catsMostradas = filtrarCats(base);
            const fija = (nombre: string) => esCategoriaSinClasificar(nombre);
            return (
          <div className="voc-catalogo">
          <div className="seccion-lista__grupo">
            {catsMostradas?.map((cat, idxCat) => {
              // Plegada por defecto; se despliega si el usuario la abrió
              // (también en "seleccionar"/"ordenar", que entran con todo
              // abierto). Buscando, siempre abierta.
              const colapsada = !buscando && !expandidas.has(cat.categoria_id);
              return (
              <Fragment key={cat.categoria_id}>
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
                  <div className="voc-cat-label-row seccion-lista__subcabecera">
                    <button
                      type="button"
                      className="voc-cat-label"
                      onClick={() => alternarColapso(cat.categoria_id)}
                      aria-expanded={!colapsada}
                    >
                      <span className="fila__icono">
                        <Icono nombre={colapsada ? 'chevron' : 'bajar'} size={16} />
                      </span>
                      <span>{capitalizarFrase(cat.categoria_nombre)}</span>
                      <span className="voc-cat-label__cuenta">
                        {cat.terminos.length === 1 ? '1 término' : `${cat.terminos.length} términos`}
                      </span>
                      {fija(cat.categoria_nombre) && (
                        <span className="voc-cat-label__fija">fija</span>
                      )}
                    </button>
                    {/* Ordenar categorías es un modo explícito y temporal (se
                        entra por "Ordenar"), no el estado normal de la
                        pantalla — aquí sí tienen sitio los iconos. */}
                    {ordenandoCat && (
                      <div className="voc-cat__acciones">
                        <button
                          type="button"
                          className="voc-cat__ic"
                          aria-label="Subir"
                          title="Subir"
                          disabled={idxCat === 0 || guardandoOrden}
                          onClick={() => void moverCat(idxCat, -1)}
                        >
                          <Icono nombre="subir" size={18} />
                        </button>
                        <button
                          type="button"
                          className="voc-cat__ic"
                          aria-label="Bajar"
                          title="Bajar"
                          disabled={idxCat === (catsMostradas?.length ?? 0) - 1 || guardandoOrden}
                          onClick={() => void moverCat(idxCat, 1)}
                        >
                          <Icono nombre="bajar" size={18} />
                        </button>
                      </div>
                    )}
                    {/* Un solo icono, igual en todas las categorías: abre/cierra
                        el mismo menú de chips que ya usa esta pantalla arriba
                        (Ordenar/Seleccionar/Desplegar todo) — nada de enlaces
                        de texto repetidos categoría a categoría. */}
                    {!ordenandoCat && !seleccionandoCat && !buscando && (
                      <button
                        type="button"
                        className={`voc-cat__ic${menuCategoriaId === cat.categoria_id ? ' voc-cat__ic--abierto' : ''}`}
                        aria-label="Más acciones de esta categoría"
                        title="Más acciones"
                        aria-expanded={menuCategoriaId === cat.categoria_id}
                        onClick={() =>
                          setMenuCategoriaId((id) => (id === cat.categoria_id ? null : cat.categoria_id))
                        }
                      >
                        <Icono nombre="opciones" size={18} />
                      </button>
                    )}
                  </div>
                )}

                {/* Mismo chip que "Ordenar"/"Seleccionar" arriba — un solo
                    lenguaje, igual en todas las categorías. */}
                {menuCategoriaId === cat.categoria_id && (
                  <div className="voc-cat-menu">
                    <button
                      type="button"
                      className="chip"
                      onClick={() => {
                        setMenuCategoriaId(null);
                        setExpandidas((prev) => new Set(prev).add(cat.categoria_id));
                        setCategoriaAnadiendoTermino(cat.categoria_id);
                      }}
                    >
                      + Añadir término
                    </button>
                    {!fija(cat.categoria_nombre) && (
                      <>
                        <button
                          type="button"
                          className="chip"
                          onClick={() => {
                            setMenuCategoriaId(null);
                            setErrorPorCategoria(null);
                            setRenombrandoCategoriaId(cat.categoria_id);
                            setTextoRenombrarCategoria(cat.categoria_nombre);
                          }}
                        >
                          Editar categoría
                        </button>
                        <button
                          type="button"
                          className="chip"
                          onClick={() => {
                            setMenuCategoriaId(null);
                            setErrorPorCategoria(null);
                            void abrirPanelBorrarCat(cat.categoria_id);
                          }}
                        >
                          Borrar categoría
                        </button>
                      </>
                    )}
                  </div>
                )}

                {borrandoCatId === cat.categoria_id &&
                    (borrandoCatTotal === null ? (
                      <div className="card" style={{ margin: 'var(--space-2) var(--fila-pad-x)' }}>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Comprobando…</div>
                      </div>
                    ) : borrandoCatTotal === 0 ? (
                      <div style={{ margin: 'var(--space-2) var(--fila-pad-x)' }}>
                        <ConfirmacionBorrado
                          onCancelar={cerrarPanelBorrarCat}
                          onConfirmar={() => borrarCategoriaVacia(cat.categoria_id)}
                          cargando={corriendoLote}
                          error={errorPorCategoria?.id === cat.categoria_id ? errorPorCategoria.msg : undefined}
                          confirmar="Sí, borrar la categoría"
                        >
                          La categoría «{capitalizarFrase(cat.categoria_nombre)}» está vacía.
                        </ConfirmacionBorrado>
                      </div>
                    ) : (
                      <div className="card card--riesgo" style={{ margin: 'var(--space-2) var(--fila-pad-x)' }}>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 600 }}>
                          No se puede borrar «{capitalizarFrase(cat.categoria_nombre)}»: tiene {borrandoCatTotal} término
                          {borrandoCatTotal === 1 ? '' : 's'} dentro
                          {borrandoCatTotal !== cat.terminos.reduce((n, t) => n + 1 + t.hijos.length, 0)
                            ? ' (algunos descartados que no se ven en la lista)'
                            : ''}
                          .
                        </div>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-700)', marginTop: 6 }}>
                          Muévelos a otra categoría y podrás borrarla:
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
                                {corriendoLote ? '…' : capitalizarFrase(c.nombre)}
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
                  <div className="field-error-text" style={{ padding: '0 var(--fila-pad-x) var(--space-2)' }}>
                    {errorPorCategoria.msg}
                  </div>
                )}

                {!colapsada && (
                  <>
                    {/* Sin fila "Sin términos": la sub-cabecera de la categoría
                        ya dice "0 términos" — repetirlo aquí sería el mismo
                        dato dos veces. */}
                    {cat.terminos.map((t) => filaTermino(t, cat.terminos, false))}

                    {!seleccionandoCat && !ordenandoCat && !buscando &&
                      categoriaAnadiendoTermino === cat.categoria_id && (
                        <>
                          <div className="voc-fila-input">
                            <input
                              className="field"
                              autoFocus
                              value={nuevoTerminoPorCategoria[cat.categoria_id] ?? ''}
                              onChange={(e) =>
                                setNuevoTerminoPorCategoria((prev) => ({ ...prev, [cat.categoria_id]: e.target.value }))
                              }
                              onKeyDown={(e) => { if (e.key === 'Enter') crearTerminoDirecto(cat.categoria_id); }}
                              placeholder="+ nuevo término en esta categoría…"
                            />
                            <button
                              type="button"
                              className="boton-icono"
                              aria-label="Añadir término"
                              title="Añadir término"
                              disabled={!(nuevoTerminoPorCategoria[cat.categoria_id] ?? '').trim()}
                              onClick={() => crearTerminoDirecto(cat.categoria_id)}
                            >
                              <Icono nombre="mas" size={18} />
                            </button>
                            <button
                              type="button"
                              className="campo-cerrar"
                              aria-label="Cancelar"
                              title="Cancelar"
                              onClick={() => setCategoriaAnadiendoTermino(null)}
                            >
                              <Icono nombre="error" size={16} />
                            </button>
                          </div>
                          {nombreDuplicado(nuevoTerminoPorCategoria[cat.categoria_id] ?? '') && (
                            <div className="voc-aviso-dup">
                              «{(nuevoTerminoPorCategoria[cat.categoria_id] ?? '').trim()}» ya existe en{' '}
                              {nombreDuplicado(nuevoTerminoPorCategoria[cat.categoria_id] ?? '')}.
                            </div>
                          )}
                        </>
                    )}
                  </>
                )}
              </Fragment>
              );
            })}
          </div>
          </div>
            );
          })()}
          </div>
        </>
      )}
    </div>
  );
}
