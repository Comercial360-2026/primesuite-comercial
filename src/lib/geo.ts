/** Enlace universal a un punto: abre Google Maps en web y la app de mapas
 *  nativa en el móvil (Android/iOS lo interceptan). */
export function enlaceMapa(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
