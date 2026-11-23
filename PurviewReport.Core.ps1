<#
    Purview Reporting
    PurviewReport.Core.ps1  -  ortak fonksiyon kutuphanesi

    Bu dosya tek basina calistirilmaz. New-PurviewReport.ps1 ve Install-PurviewReport.ps1
    tarafindan dot-source ile yuklenir.
#>

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$script:TokenCache    = @{}
$script:LogFile       = $null
$script:GraphResource = 'https://graph.microsoft.com'
$script:O365Resource  = 'https://manage.office.com'

# --------------------------------------------------------------------- log --
function Write-Log {
    param(
        [string]$Message,
        [ValidateSet('INFO', 'WARN', 'ERROR', 'OK')][string]$Level = 'INFO'
    )
    $line = '{0}  {1,-5}  {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    switch ($Level) {
        'OK'    { Write-Host $line -ForegroundColor Green }
        'WARN'  { Write-Host $line -ForegroundColor Yellow }
        'ERROR' { Write-Host $line -ForegroundColor Red }
        default { Write-Host $line }
    }
    if ($script:LogFile) {
        Add-Content -Path $script:LogFile -Value $line -Encoding UTF8
    }
}

function Get-Masked {
    param([string]$Value, [int]$Visible = 4)
    if ([string]::IsNullOrEmpty($Value)) { return '****' }
    if ($Value.Length -le $Visible) { return '****' }
    ('*' * ($Value.Length - $Visible)) + $Value.Substring($Value.Length - $Visible)
}

function Get-ProviderName {
    param($Config)
    if ($Config -and $Config.PSObject.Properties['ProviderName'] -and -not [string]::IsNullOrWhiteSpace([string]$Config.ProviderName)) {
        return [string]$Config.ProviderName
    }
    return 'Security Operations'
}

function Get-HttpStatusCode {
    param($ErrorRecord)
    if (-not $ErrorRecord -or -not $ErrorRecord.Exception) { return 0 }
    $resp = $ErrorRecord.Exception.Response
    if (-not $resp) { return 0 }
    try {
        return [int]$resp.StatusCode
    }
    catch {
        return 0
    }
}

function Get-HttpErrorBody {
    param($ErrorRecord)
    if (-not $ErrorRecord) { return '' }
    if ($ErrorRecord.ErrorDetails -and -not [string]::IsNullOrWhiteSpace($ErrorRecord.ErrorDetails.Message)) {
        return [string]$ErrorRecord.ErrorDetails.Message
    }
    $resp = $ErrorRecord.Exception.Response
    if (-not $resp) { return [string]$ErrorRecord.Exception.Message }
    try {
        if ($resp.PSObject.Properties['Content'] -and $resp.Content) {
            return $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        }
        $stream = $resp.GetResponseStream()
        if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
        }
    }
    catch {
        Write-Verbose 'HTTP hata govdesi okunamadi.'
    }
    return [string]$ErrorRecord.Exception.Message
}

function Invoke-WithRetry {
    param([scriptblock]$Script, [int]$MaxAttempt = 5)
    for ($i = 1; $i -le $MaxAttempt; $i++) {
        try {
            return & $Script
        }
        catch {
            $code = Get-HttpStatusCode $_
            if ($i -eq $MaxAttempt -or ($code -ne 429 -and $code -lt 500)) { throw }
            $wait = [math]::Min(60, [math]::Pow(2, $i))
            Write-Log "HTTP $code - $wait sn sonra yeniden denenecek ($i/$MaxAttempt)" 'WARN'
            Start-Sleep -Seconds $wait
        }
    }
}

function ConvertTo-Base64Url {
    param([byte[]]$Bytes)
    [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Get-SourceStatusLabel {
    param([string]$Status)
    switch ($Status) {
        'Available'         { return 'Erişilebilir' }
        'Partial'           { return 'Kısmi Veri' }
        'PermissionMissing' { return 'Yetki Eksik' }
        'NotLicensed'       { return 'Lisanssız' }
        'SnapshotRequired'  { return 'IPPS Anlık Görüntüsü Gerekli' }
        'Beta'              { return 'Beta API' }
        default             { return 'Erişilemiyor' }
    }
}

# ---------------------------------------------------------------- kimlik ----
function Get-AppToken {
    param(
        [Parameter(Mandatory)] $Config,
        [Parameter(Mandatory)][string]$Resource
    )

    if ($script:TokenCache.ContainsKey($Resource) -and
        $script:TokenCache[$Resource].Expires -gt (Get-Date).AddMinutes(5)) {
        return $script:TokenCache[$Resource].Token
    }

    $tokenUri = "https://login.microsoftonline.com/$($Config.TenantId)/oauth2/v2.0/token"
    $body = @{
        client_id  = $Config.ClientId
        scope      = "$Resource/.default"
        grant_type = 'client_credentials'
    }

    if ($Config.AuthMode -eq 'Certificate') {
        $cert = @(Get-ChildItem 'Cert:\LocalMachine\My', 'Cert:\CurrentUser\My' -ErrorAction SilentlyContinue |
                    Where-Object { $_.Thumbprint -eq $Config.CertificateThumbprint })[0]
        if (-not $cert) { throw "Sertifika bulunamadi: $($Config.CertificateThumbprint)" }

        $now     = [DateTimeOffset]::UtcNow
        $header  = @{ alg = 'RS256'; typ = 'JWT'; x5t = (ConvertTo-Base64Url $cert.GetCertHash()) } | ConvertTo-Json -Compress
        $payload = @{
            aud = $tokenUri
            iss = $Config.ClientId
            sub = $Config.ClientId
            jti = [guid]::NewGuid().ToString()
            nbf = $now.ToUnixTimeSeconds()
            exp = $now.AddMinutes(10).ToUnixTimeSeconds()
        } | ConvertTo-Json -Compress
        $h   = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($header))
        $p   = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($payload))
        $rsa = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
        if (-not $rsa) { throw 'Sertifikanin ozel anahtarina erisilemiyor.' }
        $sig = $rsa.SignData(
            [Text.Encoding]::UTF8.GetBytes("$h.$p"),
            [Security.Cryptography.HashAlgorithmName]::SHA256,
            [Security.Cryptography.RSASignaturePadding]::Pkcs1
        )
        $body.client_assertion_type = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
        $body.client_assertion      = "$h.$p." + (ConvertTo-Base64Url $sig)
    }
    else {
        $secretFile = Join-Path $script:Root 'secret.txt'
        if (-not (Test-Path $secretFile)) { throw 'secret.txt bulunamadi. Once Install-PurviewReport.ps1 calistirin.' }
        $sec  = Get-Content $secretFile | ConvertTo-SecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
        try {
            $body.client_secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
        }
        finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }

    $resp = Invoke-WithRetry {
        Invoke-RestMethod -Method Post -Uri $tokenUri -Body $body -ContentType 'application/x-www-form-urlencoded'
    }
    $script:TokenCache[$Resource] = @{
        Token   = $resp.access_token
        Expires = (Get-Date).AddSeconds([int]$resp.expires_in)
    }
    $body.Clear()
    return $resp.access_token
}

# ------------------------------------------------------------------- REST ---
function Invoke-PagedApi {
    param([string]$Uri, [string]$Token, [int]$MaxPage = 100)
    $all     = New-Object System.Collections.ArrayList
    $headers = @{ Authorization = "Bearer $Token" }
    $next    = $Uri
    $page    = 0
    while ($next -and $page -lt $MaxPage) {
        $r = Invoke-WithRetry { Invoke-RestMethod -Method Get -Uri $next -Headers $headers }
        if ($null -ne $r.value) {
            foreach ($x in $r.value) { [void]$all.Add($x) }
        }
        $next = $r.'@odata.nextLink'
        $page++
    }
    if ($next) { Write-Log "Sayfalama ust siniri ($MaxPage) asildi, veri kismi olabilir." 'WARN' }
    return $all.ToArray()
}

function Test-IsPurviewRelatedAlert {
    param($Alert)
    if (-not $Alert) { return $false }
    $src = [string]$Alert.serviceSource
    $cat = [string]$Alert.category
    $tit = [string]$Alert.title
    $det = [string]$Alert.detectorId
    $combined = "$src $cat $tit $det"
    return ($combined -match 'purview|dlp|dataLoss|informationProtection|insider|communicationCompliance|compliance|sensitivity|mip|ediscovery|records')
}

function Get-DlpActivityEvent {
    param(
        $Config,
        [datetime]$Start,
        [datetime]$End,
        [string]$Mode
    )

    $events = New-Object System.Collections.ArrayList
    $seenIds = @{}
    $status = 'Unavailable'
    $detail = ''

    try {
        $o365Tok = Get-AppToken $Config $script:O365Resource
        $baseUri = "$script:O365Resource/api/v1.0/$($Config.TenantId)/activity/feed"
        $headers = @{ Authorization = "Bearer $o365Tok" }

        $subs = @(Invoke-WithRetry { Invoke-RestMethod -Method Get -Uri "$baseUri/subscriptions/list" -Headers $headers })
        $dlpSub = @($subs | Where-Object { $_.contentType -eq 'DLP.All' -and $_.status -eq 'enabled' })
        if ($dlpSub.Count -eq 0) {
            Write-Log 'DLP.All aboneligi baslatiliyor...'
            try {
                Invoke-WithRetry { Invoke-RestMethod -Method Post -Uri "$baseUri/subscriptions/start?contentType=DLP.All" -Headers $headers } | Out-Null
            }
            catch {
                $errBody = Get-HttpErrorBody $_
                if ($errBody -notmatch 'already enabled|AF20024') { throw }
            }
        }

        $nowUtc = (Get-Date).ToUniversalTime()
        $apiFloor = $nowUtc.AddDays(-7).AddMinutes(5)
        $winStart = $Start.ToUniversalTime()
        $winEnd = $End.ToUniversalTime()
        if ($winEnd -gt $nowUtc) { $winEnd = $nowUtc }
        if ($winStart -lt $apiFloor) { $winStart = $apiFloor }

        if ($winStart -lt $winEnd) {
            $cursor = $winStart
            while ($cursor -lt $winEnd) {
                $sliceEnd = $cursor.AddHours(24)
                if ($sliceEnd -gt $winEnd) { $sliceEnd = $winEnd }
                $sStr = $cursor.ToString('yyyy-MM-ddTHH:mm:ss')
                $eStr = $sliceEnd.ToString('yyyy-MM-ddTHH:mm:ss')
                $listUri = "$baseUri/subscriptions/content?contentType=DLP.All&startTime=$sStr&endTime=$eStr"

                try {
                    $blobs = @(Invoke-WithRetry { Invoke-RestMethod -Method Get -Uri $listUri -Headers $headers })
                    foreach ($blob in $blobs) {
                        if (-not $blob.contentUri) { continue }
                        $payload = Invoke-WithRetry { Invoke-RestMethod -Method Get -Uri $blob.contentUri -Headers $headers }
                        foreach ($rec in @($payload)) {
                            $rid = if ($rec.Id) { [string]$rec.Id } elseif ($rec.RecordType -and $rec.CreationTime) { "$($rec.RecordType)-$($rec.CreationTime)-$($rec.UserId)" } else { [guid]::NewGuid().ToString() }
                            if (-not $seenIds.ContainsKey($rid)) {
                                $seenIds[$rid] = $true
                                [void]$events.Add($rec)
                            }
                        }
                    }
                }
                catch {
                    $c = Get-HttpStatusCode $_
                    if ($c -eq 401 -or $c -eq 403) { throw }
                    Write-Log "DLP.All dilim uyarisi ($sStr): $(Get-HttpErrorBody $_)" 'WARN'
                }

                $cursor = $sliceEnd
            }
        }

        # Aylik raporda arsivlenmis haftalik DLP verileri varsa mevcut ay icin birlestir
        if ($Mode -eq 'Monthly' -and $script:Root) {
            $weeklyArch = Join-Path $script:Root 'Archive\Weekly'
            if (Test-Path $weeklyArch) {
                $startU = $Start.ToUniversalTime()
                $endU   = $End.ToUniversalTime()
                Get-ChildItem -Path $weeklyArch -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                    $rawDlp = Join-Path $_.FullName 'raw-dlp.json'
                    if (Test-Path $rawDlp) {
                        try {
                            $cached = Get-Content $rawDlp -Raw -Encoding UTF8 | ConvertFrom-Json
                            foreach ($rec in @($cached)) {
                                if ($rec.CreationTime) {
                                    $ct = ([datetime]$rec.CreationTime).ToUniversalTime()
                                    if ($ct -lt $startU -or $ct -ge $endU) { continue }
                                }
                                $rid = if ($rec.Id) { [string]$rec.Id } else { [guid]::NewGuid().ToString() }
                                if (-not $seenIds.ContainsKey($rid)) {
                                    $seenIds[$rid] = $true
                                    [void]$events.Add($rec)
                                }
                            }
                        }
                        catch {
                            Write-Verbose "Haftalik DLP arsivi okunamadi: $rawDlp"
                        }
                    }
                }
            }
        }

        if ($Mode -eq 'Monthly' -and $Start.ToUniversalTime() -lt $apiFloor) {
            $status = 'Partial'
            $detail = 'Office 365 Management Activity API canli olarak son 7 gunu verir; kalan gunler varsa haftalik arsivden birlestirildi.'
        }
        else {
            $status = 'Available'
            $detail = 'Office 365 Management Activity API (DLP.All)'
        }
    }
    catch {
        $code = Get-HttpStatusCode $_
        $msg  = Get-HttpErrorBody $_
        if ($code -eq 401 -or $code -eq 403) {
            $status = 'PermissionMissing'
            $detail = "ActivityFeed.Read izni eksik veya yayilmamis (HTTP $code)"
        }
        else {
            $status = 'Unavailable'
            $detail = "DLP.All alinamadi: $msg"
        }
        Write-Log "DLP.All uyarisi: $detail" 'WARN'
    }

    return [pscustomobject]@{
        Status = $status
        Detail = $detail
        Events = @($events)
    }
}

function Get-PurviewAuditSummary {
    param(
        $Config,
        [string]$GraphToken,
        [datetime]$Start,
        [datetime]$End
    )

    $timeoutSec = 45
    if ($Config.Purview -and $Config.Purview.PSObject.Properties['AuditPollTimeoutSeconds']) {
        $timeoutSec = [int]$Config.Purview.AuditPollTimeoutSeconds
    }
    if ($timeoutSec -lt 10) { $timeoutSec = 10 }

    $status = 'Unavailable'
    $detail = ''
    $records = @()

    try {
        $sFilter = $Start.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        $eFilter = $End.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        $headers = @{ Authorization = "Bearer $GraphToken" }

        # Once ayni donem icin mevcut bir sorgu var mi kontrol et (429 eszamanli sorgu sinirini onler)
        $queryId = ''
        $finalState = ''
        try {
            $existing = Invoke-RestMethod -Method Get -Uri "$script:GraphResource/v1.0/security/auditLog/queries?`$top=10" -Headers $headers
            $match = @($existing.value | Where-Object {
                $_.filterStartDateTime -and $_.filterEndDateTime -and
                ([datetime]$_.filterStartDateTime).ToUniversalTime().ToString('yyyy-MM-dd') -eq $Start.ToUniversalTime().ToString('yyyy-MM-dd') -and
                $_.status -in @('succeeded', 'running', 'notStarted')
            }) | Select-Object -First 1
            if ($match) {
                $queryId    = [string]$match.id
                $finalState = [string]$match.status
            }
        }
        catch {
            Write-Verbose 'Mevcut audit sorgulari listelenemedi.'
        }

        if (-not $queryId) {
            $body = @{
                displayName         = "PurviewReport-$(Get-Date -Format 'yyyyMMddHHmmss')"
                filterStartDateTime = $sFilter
                filterEndDateTime   = $eFilter
            } | ConvertTo-Json -Depth 5

            $created = Invoke-RestMethod -Method Post -Uri "$script:GraphResource/v1.0/security/auditLog/queries" `
                -Headers $headers -ContentType 'application/json' -Body $body
            $queryId    = [string]$created.id
            $finalState = [string]$created.status
        }

        $deadline = (Get-Date).AddSeconds($timeoutSec)
        while ((Get-Date) -lt $deadline -and $finalState -in @('notStarted', 'running', '')) {
            Start-Sleep -Seconds 3
            $poll = Invoke-WithRetry {
                Invoke-RestMethod -Method Get -Uri "$script:GraphResource/v1.0/security/auditLog/queries/$queryId" -Headers $headers
            }
            $finalState = [string]$poll.status
        }

        if ($finalState -eq 'succeeded') {
            $records = @(Invoke-PagedApi "$script:GraphResource/v1.0/security/auditLog/queries/$queryId/records?`$top=100" $GraphToken 10)
            $status = 'Available'
            $detail = "Graph auditLog/queries ($($records.Count) kayit)"
        }
        elseif ($finalState -in @('notStarted', 'running')) {
            $status = 'Partial'
            $detail = "Sorgu arka planda suruyor ($timeoutSec sn penceresi)"
        }
        else {
            $status = 'Unavailable'
            $detail = "Denetim sorgusu durumu: $finalState"
        }
    }
    catch {
        $code = Get-HttpStatusCode $_
        $msg  = Get-HttpErrorBody $_
        if ($code -eq 401 -or $code -eq 403) {
            $status = 'PermissionMissing'
            $detail = "AuditLogsQuery.Read.All izni eksik veya lisans yetersiz (HTTP $code)"
        }
        elseif ($code -eq 429 -or $msg -match 'TooManyRequests') {
            $status = 'Partial'
            $detail = 'HTTP 429 - Eszamanli denetim sorgusu kotasi dolu'
        }
        elseif ($msg -match 'license|subscription|not enabled') {
            $status = 'NotLicensed'
            $detail = 'Purview Audit Search lisansi bulunamadi'
        }
        else {
            $status = 'Unavailable'
            $detail = "HTTP $code - Audit sorgusu su an yanit vermiyor"
        }
        Write-Log "Audit Log uyarisi: $detail ($msg)" 'WARN'
    }

    return [pscustomobject]@{
        Status  = $status
        Detail  = $detail
        Records = @($records)
    }
}

function Get-PolicySnapshotData {
    param(
        $Config,
        [string]$GraphToken,
        [string]$OverridePath
    )

    $snapPath = $OverridePath
    if (-not $snapPath -and $Config.Purview -and $Config.Purview.PSObject.Properties['PolicySnapshotPath']) {
        $snapPath = [string]$Config.Purview.PolicySnapshotPath
    }
    if ($snapPath -and -not [IO.Path]::IsPathRooted($snapPath) -and $script:Root) {
        $snapPath = Join-Path $script:Root $snapPath
    }

    if ($snapPath -and (Test-Path $snapPath)) {
        try {
            $raw = Get-Content -Path $snapPath -Raw -Encoding UTF8 | ConvertFrom-Json
            return [pscustomobject]@{
                Status   = 'Available'
                Detail   = "IPPS anlik goruntusu ($([IO.Path]::GetFileName($snapPath)))"
                Snapshot = $raw
                IsBeta   = $false
            }
        }
        catch {
            Write-Log "IPPS anlik goruntusu okunamadi ($snapPath): $($_.Exception.Message)" 'WARN'
        }
    }

    $useBeta = $false
    if ($Config.Purview -and $Config.Purview.PSObject.Properties['EnableBetaLabelApi']) {
        $useBeta = [bool]$Config.Purview.EnableBetaLabelApi
    }

    if ($useBeta -and $GraphToken) {
        try {
            $labels = @(Invoke-PagedApi "$script:GraphResource/beta/security/dataSecurityAndGovernance/sensitivityLabels" $GraphToken 10)
            $synth = [pscustomobject]@{
                collectedAt                 = (Get-Date).ToUniversalTime().ToString('o')
                dlpPolicies                 = @()
                sensitivityLabelCount       = $labels.Count
                sensitivityLabelPolicyCount = 0
                retentionPolicyCount        = 0
                insiderRiskPolicyCount      = 0
                commCompliancePolicyCount   = 0
            }
            return [pscustomobject]@{
                Status   = 'Beta'
                Detail   = "Graph Beta sensitivityLabels ($($labels.Count) etiket)"
                Snapshot = $synth
                IsBeta   = $true
            }
        }
        catch {
            Write-Log "Graph Beta etiket cagrisi basarisiz: $(Get-HttpErrorBody $_)" 'WARN'
        }
    }

    return [pscustomobject]@{
        Status   = 'SnapshotRequired'
        Detail   = 'IPPS anlik goruntusu yok; Collect-PurviewPolicies.ps1 calistirin'
        Snapshot = $null
        IsBeta   = $false
    }
}

# ------------------------------------------------------------- veri toplama -
function Get-PurviewData {
    param(
        $Config,
        [datetime]$Start,
        [datetime]$End,
        [ValidateSet('Weekly', 'Monthly')][string]$Mode,
        [string]$PolicySnapshotOverride
    )

    $startZ = $Start.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    $endZ   = $End.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

    $sources = [ordered]@{}

    $graphTok = Get-AppToken $Config $script:GraphResource
    Write-Log 'Microsoft Graph API jetonu alindi.' 'OK'

    # 1. Graph Security Alerts v2
    $alertsAll = @()
    try {
        Write-Log 'Security Alerts v2 verisi cekiliyor...'
        $alertsAll = @(Invoke-PagedApi ("$script:GraphResource/v1.0/security/alerts_v2?`$filter=createdDateTime ge $startZ and createdDateTime lt $endZ&`$top=100") $graphTok)
        Write-Log "  $($alertsAll.Count) M365 uyarisi cekildi"
        $sources['AlertsV2'] = [pscustomobject]@{ Name = 'Graph Security Alerts v2'; Status = 'Available'; Detail = "$($alertsAll.Count) toplam M365 uyarisi" }
    }
    catch {
        $code = Get-HttpStatusCode $_
        $st = if ($code -in @(401, 403)) { 'PermissionMissing' } else { 'Unavailable' }
        $sources['AlertsV2'] = [pscustomobject]@{ Name = 'Graph Security Alerts v2'; Status = $st; Detail = Get-HttpErrorBody $_ }
        Write-Log "Security Alerts v2 alinamadi: $(Get-HttpErrorBody $_)" 'WARN'
    }

    # 2. Graph Security Incidents (v1.0 max $top=50)
    $incidents = @()
    try {
        Write-Log 'Security Incidents verisi cekiliyor ($top=50)...'
        $incidents = @(Invoke-PagedApi ("$script:GraphResource/v1.0/security/incidents?`$filter=createdDateTime ge $startZ and createdDateTime lt $endZ&`$top=50") $graphTok)
        Write-Log "  $($incidents.Count) incident cekildi"
        $sources['Incidents'] = [pscustomobject]@{ Name = 'Graph Security Incidents'; Status = 'Available'; Detail = "$($incidents.Count) olay (top=50)" }
    }
    catch {
        $code = Get-HttpStatusCode $_
        $st = if ($code -in @(401, 403)) { 'PermissionMissing' } else { 'Unavailable' }
        $sources['Incidents'] = [pscustomobject]@{ Name = 'Graph Security Incidents'; Status = $st; Detail = Get-HttpErrorBody $_ }
        Write-Log "Security Incidents alinamadi: $(Get-HttpErrorBody $_)" 'WARN'
    }

    # 3. Office 365 Management Activity API (DLP.All)
    Write-Log 'Office 365 Management Activity API (DLP.All) kontrol ediliyor...'
    $dlpRes = Get-DlpActivityEvent -Config $Config -Start $Start -End $End -Mode $Mode
    Write-Log "  DLP.All durum: $($dlpRes.Status) ($($dlpRes.Events.Count) olay)"
    $sources['DlpActivity'] = [pscustomobject]@{ Name = 'O365 Activity API (DLP.All)'; Status = $dlpRes.Status; Detail = $dlpRes.Detail }

    # 4. Graph Purview Audit Log Queries
    Write-Log 'Graph Purview Audit sorgusu calistiriliyor...'
    $auditRes = Get-PurviewAuditSummary -Config $Config -GraphToken $graphTok -Start $Start -End $End
    Write-Log "  Audit durum: $($auditRes.Status) ($($auditRes.Records.Count) kayit)"
    $sources['AuditLog'] = [pscustomobject]@{ Name = 'Graph Audit Log Queries'; Status = $auditRes.Status; Detail = $auditRes.Detail }

    # 5. Graph eDiscovery Cases
    $ediscoveryCases = @()
    try {
        Write-Log 'eDiscovery vakalari kontrol ediliyor...'
        $ediscoveryCases = @(Invoke-PagedApi "$script:GraphResource/v1.0/security/cases/ediscoveryCases" $graphTok 20)
        Write-Log "  $($ediscoveryCases.Count) eDiscovery vakasi"
        $sources['EDiscovery'] = [pscustomobject]@{ Name = 'Graph eDiscovery Cases'; Status = 'Available'; Detail = "$($ediscoveryCases.Count) vaka" }
    }
    catch {
        $code = Get-HttpStatusCode $_
        $msg  = Get-HttpErrorBody $_
        $st = if ($code -eq 403 -or $msg -match 'license|subscription|not enabled') { 'NotLicensed' }
              elseif ($code -eq 401) { 'PermissionMissing' }
              else { 'Unavailable' }
        $shortDetail = if ($st -eq 'NotLicensed') { "HTTP $code - eDiscovery lisansi bulunamadi" }
                       elseif ($st -eq 'PermissionMissing') { "HTTP $code - eDiscovery.Read.All izni eksik veya lisans yok" }
                       else { "HTTP $code - Erisilemiyor" }
        $sources['EDiscovery'] = [pscustomobject]@{ Name = 'Graph eDiscovery Cases'; Status = $st; Detail = $shortDetail }
        Write-Log "eDiscovery erisimi ($st): $msg" 'WARN'
    }

    # 6. IPPS Politika Anlik Goruntusu
    Write-Log 'Purview IPPS politika envanteri yukleniyor...'
    $polRes = Get-PolicySnapshotData -Config $Config -GraphToken $graphTok -OverridePath $PolicySnapshotOverride
    Write-Log "  Politika envanteri: $($polRes.Status)"
    $sources['Policies'] = [pscustomobject]@{ Name = 'Purview IPPS Politikalari'; Status = $polRes.Status; Detail = $polRes.Detail }

    return [pscustomobject]@{
        AlertsAll       = $alertsAll
        Incidents       = $incidents
        DlpEvents       = $dlpRes.Events
        AuditRecords    = $auditRes.Records
        EDiscoveryCases = $ediscoveryCases
        PolicySnapshot  = $polRes.Snapshot
        Sources         = $sources
        Start           = $Start
        End             = $End
        Mode            = $Mode
    }
}

# ------------------------------------------------------------ KPI hesabi ----
function New-PurviewKpi {
    param($Data, $Config)

    $alertsAll = @($Data.AlertsAll)
    $purviewAlerts = @($alertsAll | Where-Object { Test-IsPurviewRelatedAlert $_ })
    $incidents = @($Data.Incidents)
    $dlpEvents = @($Data.DlpEvents)
    $auditRecs = @($Data.AuditRecords)
    $cases     = @($Data.EDiscoveryCases)
    $snap      = $Data.PolicySnapshot
    $sources   = $Data.Sources
    $th        = if ($Config -and $Config.PSObject.Properties['Thresholds']) { $Config.Thresholds } else { $null }

    $dlpPolicies = @()
    $labelCount = 0
    $labelPolCount = 0
    $retPolCount = 0
    $irPolCount = 0
    $commPolCount = 0
    $snapCollectedAt = ''

    if ($snap) {
        if ($snap.PSObject.Properties['dlpPolicies'] -and $snap.dlpPolicies) {
            $dlpPolicies = @($snap.dlpPolicies)
        }
        if ($snap.PSObject.Properties['sensitivityLabelCount'])       { $labelCount    = [int]$snap.sensitivityLabelCount }
        if ($snap.PSObject.Properties['sensitivityLabelPolicyCount']) { $labelPolCount = [int]$snap.sensitivityLabelPolicyCount }
        if ($snap.PSObject.Properties['retentionPolicyCount'])        { $retPolCount   = [int]$snap.retentionPolicyCount }
        if ($snap.PSObject.Properties['insiderRiskPolicyCount'])      { $irPolCount    = [int]$snap.insiderRiskPolicyCount }
        if ($snap.PSObject.Properties['commCompliancePolicyCount'])   { $commPolCount  = [int]$snap.commCompliancePolicyCount }
        if ($snap.PSObject.Properties['collectedAt'])                 { $snapCollectedAt = [string]$snap.collectedAt }
    }

    $dlpEnforce  = @($dlpPolicies | Where-Object { $_.mode -eq 'Enforce' }).Count
    $dlpTest     = @($dlpPolicies | Where-Object { $_.mode -in @('TestWithNotifications', 'TestWithoutNotifications') }).Count
    $dlpDisabled = @($dlpPolicies | Where-Object { $_.mode -notin @('Enforce', 'TestWithNotifications', 'TestWithoutNotifications') }).Count

    $workloadCounts = [ordered]@{}
    foreach ($p in $dlpPolicies) {
        foreach ($w in @($p.workloadScope)) {
            if ([string]::IsNullOrWhiteSpace([string]$w)) { continue }
            $wk = [string]$w
            if (-not $workloadCounts.Contains($wk)) { $workloadCounts[$wk] = 0 }
            $workloadCounts[$wk] = [int]$workloadCounts[$wk] + 1
        }
    }

    # Uyari & Olay istatistikleri
    $alertSourceSet = if ($purviewAlerts.Count -gt 0) { $purviewAlerts } else { $alertsAll }
    $alertHigh = @($alertSourceSet | Where-Object { $_.severity -eq 'high' }).Count

    $sevHigh = @($incidents | Where-Object { $_.severity -eq 'high' }).Count
    $sevMed  = @($incidents | Where-Object { $_.severity -eq 'medium' }).Count
    $sevLow  = @($incidents | Where-Object { $_.severity -eq 'low' }).Count
    $sevInf  = @($incidents | Where-Object { $_.severity -eq 'informational' }).Count

    $closedInc = @($incidents | Where-Object { $_.status -eq 'resolved' })
    $openInc   = @($incidents | Where-Object { $_.status -in @('active', 'inProgress') })
    $avgClose  = 0
    if ($closedInc.Count -gt 0) {
        $avgClose = [math]::Round((($closedInc | ForEach-Object {
            ([datetime]$_.lastUpdateDateTime - [datetime]$_.createdDateTime).TotalHours
        }) | Measure-Object -Average).Average, 1)
    }

    $cls = [ordered]@{}
    foreach ($g in ($incidents | Group-Object classification)) {
        $n = if ($g.Name) { [string]$g.Name } else { 'Siniflandirilmadi' }
        $cls[$n] = $g.Count
    }

    # DLP olay ozetleri (O365 Activity API)
    $dlpHigh = @($dlpEvents | Where-Object { "$($_.Severity)" -match 'High' -or "$($_.PolicyMatchInfo.Severity)" -match 'High' }).Count
    $dlpPolicyHits = [ordered]@{}
    $dlpWorkloadHits = [ordered]@{}
    foreach ($ev in $dlpEvents) {
        $pName = $null
        if ($ev.PSObject.Properties['PolicyDetails'] -and $ev.PolicyDetails) {
            $pName = @($ev.PolicyDetails)[0].PolicyName
        }
        if (-not $pName -and $ev.PSObject.Properties['PolicyName']) { $pName = $ev.PolicyName }
        if (-not $pName) { $pName = 'Bilinmeyen Politika' }
        if (-not $dlpPolicyHits.Contains($pName)) { $dlpPolicyHits[$pName] = 0 }
        $dlpPolicyHits[$pName] = [int]$dlpPolicyHits[$pName] + 1

        $wl = if ($ev.PSObject.Properties['Workload'] -and $ev.Workload) { [string]$ev.Workload } else { 'Diger' }
        if (-not $dlpWorkloadHits.Contains($wl)) { $dlpWorkloadHits[$wl] = 0 }
        $dlpWorkloadHits[$wl] = [int]$dlpWorkloadHits[$wl] + 1
    }

    $topDlpPolicies = @($dlpPolicyHits.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 8 |
        ForEach-Object { [pscustomobject]@{ Politika = $_.Key; Adet = $_.Value } })

    $topAlerts = @($alertSourceSet | Sort-Object createdDateTime -Descending | Select-Object -First 10 |
        ForEach-Object {
            [pscustomobject]@{
                Baslik = [string]$_.title
                Siddet = [string]$_.severity
                Durum  = [string]$_.status
                Kaynak = [string]$_.serviceSource
                Tarih  = if ($_.createdDateTime) { ([datetime]$_.createdDateTime).ToString('dd.MM.yyyy') } else { '-' }
            }
        })

    $auditPurviewCount = @($auditRecs | Where-Object {
        "$($_.operation) $($_.service)" -match 'Dlp|Label|Sensitivity|Compliance|Purview|Insider|Retention|eDiscovery'
    }).Count

    # Otomatik yonetim onerileri
    $recs = New-Object System.Collections.ArrayList
    $testLimit = if ($th -and $th.PSObject.Properties['TestModeDlpPolicies']) { [int]$th.TestModeDlpPolicies } else { 1 }
    if ($dlpTest -ge $testLimit -and $dlpTest -gt 0) {
        [void]$recs.Add("Test kipindeki $dlpTest DLP politikasini yanlis pozitif dogrulamasi sonrasi Enforce kipine gecirin.")
    }
    if ($sources -and $sources['Policies'] -and $sources['Policies'].Status -eq 'SnapshotRequired') {
        [void]$recs.Add('IPPS politika envanteri icin Collect-PurviewPolicies.ps1 gorevini zamanlayin.')
    }
    if ($retPolCount -eq 0 -and $snap) {
        [void]$recs.Add('Aktif Veri Saklama (Retention) politikasi bulunmuyor; kritik M365 is yukleri icin yasam dongusu politikasi tanimlayin.')
    }
    if ($sources -and $sources['DlpActivity'] -and $sources['DlpActivity'].Status -eq 'PermissionMissing') {
        [void]$recs.Add('Office 365 Management API ActivityFeed.Read yetkisinin yonetici onayini dogrulayin.')
    }
    if ($openInc.Count -gt 0) {
        [void]$recs.Add("Acik durumdaki $($openInc.Count) guvenlik olayini analist atamasi ile sonuclandirin.")
    }
    if ($recs.Count -eq 0) {
        [void]$recs.Add('Mevcut Purview koruma politikalari dengeli calisiyor; aylik yanlis pozitif ve etiket kapsam gozden gecirmesini surdurun.')
    }

    $sourceList = @()
    if ($sources) {
        foreach ($key in $sources.Keys) {
            $s = $sources[$key]
            $sourceList += [pscustomobject]@{
                Key    = $key
                Name   = $s.Name
                Status = $s.Status
                Label  = (Get-SourceStatusLabel $s.Status)
                Detail = $s.Detail
            }
        }
    }

    $k = [ordered]@{
        Mode                      = $Data.Mode
        DonemBaslangic            = $Data.Start.ToString('yyyy-MM-dd')
        DonemBitis                = $Data.End.AddDays(-1).ToString('yyyy-MM-dd')
        Etiket                    = if ($Data.Mode -eq 'Weekly') { $Data.Start.ToString('yyyy-MM-dd') + '-hafta' } else { $Data.Start.ToString('yyyy-MM') }

        DlpPolicyTotal            = $dlpPolicies.Count
        DlpPolicyEnforce          = $dlpEnforce
        DlpPolicyTest             = $dlpTest
        DlpPolicyDisabled         = $dlpDisabled
        DlpPolicies               = @($dlpPolicies)
        DlpWorkloadScope          = $workloadCounts
        SensitivityLabelCount     = $labelCount
        SensitivityLabelPolicies  = $labelPolCount
        RetentionPolicies         = $retPolCount
        InsiderRiskPolicies       = $irPolCount
        CommCompliancePolicies    = $commPolCount
        SnapshotCollectedAt       = $snapCollectedAt

        DlpEventsTotal            = $dlpEvents.Count
        DlpEventsHigh             = $dlpHigh
        TopDlpPolicies            = $topDlpPolicies
        DlpWorkloadHits           = $dlpWorkloadHits

        TotalAlertsM365           = $alertsAll.Count
        PurviewAlerts             = $purviewAlerts.Count
        AlertHigh                 = $alertHigh
        TopAlerts                 = $topAlerts

        TotalIncidents            = $incidents.Count
        IncHigh                   = $sevHigh
        IncMedium                 = $sevMed
        IncLow                    = $sevLow
        IncInfo                   = $sevInf
        IncClosed                 = $closedInc.Count
        IncOpen                   = $openInc.Count
        InvestigatedIncidents     = @($incidents | Where-Object { $_.classification -and $_.classification -ne 'unknown' }).Count
        AvgCloseHours             = $avgClose
        Classification            = $cls

        AuditRecordsTotal         = $auditRecs.Count
        AuditPurviewEvents        = $auditPurviewCount
        EDiscoveryCasesTotal      = $cases.Count
        EDiscoveryCasesOpen       = @($cases | Where-Object { $_.status -eq 'active' }).Count

        SourceStatuses            = $sourceList
        Recommendations           = @($recs)
    }

    return [pscustomobject]$k
}

# ------------------------------------------------------------ PDF / MAIL ----
function Get-EdgePath {
    $c = @(
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    $c | Where-Object { Test-Path $_ } | Select-Object -First 1
}

function Convert-ToPdf {
    param([string]$HtmlPath, [string]$PdfPath)
    $edge = Get-EdgePath
    if (-not $edge) { return $false }
    $uri = 'file:///' + ($HtmlPath -replace '\\', '/')
    $argList = @(
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-pdf-header-footer',
        "--print-to-pdf=$PdfPath",
        $uri
    )
    Start-Process -FilePath $edge -ArgumentList $argList -Wait -NoNewWindow
    Start-Sleep -Seconds 2
    Test-Path $PdfPath
}

function Get-MailSubject {
    param($Config, $Kpi, [string]$Mode)
    $tr = [Globalization.CultureInfo]::GetCultureInfo('tr-TR')
    if ($Mode -eq 'Weekly') {
        $b = [datetime]$Kpi.DonemBaslangic
        $e = [datetime]$Kpi.DonemBitis
        return "$($Config.CustomerName) - Purview Haftalik Veri Guvenligi Ozeti - $($b.ToString('dd.MM')) - $($e.ToString('dd.MM.yyyy'))"
    }
    "$($Config.CustomerName) - Purview Aylik Veri Guvenligi ve Uyumluluk Raporu - $(([datetime]$Kpi.DonemBaslangic).ToString('MMMM yyyy', $tr))"
}

function New-SmtpClientFromConfig {
    param($Config)
    $smtp = New-Object Net.Mail.SmtpClient($Config.Smtp.Server, [int]$Config.Smtp.Port)
    $smtp.EnableSsl = [bool]$Config.Smtp.UseSsl
    if ($Config.Smtp.User) {
        $smtpFile = Join-Path $script:Root 'smtp.txt'
        if (Test-Path $smtpFile) {
            $sec  = Get-Content $smtpFile | ConvertTo-SecureString
            $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
            try {
                $smtp.Credentials = New-Object Net.NetworkCredential(
                    $Config.Smtp.User,
                    [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
                )
            }
            finally {
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
            }
        }
    }
    return $smtp
}

function Send-Report {
    param($Config, $Kpi, [string]$Html, [string[]]$Attachments, [string]$Mode)

    $subject = Get-MailSubject $Config $Kpi $Mode
    $to = @($Config.Mail.To | Where-Object { $_ })
    $cc = @($Config.Mail.Cc | Where-Object { $_ })

    if ($Config.Mail.Method -eq 'Graph') {
        $token = Get-AppToken $Config $script:GraphResource
        $atts = @()
        foreach ($f in $Attachments) {
            if (-not (Test-Path $f)) { continue }
            $bytes = [IO.File]::ReadAllBytes($f)
            if ($bytes.Length -gt 3MB) { Write-Log "Ek 3 MB uzeri, atlandi: $f" 'WARN'; continue }
            $atts += @{
                '@odata.type' = '#microsoft.graph.fileAttachment'
                name          = [IO.Path]::GetFileName($f)
                contentType   = if ($f.EndsWith('.pdf')) { 'application/pdf' } else { 'text/html' }
                contentBytes  = [Convert]::ToBase64String($bytes)
            }
        }
        $msg = @{
            message = @{
                subject      = $subject
                body         = @{ contentType = 'HTML'; content = $Html }
                toRecipients = @($to | ForEach-Object { @{ emailAddress = @{ address = $_ } } })
                ccRecipients = @($cc | ForEach-Object { @{ emailAddress = @{ address = $_ } } })
                attachments  = $atts
            }
            saveToSentItems = $true
        } | ConvertTo-Json -Depth 10

        Invoke-WithRetry {
            Invoke-RestMethod -Method Post `
                -Uri "$script:GraphResource/v1.0/users/$($Config.Mail.From)/sendMail" `
                -Headers @{ Authorization = "Bearer $token" } `
                -ContentType 'application/json; charset=utf-8' `
                -Body ([Text.Encoding]::UTF8.GetBytes($msg))
        } | Out-Null
    }
    else {
        $smtp = New-SmtpClientFromConfig $Config
        $mail = New-Object Net.Mail.MailMessage
        try {
            $mail.From = $Config.Mail.From
            foreach ($x in $to) { $mail.To.Add($x) }
            foreach ($x in $cc) { $mail.CC.Add($x) }
            $mail.Subject = $subject
            $mail.Body = $Html
            $mail.IsBodyHtml = $true
            $mail.BodyEncoding = [Text.Encoding]::UTF8
            foreach ($f in $Attachments) {
                if (Test-Path $f) { $mail.Attachments.Add((New-Object Net.Mail.Attachment($f))) }
            }
            $smtp.Send($mail)
        }
        finally {
            $mail.Dispose()
            $smtp.Dispose()
        }
    }
}

function Send-FailureNotice {
    param($Config, [string]$Message, [string]$LogPath)
    if (-not $Config.Mail.AlertTo) { return }
    try {
        $body = "Purview rapor uretimi basarisiz oldu.`n`nKurum   : $($Config.CustomerName)`nSunucu  : $env:COMPUTERNAME`nHata    : $Message`nLog     : $LogPath"
        if ($Config.Mail.Method -eq 'Graph') {
            $t = Get-AppToken $Config $script:GraphResource
            $m = @{
                message = @{
                    subject      = "HATA - $($Config.CustomerName) Purview raporu uretilemedi"
                    body         = @{ contentType = 'Text'; content = $body }
                    toRecipients = @(@{ emailAddress = @{ address = $Config.Mail.AlertTo } })
                }
            } | ConvertTo-Json -Depth 8
            Invoke-RestMethod -Method Post -Uri "$script:GraphResource/v1.0/users/$($Config.Mail.From)/sendMail" `
                -Headers @{ Authorization = "Bearer $t" } -ContentType 'application/json; charset=utf-8' `
                -Body ([Text.Encoding]::UTF8.GetBytes($m)) | Out-Null
        }
        else {
            $smtp = New-SmtpClientFromConfig $Config
            try {
                $smtp.Send($Config.Mail.From, $Config.Mail.AlertTo, "HATA - $($Config.CustomerName) Purview raporu uretilemedi", $body)
            }
            finally {
                $smtp.Dispose()
            }
        }
        Write-Log 'Hata bildirimi gonderildi.' 'WARN'
    }
    catch {
        Write-Log 'Hata bildirimi gonderilemedi.' 'WARN'
    }
}
