import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { desde } from '@/lib/volver-a';

// El "Historial de visitas" de la ficha de cliente: TODAS las visitas del
// cliente, de cualquiera de sus proyectos, con el nombre del proyecto de
// subtítulo. La ficha de cliente es la vista "todo"; cada proyecto es una
// carpeta. El historial acotado a un proyecto vive en `ActividadProyecto`.
//
// Devuelve una <SeccionLista> (o nada si no hay visitas) — sin envoltorio
// propio, igual que `ActividadProyecto`.

interface VisitaHistorial {
  id: string;
  fecha: string;
  objetivo: string | null;
  estado_captura: string;
  proyecto: { nombre: string } | null;
}

export function HistorialVisitasCliente({ clienteId }: { clienteId: string }) {
  const origen = desde(useLocation());

  const { data: visitas } = useQuery({
    queryKey: ['historial-visitas-cliente', clienteId],
    queryFn: async (): Promise<VisitaHistorial[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, objetivo, estado_captura, proyecto:proyecto_id(nombre)')
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as VisitaHistorial[];
    },
  });

  if (!visitas?.length) return null;

  return (
    <SeccionLista titulo="Historial de visitas">
      {visitas.map((v) => {
        const estadoLegible =
          v.estado_captura === 'agendada'
            ? 'planificada'
            : v.estado_captura === 'en_curso'
              ? 'en curso'
              : 'cerrada · PDF';
        const to =
          v.estado_captura === 'agendada'
            ? `/visita/${v.id}/planificada`
            : v.estado_captura === 'en_curso'
              ? `/visita/${v.id}`
              : `/visita/${v.id}/detalle`;
        // El proyecto va DELANTE del objetivo — el subtítulo trunca a una
        // línea y el proyecto es lo que dice "de qué es esta visita".
        const subtitulo =
          [v.proyecto?.nombre ?? null, v.objetivo?.trim() || null].filter(Boolean).join(' · ') ||
          undefined;
        return (
          <FilaNavegable
            key={v.id}
            titulo={fechaCorta(v.fecha)}
            subtitulo={subtitulo}
            valor={estadoLegible}
            valorTenue
            to={to}
            state={origen}
          />
        );
      })}
    </SeccionLista>
  );
}
