// Cifrado híbrido de la copia de seguridad: AES-256-GCM para el JSON y RSA-OAEP (SHA-256) para la clave AES.
// Solo hace falta la clave PÚBLICA (secreto COPIA_CLAVE_PUBLICA, PEM SPKI); la privada no está en el servidor.
// Formato: "PSC1" | u16 largo clave envuelta | clave envuelta | iv (12) | cifrado+etiqueta GCM.
// Descifrar: scripts/copia-seguridad/descifrar.mjs.

const b64 = (pem: string) =>
  Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));

export async function cifrarCopia(datos: Uint8Array, clavePublicaPem: string): Promise<Uint8Array> {
  const rsa = await crypto.subtle.importKey('spki', b64(clavePublicaPem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, datos));
  const envuelta = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsa, await crypto.subtle.exportKey('raw', aes)));
  const sal = new Uint8Array(4 + 2 + envuelta.length + 12 + cifrado.length);
  sal.set([0x50, 0x53, 0x43, 0x31]); // "PSC1"
  new DataView(sal.buffer).setUint16(4, envuelta.length);
  sal.set(envuelta, 6);
  sal.set(iv, 6 + envuelta.length);
  sal.set(cifrado, 18 + envuelta.length);
  return sal;
}
