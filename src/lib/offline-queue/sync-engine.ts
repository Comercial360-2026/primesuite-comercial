import { supabase } from '@/lib/supabase-client';
import { crearVisitaConResponsable } from '@/lib/rpc';
import {
  obtenerPendientes,
  actualizarOperacion,
  obtenerOperacion,
  purgarCompletadasAntiguas,
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
// Backoff corto tras un fallo suelto (no agotado) — 3s, 6s, 12s, 24s, tope
// 30s — para no depender del ciclo automático de 60s en el caso normal
// (timeout de red, corte momentáneo). Con MAX_INTENTOS=5 nunca se llega a
// esperar más que esto antes de que el intento agote y pase a 'error'.
const REINTENTO_RAPIDO_BASE_MS = 3_000;
const REINTENTO_RAPIDO_MAX_MS = 30_000;

let intervaloId: ReturnType<typeof setInterval> | null = null;
let sincronizandoAhora = false;
// Si llega una petición de sincronizar mientras ya hay una pasada en curso
// (p. ej. una foto grande subiendo con mala conexión) y se descartaba sin
// más, la SIGUIENTE captura no arrancaba a subir hasta el ciclo automático
// de 60s — parecía que el guardado se había quedado colgado más de lo que
// realmente hacía falta (bug real, dos capturas seguidas: la segunda
// tardaba mucho más que la primera). Ahora se apunta y se relanza en
// cuanto la pasada actual termina, en vez de perderse.
let pendienteReejecucion: { incluirErrores: boolean } | null = null;

export function iniciarMotorSincronizacion(): void {
  window.addEventListener('online', () => void procesarCola());
  if (!intervaloId) {
    intervaloId = setInterval(() => void procesarCola(), INTERVALO_REINTENTO_MS);
  }
  // Intento inicial al arrancar la app, por si ya hay red y cola pendiente
  // de una sesión anterior.
  void procesarCola();
  // Mantenimiento ligero, una vez por arranque de app: purga lo
  // 'completado' hace más de 30 días. No bloquea nada de lo anterior — si
  // falla, no impide sincronizar. Se retrasa un poco para no competir con
  // la carga inicial de la pantalla que se esté abriendo justo ahora — la
  // purga ya trabaja por lotes (ver db.ts) y no monopoliza el almacén,
  // pero no hay motivo para que la primera pantalla del usuario comparta
  // el arranque en frío con una tarea de mantenimiento que puede esperar.
  setTimeout(() => {
    void purgarCompletadasAntiguas().catch(() => {});
  }, 5000);
}

export function detenerMotorSincronizacion(): void {
  if (intervaloId) {
    clearInterval(intervaloId);
    intervaloId = null;
  }
}

// Evento en `window` al terminar una pasada de la cola: la UI que muestra
// "N sin sincronizar" (pantalla Yo) lo escucha para refrescarse al instante
// en vez de esperar a su propio intervalo.
export const EVENTO_COLA_PROCESADA = 'primesuite:cola-procesada';

export async function procesarCola(opciones?: { incluirErrores?: boolean }): Promise<void> {
  const incluirErrores = opciones?.incluirErrores ?? false;
  if (sincronizandoAhora) {
    if (!pendienteReejecucion || incluirErrores) pendienteReejecucion = { incluirErrores };
    return;
  }
  if (!navigator.onLine) return;
  sincronizandoAhora = true;
  try {
    const pendientes = await obtenerPendientes(incluirErrores);
    for (const operacion of pendientes) {
      await procesarOperacion(operacion);
    }
  } finally {
    sincronizandoAhora = false;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(EVENTO_COLA_PROCESADA));
    }
    if (pendienteReejecucion) {
      const siguiente = pendienteReejecucion;
      pendienteReejecucion = null;
      void procesarCola(siguiente);
    }
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

  // `operacion` es el snapshot que leyó `obtenerPendientes()` al empezar
  // esta pasada — si el comercial edita algo (p. ej. cambia la zona de una
  // foto desde su ficha) MIENTRAS esta operación sigue en cola esperando
  // su turno o subiendo, ese snapshot ya está desfasado. Sin releer aquí,
  // el cambio se guardaba bien en IndexedDB pero la subida al servidor
  // mandaba el payload viejo — la edición se perdía en el servidor sin
  // ningún aviso (bug real: cambiar de zona justo tras hacer la foto).
  const actual = (await obtenerOperacion(operacion.id)) ?? operacion;

  try {
    switch (actual.entidad) {
      case 'visita':
        await sincronizarVisita(actual);
        break;
      case 'cliente':
      case 'proyecto':
      case 'oportunidad':
      case 'proximo_paso':
      case 'ubicacion':
        await sincronizarInsertSimple(actual.entidad, actual);
        break;
      case 'hallazgo':
        await sincronizarHallazgo(actual);
        break;
      case 'captura_libre':
        await sincronizarCapturaLibre(actual);
        break;
    }
    await actualizarOperacion(actual.id, { estado: 'completado' });
    // Se conserva en IndexedDB con estado 'completado' en vez de borrarse
    // inmediatamente, para que la UI pueda seguir leyendo la cola local sin
    // parpadeos mientras la caché de TanStack Query se revalida. La limpieza
    // de operaciones completadas antiguas es una tarea de mantenimiento
    // ligera, no crítica para el flujo — se puede añadir sin tocar este
    // motor si el volumen local llega a pesar.
  } catch (err) {
    const intentos = actual.intentos + 1;
    const mensaje = err instanceof Error ? err.message : String(err);
    const agotado = intentos >= MAX_INTENTOS;
    await actualizarOperacion(actual.id, {
      estado: agotado ? 'error' : 'pendiente',
      intentos,
      ultimoError: mensaje,
    });
    if (!agotado) {
      // Un fallo suelto (foto grande + cobertura floja: el timeout de la
      // subida, un corte momentáneo de la conexión) antes se quedaba
      // esperando al ciclo automático siguiente — hasta 60s después, sea
      // cual sea el motivo del fallo — en vez de reintentarse en segundos.
      // Reportado en real por Cesar: "tarda 60 segundos en actualizar",
      // el número exacto del intervalo automático (INTERVALO_REINTENTO_MS).
      const espera = Math.min(REINTENTO_RAPIDO_BASE_MS * 2 ** (intentos - 1), REINTENTO_RAPIDO_MAX_MS);
      setTimeout(() => void procesarCola(), espera);
    }
  }
}

async function sincronizarVisita(operacion: OperacionPendiente<'visita'>): Promise<void> {
  const { clienteId, proyectoId, comercialResponsableId, tipoVisita, objetivo, fecha, agendada } = operacion.payload;
  if (!proyectoId) {
    // Desde la migración 103/104 el proyecto viaja siempre en el payload; una
    // visita en cola sin él es una operación mal formada (no debería ocurrir).
    throw new Error('La visita en cola no tiene proyecto asignado.');
  }
  const { error } = await crearVisitaConResponsable({
    pVisitaId: operacion.id,
    pClienteId: clienteId,
    pComercialId: comercialResponsableId,
    pProyectoId: proyectoId,
    pTipoVisita: tipoVisita,
    pFecha: fecha ?? null,
    pEstadoCaptura: agendada ? 'agendada' : null,
  });
  if (error) throw new Error(error);
  // La RPC no conoce `objetivo` — UPDATE posterior, igual que hace el front al
  // planificar desde la ficha. Si falla, se lanza para reintentar toda la
  // operación (la visita ya existe; el UPDATE es idempotente).
  const parche: { objetivo?: string } = {};
  if (objetivo?.trim()) parche.objetivo = objetivo.trim();
  if (Object.keys(parche).length) {
    const { error: errParche, count } = await supabase
      .from('visita')
      .update(parche, { count: 'exact' })
      .eq('id', operacion.id);
    if (errParche) throw new Error(errParche.message);
    if (!count) throw new Error('La visita se creó, pero no se ha podido fijar el objetivo (0 filas afectadas).');
  }
}

// Oportunidad y Próximo paso son INSERT directos — no tienen el problema de
// doble escritura atómica que sí tiene Visita (§1 de 10_rpc_functions.sql),
// así que no necesitan pasar por una RPC. (Hallazgo tiene su propia función
// por la tabla puente `hallazgo_area` — ver `sincronizarHallazgo`.)
async function sincronizarInsertSimple(
  tabla: 'cliente' | 'proyecto' | 'oportunidad' | 'proximo_paso' | 'ubicacion',
  operacion: OperacionPendiente
): Promise<void> {
  const fila = aPayloadSnakeCase(operacion);
  // `tabla` es una unión de nombres y `fila` es Record<string, unknown> — con
  // los tipos reales de Supabase, TypeScript no puede verificar en tiempo de
  // compilación que el objeto satisface el `Insert` de la tabla concreta que
  // resulte en tiempo de ejecución (no hay forma de expresar "el shape
  // correcto según el valor de esta variable" con `.from(tabla)` dinámico).
  // La corrección real de tipos vive en `PayloadPorEntidad` (types.ts) y en
  // `aPayloadSnakeCase`, no aquí — este `as never` es el único punto de puente
  // deliberado entre esa capa tipada y la llamada genérica a Supabase.
  const { error } = await supabase.from(tabla).insert({ id: operacion.id, ...fila } as never);
  if (error) throw new Error(error.message);
}

// Hallazgo = fila en `hallazgo` + N filas en la tabla puente `hallazgo_area`
// (prompt maestro 11, Fase 2). No es atómico en el servidor, así que se
// escribe de forma idempotente para que un reintento tras un fallo a medias
// no deje el hallazgo sin áreas ni las duplique:
//  - la fila `hallazgo` va con upsert que ignora el duplicado de PK,
//  - las áreas se borran y se reinsertan (borrar 0 en la primera pasada).
async function sincronizarHallazgo(operacion: OperacionPendiente<'hallazgo'>): Promise<void> {
  const { areas, ...restoPayload } = operacion.payload;
  const fila = aPayloadSnakeCase({ ...operacion, payload: restoPayload } as OperacionPendiente);
  // `naturaleza` se retiró de `hallazgo` (PM11 Fase 5). Una operación
  // encolada antes del cambio aún la lleva en el payload — se descarta aquí
  // para que el INSERT no falle por columna inexistente.
  delete (fila as Record<string, unknown>).naturaleza;

  const { error } = await supabase
    .from('hallazgo')
    .upsert({ id: operacion.id, ...fila } as never, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  const { error: errorBorrado } = await supabase
    .from('hallazgo_area')
    .delete()
    .eq('hallazgo_id', operacion.id);
  if (errorBorrado) throw new Error(errorBorrado.message);

  if (areas && areas.length > 0) {
    const filasArea = areas.map((a) => ({
      hallazgo_id: operacion.id,
      categoria_id: a.tipo === 'categoria' ? a.id : null,
      termino_id: a.tipo === 'termino' ? a.id : null,
    }));
    const { error: errorAreas } = await supabase.from('hallazgo_area').insert(filasArea);
    if (errorAreas) throw new Error(errorAreas.message);
  }
}

function extensionAudio(mime: string): string {
  if (/mp4|m4a|aac/.test(mime)) return 'm4a';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (/mpeg|mp3/.test(mime)) return 'mp3';
  return 'm4a';
}

async function sincronizarCapturaLibre(
  operacion: OperacionPendiente<'captura_libre'>
): Promise<void> {
  const payload = operacion.payload;
  let storagePath: string | null = null;

  if (operacion.archivoLocal && (payload.tipo === 'foto' || payload.tipo === 'audio')) {
    const bucket = payload.tipo === 'foto' ? 'fotos-visita' : 'audios-visita';
    // La extensión del audio se deriva del tipo real del blob (iOS graba
    // mp4/m4a, Android/desktop webm). Antes se forzaba .m4a siempre, aunque
    // el contenido fuera webm — playback y descargas rotas.
    const extension =
      payload.tipo === 'foto' ? 'jpg' : extensionAudio(operacion.archivoLocal.type);
    const ruta = `${payload.visitaId}/${operacion.id}.${extension}`;

    const { error: errorSubida } = await supabase.storage.from(bucket).upload(ruta, operacion.archivoLocal, {
      upsert: true,
      contentType: operacion.archivoLocal.type || undefined,
    });
    if (errorSubida) throw new Error(errorSubida.message);
    storagePath = ruta;
  }

  const fila = aPayloadSnakeCase(operacion);
  // Mismo puente `as never` deliberado que en sincronizarInsertSimple — ver comentario
  // de arriba.
  const { error } = await supabase
    .from('captura_libre')
    .insert({ id: operacion.id, ...fila, storage_path: storagePath } as never);
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
