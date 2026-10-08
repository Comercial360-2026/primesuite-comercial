// Lector mínimo de EXIF (JPEG): fecha de la foto y GPS. `comprimirImagen` pasa por canvas y BORRA el EXIF,
// así que esto se lee del archivo original ANTES de comprimir. Sin dependencias: solo los campos que usamos.
export interface DatosFoto {
  fecha?: Date; // DateTimeOriginal (hora local de la cámara, sin zona: se interpreta en la del móvil)
  lat?: number;
  lng?: number;
}

const TAM: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export async function leerExif(archivo: Blob): Promise<DatosFoto> {
  try {
    const v = new DataView(await archivo.slice(0, 256 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xffd8) return {};
    let p = 2;
    while (p + 4 < v.byteLength) {
      const marca = v.getUint16(p);
      const largo = v.getUint16(p + 2);
      if (marca === 0xffe1 && v.getUint32(p + 4) === 0x45786966) return leerTiff(v, p + 10);
      if (marca === 0xffda || (marca & 0xff00) !== 0xff00) break;
      p += 2 + largo;
    }
  } catch {
    /* EXIF roto o cortado: se trata como sin EXIF */
  }
  return {};
}

function leerTiff(v: DataView, base: number): DatosFoto {
  const le = v.getUint16(base) === 0x4949;
  const u16 = (o: number) => v.getUint16(base + o, le);
  const u32 = (o: number) => v.getUint32(base + o, le);
  const entradas = (ifd: number) => {
    const n = u16(ifd);
    return Array.from({ length: n }, (_, i) => {
      const e = ifd + 2 + i * 12;
      const tipo = u16(e + 2);
      const cuenta = u32(e + 4);
      const dato = (TAM[tipo] ?? 1) * cuenta > 4 ? u32(e + 8) : e + 8;
      return { tag: u16(e), tipo, cuenta, dato };
    });
  };
  const texto = (d: number, n: number) => {
    let s = '';
    for (let i = 0; i < n - 1; i++) s += String.fromCharCode(v.getUint8(base + d + i));
    return s;
  };
  const racionales = (d: number, n: number) => Array.from({ length: n }, (_, i) => u32(d + i * 8) / (u32(d + i * 8 + 4) || 1));

  const r: DatosFoto = {};
  const ifd0 = entradas(u32(4));
  const exifPtr = ifd0.find((e) => e.tag === 0x8769)?.dato;
  const gpsPtr = ifd0.find((e) => e.tag === 0x8825)?.dato;
  if (exifPtr !== undefined) {
    const f = entradas(u32(exifPtr)).find((e) => e.tag === 0x9003);
    const m = f && texto(f.dato, f.cuenta).match(/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)$/);
    if (m) r.fecha = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  if (gpsPtr !== undefined) {
    const g = entradas(u32(gpsPtr));
    const get = (t: number) => g.find((e) => e.tag === t);
    const la = get(2), lo = get(4), laRef = get(1), loRef = get(3);
    if (la && lo && laRef && loRef) {
      const grados = (e: { dato: number }) => {
        const [d, m, s] = racionales(e.dato, 3);
        return d + m / 60 + s / 3600;
      };
      const lat = grados(la) * (texto(laRef.dato, 2) === 'S' ? -1 : 1);
      const lng = grados(lo) * (texto(loRef.dato, 2) === 'W' ? -1 : 1);
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) Object.assign(r, { lat, lng });
    }
  }
  return r;
}
