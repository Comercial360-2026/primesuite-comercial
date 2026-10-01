-- 129: activa el cron diario de archivado a SharePoint (aparte de la 128 para
-- poder probar el archivado a mano antes de que corra solo sobre datos reales).

select cron.schedule('procesar-archivado-sharepoint', '0 3 * * *', $$
  select net.http_post(
    url := 'https://umrjzvpbcpzzqmkjahhn.supabase.co/functions/v1/procesar-archivado-sharepoint',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clave-worker', (select decrypted_secret from vault.decrypted_secrets where name = 'briefing_worker_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from fn_visitas_para_archivar());
$$);
