import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { desdeHace } from '@/lib/fechas';
import { desde } from '@/lib/volver-a';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Aviso } from '@/components/ui/aviso';
import { TextoMarkdown } from '@/components/ui/texto-markdown';

// Briefing del cliente para ESTA visita, preparado por el agente de Copilot
// Studio en segundo plano (cola briefing_visita, migración 122): se pide solo
// al planificar una visita de los próximos 7 días y la noche anterior, y a
// mano con el botón. El agente tarda 8-10 min, así que aquí solo se lee la
// cola y se refresca mientras está en marcha.

interface Briefing {
  estado: 'pendiente' | 'generando' | 'listo' | 'error' | 'sin_cuenta';
  pedido_en: string;
  iniciado_en: string | null;
  terminado_en: string | null;
  contenido: string | null;
  error: string | null;
}

const EN_MARCHA = ['pendiente', 'generando'];
const HORA_MS = 60 * 60 * 1000;

interface BriefingHojaProps {
  visitaId: string;
  clienteId: string;
  clienteNombre: string;
  onCerrar: () => void;
}

export function BriefingHoja({ visitaId, clienteId, clienteNombre, onCerrar }: BriefingHojaProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const pedir = useAccionAsync();

  const { data: b, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey: ['briefing-visita', visitaId],
    queryFn: async (): Promise<Briefing | null> => {
      const { data, error } = await supabase
        .from('briefing_visita')
        .select('estado, pedido_en, iniciado_en, terminado_en, contenido, error')
        .eq('visita_id', visitaId)
        .maybeSingle();
      if (error) throw error;
      return data as Briefing | null;
    },
    refetchInterval: (q) => (q.state.data && EN_MARCHA.includes(q.state.data.estado) ? 15_000 : false),
  });

  const enMarcha = !!b && EN_MARCHA.includes(b.estado);

  // Tope diario: solo importa si esta visita está esperando en la cola.
  const { data: tope } = useQuery({
    queryKey: ['briefing-tope'],
    enabled: b?.estado === 'pendiente',
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_tope_briefing').maybeSingle();
      if (error) throw error;
      return data as { enviados_hoy: number; tope: number; alcanzado: boolean } | null;
    },
  });

  // Reloj para "lleva X min" / "generado hace X".
  const [, setTic] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTic((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const recien = !!b?.terminado_en && Date.now() - new Date(b.terminado_en).getTime() < HORA_MS;
  const puedePedir = !enMarcha && !(b?.estado === 'listo' && recien);

  async function pedirBriefing() {
    await pedir.ejecutar(
      async () => {
        const { error } = await supabase.rpc('fn_pedir_briefing', { p_visita_id: visitaId });
        if (error) throw new Error(error.message);
      },
      { onExito: () => queryClient.invalidateQueries({ queryKey: ['briefing-visita', visitaId] }) }
    );
  }

  const minutos = (desdeIso: string | null) =>
    desdeIso ? Math.max(0, Math.floor((Date.now() - new Date(desdeIso).getTime()) / 60_000)) : 0;

  let estadoTexto: string | null = null;
  if (b?.estado === 'pendiente') {
    estadoTexto = tope?.alcanzado
      ? `Hoy se ha llegado al tope de ${tope.tope} briefings. Este se generará mañana.`
      : `En cola desde hace ${minutos(b.pedido_en)} min. Suele tardar 8-10 minutos en total.`;
  } else if (b?.estado === 'generando') {
    estadoTexto = `Generando: lleva ${minutos(b.iniciado_en)} min. Suele tardar 8-10 minutos.`;
  }

  const boton = (
    <button
      className="btn btn-secondary"
      style={{ width: '100%', marginTop: 12 }}
      disabled={!puedePedir || pedir.cargando}
      onClick={pedirBriefing}
      title={
        b?.estado === 'listo' && recien
          ? `Generado ${desdeHace(b.terminado_en)}. Se puede actualizar una hora después.`
          : undefined
      }
    >
      {pedir.cargando ? 'Pidiendo…' : b?.contenido ? 'Actualizar briefing' : 'Generar briefing'}
    </button>
  );

  return (
    <HojaSuperior titulo={`Briefing · ${clienteNombre}`} onCerrar={onCerrar}>
      {isLoading ? (
        <EstadoLista estado="cargando" />
      ) : isPaused && b === undefined ? (
        <EstadoLista estado="sin-conexion" onReintentar={() => refetch()} />
      ) : isError ? (
        <EstadoLista estado="error" mensaje="No se ha podido cargar el briefing." onReintentar={() => refetch()} />
      ) : b?.estado === 'sin_cuenta' ? (
        <>
          <Aviso tipo="atencion" titulo="Falta la cuenta del CRM">
            Este cliente no tiene vinculada su cuenta del CRM, y sin ella el agente no sabe qué cliente buscar.
            Vincúlala con el lápiz de su ficha y vuelve a pedir el briefing.
          </Aviso>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: 12 }}
            onClick={() => navigate(`/clientes/${clienteId}`, { state: desde(location) })}
          >
            Ir a la ficha del cliente
          </button>
          {boton}
        </>
      ) : (
        <>
          {estadoTexto && (
            <Aviso tipo={tope?.alcanzado && b?.estado === 'pendiente' ? 'atencion' : 'info'}>{estadoTexto}</Aviso>
          )}
          {b?.estado === 'error' && (
            <Aviso tipo="error" titulo="No se pudo generar">
              {b.error ?? 'El agente no ha devuelto el briefing.'}
            </Aviso>
          )}
          {pedir.error && <Aviso tipo="error">{pedir.error}</Aviso>}

          {b?.contenido ? (
            <>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', margin: '8px var(--fila-pad-x)' }}>
                Generado {desdeHace(b.terminado_en)}
                {enMarcha ? ' · se está preparando uno nuevo' : ''}
              </div>
              <TextoMarkdown texto={b.contenido} />
            </>
          ) : (
            !enMarcha &&
            b?.estado !== 'error' && (
              <EstadoLista
                estado="vacio"
                icono="briefing"
                mensaje="Aún no hay briefing para esta visita. El agente tarda unos 8-10 minutos en prepararlo."
              />
            )
          )}
          {boton}
        </>
      )}
    </HojaSuperior>
  );
}
