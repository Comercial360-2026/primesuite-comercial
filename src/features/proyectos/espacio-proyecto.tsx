import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useVolverA } from '@/lib/volver-a';
import { fechaCorta } from '@/lib/fechas';
import { formatearMB } from '@/hooks/use-descargar-informe';
import { useEspacioProyecto } from '@/hooks/use-espacio-proyecto';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaAccion } from '@/components/ui/fila-accion';
import { EstadoLista } from '@/components/ui/estado-lista';
import { BarraSeleccion } from '@/components/ui/barra-seleccion';

// Liberar espacio de TODAS las visitas cerradas de un proyecto de una vez:
// mismo candado (oportunidad abierta / cola local sin subir / no ser
// responsable) y mismo flujo (descargar backup completo con fotos y audios
// → liberar) que ya existen por visita individual (detalle-visita-cerrada)
// y en lote por comercial (Mi espacio), aquí a escala de proyecto. Toda la
// lógica vive en use-espacio-proyecto.ts — esta pantalla solo pinta.
export function EspacioProyecto() {
  const { clienteId, proyectoId } = useParams<{ clienteId: string; proyectoId: string }>();
  const queryClient = useQueryClient();
  const volver = useVolverA(`/clientes/${clienteId}/proyectos/${proyectoId}`);

  const {
    visitas,
    isLoading,
    isError,
    sinConexion,
    refetch,
    motivoBloqueo,
    progreso,
    corriendo,
    resultado,
    limpiarResultado,
    liberarSeleccionadas,
  } = useEspacioProyecto(proyectoId);

  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);

  function alternar(id: string) {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function reintentar() {
    queryClient.resetQueries({ queryKey: ['espacio-proyecto', proyectoId] });
    refetch();
  }

  const bytesMarcadas = visitas.filter((v) => marcadas.has(v.visita_id)).reduce((s, v) => s + v.bytes, 0);

  async function confirmar() {
    setConfirmando(false);
    await liberarSeleccionadas([...marcadas]);
    setMarcadas(new Set());
  }

  return (
    <div className="screen">
      <CabeceraDetalle
        titulo="Liberar espacio"
        subtitulo="Visitas cerradas de este proyecto"
        ayuda="espacio-proyecto"
        volverA={volver}
      />
      <div className="screen__scroll">
        {isLoading && <EstadoLista estado="cargando" mensaje="Cargando las visitas del proyecto…" />}
        {sinConexion && <EstadoLista estado="sin-conexion" onReintentar={reintentar} />}
        {isError && (
          <EstadoLista
            estado="error"
            mensaje="No se pudo cargar el espacio del proyecto. Comprueba tu conexión e inténtalo de nuevo."
            onReintentar={reintentar}
          />
        )}
        {!isLoading && !isError && !sinConexion && visitas.length === 0 && (
          <EstadoLista estado="vacio" mensaje="Este proyecto no tiene visitas cerradas todavía." />
        )}

        {visitas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingInline: 'var(--fila-pad-x)' }}>
            <BarraSeleccion
              n={marcadas.size}
              onCancelar={() => {
                if (corriendo) return;
                setMarcadas(new Set());
                limpiarResultado();
              }}
              acciones={[
                {
                  etiqueta: corriendo
                    ? progreso!.fase === 'descargando'
                      ? `Descargando ${progreso!.hecho} de ${progreso!.total}…`
                      : `Liberando ${progreso!.hecho} de ${progreso!.total}…`
                    : `Liberar (${marcadas.size})`,
                  icono: 'borrar',
                  tono: 'riesgo',
                  onClick: () => setConfirmando(true),
                  disabled: corriendo || marcadas.size === 0,
                },
              ]}
            />
            {confirmando && (
              <div className="fila-confirmacion" style={{ border: '1px solid var(--ink-100)', borderRadius: 'var(--radius-control)' }}>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
                  Vas a descargar el backup completo (fotos, audios y PDF) de {marcadas.size}{' '}
                  visita{marcadas.size === 1 ? '' : 's'} y, tras confirmarlo, borrarla{marcadas.size === 1 ? '' : 's'}{' '}
                  del todo. Libera {formatearMB(bytesMarcadas)} MB. No se puede deshacer.
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
                  Si una descarga falla a mitad de camino, se para ahí: lo ya respaldado se libera y el resto
                  sigue intacto para intentarlo más tarde.
                </div>
                <div className="fila-btns" style={{ marginTop: 10 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmando(false)}>
                    Cancelar
                  </button>
                  <button className="btn btn-peligro" style={{ flex: 1 }} onClick={confirmar}>
                    Sí, liberar {marcadas.size}
                  </button>
                </div>
              </div>
            )}
            {resultado && <div className="field-error-text">{resultado}</div>}
          </div>
        )}

        {visitas.length > 0 && (
          <SeccionLista titulo={visitas.length === 1 ? '1 visita cerrada' : `${visitas.length} visitas cerradas`}>
            {visitas.map((v) => {
              const motivo = motivoBloqueo(v);
              return (
                <FilaAccion
                  key={v.visita_id}
                  densidad="compacta"
                  icono={motivo ? 'atencion' : undefined}
                  titulo={fechaCorta(v.fecha)}
                  subtitulo={motivo ?? `${formatearMB(v.bytes)} MB`}
                  subtituloConTono={!!motivo}
                  tono={motivo ? 'aviso' : 'neutral'}
                  seleccion={
                    motivo
                      ? undefined
                      : {
                          activa: true,
                          marcada: marcadas.has(v.visita_id),
                          onToggle: () => alternar(v.visita_id),
                        }
                  }
                />
              );
            })}
          </SeccionLista>
        )}
      </div>
    </div>
  );
}
