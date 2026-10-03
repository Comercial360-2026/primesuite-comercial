// Uso:
//   node descifrar.mjs generar-claves <carpeta>          → crea <carpeta>/copia-privada.pem (SECRETA) y escribe en pantalla solo la clave pública
//   node descifrar.mjs descifrar <archivo.enc> <privada.pem> <salida.json>
import { generateKeyPairSync, createPrivateKey, privateDecrypt, createDecipheriv, constants } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [orden, a, b, c] = process.argv.slice(2);
if (orden === 'generar-claves') {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
  writeFileSync(`${a}/copia-privada.pem`, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log(publicKey.export({ type: 'spki', format: 'pem' }));
} else if (orden === 'descifrar') {
  const f = readFileSync(a);
  if (f.subarray(0, 4).toString() !== 'PSC1') throw new Error('No es un archivo PSC1');
  const n = f.readUInt16BE(4);
  const clave = privateDecrypt(
    { key: createPrivateKey(readFileSync(b)), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    f.subarray(6, 6 + n),
  );
  const iv = f.subarray(6 + n, 18 + n);
  const resto = f.subarray(18 + n);
  const d = createDecipheriv('aes-256-gcm', clave, iv).setAuthTag(resto.subarray(resto.length - 16));
  writeFileSync(c, Buffer.concat([d.update(resto.subarray(0, resto.length - 16)), d.final()]));
  console.log('Descifrado en', c);
} else console.log('Ver cabecera del archivo');
