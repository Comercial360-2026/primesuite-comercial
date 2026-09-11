import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { eliminarOperacion } from '@/lib/offline-queue';
import { haceRelativo } from '@/lib/fechas';
import { TIPO_FECHA_RELEVANTE_LABEL, etiqueta } from '@/lib/etiquetas-visita';
import { useVolverA } from '@/lib/volver-a';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { RecategorizarItem } from '@/features/visita/recategorizar-item';
import { regenerarResumenSiAuto } from '@/lib/regenerar-resumen';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { EstadoLista } from '@/components/ui/estado-lista';
import { AyudaNota } from '@/components/ui/ayuda-nota';
import { SelectorCategorias } from '@/components/ui/selector-categorias';
import { SelectorZona } from '@/components/ui/selector-zona';
import type { Area } from '@/lib/vocabulario';
import { leerAreasDeHallazgo, guardarAreasDeHallazgo } from '@/lib/hallazgo-areas';
import { Icono } from '@/components/ui/iconos';

const TIPOS_FECHA = Object.keys(TIPO_FECHA_RELEVANTE_LABEL);

// Pantalla de edición (no de creación): el Hallazgo se crea con captura
// mínima desde "Anotar" en Visita Activa (ver anotar-hoja.tsx) — texto +
// "¿qué es?", con el término del catálogo OPCIONAL. Esta pantalla sirve
// para estructurar/completar después (marca o sistema, nota, ubicación,
// fecha relevante).
export function DetalleHallazgo() {
  const { hallazgoId } = useParams<{ hallazgoId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { comercial } = useSesionActual();
  // Se llega desde Visita activa, desde una visita cerrada o desde la
  // actividad del proyecto. El ← vuelve al origen real; si no consta, a Hoy.
  const volver = useVolverA('/');

  // Hallazgo simplificado a "categorías + nota": una o varias categorías
  // del catálogo, opcional — término/modelo sigue reservado para más
  // adelante. Se guarda en la tabla puente `hallazgo_area`, que ya admitía
  // varias filas por hallazgo desde el principio.
  const [areas, setAreas] = useState<Area[]>([]);
  const [nota, setNota] = useState('');
  const [zonaTexto, setZonaTexto] = useState('');
  const [fechaRelevante, setFechaRelevante] = useState('');
  const [tipoFechaRelevante, setTipoFechaRelevante] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [archivando, setArchivando] = useState(false);
  const [errorArchivado, setErrorArchivado] = useState<string | null>(null);

  const { data: hallazgo, isLoading, isError, refetch } = useQuery({
    queryKey: ['hallazgo', hallazgoId],
    enabled: !!hallazgoId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('hallazgo')
        .select(
          'id, cliente_id, visita_id, comercial_autor_id, nota, zona_texto, ubicacion_id, fecha_relevante, tipo_fecha_relevante, archivado_en, cliente:cliente_id(nombre), proyecto:proyecto_id(nombre)'
        )
        .eq('id', hallazgoId!)
        .single();
      if (err) throw err;
      return data;
    },
  });

  const { data: areasCargadas } = useQuery({
    queryKey: ['hallazgo-areas', hallazgoId],
    enabled: !!hallazgoId,
    queryFn: () => leerAreasDeHallazgo(hallazgoId!),
  });
  // Regla 6 (contexto siempre visible): antes la cabecera no decía de qué
  // cliente era el hallazgo. El nombre del proyecto se muestra siempre.
  const contextoCliente = [
    hallazgo?.cliente?.nombre,
    hallazgo?.proyecto?.nombre ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
  // Hallazgos de antes de la migración a "zona" (texto libre) llevaban una
  // ubicación del catálogo (`ubicacion_id`). Esa pantalla de gestión ya no
  // existe (no se pueden crear ubicaciones nuevas), así que aquí ya no se
  // edita — solo se avisa de que el dato viejo se conserva (el informe lo
  // sigue usando como último recurso si no hay zona) hasta que se escriba
  // una zona nueva.
  const hallazgoTieneUbicacionLegado = !!hallazgo?.ubicacion_id;

  // El formulario se rellena con lo que hay en el servidor UNA sola vez por
  // hallazgo. Sin estos guards, cualquier refetch de la query (foco de la
  // ventana con la query ya vencida, o una invalidación tras convertir de
  // tipo) volvía a llamar a `setNota`/`setArea`/… y borraba lo que el
  // comercial estuviera editando sin guardar. `guardarAreasDeHallazgo` hace
  // su diff contra la BD al guardar, así que no reflejar en vivo un cambio
  // remoto es seguro (además, editar en dos sitios a la vez no es el caso).
  const camposSembradosRef = useRef<string | null>(null);
  const areasSembradasRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hallazgo || camposSembradosRef.current === hallazgoId) return;
    setNota(hallazgo.nota ?? '');
    setZonaTexto(hallazgo.zona_texto ?? '');
    setFechaRelevante(hallazgo.fecha_relevante ?? '');
    setTipoFechaRelevante(hallazgo.tipo_fecha_relevante ?? '');
    camposSembradosRef.current = hallazgoId ?? null;
  }, [hallazgo, hallazgoId]);

  useEffect(() => {
    if (!areasCargadas || areasSembradasRef.current === hallazgoId) return;
    setAreas(areasCargadas);
    areasSembradasRef.current = hallazgoId ?? null;
  }, [areasCargadas, hallazgoId]);

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
    // Mismo encargo técnico que el borrado (punto 2/3, ver
    // adenda_punto1_delete_silencioso.md): sin permiso, Supabase no da
    // error — el UPDATE "tiene éxito" afectando a 0 filas. Comprobar
    // `count` es la única forma de no decir "guardado ✓" cuando en
    // realidad no se ha tocado nada (visto en vivo: Borja editando un
    // hallazgo de Comercial Prueba).
    const { error: err, count } = await supabase
      .from('hallazgo')
      .update(
        {
          nota: nota.trim() || null,
          zona_texto: zonaTexto.trim() || null,
          fecha_relevante: fechaRelevante || null,
          tipo_fecha_relevante: fechaRelevante ? tipoFechaRelevante : null,
        },
        { count: 'exact' }
      )
      .eq('id', hallazgoId!);
    if (err) {
      setGuardando(false);
      setError(err.message);
      return;
    }
    if (!count) {
      setGuardando(false);
      setError('No se ha podido guardar (0 filas afectadas). Puede que no tengas permiso — solo el autor o Dirección Comercial pueden editar un hallazgo.');
      return;
    }
    try {
      await guardarAreasDeHallazgo(hallazgoId, areas);
    } catch (errAreas) {
      setGuardando(false);
      setError(errAreas instanceof Error ? errAreas.message : 'No se pudieron guardar las áreas.');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['hallazgo-areas', hallazgoId] });
    // Si la visita está cerrada y su resumen es automático, se rehace con
    // el texto nuevo del hallazgo.
    await regenerarResumenSiAuto(hallazgo?.visita_id ?? undefined);
    setGuardando(false);
    setGuardadoConExito(true);
    // Breve pausa para que "guardado ✓" sea visible de verdad antes de
    // volver — antes saltaba a la pantalla anterior sin ninguna
    // confirmación, ni siquiera un flash.
    setTimeout(() => navigate(volver), 700);
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
    // Mismo bug que ya se corrigió en nota (detalle-captura.tsx) y
    // oportunidad (detalle-oportunidad.tsx): si este hallazgo se creó desde
    // "Anotar" en la visita en curso, sigue existiendo una copia local en
    // IndexedDB (misma id). Borrar solo la fila real en Supabase no la
    // quita de ahí — "En esta visita" seguía mostrándolo como fantasma
    // aunque ya no existiera en la base de datos. No falla si la entrada
    // local no existe (hallazgo abierto desde fuera de la visita).
    await eliminarOperacion(hallazgoId);
    await regenerarResumenSiAuto(hallazgo?.visita_id ?? undefined);
    navigate(volver);
  }

  // Archivar = sacar el hallazgo de la lista "Hallazgos" del proyecto sin
  // borrarlo (sigue en su visita y en el informe). Es un UPDATE, así que la
  // misma RLS que "Guardar" lo acota al autor o Dirección; se comprueba
  // `count` igual que en el borrado (un UPDATE sin permiso no da error, toca
  // 0 filas).
  const archivado = !!hallazgo?.archivado_en;
  async function alternarArchivado() {
    if (!hallazgoId || archivando) return;
    setArchivando(true);
    setErrorArchivado(null);
    const { error: err, count } = await supabase
      .from('hallazgo')
      .update({ archivado_en: archivado ? null : new Date().toISOString() }, { count: 'exact' })
      .eq('id', hallazgoId);
    setArchivando(false);
    if (err) {
      setErrorArchivado(err.message);
      return;
    }
    if (!count) {
      setErrorArchivado('No se ha podido (0 filas afectadas). Solo el autor o Dirección Comercial pueden archivar un hallazgo.');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['hallazgo', hallazgoId] });
    queryClient.invalidateQueries({ queryKey: ['hallazgos-proyecto'] });
    queryClient.invalidateQueries({ queryKey: ['hallazgos-archivados-proyecto'] });
    navigate(volver);
  }

  if (isLoading || (!hallazgo && !isError)) {
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Hallazgo" volverA={volver} />
        <EstadoLista estado="cargando" />
      </div>
    );
  }

  if (isError || !hallazgo) {
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Hallazgo" volverA={volver} />
        <EstadoLista
          estado="error"
          mensaje="No se pudo cargar el hallazgo. Puede que no tengas permiso."
          onReintentar={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="screen">
      <CabeceraDetalle
        titulo="Hallazgo"
        ayuda="detalle-hallazgo"
        subtitulo={contextoCliente || undefined}
        onVolver={() => (confirmandoBorrado ? setConfirmandoBorrado(false) : navigate(volver))}
      />

      <RecategorizarItem
        id={hallazgo.id}
        tipoActual="hallazgo"
        visitaId={hallazgo.visita_id ?? undefined}
        origen={{ from: volver }}
        motivoBloqueo={
          comercial?.rol === 'direccion_comercial' || hallazgo.comercial_autor_id === comercial?.id
            ? undefined
            : 'Solo el autor o Dirección Comercial pueden cambiarlo de tipo.'
        }
      />

      <div className="label">Categoría (opcional)</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 6 }}>
        Del catálogo (Hardware, Software…). Puedes marcar varias.
      </div>
      <SelectorCategorias seleccionadas={areas} onCambio={setAreas} />

      <div className="label">Nota</div>
      <textarea
        className="field"
        style={{ height: 'auto', padding: 8 }}
        rows={2}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="envejecido, cliente insatisfecho…"
      />

      <div className="label">Zona (opcional)</div>
      <SelectorZona visitaId={hallazgo.visita_id ?? undefined} value={zonaTexto} onChange={setZonaTexto} />
      {!zonaTexto.trim() && hallazgoTieneUbicacionLegado && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
          Tenía una ubicación del catálogo antiguo; se conserva en el informe hasta que escribas
          aquí una zona.
        </div>
      )}

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

      {!confirmandoBorrado && (
        <>
          {archivado && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', margin: '4px 2px 0' }}>
              Archivado {haceRelativo(hallazgo.archivado_en!)} · no sale en la lista de hallazgos del proyecto
            </div>
          )}
          <FilaNavegable
            icono={archivado ? 'atras' : 'bandeja'}
            titulo={archivando ? 'Guardando…' : archivado ? 'Desarchivar' : 'Archivar hallazgo'}
            chevron={false}
            onClick={alternarArchivado}
          />
          {errorArchivado && <div className="field-error-text">{errorArchivado}</div>}
        </>
      )}

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
