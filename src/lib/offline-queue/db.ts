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
  await db.put('operaciones', operacion);
}

export async function actualizarOperacion(
  id: string,
  cambios: Partial<Pick<OperacionPendiente, 'estado' | 'intentos' | 'ultimoError'>>
): Promise<void> {
  const db = await getDb();
  const existente = await db.get('operaciones', id);
  if (!existente) return;
  await db.put('operaciones', { ...existente, ...cambios });
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
    const payload = op.payload as { visitaId?: string };
    return payload.visitaId === visitaId;
  });
}
