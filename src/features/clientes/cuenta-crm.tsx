import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { normalizarNombre } from '@/lib/nombres-cliente';
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

function useCuentasCrm(activo: boolean) {
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
function useClientesPorCuenta(activo: boolean) {
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
        No aparece en el CRM. Puedes seguir sin vincularla.
      </p>
    );
  }

  return (
    <SeccionLista titulo={titulo}>
      {resultados.map((c) => {
          const cliente = vinculadas?.[c.accountid];
          const yaVinculada = cliente && cliente.id !== excluirClienteId;
          return (
            <FilaNavegable
              key={c.accountid}
              titulo={c.nombre}
              subtitulo={[c.ciudad, yaVinculada ? `ya es el cliente «${cliente.nombre}»` : null]
                .filter(Boolean)
                .join(' · ')}
              tono={yaVinculada ? 'aviso' : 'neutral'}
              disabled={disabled}
              onClick={() => onElegir(c, yaVinculada ? cliente : undefined)}
            />
          );
        })}
    </SeccionLista>
  );
}
