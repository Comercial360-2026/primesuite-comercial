import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { uuid } from '@/lib/uuid';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { crearVisitaConResponsable } from '@/lib/rpc';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { EstadoLista } from '@/components/ui/estado-lista';
import { TarjetaAccion } from '@/components/ui/tarjeta-accion';

// Pantalla de edición de un próximo paso ya creado (desde Visita Activa,
// vía paso-rapido-modal.tsx). Mismo patrón que detalle-hallazgo.tsx:
// carga, edición con confirmación explícita de éxito, y borrado en dos
// pasos con comprobación de `count` (ver adenda_punto1_delete_silencioso.md
// — sin comprobar count, un DELETE sin política que lo autorice se ve
// como "éxito" aunque afecte a 0 filas).
export function DetalleProximoPaso() {
  const { pasoId } = useParams<{ pasoId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { comercial } = useSesionActual();

  const [descripcion, setDescripcion] = useState('');
  const [fechaObjetivo, setFechaObjetivo] = useState('');
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
        .select('id, descripcion, fecha_objetivo, estado, visita:visita_id(cliente:cliente_id(id, nombre))')
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
  }, [paso]);

  async function guardar() {
    if (!pasoId || !descripcion.trim()) return;
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase
      .from('proximo_paso')
      .update({
        descripcion: descripcion.trim(),
        fecha_objetivo: fechaObjetivo || null,
      })
      .eq('id', pasoId);
    setGuardando(false);
    if (err) {
      setError(err.message);
      return;
    }
    setGuardadoConExito(true);
    queryClient.invalidateQueries({ queryKey: ['mis-proximos-pasos'] });
    queryClient.invalidateQueries({ queryKey: ['proximo-paso', pasoId] });
    // Misma pausa de 700ms que el resto de pantallas de detalle, para que
    // "guardado ✓" sea visible antes de volver.
    setTimeout(() => navigate(-1), 700);
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
    queryClient.invalidateQueries({ queryKey: ['mis-proximos-pasos'] });
    navigate(-1);
  }

  // Si el próximo paso es en realidad "volver a visitar", se planifica la
  // visita para su fecha objetivo (mismo cliente, yo de responsable, sin
  // hora) y aparece en la Agenda. No marca el paso como hecho — eso lo
  // decide el comercial con el botón que sale después.
  async function planificarVisita(clienteId: string) {
    // La descripción del paso es el objetivo de la visita — obligatorio, así
    // que no se planifica si está vacía (el botón de guardar del paso ya lo
    // exige, pero esto cubre el caso de haberla borrado sin guardar).
    if (!comercial || !fechaObjetivo || !descripcion.trim() || planificando || visitaPlanificada) return;
    setPlanificando(true);
    setErrorPlan(null);
    try {
      const nuevaId = uuid();
      const { error: err } = await crearVisitaConResponsable({
        pVisitaId: nuevaId,
        pClienteId: clienteId,
        pComercialId: comercial.id,
        pFecha: new Date(`${fechaObjetivo}T09:00:00`).toISOString(),
        pEstadoCaptura: 'agendada',
      });
      if (err) throw new Error(err);
      // La visita hereda la descripción del paso como objetivo — "esto lo
      // tengo que hacer" se convierte en "voy a esta visita a hacer esto".
      const { error: errParche } = await supabase
        .from('visita')
        .update({ hora_definida: false, objetivo: descripcion.trim() })
        .eq('id', nuevaId);
      if (errParche) throw new Error(errParche.message);
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
    await supabase.from('proximo_paso').update({ estado: 'completado' }).eq('id', pasoId);
    queryClient.invalidateQueries({ queryKey: ['mis-proximos-pasos'] });
    navigate(-1);
  }

  if (isLoading || (!paso && !isError)) {
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Próximo paso" />
        <EstadoLista estado="cargando" />
      </div>
    );
  }

  if (isError || !paso) {
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Próximo paso" />
        <EstadoLista estado="error" mensaje="No se pudo cargar este próximo paso." onReintentar={() => refetch()} />
      </div>
    );
  }

  const cliente = (paso.visita as unknown as { cliente: { id: string; nombre: string } | null })?.cliente;
  const clienteNombre = cliente?.nombre;

  return (
    <div className="screen">
      <div style={{ position: 'sticky', top: 0, background: 'var(--surface-0)', zIndex: 1, paddingBottom: 8 }}>
        <CabeceraDetalle
          titulo="Próximo paso"
          subtitulo={clienteNombre}
          onVolver={() => (confirmandoBorrado ? setConfirmandoBorrado(false) : navigate(-1))}
        />
      </div>

      <div className="label" style={{ marginTop: 0 }}>descripción</div>
      <textarea
        className="field"
        style={{ height: 'auto', padding: 8 }}
        rows={2}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="volver a llamar en dos semanas, enviar propuesta…"
      />

      <div className="label">fecha objetivo (opcional)</div>
      <input
        className="field"
        type="date"
        value={fechaObjetivo}
        onChange={(e) => setFechaObjetivo(e.target.value)}
      />

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

      <button
        className="btn btn-primary"
        style={{ marginTop: 'auto' }}
        disabled={!descripcion.trim() || guardando || guardadoConExito}
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
          Borrar próximo paso
        </button>
      ) : (
        <div className="card card--riesgo">
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
            ¿Seguro? Esta acción no se puede deshacer.
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
