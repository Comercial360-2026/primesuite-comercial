// Borra los backups/informes de "backups-visita" con más de 2 h. No puede
// hacerlo un job de pg_cron: Supabase prohíbe `delete from storage.objects`
// (ver migración 120). Se llama tras cada generación; si falla no importa,
// la siguiente lo reintenta.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export async function limpiarBackupsCaducados(admin: SupabaseClient) {
  try {
    const { data, error } = await admin.rpc('fn_backups_caducados');
    if (error || !data?.length) return;
    await admin.storage.from('backups-visita').remove(data as string[]);
  } catch (e) {
    console.error('No se pudieron limpiar backups caducados', e);
  }
}
