import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { desde, useVolverA } from '@/lib/volver-a';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Segmentado } from '@/components/ui/segmentado';
import { desdeDePeriodo, periodoDeParams, type PeriodoActividad } from './periodo-actividad';

interface ActividadProyecto {
  proyecto_id: string;
  proyecto_nombre: string;
  cliente_id: string;
  cliente_nombre: string;
  num_visitas: number;
  num_hallazgos: number;
  num_fotos: number;
  num_audios: number;
  num_notas: number;
  num_oportunidades_creadas: number;
  num_oportunidades_en_curso: number;
}

export function DetalleActividadComercial() {
  const { comercialId } = useParams<{ comercialId: string }>();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const periodo = periodoDeParams(searchParams);
  // Se llega desde la lista "Actividad por comercial" o desde la ficha del
  // comercial. El ← vuelve al origen (conservando su `?dias=`); si no
  // consta, a la lista.
  const volver = useVolverA('/actividad-comerciales');
  const location = useLocation();

  function cambiarPeriodo(v: PeriodoActividad) {
    setSearchParams(v === 'todo' ? { dias: 'todo' } : {}, { replace: true });
  }

  const { data: comercial } = useQuery({
    queryKey: ['comercial-nombre', comercialId],
    queryFn: async () => {
      const { data, error } = await supabase.from('comercial').select('nombre').eq('id', comercialId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!comercialId,
  });

  const queryKey = ['actividad-comercial-proyecto', comercialId, periodo];
  const { data: porProyecto, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<ActividadProyecto[]> => {
      const { data, error } = await supabase.rpc('fn_actividad_comercial_por_proyecto', {
        p_comercial_id: comercialId!,
        p_desde: desdeDePeriodo(periodo) ?? undefined,
      });
      if (error) throw error;
      return (data ?? []) as ActividadProyecto[];
    },
    enabled: !!comercialId,
  });

  const sinConexion = isPaused && porProyecto === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey });
    refetch();
  }

  return (
    <div className="screen">
      {/* Regla #14: el origen real lo estampa quien navega aquí (la lista o
          la ficha del comercial), conservando su `?dias=`; el fallback es la
          lista. */}
      <CabeceraDetalle
        titulo={comercial?.nombre ?? 'Comercial'}
        subtitulo="Actividad por proyecto"
        ayuda="detalle-actividad-comercial"
        avatar={comercial?.nombre}
        volverA={volver}
      />

      <Segmentado
        opciones={[
          { valor: '30d', etiqueta: 'Últimos 30 días' },
          { valor: 'todo', etiqueta: 'Todo' },
        ]}
        valor={periodo}
        onCambio={cambiarPeriodo}
      />

      <div className="lista-agrupada">
        {isLoading ? (
          <EstadoLista estado="cargando" />
        ) : sinConexion ? (
          <EstadoLista estado="sin-conexion" onReintentar={reintentar} />
        ) : isError ? (
          <EstadoLista estado="error" mensaje="No se pudo cargar la actividad de este comercial." onReintentar={reintentar} />
        ) : porProyecto?.length === 0 ? (
          <EstadoLista
            estado="vacio"
            mensaje={periodo === 'todo' ? 'Sin actividad registrada todavía.' : 'Sin actividad en los últimos 30 días.'}
          />
        ) : (
          <SeccionLista titulo="Por proyecto">
            {porProyecto?.map((p) => {
              const capturas = p.num_fotos + p.num_audios + p.num_notas;
              const etiqueta = `${p.cliente_nombre} › ${p.proyecto_nombre}`;
              // Toda la métrica en el subtítulo (ancho completo, como en la
              // lista) — antes iba en `valor`, apretada a la derecha, y
              // "oportunidades activas" caía a su propia línea.
              const metrica = [
                `${p.num_visitas} visita${p.num_visitas === 1 ? '' : 's'}`,
                `${p.num_hallazgos} hallazgo${p.num_hallazgos === 1 ? '' : 's'}`,
                `${capturas} captura${capturas === 1 ? '' : 's'}`,
                `${p.num_oportunidades_en_curso} oportunidad${p.num_oportunidades_en_curso === 1 ? '' : 'es'} activa${p.num_oportunidades_en_curso === 1 ? '' : 's'}`,
              ].join(' · ');
              return (
                <FilaNavegable
                  key={p.proyecto_id}
                  avatar={p.proyecto_nombre}
                  avatarForma="proyecto"
                  titulo={etiqueta}
                  subtitulo={metrica}
                  to={`/clientes/${p.cliente_id}/proyectos/${p.proyecto_id}`}
                  state={desde(location)}
                />
              );
            })}
          </SeccionLista>
        )}
      </div>
    </div>
  );
}
