import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { eliminarOperacion } from '@/lib/offline-queue';

const ETAPAS = ['latente', 'cualificada', 'en_propuesta', 'ganada', 'perdida', 'descartada'] as const;
const PRIORIDADES = ['baja', 'media', 'alta', 'estrategica'] as const;
const HORIZONTES = ['0-3 meses', '3-6 meses', '6-12 meses', 'mas de 12 meses', 'sin fecha definida'];
const MOTIVOS_CIERRE = ['precio', 'competencia', 'sin presupuesto', 'proyecto cancelado', 'no encaja', 'timing', 'otro'];

interface TerminoAsociado {
  termino_id: string;
  nombre: string;
}

interface TerminoCatalogo {
  id: string;
  nombre: string;
  estado_gobierno: string;
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
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  const [buscandoRol, setBuscandoRol] = useState<'solucion_propuesta' | 'tecnologia_motivadora' | null>(null);
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [asociando, setAsociando] = useState(false);
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

  const { data: catalogo } = useQuery({
    queryKey: ['catalogo-terminos'],
    queryFn: async (): Promise<TerminoCatalogo[]> => {
      const { data, error: err } = await supabase
        .from('termino')
        .select('id, nombre, estado_gobierno')
        .neq('estado_gobierno', 'descartado')
        .order('nombre');
      if (err) throw err;
      return data ?? [];
    },
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
    navigate(-1);
  }

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
    await eliminarOperacion(oportunidadId);
    setBorrando(false);
    navigate(-1);
  }

  async function asociarTermino(terminoId: string) {
    if (!oportunidadId || !buscandoRol) return;
    setAsociando(true);
    setErrorAsociar(null);
    const { error: err } = await supabase
      .from('oportunidad_termino')
      .insert({ oportunidad_id: oportunidadId, termino_id: terminoId, rol_en_oportunidad: buscandoRol });
    setAsociando(false);
    if (err) {
      setErrorAsociar(err.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['terminos-oportunidad', oportunidadId, buscandoRol] });
    queryClient.invalidateQueries({ queryKey: ['catalogo-terminos'] });
    setBuscandoRol(null);
    setTextoBusqueda('');
  }

  async function proponerYAsociarTermino() {
    if (!oportunidadId || !buscandoRol || !textoBusqueda.trim()) return;
    setAsociando(true);
    setErrorAsociar(null);

    const { data: sesion } = await supabase.auth.getSession();
    const comercialId = sesion.session?.user.id;

    const { data: categoriaOtro, error: errCat } = await supabase
      .from('categoria_vocabulario')
      .select('id')
      .order('nombre')
      .limit(1)
      .single();
    if (errCat || !categoriaOtro) {
      setAsociando(false);
      setErrorAsociar('No se pudo determinar una categoría para el término nuevo.');
      return;
    }

    const { data: nuevo, error: errIns } = await supabase
      .from('termino')
      .insert({
        nombre: textoBusqueda.trim(),
        categoria_id: categoriaOtro.id,
        rol_funcional: 'ambos',
        propuesto_por_id: comercialId,
        fecha_propuesta: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (errIns || !nuevo) {
      setAsociando(false);
      setErrorAsociar(errIns?.message ?? 'No se pudo proponer el término.');
      return;
    }

    await asociarTermino(nuevo.id);
  }

  async function desvincularTermino(terminoId: string, rol: 'solucion_propuesta' | 'tecnologia_motivadora') {
    if (!oportunidadId) return;
    const { error: err } = await supabase
      .from('oportunidad_termino')
      .delete()
      .eq('oportunidad_id', oportunidadId)
      .eq('termino_id', terminoId)
      .eq('rol_en_oportunidad', rol);
    if (err) {
      setErrorAsociar(err.message);
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>
          ←
        </button>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>oportunidad</h1>
      </div>

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
          onClick={() => { setBuscandoRol('tecnologia_motivadora'); setTextoBusqueda(''); setErrorAsociar(null); }}
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
          onClick={() => { setBuscandoRol('solucion_propuesta'); setTextoBusqueda(''); setErrorAsociar(null); }}
        >
          + añadir
        </button>
      </div>

      {buscandoRol && (
        <div className="card">
          <div className="label" style={{ marginTop: 0 }}>
            buscar término {buscandoRol === 'solucion_propuesta' ? '(solución)' : '(lo que ya tiene)'}
          </div>
          <input
            className="field"
            autoFocus
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
            placeholder="escribe para buscar…"
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, maxHeight: 160, overflowY: 'auto' }}>
            {catalogo
              ?.filter((t) => textoBusqueda.trim() && t.nombre.toLowerCase().includes(textoBusqueda.trim().toLowerCase()))
              .slice(0, 10)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="chip"
                  disabled={asociando}
                  onClick={() => asociarTermino(t.id)}
                >
                  {t.nombre}
                  {t.estado_gobierno === 'propuesto' && (
                    <span style={{ color: 'var(--ink-400)', fontSize: 11 }}> · pendiente de validar</span>
                  )}
                </button>
              ))}
          </div>
          {textoBusqueda.trim() &&
            !catalogo?.some((t) => t.nombre.toLowerCase() === textoBusqueda.trim().toLowerCase()) && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 8 }}
                disabled={asociando}
                onClick={proponerYAsociarTermino}
              >
                {asociando ? 'proponiendo…' : `+ proponer "${textoBusqueda.trim()}" como término nuevo`}
              </button>
            )}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 8 }}
            onClick={() => setBuscandoRol(null)}
          >
            cerrar
          </button>
          {errorAsociar && <div className="field-error-text" style={{ marginTop: 8 }}>{errorAsociar}</div>}
        </div>
      )}

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

      <button className="btn btn-primary" style={{ marginTop: 'auto' }} disabled={guardando} onClick={guardar}>
        {guardando ? 'guardando…' : 'guardar'}
      </button>

      {!confirmandoBorrado ? (
        <button
          className="btn btn-secondary"
          style={{ color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
          onClick={() => setConfirmandoBorrado(true)}
        >
          borrar oportunidad
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
              {borrando ? 'borrando…' : 'confirmar borrado'}
            </button>
          </div>
          {errorBorrado && <div className="field-error-text" style={{ marginTop: 8 }}>{errorBorrado}</div>}
        </div>
      )}
    </div>
  );
}
