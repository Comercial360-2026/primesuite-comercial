import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Segmentado } from '@/components/ui/segmentado';
import { Avatar, colorAvatarDe } from '@/components/ui/avatar';
import { GraficoBarras } from '@/components/ui/grafico-barras';
import { desde } from '@/lib/volver-a';
import { desdeDePeriodo, periodoDeParams, type PeriodoActividad } from './periodo-actividad';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const periodo = periodoDeParams(searchParams);

  function cambiarPeriodo(v: PeriodoActividad) {
    // "30d" es el valor por defecto → no ensucia la URL; solo "todo" queda
    // como parámetro, y así se arrastra a la ficha de cada comercial.
    setSearchParams(v === 'todo' ? { dias: 'todo' } : {}, { replace: true });
  }

  const queryKey = ['actividad-por-comercial', periodo];
  const { data: actividad, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<ActividadComercial[]> => {
      const { data, error } = await supabase.rpc('fn_actividad_por_comercial', {
        p_desde: desdeDePeriodo(periodo) ?? undefined,
      });
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
          <EstadoLista estado="error" mensaje="No se pudo cargar la actividad por comercial." onReintentar={reintentar} />
        ) : actividad?.length === 0 ? (
          <EstadoLista estado="vacio" mensaje="No hay comerciales activos." />
        ) : (
          <>
            {/* Visitas por comercial, de un vistazo — el resto del desglose
                (hallazgos, capturas, oportunidades) sigue en el subtítulo de
                cada fila de abajo; esto es la cifra que manda para Dirección. */}
            <GraficoBarras
              items={[...(actividad ?? [])]
                .sort((a, b) => b.num_visitas - a.num_visitas)
                .map((c) => ({
                  id: c.comercial_id,
                  etiqueta: (
                    <>
                      <Avatar nombre={c.nombre} /> {c.nombre}
                    </>
                  ),
                  valor: c.num_visitas,
                  valorTexto: `${c.num_visitas} visita${c.num_visitas === 1 ? '' : 's'}`,
                  color: colorAvatarDe(c.nombre),
                }))}
            />

            <SeccionLista titulo="Por comercial">
              {/* Mismo orden que el gráfico de arriba (más actividad primero)
                  — antes la lista usaba el orden crudo de la RPC (alfabético
                  por nombre), así que un comercial con mucha actividad pero
                  nombre tardío alfabéticamente aparecía al final aunque el
                  gráfico lo mostrara con la barra más alta. */}
              {[...(actividad ?? [])].sort((a, b) => b.num_visitas - a.num_visitas).map((c) => (
                <FilaNavegable
                  key={c.comercial_id}
                  avatar={c.nombre}
                  titulo={c.nombre}
                  subtitulo={resumen(c)}
                  to={`/actividad-comerciales/${c.comercial_id}${location.search}`}
                  state={desde(location)}
                />
              ))}
            </SeccionLista>
          </>
        )}
      </div>
    </div>
  );
}
