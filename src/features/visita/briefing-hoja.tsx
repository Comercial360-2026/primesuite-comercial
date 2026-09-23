import { useQuery } from '@tanstack/react-query';
import { generarBriefing, BriefingError, type ConocimientoInterno } from '@/lib/generar-briefing';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { EstadoLista } from '@/components/ui/estado-lista';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaDato } from '@/components/ui/fila-dato';
import { FilaAccion } from '@/components/ui/fila-accion';
import { Aviso } from '@/components/ui/aviso';
import { capitalizarFrase } from '@/lib/texto';

interface BriefingHojaProps {
  clienteId: string;
  clienteNombre: string;
  onCerrar: () => void;
}

// Jira y Confluence se piden en paralelo en el backend: si Jira falla,
// Confluence puede haber respondido igual, así que esta sección se pinta
// tanto en el caso normal como en el de error de Jira (ver isError abajo).
function SeccionConocimientoInterno({ conocimiento }: { conocimiento: ConocimientoInterno }) {
  return (
    <SeccionLista titulo="🗂️ Conocimiento interno">
      <FilaDato etiqueta="Resumen" valor={conocimiento.resumenEjecutivo} valorTenue={conocimiento.sinPaginas} />
      {conocimiento.paginas.map((p) => (
        <FilaAccion
          key={p.url}
          titulo={p.titulo}
          subtitulo={p.espacio && p.extracto ? `${p.espacio} · ${p.extracto}` : p.espacio || p.extracto || undefined}
          acciones={[{ icono: 'vocabulario', etiqueta: 'Abrir en Confluence', href: p.url }]}
        />
      ))}
    </SeccionLista>
  );
}

// Briefing de cliente a partir de tickets reales de Jira + páginas de
// Confluence del mismo sitio Atlassian, armado con reglas de código (SIN
// IA — decisión de Cesar por coste, ver generar-briefing-cliente/index.ts).
// Las secciones objetivas (críticos, incidencias) son fiables; "contexto
// comercial" y "qué espera el cliente" son más pobres a propósito (palabras
// clave, no lectura real) — limitación conocida, no un fallo si se nota.
export function BriefingHoja({ clienteId, clienteNombre, onCerrar }: BriefingHojaProps) {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['briefing-cliente', clienteId],
    queryFn: () => generarBriefing(clienteId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <HojaSuperior titulo={`Briefing · ${clienteNombre}`} onCerrar={onCerrar}>
      {isLoading || isFetching ? (
        <EstadoLista estado="cargando" mensaje="Consultando Jira y Confluence…" />
      ) : isError ? (
        <>
          <EstadoLista
            estado="error"
            mensaje={error instanceof Error ? error.message : 'No se pudo consultar Jira.'}
            onReintentar={() => refetch()}
          />
          {error instanceof BriefingError && error.conocimientoInterno && (
            <SeccionConocimientoInterno conocimiento={error.conocimientoInterno} />
          )}
        </>
      ) : !data ? null : (
        <>
          {data.sinTickets ? (
            <EstadoLista estado="vacio" icono="briefing" mensaje="No se encontraron tickets de Jira para este cliente." />
          ) : (
            <>
              {data.criticos.length > 0 && (
                <SeccionLista titulo="🔴 Críticos" prominencia="principal">
                  {data.criticos.map((t) => (
                    <FilaDato
                      key={t.key}
                      etiqueta={`${t.key} · ${t.resumen}`}
                      valor={capitalizarFrase(t.prioridad)}
                      tono="riesgo"
                    />
                  ))}
                </SeccionLista>
              )}

              {data.incidenciasActivas.length > 0 && (
                <SeccionLista titulo="⚠️ Incidencias activas">
                  {data.incidenciasActivas.map((t) => (
                    <FilaDato
                      key={t.key}
                      etiqueta={`${t.key} · ${t.resumen}`}
                      valor={capitalizarFrase(t.estado)}
                      tono="aviso"
                    />
                  ))}
                </SeccionLista>
              )}

              <SeccionLista titulo="📊 Estado general">
                <FilaDato
                  etiqueta={data.estadoGeneral.nivel}
                  valor={data.estadoGeneral.texto}
                  tono={data.estadoGeneral.nivel === 'Mal' ? 'riesgo' : data.estadoGeneral.nivel === 'Regular' ? 'aviso' : 'ok'}
                />
              </SeccionLista>

              <SeccionLista titulo="💼 Contexto comercial">
                <FilaDato etiqueta="Menciones detectadas" valor={data.contextoComercial} valorTenue={data.contextoComercial === 'Sin novedades.'} />
              </SeccionLista>

              <SeccionLista titulo="🎯 Qué espera el cliente">
                {data.queEspera.tickets.length === 0 ? (
                  <FilaDato etiqueta={data.queEspera.texto} valor="—" valorTenue />
                ) : (
                  data.queEspera.tickets.map((t) => (
                    <FilaDato key={t.key} etiqueta={t.key} valor={t.resumen} />
                  ))
                )}
              </SeccionLista>

              <div style={{ marginTop: 4 }}>
                <Aviso tipo="info" titulo="💡 Recomendación">
                  {data.recomendacion}
                </Aviso>
              </div>
            </>
          )}

          <SeccionConocimientoInterno conocimiento={data.conocimientoInterno} />
        </>
      )}
    </HojaSuperior>
  );
}
