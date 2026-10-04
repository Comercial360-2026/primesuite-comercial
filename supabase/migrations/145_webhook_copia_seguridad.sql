-- 145: webhook propio para las copias de seguridad (flujo «PrimeSuite - Subir copia de seguridad»,
-- carpeta PrimeNotes/Copias de seguridad, fuera de PrimeNotes - Comerciales). El secreto
-- POWER_AUTOMATE_WEBHOOK_COPIA_URL se guarda en Vault a mano (la URL lleva firma): NO va en el repo.
create or replace function fn_webhook_power_automate_copia()
returns text
language sql
security definer
set search_path to 'public'
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'POWER_AUTOMATE_WEBHOOK_COPIA_URL';
$$;
revoke all on function fn_webhook_power_automate_copia() from public, anon, authenticated;
grant execute on function fn_webhook_power_automate_copia() to service_role;
