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
export async function obtenerPendientes(): Promise<OperacionPendiente[]> {
  const todas = await conDb((db) => db.getAllFromIndex('operaciones', 'by-creado-en'));
  return todas.filter((op) => op.estado === 'pendiente' || op.estado === 'error');
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
export async function obtenerPorVisita(visitaId: string): Promise<OperacionPendiente[]> {
  return conDb((db) => db.getAllFromIndex('operaciones', 'by-visita-id', visitaId));
}

// Igual que `obtenerPorVisita` pero para TODAS las visitas de una vez —
// evita recorrer la cola local una vez por visita marcada en el borrado por
// lotes de Mi espacio (candado "cola sin subir" del punto 6 del backlog).
export async function obtenerVisitasConPendientes(): Promise<Set<string>> {
  const todas = await conDb((db) => db.getAll('operaciones'));
  const ids = new Set<string>();
  for (const op of todas) {
    if (op.estado === 'completado') continue;
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
