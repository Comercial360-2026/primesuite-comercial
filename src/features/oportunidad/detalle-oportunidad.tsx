import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { eliminarOperacion, obtenerOperacion, actualizarOperacion } from '@/lib/offline-queue';
import type { OportunidadPayload } from '@/lib/offline-queue';
import { SelectorZona } from '@/components/ui/selector-zona';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { EstadoLista } from '@/components/ui/estado-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { Icono } from '@/components/ui/iconos';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { AyudaNota } from '@/components/ui/ayuda-nota';
import { ETAPA_LABEL, PRIORIDAD_LABEL, etiqueta } from '@/lib/etiquetas-visita';
import { fechaCorta } from '@/lib/fechas';
import { useVolverA } from '@/lib/volver-a';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { RecategorizarItem } from '@/features/visita/recategorizar-item';
import { regenerarResumenSiAuto } from '@/lib/regenerar-resumen';

// El texto visible sale en frase; el valor que se guarda es la clave en
// minúscula (`e`/`p`/`m`), que es contra lo que compara el estado.
const capFrase = (s: string) => s.charAt(0).toLocaleUpperCase('es') + s.slice(1);

const ETAPAS = ['latente', 'cualificada', 'en_propuesta', 'cerrada'] as const;
const PRIORIDADES = ['baja', 'media', 'alta', 'estrategica'] as const;
const HORIZONTES = ['0-3 meses', '3-6 meses', '6-12 meses', 'mas de 12 meses', 'sin fecha definida'];

export function DetalleOportunidad() {
  const { oportunidadId } = useParams<{ oportunidadId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { comercial } = useSesionActual();
  // Se llega desde Visita activa, desde una visita cerrada o desde la
  // actividad del proyecto. El ← vuelve al origen real; si no consta, a Hoy.
  const volver = useVolverA('/');

  const [titulo, setTitulo] = useState('');
  const [etapa, setEtapa] = useState<string>('latente');
  const [prioridad, setPrioridad] = useState<string>('media');
  const [horizonte, setHorizonte] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [zonaTexto, setZonaTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  // Confirmar antes de salir con cambios sin guardar, y antes de cerrar la
  // oportunidad desde el chip de Etapa.
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);

  const { data: oportunidad, isLoading, isError, refetch } = useQuery({
    queryKey: ['oportunidad', oportunidadId],
    enabled: !!oportunidadId,
    // Si acaba de sincronizar desde la cola, al volver a entrar queremos la
    // versión del servidor, no la copia local cacheada.
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('oportunidad')
        .select(
          'id, titulo, etapa, prioridad, horizonte_decision, descripcion, zona_texto, creado_en, comercial_autor_id, visita_origen_id, cliente:cliente_id(nombre), proyecto:proyecto_id(nombre)'
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
          zona_texto: p.zonaTexto ?? null,
          creado_en: null as string | null,
          comercial_autor_id: p.comercialAutorId ?? null,
          visita_origen_id: p.visitaOrigenId ?? null,
          cliente: null as { nombre: string } | null,
          proyecto: null as { nombre: string } | null,
          enCola: true,
        };
      }
      return null;
    },
  });
  const enCola = oportunidad?.enCola === true;
  // Regla 6 (contexto siempre visible): antes la cabecera no decía de qué
  // cliente era la oportunidad. El proyecto (siempre con nombre) se añade
  // detrás — mismo criterio que Agenda.
  const contextoCliente = [
    oportunidad?.cliente?.nombre,
    oportunidad?.proyecto?.nombre ?? null,
    oportunidad?.creado_en ? `creada el ${fechaCorta(oportunidad.creado_en)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  useEffect(() => {
    if (!oportunidad) return;
    setTitulo(oportunidad.titulo);
    setEtapa(oportunidad.etapa);
    setPrioridad(oportunidad.prioridad);
    setHorizonte(oportunidad.horizonte_decision ?? '');
    setDescripcion(oportunidad.descripcion ?? '');
    setZonaTexto(oportunidad.zona_texto ?? '');
  }, [oportunidad]);

  // ¿Hay cambios en el formulario que aún no se han guardado? Sirve para
  // avisar antes de salir.
  const sucio =
    !!oportunidad &&
    (titulo !== oportunidad.titulo ||
      etapa !== oportunidad.etapa ||
      prioridad !== oportunidad.prioridad ||
      horizonte !== (oportunidad.horizonte_decision ?? '') ||
      descripcion !== (oportunidad.descripcion ?? '') ||
      zonaTexto !== (oportunidad.zona_texto ?? ''));

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
    navigate(volver);
  }

  // Guardado inmediato de zona — igual que Archivar/Borrar en otras
  // pantallas, no espera al «Guardar» general (ver detalle-hallazgo.tsx).
  // Misma rama enCola/servidor que guardar() de abajo: si aún no ha
  // llegado al servidor, se actualiza la copia local de la cola.
  async function guardarZonaYa(zona: string) {
    if (!oportunidadId) return;
    if (enCola) {
      const op = await obtenerOperacion(oportunidadId);
      if (op?.entidad === 'oportunidad') {
        await actualizarOperacion(oportunidadId, {
          payload: { ...op.payload, zonaTexto: zona.trim() || undefined },
        });
      }
      return;
    }
    const { error: err, count } = await supabase
      .from('oportunidad')
      .update({ zona_texto: zona.trim() || null }, { count: 'exact' })
      .eq('id', oportunidadId);
    if (err) throw new Error(err.message);
    if (!count) {
      throw new Error('No se ha podido guardar (0 filas afectadas). Puede que no tengas permiso.');
    }
    if (oportunidad?.visita_origen_id) {
      // Se espera el refetch: sin esto, «cambiar» podía reabrir el buscador
      // con la lista de zonas todavía vieja (carrera invalidar/repintar).
      await queryClient.invalidateQueries({ queryKey: ['zonas-usadas-visita', oportunidad.visita_origen_id] });
    }
  }

  async function guardar() {
    if (!oportunidadId) return;
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
            zonaTexto: zonaTexto.trim() || undefined,
          },
        });
      }
      setGuardando(false);
      setGuardadoConExito(true);
      if (oportunidad?.visita_origen_id) {
        await queryClient.invalidateQueries({ queryKey: ['zonas-usadas-visita', oportunidad.visita_origen_id] });
      }
      setTimeout(() => navigate(volver), 700);
      return;
    }

    // Mismo encargo técnico que el borrado (punto 2/3, ver
    // adenda_punto1_delete_silencioso.md): sin permiso, Supabase no da
    // error — el UPDATE "tiene éxito" afectando a 0 filas. Comprobar
    // `count` es la única forma de no decir "guardado ✓" sin haber
    // tocado nada.
    const { error: err, count } = await supabase
      .from('oportunidad')
      .update(
        {
          titulo: titulo.trim(),
          etapa,
          prioridad,
          horizonte_decision: horizonte || null,
          descripcion: descripcion.trim() || null,
          zona_texto: zonaTexto.trim() || null,
        },
        { count: 'exact' }
      )
      .eq('id', oportunidadId!);
    setGuardando(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (!count) {
      setError('No se ha podido guardar (0 filas afectadas). Puede que no tengas permiso — solo el autor, preventa o Dirección Comercial pueden editar una oportunidad.');
      return;
    }
    // Si la visita de origen está cerrada y su resumen es automático, se
    // rehace con el título nuevo de la oportunidad.
    await regenerarResumenSiAuto(oportunidad?.visita_origen_id ?? undefined);
    if (oportunidad?.visita_origen_id) {
      await queryClient.invalidateQueries({ queryKey: ['zonas-usadas-visita', oportunidad.visita_origen_id] });
    }
    setGuardadoConExito(true);
    setTimeout(() => navigate(volver), 700);
  }

  // Borrado completo — usa la función RPC eliminar_oportunidad_completa
  // (46_encargo_punto3_borrado.sql), que hace la cascada correcta
  // (desvincula próximos pasos y borra el histórico de seguimiento) dentro
  // de una única transacción, y comprueba el
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
      navigate(volver);
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
    await regenerarResumenSiAuto(oportunidad?.visita_origen_id ?? undefined);
    setBorrando(false);
    navigate(volver);
  }

  if (isLoading || (!oportunidad && !isError)) {
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Oportunidad" volverA={volver} />
        <EstadoLista estado="cargando" />
      </div>
    );
  }

  if (isError || !oportunidad) {
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Oportunidad" volverA={volver} />
        <EstadoLista
          estado="error"
          mensaje="No se pudo cargar la oportunidad. Puede que no tengas permiso."
          onReintentar={() => refetch()}
        />
      </div>
    );
  }

  // "Esto es: Nota · Hallazgo · Oportunidad" (prompt maestro 11, Fase 3).
  // Una oportunidad solo se puede degradar si está intacta: en `latente`,
  // sin términos asociados. El resto de dependencias (seguimiento, próximos
  // pasos) las corta la RPC y devuelve un mensaje claro.
  const puedeRecategorizar =
    comercial?.rol === 'direccion_comercial' || oportunidad.comercial_autor_id === comercial?.id;
  const motivoBloqueoRecat = !puedeRecategorizar
    ? 'Solo el autor o Dirección Comercial pueden cambiarlo de tipo.'
    : oportunidad.etapa !== 'latente'
      ? 'Esta oportunidad ya está en marcha. Ciérrala o bórrala antes de cambiarla de tipo.'
      : undefined;

  return (
    <div className="screen">
      <CabeceraDetalle
        titulo="Oportunidad"
        subtitulo={contextoCliente || undefined}
        ayuda="detalle-oportunidad"
        onVolver={alVolver}
      />

      <RecategorizarItem
        id={oportunidad.id}
        tipoActual="oportunidad"
        visitaId={oportunidad.visita_origen_id ?? undefined}
        origen={{ from: volver }}
        sinSubir={enCola}
        motivoBloqueo={motivoBloqueoRecat}
      />

      <div className="label" style={{ marginTop: 0 }}>Título</div>
      <input className="field" value={titulo} onChange={(e) => setTitulo(e.target.value)} />

      {/* Antes de elegir, no después: son tres campos con nombre poco obvio
          (recorrido de revisión). */}
      <AyudaNota concepto="etapa-oportunidad" />

      <div className="label">Etapa</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ETAPAS.map((e) => (
          <button
            key={e}
            type="button"
            className={`chip${etapa === e ? ' chip--on' : ''}`}
            onClick={() => {
              // Marcar «Cerrada» se confirma antes; el resto de etapas se
              // aplican al toque.
              if (e === 'cerrada' && etapa !== e) {
                setConfirmandoCierre(true);
              } else {
                setConfirmandoCierre(false);
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
          <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>Vas a cerrar esta oportunidad. ¿Seguro?</p>
          <div className="fila-btns" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => setConfirmandoCierre(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setEtapa('cerrada');
                setConfirmandoCierre(false);
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

      <div className="label">Descripción</div>
      <textarea
        className="field"
        style={{ height: 'auto', padding: 8 }}
        rows={2}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />

      <div className="label">Zona (opcional)</div>
      <SelectorZona
        visitaId={oportunidad.visita_origen_id ?? undefined}
        value={zonaTexto}
        onChange={setZonaTexto}
        onGuardar={guardarZonaYa}
      />

      {error && <div className="field-error-text">{error}</div>}

      {confirmandoSalida && (
        <div className="card card--riesgo" style={{ marginTop: 'auto' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Has cambiado algo y no lo has guardado. Si sales ahora se pierde.
          </p>
          <div className="fila-btns" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => setConfirmandoSalida(false)}>
              Seguir editando
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(volver)}>
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
          Se borrará también su histórico de seguimiento. Los próximos pasos vinculados no se borran: quedan sin
          oportunidad asociada.
        </ConfirmacionBorrado>
      )}
    </div>
  );
}
