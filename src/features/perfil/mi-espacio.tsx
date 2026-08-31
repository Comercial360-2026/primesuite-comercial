import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { useDescargarInforme } from '@/hooks/use-descargar-informe';
import { useEspacioEquipo } from '@/hooks/use-espacio-equipo';

// Cuota por comercial (Fase A del sistema de backup/borrado). Ya no es un
// número fijo — se calcula dinámicamente en fn_cuota_comercial_bytes()
// según cuántos comerciales activos hay (ver 60_cuota_dinamica_por_comercial.sql).

type VisitaEspacio = {
  visita_id: string;
  cliente_nombre: string;
  creado_en: string;
  bytes: number;
};

interface PrevisualizacionBorrado {
  num_fotos: number;
  num_audios: number;
  num_notas: number;
  num_hallazgos: number;
  num_oportunidades: number;
  num_proximos_pasos: number;
  rutas_storage: string[] | null;
}

function formatearMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function MiEspacio() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Descarga de copia de una visita: misma lógica centralizada que usan Hoy,
  // la ficha de cliente y el detalle de la visita (use-descargar-informe.tsx).
  // Aquí el botón mantiene su texto propio ("copia"/"zip") porque el contexto
  // es la gestión de espacio, no "ver el informe".
  const { estadoDe, descargar } = useDescargarInforme();
  const [visitaBorrarId, setVisitaBorrarId] = useState<string | null>(null);
  const [previsualizacion, setPrevisualizacion] = useState<PrevisualizacionBorrado | null>(null);
  const previsualizando = useAccionAsync();
  const borrandoVisita = useAccionAsync();

  async function pedirBorrado(visitaId: string) {
    setVisitaBorrarId(visitaId);
    setPrevisualizacion(null);
    await previsualizando.ejecutar(async () => {
      const { data, error } = await supabase.rpc('previsualizar_borrado_visita', { p_visita_id: visitaId }).single();
      if (error) throw new Error(error.message);
      return data as PrevisualizacionBorrado;
    }, {
      onExito: (data) => setPrevisualizacion(data),
    });
  }

  function cancelarBorrado() {
    setVisitaBorrarId(null);
    setPrevisualizacion(null);
    previsualizando.limpiarError();
    borrandoVisita.limpiarError();
  }

  async function confirmarBorrado() {
    if (!visitaBorrarId) return;
    const rutas = previsualizacion?.rutas_storage ?? [];

    await borrandoVisita.ejecutar(
      async () => {
        // Orden obligatorio: primero los binarios de Storage, mientras el
        // comercial todavía es "participante" de la visita (la política de
        // borrado de Storage lo exige) — el RPC de abajo borra esa fila de
        // participante como parte de la cascada, así que si se hiciera al
        // revés, el borrado de ficheros quedaría sin permiso y fallaría.
        if (rutas.length) {
          await Promise.all([
            supabase.storage.from('fotos-visita').remove(rutas),
            supabase.storage.from('audios-visita').remove(rutas),
          ]);
        }
        const { error } = await supabase.rpc('eliminar_visita_completa', { p_visita_id: visitaBorrarId });
        if (error) throw new Error(error.message);
      },
      {
        onExito: () => {
          setVisitaBorrarId(null);
          setPrevisualizacion(null);
          queryClient.invalidateQueries({ queryKey: espacioQueryKey });
          // Misma "última visita" que se ve en la lista de Clientes puede
          // cambiar al borrar una visita — mismo hueco corregido en
          // ficha-cliente.tsx a la vez.
          queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
        },
      }
    );
  }

  const espacioQueryKey = ['mis-visitas-espacio'];
  const { data: visitas, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey: espacioQueryKey,
    refetchOnMount: 'always',
    queryFn: async (): Promise<VisitaEspacio[]> => {
      const { data, error } = await supabase.rpc('fn_mis_visitas_espacio');
      if (error) throw error;
      return (data ?? []) as VisitaEspacio[];
    },
  });
  // isPaused: mismo hueco ya corregido en agenda-del-dia.tsx,
  // listado-clientes.tsx y repaso-cliente.tsx — TanStack Query pausa la
  // consulta en vez de marcarla como error cuando decide que la red no es
  // fiable, y sin este caso la pantalla se queda en blanco.
  const sinConexion = isPaused && visitas === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey: espacioQueryKey });
    refetch();
  }

  // Reparto blando: tu parte (cuota base) es orientativa; lo que manda es
  // el pozo del equipo. Ver src/lib/espacio.ts.
  const { estado } = useEspacioEquipo();

  const mensajeEspacio =
    estado?.nivel === 'aviso_mio'
      ? `Vas usando bastante espacio (${estado.pctMio.toFixed(0)}% de tu parte). Aún hay margen del equipo, pero archiva visitas antiguas cuando puedas.`
      : estado?.nivel === 'aviso_equipo'
        ? `El espacio del equipo va al ${estado.pctEquipo.toFixed(0)}%. Ayuda a liberar borrando visitas antiguas.`
        : estado?.nivel === 'critico_equipo'
          ? `El espacio del equipo está al ${estado.pctEquipo.toFixed(0)}%. Libera visitas antiguas cuanto antes.`
          : estado?.nivel === 'bloqueo'
            ? `Espacio del equipo lleno (${estado.pctEquipo.toFixed(0)}%). No se pueden subir fotos ni audios hasta que se libere.`
            : null;
  const colorAviso =
    estado?.nivel === 'critico_equipo' || estado?.nivel === 'bloqueo'
      ? 'var(--risk-600)'
      : estado?.nivel === 'aviso_mio' || estado?.nivel === 'aviso_equipo'
        ? 'var(--warning-600)'
        : 'var(--ink-400)';

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate('/yo')} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', padding: 0 }}>
          ←
        </button>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>mi espacio</h1>
      </div>

      <div className="card" style={{ borderColor: mensajeEspacio ? colorAviso : undefined }}>
        <div className="label" style={{ marginTop: 0 }}>tu espacio</div>
        <div style={{ fontSize: 'var(--text-base)', color: colorAviso }}>
          {estado
            ? `${formatearMB(estado.miUso)} MB de ${formatearMB(estado.cuotaBase)} MB (${estado.pctMio.toFixed(0)}%)`
            : '…'}
        </div>
        <div className="label">espacio del equipo</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
          {estado
            ? `${formatearMB(estado.usadoTotal)} MB de ${formatearMB(estado.presupuesto)} MB (${estado.pctEquipo.toFixed(0)}%)`
            : '…'}
        </div>
        {mensajeEspacio && (
          <div style={{ fontSize: 'var(--text-xs)', color: colorAviso, marginTop: 6 }}>{mensajeEspacio}</div>
        )}
      </div>

      {isLoading && <div style={{ color: 'var(--ink-400)' }}>Cargando…</div>}

      {sinConexion && (
        <div className="card" style={{ borderColor: 'var(--risk-600)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
            Sin conexión. Comprueba tu red e inténtalo de nuevo.
          </div>
          <button className="btn btn-secondary" style={{ marginTop: 8, width: 'auto', padding: '0 16px' }} onClick={reintentar}>
            Reintentar
          </button>
        </div>
      )}

      {isError && (
        <div className="card" style={{ borderColor: 'var(--risk-600)' }}>
          No se pudo cargar tu espacio. Comprueba tu conexión e inténtalo de nuevo.
        </div>
      )}

      {!isLoading && !isError && !sinConexion && visitas?.length === 0 && (
        <div style={{ color: 'var(--ink-400)' }}>Todavía no tienes visitas.</div>
      )}

      {visitas?.map((v) => {
        const estado = estadoDe(v.visita_id);
        const listo = typeof estado === 'object' ? estado : null;
        const enConfirmacionBorrado = visitaBorrarId === v.visita_id;

        if (enConfirmacionBorrado) {
          return (
            <div key={v.visita_id} className="card" style={{ borderColor: 'var(--risk-600)' }}>
              {previsualizando.cargando || !previsualizacion ? (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
                  Calculando qué se va a borrar…
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
                    Esta visita arrastra: {previsualizacion.num_fotos} foto(s), {previsualizacion.num_audios} audio(s),{' '}
                    {previsualizacion.num_notas} nota(s), {previsualizacion.num_hallazgos} hallazgo(s),{' '}
                    {previsualizacion.num_oportunidades} oportunidad(es). Todo eso se borrará también. Los{' '}
                    {previsualizacion.num_proximos_pasos} próximo(s) paso(s) vinculados también se borrarán. No se puede deshacer.
                  </div>
                  {!listo && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
                      ¿Quieres descargar una copia antes de borrar?
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" onClick={cancelarBorrado} disabled={borrandoVisita.cargando}>
                      Cancelar
                    </button>
                    {listo ? (
                      <a
                        href={listo.url}
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center' }}
                      >
                        Descargar zip ({formatearMB(listo.tamanoBytes)} MB)
                      </a>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        disabled={estado === 'generando'}
                        onClick={() => descargar(v.visita_id)}
                      >
                        {estado === 'generando' ? 'Generando copia…' : 'Descargar copia primero'}
                      </button>
                    )}
                    <button
                      className="btn btn-primary"
                      style={{ background: 'var(--risk-600)' }}
                      onClick={confirmarBorrado}
                      disabled={borrandoVisita.cargando}
                    >
                      {borrandoVisita.cargando ? 'Borrando…' : 'Confirmar borrado de la visita completa'}
                    </button>
                  </div>
                  {borrandoVisita.error && (
                    <div className="field-error-text" style={{ marginTop: 8 }}>{borrandoVisita.error}</div>
                  )}
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={v.visita_id} className="card">
            <div
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}
              onClick={() => navigate(`/visita/${v.visita_id}/detalle`)}
            >
              <div>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>{v.cliente_nombre}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                  {formatearFecha(v.creado_en)} · {formatearMB(v.bytes)} MB
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-300)' }}>ver contenido</span>
                <span style={{ fontSize: 22, color: 'var(--ink-300)' }}>›</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {listo ? (
                <a
                  href={listo.url}
                  className="btn btn-primary"
                  style={{ width: 'auto', padding: '0 16px', display: 'inline-block', textAlign: 'center' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Descargar zip ({formatearMB(listo.tamanoBytes)} MB)
                </a>
              ) : (
                <button
                  className="btn btn-secondary"
                  style={{ width: 'auto', padding: '0 16px' }}
                  disabled={estado === 'generando'}
                  onClick={(e) => {
                    e.stopPropagation();
                    descargar(v.visita_id);
                  }}
                >
                  {estado === 'generando' ? 'Generando copia…' : 'Descargar copia'}
                </button>
              )}
              <button
                className="btn btn-secondary"
                style={{ width: 'auto', padding: '0 16px', color: 'var(--risk-600)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  pedirBorrado(v.visita_id);
                }}
              >
                Borrar
              </button>
            </div>
            {estado === 'error' && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--risk-600)', marginTop: 4 }}>
                No se pudo generar la copia. Inténtalo de nuevo.
              </div>
            )}
            {listo && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
                Disponible una hora — se borra solo después.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
