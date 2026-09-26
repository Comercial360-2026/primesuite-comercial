# Programa la carga diaria del CRM en el PC de empresa (con VPN).
# Pegar ENTERO en una ventana de PowerShell (sin administrador) una sola vez.
# Guarda crm-diario.ps1 en la carpeta de usuario y crea la tarea
# «PrimeNotes - CRM diario» (lunes a viernes 08:30, solo con la sesión iniciada).
#
# crm-diario.ps1 lanza los 4 flujos de Power Automate Desktop por su URL de
# ejecución, uno detrás de otro (PAD solo ejecuta uno a la vez), Accounts el
# último: su CSV dispara el flujo nube que recarga el Excel del agente, y su
# último paso sube las cuentas a PrimeSuite. Log en crm-diario.log.

@'
$flujos = [ordered]@{
  Contacts      = 'c5d8183a-9b6a-49c2-a3c1-33883b2e1de8'
  Opportunities = 'e9072df1-ae98-4fc6-9d75-9244b20f82d9'
  Quotes        = '05c2894c-3dfe-44df-a072-7bf1ca04af35'
  Accounts      = '8bb7d760-58ed-42f4-9aa9-715dcefe67cb'
}
$entorno = 'Default-9680142b-e519-4506-8d12-c0704c2fafb4'
$log = "$env:USERPROFILE\crm-diario.log"
function Anotar($t) { Add-Content $log "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $t" }
function Robot { @(Get-Process -Name 'PAD.Robot' -ErrorAction SilentlyContinue).Count -gt 0 }

foreach ($nombre in $flujos.Keys) {
  Anotar "Lanzando $nombre"
  Start-Process "ms-powerautomate:/console/flow/run?environmentid=$entorno&workflowid=$($flujos[$nombre])&source=Other"
  # Espera a que arranque (incluye el tiempo de pulsar «Sí» si PAD lo pregunta).
  $limite = (Get-Date).AddMinutes(60)
  while (-not (Robot) -and (Get-Date) -lt $limite) { Start-Sleep 5 }
  if (-not (Robot)) { Anotar "$nombre no arrancó en 60 min; se para aquí"; exit 1 }
  # ponytail: se detecta el fin por el proceso PAD.Robot; si PAD cambia el nombre, subir a espera fija.
  $limite = (Get-Date).AddMinutes(90)
  while ((Robot) -and (Get-Date) -lt $limite) { Start-Sleep 10 }
  Anotar "$nombre terminado"
  Start-Sleep 15
}
Anotar 'Carga diaria completa'
'@ | Set-Content -Path "$env:USERPROFILE\crm-diario.ps1" -Encoding UTF8

$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$env:USERPROFILE\crm-diario.ps1`""
$cuando = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 08:30
$quien = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 5)
Register-ScheduledTask -TaskName 'PrimeNotes - CRM diario' -Action $accion -Trigger $cuando -Principal $quien -Settings $ajustes -Force | Out-Null
'Tarea creada. Para probarla ahora: Start-ScheduledTask -TaskName "PrimeNotes - CRM diario"'
