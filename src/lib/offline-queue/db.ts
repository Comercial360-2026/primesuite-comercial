import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { OperacionPendiente, EntidadSincronizable, EstadoOperacion } from './types';

// Una única base de datos local, un único object store para toda la cola.
// No se replica el esquema completo de Supabase en local — solo se persiste
// lo que está pendiente de sincronizar (ver 09_arquitectura_tecnica.md §4).
// El binario (Blob de foto/audio) se guarda directamente en el mismo
// registro: IndexedDB soporta Blobs de forma nativa, así que no hace falta
// un store separado ni convertir a base64.

interface ColaOfflineDB extends DBSchema {
  operaciones: {
    key: string; // OperacionPendiente.id
    value: OperacionPendiente;
    indexes: {
      'by-estado': EstadoOperacion;
      'by-entidad': EntidadSincronizable;
      'by-creado-en': string;
      // v2: qué visita referencia esta operación (denormalizado, ver
      // calcularVisitaId). Sin esto, obtenerPorVisita tenía que leer TODA
      // la cola local (todas las visitas, con todos sus blobs de fotos/
      // audios) y filtrar en memoria — el escaneo completo es lo que
      // causaba el retraso real (~5s en dispositivos con historial) al
      // recargar la visita activa tras cualquier cambio en la cola.
      'by-visita-id': string;
    };
  };
}

const DB_NAME = 'primesuite-cola-offline';
const DB_VERSION = 2;

// Qué visita referencia una operación, la misma regla que ya usaban
// obtenerPorVisita/obtenerVisitasConPendientes filtrando en memoria —
// ahora se calcula UNA VEZ al guardar (encolar/actualizar) y UNA VEZ al
// migrar lo ya guardado, para poder indexarlo. 'cliente'/'proyecto'/
// 'ubicacion' no cuelgan de una visita → undefined (fuera del índice).
function calcularVisitaId(op: OperacionPendiente): string | undefined {
  if (op.entidad === 'visita') return op.id;
  if (op.entidad === 'oportunidad') {
    return (op.payload as { visitaOrigenId?: string }).visitaOrigenId;
  }
  if (op.entidad === 'cliente' || op.entidad === 'proyecto' || op.entidad === 'ubicacion') {
    return undefined;
  }
  return (op.payload as { visitaId?: string }).visitaId;
}

let dbPromise: Promise<IDBPDatabase<ColaOfflineDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<ColaOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        const store =
          oldVersion < 1
            ? db.createObjectStore('operaciones', { keyPath: 'id' })
            : transaction.objectStore('operaciones');
        if (oldVersion < 1) {
          store.createIndex('by-estado', 'estado');
          store.createIndex('by-entidad', 'entidad');
          store.createIndex('by-creado-en', 'creadoEn');
        }
        if (oldVersion < 2) {
          store.createIndex('by-visita-id', 'visitaId');
          // Migración retroactiva: lo ya guardado en el dispositivo antes de
          // esta versión no tiene `visitaId` — sin esto, el índice nuevo
          // simplemente no las encontraría y "desaparecerían" de
          // obtenerPorVisita para visitas con capturas ya en cola.
          if (oldVersion >= 1) {
            store.openCursor().then(function recorrer(cursor): unknown {
              if (!cursor) return;
              const op = cursor.value as OperacionPendiente;
              if (op.visitaId === undefined) {
                cursor.update({ ...op, visitaId: calcularVisitaId(op) });
              }
              return cursor.continue().then(recorrer);
            });
          }
        }
      },
      terminated() {
        // Safari en iPhone (y otros navegadores bajo presión de memoria, o
        // al pasar la app a segundo plano) cierran la conexión IndexedDB
        // por su cuenta. La promesa cacheada seguía resolviendo a ese
        // handle muerto y toda operación posterior fallaba con "Failed to
        // execute 'transaction' on 'IDBDatabase': The database connection
        // is closing." — encolar al pulsar "Iniciar visita", guardar una
        // captura, etc. Al invalidar la promesa aquí, la siguiente llamada
        // reabre la conexión.
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

// Devuelve true si el error es el navegador cerrando la conexión IndexedDB
// por su cuenta. `terminated` (arriba) cubre el caso en que el cierre ya ha
// terminado, pero si la operación se lanza justo mientras la conexión se
// está cerrando, se recibe este DOMException antes de que `terminated`
// llegue a dispararse — hay que detectarlo también aquí.
function esConexionCerrada(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'InvalidStateError' || err.name === 'AbortError') &&
    /clos(ing|ed)/i.test(err.message)
  );
}

// Toda operación contra IndexedDB pasa por aquí: si falla porque la conexión
// se cerró, se descarta el handle muerto, se reabre y se reintenta UNA vez.
// Si el segundo intento también falla, se propaga el error.
async function conDb<T>(fn: (db: IDBPDatabase<ColaOfflineDB>) => Promise<T>): Promise<T> {
  try {
    return await fn(await getDb());
  } catch (err) {
    if (!esConexionCerrada(err)) throw err;
    dbPromise = null;
    return fn(await getDb());
  }
}

export async function encolarOperacion(operacion: OperacionPendiente): Promise<void> {
  const conVisitaId = { ...operacion, visitaId: calcularVisitaId(operacion) };
  try {
    await conDb((db) => db.put('operaciones', conVisitaId));
  } catch (err) {
    // QuotaExceededError no se propagaba con ningún mensaje útil — llegaba
    // tal cual del navegador ("The quota has been exceeded.", en inglés,
    // sin decir qué hacer). Detectado por `.name` en vez de `instanceof
    // Error` porque DOMException no se comporta igual en todos los
    // navegadores frente a ese chequeo.
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      throw new Error(
        'Tu móvil se ha quedado sin espacio libre para guardar esto. Borra fotos o vídeos que no necesites y vuelve a intentarlo.'
      );
    }
    throw err;
  }
}

export async function actualizarOperacion(
  id: string,
  cambios: Partial<Pick<OperacionPendiente, 'estado' | 'intentos' | 'ultimoError' | 'payload'>>
): Promise<void> {
  await conDb(async (db) => {
    const existente = await db.get('operaciones', id);
    if (!existente) return;
    // `OperacionPendiente` es una unión discriminada por `entidad` — el spread
    // de `existente` (un miembro concreto ya conocido) con `cambios` (tipado
    // de forma genérica contra la unión completa) hace que TypeScript no
    // pueda verificar que el resultado sigue perteneciendo a un único
    // miembro válido, aunque en tiempo de ejecución sea correcto (mismo
    // patrón ya resuelto en sync-engine.ts con las funciones de sincronización).
    const actualizado = { ...existente, ...cambios } as unknown as OperacionPendiente;
    // `cambios` puede traer un `payload` nuevo — recalcular por si acaso,
    // aunque en la práctica una operación no cambia de visita a mitad de camino.
    await db.put('operaciones', { ...actualizado, visitaId: calcularVisitaId(actualizado) });
  });
}

export async function obtenerOperacion(id: string): Promise<OperacionPendiente | undefined> {
  return conDb((db) => db.get('operaciones', id));
}

// Cola ordenada por antigüedad — es lo que garantiza que una `visita` se
// intenta sincronizar antes que sus `hallazgo`/`captura_libre`, siempre que
// se hayan encolado en el orden en que ocurrieron (que es el caso natural:
// no se puede capturar nada sin haber iniciado la visita primero).
//
// BUG real (13 sept): usaba `getAllFromIndex('by-creado-en')` sin rango —
// el índice solo ordena, no acota, así que en la práctica leía la cola
// ENTERA (incluidas las operaciones 'completado' de siempre, con sus blobs
// de foto/audio) cada vez que se llamaba. El motor de sincronización llama
// a esto cada 60s automáticamente (`sync-engine.ts`), con o sin pantalla
// abierta — con el volumen acumulado por uso real, esto es lo que hizo que
// un ciclo pasase de ~5s a ~34s. Ahora se lee solo por `by-estado`
// ('pendiente'/'error' — nunca 'completado' ni 'subiendo'), que es un
// subconjunto pequeño y estable frente al histórico completo; se ordena en
// JS porque ese subconjunto ya es pequeño.
export async function obtenerPendientes(): Promise<OperacionPendiente[]> {
  const [pendientes, conError] = await conDb((db) =>
    Promise.all([
      db.getAllFromIndex('operaciones', 'by-estado', 'pendiente'),
      db.getAllFromIndex('operaciones', 'by-estado', 'error'),
    ])
  );
  return [...pendientes, ...conError].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

// Para el aviso global en Yo — "N elementos no se han podido sincronizar".
// Antes de esto, un fallo permanente (5 intentos agotados, o ahora también
// propagado desde un padre que falló) era invisible salvo que alguien
// mirase la cola local con las herramientas de desarrollador; nunca llegaba
// a ninguna pantalla que el comercial fuera a ver por su cuenta.
export async function obtenerOperacionesConError(): Promise<OperacionPendiente[]> {
  return conDb((db) => db.getAllFromIndex('operaciones', 'by-estado', 'error'));
}

export async function contarPendientesPorEntidad(
  entidad: EntidadSincronizable
): Promise<number> {
  const todas = await conDb((db) => db.getAllFromIndex('operaciones', 'by-entidad', entidad));
  return todas.filter((op) => op.estado !== 'completado').length;
}

export async function eliminarOperacion(id: string): Promise<void> {
  await conDb((db) => db.delete('operaciones', id));
}

// Usado por la UI (badges de estado_subida en Cierre de visita, etc.) para
// leer en tiempo real qué hay todavía sin subir de una visita concreta.
// BUG real (12 sept): antes leía TODA la tabla (todas las visitas de
// siempre, con sus blobs de fotos/audios) y filtraba en memoria — el
// escaneo completo tardaba ~5s en un dispositivo con historial cada vez
// que se recargaba la cola de la visita activa (p. ej. al volver tras
// asignar una zona a una foto, que dispara EVENTO_COLA_PROCESADA).
// Ahora usa el índice `by-visita-id` (ver calcularVisitaId): solo lee lo
// que de verdad es de esta visita.
//
// BUG real (13 sept): `getAllFromIndex` con una clave repetida (todas las
// operaciones de la misma visita comparten el mismo valor de índice) no
// devuelve orden cronológico — IndexedDB ordena por la clave primaria
// (`id`, un uuid aleatorio) cuando el valor del índice coincide, así que
// una foto nueva podía aparecer intercalada entre las antiguas en vez de
// al final (reportado por Cesar: "la ha puesto en el medio"). El conjunto
// es siempre pequeño (lo de una sola visita), así que ordenar en JS por
// `creadoEn` es barato y no necesita otro índice compuesto.
export async function obtenerPorVisita(visitaId: string): Promise<OperacionPendiente[]> {
  const operaciones = await conDb((db) => db.getAllFromIndex('operaciones', 'by-visita-id', visitaId));
  return operaciones.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

// Igual que `obtenerPorVisita` pero para TODAS las visitas de una vez —
// evita recorrer la cola local una vez por visita marcada en el borrado por
// lotes de Mi espacio (candado "cola sin subir" del punto 6 del backlog).
//
// Mismo bug que `obtenerPendientes` (13 sept): `db.getAll()` leía la cola
// entera, blobs de 'completado' incluidos. Como aquí ya se descartaba todo
// lo 'completado' en memoria, basta con no traerlo — se lee por
// `by-estado` ('pendiente'/'error'/'subiendo', nunca 'completado').
export async function obtenerVisitasConPendientes(): Promise<Set<string>> {
  const [pendientes, subiendo, conError] = await conDb((db) =>
    Promise.all([
      db.getAllFromIndex('operaciones', 'by-estado', 'pendiente'),
      db.getAllFromIndex('operaciones', 'by-estado', 'subiendo'),
      db.getAllFromIndex('operaciones', 'by-estado', 'error'),
    ])
  );
  const ids = new Set<string>();
  for (const op of [...pendientes, ...subiendo, ...conError]) {
    if (op.entidad === 'visita') {
      ids.add(op.id);
      continue;
    }
    if (op.entidad === 'oportunidad') {
      const payload = op.payload as { visitaOrigenId?: string };
      if (payload.visitaOrigenId) ids.add(payload.visitaOrigenId);
      continue;
    }
    const payload = op.payload as { visitaId?: string };
    if (payload.visitaId) ids.add(payload.visitaId);
  }
  return ids;
}

// `ubicacion` es la única entidad que vive a nivel de CLIENTE, no de visita
// (se reutiliza en todas las visitas futuras a ese cliente) — por eso no
// encaja en obtenerPorVisita y necesita su propio filtro, usando el índice
// `by-entidad` para no recorrer toda la cola local.
export async function obtenerUbicacionesPorCliente(
  clienteId: string
): Promise<OperacionPendiente<'ubicacion'>[]> {
  const todas = (await conDb((db) =>
    db.getAllFromIndex('operaciones', 'by-entidad', 'ubicacion')
  )) as OperacionPendiente<'ubicacion'>[];
  return todas.filter((op) => op.payload.clienteId === clienteId);
}

const DIAS_RETENCION_COMPLETADAS = 30;

// La raíz de la regresión de rendimiento (13 sept): una operación
// 'completado' no se borra nunca (se conserva a propósito para que la UI
// no parpadee, ver comentario en sync-engine.ts), y con uso real en
// producción esto crece sin límite — registro Y blob de foto/audio
// incluidos. Cualquier arreglo de índice (obtenerPendientes,
// obtenerVisitasConPendientes) vuelve a degradarse con el tiempo si la
// cola en sí no deja de crecer. Se purga por cursor sobre `by-estado`
// ('completado' únicamente, nunca escanea el resto) y se borra el registro
// entero — eso libera el Blob también, no hace falta tocarlo aparte.
// BUG real (13 sept, el mismo día): una única transacción `readwrite`
// recorriendo TODO el rango 'completado' de un tirón bloqueaba cualquier
// otra escritura sobre `operaciones` mientras durase — en un dispositivo
// con meses de operaciones 'completado' sin purgar nunca antes de hoy, eso
// significó que guardar la zona de una foto (otra escritura sobre el mismo
// object store) se quedaba esperando detrás de la purga entera: la foto
// "desaparecía" de la pantalla ~40s, y cada toque de más solo encolaba
// otra escritura detrás. Se trocea en lotes pequeños con una transacción
// por lote y una pausa entre lotes, para ceder el object store a cualquier
// escritura interactiva que esté esperando en vez de monopolizarlo.
//
// Con lotes de 25 y 60ms de pausa la espera bajó de ~40s a ~23s (Cesar,
// mismo día) — mejor, pero seguía tardando demasiado. Un tope FIJO de
// registros (probado después: 300) tampoco bastó: en WebKit/iOS cada
// `cursor.delete()` de un registro con blob de foto/audio es lento de
// verdad (no es solo borrar una fila pequeña), así que "cuántos registros"
// no predice "cuánto tiempo" — con blobs pesados, 300 registros seguían
// tardando ~28s. Se corta por PRESUPUESTO DE TIEMPO en vez de cantidad: la
// purga trabaja como mucho ~2s reales por llamada, sea cual sea el tamaño
// de los blobs que le toque borrar, y si queda más, lo completa en el
// siguiente arranque de la app. Un dispositivo rápido purga más en esos 2s;
// uno lento purga menos — pero ninguno bloquea al usuario más de eso.
const LOTE_PURGA = 5;
const PAUSA_ENTRE_LOTES_MS = 150;
const PRESUPUESTO_TIEMPO_MS = 2000;

export async function purgarCompletadasAntiguas(
  diasAntiguedad: number = DIAS_RETENCION_COMPLETADAS
): Promise<number> {
  const limite = new Date(Date.now() - diasAntiguedad * 24 * 60 * 60 * 1000).toISOString();
  const inicio = Date.now();
  let totalBorradas = 0;
  while (Date.now() - inicio < PRESUPUESTO_TIEMPO_MS) {
    const { borradas, hayMas } = await conDb(async (db) => {
      const tx = db.transaction('operaciones', 'readwrite');
      const indice = tx.store.index('by-estado');
      let cursor = await indice.openCursor(IDBKeyRange.only('completado'));
      let visitadasLote = 0;
      let borradasLote = 0;
      while (cursor && visitadasLote < LOTE_PURGA) {
        visitadasLote++;
        if (cursor.value.creadoEn < limite) {
          await cursor.delete();
          borradasLote++;
        }
        cursor = await cursor.continue();
      }
      await tx.done;
      return { borradas: borradasLote, hayMas: !!cursor };
    });
    totalBorradas += borradas;
    if (!hayMas) break;
    await new Promise((resolve) => setTimeout(resolve, PAUSA_ENTRE_LOTES_MS));
  }
  return totalBorradas;
}
