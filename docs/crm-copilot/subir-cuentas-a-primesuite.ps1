# Último paso del flujo de Power Automate Desktop «Accounts» (PC de empresa,
# con VPN): sube las cuentas del CRM a PrimeSuite para el buscador de alta de
# cliente. En PAD: acción «Ejecutar script de PowerShell», al final del flujo,
# después de generar el CSV de cuentas.
#
# Antes, una sola vez en ese PC: guardar la clave de sincronización en
#   %USERPROFILE%\primesuite-clave-sync.txt   (solo la clave, una línea)
# La clave solo sirve para subir cuentas; si se pierde, se regenera.

# Ruta del CSV de cuentas que genera el flujo (ajustar si es otra).
$csv = "$env:USERPROFILE\Desktop\DIGITEK_Accounts_1.csv"

$clave = (Get-Content "$env:USERPROFILE\primesuite-clave-sync.txt" -Raw).Trim()
$cuentas = Import-Csv -Path $csv -Encoding UTF8
$cuerpo = [System.Text.Encoding]::UTF8.GetBytes(($cuentas | ConvertTo-Json -Depth 2 -Compress))

$r = Invoke-RestMethod -Method Post `
  -Uri 'https://umrjzvpbcpzzqmkjahhn.supabase.co/functions/v1/sincronizar-cuentas-crm' `
  -Headers @{ 'x-clave-sync' = $clave } `
  -ContentType 'application/json; charset=utf-8' `
  -Body $cuerpo
Write-Output "PrimeSuite: recibidas $($r.recibidas), guardadas $($r.guardadas), descartadas $($r.descartadas)"
