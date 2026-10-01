// Pide a Power Automate (flujo "Enlace temporal SharePoint") una URL de
// descarga de corta duración para un archivo ya archivado. Nunca se guarda
// el enlace: se genera al vuelo cada vez (ver diseño, "Flujo de lectura" —
// un enlace anónimo permanente guardado en BD sería un dato sensible
// expuesto sin control de revocación si la BD se filtrara).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export async function obtenerEnlaceSharePoint(admin: SupabaseClient, rutaSharepoint: string): Promise<string> {
  const [{ data: webhookUrl }, { data: secreto }] = await Promise.all([
    admin.rpc('fn_webhook_power_automate_enlace'),
    admin.rpc('fn_secreto_power_automate'),
  ]);
  if (!webhookUrl || !secreto) throw new Error('Falta configuración del enlace temporal de SharePoint.');

  const r = await fetch(webhookUrl as string, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secreto, ruta_sharepoint: rutaSharepoint }),
  });
  if (!r.ok) throw new Error(`Power Automate respondió ${r.status} al pedir el enlace.`);
  const texto = (await r.text()).trim();
  if (!texto.startsWith('http')) throw new Error('Power Automate no devolvió una URL válida.');
  return texto;
}
