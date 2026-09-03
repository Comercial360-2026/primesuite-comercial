import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { eliminarOperacion } from '@/lib/offline-queue';
import { SelectorTermino } from '@/components/ui/selector-termino';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { AyudaNota } from '@/components/ui/ayuda-nota';

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

  // Se muestra el selector solo para uno de los dos papeles a la vez,
  // según qué botón "+ añadir" se pulsó.
  const [buscandoRol, setBuscandoRol] = useState<'solucion_propuesta' | 'tecnologia_motivadora' | null>(null);
  const [errorAsociar, setErrorAsociar] = useState<string | null>(null);

  const { data: oportunidad, isLoading } = useQuery({
    queryKey: ['oportunidad', oportunidadId],
    enabled: !!oportunidadId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('oportunidad')
        .select('id, titulo, etapa, prioridad, horizonte_decision, descripcion, motivo_cierre, comentario_cierre, cliente:cliente_id(nombre)')
        .eq('id', oportunidadId!)
        .single();
      if (err) throw err;
      return data;
    },
  });

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
      .select('id, nombre')
      .in('id', rels.map((r) => r.termino_id));
    if (errT) throw errT;
    return (terminos ?? []).map((t) => ({ termino_id: t.id, nombre: t.nombre }));
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
        onVolver={() => (confirmandoBorrado ? setConfirmandoBorrado(false) : navigate(-1))}
      />

      <div className="label" style={{ marginTop: 0 }}>título</div>
      <input className="field" value={titulo} onChange={(e) => setTitulo(e.target.value)} />

      <div className="label">etapa</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ETAPAS.map((e) => (
          <button key={e} type="button" className={`chip${etapa === e ? ' chip--on' : ''}`} onClick={() => setEtapa(e)}>
            {e.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="label">prioridad</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {PRIORIDADES.map((p) => (
          <button key={p} type="button" className={`chip${prioridad === p ? ' chip--on' : ''}`} onClick={() => setPrioridad(p)}>
            {p}
          </button>
        ))}
      </div>

      <div className="label">horizonte de decisión</div>
      <select className="field" value={horizonte} onChange={(e) => setHorizonte(e.target.value)}>
        <option value="">sin especificar</option>
        {HORIZONTES.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <AyudaNota concepto="horizonte-decision" />

      {/* Dos listas con papel distinto — resuelve el caso "el cliente tiene
          terminales de otra marca (tecnología motivadora) y quiere integrar
          nuestro software (solución propuesta)": son dos términos, cada uno
          con su papel, en la misma Oportunidad, sin forzar una entidad
          "integración" aparte. */}
      <div className="label">lo que el cliente ya tiene (motiva la oportunidad)</div>
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
        {!motivadoras?.length && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>ninguno asociado</span>}
        <button
          type="button"
          className="chip"
          onClick={() => { setBuscandoRol('tecnologia_motivadora'); setErrorAsociar(null); }}
        >
          + añadir
        </button>
      </div>

      <div className="label">solución que le proponemos</div>
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
        {!soluciones?.length && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>ninguna asociada</span>}
        <button
          type="button"
          className="chip"
          onClick={() => { setBuscandoRol('solucion_propuesta'); setErrorAsociar(null); }}
        >
          + añadir
        </button>
      </div>

      {buscandoRol && (
        <SelectorTermino
          titulo={`buscar término ${buscandoRol === 'solucion_propuesta' ? '(solución)' : '(lo que ya tiene)'}`}
          onSeleccionar={(t) => asociarTermino(t.id)}
          onCerrar={() => setBuscandoRol(null)}
        />
      )}
      {errorAsociar && <div className="field-error-text">{errorAsociar}</div>}

      <div className="label">descripción</div>
      <textarea
        className="field"
        style={{ height: 'auto', padding: 8 }}
        rows={2}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />

      {esCierreNegativo && (
        <div className="card card--riesgo">
          <div className="label" style={{ marginTop: 0 }}>motivo de cierre</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MOTIVOS_CIERRE.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip${motivoCierre === m ? ' chip--on' : ''}`}
                onClick={() => setMotivoCierre(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="label">comentario (opcional)</div>
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

      {/* Mientras la confirmación de borrado está abierta, ella es el foco:
          "Guardar" baja a secundario para no competir (un solo primario). */}
      <button
        className={`btn ${confirmandoBorrado ? 'btn-secondary' : 'btn-primary'}`}
        style={{ marginTop: 'auto' }}
        disabled={guardando || guardadoConExito}
        onClick={guardar}
      >
        {guardadoConExito ? 'Guardado ✓' : guardando ? 'Guardando…' : 'Guardar'}
      </button>

      {!confirmandoBorrado ? (
        <button
          className="btn btn-secondary"
          style={{ color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
          onClick={() => setConfirmandoBorrado(true)}
        >
          Borrar oportunidad
        </button>
      ) : (
        <div className="card card--riesgo">
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
            ¿Seguro? Se borrarán también sus soluciones asociadas y su histórico de seguimiento. Los próximos pasos vinculados no se borran, quedan sin oportunidad asociada. No se puede deshacer.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={() => setConfirmandoBorrado(false)} disabled={borrando}>
              cancelar
            </button>
            <button
              className="btn btn-primary"
              style={{ background: 'var(--risk-600)' }}
              onClick={confirmarBorrado}
              disabled={borrando}
            >
              {borrando ? 'Borrando…' : 'Confirmar borrado'}
            </button>
          </div>
          {errorBorrado && <div className="field-error-text" style={{ marginTop: 8 }}>{errorBorrado}</div>}
        </div>
      )}
    </div>
  );
}
