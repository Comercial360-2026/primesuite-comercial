// Reduce una foto (JPEG/PNG) para incrustarla como miniatura en el informe web. Las fotos de la
// app ya salen comprimidas a 1600 px (media ~430 KB): 30 fotos pesaban ~20 MB en el HTML. A 720 px
// y calidad 70 quedan en ~50 KB cada una; el original sigue en Supabase/SharePoint.
// Si algo falla (formato raro, memoria) se devuelve null y quien llama usa la foto tal cual.
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

const LADO_MAXIMO_PX = 720;
const CALIDAD_JPEG = 70;

export async function reducirParaInforme(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const img = await Image.decode(bytes);
    const escala = Math.min(1, LADO_MAXIMO_PX / Math.max(img.width, img.height));
    const final = escala < 1 ? img.resize(Math.round(img.width * escala), Math.round(img.height * escala)) : img;
    const reducida = await final.encodeJPEG(CALIDAD_JPEG);
    // Si no mejora (foto ya pequeña), mejor la original.
    return reducida.length < bytes.length ? reducida : null;
  } catch (e) {
    console.error('No se pudo reducir la foto para el informe web', e);
    return null;
  }
}
