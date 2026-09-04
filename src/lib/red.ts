// ¿El fallo es "no hay red" y no "el servidor ha respondido con un error"?
//
// Sirve para elegir el mensaje que ve el comercial: un "Sin conexión,
// inténtalo cuando tengas red" (que no alarma y se resuelve solo al volver
// la cobertura) en vez de un "No se pudo, algo ha ido mal" genérico.
//
//   · navigator.onLine === false = el dispositivo no tiene NINGUNA interfaz
//     de red. Señal fiable de que estás sin conexión. El caso contrario
//     —onLine true pero la red no llega a ningún sitio— lo cubre el texto
//     del error y, en las descargas, además un timeout.
//   · Un fetch que ni contacta con el servidor lanza un TypeError cuyo
//     texto cambia según el navegador: "Failed to fetch" (Chrome),
//     "NetworkError when attempting to fetch resource" (Firefox),
//     "Load failed" / "The network connection was lost" (Safari e iOS).
export function esSinRed(err?: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return /failed to fetch|networkerror|network (request|connection)|load failed/i.test(msg);
}
