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

// «Pregunta a la IA»: pregunta libre sobre ESTE cliente al agente de Copilot
// Studio «Consultas comerciales CB» (CRM, Licitaciones, Jira, Confluence).
// Cola consulta_ia (migración 126) + Edge Function procesar-consultas. Cada
// comercial ve solo sus preguntas; quién puede preguntar y el tope diario los
// decide la base de datos (fn_preguntar_ia).

interface Consulta {
  id: string;
  pregunta: string;
  estado: 'pendiente' | 'generando' | 'listo' | 'error' | 'sin_cuenta' | 'cancelada';
  respuesta: string | null;
  error: string | null;
  pedido_en: string;
  terminado_en: string | null;
}

const EN_MARCHA = ['pendiente', 'generando'];
const MAX_CARACTERES = 1000;

interface PreguntaIAHojaProps {
  clienteId: string;
  clienteNombre: string;
  visitaId?: string;
  onCerrar: () => void;
}

export function PreguntaIAHoja({ clienteId, clienteNombre, visitaId, onCerrar }: PreguntaIAHojaProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const enviar = useAccionAsync();
  const cancelar = useAccionAsync();
  const [texto, setTexto] = useState('');

  const clave = ['consulta-ia', clienteId];
  const { data: consultas, isLoading, isError, isPaused, refetch } = useQuery({
    queryKey: clave,
    queryFn: async (): Promise<Consulta[]> => {
      const { data, error } = await supabase
        .from('consulta_ia')
        .select('id, pregunta, estado, respuesta, error, pedido_en, terminado_en')
        .eq('cliente_id', clienteId)
        .order('pedido_en', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Consulta[];
    },
    refetchInterval: (q) => (q.state.data?.some((c) => EN_MARCHA.includes(c.estado)) ? 5_000 : false),
  });

  const { data: tope } = useQuery({
    queryKey: ['consulta-ia-tope'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_tope_consulta_ia').maybeSingle();
      if (error) throw error;
      return data as { hechas_hoy: number; tope: number | null; alcanzado: boolean } | null;
    },
  });

  // Reloj para «lleva X s».
  const [, setTic] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTic((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  const enMarcha = consultas?.some((c) => EN_MARCHA.includes(c.estado)) ?? false;
  const puedeEnviar = texto.trim().length >= 3 && !enMarcha && !tope?.alcanzado && !enviar.cargando;

  async function preguntar() {
    await enviar.ejecutar(
      async () => {
        const { error } = await supabase.rpc('fn_preguntar_ia', {
          p_cliente_id: clienteId,
          p_pregunta: texto.trim(),
          p_visita_id: visitaId,
        });
        if (error) throw new Error(error.message);
      },
      {
        onExito: () => {
          setTexto('');
          queryClient.invalidateQueries({ queryKey: clave });
          queryClient.invalidateQueries({ queryKey: ['consulta-ia-tope'] });
        },
      }
    );
  }

  const segundos = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));

  async function cancelarConsulta(id: string) {
    await cancelar.ejecutar(
      async () => {
        const { error } = await supabase.rpc('fn_cancelar_consulta_ia', { p_id: id });
        if (error) throw new Error(error.message);
      },
      {
        onExito: () => {
          queryClient.invalidateQueries({ queryKey: clave });
          queryClient.invalidateQueries({ queryKey: ['consulta-ia-tope'] });
        },
      }
    );
  }

  return (
    <HojaSuperior titulo={`Pregunta a la IA · ${clienteNombre}`} onCerrar={onCerrar}>
      <div style={{ padding: '0 var(--fila-pad-x)' }}>
        <textarea
          className="field"
          rows={3}
          maxLength={MAX_CARACTERES}
          placeholder="Ej.: ¿qué ofertas tiene abiertas? ¿qué condiciones tiene su último contrato? ¿tiene incidencias abiertas?"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={enMarcha}
          style={{ width: '100%' }}
        />
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 8 }}
          disabled={!puedeEnviar}
          onClick={preguntar}
        >
          {enviar.cargando ? 'Enviando…' : 'Preguntar'}
        </button>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
          Busca en el CRM, en Licitaciones y pedidos, en Jira y en Confluence. Tarda entre 20 segundos y 3 minutos.
          {tope?.tope != null && ` Hoy llevas ${tope.hechas_hoy} de ${tope.tope}.`}
        </div>
        {tope?.alcanzado && (
          <Aviso tipo="atencion">Has llegado a tu tope de preguntas de hoy. Mañana podrás seguir.</Aviso>
        )}
        {enviar.error && <Aviso tipo="error">{enviar.error}</Aviso>}
      </div>

      {isLoading ? (
        <EstadoLista estado="cargando" />
      ) : isPaused && consultas === undefined ? (
        <EstadoLista estado="sin-conexion" onReintentar={() => refetch()} />
      ) : isError ? (
        <EstadoLista estado="error" mensaje="No se han podido cargar tus preguntas." onReintentar={() => refetch()} />
      ) : !consultas?.length ? (
        <EstadoLista
          estado="vacio"
          icono="ia"
          mensaje="Aún no has preguntado nada sobre este cliente. Solo tú ves tus preguntas."
        />
      ) : (
        consultas.map((c) => (
          <div key={c.id} style={{ margin: '16px var(--fila-pad-x) 0' }}>
            <div style={{ fontWeight: 600 }}>{c.pregunta}</div>
            {EN_MARCHA.includes(c.estado) ? (
              <>
                <Aviso tipo={segundos(c.pedido_en) > 180 ? 'atencion' : 'info'}>
                  {segundos(c.pedido_en) > 180
                    ? `Está tardando más de lo normal: lleva ${segundos(c.pedido_en)} s. Si pasa de 8 minutos se cancela sola. Puedes cerrar esta pantalla: seguirá buscando y verás la respuesta al volver a abrirla, o cancelarla ahora.`
                    : `Buscando… lleva ${segundos(c.pedido_en)} s. Suele tardar 1-3 minutos. Puedes cerrar esta pantalla mientras tanto.`}
                </Aviso>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: 8 }}
                  disabled={cancelar.cargando}
                  onClick={() => cancelarConsulta(c.id)}
                >
                  {cancelar.cargando ? 'Cancelando…' : 'Cancelar esta pregunta'}
                </button>
                {cancelar.error && <Aviso tipo="error">{cancelar.error}</Aviso>}
              </>
            ) : (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', margin: '2px 0 6px' }}>
                {desdeHace(c.terminado_en ?? c.pedido_en)}
              </div>
            )}
            {c.estado === 'listo' && c.respuesta && <TextoMarkdown texto={c.respuesta} />}
            {c.estado === 'error' && <Aviso tipo="error">{c.error ?? 'El agente no ha respondido.'}</Aviso>}
            {c.estado === 'cancelada' && <Aviso tipo="info">Cancelada. No cuenta para tu tope diario.</Aviso>}
            {c.estado === 'sin_cuenta' && (
              <Aviso tipo="atencion" titulo="Falta la cuenta del CRM">
                Sin la cuenta del CRM vinculada, el agente no sabe qué cliente buscar. Vincúlala con el lápiz de la
                ficha del cliente y vuelve a preguntar.
                {!location.pathname.startsWith(`/clientes/${clienteId}`) && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: '100%', marginTop: 8 }}
                    onClick={() => navigate(`/clientes/${clienteId}`, { state: desde(location) })}
                  >
                    Ir a la ficha del cliente
                  </button>
                )}
              </Aviso>
            )}
          </div>
        ))
      )}
    </HojaSuperior>
  );
}

// Solo el responsable del cliente, quien participa en sus visitas o Dirección.
export function usePuedePreguntarIA(clienteId: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ['consulta-ia-permiso', clienteId],
    enabled: !!clienteId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_puede_consultar_cliente', { p_cliente_id: clienteId! });
      if (error) throw error;
      return data === true;
    },
  });
  return data === true;
}
