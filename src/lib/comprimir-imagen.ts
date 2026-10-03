const LADO_MAXIMO_PX = 1600;
const CALIDAD_JPEG = 0.75;

// Los tipos que admite el bucket `fotos-visita` (migración 131 y anteriores): lo demás no se puede subir nunca.
export const TIPOS_FOTO_ADMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];

export async function comprimirImagen(archivo: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO_PX / Math.max(bitmap.width, bitmap.height));
    const anchoFinal = Math.round(bitmap.width * escala);
    const altoFinal = Math.round(bitmap.height * escala);

    const canvas = document.createElement('canvas');
    canvas.width = anchoFinal;
    canvas.height = altoFinal;
    const ctx = canvas.getContext('2d');
    if (!ctx) return archivo;

    ctx.drawImage(bitmap, 0, 0, anchoFinal, altoFinal);
    bitmap.close();

    const blobComprimido = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', CALIDAD_JPEG)
    );

    if (!blobComprimido || (blobComprimido.size >= archivo.size && TIPOS_FOTO_ADMITIDOS.includes(archivo.type))) return archivo;
    return blobComprimido;
  } catch (err) {
    console.error('No se pudo comprimir la imagen, se sube sin comprimir:', err);
    return archivo;
  }
}
