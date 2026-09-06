import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import {
  NATURALEZA_ORDEN,
  NATURALEZA_LABEL,
  TIPO_FECHA_RELEVANTE_LABEL,
  etiqueta,
} from '@/lib/etiquetas-visita';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { EstadoLista } from '@/components/ui/estado-lista';
import { AyudaNota } from '@/components/ui/ayuda-nota';
import { Icono } from '@/components/ui/iconos';

const TIPOS_FECHA = Object.keys(TIPO_FECHA_RELEVANTE_LABEL);

// Pantalla de edición (no de creación): el Hallazgo se crea con captura
// mínima (término + naturaleza) desde el botón "Hallazgo" en Visita Activa
// (ver hallazgo-rapido-hoja.tsx). Esta pantalla sirve para
// estructurar/completar después (nota, ubicación, fecha relevante),
// tal como se cerró en el flujo funcional.
export function DetalleHallazgo() {
  const { hallazgoId } = useParams<{ hallazgoId: string }>();
  const navigate = useNavigate();

  const [naturaleza, setNaturaleza] = useState<string>('contexto');
  const [nota, setNota] = useState('');
  const [ubicacionId, setUbicacionId] = useState<string>('');
  const [fechaRelevante, setFechaRelevante] = useState('');
  const [tipoFechaRelevante, setTipoFechaRelevante] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  const { data: hallazgo, isLoading } = useQuery({
    queryKey: ['hallazgo', hallazgoId],
    enabled: !!hallazgoId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('hallazgo')
        .select(
          'id, cliente_id, naturaleza, nota, ubicacion_id, fecha_relevante, tipo_fecha_relevante, termino:termino_id(id, nombre, categoria_id), cliente:cliente_id(nombre), proyecto:proyecto_id(nombre, es_general)'
        )
        .eq('id', hallazgoId!)
        .single();
      if (err) throw err;
      return data;
    },
  });
  // Regla 6 (contexto siempre visible): antes la cabecera no decía de qué
  // cliente era el hallazgo. El proyecto solo se nombra si no es el General
  // invisible por defecto (P9, regla 4) — mismo criterio que Agenda.
  const contextoCliente = [
    hallazgo?.cliente?.nombre,
    hallazgo?.proyecto && !hallazgo.proyecto.es_general ? hallazgo.proyecto.nombre : null,
  ]
    .filter(Boolean)
    .join(' · ');

  useEffect(() => {
    if (!hallazgo) return;
    setNaturaleza(hallazgo.naturaleza);
    setNota(hallazgo.nota ?? '');
    setUbicacionId(hallazgo.ubicacion_id ?? '');
    setFechaRelevante(hallazgo.fecha_relevante ?? '');
    setTipoFechaRelevante(hallazgo.tipo_fecha_relevante ?? '');
  }, [hallazgo]);

  const { data: ubicaciones } = useQuery({
    queryKey: ['ubicaciones-cliente', hallazgo?.cliente_id],
    enabled: !!hallazgo?.cliente_id,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('ubicacion')
        .select('id, nombre')
        .eq('cliente_id', hallazgo!.cliente_id);
      if (err) throw err;
      return data ?? [];
    },
  });

  async function guardar() {
    if (!hallazgoId) return;
    // fecha_relevante y tipo_fecha_relevante van juntos o ninguno — refleja
    // el CHECK chk_hallazgo_fecha_relevante_tipo de 01_schema.sql; validar
    // aquí antes de enviar evita un rechazo silencioso del servidor.
    if (fechaRelevante && !tipoFechaRelevante) {
      setError('Si indicas una fecha relevante, indica también su tipo.');
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase
      .from('hallazgo')
      .update({
        naturaleza,
        nota: nota.trim() || null,
        ubicacion_id: ubicacionId || null,
        fecha_relevante: fechaRelevante || null,
        tipo_fecha_relevante: fechaRelevante ? tipoFechaRelevante : null,
      })
      .eq('id', hallazgoId!);
    setGuardando(false);
    if (err) {
      setError(err.message);
      return;
    }
    setGuardadoConExito(true);
    // Breve pausa para que "guardado ✓" sea visible de verdad antes de
    // volver — antes saltaba a la pantalla anterior sin ninguna
    // confirmación, ni siquiera un flash.
    setTimeout(() => navigate(-1), 700);
  }

  // Borrado individual — encargo técnico punto 2/3: comprobación explícita
  // de `count` devuelto por Supabase. Sin una política RLS que autorice el
  // DELETE, Supabase no devuelve error — ejecuta la sentencia "con éxito"
  // afectando a 0 filas (verificado en producción, ver
  // adenda_punto1_delete_silencioso.md). Tratar count 0 como fallo real es
  // la única forma de no mostrar "eliminado" cuando en realidad no lo está.
  async function confirmarBorrado() {
    if (!hallazgoId) return;
    setBorrando(true);
    setErrorBorrado(null);
    const { error: err, count } = await supabase
      .from('hallazgo')
      .delete({ count: 'exact' })
      .eq('id', hallazgoId);
    setBorrando(false);
    if (err) {
      setErrorBorrado(err.message);
      return;
    }
    if (!count) {
      setErrorBorrado('No se ha podido borrar (0 filas afectadas). Puede que no tengas permiso — solo el autor o Dirección Comercial pueden borrar un hallazgo.');
      return;
    }
    navigate(-1);
  }

  if (isLoading || !hallazgo) {
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Hallazgo" />
        <EstadoLista estado="cargando" />
      </div>
    );
  }

  return (
    <div className="screen">
      <CabeceraDetalle
        titulo="Hallazgo"
        ayuda="detalle-hallazgo"
        subtitulo={contextoCliente || undefined}
        onVolver={() => (confirmandoBorrado ? setConfirmandoBorrado(false) : navigate(-1))}
      />
      {(hallazgo.termino as unknown as { nombre: string } | null)?.nombre && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', margin: '-6px 2px 0' }}>
          {(hallazgo.termino as unknown as { nombre: string }).nombre}
        </div>
      )}

      <div className="label">Naturaleza</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {NATURALEZA_ORDEN.map((n) => (
          <button
            key={n}
            type="button"
            className={`chip${naturaleza === n ? ' chip--on' : ''}`}
            onClick={() => setNaturaleza(n)}
          >
            {etiqueta(NATURALEZA_LABEL, n)}
          </button>
        ))}
      </div>

      <div className="label">Nota</div>
      <textarea
        className="field"
        style={{ height: 'auto', padding: 8 }}
        rows={2}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="envejecido, cliente insatisfecho…"
      />

      <div className="label">Ubicación</div>
      <select className="field" value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
        <option value="">Sin ubicación</option>
        {ubicaciones?.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre}
          </option>
        ))}
      </select>

      <div className="label">Fecha relevante (opcional)</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="field"
          type="date"
          value={fechaRelevante}
          onChange={(e) => setFechaRelevante(e.target.value)}
        />
        <select
          className="field"
          value={tipoFechaRelevante}
          onChange={(e) => setTipoFechaRelevante(e.target.value)}
        >
          <option value="">Tipo…</option>
          {TIPOS_FECHA.map((t) => (
            <option key={t} value={t}>
              {etiqueta(TIPO_FECHA_RELEVANTE_LABEL, t)}
            </option>
          ))}
        </select>
      </div>
      <AyudaNota concepto="tipo-fecha-hallazgo" />

      {error && <div className="field-error-text">{error}</div>}

      {/* Mientras la confirmación de borrado está abierta, ella es el foco:
          "Guardar" baja a secundario para no competir (un solo primario). */}
      <button
        className={`btn ${confirmandoBorrado ? 'btn-secondary' : 'btn-primary'}`}
        style={{ marginTop: 'auto' }}
        disabled={guardando || guardadoConExito}
        onClick={guardar}
      >
        {guardadoConExito ? <><Icono nombre="check" size={16} /> Guardado</> : guardando ? 'Guardando…' : 'Guardar'}
      </button>

      {!confirmandoBorrado ? (
        <FilaNavegable
          icono="borrar"
          titulo="Borrar hallazgo"
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
        />
      )}
    </div>
  );
}
