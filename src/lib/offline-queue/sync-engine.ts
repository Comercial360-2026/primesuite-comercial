import { supabase } from '@/lib/supabase-client';
import { crearVisitaConResponsable } from '@/lib/rpc';
import {
  obtenerPendientes,
  actualizarOperacion,
  obtenerOperacion,
} from './db';
import type { OperacionPendiente } from './types';

// Motor de sincronización — ver 09_arquitectura_tecnica.md §4.
// Procesa la cola local en orden de creación, respetando dependencias
// (una `visita` sincroniza antes que sus `hallazgo`/`captura_libre`), y
// reintenta con backoff simple. No resuelve conflictos complejos: el modelo
// ya es mayormente append-only (Hallazgo, Captura) y lo editable
// (Oportunidad) sigue la regla ya cerrada de last-write-wins — un sync
// simple sin resolución adicional produce exactamente ese comportamiento.

const MAX_INTENTOS = 5;
const INTERVALO_REINTENTO_MS = 60_000;

let intervaloId: ReturnType<typeof setInterval> | null = null;
let sincronizandoAhora = false;

export function iniciarMotorSincronizacion(): void {
  window.addEventListener('online', () => void procesarCola());
  if (!intervaloId) {
    intervaloId = setInterval(() => void procesarCola(), INTERVALO_REINTENTO_MS);
  }
  // Intento inicial al arrancar la app, por si ya hay red y cola pendiente
  // de una sesión anterior.
  void procesarCola();
}

export function detenerMotorSincronizacion(): void {
  if (intervaloId) {
    clearInterval(intervaloId);
    intervaloId = null;
  }
}

export async function procesarCola(): Promise<void> {
  if (sincronizandoAhora || !navigator.onLine) return;
  sincronizandoAhora = true;
  try {
    const pendientes = await obtenerPendientes();
    for (const operacion of pendientes) {
      await procesarOperacion(operacion);
    }
  } finally {
    sincronizandoAhora = false;
  }
}

async function procesarOperacion(operacion: OperacionPendiente): Promise<void> {
  // Si depende de otra operación, esta debe estar ya completada en Supabase
  // (no basta con que exista localmente) — si no, se deja para el siguiente
  // ciclo sin marcar error, es una espera normal, no un fallo.
  if (operacion.dependeDe) {
    const dependencia = await obtenerOperacion(operacion.dependeDe);
    if (dependencia && dependencia.estado === 'error' && dependencia.intentos >= MAX_INTENTOS) {
      // Antes, si el padre (normalmente una visita) fallaba de forma
      // permanente, sus hijos (fotos, hallazgos, próximos pasos...) se
      // quedaban en 'pendiente' esperando para siempre — el motor seguía
      // reintentando el padre cada minuto sin límite, y los hijos nunca
      // llegaban ni a intentar su propia subida ni a marcar su propio
      // error. Sin ningún aviso visible, la cola quedaba bloqueada de
      // verdad, no solo lenta. Ahora el fallo del padre se propaga: el
      // hijo pasa a 'error' también, con un mensaje que explica por qué,
      // en vez de esperar eternamente a algo que ya no va a completarse.
      await actualizarOperacion(operacion.id, {
        estado: 'error',
        ultimoError: 'No se pudo sincronizar porque depende de otro elemento que falló de forma permanente (revísalo primero).',
      });
      return;
    }
    if (dependencia && dependencia.estado !== 'completado') {
      return;
    }
  }

  await actualizarOperacion(operacion.id, { estado: 'subiendo' });

  try {
    switch (operacion.entidad) {
      case 'visita':
        await sincronizarVisita(operacion);
        break;
      case 'hallazgo':
      case 'oportunidad':
      case 'proximo_paso':
      case 'ubicacion':
        await sincronizarInsertSimple(operacion.entidad, operacion);
        break;
      case 'captura_libre':
        await sincronizarCapturaLibre(operacion);
        break;
    }
    await actualizarOperacion(operacion.id, { estado: 'completado' });
    // Se conserva en IndexedDB con estado 'completado' en vez de borrarse
    // inmediatamente, para que la UI pueda seguir leyendo la cola local sin
    // parpadeos mientras la caché de TanStack Query se revalida. La limpieza
    // de operaciones completadas antiguas es una tarea de mantenimiento
    // ligera, no crítica para el flujo — se puede añadir sin tocar este
    // motor si el volumen local llega a pesar.
  } catch (err) {
    const intentos = operacion.intentos + 1;
    const mensaje = err instanceof Error ? err.message : String(err);
    await actualizarOperacion(operacion.id, {
      estado: intentos >= MAX_INTENTOS ? 'error' : 'pendiente',
      intentos,
      ultimoError: mensaje,
    });
  }
}

async function sincronizarVisita(operacion: OperacionPendiente<'visita'>): Promise<void> {
  const { clienteId, comercialResponsableId, tipoVisita, fecha, agendada } = operacion.payload;
  const { error } = await crearVisitaConResponsable({
    pVisitaId: operacion.id,
    pClienteId: clienteId,
    pComercialId: comercialResponsableId,
    pTipoVisita: tipoVisita,
    pFecha: fecha ?? null,
    pEstadoCaptura: agendada ? 'agendada' : null,
  });
  if (error) throw new Error(error);
}

// Hallazgo, Oportunidad y Próximo paso son INSERT directos — no tienen el
// problema de doble escritura atómica que sí tiene Visita (§1 de
// 10_rpc_functions.sql), así que no necesitan pasar por una RPC.
async function sincronizarInsertSimple(
  tabla: 'hallazgo' | 'oportunidad' | 'proximo_paso' | 'ubicacion',
  operacion: OperacionPendiente
): Promise<void> {
  const fila = aPayloadSnakeCase(operacion);
  // `tabla` es una unión de nombres y `fila` es Record<string, unknown> — con
  // los tipos reales de Supabase, TypeScript no puede verificar en tiempo de
  // compilación que el objeto satisface el `Insert` de la tabla concreta que
  // resulte en tiempo de ejecución (no hay forma de expresar "el shape
  // correcto según el valor de esta variable" con `.from(tabla)` dinámico).
  // La corrección real de tipos vive en `PayloadPorEntidad` (types.ts) y en
  // `aPayloadSnakeCase`, no aquí — este `as any` es el único punto de puente
  // deliberado entre esa capa tipada y la llamada genérica a Supabase.
  const { error } = await supabase.from(tabla).insert({ id: operacion.id, ...fila } as any);
  if (error) throw new Error(error.message);
}

async function sincronizarCapturaLibre(
  operacion: OperacionPendiente<'captura_libre'>
): Promise<void> {
  const payload = operacion.payload;
  let storagePath: string | null = null;

  if (operacion.archivoLocal && (payload.tipo === 'foto' || payload.tipo === 'audio')) {
    const bucket = payload.tipo === 'foto' ? 'fotos-visita' : 'audios-visita';
    const extension = payload.tipo === 'foto' ? 'jpg' : 'm4a';
    const ruta = `${payload.visitaId}/${operacion.id}.${extension}`;

    const { error: errorSubida } = await supabase.storage
      .from(bucket)
      .upload(ruta, operacion.archivoLocal, { upsert: true });
    if (errorSubida) throw new Error(errorSubida.message);
    storagePath = ruta;
  }

  const fila = aPayloadSnakeCase(operacion);
  // Mismo puente deliberado que en sincronizarInsertSimple — ver comentario
  // de arriba.
  const { error } = await supabase
    .from('captura_libre')
    .insert({ id: operacion.id, ...fila, storage_path: storagePath } as any);
  if (error) throw new Error(error.message);
}

// Traducción camelCase (TypeScript) → snake_case (columnas Postgres).
// Deliberadamente explícita y no "mágica" (sin librería de conversión
// automática) — con cinco entidades y pocos campos cada una, una función
// manual es más fácil de auditar que una dependencia adicional.
function aPayloadSnakeCase(operacion: OperacionPendiente): Record<string, unknown> {
  const p = operacion.payload as unknown as Record<string, unknown>;
  const resultado: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(p)) {
    if (valor === undefined) continue;
    const claveSnake = clave.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`);
    resultado[claveSnake] = valor;
  }
  return resultado;
}
