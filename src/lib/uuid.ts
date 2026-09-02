// UUID v4 con red de seguridad.
//
// `crypto.randomUUID()` SOLO existe en contexto seguro (HTTPS o
// `localhost`) y en Safari de iOS >= 15.4. Probando la app en un iPhone
// real por la IP de la LAN (`http://192.168.x.x:5173`) NO es contexto
// seguro → `crypto.randomUUID` es `undefined` y reventaba cualquier alta
// ("crypto.randomUUID is not a function"): nuevo cliente, planificar
// visita, iniciar visita, captura, hallazgo, oportunidad, próximo paso,
// ubicación… es decir, casi todo.
//
// `crypto.getRandomValues()` sí está disponible en contexto no seguro y en
// todo Safari, así que el fallback genera el v4 a mano con esos bytes.
// Mismo formato y aleatoriedad que `randomUUID`.
export function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const b = new Uint8Array(16);
  c.getRandomValues(b);
  // Versión (4) y variante (10xx) según RFC 4122.
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h: string[] = [];
  for (let i = 0; i < 16; i++) h.push(b[i].toString(16).padStart(2, '0'));
  return (
    h[0] + h[1] + h[2] + h[3] + '-' +
    h[4] + h[5] + '-' +
    h[6] + h[7] + '-' +
    h[8] + h[9] + '-' +
    h[10] + h[11] + h[12] + h[13] + h[14] + h[15]
  );
}
