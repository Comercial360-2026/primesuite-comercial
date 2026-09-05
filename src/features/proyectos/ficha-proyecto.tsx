import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { haceRelativo } from '@/lib/fechas';
import { useProyectosCliente } from '@/hooks/use-proyectos-cliente';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { ActividadProyecto } from './actividad-proyecto';
import { AccionesProyecto } from './acciones-proyecto';

// Ficha de proyecto — Fase 3 del plan Cliente → Proyecto → Visita. Es lo
// que antes vivía directamente en la ficha de cliente (oportunidades,
// próximos pasos, historial, planificar/iniciar visita): al meter proyecto
// en medio, todo eso pasa a colgar de AQUÍ, porque una visita ahora
// pertenece a un proyecto concreto, no solo a un cliente.
//
// Excepción (1.5 del recorrido de revisión): si el cliente solo tiene su
// Proyecto General, esta pantalla y la ficha de cliente son casi lo mismo y
// obligan a un salto de navegación de más. En ese caso se redirige a la
// ficha de cliente, que muestra la actividad del General en línea. La
// pantalla propia del proyecto solo aparece cuando hay 2+ proyectos.

export function FichaProyecto() {
  const { clienteId, proyectoId } = useParams<{ clienteId: string; proyectoId: string }>();

  // Clave distinta de ['cliente', clienteId] (la que usa Ficha de cliente,
  // con más columnas) — mismo cliente_id pero forma de datos distinta; con
  // la misma clave, TanStack Query serviría aquí la caché de la otra
  // pantalla (o al revés), mostrando "undefined" en campos que esta consulta
  // nunca pidió. Bug real, detectado navegando en vivo entre las dos fichas.
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

  // Misma consulta que usa la Ficha de cliente (una sola clave para las dos
  // pantallas): así "cuántos proyectos hay" es un único dato y basta con
  // invalidarlo al crear uno. `proyecto` sale de aquí, no de una consulta
  // aparte.
  const { data: proyectos } = useProyectosCliente(clienteId);
  const proyecto = proyectos?.find((p) => p.id === proyectoId);

  // Recuento total de visitas de ESTE proyecto (P11) y fecha de la última —
  // para la línea de contexto de la cabecera.
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

  // Redirección al fundir (1.5): solo cuando la lista de proyectos ya ha
  // cargado y confirma que el General es el único — mientras carga no se
  // redirige.
  if (proyectos && proyectos.length === 1 && proyectos[0].es_general && proyectos[0].id === proyectoId) {
    return <Navigate to={`/clientes/${clienteId}`} replace />;
  }

  // Línea de contexto (regla 6: siempre visible, sin depender de "volver").
  // "N visitas" es retrospectivo del proyecto (P11), no el ordinal de "la
  // visita en la que estás" (eso es Visita activa).
  const contextoLinea = [
    proyecto?.estado,
    resumenVisitas
      ? resumenVisitas.total === 0
        ? 'sin visitas todavía'
        : `${resumenVisitas.total} visita${resumenVisitas.total === 1 ? '' : 's'}`
      : null,
    resumenVisitas?.ultima ? `última ${haceRelativo(resumenVisitas.ultima)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo={proyecto?.nombre ?? '…'}
        ayuda="ficha-proyecto"
        subtitulo={cliente?.nombre}
        volverA={`/clientes/${clienteId}`}
      />

      <div className="screen__scroll">
        {contextoLinea && (
          <div className="ficha-vitals">
            <span>{contextoLinea}</span>
          </div>
        )}
        <div className="lista-agrupada">
          {proyectoId && <ActividadProyecto proyectoId={proyectoId} />}
        </div>
      </div>

      {clienteId && proyectoId && (
        <AccionesProyecto
          clienteId={clienteId}
          proyectoId={proyectoId}
          clienteNombre={cliente?.nombre}
        />
      )}
    </div>
  );
}
