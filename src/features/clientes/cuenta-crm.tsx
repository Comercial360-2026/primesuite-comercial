import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { claveDuplicado, normalizarNombre } from '@/lib/nombres-cliente';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';

// Buscador de cuentas del CRM (crm_cuenta, migraciones 119/121) compartido por
// el alta de cliente y el lápiz de la ficha. Se traen todas las cuentas
// activas una vez (~3.700 filas, pocos KB comprimidas) y se filtra en el
// móvil: sin esperas entre tecla y tecla y sin distinguir tildes ni
// mayúsculas, igual que el aviso de clientes parecidos del alta.

export interface CuentaCrm {
  accountid: string;
  nombre: string;
  ciudad: string | null;
}

export function textoCuentaCrm(c: Pick<CuentaCrm, 'nombre' | 'ciudad'>) {
  return c.ciudad ? `${c.nombre} · ${c.ciudad}` : c.nombre;
}

const PAGINA = 1000; // tope de filas por petición de la API de Supabase

export function useCuentasCrm(activo: boolean) {
  return useQuery({
    queryKey: ['crm-cuentas-activas'],
    enabled: activo,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Array<CuentaCrm & { norm: string }>> => {
      const todas: CuentaCrm[] = [];
      for (let desde = 0; ; desde += PAGINA) {
        const { data, error } = await supabase
          .from('crm_cuenta')
          .select('accountid, nombre, ciudad')
          .eq('activa', true)
          .order('nombre')
          .range(desde, desde + PAGINA - 1);
        if (error) throw error;
        todas.push(...(data ?? []));
        if (!data || data.length < PAGINA) break;
      }
      return todas.map((c) => ({ ...c, norm: normalizarNombre(c.nombre) }));
    },
  });
}

// Clientes ya vinculados a alguna cuenta: elegir una que ya tiene cliente
// casi siempre es un duplicado, y hay que decirlo en la propia fila.
export function useClientesPorCuenta(activo: boolean) {
  return useQuery({
    queryKey: ['clientes-por-cuenta-crm'],
    enabled: activo,
    queryFn: async (): Promise<Record<string, { id: string; nombre: string }>> => {
      const { data, error } = await supabase
        .from('cliente')
        .select('id, nombre, crm_accountid')
        .eq('estado_fusion', 'activo')
        .not('crm_accountid', 'is', null);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((c) => [c.crm_accountid!, { id: c.id, nombre: c.nombre }]));
    },
  });
}

/** Clave de empresa (nombre sin coletilla jurídica) → cliente que ya tiene vinculada una cuenta con ese nombre.
 *  El CRM suele tener la misma empresa varias veces («Verescence La Granja», «…, S.l», «…, S.L.»): quien tiene
 *  una vinculada ya tiene a las hermanas. */
export function useClientesPorClaveDeCuenta(activo: boolean) {
  const { data: cuentas } = useCuentasCrm(activo);
  const { data: vinculadas } = useClientesPorCuenta(activo);
  return useMemo(() => {
    const m = new Map<string, { id: string; nombre: string }>();
    if (!cuentas || !vinculadas) return m;
    for (const c of cuentas) {
      const cli = vinculadas[c.accountid];
      if (cli) m.set(claveDuplicado(c.nombre), cli);
    }
    return m;
  }, [cuentas, vinculadas]);
}

const MAX_RESULTADOS = 6;

/** Resultados del buscador de cuentas CRM para `texto`. No pinta nada con
 *  menos de 3 letras. `excluirClienteId`: el propio cliente (en la ficha) no
 *  cuenta como "ya vinculada". */
export function ResultadosCuentaCrm({
  texto,
  onElegir,
  excluirClienteId,
  disabled,
  titulo = 'Cuenta en el CRM',
}: {
  texto: string;
  /** `cliente`: el cliente que ya tiene vinculada esa cuenta (si no es el excluido). */
  onElegir: (c: CuentaCrm, cliente?: { id: string; nombre: string }) => void;
  excluirClienteId?: string;
  disabled?: boolean;
  titulo?: string;
}) {
  const q = normalizarNombre(texto);
  const activo = q.length >= 3;
  const { data: cuentas, isLoading, isError, isPaused } = useCuentasCrm(activo);
  const { data: vinculadas } = useClientesPorCuenta(activo);
  const porClave = useClientesPorClaveDeCuenta(activo);

  const resultados = useMemo(() => {
    if (!activo || !cuentas) return [];
    const palabras = q.split(/\s+/).filter(Boolean);
    return cuentas
      .filter((c) => palabras.every((p) => c.norm.includes(p)))
      .sort((a, b) => {
        const rango = (x: { norm: string }) => (x.norm === q ? 0 : x.norm.startsWith(q) ? 1 : 2);
        return rango(a) - rango(b);
      })
      .slice(0, MAX_RESULTADOS);
  }, [activo, cuentas, q]);

  if (!activo) return null;
  if (isPaused || isError) {
    return (
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>
        {isPaused ? 'Sin conexión: no se puede buscar en el CRM ahora.' : 'No se ha podido consultar el CRM.'}
      </p>
    );
  }
  if (isLoading) return null;

  if (resultados.length === 0) {
    return (
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>
        No aparece en el CRM. Prueba con otro nombre o déjalo sin vincular.
      </p>
    );
  }

  return (
    <SeccionLista titulo={titulo}>
      {resultados.map((c) => {
          const cliente = vinculadas?.[c.accountid];
          const yaVinculada = cliente && cliente.id !== excluirClienteId;
          // Otra cuenta de la misma empresa que ya tiene cliente (duplicada en el CRM).
          const hermana = !yaVinculada ? porClave.get(claveDuplicado(c.nombre)) : undefined;
          const delOtro = yaVinculada ? cliente : hermana && hermana.id !== excluirClienteId ? hermana : undefined;
          return (
            <FilaNavegable
              key={c.accountid}
              titulo={c.nombre}
              subtitulo={[
                c.ciudad,
                yaVinculada ? `ya es el cliente «${cliente.nombre}»` : delOtro ? `parece la misma empresa que «${delOtro.nombre}»` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              tono={delOtro ? 'aviso' : 'neutral'}
              disabled={disabled}
              onClick={() => onElegir(c, delOtro)}
            />
          );
        })}
    </SeccionLista>
  );
}

// --- Sugerencias de vínculo: clientes creados a mano que ya están en el CRM ---

export interface ClienteSinCuenta {
  id: string;
  nombre: string;
}
export interface SugerenciaCuenta {
  /** Cuentas del CRM cuyo nombre contiene todas las palabras del cliente (sin cliente propio), mejores primero. */
  candidatas: CuentaCrm[];
  /** Coincidencia EXACTA y ÚNICA (mismo nombre sin «S.L.»/«S.A.»): la única que se vincula sola. */
  exacta: CuentaCrm | null;
}

/** Para cada cliente sin cuenta, qué cuentas del CRM podrían ser la suya. Todo en el móvil con las cuentas ya cargadas
 *  (3.700 filas, una vez por hora): sin tabla de sugerencias que mantener y siempre al día con el último CRM. */
export function useSugerenciasCuenta(clientes: ClienteSinCuenta[]) {
  const activo = clientes.length > 0;
  const { data: cuentas } = useCuentasCrm(activo);
  const { data: vinculadas } = useClientesPorCuenta(activo);
  const porClave = useClientesPorClaveDeCuenta(activo);
  return useMemo(() => {
    const m = new Map<string, SugerenciaCuenta>();
    if (!cuentas || !vinculadas) return m;
    const libres = cuentas.filter((c) => !vinculadas[c.accountid]);
    for (const cli of clientes) {
      const clave = claveDuplicado(cli.nombre);
      const palabras = normalizarNombre(cli.nombre).split(/\s+/).filter(Boolean);
      if (clave.length < 3) continue;
      const candidatas = libres
        .filter((c) => palabras.every((p) => c.norm.includes(p)))
        .sort((a, b) => {
          const rango = (x: { norm: string }) => (claveDuplicado(x.norm) === clave ? 0 : x.norm.startsWith(clave) ? 1 : 2);
          return rango(a) - rango(b);
        });
      const iguales = libres.filter((c) => claveDuplicado(c.nombre) === clave);
      // Exacta y única; y que ninguna hermana de esa empresa ya tenga cliente (sería un duplicado, no un vínculo).
      const exacta = iguales.length === 1 && !porClave.has(clave) ? iguales[0] : null;
      if (candidatas.length > 0) m.set(cli.id, { candidatas: candidatas.slice(0, 3), exacta });
    }
    return m;
  }, [clientes, cuentas, vinculadas, porClave]);
}
