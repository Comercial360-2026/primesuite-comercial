import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';

interface ActividadComercial {
  comercial_id: string;
  nombre: string;
  num_visitas: number;
  num_hallazgos: number;
  num_fotos: number;
  num_audios: number;
  num_notas: number;
  num_oportunidades_creadas: number;
  num_oportunidades_en_curso: number;
}

function resumen(c: ActividadComercial): string {
  const capturas = c.num_fotos + c.num_audios + c.num_notas;
  const partes = [
    `${c.num_visitas} visita${c.num_visitas === 1 ? '' : 's'}`,
    `${c.num_hallazgos} hallazgo${c.num_hallazgos === 1 ? '' : 's'}`,
    `${capturas} captura${capturas === 1 ? '' : 's'}`,
    `${c.num_oportunidades_en_curso} oportunidad${c.num_oportunidades_en_curso === 1 ? '' : 'es'} activa${c.num_oportunidades_en_curso === 1 ? '' : 's'}`,
  ];
  return partes.join(' · ');
}

export function ActividadComerciales() {
  const queryClient = useQueryClient();

  const queryKey = ['actividad-por-comercial'];
  const { data: actividad, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<ActividadComercial[]> => {
      const { data, error } = await supabase.rpc('fn_actividad_por_comercial');
      if (error) throw error;
      return (data ?? []) as ActividadComercial[];
    },
  });

  const sinConexion = isPaused && actividad === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey });
    refetch();
  }

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Actividad por comercial" volverA="/yo" ayuda="actividad-comerciales" />

      <div className="lista-agrupada">
        {isLoading ? (
          <EstadoLista estado="cargando" />
        ) : sinConexion ? (
          <EstadoLista estado="sin-conexion" onReintentar={reintentar} />
        ) : isError ? (
          <EstadoLista estado="error" mensaje="No se pudo cargar la actividad por comercial." onReintentar={reintentar} />
        ) : actividad?.length === 0 ? (
          <EstadoLista estado="vacio" mensaje="No hay comerciales activos." />
        ) : (
          <SeccionLista titulo="Por comercial">
            {actividad?.map((c) => (
              <FilaNavegable
                key={c.comercial_id}
                titulo={c.nombre}
                subtitulo={resumen(c)}
                to={`/actividad-comerciales/${c.comercial_id}`}
              />
            ))}
          </SeccionLista>
        )}
      </div>
    </div>
  );
}
