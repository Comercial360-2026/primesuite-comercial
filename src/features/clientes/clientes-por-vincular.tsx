import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { desde } from '@/lib/volver-a';
import { CLIENTE_ARCHIVADO, normalizarNombre } from '@/lib/nombres-cliente';
import { usarNombreDelCrm, vincularClienteACuenta } from '@/lib/vincular-cuenta-crm';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Aviso } from '@/components/ui/aviso';
import { textoCuentaCrm, useSugerenciasCuenta, type CuentaCrm } from '@/features/clientes/cuenta-crm';

// Clientes creados a mano que ya aparecen en el CRM (solo Dirección). La sincronización del CRM nunca toca clientes: aquí
// se ven los que tienen una cuenta que les corresponde y se vinculan (uno a uno desde su ficha, o de golpe las
// coincidencias exactas). Toda la lógica de coincidencia vive en `useSugerenciasCuenta`.
interface ClienteSinCuenta {
  id: string;
  nombre: string;
  nombre_alias: string | null;
  ubicacion_general: string | null;
  crm_no_autovincular: boolean;
  crm_nombre_propio?: boolean;
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

// Clientes YA vinculados que se llaman distinto a su cuenta del CRM (los vinculados antes de que existiera «usar el nombre
// del CRM», o a los que no se lo pidió nadie). Se excluyen los que decidieron conservar su nombre (`crm_nombre_propio`).
interface ClienteConNombreDistinto extends ClienteSinCuenta {
  cuenta: CuentaCrm;
}
function useClientesConNombreDistinto() {
  const { data } = useQuery({
    queryKey: ['clientes-con-nombre-distinto'],
    queryFn: async (): Promise<ClienteConNombreDistinto[]> => {
      const { data, error } = await supabase
        .from('cliente')
        .select('id, nombre, nombre_alias, ubicacion_general, crm_no_autovincular, crm_nombre_propio, cuenta:crm_cuenta!cliente_crm_accountid_fkey(accountid, nombre, ciudad)')
        .eq('estado_fusion', 'activo')
        .neq('estado_relacion', CLIENTE_ARCHIVADO)
        .not('crm_accountid', 'is', null)
        .eq('crm_nombre_propio', false)
        .order('nombre');
      if (error) throw error;
      const salida: ClienteConNombreDistinto[] = [];
      for (const c of data ?? []) {
        const cuenta = c.cuenta as unknown as CuentaCrm | null;
        if (cuenta && normalizarNombre(cuenta.nombre) !== normalizarNombre(c.nombre)) salida.push({ ...c, cuenta });
      }
      return salida;
    },
  });
  return data ?? [];
}

/** Fila para «Yo → Gestión»: solo sale si hay algún cliente por vincular. */
export function FilaClientesPorVincular() {
  const { conSugerencia } = useClientesPorVincular();
  const distintos = useClientesConNombreDistinto();
  const n = conSugerencia.length + distintos.length;
  if (n === 0) return null;
  return (
    <FilaNavegable
      icono="buscar"
      titulo="Clientes por vincular"
      subtitulo={
        n === 1
          ? 'Un cliente que ya está en el CRM y se llama distinto'
          : `${n} clientes que ya están en el CRM y se llaman distinto`
      }
      badge={n}
      tono="aviso"
      to="/clientes-por-vincular"
    />
  );
}

export function ClientesPorVincular() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { sugerencias, conSugerencia, isLoading } = useClientesPorVincular();
  const distintos = useClientesConNombreDistinto();
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

  async function usarNombresDelCrm() {
    if (!navigator.onLine) {
      setError('Necesitas conexión para cambiar los nombres.');
      return;
    }
    setVinculando(true);
    setError(null);
    let n = 0;
    try {
      for (const c of distintos) {
        await usarNombreDelCrm(c, c.cuenta);
        n++;
      }
    } catch (e) {
      setError(`Se cambiaron ${n}; falló uno: ${e instanceof Error ? e.message : 'error desconocido'}`);
    } finally {
      setHecho((h) => (h ?? 0) + n);
      setVinculando(false);
      void queryClient.invalidateQueries({ queryKey: ['clientes-con-nombre-distinto'] });
      void queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
    }
  }

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Clientes por vincular" ayuda="clientes-por-vincular" volverA="/yo" />
      {isLoading ? (
        <EstadoLista estado="cargando" />
      ) : conSugerencia.length === 0 && distintos.length === 0 ? (
        <EstadoLista
          estado="vacio"
          mensaje={hecho ? `Hecho: ${hecho} cliente${hecho === 1 ? '' : 's'} actualizado${hecho === 1 ? '' : 's'}. No queda ninguno por vincular ni con nombre distinto al del CRM.` : 'Ningún cliente tiene pendiente vincularse o cambiar su nombre al del CRM.'}
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
            {distintos.length > 0 && (
              <SeccionLista titulo="Ya vinculados, con nombre distinto al del CRM">
                <FilaNavegable
                  icono="check"
                  titulo={`Usar el nombre del CRM en todos (${distintos.length})`}
                  subtitulo="El nombre actual se guarda como nombre anterior y se sigue encontrando al buscar. Las carpetas de SharePoint no cambian"
                  chevron={false}
                  disabled={vinculando}
                  onClick={() => void usarNombresDelCrm()}
                />
                {distintos.map((c) => (
                  <FilaNavegable
                    key={c.id}
                    titulo={c.nombre}
                    subtitulo={`El CRM la llama «${textoCuentaCrm(c.cuenta)}»`}
                    to={`/clientes/${c.id}`}
                    state={desde(location)}
                  />
                ))}
              </SeccionLista>
            )}
            {error && <Aviso tipo="error">{error}</Aviso>}
            {conSugerencia.length > 0 && <SeccionLista titulo="Por revisar">
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
            </SeccionLista>}
          </div>
        </div>
      )}
    </div>
  );
}
