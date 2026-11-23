<#
.SYNOPSIS
    Tek komutluk test/canli Microsoft 365 kiracisi baglama sihirbazi.

.DESCRIPTION
    Microsoft Graph Command Line Tools cihaz kodu akisiyla admin oturumu acar:
      1. Tek kiracili, yalnizca SALT OKUNUR "Purview-Executive-Reporting-Reader" uygulamasini olusturur.
      2. En az ayricalikli Graph & Office 365 Management izinlerini ekler ve Admin Consent verir.
      3. 12 ay gecerli istemci gizli anahtari uretir.
      4. Proje kokunde .env dosyasini (DATA_PROVIDER=live) otomatik olusturur.

.EXAMPLE
    .\collectors\powershell\Setup-PurviewTestTenant.ps1 -Organization cnrctnky.onmicrosoft.com
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Organization,
    [string]$CustomerName = 'Purview Test Tenant',
    [string]$CustomerId   = 'cust-test-tenant'
)

$ErrorActionPreference = 'Stop'

# Microsoft Graph Command Line Tools genel istemci kimligi (yalnizca cihaz kodu kurulumu icin)
$script:CliClientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e'
$script:GraphAppId  = '00000003-0000-0000-c000-000000000000'
$script:O365AppId   = 'c5393580-f805-4401-95e8-94b7a6ef2fc2'

$script:ReadOnlyRoles = @(
    @{ Resource = $script:GraphAppId; Name = 'SecurityAlert.Read.All' }
    @{ Resource = $script:GraphAppId; Name = 'SecurityIncident.Read.All' }
    @{ Resource = $script:GraphAppId; Name = 'AuditLogsQuery.Read.All' }
    @{ Resource = $script:GraphAppId; Name = 'InformationProtectionPolicy.Read.All' }
    @{ Resource = $script:GraphAppId; Name = 'RecordsManagement.Read.All' }
    @{ Resource = $script:GraphAppId; Name = 'eDiscovery.Read.All' }
    @{ Resource = $script:O365AppId;  Name = 'ActivityFeed.Read' }
)

function Resolve-TenantId {
    param([string]$DomainOrTenant)
    $clean = $DomainOrTenant.Trim() -replace '^https?://', '' -replace '/.*$', ''
    $uri = "https://login.microsoftonline.com/$clean/v2.0/.well-known/openid-configuration"
    $res = Invoke-RestMethod -Uri $uri -TimeoutSec 20
    $tid = ($res.issuer -split '/')[3]
    [pscustomobject]@{ Domain = $clean; TenantId = $tid }
}

function Invoke-GraphJson {
    param([string]$Method, [string]$Uri, $Body, [string]$Token)
    $p = @{ Method = $Method; Uri = $Uri; Headers = @{ Authorization = "Bearer $Token" } }
    if ($Body) { $p.Body = ($Body | ConvertTo-Json -Depth 10); $p.ContentType = 'application/json' }
    Invoke-RestMethod @p
}

$resolved = Resolve-TenantId $Organization
$tenantId = $resolved.TenantId
Write-Host "Tenant dogrulandi: $($resolved.Domain) ($tenantId)" -ForegroundColor Cyan

$dc = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/devicecode" -Body @{
    client_id = $script:CliClientId
    scope     = 'https://graph.microsoft.com/Application.ReadWrite.All https://graph.microsoft.com/AppRoleAssignment.ReadWrite.All https://graph.microsoft.com/Directory.Read.All offline_access'
} -ContentType 'application/x-www-form-urlencoded'

Write-Host ''
Write-Host '============================================================' -ForegroundColor Yellow
Write-Host " Tarayicida acin : $($dc.verification_uri)" -ForegroundColor White
Write-Host " Kodu girin      : $($dc.user_code)" -ForegroundColor White
Write-Host ' (Global Admin veya Privileged Role Admin ile oturum acin)' -ForegroundColor Yellow
Write-Host '============================================================' -ForegroundColor Yellow
try { Start-Process $dc.verification_uri } catch { Write-Verbose 'Tarayici elle acilacak.' }

$deadline = (Get-Date).AddSeconds([int]$dc.expires_in)
$adminToken = $null
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds ([int]$dc.interval + 1)
    try {
        $tok = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token" -Body @{
            grant_type  = 'urn:ietf:params:oauth:grant-type:device_code'
            client_id   = $script:CliClientId
            device_code = $dc.device_code
        } -ContentType 'application/x-www-form-urlencoded'
        $adminToken = $tok.access_token
        break
    }
    catch {
        $raw = [string]$_.ErrorDetails.Message
        if (-not $raw -and $_.Exception.Response) {
            try {
                if ($_.Exception.Response.Content) {
                    $raw = $_.Exception.Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                }
                else {
                    $raw = (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd()
                }
            }
            catch { Write-Verbose 'Hata akisi okunamadi.' }
        }
        if ($raw -match 'authorization_pending|slow_down') { continue }
        throw "Oturum hatasi: $raw $($_.Exception.Message)"
    }
}
if (-not $adminToken) { throw 'Cihaz kodu suresi doldu.' }
Write-Host 'Admin oturumu alindi.' -ForegroundColor Green

$appName = 'Purview-Executive-Reporting-Reader'
$app = Invoke-GraphJson POST 'https://graph.microsoft.com/v1.0/applications' @{
    displayName    = $appName
    signInAudience = 'AzureADMyOrg'
    notes          = 'Salt okunur Microsoft Purview Executive Reporting Portal toplayicisi'
} $adminToken

$sp = Invoke-GraphJson POST 'https://graph.microsoft.com/v1.0/servicePrincipals' @{ appId = $app.appId } $adminToken

$resourceSps = @{}
foreach ($rid in @($script:GraphAppId, $script:O365AppId)) {
    $r = Invoke-GraphJson GET "https://graph.microsoft.com/v1.0/servicePrincipals?`$filter=appId eq '$rid'" $null $adminToken
    if ($r.value -and $r.value.Count -gt 0) { $resourceSps[$rid] = $r.value[0] }
}

$rra = @()
foreach ($rid in $resourceSps.Keys) {
    $roles = @()
    foreach ($need in ($script:ReadOnlyRoles | Where-Object { $_.Resource -eq $rid })) {
        $role = @($resourceSps[$rid].appRoles | Where-Object { $_.value -eq $need.Name -and $_.allowedMemberTypes -contains 'Application' })[0]
        if ($role) { $roles += @{ id = $role.id; type = 'Role' } }
    }
    if ($roles.Count) { $rra += @{ resourceAppId = $rid; resourceAccess = $roles } }
}
Invoke-GraphJson PATCH "https://graph.microsoft.com/v1.0/applications/$($app.id)" @{ requiredResourceAccess = $rra } $adminToken | Out-Null

foreach ($need in $script:ReadOnlyRoles) {
    $res = $resourceSps[$need.Resource]
    if (-not $res) { Write-Warning "Kaynak tenantta bulunamadi, atlandi: $($need.Resource)"; continue }
    $role = @($res.appRoles | Where-Object { $_.value -eq $need.Name -and $_.allowedMemberTypes -contains 'Application' })[0]
    if (-not $role) { Write-Warning "Izin rolu bulunamadi: $($need.Name)"; continue }
    try {
        Invoke-GraphJson POST "https://graph.microsoft.com/v1.0/servicePrincipals/$($res.id)/appRoleAssignedTo" @{
            principalId = $sp.id; resourceId = $res.id; appRoleId = $role.id
        } $adminToken | Out-Null
        Write-Host "  OK  $($need.Name)" -ForegroundColor Green
    }
    catch {
        Write-Warning "Onaylanamadi ($($need.Name)): $($_.Exception.Message)"
    }
}

$secretRes = Invoke-GraphJson POST "https://graph.microsoft.com/v1.0/applications/$($app.id)/addPassword" @{
    passwordCredential = @{
        displayName = 'Purview-Reporting-Local'
        endDateTime = (Get-Date).AddMonths(12).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
} $adminToken

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envPath  = Join-Path $repoRoot '.env'
@"
NODE_ENV=development
PORT=4010
DATA_PROVIDER=live
AUTH_MODE=demo
LIVE_CUSTOMER_ID=$CustomerId
LIVE_CUSTOMER_NAME=$CustomerName
LIVE_TENANT_ID=$tenantId
LIVE_TENANT_DOMAIN=$($resolved.Domain)
LIVE_DATA_DIR=./data/live-snapshots
GRAPH_CLIENT_ID=$($app.appId)
GRAPH_CLIENT_SECRET=$($secretRes.secretText)
POWERSHELL_SNAPSHOT_DIR=./collectors/powershell/output
ENABLE_BETA_CONNECTORS=false
CORS_ALLOWED_ORIGINS=http://localhost:3010,http://127.0.0.1:3010
"@ | Set-Content -Path $envPath -Encoding UTF8

Write-Host ''
Write-Host "Tamamlandi! .env olusturuldu ($envPath)." -ForegroundColor Green
Write-Host "Sonraki adim: npm run dev   ->   http://localhost:3010" -ForegroundColor Cyan
