// Utilidades para comparar nombres de cliente sin depender de `unaccent` en
// la base de datos. Se usan en dos sitios: el aviso de duplicados al dar de
// alta un cliente (alta-rapida-cliente.tsx) y la pantalla de deduplicación
// (deduplicacion.tsx).

// Minúsculas, sin acentos, sin signos de puntuación, espacios colapsados.
// Así "Panadería  Rueda, S.L." → "panaderia rueda s l".
export function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Formas jurídicas y coletillas que NO distinguen un negocio de otro: si dos
// fichas solo se diferencian en esto, son la misma. Deliberadamente corta y
// explícita — ampliar con cuidado, cada entrada de más es un riesgo de
// juntar dos negocios distintos.
const SUFIJOS = new Set([
  's l', 's a', 's l u', 's a u', 's l l', 's l n e',
  's c', 's c p', 's coop', 'coop', 'sl', 'sa', 'slu', 'sau',
  'sociedad limitada', 'sociedad anonima', 'sociedad cooperativa',
  'cb', 's com', 'aie',
]);

// Clave de agrupación para detectar duplicados: el nombre normalizado sin la
// coletilla jurídica final. "panaderia rueda" y "panaderia rueda s l" caen
// en la misma clave; "talleres garcia madrid" y "talleres garcia bilbao"
// NO (solo se quita el sufijo si es EXACTAMENTE una coletilla conocida).
export function claveDuplicado(nombre: string): string {
  const norm = normalizarNombre(nombre);
  const palabras = norm.split(' ');
  // Prueba a quitar 1, 2 o 3 palabras finales y ver si forman una coletilla.
  for (let n = 3; n >= 1; n--) {
    if (palabras.length > n) {
      const cola = palabras.slice(-n).join(' ');
      if (SUFIJOS.has(cola)) {
        return palabras.slice(0, -n).join(' ');
      }
    }
  }
  return norm;
}
