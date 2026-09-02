import { supabase } from '@/lib/supabase-client';

// Envoltorio de la Edge Function `gestionar-comercial` (Fase 5). Todas las
// altas/bajas/ediciones de comerciales pasan por aquí: el alta necesita la
// clave de servicio (crea el usuario de Auth), y la baja bloquea además el
// login. Ver supabase/functions/gestionar-comercial/index.ts.

export type RolComercial = 'comercial' | 'direccion_comercial';

interface CrearParams {
  nombre: string;
  email: string;
  rol: RolComercial;
  zona_cartera?: string | null;
}
interface EditarParams {
  id: string;
  nombre: string;
  rol: RolComercial;
  zona_cartera?: string | null;
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

// En una conexión que se muere a media petición, functions.invoke() puede
// no resolver NUNCA: el usuario se queda con el botón en "Dando de baja…"
// para siempre, sin error y sin poder reintentar. A los 30 s se da por
// fallida. Reintentar es seguro: `desactivar`/`reactivar` son idempotentes
// y `fn_traspasar_cartera` no mueve nada en la segunda pasada (ya no queda
// cartera del comercial de origen). 30 s da margen de sobra a la cadena
// más lenta (traspaso de cartera + update + ban de Auth).
const TIMEOUT_MS = 30_000;

async function invocar<T>(body: Record<string, unknown>, reservaError: string): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, reject) => {
    temporizador = setTimeout(
      () => reject(new Error('La operación ha tardado demasiado. Comprueba tu conexión e inténtalo de nuevo.')),
      TIMEOUT_MS
    );
  });
  try {
    const { data, error } = await Promise.race([
      supabase.functions.invoke('gestionar-comercial', { body }),
      limite,
    ]);
    if (error) throw new Error(await mensajeDeError(error, reservaError));
    if (data?.error) throw new Error(data.error as string);
    return data as T;
  } finally {
    clearTimeout(temporizador);
  }
}

// `window.location.origin` para que la Edge Function componga el
// `redirect_to` del enlace hacia ESTA instalación (localhost / producción).
function origenApp(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function crearComercial(p: CrearParams) {
  return invocar<{ id: string; action_link: string | null; aviso?: string }>(
    { accion: 'crear', ...p, app_url: origenApp() },
    'No se pudo crear el comercial.'
  );
}

// Regenera el enlace de acceso de un comercial (contraseña perdida, enlace
// caducado). Si tenía una petición de acceso pendiente, la marca resuelta.
export function enlaceAcceso(id: string) {
  return invocar<{ action_link: string }>(
    { accion: 'enlace_acceso', id, app_url: origenApp() },
    'No se pudo generar el enlace de acceso.'
  );
}

// La llama el comercial SIN sesión desde el login. Respuesta siempre igual.
export function solicitarAcceso(email: string) {
  return invocar<{ ok: true }>(
    { accion: 'solicitar_acceso', email },
    'No se pudo enviar el aviso.'
  );
}

export function editarComercial(p: EditarParams) {
  return invocar<{ ok: true }>({ accion: 'editar', ...p }, 'No se pudo guardar el comercial.');
}

// `traspasarA` (Fase 6b): antes de bloquear el acceso, pasa la cartera del
// comercial (clientes + visitas planificadas + próximos pasos) a otro.
export function desactivarComercial(id: string, traspasarA?: string) {
  return invocar<{ ok: true }>(
    { accion: 'desactivar', id, ...(traspasarA ? { traspasar_a: traspasarA } : {}) },
    'No se pudo dar de baja al comercial.'
  );
}

export function reactivarComercial(id: string) {
  return invocar<{ ok: true }>({ accion: 'reactivar', id }, 'No se pudo reactivar al comercial.');
}

export interface RecuentoTraspaso {
  clientes: number;
  visitas: number;
  pasos: number;
}

// Traspaso de cartera SIN dar de baja (redistribuir carga, o preparar una
// baja). RPC de Postgres — la llama Dirección Comercial directamente.
export async function traspasarCartera(de: string, a: string): Promise<RecuentoTraspaso> {
  const { data, error } = await supabase.rpc('fn_traspasar_cartera', { p_de: de, p_a: a });
  if (error) throw new Error(error.message);
  const r = data?.[0];
  return { clientes: r?.clientes ?? 0, visitas: r?.visitas ?? 0, pasos: r?.pasos ?? 0 };
}

// Cambia el responsable de UN cliente (y arrastra sus visitas planificadas
// y pasos pendientes del responsable anterior).
export async function reasignarCliente(
  clienteId: string,
  a: string
): Promise<{ visitas: number; pasos: number }> {
  const { data, error } = await supabase.rpc('fn_reasignar_cliente', { p_cliente: clienteId, p_a: a });
  if (error) throw new Error(error.message);
  const r = data?.[0];
  return { visitas: r?.visitas ?? 0, pasos: r?.pasos ?? 0 };
}
