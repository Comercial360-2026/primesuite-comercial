import { useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useVolverA, desde } from '@/lib/volver-a';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { conReintentoDeSesion } from '@/lib/con-reintento-de-sesion';
import { fechaCorta, haceRelativo } from '@/lib/fechas';
import { plural } from '@/lib/texto';
import { useProyectosCliente, ESTADO_PROYECTO_LABEL } from '@/hooks/use-proyectos-cliente';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { useDescargarInforme, formatearMB } from '@/hooks/use-descargar-informe';
import { useEspacioProyecto } from '@/hooks/use-espacio-proyecto';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { EstadoLista } from '@/components/ui/estado-lista';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { FilaAccion } from '@/components/ui/fila-accion';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { Icono } from '@/components/ui/iconos';
import { Aviso } from '@/components/ui/aviso';
import { ActividadProyecto } from './actividad-proyecto';
import { AccionesProyecto } from './acciones-proyecto';
import { AvisoVisitasSinCerrar } from '@/features/visita/aviso-visitas-sin-cerrar';

// Ficha de proyecto — la actividad de UNA línea de negocio del cliente
// (oportunidades, próximos pasos, hallazgos, historial de ESE proyecto) y,
// desde aquí, renombrarlo, pausarlo/terminarlo o borrarlo. Todo proyecto
// tiene esta pantalla; el cliente siempre tiene al menos uno.

export function FichaProyecto() {
  const { clienteId, proyectoId } = useParams<{ clienteId: string; proyectoId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { comercial } = useSesionActual();
  // ← vuelve a donde se vino (ficha de cliente, actividad de Dirección…) o,
  // si no consta, a la ficha del cliente.
  const volver = useVolverA(`/clientes/${clienteId}`);

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

  const {
    data: proyectos,
    isLoading: cargandoProyecto,
    isError: errorProyecto,
    isPaused: pausadoProyecto,
    refetch: refetchProyecto,
  } = useProyectosCliente(clienteId);
  const proyecto = proyectos?.find((p) => p.id === proyectoId);
  const sinConexionProyecto = pausadoProyecto && proyectos === undefined;
  function reintentarProyecto() {
    queryClient.resetQueries({ queryKey: ['proyectos-cliente', clienteId] });
    refetchProyecto();
  }

  // Informe PDF del proyecto (cronología de sus visitas cerradas). Mismo
  // hook que el informe de visita, con tipo 'proyecto'.
  const { estadoDe: estadoInformeDe, descargar: descargarInforme } = useDescargarInforme();
  const estadoInforme = proyectoId ? estadoInformeDe(proyectoId) : 'inactivo';
  const informeListo = typeof estadoInforme === 'object' ? estadoInforme : null;

  // "Liberar espacio" solo tiene sentido si hay alguna visita cerrada que
  // liberar — sin eso, no se ofrece un botón que solo llevaría a una
  // pantalla vacía. Mismo hook que usa la pantalla de destino: comparten
  // queryKey, así que no se repite la consulta al entrar en ella.
  const { visitas: visitasLiberables } = useEspacioProyecto(proyectoId);

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

  // Puerta al "Terminar": no se deja terminar un proyecto que aún tiene
  // trabajo vivo. Visitas planificadas o en curso del proyecto — hay que
  // moverlas a otro proyecto o cancelarlas antes.
  const estadoActualProyecto = proyecto?.estado ?? 'activo';
  const { data: visitasVivas, refetch: refetchVisitasVivas } = useQuery({
    queryKey: ['visitas-vivas-proyecto', proyectoId],
    enabled: !!proyectoId && estadoActualProyecto !== 'terminado',
    queryFn: async (): Promise<
      Array<{ id: string; objetivo: string | null; fecha: string; estado_captura: string }>
    > => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, objetivo, fecha, estado_captura')
        .eq('proyecto_id', proyectoId!)
        .in('estado_captura', ['agendada', 'en_curso'])
        .order('fecha', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // El responsable vive en visita_participante (rol 'responsable'), no en la
  // tabla `visita` — mismo patrón que la Agenda.
  const idsVivas = (visitasVivas ?? []).map((v) => v.id);
  const { data: responsablesVivas } = useQuery({
    queryKey: ['responsables-visitas-vivas', idsVivas.join(',')],
    enabled: idsVivas.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select('visita_id, comercial_id')
        .eq('rol', 'responsable')
        .in('visita_id', idsVivas);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.visita_id, p.comercial_id]));
    },
  });
  const { data: nombresComerciales } = useQuery({
    queryKey: ['nombres-comerciales'],
    enabled: idsVivas.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from('comercial').select('id, nombre');
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((c) => [c.id, c.nombre]));
    },
  });
  // Oportunidades abiertas POR visita viva — eliminar_visita_completa
  // rechaza "cancelar" una visita con alguna (incidente 2026-09-12,
  // migración 115); esto es para no dejar pulsar "Sí, cancelar" en algo
  // que se sabe de antemano que va a fallar.
  const { data: oportunidadesAbiertasVivas } = useQuery({
    queryKey: ['oportunidades-abiertas-visitas-vivas', idsVivas.join(',')],
    enabled: idsVivas.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('oportunidad')
        .select('visita_origen_id')
        .in('visita_origen_id', idsVivas)
        .neq('etapa', 'cerrada');
      if (error) throw error;
      return (data ?? []).reduce<Record<string, number>>((acc, o) => {
        acc[o.visita_origen_id] = (acc[o.visita_origen_id] ?? 0) + 1;
        return acc;
      }, {});
    },
  });

  // Oportunidades abiertas del proyecto — solo AVISAN al terminar, no bloquean.
  const { data: oportunidadesAbiertas, refetch: refetchOportunidadesAbiertas } = useQuery({
    queryKey: ['oportunidades-abiertas-proyecto', proyectoId],
    enabled: !!proyectoId && estadoActualProyecto !== 'terminado',
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('oportunidad')
        .select('id', { count: 'exact', head: true })
        .eq('proyecto_id', proyectoId!)
        .neq('etapa', 'cerrada');
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Mientras cualquiera de estas consultas no ha resuelto no se sabe si hay
  // trabajo vivo — nunca terminar "directo" en esa ventana (se abriría la
  // puerta con el botón bloqueado hasta saberlo).
  const comprobandoTrabajoVivo =
    visitasVivas === undefined ||
    oportunidadesAbiertas === undefined ||
    (idsVivas.length > 0 && (responsablesVivas === undefined || nombresComerciales === undefined));

  const [puerta, setPuerta] = useState(false);
  // Refetch en curso al pulsar "Terminar" (evita decidir con conteos cacheados).
  const [verificandoTerminar, setVerificandoTerminar] = useState(false);

  // Refresca todo lo que un mover/cancelar de visita toca (proyecto origen y
  // destino, ficha de cliente).
  function refrescarTrasMoverVisita() {
    for (const clave of [
      ['visitas-vivas-proyecto'],
      ['resumen-visitas-proyecto'],
      ['historial-visitas-proyecto'],
      ['historial-visitas-cliente', clienteId],
      ['oportunidades-activas-proyecto'],
      ['oportunidades-abiertas-proyecto'],
      ['proximos-pasos-proyecto'],
      ['hallazgos-proyecto'],
      ['proyectos-cliente', clienteId],
    ]) {
      queryClient.invalidateQueries({ queryKey: clave });
    }
  }

  // Renombrar (lápiz de la cabecera) — UPDATE directo, requiere conexión,
  // igual que "Editar datos" del cliente.
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [formNombre, setFormNombre] = useState('');
  const guardadoNombre = useAccionAsync();

  // Cambiar estado (pausar / terminar / reactivar / reabrir) — UPDATE directo.
  const cambioEstado = useAccionAsync();

  // Borrar el proyecto: su actividad (visitas, oportunidades, hallazgos,
  // pasos) se mueve al proyecto que elija el comercial. No se puede borrar el
  // único proyecto de un cliente.
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [destinoBorrado, setDestinoBorrado] = useState('');
  const borrado = useAccionAsync();

  // Proyectos a los que se puede mover la actividad al borrar este (vigentes,
  // que no sean el propio).
  const destinosBorrado = (proyectos ?? []).filter(
    (p) => p.id !== proyectoId && p.estado !== 'terminado'
  );

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
        await conReintentoDeSesion(
          () => supabase.from('proyecto').update({ nombre: formNombre.trim() }, { count: 'exact' }).eq('id', proyectoId),
          'No se ha podido renombrar (0 filas afectadas). Puede que no tengas permiso.'
        );
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
        await conReintentoDeSesion(
          () => supabase.from('proyecto').update({ estado: nuevo }, { count: 'exact' }).eq('id', proyectoId),
          'No se ha podido cambiar el estado (0 filas afectadas). Puede que no tengas permiso.'
        );
      },
      {
        onExito: () => queryClient.invalidateQueries({ queryKey: ['proyectos-cliente', clienteId] }),
      }
    );
  }

  // Una visita EN CURSO de otro comercial no se puede cancelar desde aquí:
  // bloquea el "Terminar" hasta que esa visita se cierre.
  const visitaBloqueante = (visitasVivas ?? []).find(
    (v) =>
      v.estado_captura === 'en_curso' &&
      !!responsablesVivas?.[v.id] &&
      responsablesVivas[v.id] !== comercial?.id
  );

  async function pulsarTerminar() {
    if (cambioEstado.cargando || puerta || verificandoTerminar) return;
    cambioEstado.limpiarError();
    // Se refresca SIEMPRE antes de decidir: si la ficha traía conteos
    // cacheados de una visita anterior, un clic rápido no debe terminar
    // "directo" con datos viejos y saltarse la puerta.
    setVerificandoTerminar(true);
    let vivas = visitasVivas ?? [];
    let opps = oportunidadesAbiertas ?? 0;
    try {
      const [rv, ro] = await Promise.all([
        refetchVisitasVivas(),
        refetchOportunidadesAbiertas(),
      ]);
      vivas = rv.data ?? vivas;
      opps = ro.data ?? opps;
    } catch {
      // Si el refetch falla (sin red), se abre la puerta igualmente:
      // muestra su propio estado y no se termina a ciegas.
    } finally {
      setVerificandoTerminar(false);
    }
    if (vivas.length === 0 && opps === 0) {
      cambiarEstado('terminado');
      return;
    }
    if (!navigator.onLine) {
      cambioEstado.establecerError('Necesitas conexión para terminar el proyecto.');
      return;
    }
    setPuerta(true);
  }

  async function confirmarBorrado() {
    if (!proyectoId) return;
    const destino = destinoBorrado || destinosBorrado[0]?.id;
    if (!destino) {
      borrado.establecerError('No hay otro proyecto activo al que mover su actividad; no se puede borrar.');
      return;
    }
    if (!navigator.onLine) {
      borrado.establecerError('Necesitas conexión para borrar el proyecto.');
      return;
    }
    await borrado.ejecutar(
      async () => {
        const { error } = await supabase.rpc('eliminar_proyecto', {
          p_proyecto_id: proyectoId,
          p_destino_id: destino,
        });
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
        volverA={volver}
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
        {cargandoProyecto && <EstadoLista estado="cargando" />}
        {sinConexionProyecto && (
          <EstadoLista estado="sin-conexion" onReintentar={reintentarProyecto} />
        )}
        {errorProyecto && (
          <EstadoLista
            estado="error"
            mensaje="No se ha podido cargar este proyecto."
            onReintentar={reintentarProyecto}
          />
        )}
        {contextoLinea && (
          <div className="ficha-vitals">
            <span>{contextoLinea}</span>
          </div>
        )}
        {proyectoId && <AvisoVisitasSinCerrar proyectoId={proyectoId} />}

        {/* Acciones de estado — chips (esporádico), no botones anchos. */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 14px' }}>
          {accionesEstado.map((ac) => (
            <button
              key={ac.a}
              type="button"
              className="chip-accion"
              disabled={
                cambioEstado.cargando ||
                verificandoTerminar ||
                (ac.a === 'terminado' && puerta)
              }
              onClick={() => (ac.a === 'terminado' ? pulsarTerminar() : cambiarEstado(ac.a))}
            >
              {ac.a === 'terminado' && verificandoTerminar ? 'Comprobando…' : ac.etiqueta}
            </button>
          ))}
        </div>
        {cambioEstado.error && <Aviso tipo="error">{cambioEstado.error}</Aviso>}
        {terminado && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 10 }}>
            Proyecto terminado: solo consulta. Reábrelo para volver a iniciar o planificar visitas.
          </div>
        )}

        {puerta && (
          <PuertaTerminarProyecto
            visitas={visitasVivas ?? []}
            responsables={responsablesVivas ?? {}}
            oportunidadesAbiertasVivas={oportunidadesAbiertasVivas ?? {}}
            nombresComerciales={nombresComerciales ?? {}}
            visitaBloqueante={visitaBloqueante}
            oportunidadesAbiertas={oportunidadesAbiertas ?? 0}
            destinos={destinosBorrado}
            comprobando={comprobandoTrabajoVivo}
            cerrando={cambioEstado.cargando}
            onMovida={refrescarTrasMoverVisita}
            onCancelar={() => {
              setPuerta(false);
              cambioEstado.limpiarError();
            }}
            onTerminar={async () => {
              await cambiarEstado('terminado');
              setPuerta(false);
            }}
          />
        )}

        {editandoNombre && (
          // HojaSuperior, no tarjeta suelta — mismo fallo que "Nuevo
          // proyecto" en la ficha de cliente (Cesar, 14 sept): competía con
          // la barra fija de AccionesProyecto, casi sin sitio con el
          // teclado abierto.
          <HojaSuperior
            titulo="Nombre del proyecto"
            onCerrar={() => {
              setEditandoNombre(false);
              guardadoNombre.limpiarError();
            }}
          >
            <input
              className={`field${guardadoNombre.error ? ' field--error' : ''}`}
              autoFocus
              autoComplete="off"
              value={formNombre}
              onChange={(e) => setFormNombre(e.target.value)}
              placeholder="mantenimiento, obra nueva, postventa…"
            />
            {guardadoNombre.error && <div className="field-error-text">{guardadoNombre.error}</div>}
            <button
              className="btn btn-primary"
              style={{ marginTop: 12, width: '100%' }}
              disabled={guardadoNombre.cargando || !formNombre.trim()}
              onClick={guardarNombre}
            >
              {guardadoNombre.cargando ? 'Guardando…' : 'Guardar'}
            </button>
          </HojaSuperior>
        )}

        <div className="lista-agrupada">
          {proyectoId && <ActividadProyecto proyectoId={proyectoId} />}

          {proyectoId && (
            <SeccionLista>
              <FilaAccion
                densidad="compacta"
                titulo="Informe del proyecto"
                subtitulo={
                  informeListo
                    ? `Descargado (${formatearMB(informeListo.tamanoBytes)} MB)`
                    : estadoInforme === 'generando'
                      ? 'Generando el informe…'
                      : estadoInforme === 'sin-red'
                        ? 'Sin conexión. Inténtalo cuando tengas red'
                        : estadoInforme === 'error'
                          ? 'No se pudo generar, toca de nuevo'
                          : 'PDF con la cronología de sus visitas cerradas'
                }
                acciones={[
                  {
                    icono: 'descargar',
                    etiqueta: informeListo ? 'Descargar el informe otra vez' : 'Descargar informe',
                    onClick: informeListo ? undefined : () => descargarInforme('proyecto', proyectoId),
                    href: informeListo ? informeListo.url : undefined,
                    disabled: estadoInforme === 'generando',
                    tono: estadoInforme === 'error' ? 'riesgo' : informeListo ? 'brand' : 'neutral',
                  },
                ]}
              />
              {visitasLiberables.length > 0 && (
                <FilaNavegable
                  densidad="compacta"
                  icono="descargar"
                  titulo="Liberar espacio"
                  subtitulo={`${plural(visitasLiberables.length, 'visita cerrada', 'visitas cerradas')} en este proyecto`}
                  onClick={() =>
                    navigate(`/clientes/${clienteId}/proyectos/${proyectoId}/espacio`, { state: desde(location) })
                  }
                />
              )}
            </SeccionLista>
          )}

          {confirmandoBorrado ? (
            <ConfirmacionBorrado
              reversible="Su actividad (visitas, oportunidades, hallazgos y próximos pasos) no se borra: se mueve al proyecto que elijas."
              confirmar="Sí, borrar el proyecto"
              cargando={borrado.cargando}
              error={borrado.error}
              onCancelar={() => {
                setConfirmandoBorrado(false);
                borrado.limpiarError();
              }}
              onConfirmar={confirmarBorrado}
            >
              Se borra el proyecto «{proyecto?.nombre}» y su actividad se mueve a:
              <select
                className="field"
                style={{ marginTop: 8 }}
                value={destinoBorrado || destinosBorrado[0]?.id || ''}
                onChange={(e) => setDestinoBorrado(e.target.value)}
              >
                {destinosBorrado.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </ConfirmacionBorrado>
          ) : (
            <SeccionLista>
              <FilaNavegable
                icono="borrar"
                titulo="Borrar proyecto"
                subtitulo={
                  destinosBorrado.length === 0 ? 'No hay otro proyecto activo del cliente' : undefined
                }
                tono="riesgo"
                chevron={false}
                disabled={destinosBorrado.length === 0}
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

interface VisitaViva {
  id: string;
  objetivo: string | null;
  fecha: string;
  estado_captura: string;
}

// Card inline al pulsar "Terminar" cuando el proyecto aún tiene visitas vivas
// u oportunidades abiertas. No navega fuera. El botón "Terminar proyecto" solo
// se habilita cuando la lista de visitas está vacía (todas movidas o
// canceladas). Las oportunidades abiertas solo avisan.
function PuertaTerminarProyecto({
  visitas,
  responsables,
  oportunidadesAbiertasVivas,
  nombresComerciales,
  visitaBloqueante,
  oportunidadesAbiertas,
  destinos,
  comprobando,
  cerrando,
  onMovida,
  onCancelar,
  onTerminar,
}: {
  visitas: VisitaViva[];
  responsables: Record<string, string>;
  /** Oportunidades abiertas POR visita — eliminar_visita_completa rechaza
   *  "cancelar" una visita con alguna colgando (migración 115). */
  oportunidadesAbiertasVivas: Record<string, number>;
  nombresComerciales: Record<string, string>;
  visitaBloqueante?: VisitaViva;
  oportunidadesAbiertas: number;
  destinos: Array<{ id: string; nombre: string }>;
  comprobando: boolean;
  cerrando: boolean;
  onMovida: () => void;
  onCancelar: () => void;
  onTerminar: () => void;
}) {
  const pendientes = visitas.length;

  return (
    <div className="card">
      <div className="label" style={{ marginTop: 0 }}>Terminar el proyecto</div>

      {visitaBloqueante ? (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 'var(--text-sm)', color: 'var(--ink-700)' }}>
            Hay una visita en curso de{' '}
            <strong>
              {nombresComerciales[responsables[visitaBloqueante.id]] ?? 'otro comercial'}
            </strong>
            . Espera a que se cierre para terminar el proyecto.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onCancelar}>
              Entendido
            </button>
          </div>
        </>
      ) : (
        <>
          {pendientes > 0 && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)', color: 'var(--ink-700)' }}>
                Este proyecto tiene {pendientes} visita{pendientes === 1 ? '' : 's'} sin resolver.
                Muévelas a otro proyecto o cancélalas para poder terminarlo.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {visitas.map((v) => (
                  <FilaVisitaViva
                    key={v.id}
                    visita={v}
                    destinos={destinos}
                    oportunidadesAbiertas={oportunidadesAbiertasVivas[v.id] ?? 0}
                    onResuelta={onMovida}
                  />
                ))}
              </div>
            </>
          )}

          {oportunidadesAbiertas > 0 && (
            <div
              style={{
                display: 'flex', gap: 6, alignItems: 'flex-start',
                fontSize: 'var(--text-xs)', color: 'var(--warning-600)', marginBottom: 10,
              }}
            >
              <Icono nombre="atencion" size={13} />
              <span>
                {oportunidadesAbiertas} oportunidad{oportunidadesAbiertas === 1 ? '' : 'es'} abierta
                {oportunidadesAbiertas === 1 ? '' : 's'}: seguirán en la lista de oportunidades y en
                el pipeline. Terminar el proyecto no las cierra.
              </span>
            </div>
          )}

          {comprobando && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 10 }}>
              Comprobando visitas y oportunidades pendientes…
            </div>
          )}

          <div className="fila-btns" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" disabled={cerrando} onClick={onCancelar}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={cerrando || comprobando || pendientes > 0}
              onClick={onTerminar}
            >
              {cerrando ? 'Terminando…' : 'Terminar proyecto'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Una visita viva dentro de la puerta: moverla a otro proyecto del cliente o
// cancelarla (borrarla). Al resolverse, el padre refresca y la fila desaparece.
function FilaVisitaViva({
  visita,
  destinos,
  oportunidadesAbiertas,
  onResuelta,
}: {
  visita: VisitaViva;
  destinos: Array<{ id: string; nombre: string }>;
  oportunidadesAbiertas: number;
  onResuelta: () => void;
}) {
  const [destino, setDestino] = useState(destinos[0]?.id ?? '');
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const mover = useAccionAsync();
  const cancelar = useAccionAsync();
  const enCurso = visita.estado_captura === 'en_curso';
  const ocupado = mover.cargando || cancelar.cargando;

  async function hacerMover() {
    if (!destino) return;
    await mover.ejecutar(
      async () => {
        const { error } = await supabase.rpc('mover_visita_de_proyecto', {
          p_visita_id: visita.id,
          p_proyecto_id: destino,
        });
        if (error) throw new Error(error.message);
      },
      { onExito: onResuelta }
    );
  }

  async function hacerCancelar() {
    await cancelar.ejecutar(
      async () => {
        const { error } = await supabase.rpc('eliminar_visita_completa', {
          p_visita_id: visita.id,
        });
        if (error) throw new Error(error.message);
      },
      { onExito: onResuelta }
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--ink-200)',
        borderRadius: 'var(--radius-field)',
        padding: 10,
      }}
    >
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-900)' }}>
        {visita.objetivo?.trim() || 'Visita sin objetivo'}
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 8 }}>
        {enCurso ? 'en curso' : 'planificada'} · {fechaCorta(visita.fecha)}
      </div>

      {confirmandoCancelar ? (
        <div>
          {oportunidadesAbiertas > 0 ? (
            <div style={{ marginBottom: 6 }}>
              <Aviso tipo="error">
                No se puede cancelar: tiene{' '}
                {plural(oportunidadesAbiertas, 'oportunidad abierta', 'oportunidades abiertas')} sin cerrar.
                Ciérrala{oportunidadesAbiertas > 1 ? 's' : ''} antes.
              </Aviso>
            </div>
          ) : (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-700)', marginBottom: 6 }}>
              {enCurso
                ? 'Se borra la visita en curso y todo lo capturado en ella. No se puede deshacer.'
                : 'Se borra la visita planificada. No se puede deshacer.'}
            </div>
          )}
          {cancelar.error && <Aviso tipo="error">{cancelar.error}</Aviso>}
          <div className="fila-btns">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={ocupado}
              onClick={() => setConfirmandoCancelar(false)}
            >
              No
            </button>
            <button
              type="button"
              className="btn btn-peligro"
              disabled={ocupado || oportunidadesAbiertas > 0}
              onClick={hacerCancelar}
            >
              {cancelar.cargando ? 'Cancelando…' : 'Sí, cancelar la visita'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <select
            className="field"
            style={{ marginBottom: 6 }}
            value={destino}
            disabled={ocupado || destinos.length === 0}
            onChange={(e) => setDestino(e.target.value)}
          >
            {destinos.length === 0 ? (
              <option value="">No hay otro proyecto</option>
            ) : (
              destinos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))
            )}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              disabled={ocupado || !destino}
              onClick={hacerMover}
            >
              {mover.cargando ? 'Moviendo…' : 'Mover'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              disabled={ocupado}
              onClick={() => setConfirmandoCancelar(true)}
            >
              Cancelar visita
            </button>
          </div>
          {mover.error && <Aviso tipo="error">{mover.error}</Aviso>}
        </>
      )}
    </div>
  );
}
