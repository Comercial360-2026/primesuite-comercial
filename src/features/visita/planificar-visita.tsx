import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { uuid } from '@/lib/uuid';
import { crearVisitaConResponsable } from '@/lib/rpc';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';

interface Proyecto {
  id: string;
  nombre: string;
  es_general: boolean;
}

// Flujo único de "Planificar visita": cliente → proyecto (solo si hay más
// de uno) → fecha/objetivo/hora/franja → [para otro comercial, si eres
// Dirección] → guarda y vuelve a la Agenda. Se abre desde el "+" de la
// Agenda (sin parámetros) y desde la ficha de proyecto (con
// ?clienteId=&proyectoId= ya puestos, saltándose los dos primeros pasos).
export function PlanificarVisita() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { comercial } = useSesionActual();
  const esDireccion = comercial?.rol === 'direccion_comercial';
  const [params] = useSearchParams();

  const [clienteId, setClienteId] = useState(params.get('clienteId') ?? '');
  const [proyectoId, setProyectoId] = useState(params.get('proyectoId') ?? '');

  // --- Paso 1: buscar cliente ---
  const [busqueda, setBusqueda] = useState('');
  const termino = busqueda.trim();
  const { data: encontrados, isFetching: buscando } = useQuery({
    queryKey: ['planificar-buscar-cliente', termino],
    enabled: !clienteId && termino.length >= 2,
    queryFn: async (): Promise<Array<{ id: string; nombre: string }>> => {
      const { data, error } = await supabase
        .from('vw_semaforo_cliente')
        .select('cliente_id, cliente_nombre')
        .ilike('cliente_nombre', `%${termino}%`)
        .order('cliente_nombre')
        .limit(8);
      if (error) throw error;
      return (data ?? []).map((c) => ({ id: c.cliente_id as string, nombre: c.cliente_nombre as string }));
    },
  });

  const { data: cliente } = useQuery({
    queryKey: ['planificar-cliente-nombre', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.from('cliente').select('id, nombre').eq('id', clienteId).single();
      if (error) throw error;
      return data;
    },
  });

  // --- Paso 2: proyecto (solo si hay más de uno) ---
  const { data: proyectos } = useQuery({
    queryKey: ['planificar-proyectos', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<Proyecto[]> => {
      const { data, error } = await supabase
        .from('proyecto')
        .select('id, nombre, es_general')
        .eq('cliente_id', clienteId)
        .order('es_general', { ascending: false })
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Un solo proyecto (el General por defecto, P9): se elige solo, sin
  // pedirlo — el comercial no debería ni verlo.
  useEffect(() => {
    if (!proyectoId && proyectos && proyectos.length === 1) setProyectoId(proyectos[0].id);
  }, [proyectos, proyectoId]);

  // --- Paso 3: formulario ---
  const hoyISO = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [hora, setHora] = useState('');
  const [franja, setFranja] = useState<'' | 'manana' | 'tarde'>('');
  const [comercialPlan, setComercialPlan] = useState('');
  const guardado = useAccionAsync();

  const { data: comercialesActivos } = useQuery({
    queryKey: ['comerciales-activos'],
    enabled: esDireccion && !!proyectoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comercial')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });

  async function planificar() {
    await guardado.ejecutar(
      async () => {
        if (!comercial || !clienteId || !proyectoId) throw new Error('Recarga la página e inténtalo de nuevo.');
        if (!fecha) throw new Error('Elige una fecha para la visita.');
        if (!objetivo.trim()) throw new Error('Escribe el objetivo de la visita.');
        const responsableId = esDireccion && comercialPlan ? comercialPlan : comercial.id;
        const visitaId = uuid();
        const { error } = await crearVisitaConResponsable({
          pVisitaId: visitaId,
          pClienteId: clienteId,
          pComercialId: responsableId,
          pFecha: new Date(`${fecha}T${hora || '09:00'}:00`).toISOString(),
          pEstadoCaptura: 'agendada',
        });
        if (error) throw new Error(error);
        const parche: { objetivo: string; proyecto_id: string; hora_definida?: boolean; franja?: string | null } = {
          objetivo: objetivo.trim(),
          proyecto_id: proyectoId,
        };
        if (!hora) {
          parche.hora_definida = false;
          parche.franja = franja || null;
        }
        const { error: errParche } = await supabase.from('visita').update(parche).eq('id', visitaId);
        if (errParche) throw new Error(errParche.message);
      },
      {
        onExito: () => {
          for (const k of [['agenda-planificadas'], ['visitas-hoy'], ['visitas-proximas'], ['visitas-atrasadas']]) {
            queryClient.invalidateQueries({ queryKey: k });
          }
          if (clienteId) queryClient.invalidateQueries({ queryKey: ['historial-visitas-proyecto', proyectoId] });
          navigate('/agenda');
        },
      }
    );
  }

  const proyectoElegido = useMemo(
    () => proyectos?.find((p) => p.id === proyectoId) ?? null,
    [proyectos, proyectoId]
  );
  const pasoProyecto = !!clienteId && !proyectoId;

  return (
    <div className="screen">
      <CabeceraDetalle
        titulo="Planificar visita"
        subtitulo={
          cliente
            ? `${cliente.nombre}${proyectoElegido && !proyectoElegido.es_general ? ` · ${proyectoElegido.nombre}` : ''}`
            : undefined
        }
        volverA="/agenda"
        ayuda="planificar-visita"
      />

      <div className="lista-agrupada">
        {/* Paso 1 — cliente */}
        {!clienteId && (
          <div className="card">
            <div className="label" style={{ marginTop: 0 }}>¿A qué cliente?</div>
            <input
              className="field"
              autoFocus
              placeholder="nombre del cliente"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {termino.length >= 2 && (
              <div style={{ marginTop: 8 }}>
                {buscando && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>Buscando…</div>}
                {!buscando && encontrados?.length === 0 && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                    Sin resultados. Si es un cliente nuevo, créalo primero en Clientes.
                  </div>
                )}
                {!!encontrados?.length && (
                  <SeccionLista>
                    {encontrados.map((c) => (
                      <FilaNavegable key={c.id} titulo={c.nombre} onClick={() => setClienteId(c.id)} chevron />
                    ))}
                  </SeccionLista>
                )}
              </div>
            )}
          </div>
        )}

        {/* Paso 2 — proyecto (solo si hay más de uno) */}
        {pasoProyecto && proyectos && proyectos.length > 1 && (
          <div className="card">
            <div className="label" style={{ marginTop: 0 }}>¿En qué proyecto?</div>
            <SeccionLista>
              {proyectos.map((p) => (
                <FilaNavegable
                  key={p.id}
                  titulo={p.es_general ? `${p.nombre} (todo lo que no encaja en otro)` : p.nombre}
                  onClick={() => setProyectoId(p.id)}
                  chevron
                />
              ))}
            </SeccionLista>
          </div>
        )}

        {/* Paso 3 — formulario */}
        {!!proyectoId && (
          <div className="card">
            <div className="label" style={{ marginTop: 0 }}>Fecha de la visita</div>
            <input
              type="date"
              className="field"
              min={hoyISO}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            <div className="label">Objetivo</div>
            <textarea
              className="field"
              style={{ height: 'auto', padding: 8 }}
              rows={2}
              placeholder="a qué vas: cerrar pedido, presentar gama, primera toma de contacto…"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
            />
            <div className="label">Hora (opcional)</div>
            <input type="time" className="field" value={hora} onChange={(e) => setHora(e.target.value)} />
            {!hora && (
              <>
                <div className="label">Sin hora concreta, ¿cuándo?</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(
                    [
                      ['manana', 'Mañana'],
                      ['tarde', 'Tarde'],
                      ['', 'Sin hora fija'],
                    ] as const
                  ).map(([val, txt]) => (
                    <button
                      key={val || 'sin'}
                      type="button"
                      className={`chip${franja === val ? ' chip--on' : ''}`}
                      onClick={() => setFranja(val)}
                    >
                      {txt}
                    </button>
                  ))}
                </div>
              </>
            )}
            {esDireccion && (
              <>
                <div className="label">Para</div>
                <select className="field" value={comercialPlan} onChange={(e) => setComercialPlan(e.target.value)}>
                  <option value="">Yo ({comercial?.nombre ?? '—'})</option>
                  {comercialesActivos
                    ?.filter((c) => c.id !== comercial?.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                </select>
              </>
            )}
            {guardado.error && (
              <div className="field-error-text" style={{ marginTop: 8 }}>{guardado.error}</div>
            )}
            <button
              className="btn btn-primary"
              style={{ marginTop: 12 }}
              disabled={guardado.cargando || !fecha || !objetivo.trim()}
              onClick={planificar}
            >
              {guardado.cargando ? 'Planificando…' : 'Planificar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
