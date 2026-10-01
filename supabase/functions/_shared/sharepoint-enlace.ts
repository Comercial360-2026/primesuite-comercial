// Pide a Power Automate (flujo "Enlace temporal SharePoint") el contenido de
// un archivo ya archivado y lo devuelve como `data:` URL. El sitio de
// SharePoint no permite enlaces anónimos ("sharing has been disabled"), así
// que el flujo devuelve { contentType, base64 } leído con "Get file content
// using path" y no se guarda ni se crea ningún enlace.
//
// Límites (comprobados en docs): Power Automate 100 MB por mensaje (base64 +33 %)
// y Edge Function 256 MB de memoria. Se corta en 20 MB: fotos y dictados quedan
// muy por debajo; si un archivo lo supera, error claro en vez de reventar memoria.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const MAX_BASE64 = Math.ceil((20 * 1024 * 1024 * 4) / 3);

export async function obtenerArchivoSharePoint(admin: SupabaseClient, rutaSharepoint: string): Promise<string> {
  const [{ data: webhookUrl }, { data: secreto }] = await Promise.all([
    admin.rpc('fn_webhook_power_automate_enlace'),
    admin.rpc('fn_secreto_power_automate'),
  ]);
  if (!webhookUrl || !secreto) throw new Error('Falta configuración de lectura de SharePoint.');

  const r = await fetch(webhookUrl as string, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secreto, ruta_sharepoint: rutaSharepoint }),
  });
  if (!r.ok) throw new Error(`Power Automate respondió ${r.status} al leer el archivo.`);
  const { contentType, base64 } = await r.json();
  if (!contentType || !base64) throw new Error('Power Automate no devolvió el contenido del archivo.');
  if (base64.length > MAX_BASE64) throw new Error('El archivo es demasiado grande para mostrarlo; ábrelo desde SharePoint.');
  return `data:${contentType};base64,${base64}`;
}
