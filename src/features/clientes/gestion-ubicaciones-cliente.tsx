import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useUbicacionesCliente } from '@/hooks/use-ubicaciones-cliente';
import { eliminarOperacion } from '@/lib/offline-queue';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';

interface PrevisualizacionBorradoUbicacion {
  num_fotos: number;
  num_audios: number;
  num_notas: number;
  num_hallazgos: number;
  num_oportunidades: number;
}

// Pantalla de gestión del catálogo de ubicaciones de un cliente concreto —
// mismo patrón que "gestionar vocabulario", pero acotado a un cliente.
// Punto de entrada complementario a la creación inline en Modo Recorrido:
// aquí se planifica antes de una visita o se corrige después (renombrar,
// borrar), sin depender de estar dentro de una visita activa.
export function GestionUbicacionesCliente() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const { comercial } = useSesionActual();
  const queryClient = useQueryClient();
  const { ubicaciones, crear, recargarLocales } = useUbicacionesCliente(clienteId, comercial?.id ?? '');

  const [nuevoTexto, setNuevoTexto] = useState('');
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);

  const [renombrandoId, setRenombrandoId] = useState<string | null>(null);
  const [textoRenombrar, setTextoRenombrar] = useState('');
  const [guardandoRenombre, setGuardandoRenombre] = useState(false);
  const [errorRenombre, setErrorRenombre] = useState<string | null>(null);

  const [confirmandoBorrarId, setConfirmandoBorrarId] = useState<string | null>(null);
  const [previsualizacion, setPrevisualizacion] = useState<PrevisualizacionBorradoUbicacion | null>(null);
  const [cargandoPrevisualizacion, setCargandoPrevisualizacion] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['ubicaciones-cliente', clienteId] });
  }

  async function crearUbicacion() {
    if (!nuevoTexto.trim()) return;
    setCreando(true);
    setErrorCrear(null);
    try {
      await crear(nuevoTexto.trim());
      setNuevoTexto('');
    } catch (err) {
      setErrorCrear(err instanceof Error ? err.message : 'No se pudo crear la ubicación.');
    } finally {
      setCreando(false);
    }
  }

  async function guardarRenombre(id: string) {
    if (!textoRenombrar.trim()) return;
    setGuardandoRenombre(true);
    setErrorRenombre(null);
    const { error } = await supabase.from('ubicacion').update({ nombre: textoRenombrar.trim() }).eq('id', id);
    setGuardandoRenombre(false);
    if (error) {
      setErrorRenombre(error.message);
      return;
    }
    setRenombrandoId(null);
    invalidar();
  }

  async function abrirConfirmacionBorrado(id: string) {
    setConfirmandoBorrarId(id);
    setPrevisualizacion(null);
    setErrorBorrado(null);
    setCargandoPrevisualizacion(true);
    const { data, error } = await supabase
      .rpc('previsualizar_borrado_ubicacion', { p_ubicacion_id: id })
      .single();
    setCargandoPrevisualizacion(false);
    if (error) {
      setErrorBorrado(error.message);
      return;
    }
    setPrevisualizacion(data as PrevisualizacionBorradoUbicacion);
  }

  async function confirmarBorrado(id: string) {
    setBorrando(true);
    setErrorBorrado(null);
    const { error } = await supabase.rpc('eliminar_ubicacion', { p_ubicacion_id: id });
    setBorrando(false);
    // Si el servidor dice "count 0 — ya no existe", el resultado que quiere
    // el usuario (que esta ubicación desaparezca) ya se cumple igual — no
    // es un fallo real que deba bloquear la limpieza de la copia local.
    // Solo se trata como error de verdad cualquier otro mensaje (permisos,
    // red, etc.), que sí debe detener el flujo y avisar.
    const yaNoExiste = error?.message.includes('count 0');
    if (error && !yaNoExiste) {
      setErrorBorrado(error.message);
      return;
    }
    // El borrado real va directo a Supabase (no por la cola offline), pero
    // la ubicación pudo quedar guardada en la cola local desde que se creó
    // (por ejemplo, si se creó sin conexión desde Modo Recorrido). Sin
    // limpiarla aquí, esa copia local reaparece como "fantasma" con el
    // nombre original en cuanto el servidor deja de tener el registro que
    // la tapaba — bug real, encontrado probando el ciclo completo en vivo,
    // no solo revisando el código.
    await eliminarOperacion(id);
    await recargarLocales();
    setConfirmandoBorrarId(null);
    invalidar();
  }

  const total = previsualizacion
    ? previsualizacion.num_fotos +
      previsualizacion.num_audios +
      previsualizacion.num_notas +
      previsualizacion.num_hallazgos +
      previsualizacion.num_oportunidades
    : 0;

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Ubicaciones" />
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
        se usan para etiquetar fotos por dónde se tomaron (naves, oficinas…) en Modo Recorrido
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          className="field"
          style={{ flex: 1 }}
          value={nuevoTexto}
          onChange={(e) => setNuevoTexto(e.target.value)}
          placeholder="nueva ubicación…"
        />
        <button
          className="btn btn-primary"
          style={{ width: 'auto', padding: '0 16px' }}
          disabled={!nuevoTexto.trim() || creando}
          onClick={crearUbicacion}
        >
          {creando ? 'Creando…' : '+ Añadir'}
        </button>
      </div>
      {errorCrear && <div className="field-error-text">{errorCrear}</div>}

      {ubicaciones.length === 0 && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', marginTop: 12 }}>
          este cliente todavía no tiene ubicaciones
        </div>
      )}

      {ubicaciones.map((u) => (
        <div key={u.id} className="card" style={{ marginTop: 8 }}>
          {renombrandoId === u.id ? (
            <>
              <input
                className="field"
                autoFocus
                value={textoRenombrar}
                onChange={(e) => setTextoRenombrar(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={() => setRenombrandoId(null)} disabled={guardandoRenombre}>
                  cancelar
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!textoRenombrar.trim() || guardandoRenombre}
                  onClick={() => guardarRenombre(u.id)}
                >
                  {guardandoRenombre ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
              {errorRenombre && <div className="field-error-text" style={{ marginTop: 8 }}>{errorRenombre}</div>}
            </>
          ) : confirmandoBorrarId === u.id ? (
            <>
              {cargandoPrevisualizacion ? (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>comprobando uso…</div>
              ) : previsualizacion ? (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)' }}>
                  {total > 0
                    ? `"${u.nombre}" tiene ${previsualizacion.num_fotos} foto(s), ${previsualizacion.num_audios} audio(s), ${previsualizacion.num_notas} nota(s), ${previsualizacion.num_hallazgos} hallazgo(s) y ${previsualizacion.num_oportunidades} oportunidad(es) vinculados. Se borrará la ubicación; esos elementos se quedan sin ubicación asignada, no se borran.`
                    : `"${u.nombre}" no tiene nada vinculado.`}
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={() => setConfirmandoBorrarId(null)} disabled={borrando}>
                  cancelar
                </button>
                <button
                  className="btn btn-primary"
                  style={{ background: 'var(--risk-600)' }}
                  disabled={borrando || cargandoPrevisualizacion}
                  onClick={() => confirmarBorrado(u.id)}
                >
                  {borrando ? 'Borrando…' : 'Confirmar borrado'}
                </button>
              </div>
              {errorBorrado && <div className="field-error-text" style={{ marginTop: 8 }}>{errorBorrado}</div>}
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-sm)' }}>
                {u.nombre}
                {!u.sincronizada && <span style={{ color: 'var(--ink-400)', fontSize: 11 }}> · guardando…</span>}
              </span>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    setRenombrandoId(u.id);
                    setTextoRenombrar(u.nombre);
                  }}
                  style={{ border: 'none', background: 'none', color: 'var(--brand-600)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  onClick={() => abrirConfirmacionBorrado(u.id)}
                  style={{ border: 'none', background: 'none', color: 'var(--risk-600)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                >
                  Borrar
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
