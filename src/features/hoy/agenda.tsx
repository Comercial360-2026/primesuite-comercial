import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { EstadoError } from '@/components/ui/estado-error';
import { SeccionColapsable } from '@/components/ui/seccion-colapsable';
import { CalendarioMes } from '@/features/hoy/calendario-mes';
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
  franja: string | null;
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

  // Lista (por defecto) o rejilla de mes. La lista es mejor para "qué toca
  // ahora"; el mes, para ver de un vistazo cómo viene la planificación.
  const [vista, setVista] = useState<'lista' | 'mes'>('lista');

  // "+ Planificar visita": buscador de cliente en línea. null = cerrado (solo
  // el botón); string = abierto con ese texto. Al elegir cliente se salta a
  // su ficha con el formulario de planificar ya abierto (?planificar=1).
  const [buscarCliente, setBuscarCliente] = useState<string | null>(null);
  const terminoBuscar = (buscarCliente ?? '').trim();
  const { data: clientesEncontrados, isFetching: buscandoClientes } = useQuery({
    queryKey: ['agenda-planificar-buscar', terminoBuscar],
    enabled: terminoBuscar.length >= 2,
    queryFn: async (): Promise<Array<{ id: string; nombre: string }>> => {
      const { data, error } = await supabase
        .from('vw_semaforo_cliente')
        .select('cliente_id, cliente_nombre')
        .ilike('cliente_nombre', `%${terminoBuscar}%`)
        .order('cliente_nombre')
        .limit(8);
      if (error) throw error;
      return (data ?? []).map((c) => ({ id: c.cliente_id as string, nombre: c.cliente_nombre as string }));
    },
  });

  const { data: visitas, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey: ['agenda-planificadas', comercial?.id],
    enabled: !!comercial,
    refetchOnMount: 'always',
    queryFn: async (): Promise<VisitaAgenda[]> => {
      const { data, error } = await supabase
        .from('visita')
        .select('id, fecha, hora_definida, franja, tipo_visita, cliente:cliente_id(id, nombre)')
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

  const { atrasadas, dias, mias } = useMemo(() => {
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
        const fa = franjaDe(a.fecha, a.hora_definida, a.franja);
        const fb = franjaDe(b.fecha, b.hora_definida, b.franja);
        return ordenFranja[fa] - ordenFranja[fb] || a.fecha.localeCompare(b.fecha);
      });
    }
    return { atrasadas: atr, dias: listaDias, mias };
  }, [visitas, participantes, soloMias, comercial]);

  function abrir(v: VisitaAgenda) {
    navigate(`/visita/${v.id}/planificada`);
  }

  function fila(v: VisitaAgenda, conFecha: boolean) {
    const resp = responsables?.[v.id];
    const deOtro = resp && resp !== comercial?.id;
    // En los días la fila va bajo una cabecera de franja, así que solo
    // enseña la hora (o "sin hora fija"). En "Atrasadas" no hay cabecera de
    // día, así que enseña la fecha.
    const cuando = conFecha
      ? new Date(v.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
      : v.hora_definida
        ? new Date(v.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        : 'sin hora fija';
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
            {cuando}
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

      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className={`chip${vista === 'lista' ? ' chip--on' : ''}`} onClick={() => setVista('lista')}>
          Lista
        </button>
        <button type="button" className={`chip${vista === 'mes' ? ' chip--on' : ''}`} onClick={() => setVista('mes')}>
          Mes
        </button>
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

      {!isLoading && !isError && vista === 'mes' && (
        <CalendarioMes visitas={mias} renderVisita={(v) => fila(v, false)} />
      )}

      {vista === 'lista' && vacio && (
        <p style={{ color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>
          No hay visitas planificadas. Planifica una desde la ficha de un cliente.
        </p>
      )}

      {/* Atrasadas: un montón a resolver, no a ojear. Plegable y cerrado de
          inicio para que no empuje hacia abajo los días que sí vas a mirar. */}
      {vista === 'lista' && atrasadas.length > 0 && (
        <SeccionColapsable titulo="Atrasadas" cantidad={atrasadas.length}>
          {atrasadas.map((v) => fila(v, true))}
        </SeccionColapsable>
      )}

      {vista === 'lista' && dias.map((dia) => {
        const porFranja: Record<Franja, VisitaAgenda[]> = { manana: [], tarde: [], sin_hora: [] };
        for (const v of dia.visitas) porFranja[franjaDe(v.fecha, v.hora_definida, v.franja)].push(v);
        return (
          <div key={claveDia(dia.fecha)}>
            <div className="label">{etiquetaDia(dia.fecha)}</div>
            {(['manana', 'tarde', 'sin_hora'] as Franja[]).map((fr) =>
              porFranja[fr].length === 0 ? null : (
                <div key={fr}>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--ink-400)',
                      margin: '6px 0 4px',
                      paddingLeft: 4,
                    }}
                  >
                    {etiquetaFranja(fr)}
                  </div>
                  {porFranja[fr].map((v) => fila(v, false))}
                </div>
              )
            )}
          </div>
        );
      })}

      {buscarCliente === null ? (
        <button className="btn btn-secondary" onClick={() => setBuscarCliente('')}>
          + Planificar visita
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="label" style={{ marginTop: 0 }}>planificar visita — busca el cliente</div>
          <input
            className="field"
            autoFocus
            placeholder="nombre del cliente"
            value={buscarCliente}
            onChange={(e) => setBuscarCliente(e.target.value)}
          />
          {terminoBuscar.length >= 2 && (
            <>
              {buscandoClientes && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>Buscando…</div>
              )}
              {!buscandoClientes && clientesEncontrados?.length === 0 && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                  Sin resultados. Si es un cliente nuevo, créalo primero en Clientes.
                </div>
              )}
              {clientesEncontrados?.map((c) => (
                <div
                  key={c.id}
                  className="card"
                  style={{ cursor: 'pointer', padding: '10px 12px' }}
                  onClick={() => navigate(`/clientes/${c.id}?planificar=1`)}
                >
                  {c.nombre}
                </div>
              ))}
            </>
          )}
          <button
            type="button"
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--ink-400)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              alignSelf: 'flex-start',
              padding: 0,
            }}
            onClick={() => setBuscarCliente(null)}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
