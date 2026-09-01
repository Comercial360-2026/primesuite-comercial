import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { useEspacioEquipo } from '@/hooks/use-espacio-equipo';
import { useAvisoLiberar } from '@/hooks/use-aviso-liberar';
import { formatearMB, type NivelEspacio } from '@/lib/espacio';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { FilaAccion } from '@/components/ui/fila-accion';
import { EstadoLista } from '@/components/ui/estado-lista';
import { BarraSeleccion } from '@/components/ui/barra-seleccion';
import { Aviso } from '@/components/ui/aviso';

type VisitaEspacio = {
  visita_id: string;
  cliente_nombre: string;
  creado_en: string;
  bytes: number;
};

interface PrevisualizacionBorrado {
  rutas_storage: string[] | null;
}

// Cuántas "más antiguas" se resumen en la pista de liberar espacio, y a
// partir de qué fracción del pozo del equipo esa pista aporta algo (por
// debajo, borrarlas no libera nada útil → es ruido).
const N_ANTIGUAS = 5;
const PISTA_ANTIGUAS_MIN_FRAC = 0.05;

// El nivel de espacio del equipo se traduce a un solo aviso. `aviso_mio`
// (tu parte orientativa alta, pero el pozo del equipo con sitio) no sale
// aquí: en esta pantalla manda el equipo.
function avisoDeNivel(nivel: NivelEspacio | undefined): { tipo: 'atencion' | 'error'; texto: string } | null {
  if (nivel === 'bloqueo')
    return { tipo: 'error', texto: 'El espacio del equipo está lleno. No se pueden subir fotos ni audios hasta que se libere.' };
  if (nivel === 'critico_equipo')
    return { tipo: 'error', texto: 'El espacio del equipo está casi lleno. Libera visitas antiguas cuanto antes.' };
  if (nivel === 'aviso_equipo')
    return { tipo: 'atencion', texto: 'El espacio del equipo va alto. Ayuda a liberar borrando visitas antiguas.' };
  return null;
}

function colorBarra(nivel: NivelEspacio | undefined): string {
  if (nivel === 'bloqueo' || nivel === 'critico_equipo') return 'var(--risk-600)';
  if (nivel === 'aviso_equipo') return 'var(--warning-600)';
  return 'var(--success-600)';
}

export function MiEspacio() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Modo seleccionar → borrar varias visitas de una pasada. El borrado en
  // lote es N× la operación individual (previsualizar → Storage → RPC) en
  // bucle: no hay RPC de lote y cada visita arrastra ficheros de Storage.
  const [seleccionando, setSeleccionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [confirmandoLote, setConfirmandoLote] = useState(false);
  const [progresoLote, setProgresoLote] = useState<{ hecho: number; total: number } | null>(null);
  const [resultadoLote, setResultadoLote] = useState<string | null>(null);
  const corriendoLote = progresoLote !== null;

  function alternarMarca(id: string) {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function entrarSeleccion() {
    setResultadoLote(null);
    setConfirmandoLote(false);
    setMarcadas(new Set());
    setSeleccionando(true);
  }

  function salirSeleccion() {
    if (corriendoLote) return;
    setSeleccionando(false);
    setConfirmandoLote(false);
    setMarcadas(new Set());
    setResultadoLote(null);
  }

  async function borrarLote() {
    if (corriendoLote) return;
    const ids = (visitas ?? []).map((v) => v.visita_id).filter((id) => marcadas.has(id));
    if (!ids.length) return;
    if (!navigator.onLine) {
      setResultadoLote('Necesitas conexión para borrar visitas.');
      return;
    }
    setConfirmandoLote(false);
    setResultadoLote(null);
    setProgresoLote({ hecho: 0, total: ids.length });
    const fallos: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        const { data, error } = await supabase
          .rpc('previsualizar_borrado_visita', { p_visita_id: id })
          .single();
        if (error) throw new Error(error.message);
        const rutas = (data as PrevisualizacionBorrado).rutas_storage ?? [];
        // Mismo orden obligatorio que el borrado individual: Storage antes
        // que el RPC (que borra la fila de participante de la cascada).
        if (rutas.length) {
          await Promise.all([
            supabase.storage.from('fotos-visita').remove(rutas),
            supabase.storage.from('audios-visita').remove(rutas),
          ]);
        }
        const { error: errDel } = await supabase.rpc('eliminar_visita_completa', { p_visita_id: id });
        if (errDel) throw new Error(errDel.message);
      } catch {
        fallos.push(id);
      }
      setProgresoLote({ hecho: i + 1, total: ids.length });
    }
    queryClient.invalidateQueries({ queryKey: espacioQueryKey });
    queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
    setProgresoLote(null);
    if (fallos.length === 0) {
      setSeleccionando(false);
      setMarcadas(new Set());
    } else {
      setMarcadas(new Set(fallos));
      setResultadoLote(`Se borraron ${ids.length - fallos.length}. ${fallos.length} no se pudieron borrar.`);
    }
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
  const sinConexion = isPaused && visitas === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey: espacioQueryKey });
    refetch();
  }

  const { estado } = useEspacioEquipo();

  // Si Dirección Comercial pidió que liberes espacio, al abrir esta pantalla
  // el aviso se da por atendido. Se guarda quién lo pidió para dejar una
  // línea visible mientras estás aquí.
  const { aviso: avisoLiberar, marcarAtendido } = useAvisoLiberar();
  const [pidioLiberar, setPidioLiberar] = useState<string | null>(null);
  const [orden, setOrden] = useState<'antiguas' | 'tamano'>('antiguas');
  useEffect(() => {
    if (avisoLiberar) {
      setPidioLiberar(avisoLiberar.pedidoPorNombre);
      marcarAtendido();
    }
  }, [avisoLiberar, marcarAtendido]);

  const aviso = avisoDeNivel(estado?.nivel);

  const visitasOrdenadas = [...(visitas ?? [])].sort((a, b) =>
    orden === 'tamano' ? b.bytes - a.bytes : a.creado_en.localeCompare(b.creado_en)
  );
  const masAntiguas = [...(visitas ?? [])]
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en))
    .slice(0, N_ANTIGUAS);
  const bytesMasAntiguas = masAntiguas.reduce((s, v) => s + v.bytes, 0);
  const pistaAntiguasVale =
    masAntiguas.length >= 2 &&
    !!estado &&
    estado.presupuesto > 0 &&
    bytesMasAntiguas >= estado.presupuesto * PISTA_ANTIGUAS_MIN_FRAC;

  const bytesMarcadas = (visitas ?? [])
    .filter((v) => marcadas.has(v.visita_id))
    .reduce((s, v) => s + v.bytes, 0);

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Mi espacio" volverA="/yo" />

      <div className="lista-agrupada">
        {pidioLiberar && (
          <Aviso tipo="atencion" titulo={`${pidioLiberar} te ha pedido liberar espacio`}>
            Abre y descarga las visitas que quieras conservar, y borra las que ya no necesites.
          </Aviso>
        )}

        {/* Medidor: el espacio del EQUIPO, que es lo que manda. En positivo
            cuando hay holgura; el Aviso avisa cuando aprieta. */}
        <div className="medidor">
          <div className="medidor__lb">Espacio del equipo</div>
          <div className="medidor__barra">
            <div
              className="medidor__relleno"
              style={{
                width: `${Math.min(estado?.pctEquipo ?? 0, 100)}%`,
                background: colorBarra(estado?.nivel),
              }}
            />
          </div>
          <div className="medidor__cifra">
            {estado
              ? `${Math.round(estado.pctEquipo)}% · quedan ${formatearMB(
                  Math.max(estado.presupuesto - estado.usadoTotal, 0)
                )} MB de ${formatearMB(estado.presupuesto)} MB`
              : 'Calculando…'}
          </div>
        </div>

        {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

        {isLoading && <EstadoLista estado="cargando" mensaje="Cargando tus visitas…" />}
        {sinConexion && <EstadoLista estado="sin-conexion" onReintentar={reintentar} />}
        {isError && (
          <EstadoLista
            estado="error"
            mensaje="No se pudo cargar tu espacio. Comprueba tu conexión e inténtalo de nuevo."
            onReintentar={reintentar}
          />
        )}
        {!isLoading && !isError && !sinConexion && visitas?.length === 0 && (
          <EstadoLista estado="vacio" mensaje="Todavía no tienes visitas." />
        )}

        {pistaAntiguasVale && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>
            Las {masAntiguas.length} más antiguas ocupan {formatearMB(bytesMasAntiguas)} MB
          </div>
        )}

        {!!visitas?.length && !seleccionando && (
          <div style={{ display: 'flex', gap: 6, paddingInline: 'var(--fila-pad-x)' }}>
            <button
              type="button"
              className={`chip${orden === 'antiguas' ? ' chip--on' : ''}`}
              onClick={() => setOrden('antiguas')}
            >
              Más antiguas primero
            </button>
            <button
              type="button"
              className={`chip${orden === 'tamano' ? ' chip--on' : ''}`}
              onClick={() => setOrden('tamano')}
            >
              Las que más ocupan
            </button>
            <button type="button" className="chip" style={{ marginLeft: 'auto' }} onClick={entrarSeleccion}>
              Seleccionar
            </button>
          </div>
        )}

        {seleccionando && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingInline: 'var(--fila-pad-x)' }}>
            <BarraSeleccion
              n={marcadas.size}
              onCancelar={salirSeleccion}
              acciones={[
                {
                  etiqueta: corriendoLote
                    ? `Borrando ${progresoLote!.hecho} de ${progresoLote!.total}…`
                    : `Borrar (${marcadas.size})`,
                  icono: 'borrar',
                  tono: 'riesgo',
                  onClick: () => setConfirmandoLote(true),
                  disabled: corriendoLote || marcadas.size === 0,
                },
              ]}
            />
            {confirmandoLote && (
              <div className="fila-confirmacion" style={{ border: '1px solid var(--ink-100)', borderRadius: 'var(--radius-control)' }}>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
                  Vas a borrar {marcadas.size} visita{marcadas.size === 1 ? '' : 's'} y todo su contenido (fotos,
                  audios, notas, hallazgos, oportunidades). Libera {formatearMB(bytesMarcadas)} MB. No se puede
                  deshacer.
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
                  Si quieres conservar alguna, cancela, ábrela y descárgala antes de borrar.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmandoLote(false)}>
                    Cancelar
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, background: 'var(--risk-600)' }}
                    onClick={borrarLote}
                  >
                    Sí, borrar {marcadas.size}
                  </button>
                </div>
              </div>
            )}
            {resultadoLote && <div className="field-error-text">{resultadoLote}</div>}
          </div>
        )}

        {!!visitas?.length && (
          <SeccionLista titulo={visitas.length === 1 ? '1 visita' : `${visitas.length} visitas`}>
            {visitasOrdenadas.map((v) =>
              seleccionando ? (
                <FilaAccion
                  key={v.visita_id}
                  densidad="compacta"
                  titulo={v.cliente_nombre}
                  subtitulo={`${fechaCorta(v.creado_en)} · ${formatearMB(v.bytes)} MB`}
                  seleccion={{
                    activa: true,
                    marcada: marcadas.has(v.visita_id),
                    onToggle: () => alternarMarca(v.visita_id),
                  }}
                />
              ) : (
                <FilaNavegable
                  key={v.visita_id}
                  densidad="compacta"
                  titulo={v.cliente_nombre}
                  subtitulo={fechaCorta(v.creado_en)}
                  valor={<span style={{ color: 'var(--ink-900)', fontWeight: 500 }}>{formatearMB(v.bytes)} MB</span>}
                  onClick={() => navigate(`/visita/${v.visita_id}/detalle`)}
                  chevron
                />
              )
            )}
          </SeccionLista>
        )}
      </div>
    </div>
  );
}
