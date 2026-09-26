# Carga diaria del CRM SIN Power Automate (su lanzamiento programado exige
# licencia Premium). Ejecutar UNA vez en el PC de empresa:
#   powershell -ExecutionPolicy Bypass -File "$env:OneDriveCommercial\instalar-crm-diario.ps1"
# Guarda crm-diario.ps1 en la carpeta de usuario y crea la tarea
# «PrimeNotes - CRM diario» (lunes a viernes 08:30; si el PC estaba apagado,
# al encenderlo). Requiere sesión iniciada y VPN.
#
# crm-diario.ps1 hace lo mismo que los 4 flujos de PAD (mismos fetchXml y
# columnas): descarga Contacts, Opportunities, Quotes y Accounts del CRM y deja
# DIGITEK_<Tabla>_<parte>.csv en la carpeta de SharePoint «PrimeNotes - CRM»
# (acceso directo en OneDrive, que la sube sola). Accounts va el último: su CSV
# dispara el flujo nube que recarga el Excel del agente. Después sube las
# cuentas a PrimeSuite (sincronizar-cuentas-crm). Log en crm-diario.log.

@'
$ErrorActionPreference = 'Stop'
$carpeta = Join-Path $env:OneDriveCommercial 'PrimeNotes - CRM'
$log = "$env:USERPROFILE\crm-diario.log"
function Anotar($t) { Add-Content $log "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $t" }
$fv = '@OData.Community.Display.V1.FormattedValue'
$cabeceras = @{ Prefer = 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' }

function Descargar($tabla, $entidad, $conjunto, $atributos, $columnas) {
  $todas = @()
  for ($page = 1; $page -le 10; $page++) {
    $attrs = ($atributos | ForEach-Object { "<attribute name='$_' />" }) -join ''
    $fetchXml = "<fetch count='5000' page='$page'><entity name='$entidad'>$attrs<order attribute='${entidad}id' /></entity></fetch>"
    $url = "https://crm.primion.eu/digitekCRM/api/data/v8.1/${conjunto}?fetchXml=" + [Uri]::EscapeDataString($fetchXml)
    $filas = @((Invoke-RestMethod -Uri $url -Method Get -UseDefaultCredentials -Headers $cabeceras).value)
    if ($filas.Count -eq 0) { break }
    $sel = $filas | Select-Object -Property $columnas
    $csv = ($sel | ConvertTo-Csv -NoTypeInformation) -join [Environment]::NewLine
    Set-Content -Path (Join-Path $carpeta "DIGITEK_${tabla}_${page}.csv") -Value $csv -Encoding UTF8 -NoNewline
    Anotar "$tabla parte ${page}: $($filas.Count) filas"
    $todas += $sel
  }
  return $todas
}

try {
  if (-not (Test-Path $carpeta)) { throw "No existe $carpeta (acceso directo de OneDrive a PrimeNotes - CRM)" }
  Anotar 'Inicio'

  Descargar 'Contacts' 'contact' 'contacts' @(
    'contactid','fullname','firstname','lastname','jobtitle','emailaddress1','telephone1','mobilephone','parentcustomerid','modifiedon'
  ) @(
    'contactid','fullname','firstname','lastname','jobtitle','emailaddress1','telephone1','mobilephone',
    @{Name='_parentcustomerid_value'; Expression={$_._parentcustomerid_value}},
    @{Name='cuenta';                  Expression={$_."_parentcustomerid_value$fv"}},
    'modifiedon'
  ) | Out-Null

  Descargar 'Opportunities' 'opportunity' 'opportunities' @(
    'opportunityid','name','modifiedon','customerid','parentaccountid','parentcontactid','ownerid','statecode','statuscode',
    'closeprobability','estimatedclosedate','actualclosedate','estimatedvalue','actualvalue','totalamount','pri_type',
    'pri_wahrscheinlichkeit','pri_estimatedrevenue','pri_weightedestimatedrevenue','pri_fasedelproceso','pri_raznperdida',
    'pri_datelost','pri_recentquote','description'
  ) @(
    'opportunityid','name','modifiedon',
    @{Name='_customerid_value';      Expression={$_._customerid_value}},
    @{Name='cliente';                Expression={$_."_customerid_value$fv"}},
    @{Name='_parentaccountid_value'; Expression={$_._parentaccountid_value}},
    @{Name='_parentcontactid_value'; Expression={$_._parentcontactid_value}},
    @{Name='contacto';               Expression={$_."_parentcontactid_value$fv"}},
    @{Name='propietario';            Expression={$_."_ownerid_value$fv"}},
    'statecode',
    @{Name='estado';                 Expression={$_."statecode$fv"}},
    'statuscode',
    @{Name='razon_estado';           Expression={$_."statuscode$fv"}},
    'closeprobability','estimatedclosedate','actualclosedate','estimatedvalue','actualvalue','totalamount','pri_type',
    @{Name='tipo';                   Expression={$_."pri_type$fv"}},
    'pri_wahrscheinlichkeit',
    @{Name='probabilidad_texto';     Expression={$_."pri_wahrscheinlichkeit$fv"}},
    'pri_estimatedrevenue','pri_weightedestimatedrevenue','pri_fasedelproceso',
    @{Name='fase';                   Expression={$_."pri_fasedelproceso$fv"}},
    'pri_raznperdida',
    @{Name='razon_perdida';          Expression={$_."pri_raznperdida$fv"}},
    'pri_datelost',
    @{Name='_pri_recentquote_value'; Expression={$_._pri_recentquote_value}},
    'description'
  ) | Out-Null

  Descargar 'Quotes' 'quote' 'quotes' @(
    'quoteid','name','quotenumber','modifiedon','opportunityid','customerid','pri_contactid','accountid','pri_projectid',
    'pri_contactparentaccountid','pri_new_clone_source_offer','pri_tipodeofertaid','pri_subtipodeofertaid','pri_reference',
    'pri_quotedate','effectivefrom','effectiveto','totalamount','totalamount_base','statecode','statuscode'
  ) @(
    'quoteid','name','quotenumber','modifiedon','_opportunityid_value',
    @{Name='oportunidad';    Expression={$_."_opportunityid_value$fv"}},
    '_customerid_value',
    @{Name='cliente';        Expression={$_."_customerid_value$fv"}},
    '_pri_contactid_value',
    @{Name='contacto';       Expression={$_."_pri_contactid_value$fv"}},
    '_accountid_value','_pri_projectid_value',
    @{Name='proyecto';       Expression={$_."_pri_projectid_value$fv"}},
    '_pri_contactparentaccountid_value','_pri_new_clone_source_offer_value','_pri_tipodeofertaid_value',
    @{Name='tipo_oferta';    Expression={$_."_pri_tipodeofertaid_value$fv"}},
    '_pri_subtipodeofertaid_value',
    @{Name='subtipo_oferta'; Expression={$_."_pri_subtipodeofertaid_value$fv"}},
    'pri_reference','pri_quotedate','effectivefrom','effectiveto','totalamount','totalamount_base','statecode',
    @{Name='estado';         Expression={$_."statecode$fv"}},
    'statuscode',
    @{Name='razon_estado';   Expression={$_."statuscode$fv"}}
  ) | Out-Null

  # ponytail: espera fija para que OneDrive suba lo anterior antes de que el CSV
  # de Accounts dispare el flujo nube; si llega a quedarse corta, subirla.
  Start-Sleep -Seconds 180

  $cuentas = Descargar 'Accounts' 'account' 'accounts' @(
    'accountid','name','accountnumber','telephone1','emailaddress1','websiteurl','address1_city','address1_postalcode',
    'address1_country','parentaccountid','ownerid','statecode','modifiedon'
  ) @(
    'accountid','name','accountnumber','telephone1','emailaddress1','websiteurl','address1_city','address1_postalcode','address1_country',
    @{Name='_parentaccountid_value'; Expression={$_._parentaccountid_value}},
    @{Name='cuenta_matriz';          Expression={$_."_parentaccountid_value$fv"}},
    @{Name='propietario';            Expression={$_."_ownerid_value$fv"}},
    'statecode',
    @{Name='estado';                 Expression={$_."statecode$fv"}},
    'modifiedon'
  )

  $clave = (Get-Content "$env:USERPROFILE\primesuite-clave-sync.txt" -Raw).Trim()
  $cuerpo = [Text.Encoding]::UTF8.GetBytes(($cuentas | ConvertTo-Json -Depth 2 -Compress))
  $r = Invoke-RestMethod -Method Post -Uri 'https://umrjzvpbcpzzqmkjahhn.supabase.co/functions/v1/sincronizar-cuentas-crm' `
    -Headers @{ 'x-clave-sync' = $clave } -ContentType 'application/json; charset=utf-8' -Body $cuerpo
  Anotar "PrimeSuite: recibidas $($r.recibidas), guardadas $($r.guardadas), descartadas $($r.descartadas)"
  Anotar 'Fin OK'
} catch {
  Anotar "ERROR: $($_.Exception.Message)"
  exit 1
}
'@ | Set-Content -Path "$env:USERPROFILE\crm-diario.ps1" -Encoding UTF8

$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$env:USERPROFILE\crm-diario.ps1`""
$cuando = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 08:30
$quien = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName 'PrimeNotes - CRM diario' -Action $accion -Trigger $cuando -Principal $quien -Settings $ajustes -Force | Out-Null
'Tarea creada.'
