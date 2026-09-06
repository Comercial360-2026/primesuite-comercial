import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { eliminarOperacion, obtenerOperacion, actualizarOperacion } from '@/lib/offline-queue';
import type { OportunidadPayload } from '@/lib/offline-queue';
import { SelectorTermino } from '@/components/ui/selector-termino';
import { SeccionColapsable } from '@/components/ui/seccion-colapsable';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { Icono } from '@/components/ui/iconos';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { AyudaNota } from '@/components/ui/ayuda-nota';
import { ETAPA_LABEL, PRIORIDAD_LABEL, etiqueta } from '@/lib/etiquetas-visita';
import { fechaCorta } from '@/lib/fechas';

// El texto visible sale en frase; el valor que se guarda es la clave en
// minúscula (`e`/`p`/`m`), que es contra lo que compara el estado.
const capFrase = (s: string) => s.charAt(0).toLocaleUpperCase('es') + s.slice(1);

const ETAPAS = ['latente', 'cualificada', 'en_propuesta', 'ganada', 'perdida', 'descartada'] as const;
const PRIORIDADES = ['baja', 'media', 'alta', 'estrategica'] as const;
const HORIZONTES = ['0-3 meses', '3-6 meses', '6-12 meses', 'mas de 12 meses', 'sin fecha definida'];
const MOTIVOS_CIERRE = ['precio', 'competencia', 'sin presupuesto', 'proyecto cancelado', 'no encaja', 'timing', 'otro'];

// 'tecnologia_motivadora' = lo que el cliente ya tiene y motivó la
// oportunidad (p.ej. terminales de otra marca a sustituir/integrar).
// 'solucion_propuesta' = lo que le estamos ofreciendo. Las dos coexisten
// en la misma Oportunidad, cada término con su papel — así se resuelve el
// caso "integrar terminales de otra marca con nuestro software" sin forzar
// una entidad "integración" aparte: son dos términos, dos papeles, una
// misma Oportunidad.
interface TerminoAsociado {
  termino_id: string;
  nombre: string;
}

export function DetalleOportunidad() {
  const { oportunidadId } = useParams<{ oportunidadId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [titulo, setTitulo] = useState('');
  const [etapa, setEtapa] = useState<string>('latente');
  const [prioridad, setPrioridad] = useState<string>('media');
  const [horizonte, setHorizonte] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [motivoCierre, setMotivoCierre] = useState('');
  const [comentarioCierre, setComentarioCierre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  // Confirmar antes de salir con cambios sin guardar, y antes de cerrar la
  // oportunidad (marcarla perdida/descartada) desde un chip de Etapa.
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  const [confirmandoCierre, setConfirmandoCierre] = useState<string | null>(null);

  // Se muestra el selector solo para uno de los dos papeles a la vez,
  // según qué botón "+ añadir" se pulsó.
  const [buscandoRol, setBuscandoRol] = useState<'solucion_propuesta' | 'tecnologia_motivadora' | null>(null);
  const [errorAsociar, setErrorAsociar] = useState<string | null>(null);

  const { data: oportunidad, isLoading } = useQuery({
    queryKey: ['oportunidad', oportunidadId],
    enabled: !!oportunidadId,
    // Si acaba de sincronizar desde la cola, al volver a entrar queremos la
    // versión del servidor, no la copia local cacheada.
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('oportunidad')
        .select(
          'id, titulo, etapa, prioridad, horizonte_decision, descripcion, motivo_cierre, comentario_cierre, creado_en, cliente:cliente_id(nombre), proyecto:proyecto_id(nombre, es_general)'
        )
        .eq('id', oportunidadId!)
        .maybeSingle();
      if (err) throw err;
      if (data) return { ...data, enCola: false };
      // Todavía no está en el servidor: puede seguir en la cola local
      // (creada con "Oportunidad rápida" y aún sin sincronizar). Se lee de
      // ahí para que la pantalla NO salga vacía.
      const op = await obtenerOperacion(oportunidadId!);
      if (op?.entidad === 'oportunidad') {
        const p = op.payload;
        return {
          id: oportunidadId!,
          titulo: p.titulo,
          etapa: p.etapa ?? 'latente',
          prioridad: p.prioridad,
          horizonte_decision: p.horizonteDecision ?? null,
          descripcion: p.descripcion ?? null,
          motivo_cierre: p.motivoCierre ?? null,
          comentario_cierre: p.comentarioCierre ?? null,
          creado_en: null as string | null,
          cliente: null as { nombre: string } | null,
          proyecto: null as { nombre: string; es_general: boolean } | null,
          enCola: true,
        };
      }
      return null;
    },
  });
  const enCola = oportunidad?.enCola === true;
  // Regla 6 (contexto siempre visible): antes la cabecera no decía de qué
  // cliente era la oportunidad. El proyecto solo se nombra si no es el
  // General invisible por defecto (P9, regla 4) — mismo criterio que Agenda.
  const contextoCliente = [
    oportunidad?.cliente?.nombre,
    oportunidad?.proyecto && !oportunidad.proyecto.es_general ? oportunidad.proyecto.nombre : null,
    oportunidad?.creado_en ? `creada el ${fechaCorta(oportunidad.creado_en)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  async function cargarTerminosPorRol(rol: 'solucion_propuesta' | 'tecnologia_motivadora'): Promise<TerminoAsociado[]> {
    const { data: rels, error: err } = await supabase
      .from('oportunidad_termino')
      .select('termino_id')
      .eq('oportunidad_id', oportunidadId!)
      .eq('rol_en_oportunidad', rol);
    if (err) throw err;
    if (!rels?.length) return [];
    const { data: terminos, error: errT } = await supabase
      .from('termino')
      .select('id, nombre, parent:parent_id(nombre)')
      .in('id', rels.map((r) => r.termino_id));
    if (errT) throw errT;
    // Si el término es un modelo, el chip muestra la ruta "MIFARE › DESFire
    // EV2" (mismo criterio que SelectorTermino), para que se vea de qué
    // familia es sin abrir el catálogo.
    return ((terminos ?? []) as unknown as { id: string; nombre: string; parent: { nombre: string } | null }[]).map(
      (t) => ({ termino_id: t.id, nombre: t.parent ? `${t.parent.nombre} › ${t.nombre}` : t.nombre })
    );
  }

  const { data: soluciones } = useQuery({
    queryKey: ['terminos-oportunidad', oportunidadId, 'solucion_propuesta'],
    enabled: !!oportunidadId,
    queryFn: () => cargarTerminosPorRol('solucion_propuesta'),
  });

  const { data: motivadoras } = useQuery({
    queryKey: ['terminos-oportunidad', oportunidadId, 'tecnologia_motivadora'],
    enabled: !!oportunidadId,
    queryFn: () => cargarTerminosPorRol('tecnologia_motivadora'),
  });

  useEffect(() => {
    if (!oportunidad) return;
    setTitulo(oportunidad.titulo);
    setEtapa(oportunidad.etapa);
    setPrioridad(oportunidad.prioridad);
    setHorizonte(oportunidad.horizonte_decision ?? '');
    setDescripcion(oportunidad.descripcion ?? '');
    setMotivoCierre(oportunidad.motivo_cierre ?? '');
    setComentarioCierre(oportunidad.comentario_cierre ?? '');
  }, [oportunidad]);

  const esCierreNegativo = etapa === 'perdida' || etapa === 'descartada';

  // Los dos bloques de términos ("lo que ya tiene" + "lo que le proponemos")
  // se estructuran normalmente desde la oficina, no en la visita: van en una
  // sección plegable que solo abre sola si ya hay algo asociado. Así la
  // pantalla de campo queda en Título · Etapa · Prioridad · Horizonte ·
  // Descripción, sin scroll.
  const nTerminos = (motivadoras?.length ?? 0) + (soluciones?.length ?? 0);

  // ¿Hay cambios en el formulario que aún no se han guardado? (los términos
  // asociados se guardan al momento, no entran aquí). Sirve para avisar
  // antes de salir: los chips parecían aplicarse solos y no era así.
  const sucio =
    !!oportunidad &&
    (titulo !== oportunidad.titulo ||
      etapa !== oportunidad.etapa ||
      prioridad !== oportunidad.prioridad ||
      horizonte !== (oportunidad.horizonte_decision ?? '') ||
      descripcion !== (oportunidad.descripcion ?? '') ||
      motivoCierre !== (oportunidad.motivo_cierre ?? '') ||
      comentarioCierre !== (oportunidad.comentario_cierre ?? ''));

  function alVolver() {
    if (confirmandoBorrado) {
      setConfirmandoBorrado(false);
      return;
    }
    if (confirmandoSalida) {
      setConfirmandoSalida(false);
      return;
    }
    if (sucio) {
      setConfirmandoSalida(true);
      return;
    }
    navigate(-1);
  }

  async function guardar() {
    if (!oportunidadId) return;
    // Refleja chk_oportunidad_motivo_cierre_obligatorio (01_schema.sql):
    // validar en cliente evita un rechazo del servidor con mensaje críptico.
    if (esCierreNegativo && !motivoCierre) {
      setError('Indica un motivo de cierre para continuar.');
      return;
    }
    setGuardando(true);
    setError(null);

    // Si la oportunidad aún vive en la cola local (creada hace un momento
    // sin que haya llegado al servidor), se guardan los cambios EN la cola:
    // al sincronizar, el INSERT los llevará. Sin esto, el UPDATE fallaría
    // contra una fila que no existe todavía.
    if (enCola) {
      const op = await obtenerOperacion(oportunidadId!);
      if (op?.entidad === 'oportunidad') {
        await actualizarOperacion(oportunidadId!, {
          payload: {
            ...op.payload,
            titulo: titulo.trim(),
            prioridad: prioridad as OportunidadPayload['prioridad'],
            etapa,
            horizonteDecision: horizonte || undefined,
            descripcion: descripcion.trim() || undefined,
            motivoCierre: esCierreNegativo ? motivoCierre : undefined,
            comentarioCierre: esCierreNegativo ? comentarioCierre.trim() || undefined : undefined,
          },
        });
      }
      setGuardando(false);
      setGuardadoConExito(true);
      setTimeout(() => navigate(-1), 700);
      return;
    }

    const { error: err } = await supabase
      .from('oportunidad')
      .update({
        titulo: titulo.trim(),
        etapa,
        prioridad,
        horizonte_decision: horizonte || null,
        descripcion: descripcion.trim() || null,
        motivo_cierre: esCierreNegativo ? motivoCierre : null,
        comentario_cierre: esCierreNegativo ? comentarioCierre.trim() || null : null,
      })
      .eq('id', oportunidadId!);
    setGuardando(false);
    if (err) {
      setError(err.message);
      return;
    }
    setGuardadoConExito(true);
    setTimeout(() => navigate(-1), 700);
  }

  // Borrado completo — usa la función RPC eliminar_oportunidad_completa
  // (46_encargo_punto3_borrado.sql), que hace la cascada correcta
  // (desvincula próximos pasos, borra soluciones asociadas y el histórico
  // de seguimiento) dentro de una única transacción, y comprueba el
  // permiso explícitamente antes de tocar nada — lanza una excepción clara
  // en vez de fallar en silencio.
  async function confirmarBorrado() {
    if (!oportunidadId) return;
    setBorrando(true);
    setErrorBorrado(null);
    // Si aún está en la cola local (nunca llegó al servidor), basta con
    // quitarla de ahí — no hay fila real que borrar con la RPC.
    if (enCola) {
      await eliminarOperacion(oportunidadId);
      setBorrando(false);
      navigate(-1);
      return;
    }
    const { error: err } = await supabase.rpc('eliminar_oportunidad_completa', {
      p_oportunidad_id: oportunidadId,
    });
    if (err) {
      setBorrando(false);
      setErrorBorrado(err.message);
      return;
    }
    // BUG CORREGIDO (encontrado probando en el navegador): si esta
    // oportunidad se creó vía Oportunidad rápida, sigue existiendo una
    // copia local en IndexedDB (misma id, es el mecanismo estándar de la
    // cola offline). Borrar solo la fila real en Supabase no la elimina de
    // ahí — Visita activa seguía mostrando la tarjeta como si existiera,
    // aunque ya no estuviera en la base de datos. No falla si la entrada
    // local no existe (p.ej. oportunidad estructurada después, no creada
    // en el momento de la visita).
    await eliminarOperacion(oportunidadId);
    setBorrando(false);
    navigate(-1);
  }

  // Asociar un término existente del catálogo con el papel elegido
  // ('solucion_propuesta' o 'tecnologia_motivadora'). No valida duplicados
  // explícitamente aquí — la clave primaria compuesta de oportunidad_termino
  // (oportunidad_id, termino_id, rol_en_oportunidad) ya lo impide a nivel de
  // base de datos, y ese error se muestra tal cual si ocurre.
  async function asociarTermino(terminoId: string) {
    if (!oportunidadId || !buscandoRol) return;
    setErrorAsociar(null);
    const { error: err } = await supabase
      .from('oportunidad_termino')
      .insert({ oportunidad_id: oportunidadId, termino_id: terminoId, rol_en_oportunidad: buscandoRol });
    if (err) {
      setErrorAsociar(err.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['terminos-oportunidad', oportunidadId, buscandoRol] });
    setBuscandoRol(null);
  }

  async function desvincularTermino(terminoId: string, rol: 'solucion_propuesta' | 'tecnologia_motivadora') {
    if (!oportunidadId) return;
    const { error: err, count } = await supabase
      .from('oportunidad_termino')
      .delete({ count: 'exact' })
      .eq('oportunidad_id', oportunidadId)
      .eq('termino_id', terminoId)
      .eq('rol_en_oportunidad', rol);
    if (err) {
      setErrorAsociar(err.message);
      return;
    }
    if (!count) {
      setErrorAsociar('No se ha podido quitar el término (0 filas afectadas). Puede que no tengas permiso.');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['terminos-oportunidad', oportunidadId, rol] });
  }

  if (isLoading || !oportunidad) {
    return (
      <div className="screen">
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando…</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <CabeceraDetalle
        titulo="Oportunidad"
        subtitulo={contextoCliente || undefined}
        ayuda="detalle-oportunidad"
        onVolver={alVolver}
      />

      <div className="label" style={{ marginTop: 0 }}>Título</div>
      <input className="field" value={titulo} onChange={(e) => setTitulo(e.target.value)} />

      <div className="label">Etapa</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ETAPAS.map((e) => (
          <button
            key={e}
            type="button"
            className={`chip${etapa === e ? ' chip--on' : ''}`}
            onClick={() => {
              // Marcar «Perdida» / «Descartada» cierra la oportunidad — se
              // confirma antes; el resto de etapas se aplican al toque.
              if ((e === 'perdida' || e === 'descartada') && etapa !== e) {
                setConfirmandoCierre(e);
              } else {
                setConfirmandoCierre(null);
                setEtapa(e);
              }
            }}
          >
            {etiqueta(ETAPA_LABEL, e)}
          </button>
        ))}
      </div>

      {confirmandoCierre && (
        <div className="card card--riesgo" style={{ marginTop: 6 }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Vas a marcar esta oportunidad como «{etiqueta(ETAPA_LABEL, confirmandoCierre)}»: se da por cerrada y
            tendrás que indicar un motivo. ¿Seguro?
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => setConfirmandoCierre(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setEtapa(confirmandoCierre);
                setConfirmandoCierre(null);
              }}
            >
              Sí, cerrarla
            </button>
          </div>
        </div>
      )}

      <div className="label">Prioridad</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {PRIORIDADES.map((p) => (
          <button key={p} type="button" className={`chip${prioridad === p ? ' chip--on' : ''}`} onClick={() => setPrioridad(p)}>
            {etiqueta(PRIORIDAD_LABEL, p)}
          </button>
        ))}
      </div>

      <div className="label">Horizonte de decisión</div>
      <select className="field" value={horizonte} onChange={(e) => setHorizonte(e.target.value)}>
        <option value="">Sin especificar</option>
        {HORIZONTES.map((h) => (
          <option key={h} value={h}>
            {capFrase(h)}
          </option>
        ))}
      </select>

      {/* Una sola nota para los tres campos de arriba (antes eran tres
          «ⓘ Qué es…» seguidos — recorrido de revisión). */}
      <AyudaNota concepto="etapa-oportunidad" />

      {/* Dos listas con papel distinto — resuelve el caso "el cliente tiene
          terminales de otra marca (tecnología motivadora) y quiere integrar
          nuestro software (solución propuesta)": son dos términos, cada uno
          con su papel, en la misma Oportunidad, sin forzar una entidad
          "integración" aparte. Plegadas: solo se abren solas si ya hay algo. */}
      <SeccionColapsable
        titulo="Términos y soluciones"
        cantidad={nTerminos}
        defaultAbierta={nTerminos > 0}
        siempreAbrible
      >
      <div className="label" style={{ marginTop: 0 }}>Lo que ya tiene (motiva la oportunidad)</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {motivadoras?.map((t) => (
          <span key={t.termino_id} className="chip chip--on" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {t.nombre}
            <button
              type="button"
              onClick={() => desvincularTermino(t.termino_id, 'tecnologia_motivadora')}
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}
              aria-label={`desvincular ${t.nombre}`}
            >
              ×
            </button>
          </span>
        ))}
        {!motivadoras?.length && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Ninguno asociado</span>}
        <button
          type="button"
          className="chip"
          disabled={enCola}
          onClick={() => { setBuscandoRol('tecnologia_motivadora'); setErrorAsociar(null); }}
        >
          + añadir
        </button>
      </div>

      <div className="label">Lo que le proponemos</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {soluciones?.map((t) => (
          <span key={t.termino_id} className="chip chip--on" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {t.nombre}
            <button
              type="button"
              onClick={() => desvincularTermino(t.termino_id, 'solucion_propuesta')}
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}
              aria-label={`desvincular ${t.nombre}`}
            >
              ×
            </button>
          </span>
        ))}
        {!soluciones?.length && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Ninguna asociada</span>}
        <button
          type="button"
          className="chip"
          disabled={enCola}
          onClick={() => { setBuscandoRol('solucion_propuesta'); setErrorAsociar(null); }}
        >
          + añadir
        </button>
      </div>

      {enCola && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
          Podrás asociar términos cuando la oportunidad termine de guardarse (unos segundos con conexión).
        </div>
      )}
      {errorAsociar && <div className="field-error-text">{errorAsociar}</div>}
      </SeccionColapsable>

      {/* Hoja de búsqueda: overlay, va fuera de la sección plegable. */}
      {buscandoRol && (
        <SelectorTermino
          titulo={`buscar término ${buscandoRol === 'solucion_propuesta' ? '(solución)' : '(lo que ya tiene)'}`}
          onSeleccionar={(t) => asociarTermino(t.id)}
          onCerrar={() => setBuscandoRol(null)}
        />
      )}

      <div className="label">Descripción</div>
      <textarea
        className="field"
        style={{ height: 'auto', padding: 8 }}
        rows={2}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />

      {esCierreNegativo && (
        <div className="card card--riesgo">
          <div className="label" style={{ marginTop: 0 }}>Motivo de cierre</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MOTIVOS_CIERRE.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip${motivoCierre === m ? ' chip--on' : ''}`}
                onClick={() => setMotivoCierre(m)}
              >
                {capFrase(m)}
              </button>
            ))}
          </div>
          <div className="label">Comentario (opcional)</div>
          <textarea
            className="field"
            style={{ height: 'auto', padding: 8 }}
            rows={2}
            value={comentarioCierre}
            onChange={(e) => setComentarioCierre(e.target.value)}
          />
        </div>
      )}

      {error && <div className="field-error-text">{error}</div>}

      {confirmandoSalida && (
        <div className="card card--riesgo" style={{ marginTop: 'auto' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Has cambiado algo y no lo has guardado. Si sales ahora se pierde.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => setConfirmandoSalida(false)}>
              Seguir editando
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
              Salir sin guardar
            </button>
          </div>
        </div>
      )}

      {/* Mientras la confirmación de borrado está abierta, ella es el foco:
          "Guardar" baja a secundario para no competir (un solo primario). */}
      <button
        className={`btn ${confirmandoBorrado ? 'btn-secondary' : 'btn-primary'}`}
        style={{ marginTop: confirmandoSalida ? undefined : 'auto' }}
        disabled={guardando || guardadoConExito}
        onClick={guardar}
      >
        {guardadoConExito ? <><Icono nombre="check" size={16} /> Guardado</> : guardando ? 'Guardando…' : 'Guardar'}
      </button>

      {!confirmandoBorrado ? (
        <FilaNavegable
          icono="borrar"
          titulo="Borrar oportunidad"
          tono="riesgo"
          chevron={false}
          onClick={() => setConfirmandoBorrado(true)}
        />
      ) : (
        <ConfirmacionBorrado
          onCancelar={() => setConfirmandoBorrado(false)}
          onConfirmar={confirmarBorrado}
          cargando={borrando}
          error={errorBorrado}
        >
          Se borrarán también sus soluciones asociadas y su histórico de seguimiento. Los próximos pasos vinculados no
          se borran: quedan sin oportunidad asociada.
        </ConfirmacionBorrado>
      )}
    </div>
  );
}
