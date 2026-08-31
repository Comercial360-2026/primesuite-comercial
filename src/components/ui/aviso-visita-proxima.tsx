import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';

// Aviso "por hora": mientras la app está abierta, da un toque ~30 min antes
// de una visita planificada CON HORA que aún no se ha empezado, y sigue
// avisando hasta hora y media después ("¿la empezaste?"). Descartable por
// visita. Las de "sin hora" no entran aquí — para esas está la lista de Hoy.
//
// Es todo en cliente: no hay backend ni notificaciones push. Si la app está
// cerrada, no salta nada (limitación conocida — haría falta push del
// navegador, fuera de alcance).

const MIN_ANTES = 30;
const MIN_DESPUES = 90;

function rangoDeHoy() {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

interface VisitaAviso {
  id: string;
  fecha: string;
  cliente: { id: string; nombre: string } | null;
}

export function AvisoVisitaProxima() {
  const navigate = useNavigate();
  const { comercial } = useSesionActual();
  const [descartadas, setDescartadas] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

  // Re-evalúa cada 30 s aunque no haya refetch, para que "en X min" no se
  // quede viejo y la ventana de aviso se recalcule.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const { inicio, fin } = useMemo(rangoDeHoy, []);

  const { data: visitas } = useQuery({
    queryKey: ['aviso-visita-proxima', comercial?.id, inicio],
    enabled: !!comercial,
    refetchInterval: 60_000,
    staleTime: 0,
    queryFn: async (): Promise<VisitaAviso[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, cliente:cliente_id(id, nombre), visita_participante!inner(comercial_id)')
        .eq('estado_captura', 'agendada')
        .eq('hora_definida', true)
        .eq('visita_participante.comercial_id', comercial!.id)
        .gte('fecha', inicio)
        .lte('fecha', fin);
      if (error) throw error;
      return (data ?? []) as unknown as VisitaAviso[];
    },
  });

  const aviso = useMemo(() => {
    const ahora = Date.now();
    // Prioridad: primero la próxima que aún no ha llegado (la más cercana);
    // si no hay ninguna por venir, la que se pasó hace menos.
    const clave = (m: number) => (m >= 0 ? m : 1_000_000 - m);
    return (visitas ?? [])
      .map((v) => ({ v, minutos: Math.round((new Date(v.fecha).getTime() - ahora) / 60_000) }))
      .filter(({ v, minutos }) => minutos <= MIN_ANTES && minutos >= -MIN_DESPUES && !descartadas.has(v.id))
      .sort((a, b) => clave(a.minutos) - clave(b.minutos))[0];
  }, [visitas, descartadas]);

  if (!aviso) return null;

  const { v, minutos } = aviso;
  const hora = new Date(v.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const cuando =
    minutos > 1
      ? `en ${minutos} min`
      : minutos >= -1
        ? 'ahora'
        : `hace ${-minutos} min`;
  const pasada = minutos < -1;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 40,
        padding: '0 var(--space-4)',
        background: 'var(--brand-050)',
        color: pasada ? 'var(--warning-600)' : 'var(--brand-600)',
        fontSize: 'var(--text-sm)',
        fontWeight: 500,
      }}
    >
      <span
        style={{ flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        onClick={() => v.cliente && navigate(`/clientes/${v.cliente.id}/repaso?visitaId=${v.id}`)}
      >
        {v.cliente?.nombre ?? 'Visita'} · {hora}
        {pasada ? ` — era ${cuando}, ¿la empezaste?` : ` — ${cuando}`}
      </span>
      <button
        type="button"
        onClick={() => setDescartadas((s) => new Set(s).add(v.id))}
        aria-label="descartar aviso"
        style={{
          border: 'none',
          background: 'none',
          color: 'inherit',
          fontSize: 18,
          lineHeight: 1,
          cursor: 'pointer',
          padding: '0 4px',
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
