-- 144: la copia de seguridad de las tablas pasa a hacerla el servidor (cron diario que solo actúa
-- si la última confirmada tiene ≥ 7 días) y se sube a SharePoint por el flujo de archivado.
-- `estado`: enviada (mandada al flujo) → confirmada (SharePoint guardó los mismos bytes) | fallida.
-- Las filas antiguas (copias descargadas a mano) quedan como confirmadas/manual.
alter table registro_backup_completo
  alter column creado_por drop not null,
  add column estado text not null default 'confirmada' check (estado in ('enviada', 'confirmada', 'fallida')),
  add column origen text not null default 'manual' check (origen in ('manual', 'automatica')),
  add column storage_path text,
  add column ruta_sharepoint text,
  add column tamano bigint,
  add column filas jsonb,
  add column error text,
  add column confirmada_en timestamptz;

-- Solo escribe el servidor (service_role se salta RLS): nadie puede falsear «copia hecha hoy» desde la app.
drop policy pol_registro_backup_insert on registro_backup_completo;

select cron.schedule('copia-seguridad-diaria', '30 3 * * *', $$
  select net.http_post(
    url := 'https://umrjzvpbcpzzqmkjahhn.supabase.co/functions/v1/generar-copia-seguridad',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clave-worker', (select decrypted_secret from vault.decrypted_secrets where name = 'briefing_worker_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
