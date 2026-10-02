-- El cron del archivado también despierta al worker cuando hay informes pendientes (solo con el
-- interruptor `archivado_informe_activo` encendido). Mismo comando que antes + la condición nueva.
select cron.schedule(
  'procesar-archivado-sharepoint',
  (select schedule from cron.job where jobname = 'procesar-archivado-sharepoint'),
  $cron$
  select net.http_post(
    url := 'https://umrjzvpbcpzzqmkjahhn.supabase.co/functions/v1/procesar-archivado-sharepoint',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clave-worker', (select decrypted_secret from vault.decrypted_secrets where name = 'briefing_worker_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from fn_visitas_para_copiar())
     or exists (select 1 from fn_capturas_para_liberar())
     or (coalesce((select valor from ajustes_app where clave = 'archivado_informe_activo'), false)
         and exists (select 1 from fn_visitas_para_informe()));
  $cron$
);
