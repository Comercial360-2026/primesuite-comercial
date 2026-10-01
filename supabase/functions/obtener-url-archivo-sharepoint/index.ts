// supabase/functions/obtener-url-archivo-sharepoint/index.ts
//
// Contenido (data: URL) de una captura ya archivada en SharePoint
// (sin enlaces: el flujo devuelve el contenido, ver _shared/sharepoint-enlace.ts).
// El permiso para ver la captura es el mismo que ya aplica la RLS de
// captura_libre (pol_captura_select): se consulta con el token del propio
// usuario, no con service_role, para no reimplementar esa regla aquí.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { CORS_HEADERS, jsonResponse } from '../_shared/informe-pdf.ts';
import { obtenerArchivoSharePoint } from '../_shared/sharepoint-enlace.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405);

  let capturaId: string | undefined;
  try {
    capturaId = (await req.json()).capturaId;
  } catch {
    return jsonResponse({ error: 'Cuerpo inválido, se esperaba { capturaId }' }, 400);
  }
  if (!capturaId) return jsonResponse({ error: 'Falta capturaId' }, 400);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'No autenticado' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const comoUsuario = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

  // RLS de captura_libre (pol_captura_select) decide si este usuario puede
  // verla — si no puede, esto devuelve 0 filas, igual que una consulta normal.
  const { data: captura, error } = await comoUsuario
    .from('captura_libre')
    .select('ubicacion_archivo, ruta_sharepoint')
    .eq('id', capturaId)
    .maybeSingle();
  if (error) return jsonResponse({ error: error.message }, 500);
  if (!captura) return jsonResponse({ error: 'No tienes acceso a este archivo.' }, 403);
  if (captura.ubicacion_archivo !== 'sharepoint' || !captura.ruta_sharepoint) {
    return jsonResponse({ error: 'Este archivo no está archivado en SharePoint.' }, 400);
  }

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const url = await obtenerArchivoSharePoint(admin, captura.ruta_sharepoint);
    return jsonResponse({ url });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 502);
  }
});
