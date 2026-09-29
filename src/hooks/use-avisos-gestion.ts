import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { claveDuplicado } from '@/lib/nombres-cliente';
import { useSesionActual } from '@/hooks/use-sesion-actual';

// Los 3 avisos de "Gestión" de Dirección Comercial (peticiones de acceso,
// solicitudes de ayuda, clientes duplicados) — antes solo se veían al
// entrar en Yo; un único sitio para los tres, así el punto de la pestaña
// "Yo" (LayoutShell) y la sección "Gestión" (yo.tsx) comparten la misma
// cuenta en vez de tener cada uno su copia de las mismas 3 queries.

export function useAvisosGestion() {
  const { comercial } = useSesionActual();
  const esDireccionComercial = comercial?.rol === 'direccion_comercial';

  const { data: numSolicitudesPendientes } = useQuery({
    queryKey: ['num-solicitudes-reasignacion-pendientes'],
    refetchOnMount: 'always',
    enabled: esDireccionComercial,
    queryFn: async () => {
      const { count, error: err } = await supabase
        .from('solicitud_reasignacion')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'pendiente');
      if (err) throw err;
      return count ?? 0;
    },
  });

  // Comerciales que han pulsado "He perdido el acceso" en el login y
  // esperan que Dirección les reenvíe el enlace.
  const { data: numPeticionesAcceso } = useQuery({
    queryKey: ['num-solicitudes-acceso'],
    refetchOnMount: 'always',
    enabled: esDireccionComercial,
    queryFn: async () => {
      const { count, error: err } = await supabase
        .from('solicitud_acceso')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'pendiente');
      if (err) throw err;
      return count ?? 0;
    },
  });

  // Nº de grupos de fichas de cliente duplicadas (mismo criterio de
  // agrupación que la pantalla de deduplicación).
  //
  // Se deja sin llevar a SQL (13 sept, barrido de patrón "trae la tabla
  // entera y filtra en JS" junto con deduplicacion.tsx/cola-vocabulario.tsx):
  // `claveDuplicado` (nombres-cliente.ts) normaliza a propósito en JS, sin
  // `unaccent` en la base de datos — duplicar esa lógica en SQL arriesga que
  // las dos copias diverjan en silencio y la pantalla de fusión (acción
  // irreversible) decida "duplicado" con un criterio distinto al de aquí.
  // Menor impacto que los otros dos: solo 2 columnas de `cliente` (crece
  // mucho más despacio que visita/hallazgo), y solo para Dirección Comercial.
  const { data: numGruposDuplicados } = useQuery({
    queryKey: ['num-grupos-duplicados'],
    refetchOnMount: 'always',
    enabled: esDireccionComercial,
    queryFn: async () => {
      const { data, error: err } = await supabase.from('cliente').select('nombre, estado_fusion');
      if (err) throw err;
      const cuenta: Record<string, number> = {};
      for (const c of data ?? []) {
        if (c.estado_fusion !== 'activo') continue;
        const k = claveDuplicado(c.nombre);
        cuenta[k] = (cuenta[k] ?? 0) + 1;
      }
      return Object.values(cuenta).filter((n) => n >= 2).length;
    },
  });

  // Tope diario de briefings del agente alcanzado (migración 123).
  const { data: topeBriefing } = useQuery({
    queryKey: ['avisos-briefing-tope'],
    refetchOnMount: 'always',
    enabled: esDireccionComercial,
    queryFn: async () => {
      const { data, error: err } = await supabase.rpc('fn_tope_briefing').maybeSingle();
      if (err) throw err;
      return data;
    },
  });

  return {
    topeBriefing,
    numSolicitudesPendientes,
    numPeticionesAcceso,
    numGruposDuplicados,
    hayAvisos:
      esDireccionComercial &&
      (!!numSolicitudesPendientes || !!numPeticionesAcceso || !!numGruposDuplicados || !!topeBriefing?.alcanzado),
  };
}
