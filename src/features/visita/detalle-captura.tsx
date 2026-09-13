import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { obtenerOperacion, actualizarOperacion, eliminarOperacion, EVENTO_COLA_PROCESADA } from '@/lib/offline-queue';
import { conReintentoDeSesion } from '@/lib/con-reintento-de-sesion';
import type { CapturaLibrePayload } from '@/lib/offline-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVolverA } from '@/lib/volver-a';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { Icono } from '@/components/ui/iconos';
import { RecategorizarItem } from './recategorizar-item';
import { regenerarResumenSiAuto } from '@/lib/regenerar-resumen';
import { enlaceMapa } from '@/lib/geo';
import { SelectorZona } from '@/components/ui/selector-zona';
import { TextareaDictado, InputDictado, type RefCampoDictado } from '@/components/ui/campo-dictado';

// Regla 5 (cero jerga): el estado de sincronización de la cola offline
// (pendiente/subiendo/completado/error) no se enseña nunca en crudo.
const ESTADO_SYNC_TEXTO: Record<string, string> = {
  pendiente: 'sin subir todavía',
  subiendo: 'subiendo…',
  completado: 'subido',
  error: 'error al subir',
};

// Modelo unificado de la captura que se está mirando, venga de la cola
// offline (visita en curso, aún sin subir) o de Supabase (visita ya
// cerrada, u otro dispositivo). Así la ficha —y editar/borrar— funciona
// igual esté donde esté el dato (prompt maestro 11, Fase 3): la RLS ya
// autoriza al autor y a Dirección a editar/borrar aunque la visita esté
// cerrada, y el informe se regenera con datos vivos en la siguiente
// descarga.
interface CapturaVista {
  id: string;
  tipo: 'foto' | 'audio' | 'nota';
  titulo: string;
  contenidoTexto: string;
  zonaTexto: string;
  visitaId: string | undefined;
  autorId: string | undefined;
  creadoEn: string;
  // 'cola' = vive en IndexedDB (puede estar sin subir todavía).
  // 'servidor' = solo en Supabase, sin copia local.
  fuente: 'cola' | 'servidor';
  estadoSync: string;
  archivoLocal?: Blob | null;
  latitud?: number | null;
  longitud?: number | null;
  storagePath?: string | null;
}

// Pantalla de solo-una-captura: nota (con edición), foto o audio.
export function DetalleCaptura() {
  const { capturaId } = useParams<{ capturaId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { comercial } = useSesionActual();

  const [captura, setCaptura] = useState<CapturaVista | null>(null);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [tituloEdit, setTituloEdit] = useState('');
  const [textoEdit, setTextoEdit] = useState('');
  const refDictado = useRef<RefCampoDictado>(null);
  const refDictadoTitulo = useRef<RefCampoDictado>(null);
  const [zonaEdit, setZonaEdit] = useState('');
  const [urlMedia, setUrlMedia] = useState<string | null>(null);
  const guardado = useAccionAsync();
  const borrado = useAccionAsync();
  const [guardadoConExito, setGuardadoConExito] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  useEffect(() => {
    if (!capturaId) return;
    let cancelado = false;
    (async () => {
      const op = await obtenerOperacion(capturaId);
      if (cancelado) return;
      if (op && op.entidad === 'captura_libre') {
        const p = op.payload as CapturaLibrePayload;
        setCaptura({
          id: op.id,
          tipo: p.tipo,
          titulo: p.titulo ?? '',
          contenidoTexto: p.contenidoTexto ?? '',
          zonaTexto: p.zonaTexto ?? '',
          visitaId: p.visitaId,
          autorId: p.comercialAutorId,
          creadoEn: op.creadoEn,
          fuente: 'cola',
          estadoSync: op.estado,
          archivoLocal: op.archivoLocal ?? null,
          latitud: p.latitud ?? null,
          longitud: p.longitud ?? null,
        });
        setTituloEdit(p.titulo ?? '');
        setTextoEdit(p.contenidoTexto ?? '');
        setZonaEdit(p.zonaTexto ?? '');
        setCargandoInicial(false);
        return;
      }

      // No está en la cola local: leerla de Supabase (visita cerrada u otro
      // dispositivo). Editar/borrar sigue permitido para el autor o
      // Dirección.
      const { data, error } = await supabase
        .from('captura_libre')
        .select(
          'id, tipo, titulo, contenido_texto, zona_texto, storage_path, latitud, longitud, visita_id, comercial_autor_id, creado_en'
        )
        .eq('id', capturaId)
        .maybeSingle();
      if (cancelado) return;
      if (!error && data) {
        setCaptura({
          id: data.id,
          tipo: data.tipo as CapturaVista['tipo'],
          titulo: data.titulo ?? '',
          contenidoTexto: data.contenido_texto ?? '',
          zonaTexto: data.zona_texto ?? '',
          visitaId: data.visita_id ?? undefined,
          autorId: data.comercial_autor_id ?? undefined,
          creadoEn: data.creado_en,
          fuente: 'servidor',
          estadoSync: 'completado',
          storagePath: data.storage_path,
          latitud: data.latitud,
          longitud: data.longitud,
        });
        setTituloEdit(data.titulo ?? '');
        setTextoEdit(data.contenido_texto ?? '');
        setZonaEdit(data.zona_texto ?? '');
      }
      setCargandoInicial(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [capturaId]);

  // Binario (foto/audio): de IndexedDB si hay copia local, si no de Storage
  // con una URL firmada (visita cerrada u otro dispositivo).
  useEffect(() => {
    if (!captura) return;
    if (captura.archivoLocal) {
      const url = URL.createObjectURL(captura.archivoLocal);
      setUrlMedia(url);
      return () => URL.revokeObjectURL(url);
    }
    if (captura.storagePath && (captura.tipo === 'foto' || captura.tipo === 'audio')) {
      const bucket = captura.tipo === 'foto' ? 'fotos-visita' : 'audios-visita';
      let vivo = true;
      supabase.storage
        .from(bucket)
        .createSignedUrl(captura.storagePath, 600)
        .then(({ data }) => {
          if (vivo) setUrlMedia(data?.signedUrl ?? null);
        });
      return () => {
        vivo = false;
      };
    }
    setUrlMedia(null);
  }, [captura]);

  // Regla 6 (contexto siempre visible): la cabecera dice de qué cliente y
  // proyecto es la captura.
  const visitaId = captura?.visitaId;
  const { data: contextoVisita } = useQuery({
    queryKey: ['captura-contexto-visita', visitaId],
    enabled: !!visitaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visita')
        .select('cliente:cliente_id(nombre), proyecto:proyecto_id(nombre)')
        .eq('id', visitaId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const contextoTexto = [contextoVisita?.cliente?.nombre, contextoVisita?.proyecto?.nombre ?? null]
    .filter(Boolean)
    .join(' · ');

  // Regla #14: el ← nunca es `navigate(-1)`. Quien navega aquí estampa el
  // origen (visita en curso, visita cerrada, cierre de visita); si no
  // consta, a la visita.
  const volver = useVolverA(visitaId ? `/visita/${visitaId}` : '/');

  // Guardado inmediato de zona — igual que Archivar/Borrar en otras
  // pantallas, no espera al «Guardar» general (ver detalle-hallazgo.tsx).
  // Misma rama cola/servidor que guardarEdicion() de abajo.
  async function guardarZonaYa(zona: string) {
    if (!captura) return;
    const zonaNueva = zona.trim() || undefined;
    if (captura.fuente === 'servidor' || captura.estadoSync === 'completado') {
      await conReintentoDeSesion(
        () =>
          supabase
            .from('captura_libre')
            .update({ zona_texto: zonaNueva ?? null }, { count: 'exact' })
            .eq('id', captura.id),
        'No se ha podido guardar (0 filas afectadas). Puede que no tengas permiso.'
      );
      if (captura.visitaId) {
        // Se espera el refetch: sin esto, «cambiar» podía reabrir el
        // buscador con la lista de zonas todavía vieja (carrera
        // invalidar/repintar).
        await queryClient.invalidateQueries({ queryKey: ['zonas-usadas-visita', captura.visitaId] });
        // `mis-zonas-reales-visita` (Visita activa, vista "por zona") no se
        // invalidaba nunca — solo se refrescaba sola cada 20s
        // (`refetchInterval`). La foto/nota editada aquí se quedaba
        // agrupada con la zona vieja en esa vista hasta que tocara el
        // refresco automático: parecía que el guardado no había hecho
        // nada durante ese rato (bug real reportado en vivo).
        queryClient.invalidateQueries({ queryKey: ['mis-zonas-reales-visita', captura.visitaId] });
      }
    }
    // BUG: si la captura ya estaba sincronizada (fuente 'cola' +
    // estadoSync 'completado'), el bloque de arriba escribía en el
    // servidor pero no aquí — «En esta visita» de Visita activa lee la
    // cola local, no Supabase, así que la foto seguía viéndose en la zona
    // vieja aunque el servidor ya tuviera la nueva. La copia local se
    // actualiza siempre que exista, esté ya sincronizada o no (igual que
    // ya hace guardarEdicion() más abajo).
    if (captura.fuente === 'cola') {
      const op = await obtenerOperacion(captura.id);
      if (op) {
        await actualizarOperacion(captura.id, {
          payload: { ...(op.payload as CapturaLibrePayload), zonaTexto: zonaNueva },
        });
        // Si «En esta visita» ya está montada (no siempre se vuelve a
        // montar al navegar), esta señal es lo único que la fuerza a releer
        // la cola sin esperar a su próximo evento propio.
        window.dispatchEvent(new Event(EVENTO_COLA_PROCESADA));
      }
    }
  }

  async function guardarEdicion() {
    if (!captura) return;
    const textoConsolidado = (refDictado.current?.consolidar() ?? textoEdit).trim();
    const tituloConsolidado = (refDictadoTitulo.current?.consolidar() ?? tituloEdit).trim();

    await guardado.ejecutar(
      async () => {
        const tituloNuevo = tituloConsolidado || undefined;
        const textoNuevo = textoConsolidado;
        const zonaNueva = zonaEdit.trim() || undefined;
        const enServidor = captura.fuente === 'servidor' || captura.estadoSync === 'completado';

        // BUG real (13 sept, reportado por Cesar — confirmado contra los
        // logs de Supabase: dos PATCH a `captura_libre` por cada guardado).
        // La pastilla de zona ya graba SOLA al elegirla (`guardarZonaYa`,
        // más abajo) — si lo único que se tocó fue la zona, pulsar el
        // «Guardar» general repetía la MISMA escritura por segunda vez sin
        // necesidad, doblando el tiempo de espera en cada guardado. Si
        // título, texto y zona ya coinciden con lo que hay guardado, no
        // hay nada que mandar al servidor.
        if (
          tituloNuevo === (captura.titulo || undefined) &&
          textoNuevo === captura.contenidoTexto &&
          zonaNueva === (captura.zonaTexto || undefined)
        ) {
          return;
        }

        if (enServidor) {
          // Ya sincronizada: UPDATE directo contra la tabla. Sin permiso,
          // Supabase NO da error — el UPDATE "tiene éxito" afectando a 0
          // filas (mismo encargo técnico que el borrado, ver
          // adenda_punto1_delete_silencioso.md); comprobar `count` es la
          // única forma de no decir "guardado" sin haber tocado nada.
          await conReintentoDeSesion(
            () =>
              supabase
                .from('captura_libre')
                .update(
                  { contenido_texto: textoNuevo || null, titulo: tituloNuevo ?? null, zona_texto: zonaNueva ?? null },
                  { count: 'exact' }
                )
                .eq('id', captura.id),
            'No se ha podido guardar (0 filas afectadas). Puede que no tengas permiso — solo el autor o Dirección Comercial pueden editar una nota.'
          );
        }

        if (captura.fuente === 'cola') {
          // Alinear la copia local (única fuente de verdad hasta que
          // sincronice; y para que la UI no dependa de una relectura).
          const op = await obtenerOperacion(captura.id);
          if (op) {
            await actualizarOperacion(captura.id, {
              payload: {
                ...(op.payload as CapturaLibrePayload),
                titulo: tituloNuevo,
                contenidoTexto: textoNuevo,
                zonaTexto: zonaNueva,
              },
            });
            window.dispatchEvent(new Event(EVENTO_COLA_PROCESADA));
          }
        }

        // Si la visita está cerrada y su resumen es automático, se rehace.
        if (enServidor) await regenerarResumenSiAuto(captura.visitaId);
      },
      {
        onExito: async () => {
          setCaptura((prev) =>
            prev
              ? { ...prev, titulo: tituloConsolidado, contenidoTexto: textoConsolidado, zonaTexto: zonaEdit.trim() }
              : prev
          );
          setGuardadoConExito(true);
          if (captura.visitaId) {
            queryClient.invalidateQueries({ queryKey: ['detalle-visita-cerrada', captura.visitaId] });
            await queryClient.invalidateQueries({ queryKey: ['zonas-usadas-visita', captura.visitaId] });
            queryClient.invalidateQueries({ queryKey: ['mis-zonas-reales-visita', captura.visitaId] });
          }
          // Breve pausa para que "guardado ✓" sea visible antes de volver.
          setTimeout(() => navigate(volver), 700);
        },
        mensajeError:
          'No se pudo actualizar. Si la nota ya estaba sincronizada, puede que falte permiso de edición en el servidor.',
      }
    );
  }

  async function confirmarBorrado() {
    if (!captura) return;

    await borrado.ejecutar(
      async () => {
        const enServidor = captura.fuente === 'servidor' || captura.estadoSync === 'completado';

        if (enServidor) {
          // Si tiene binario (foto/audio), primero se borra el archivo de
          // Storage y luego la fila — en ese orden, para no dejar la fila
          // borrada apuntando a un archivo que ya no se puede limpiar. La
          // cola local nunca guarda `storage_path`, así que se lee de
          // Supabase cuando la fuente es la cola.
          let storagePath = captura.storagePath ?? null;
          let tipo = captura.tipo;
          if (captura.fuente === 'cola') {
            const { data: fila, error: errLectura } = await supabase
              .from('captura_libre')
              .select('storage_path, tipo')
              .eq('id', captura.id)
              .single();
            if (errLectura) throw new Error(errLectura.message);
            storagePath = fila?.storage_path ?? null;
            tipo = (fila?.tipo as CapturaVista['tipo']) ?? tipo;
          }

          if (storagePath) {
            const bucket = tipo === 'foto' ? 'fotos-visita' : 'audios-visita';
            const { error: errStorage } = await supabase.storage.from(bucket).remove([storagePath]);
            if (errStorage) {
              console.error(
                'No se pudo borrar el archivo de Storage, se continúa con el borrado de la fila:',
                errStorage.message
              );
            }
          }

          await conReintentoDeSesion(
            () => supabase.from('captura_libre').delete({ count: 'exact' }).eq('id', captura.id),
            'No se ha podido borrar (0 filas afectadas). Puede que no tengas permiso — solo el autor o Dirección Comercial pueden borrar una captura.'
          );
        }

        if (captura.fuente === 'cola') {
          await eliminarOperacion(captura.id);
        }

        if (enServidor) await regenerarResumenSiAuto(captura.visitaId);
      },
      {
        onExito: () => {
          if (captura.visitaId) {
            queryClient.invalidateQueries({ queryKey: ['detalle-visita-cerrada', captura.visitaId] });
          }
          navigate(volver);
        },
        mensajeError: 'No se pudo borrar la captura. Inténtalo de nuevo.',
      }
    );
  }

  if (cargandoInicial) return null;

  if (!captura) {
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Captura" ayuda="detalle-captura" volverA={volver} />
        <p style={{ color: 'var(--ink-400)' }}>No se ha encontrado esta captura.</p>
      </div>
    );
  }

  const mostrarEstadoSync = captura.fuente === 'cola' && captura.estadoSync !== 'completado';

  return (
    <div className="screen">
      <CabeceraDetalle
        titulo={captura.tipo === 'nota' ? 'Nota' : captura.tipo === 'foto' ? 'Foto' : 'Audio'}
        subtitulo={contextoTexto || undefined}
        ayuda="detalle-captura"
        onVolver={() => (confirmandoBorrado ? setConfirmandoBorrado(false) : navigate(volver))}
      />

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
        {new Date(captura.creadoEn).toLocaleString('es-ES')}
        {mostrarEstadoSync ? ` · ${ESTADO_SYNC_TEXTO[captura.estadoSync] ?? captura.estadoSync}` : ''}
      </div>

      {captura.tipo === 'nota' && (
        <RecategorizarItem
          id={captura.id}
          tipoActual="nota"
          visitaId={captura.visitaId}
          origen={{ from: volver }}
          sinSubir={captura.fuente === 'cola' && captura.estadoSync !== 'completado'}
          motivoBloqueo={
            comercial?.rol === 'direccion_comercial' || captura.autorId === comercial?.id
              ? undefined
              : 'Solo el autor o Dirección Comercial pueden cambiarlo de tipo.'
          }
        />
      )}

      {captura.tipo === 'foto' && urlMedia && (
        <img src={urlMedia} alt="captura" style={{ width: '100%', borderRadius: 12 }} />
      )}

      {captura.tipo === 'foto' && captura.latitud != null && captura.longitud != null && (
        <a
          className="btn-enlace"
          href={enlaceMapa(captura.latitud, captura.longitud)}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}
        >
          <Icono nombre="ubicacion" size={14} /> Abrir en el mapa
        </a>
      )}

      {captura.tipo === 'audio' && urlMedia && <audio controls src={urlMedia} style={{ width: '100%' }} />}

      {(captura.tipo === 'foto' || captura.tipo === 'audio') && (
        <>
          <InputDictado
            ref={refDictadoTitulo}
            valor={tituloEdit}
            onCambio={setTituloEdit}
            placeholder={captura.tipo === 'foto' ? 'qué es esta foto (opcional)' : 'qué es este audio (opcional)'}
          />
          <div className="label">Zona (opcional)</div>
          <SelectorZona
            visitaId={captura.visitaId}
            value={zonaEdit}
            onChange={setZonaEdit}
            onGuardar={guardarZonaYa}
          />
        </>
      )}

      {captura.tipo === 'nota' && (
        <>
          <input
            className="field"
            autoComplete="off"
            value={tituloEdit}
            onChange={(e) => setTituloEdit(e.target.value)}
            placeholder="título breve (opcional)"
          />
          <TextareaDictado ref={refDictado} rows={6} autoFocus valor={textoEdit} onCambio={setTextoEdit} />
          <div className="label">Zona (opcional)</div>
          <SelectorZona
            visitaId={captura.visitaId}
            value={zonaEdit}
            onChange={setZonaEdit}
            onGuardar={guardarZonaYa}
          />
        </>
      )}

      {guardado.error && <div className="field-error-text">{guardado.error}</div>}

      {/* Un solo botón "Guardar" — mismo patrón que hallazgo/oportunidad/
          próximo paso (antes esta pantalla tenía uno duplicado por tipo,
          con su propio texto "Guardar cambios" y sin anclar abajo: no
          hacía juego con el resto de la app). Mientras la confirmación de
          borrado está abierta, baja a secundario para no competir. */}
      <button
        className={`btn ${confirmandoBorrado ? 'btn-secondary' : 'btn-primary'}`}
        style={{ marginTop: 'auto' }}
        disabled={guardado.cargando || guardadoConExito || (captura.tipo === 'nota' && !textoEdit.trim())}
        onClick={guardarEdicion}
      >
        {guardadoConExito ? (
          <>
            <Icono nombre="check" size={16} /> Guardado
          </>
        ) : guardado.cargando ? (
          'Guardando…'
        ) : (
          'Guardar'
        )}
      </button>

      {!confirmandoBorrado ? (
        <FilaNavegable
          icono="borrar"
          titulo={`Borrar ${captura.tipo}`}
          tono="riesgo"
          chevron={false}
          onClick={() => setConfirmandoBorrado(true)}
        />
      ) : (
        <ConfirmacionBorrado
          onCancelar={() => setConfirmandoBorrado(false)}
          onConfirmar={confirmarBorrado}
          cargando={borrado.cargando}
          error={borrado.error}
        >
          {captura.tipo !== 'nota' ? 'El archivo se borrará también del almacenamiento.' : ''}
        </ConfirmacionBorrado>
      )}
    </div>
  );
}
