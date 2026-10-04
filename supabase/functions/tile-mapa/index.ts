// supabase/functions/tile-mapa/index.ts
//
// Proxy de teselas del mapa para el informe web de la visita. El informe se abre como página blob:
// o como archivo descargado, y esas páginas no mandan Referer: OpenStreetMap contesta a esas peticiones
// con una imagen de «acceso bloqueado» (código 200, imagen de 7 KB) y CARTO con «API KEY REQUIRED».
// Aquí la petición a OpenStreetMap la hace el servidor, con el User-Agent y el Referer que su política
// de uso exige, y el navegador (y el CDN) cachean la tesela.
//
// Pública a propósito (el informe la llama desde etiquetas <img> sin sesión): se desplegó con
// --no-verify-jwt. Solo sirve teselas de OpenStreetMap, con z/x/y numéricos y dentro de rango.
//
//   GET /functions/v1/tile-mapa?z=15&x=16199&y=12012

const ORIGEN = 'https://tile.openstreetmap.org';
const REFERER = Deno.env.get('APP_URL') ?? 'https://rococo-gumption-efb70a.netlify.app';
const CABECERAS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=86400, s-maxage=604800',
};

const entero = (v: string | null) => (v !== null && /^\d{1,8}$/.test(v) ? Number(v) : null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CABECERAS });
  const url = new URL(req.url);
  const z = entero(url.searchParams.get('z'));
  const x = entero(url.searchParams.get('x'));
  const y = entero(url.searchParams.get('y'));
  if (z === null || x === null || y === null || z > 19 || x >= 2 ** z || y >= 2 ** z) {
    return new Response('Tesela no válida', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  try {
    const r = await fetch(`${ORIGEN}/${z}/${x}/${y}.png`, {
      headers: { 'User-Agent': `PrimeNotes-informes/1.0 (+${REFERER})`, Referer: `${REFERER}/` },
    });
    if (!r.ok) return new Response('Sin tesela', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
    return new Response(r.body, { status: 200, headers: { ...CABECERAS, 'Content-Type': 'image/png' } });
  } catch {
    return new Response('Sin tesela', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});
