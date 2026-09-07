import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { haceRelativo } from '@/lib/fechas';
import { useProyectosCliente, ESTADO_PROYECTO_LABEL } from '@/hooks/use-proyectos-cliente';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { Icono } from '@/components/ui/iconos';
import { ActividadProyecto } from './actividad-proyecto';
import { AccionesProyecto } from './acciones-proyecto';

// Ficha de proyecto — la actividad de UNA línea de negocio del cliente
// (oportunidades, próximos pasos, hallazgos, historial de ESE proyecto) y,
// desde aquí, renombrarlo, pausarlo/terminarlo o borrarlo.
//
// El proyecto General ("sin proyecto asignado") NO tiene esta pantalla: su
// actividad se ve en la propia ficha de cliente. Si se llega aquí con el
// General (haya 1 o 5 proyectos), se redirige a la ficha de cliente.

export function FichaProyecto() {
  const { clienteId, proyectoId } = useParams<{ clienteId: string; proyectoId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Clave distinta de ['cliente', clienteId] (la de Ficha de cliente, con más
  // columnas) — mismo cliente_id, forma de datos distinta; con la misma clave
  // TanStack Query serviría aquí la caché de la otra pantalla. Bug real.
  const { data: cliente } = useQuery({
    queryKey: ['cliente-nombre', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cliente')
        .select('id, nombre')
        .eq('id', clienteId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: proyectos } = useProyectosCliente(clienteId);
  const proyecto = proyectos?.find((p) => p.id === proyectoId);

  const { data: resumenVisitas } = useQuery({
    queryKey: ['resumen-visitas-proyecto', proyectoId],
    enabled: !!proyectoId,
    queryFn: async (): Promise<{ total: number; ultima: string | null }> => {
      const [{ count, error: errCount }, { data: ultima, error: errUltima }] = await Promise.all([
        supabase
          .from('visita')
          .select('id', { count: 'exact', head: true })
          .eq('proyecto_id', proyectoId!),
        supabase
          .from('visita')
          .select('fecha')
          .eq('proyecto_id', proyectoId!)
          .order('fecha', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (errCount) throw errCount;
      if (errUltima) throw errUltima;
      return { total: count ?? 0, ultima: ultima?.fecha ?? null };
    },
  });

  // Renombrar (lápiz de la cabecera) — UPDATE directo, requiere conexión,
  // igual que "Editar datos" del cliente.
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [formNombre, setFormNombre] = useState('');
  const guardadoNombre = useAccionAsync();

  // Cambiar estado (pausar / terminar / reactivar / reabrir) — UPDATE directo.
  const cambioEstado = useAccionAsync();

  // Borrar el proyecto: su actividad pasa al General del cliente.
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const borrado = useAccionAsync();

  // Redirección al fundir: en cuanto la lista de proyectos ha cargado y este
  // es el General — el General nunca tiene pantalla propia, haya 1 o N.
  if (proyectos && proyecto?.es_general) {
    return <Navigate to={`/clientes/${clienteId}`} replace />;
  }

  function abrirEditarNombre() {
    setFormNombre(proyecto?.nombre ?? '');
    guardadoNombre.limpiarError();
    setEditandoNombre(true);
  }

  async function guardarNombre() {
    if (!proyectoId || !formNombre.trim()) return;
    if (!navigator.onLine) {
      guardadoNombre.establecerError('Necesitas conexión para renombrar el proyecto.');
      return;
    }
    await guardadoNombre.ejecutar(
      async () => {
        const { error } = await supabase
          .from('proyecto')
          .update({ nombre: formNombre.trim() })
          .eq('id', proyectoId);
        if (error) throw new Error(error.message);
      },
      {
        onExito: () => {
          setEditandoNombre(false);
          queryClient.invalidateQueries({ queryKey: ['proyectos-cliente', clienteId] });
        },
      }
    );
  }

  async function cambiarEstado(nuevo: 'activo' | 'pausado' | 'terminado') {
    if (!proyectoId) return;
    if (!navigator.onLine) {
      cambioEstado.establecerError('Necesitas conexión para cambiar el estado del proyecto.');
      return;
    }
    await cambioEstado.ejecutar(
      async () => {
        const { error } = await supabase
          .from('proyecto')
          .update({ estado: nuevo })
          .eq('id', proyectoId);
        if (error) throw new Error(error.message);
      },
      {
        onExito: () => queryClient.invalidateQueries({ queryKey: ['proyectos-cliente', clienteId] }),
      }
    );
  }

  async function confirmarBorrado() {
    if (!proyectoId) return;
    if (!navigator.onLine) {
      borrado.establecerError('Necesitas conexión para borrar el proyecto.');
      return;
    }
    await borrado.ejecutar(
      async () => {
        const { error } = await supabase.rpc('eliminar_proyecto', { p_proyecto_id: proyectoId });
        if (error) throw new Error(error.message);
      },
      {
        onExito: () => {
          queryClient.invalidateQueries({ queryKey: ['proyectos-cliente', clienteId] });
          navigate(`/clientes/${clienteId}`);
        },
      }
    );
  }

  const contextoLinea = [
    proyecto?.estado ? ESTADO_PROYECTO_LABEL[proyecto.estado] ?? proyecto.estado : null,
    resumenVisitas
      ? resumenVisitas.total === 0
        ? 'sin visitas todavía'
        : `${resumenVisitas.total} visita${resumenVisitas.total === 1 ? '' : 's'}`
      : null,
    resumenVisitas?.ultima ? `última ${haceRelativo(resumenVisitas.ultima)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // Acciones de estado según en qué está el proyecto ahora.
  const estado = proyecto?.estado ?? 'activo';
  // Un proyecto terminado es de solo consulta: no se le inician ni planifican
  // visitas (la barra de abajo desaparece) y no sale en los selectores de
  // proyecto. Para volver a trabajarlo hay que "Reabrir".
  const terminado = estado === 'terminado';
  const accionesEstado: Array<{ etiqueta: string; a: 'activo' | 'pausado' | 'terminado' }> =
    estado === 'terminado'
      ? [{ etiqueta: 'Reabrir', a: 'activo' }]
      : estado === 'pausado'
        ? [
            { etiqueta: 'Reactivar', a: 'activo' },
            { etiqueta: 'Terminar', a: 'terminado' },
          ]
        : [
            { etiqueta: 'Pausar', a: 'pausado' },
            { etiqueta: 'Terminar', a: 'terminado' },
          ];

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo={proyecto?.nombre ?? '…'}
        ayuda="ficha-proyecto"
        subtitulo={cliente?.nombre}
        volverA={`/clientes/${clienteId}`}
        derecha={
          <button
            type="button"
            className="boton-icono"
            aria-label={editandoNombre ? 'Cerrar edición del nombre' : 'Renombrar proyecto'}
            title={editandoNombre ? 'Cerrar edición del nombre' : 'Renombrar proyecto'}
            aria-expanded={editandoNombre}
            onClick={() => (editandoNombre ? setEditandoNombre(false) : abrirEditarNombre())}
          >
            <Icono nombre="editar" size={16} />
          </button>
        }
      />

      <div className="screen__scroll">
        {contextoLinea && (
          <div className="ficha-vitals">
            <span>{contextoLinea}</span>
          </div>
        )}

        {/* Acciones de estado — chips (esporádico), no botones anchos. */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 14px' }}>
          {accionesEstado.map((ac) => (
            <button
              key={ac.a}
              type="button"
              className="chip"
              disabled={cambioEstado.cargando}
              onClick={() => cambiarEstado(ac.a)}
            >
              {ac.etiqueta}
            </button>
          ))}
        </div>
        {cambioEstado.error && <div className="field-error-text">{cambioEstado.error}</div>}
        {terminado && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 10 }}>
            Proyecto terminado: solo consulta. Reábrelo para volver a iniciar o planificar visitas.
          </div>
        )}

        {editandoNombre && (
          <div className="card">
            <div className="label" style={{ marginTop: 0 }}>Nombre del proyecto</div>
            <input
              className={`field${guardadoNombre.error ? ' field--error' : ''}`}
              autoFocus
              value={formNombre}
              onChange={(e) => setFormNombre(e.target.value)}
              placeholder="mantenimiento, obra nueva, postventa…"
            />
            {guardadoNombre.error && <div className="field-error-text">{guardadoNombre.error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                className="btn btn-secondary"
                disabled={guardadoNombre.cargando}
                onClick={() => {
                  setEditandoNombre(false);
                  guardadoNombre.limpiarError();
                }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                disabled={guardadoNombre.cargando || !formNombre.trim()}
                onClick={guardarNombre}
              >
                {guardadoNombre.cargando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}

        <div className="lista-agrupada">
          {proyectoId && <ActividadProyecto proyectoId={proyectoId} />}

          {confirmandoBorrado ? (
            <ConfirmacionBorrado
              reversible="Su actividad (visitas, oportunidades, hallazgos y próximos pasos) no se borra: pasa a quedar sin proyecto asignado."
              confirmar="Sí, borrar el proyecto"
              cargando={borrado.cargando}
              error={borrado.error}
              onCancelar={() => {
                setConfirmandoBorrado(false);
                borrado.limpiarError();
              }}
              onConfirmar={confirmarBorrado}
            >
              Se borra el proyecto «{proyecto?.nombre}».
            </ConfirmacionBorrado>
          ) : (
            <SeccionLista>
              <FilaNavegable
                icono="borrar"
                titulo="Borrar proyecto"
                tono="riesgo"
                chevron={false}
                onClick={() => setConfirmandoBorrado(true)}
              />
            </SeccionLista>
          )}
        </div>
      </div>

      {clienteId && proyectoId && !terminado && (
        <AccionesProyecto
          clienteId={clienteId}
          proyectoId={proyectoId}
          clienteNombre={cliente?.nombre}
        />
      )}
    </div>
  );
}
