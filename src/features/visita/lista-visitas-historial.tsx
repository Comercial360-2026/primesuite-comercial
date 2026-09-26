import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { desgloseVisita } from '@/lib/texto';
import { desde } from '@/lib/volver-a';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';

// Historial de visitas de un proyecto o de un cliente (prompt maestro 13):
// una fila por visita que dice a qué fue (objetivo junto a la fecha) y qué
// tiene dentro ("2 notas · 1 hallazgo · 12 fotos"). Lo capturado vive DENTRO
// de su visita — el proyecto ya no lo repite suelto en listas de notas y
// hallazgos. La fila solo navega: descargar y borrar viven en la visita.

export interface VisitaHistorial {
  id: string;
  fecha: string;
  objetivo: string | null;
  estado_captura: string;
}

type Totales = Parameters<typeof desgloseVisita>[0];

// Lo capturado en cada visita, contado en el móvil sobre columnas mínimas
// (id de visita y tipo): son como mucho 10 visitas.
function useRecuentoVisitas(ids: string[]) {
  return useQuery({
    queryKey: ['recuento-visitas', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const [capturas, hallazgos, oportunidades, pasos] = await Promise.all([
        supabase.from('captura_libre').select('visita_id, tipo').in('visita_id', ids),
        supabase.from('hallazgo').select('visita_id').in('visita_id', ids),
        supabase.from('oportunidad').select('visita_origen_id').in('visita_origen_id', ids),
        supabase.from('proximo_paso').select('visita_id').in('visita_id', ids),
      ]);
      for (const r of [capturas, hallazgos, oportunidades, pasos]) if (r.error) throw r.error;

      const t: Record<string, Totales> = {};
      const de = (id: string | null) =>
        (t[id ?? ''] ??= { fotos: 0, audios: 0, notas: 0, hallazgos: 0, oportunidades: 0, pasos: 0 });
      for (const c of capturas.data ?? []) {
        if (c.tipo === 'foto') de(c.visita_id).fotos++;
        else if (c.tipo === 'audio') de(c.visita_id).audios++;
        else if (c.tipo === 'nota') de(c.visita_id).notas++;
      }
      for (const h of hallazgos.data ?? []) de(h.visita_id).hallazgos++;
      for (const o of oportunidades.data ?? []) de(o.visita_origen_id).oportunidades++;
      for (const p of pasos.data ?? []) de(p.visita_id).pasos++;
      return Object.fromEntries(Object.entries(t).map(([id, tot]) => [id, desgloseVisita(tot)]));
    },
  });
}

export function ListaVisitasHistorial({ visitas }: { visitas: VisitaHistorial[] }) {
  const origen = desde(useLocation());
  const { data: recuento } = useRecuentoVisitas(visitas.map((v) => v.id));

  return (
    <SeccionLista titulo="Visitas">
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
        const objetivo = v.objetivo?.trim();
        const dentro = recuento?.[v.id];
        return (
          <FilaNavegable
            key={v.id}
            titulo={objetivo ? `${fechaCorta(v.fecha)} · ${objetivo}` : fechaCorta(v.fecha)}
            subtitulo={dentro || (recuento && estadoLegible.startsWith('cerrada') ? 'sin nada anotado' : undefined)}
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
