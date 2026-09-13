import { supabase } from '@/lib/supabase-client';

// Envoltorio de la Edge Function `generar-briefing-cliente`: tickets reales
// de Jira del cliente, clasificados por reglas de código (SIN IA — decisión
// de Cesar por coste). Ver supabase/functions/generar-briefing-cliente/index.ts.

export interface BriefingCliente {
  ok: true;
  sinTickets: boolean;
  totalTickets: number;
  generadoEn: string;
  criticos: { key: string; resumen: string; estado: string; prioridad: string }[];
  incidenciasActivas: { key: string; resumen: string; estado: string }[];
  estadoGeneral: { nivel: 'Bien' | 'Regular' | 'Mal'; texto: string };
  contextoComercial: string;
  queEspera: { texto: string; tickets: { key: string; resumen: string }[] };
  recomendacion: string;
}

// supabase-js mete el cuerpo de un error 4xx/5xx en `error.context`; se
// intenta sacar el mensaje real de la función, con un texto de reserva.
async function mensajeDeError(error: unknown, reserva: string): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const cuerpo = await ctx.json();
      if (cuerpo?.error) return cuerpo.error as string;
    }
  } catch {
    /* se usa la reserva */
  }
  return error instanceof Error && error.message ? error.message : reserva;
}

// Jira puede tardar (hasta 15 s dentro de la función); 25 s da margen sin
// dejar al comercial mirando "Consultando…" indefinidamente si la conexión
// muere a media petición.
const TIMEOUT_MS = 25_000;

export async function generarBriefing(clienteId: string): Promise<BriefingCliente> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, reject) => {
    temporizador = setTimeout(
      () => reject(new Error('La consulta a Jira ha tardado demasiado. Inténtalo de nuevo.')),
      TIMEOUT_MS
    );
  });
  try {
    const { data, error } = await Promise.race([
      supabase.functions.invoke('generar-briefing-cliente', {
        body: { accion: 'generar', cliente_id: clienteId },
      }),
      limite,
    ]);
    if (error) throw new Error(await mensajeDeError(error, 'No se pudo generar el briefing.'));
    if (data?.error) throw new Error(data.error as string);
    return data as BriefingCliente;
  } finally {
    clearTimeout(temporizador);
  }
}
