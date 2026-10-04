import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { desde } from '@/lib/volver-a';
import { CLIENTE_ARCHIVADO } from '@/lib/nombres-cliente';
import { vincularClienteACuenta } from '@/lib/vincular-cuenta-crm';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Aviso } from '@/components/ui/aviso';
import { textoCuentaCrm, useSugerenciasCuenta } from '@/features/clientes/cuenta-crm';

// Clientes creados a mano que ya aparecen en el CRM (solo Dirección). La sincronización del CRM nunca toca clientes: aquí
// se ven los que tienen una cuenta que les corresponde y se vinculan (uno a uno desde su ficha, o de golpe las
// coincidencias exactas). Toda la lógica de coincidencia vive en `useSugerenciasCuenta`.
interface ClienteSinCuenta {
  id: string;
  nombre: string;
  nombre_alias: string | null;
  ubicacion_general: string | null;
  crm_no_autovincular: boolean;
}

function useClientesPorVincular() {
  const { data: clientes, isLoading } = useQuery({
    queryKey: ['clientes-sin-cuenta-crm'],
    queryFn: async (): Promise<ClienteSinCuenta[]> => {
      const { data, error } = await supabase
        .from('cliente')
        .select('id, nombre, nombre_alias, ubicacion_general, crm_no_autovincular')
        .eq('estado_fusion', 'activo')
        .neq('estado_relacion', CLIENTE_ARCHIVADO)
        .is('crm_accountid', null)
        .order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });
  const sugerencias = useSugerenciasCuenta(useMemo(() => (clientes ?? []).map((c) => ({ id: c.id, nombre: c.nombre })), [clientes]));
  const conSugerencia = (clientes ?? []).filter((c) => sugerencias.has(c.id));
  return { clientes, sugerencias, conSugerencia, isLoading };
}

/** Fila para «Yo → Gestión»: solo sale si hay algún cliente por vincular. */
export function FilaClientesPorVincular() {
  const { conSugerencia } = useClientesPorVincular();
  if (conSugerencia.length === 0) return null;
  return (
    <FilaNavegable
      icono="buscar"
      titulo="Clientes por vincular"
      subtitulo={
        conSugerencia.length === 1
          ? 'Un cliente creado a mano que ya está en el CRM'
          : `${conSugerencia.length} clientes creados a mano que ya están en el CRM`
      }
      badge={conSugerencia.length}
      tono="aviso"
      to="/clientes-por-vincular"
    />
  );
}

export function ClientesPorVincular() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { sugerencias, conSugerencia, isLoading } = useClientesPorVincular();
  const [vinculando, setVinculando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<number | null>(null);

  // Los que alguien desvinculó a mano no se vinculan de golpe (siguen en la lista para revisarlos).
  const exactas = conSugerencia.filter((c) => sugerencias.get(c.id)?.exacta && !c.crm_no_autovincular);

  async function vincularExactas() {
    if (!navigator.onLine) {
      setError('Necesitas conexión para vincular.');
      return;
    }
    setVinculando(true);
    setError(null);
    let n = 0;
    try {
      for (const c of exactas) {
        await vincularClienteACuenta(c, sugerencias.get(c.id)!.exacta!, true);
        n++;
      }
    } catch (e) {
      setError(`Se vincularon ${n}; falló uno: ${e instanceof Error ? e.message : 'error desconocido'}`);
    } finally {
      setHecho(n);
      setVinculando(false);
      void queryClient.invalidateQueries({ queryKey: ['clientes-sin-cuenta-crm'] });
      void queryClient.invalidateQueries({ queryKey: ['clientes-por-cuenta-crm'] });
      void queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
    }
  }

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Clientes por vincular" ayuda="clientes-por-vincular" volverA="/yo" />
      {isLoading ? (
        <EstadoLista estado="cargando" />
      ) : conSugerencia.length === 0 ? (
        <EstadoLista
          estado="vacio"
          mensaje={hecho ? `Hecho: ${hecho} vinculado${hecho === 1 ? '' : 's'}. Ya no queda ningún cliente por vincular.` : 'Ningún cliente creado a mano tiene una cuenta del CRM que le corresponda.'}
        />
      ) : (
        <div className="screen__scroll">
          <div className="lista-agrupada">
            {exactas.length > 0 && (
              <SeccionLista>
                <FilaNavegable
                  icono="check"
                  titulo={`Vincular las coincidencias exactas (${exactas.length})`}
                  subtitulo="Mismo nombre que la cuenta (sin «S.L.»/«S.A.») y una sola cuenta. El cliente pasa a llamarse como la cuenta; su nombre anterior se sigue encontrando"
                  chevron={false}
                  disabled={vinculando}
                  onClick={() => void vincularExactas()}
                />
              </SeccionLista>
            )}
            {error && <Aviso tipo="error">{error}</Aviso>}
            <SeccionLista titulo="Por revisar">
              {conSugerencia.map((c) => {
                const s = sugerencias.get(c.id)!;
                return (
                  <FilaNavegable
                    key={c.id}
                    titulo={c.nombre}
                    subtitulo={
                      s.exacta
                        ? `Coincide exactamente con «${textoCuentaCrm(s.exacta)}»${c.crm_no_autovincular ? ' · desvinculado a mano: no se vincula solo' : ''}`
                        : s.candidatas.length === 1
                          ? `Parece: «${textoCuentaCrm(s.candidatas[0])}»`
                          : `${s.candidatas.length} cuentas parecidas — se elige en su ficha`
                    }
                    to={`/clientes/${c.id}`}
                    state={desde(location)}
                  />
                );
              })}
            </SeccionLista>
          </div>
        </div>
      )}
    </div>
  );
}
