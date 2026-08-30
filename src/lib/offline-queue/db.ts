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
    };
  };
}

const DB_NAME = 'primesuite-cola-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ColaOfflineDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<ColaOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('operaciones', { keyPath: 'id' });
        store.createIndex('by-estado', 'estado');
        store.createIndex('by-entidad', 'entidad');
        store.createIndex('by-creado-en', 'creadoEn');
      },
    });
  }
  return dbPromise;
}

export async function encolarOperacion(operacion: OperacionPendiente): Promise<void> {
  const db = await getDb();
  try {
    await db.put('operaciones', operacion);
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
  const db = await getDb();
  const existente = await db.get('operaciones', id);
  if (!existente) return;
  // `OperacionPendiente` es una unión discriminada por `entidad` — el spread
  // de `existente` (un miembro concreto ya conocido) con `cambios` (tipado
  // de forma genérica contra la unión completa) hace que TypeScript no
  // pueda verificar que el resultado sigue perteneciendo a un único
  // miembro válido, aunque en tiempo de ejecución sea correcto (mismo
  // patrón ya resuelto en sync-engine.ts con las funciones de sincronización).
  await db.put('operaciones', { ...existente, ...cambios } as unknown as OperacionPendiente);
}

export async function obtenerOperacion(id: string): Promise<OperacionPendiente | undefined> {
  const db = await getDb();
  return db.get('operaciones', id);
}

// Cola ordenada por antigüedad — es lo que garantiza que una `visita` se
// intenta sincronizar antes que sus `hallazgo`/`captura_libre`, siempre que
// se hayan encolado en el orden en que ocurrieron (que es el caso natural:
// no se puede capturar nada sin haber iniciado la visita primero).
export async function obtenerPendientes(): Promise<OperacionPendiente[]> {
  const db = await getDb();
  const todas = await db.getAllFromIndex('operaciones', 'by-creado-en');
  return todas.filter((op) => op.estado === 'pendiente' || op.estado === 'error');
}

// Para el aviso global en Yo — "N elementos no se han podido sincronizar".
// Antes de esto, un fallo permanente (5 intentos agotados, o ahora también
// propagado desde un padre que falló) era invisible salvo que alguien
// mirase la cola local con las herramientas de desarrollador; nunca llegaba
// a ninguna pantalla que el comercial fuera a ver por su cuenta.
export async function obtenerOperacionesConError(): Promise<OperacionPendiente[]> {
  const db = await getDb();
  const todas = await db.getAllFromIndex('operaciones', 'by-estado', 'error');
  return todas;
}

export async function contarPendientesPorEntidad(
  entidad: EntidadSincronizable
): Promise<number> {
  const db = await getDb();
  const todas = await db.getAllFromIndex('operaciones', 'by-entidad', entidad);
  return todas.filter((op) => op.estado !== 'completado').length;
}

export async function eliminarOperacion(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('operaciones', id);
}

// Usado por la UI (badges de estado_subida en Cierre de visita, etc.) para
// leer en tiempo real qué hay todavía sin subir de una visita concreta.
export async function obtenerPorVisita(visitaId: string): Promise<OperacionPendiente[]> {
  const db = await getDb();
  const todas = await db.getAll('operaciones');
  return todas.filter((op) => {
    if (op.entidad === 'visita') return op.id === visitaId;
    if (op.entidad === 'oportunidad') {
      const payload = op.payload as { visitaOrigenId?: string };
      return payload.visitaOrigenId === visitaId;
    }
    const payload = op.payload as { visitaId?: string };
    return payload.visitaId === visitaId;
  });
}

// `ubicacion` es la única entidad que vive a nivel de CLIENTE, no de visita
// (se reutiliza en todas las visitas futuras a ese cliente) — por eso no
// encaja en obtenerPorVisita y necesita su propio filtro, usando el índice
// `by-entidad` para no recorrer toda la cola local.
export async function obtenerUbicacionesPorCliente(
  clienteId: string
): Promise<OperacionPendiente<'ubicacion'>[]> {
  const db = await getDb();
  const todas = (await db.getAllFromIndex(
    'operaciones',
    'by-entidad',
    'ubicacion'
  )) as OperacionPendiente<'ubicacion'>[];
  return todas.filter((op) => op.payload.clienteId === clienteId);
}
