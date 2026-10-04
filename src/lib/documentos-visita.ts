// Documentos que se pueden colgar de una visita. La lista (extensión → MIME)
// es la misma que el bucket `documentos-visita` (migración 131): si se toca
// una, se toca la otra.
export const MIME_DOCUMENTO: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
};

export const ACCEPT_DOCUMENTO = Object.keys(MIME_DOCUMENTO).map((e) => `.${e}`).join(',');
export const LIMITE_DOCUMENTO_BYTES = 25 * 1024 * 1024; // = file_size_limit del bucket

// MIME real a usar al subir: el del navegador si es de los admitidos, si no el
// de la extensión (algunos móviles dan '' para .csv/.docx). null = no admitido.
export function mimeDeDocumento(archivo: File): string | null {
  const ext = archivo.name.split('.').pop()?.toLowerCase() ?? '';
  const porExtension = MIME_DOCUMENTO[ext];
  if (!porExtension) return null;
  return Object.values(MIME_DOCUMENTO).includes(archivo.type) ? archivo.type : porExtension;
}

export function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

// Storage rechaza por tamaño o formato con mensajes en inglés; esto los reconoce para mostrarlos en español y
// no reintentar lo que no se arregla reintentando.
export function motivoRechazoSubida(mensaje: string): 'tamano' | 'formato' | null {
  if (/exceeded the maximum allowed size|payload too large/i.test(mensaje)) return 'tamano';
  if (/mime type|not supported|invalid_mime_type/i.test(mensaje)) return 'formato';
  return null;
}
