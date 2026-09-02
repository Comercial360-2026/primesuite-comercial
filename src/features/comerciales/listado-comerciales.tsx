import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Icono } from '@/components/ui/iconos';

interface Comercial {
  id: string;
  nombre: string;
  rol: string;
  zona_cartera: string | null;
  activo: boolean;
  fecha_baja: string | null;
}

export const ETIQUETA_ROL: Record<string, string> = {
  comercial: 'Comercial',
  direccion_comercial: 'Dirección comercial',
};

export function ListadoComerciales() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [verTodos, setVerTodos] = useState(false);

  const queryKey = ['comerciales-equipo'];
  const { data, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<Comercial[]> => {
      const { data, error } = await supabase
        .from('comercial')
        .select('id, nombre, rol, zona_cartera, activo, fecha_baja')
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as Comercial[];
    },
  });

  const sinConexion = isPaused && data === undefined;
  function reintentar() {
    queryClient.resetQueries({ queryKey });
    refetch();
  }

  const lista = (data ?? []).filter((c) => verTodos || c.activo);
  const nBaja = (data ?? []).filter((c) => !c.activo).length;

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Equipo" volverA="/yo" />

      <div className="lista-agrupada">
        {isLoading ? (
          <EstadoLista estado="cargando" />
        ) : sinConexion ? (
          <EstadoLista estado="sin-conexion" onReintentar={reintentar} />
        ) : isError ? (
          <EstadoLista estado="error" mensaje="No se pudo cargar el equipo." onReintentar={reintentar} />
        ) : (
          <>
            {nBaja > 0 && (
              <div style={{ display: 'flex', gap: 6, paddingInline: 'var(--fila-pad-x)' }}>
                <button type="button" className={`chip${!verTodos ? ' chip--on' : ''}`} onClick={() => setVerTodos(false)}>
                  Activos
                </button>
                <button type="button" className={`chip${verTodos ? ' chip--on' : ''}`} onClick={() => setVerTodos(true)}>
                  Todos ({data?.length ?? 0})
                </button>
              </div>
            )}

            {lista.length === 0 ? (
              <EstadoLista estado="vacio" mensaje={verTodos ? 'No hay comerciales.' : 'No hay comerciales activos.'} />
            ) : (
              <SeccionLista titulo={lista.length === 1 ? '1 comercial' : `${lista.length} comerciales`}>
                {lista.map((c) => (
                  <FilaNavegable
                    key={c.id}
                    icono="clientes"
                    titulo={c.nombre}
                    subtitulo={`${ETIQUETA_ROL[c.rol] ?? c.rol}${c.zona_cartera ? ` · ${c.zona_cartera}` : ''}`}
                    tono={c.activo ? 'neutral' : 'riesgo'}
                    valor={
                      c.activo ? undefined : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Icono nombre="atencion" size={13} />
                          De baja{c.fecha_baja ? ` · ${fechaCorta(c.fecha_baja)}` : ''}
                        </span>
                      )
                    }
                    onClick={() => navigate(`/comerciales/${c.id}`)}
                  />
                ))}
              </SeccionLista>
            )}
          </>
        )}
      </div>

      <button className="btn btn-primary" onClick={() => navigate('/comerciales/nuevo')}>
        <Icono nombre="mas" size={18} />
        Nuevo comercial
      </button>
    </div>
  );
}
