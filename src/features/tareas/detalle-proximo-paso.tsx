import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { eliminarOperacion } from '@/lib/offline-queue';
import { fechaCorta } from '@/lib/fechas';
import { uuid } from '@/lib/uuid';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { crearVisitaConResponsable } from '@/lib/rpc';
import { useVolverA } from '@/lib/volver-a';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { Icono } from '@/components/ui/iconos';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { EstadoLista } from '@/components/ui/estado-lista';
import { TarjetaAccion } from '@/components/ui/tarjeta-accion';
import { SelectorZona } from '@/components/ui/selector-zona';

// Pantalla de edición de un próximo paso ya creado (desde Visita Activa,
// vía paso-rapido-hoja.tsx). Mismo patrón que detalle-hallazgo.tsx:
// carga, edición con confirmación explícita de éxito, y borrado en dos
// pasos con comprobación de `count` (ver adenda_punto1_delete_silencioso.md
// — sin comprobar count, un DELETE sin política que lo autorice se ve
// como "éxito" aunque afecte a 0 filas).
export function DetalleProximoPaso() {
  const { pasoId } = useParams<{ pasoId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { comercial } = useSesionActual();
  // Se llega desde Mis próximos pasos, desde una visita cerrada o desde la
  // actividad del proyecto. El ← vuelve al origen; si no consta, a la lista.
  const volver = useVolverA('/tareas');

  const [descripcion, setDescripcion] = useState('');
  const [fechaObjetivo, setFechaObjetivo] = useState('');
  const [zonaTexto, setZonaTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [planificando, setPlanificando] = useState(false);
  const [visitaPlanificada, setVisitaPlanificada] = useState(false);
  const [errorPlan, setErrorPlan] = useState<string | null>(null);

  const { data: paso, isLoading, isError, refetch } = useQuery({
    queryKey: ['proximo-paso', pasoId],
    enabled: !!pasoId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('proximo_paso')
        .select(
          'id, descripcion, fecha_objetivo, estado, zona_texto, proyecto_id, visita_id, visita:visita_id(cliente:cliente_id(id, nombre)), proyecto:proyecto_id(nombre)'
        )
        .eq('id', pasoId!)
        .single();
      if (err) throw err;
      return data;
    },
  });

  useEffect(() => {
    if (!paso) return;
    setDescripcion(paso.descripcion);
    setFechaObjetivo(paso.fecha_objetivo ?? '');
    setZonaTexto(paso.zona_texto ?? '');
  }, [paso]);

  async function guardar() {
    if (!pasoId || !descripcion.trim()) return;
    setGuardando(true);
    setError(null);
    // Mismo encargo técnico que el borrado (punto 2/3, ver
    // adenda_punto1_delete_silencioso.md): sin permiso, Supabase no da
    // error — el UPDATE "tiene éxito" afectando a 0 filas. Comprobar
    // `count` es la única forma de no decir "guardado ✓" sin haber
    // tocado nada.
    const { error: err, count } = await supabase
      .from('proximo_paso')
      .update(
        {
          descripcion: descripcion.trim(),
          fecha_objetivo: fechaObjetivo || null,
          zona_texto: zonaTexto.trim() || null,
        },
        { count: 'exact' }
      )
      .eq('id', pasoId);
    setGuardando(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (!count) {
      setError('No se ha podido guardar (0 filas afectadas). Puede que no tengas permiso — solo el responsable o Dirección Comercial pueden editar un próximo paso.');
      return;
    }
    setGuardadoConExito(true);
    queryClient.invalidateQueries({ queryKey: ['mis-proximos-pasos'] });
    queryClient.invalidateQueries({ queryKey: ['proximo-paso', pasoId] });
    // Misma pausa de 700ms que el resto de pantallas de detalle, para que
    // "guardado ✓" sea visible antes de volver.
    setTimeout(() => navigate(volver), 700);
  }

  async function confirmarBorrado() {
    if (!pasoId) return;
    setBorrando(true);
    setErrorBorrado(null);
    const { error: err, count } = await supabase
      .from('proximo_paso')
      .delete({ count: 'exact' })
      .eq('id', pasoId);
    setBorrando(false);
    if (err) {
      setErrorBorrado(err.message);
      return;
    }
    if (!count) {
      setErrorBorrado(
        'No se ha podido borrar (0 filas afectadas). Puede que no tengas permiso — solo el responsable o Dirección Comercial pueden borrar un próximo paso.'
      );
      return;
    }
    // Mismo bug que ya se corrigió en nota (detalle-captura.tsx) y
    // oportunidad (detalle-oportunidad.tsx), y que faltaba también en
    // hallazgo (detalle-hallazgo.tsx): si este paso se creó desde la visita
    // en curso, sigue existiendo una copia local en IndexedDB (misma id).
    // Borrar solo la fila real no la quita de ahí — "En esta visita" lo
    // seguía mostrando como fantasma. No falla si la entrada local no existe.
    await eliminarOperacion(pasoId);
    queryClient.invalidateQueries({ queryKey: ['mis-proximos-pasos'] });
    navigate(volver);
  }

  // Si el próximo paso es en realidad "volver a visitar", se planifica la
  // visita para su fecha objetivo (mismo cliente, yo de responsable, sin
  // hora) y aparece en la Agenda. No marca el paso como hecho — eso lo
  // decide el comercial con el botón que sale después.
  async function planificarVisita(clienteId: string) {
    // La descripción del paso es el objetivo de la visita — obligatorio, así
    // que no se planifica si está vacía (el botón de guardar del paso ya lo
    // exige, pero esto cubre el caso de haberla borrado sin guardar).
    if (!comercial || !paso || !paso.proyecto_id || !fechaObjetivo || !descripcion.trim() || planificando || visitaPlanificada)
      return;
    setPlanificando(true);
    setErrorPlan(null);
    try {
      const nuevaId = uuid();
      // La visita sigue en el mismo proyecto del paso — continuidad.
      const { error: err } = await crearVisitaConResponsable({
        pVisitaId: nuevaId,
        pClienteId: clienteId,
        pComercialId: comercial.id,
        pProyectoId: paso.proyecto_id,
        pFecha: new Date(`${fechaObjetivo}T09:00:00`).toISOString(),
        pEstadoCaptura: 'agendada',
      });
      if (err) throw new Error(err);
      // La visita hereda la descripción del paso como objetivo — "esto lo
      // tengo que hacer" se convierte en "voy a esta visita a hacer esto".
      const { error: errParche, count } = await supabase
        .from('visita')
        .update({ hora_definida: false, objetivo: descripcion.trim() }, { count: 'exact' })
        .eq('id', nuevaId);
      if (errParche) throw new Error(errParche.message);
      if (!count) throw new Error('La visita se creó, pero no se ha podido fijar el objetivo (0 filas afectadas).');
      setVisitaPlanificada(true);
      for (const k of [
        ['visitas-hoy'],
        ['visitas-proximas'],
        ['visitas-atrasadas'],
        ['agenda-planificadas'],
      ]) {
        queryClient.invalidateQueries({ queryKey: k });
      }
    } catch (e) {
      setErrorPlan(e instanceof Error ? e.message : 'No se pudo planificar la visita.');
    } finally {
      setPlanificando(false);
    }
  }

  async function marcarHecho() {
    if (!pasoId) return;
    // Mismo encargo técnico que `guardar()`: sin permiso, Supabase no da
    // error — comprobar `count` es la única forma de no navegar como si
    // se hubiera marcado, sin haber tocado nada.
    const { error: err, count } = await supabase
      .from('proximo_paso')
      .update({ estado: 'completado' }, { count: 'exact' })
      .eq('id', pasoId);
    if (err) {
      setError(err.message);
      return;
    }
    if (!count) {
      setError('No se ha podido marcar (0 filas afectadas). Puede que no tengas permiso — solo el responsable o Dirección Comercial pueden completar un próximo paso.');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['mis-proximos-pasos'] });
    navigate(volver);
  }

  if (isLoading || (!paso && !isError)) {
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Próximo paso" volverA={volver} />
        <EstadoLista estado="cargando" />
      </div>
    );
  }

  if (isError || !paso) {
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Próximo paso" volverA={volver} />
        <EstadoLista estado="error" mensaje="No se pudo cargar este próximo paso." onReintentar={() => refetch()} />
      </div>
    );
  }

  const cliente = (paso.visita as unknown as { cliente: { id: string; nombre: string } | null })?.cliente;
  const clienteNombre = cliente?.nombre;
  // Regla 6 (contexto siempre visible): el proyecto (siempre con nombre) se
  // añade detrás del cliente — mismo criterio que Agenda y las otras dos
  // pantallas de detalle.
  const contextoCliente = [clienteNombre, paso.proyecto?.nombre ?? null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="screen">
      <div style={{ position: 'sticky', top: 0, background: 'var(--surface-0)', zIndex: 1, paddingBottom: 8 }}>
        <CabeceraDetalle
          titulo="Próximo paso"
          ayuda="proximo-paso"
          subtitulo={contextoCliente || undefined}
          onVolver={() => (confirmandoBorrado ? setConfirmandoBorrado(false) : navigate(volver))}
        />
      </div>

      <div className="label" style={{ marginTop: 0 }}>Descripción</div>
      <textarea
        className="field"
        style={{ height: 'auto', padding: 8 }}
        rows={2}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="volver a llamar en dos semanas, enviar propuesta…"
      />

      <div className="label">Fecha objetivo (opcional)</div>
      <input
        className="field"
        type="date"
        value={fechaObjetivo}
        onChange={(e) => setFechaObjetivo(e.target.value)}
      />

      <div className="label">Zona (opcional)</div>
      <SelectorZona visitaId={paso.visita_id ?? undefined} value={zonaTexto} onChange={setZonaTexto} />

      {error && <div className="field-error-text">{error}</div>}

      {cliente && fechaObjetivo && paso.estado !== 'completado' && (
        visitaPlanificada ? (
          <TarjetaAccion
            titulo="Revisita"
            accion={{ etiqueta: 'Marcar este paso como hecho', icono: 'check', onClick: marcarHecho }}
          >
            Visita planificada para el {fechaCorta(fechaObjetivo)}. Está en la Agenda.
          </TarjetaAccion>
        ) : (
          <TarjetaAccion
            titulo="¿Volver a visitar?"
            accion={{
              etiqueta: 'Planificar visita para esta fecha',
              icono: 'mas',
              onClick: () => planificarVisita(cliente.id),
              disabled: !descripcion.trim(),
              cargando: planificando,
              etiquetaCargando: 'Planificando…',
            }}
            error={errorPlan ?? undefined}
          >
            ¿Es volver a visitar a {clienteNombre}? Planifícala para esa fecha.
          </TarjetaAccion>
        )
      )}

      {/* Mientras la confirmación de borrado está abierta, ella es el foco:
          "Guardar" baja a secundario para no competir (un solo primario). */}
      <button
        className={`btn ${confirmandoBorrado ? 'btn-secondary' : 'btn-primary'}`}
        style={{ marginTop: 'auto' }}
        disabled={!descripcion.trim() || guardando || guardadoConExito}
        onClick={guardar}
      >
        {guardadoConExito ? <><Icono nombre="check" size={16} /> Guardado</> : guardando ? 'Guardando…' : 'Guardar'}
      </button>

      {!confirmandoBorrado ? (
        <FilaNavegable
          icono="borrar"
          titulo="Borrar próximo paso"
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
