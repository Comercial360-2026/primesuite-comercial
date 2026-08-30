import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { EstadoError } from '@/components/ui/estado-error';
import { franjaDe, etiquetaFranja, ordenFranja, type Franja } from '@/lib/franja-visita';

// Pantalla de planificación: todo lo que está agendado (agendada), pasado y
// futuro. "Hoy" solo enseña el día de hoy y un enlace aquí; el detalle de
// cada visita (reprogramar / cancelar / empezar) vive en
// detalle-visita-planificada. Aquí solo se ve y se navega.
//
// Atrasadas arriba del todo. El resto, agrupado por día, y dentro de cada
// día por franja (mañana → tarde → sin hora).

interface VisitaAgenda {
  id: string;
  fecha: string;
  hora_definida: boolean;
  tipo_visita: string | null;
  cliente: { id: string; nombre: string } | null;
}

function inicioDeHoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function claveDia(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function etiquetaDia(d: Date) {
  const hoy = inicioDeHoy();
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);
  if (claveDia(d) === claveDia(hoy)) return 'Hoy';
  if (claveDia(d) === claveDia(manana)) return 'Mañana';
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function Agenda() {
  const navigate = useNavigate();
  const { comercial } = useSesionActual();
  const esDireccionComercial = comercial?.rol === 'direccion_comercial';
  // Dirección Comercial entra viendo TODO el equipo — si no, una visita que
  // planificó para un compañero le desaparecería de la vista. Un comercial
  // normal solo ve lo suyo y no puede cambiarlo.
  const [soloMiasElegido, setSoloMias] = useState(false);
  const soloMias = esDireccionComercial ? soloMiasElegido : true;

  const { data: visitas, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey: ['agenda-planificadas', comercial?.id],
    enabled: !!comercial,
    refetchOnMount: 'always',
    queryFn: async (): Promise<VisitaAgenda[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, hora_definida, tipo_visita, cliente:cliente_id(id, nombre)')
        .eq('estado_captura', 'agendada')
        .order('fecha', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VisitaAgenda[];
    },
  });

  const ids = visitas?.map((v) => v.id) ?? [];
  const { data: responsables } = useQuery({
    queryKey: ['agenda-responsables', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select('visita_id, comercial_id')
        .eq('rol', 'responsable')
        .in('visita_id', ids);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.visita_id, p.comercial_id]));
    },
  });

  const { data: participantes } = useQuery({
    queryKey: ['agenda-participantes', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select('visita_id, comercial_id')
        .in('visita_id', ids);
      if (error) throw error;
      const m: Record<string, string[]> = {};
      for (const p of data ?? []) (m[p.visita_id] ??= []).push(p.comercial_id);
      return m;
    },
  });

  const { data: nombresComerciales } = useQuery({
    queryKey: ['nombres-comerciales'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from('comercial').select('id, nombre');
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((c) => [c.id, c.nombre]));
    },
  });

  const { atrasadas, dias } = useMemo(() => {
    const hoy0 = inicioDeHoy().getTime();
    const mias = (visitas ?? []).filter(
      (v) => !soloMias || (!!comercial && !!participantes?.[v.id]?.includes(comercial.id))
    );
    const atr = mias.filter((v) => new Date(v.fecha).getTime() < hoy0);
    const resto = mias.filter((v) => new Date(v.fecha).getTime() >= hoy0);

    const porDia = new Map<string, { fecha: Date; visitas: VisitaAgenda[] }>();
    for (const v of resto) {
      const d = new Date(v.fecha);
      const k = claveDia(d);
      if (!porDia.has(k)) porDia.set(k, { fecha: d, visitas: [] });
      porDia.get(k)!.visitas.push(v);
    }
    const listaDias = [...porDia.values()].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    for (const dia of listaDias) {
      dia.visitas.sort((a, b) => {
        const fa = franjaDe(a.fecha, a.hora_definida);
        const fb = franjaDe(b.fecha, b.hora_definida);
        return ordenFranja[fa] - ordenFranja[fb] || a.fecha.localeCompare(b.fecha);
      });
    }
    return { atrasadas: atr, dias: listaDias };
  }, [visitas, participantes, soloMias, comercial]);

  function abrir(v: VisitaAgenda) {
    navigate(`/visita/${v.id}/planificada`);
  }

  function fila(v: VisitaAgenda, conFranja: boolean) {
    const franja: Franja = franjaDe(v.fecha, v.hora_definida);
    const resp = responsables?.[v.id];
    const deOtro = resp && resp !== comercial?.id;
    return (
      <div
        key={v.id}
        className="card"
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
        onClick={() => abrir(v)}
      >
        <div>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>{v.cliente?.nombre ?? 'Cliente'}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
            {conFranja
              ? v.hora_definida
                ? `${new Date(v.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · ${etiquetaFranja(franja)}`
                : 'sin hora'
              : new Date(v.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            {v.tipo_visita ? ` · ${v.tipo_visita}` : ''}
            {deOtro ? ` · de ${nombresComerciales?.[resp] ?? '…'}` : ''}
          </div>
        </div>
        <span style={{ fontSize: 20, color: 'var(--ink-300)', flexShrink: 0 }}>›</span>
      </div>
    );
  }

  const vacio = !isLoading && !isError && atrasadas.length === 0 && dias.length === 0;

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>
          ←
        </button>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>Agenda</h1>
      </div>

      {esDireccionComercial && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={`chip${!soloMias ? ' chip--on' : ''}`} onClick={() => setSoloMias(false)}>
            Todas
          </button>
          <button type="button" className={`chip${soloMias ? ' chip--on' : ''}`} onClick={() => setSoloMias(true)}>
            Solo mías
          </button>
        </div>
      )}

      {isLoading && <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>Cargando…</p>}
      {(isError || isPaused) && (
        <EstadoError mensaje="No se pudo cargar la agenda." onReintentar={() => refetch()} />
      )}

      {vacio && (
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>
          No hay visitas planificadas. Planifica una desde la ficha de un cliente.
        </p>
      )}

      {atrasadas.length > 0 && (
        <>
          <div className="label" style={{ color: 'var(--warning-600)', marginTop: 0 }}>
            atrasadas ({atrasadas.length})
          </div>
          {atrasadas.map((v) => fila(v, false))}
        </>
      )}

      {dias.map((dia) => (
        <div key={claveDia(dia.fecha)}>
          <div className="label">{etiquetaDia(dia.fecha)}</div>
          {dia.visitas.map((v) => fila(v, true))}
        </div>
      ))}

      <button className="btn btn-secondary" onClick={() => navigate('/clientes')}>
        + Planificar visita (desde un cliente)
      </button>
    </div>
  );
}
