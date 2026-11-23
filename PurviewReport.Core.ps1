<#
    Purview Reporting
    PurviewReport.Core.ps1  -  ortak fonksiyon kutuphanesi (v2 - Derin Telemetri)

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
        'Beta'              { return 'Graph Etiket API' }
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

function ConvertTo-NormalizedWorkload {
    param([string]$RawWorkload)
    if ([string]::IsNullOrWhiteSpace($RawWorkload)) { return 'Diğer' }
    switch -Regex ($RawWorkload) {
        'Exchange'                      { return 'Exchange' }
        'OneDrive'                      { return 'OneDrive' }
        'SharePoint'                    { return 'SharePoint' }
        'Teams|MicrosoftTeams'          { return 'Microsoft Teams' }
        'Endpoint|Device'               { return 'Endpoint' }
        'Copilot|AI|ConnectedAI'        { return 'Copilot / AI' }
        'SecurityComplianceCenter|Mip'  { return 'Purview Portal' }
        'AzureActiveDirectory|Entra'    { return 'Entra ID' }
        'PowerBI'                       { return 'Power BI' }
        default                         { return $RawWorkload }
    }
}

# ----------------------------------------- Graph Sensitivity Labels ---------
function Get-GraphSensitivityLabelInventory {
    param([string]$GraphToken)

    $labels = New-Object System.Collections.ArrayList
    $policySettings = $null
    $status = 'Unavailable'
    $detail = ''
    $headers = @{ Authorization = "Bearer $GraphToken" }

    try {
        $polResp = Invoke-RestMethod -Method Get -Uri "$script:GraphResource/beta/security/informationProtection/labelPolicySettings" -Headers $headers
        if ($polResp) {
            $policySettings = [pscustomobject]@{
                isMandatory                      = [bool]$polResp.isMandatory
                isDowngradeJustificationRequired = [bool]$polResp.isDowngradeJustificationRequired
                defaultLabelId                   = [string]$polResp.defaultLabelId
                moreInfoUrl                      = [string]$polResp.moreInfoUrl
            }
        }
    }
    catch {
        Write-Verbose 'Graph labelPolicySettings okunamadi.'
    }

    foreach ($ep in @(
        "$script:GraphResource/beta/security/informationProtection/sensitivityLabels",
        "$script:GraphResource/beta/informationProtection/policy/labels",
        "$script:GraphResource/v1.0/security/dataSecurityAndGovernance/sensitivityLabels"
    )) {
        try {
            $resp = Invoke-WithRetry { Invoke-RestMethod -Method Get -Uri $ep -Headers $headers }
            if ($resp -and $resp.value -and @($resp.value).Count -gt 0) {
                foreach ($item in $resp.value) {
                    $parentName = ''
                    if ($item.PSObject.Properties['parent'] -and $item.parent -and $item.parent.name) {
                        $parentName = [string]$item.parent.name.Trim()
                    }
                    $rawName = [string]$item.name.Trim()
                    $fullName = if ($parentName) { "$parentName / $rawName" } else { $rawName }
                    $prio = if ($null -ne $item.sensitivity) { [int]$item.sensitivity }
                            elseif ($null -ne $item.priority) { [int]$item.priority }
                            else { 0 }
                    $desc = if ($item.description) { [string]$item.description }
                            elseif ($item.tooltip) { [string]$item.tooltip }
                            else { '' }
                    $active = if ($null -ne $item.isActive) { [bool]$item.isActive } else { $true }
                    $appliable = if ($item.PSObject.Properties['isAppliable'] -and $null -ne $item.isAppliable) { [bool]$item.isAppliable } else { $active }
                    $hasProt = if ($item.PSObject.Properties['hasProtection'] -and $null -ne $item.hasProtection) {
                        [bool]$item.hasProtection
                    } else {
                        ($fullName -match 'Confidential|Highly|Gizli|RECETE' -and $fullName -notmatch 'Anyone')
                    }
                    $formats = if ($item.PSObject.Properties['contentFormats'] -and $item.contentFormats) {
                        (@($item.contentFormats) -join ', ')
                    } else { 'file, email' }

                    [void]$labels.Add([pscustomobject]@{
                        id                = [string]$item.id
                        name              = $rawName
                        displayName       = $fullName
                        parentName        = $parentName
                        priority          = $prio
                        encryptionEnabled = $hasProt
                        markingEnabled    = $hasProt
                        contentType       = $formats
                        tooltip           = $desc
                        isActive          = $active
                        isAppliable       = $appliable
                    })
                }
                $status = 'Available'
                $detail = "Graph Information Protection ($($labels.Count) etiket tanimi)"
                break
            }
        }
        catch {
            $code = Get-HttpStatusCode $_
            $detail = "HTTP $code - Etiket API yaniti alinamadi"
        }
    }

    return [pscustomobject]@{
        Status         = $status
        Detail         = $detail
        Labels         = @($labels.ToArray())
        PolicySettings = $policySettings
    }
}

# ------------------------------------ O365 Activity API (DLP + Audit) -------
function Get-O365ActivityTelemetry {
    param(
        $Config,
        [datetime]$Start,
        [datetime]$End,
        [string]$Mode
    )

    $dlpEvents   = New-Object System.Collections.ArrayList
    $auditEvents = New-Object System.Collections.ArrayList
    $seenIds     = @{}
    $dlpStatus   = 'Unavailable'
    $dlpDetail   = ''
    $auditStatus = 'Unavailable'
    $auditDetail = ''

    try {
        $o365Tok = Get-AppToken $Config $script:O365Resource
        $baseUri = "$script:O365Resource/api/v1.0/$($Config.TenantId)/activity/feed"
        $headers = @{ Authorization = "Bearer $o365Tok" }

        $subs = @(Invoke-WithRetry { Invoke-RestMethod -Method Get -Uri "$baseUri/subscriptions/list" -Headers $headers })
        $enabledTypes = @{}
        foreach ($item in $subs) {
            $subList = if ($item -is [array]) { $item } else { @($item) }
            foreach ($s in $subList) {
                if ($s -and $s.contentType -and "$($s.status)" -match 'enabled') {
                    $enabledTypes[[string]$s.contentType] = $true
                }
            }
        }

        foreach ($ct in @('DLP.All', 'Audit.General', 'Audit.SharePoint', 'Audit.Exchange')) {
            if (-not $enabledTypes.ContainsKey($ct)) {
                try {
                    $null = Invoke-RestMethod -Method Post -Uri "$baseUri/subscriptions/start?contentType=$ct&PublisherIdentifier=$($Config.TenantId)" -Headers $headers
                    $enabledTypes[$ct] = $true
                }
                catch {
                    $c = Get-HttpStatusCode $_
                    $errBody = Get-HttpErrorBody $_
                    if ($errBody -match 'already enabled|AF20024') {
                        $enabledTypes[$ct] = $true
                    }
                    elseif ($ct -eq 'DLP.All') {
                        $dlpStatus = if ($c -in @(401, 403)) { 'PermissionMissing' } else { 'Unavailable' }
                        $dlpDetail = "DLP.All icin ActivityFeed.ReadDlp izni gerekiyor (HTTP $c)"
                    }
                }
            }
        }

        $nowUtc   = (Get-Date).ToUniversalTime()
        $apiFloor = $nowUtc.AddDays(-7).AddMinutes(5)
        $winStart = $Start.ToUniversalTime()
        $winEnd   = $End.ToUniversalTime()
        if ($winEnd -gt $nowUtc)     { $winEnd = $nowUtc }
        if ($winStart -lt $apiFloor) { $winStart = $apiFloor }
        if ($winStart -ge $winEnd) {
            $winStart = $apiFloor
            $winEnd   = $nowUtc
        }

        $activeFeeds = @('DLP.All', 'Audit.General', 'Audit.SharePoint', 'Audit.Exchange') |
            Where-Object { $enabledTypes.ContainsKey($_) }

        if ($winStart -lt $winEnd) {
            foreach ($ct in $activeFeeds) {
                $cursor = $winStart
                while ($cursor -lt $winEnd) {
                    $sliceEnd = $cursor.AddHours(24)
                    if ($sliceEnd -gt $winEnd) { $sliceEnd = $winEnd }
                    $sStr = $cursor.ToString('yyyy-MM-ddTHH:mm:ss')
                    $eStr = $sliceEnd.ToString('yyyy-MM-ddTHH:mm:ss')
                    $listUri = "$baseUri/subscriptions/content?contentType=$ct&startTime=$sStr&endTime=$eStr"

                    try {
                        $blobs = Invoke-RestMethod -Method Get -Uri $listUri -Headers $headers
                        foreach ($blob in $blobs) {
                            if (-not $blob -or -not $blob.contentUri) { continue }
                            $payload = Invoke-RestMethod -Method Get -Uri $blob.contentUri -Headers $headers
                            foreach ($item in $payload) {
                                $records = if ($item -is [array]) { $item } else { @($item) }
                                foreach ($rec in $records) {
                                    if (-not $rec) { continue }
                                    $rid = if ($rec.Id) { [string]$rec.Id }
                                           elseif ($rec.Operation -and $rec.CreationTime) { "$($rec.Operation)-$($rec.CreationTime)-$($rec.UserId)" }
                                           else { [guid]::NewGuid().ToString() }
                                    if ($seenIds.ContainsKey($rid)) { continue }
                                    $seenIds[$rid] = $true

                                    $op = [string]$rec.Operation
                                    if ($ct -eq 'DLP.All' -or $op -match 'DlpRuleMatch|DLPRuleMatch|DlpRuleUndo' -or $rec.PSObject.Properties['PolicyDetails']) {
                                        [void]$dlpEvents.Add($rec)
                                    }
                                    [void]$auditEvents.Add($rec)
                                }
                            }
                        }
                    }
                    catch {
                        $c = Get-HttpStatusCode $_
                        if ($ct -eq 'DLP.All' -and $c -in @(401, 403)) {
                            $dlpStatus = 'PermissionMissing'
                            $dlpDetail = "DLP.All icin ActivityFeed.ReadDlp izni eksik (HTTP $c)"
                        }
                    }
                    $cursor = $sliceEnd
                }
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
                                if (-not $rec) { continue }
                                if ($rec.CreationTime) {
                                    $ctTime = ([datetime]$rec.CreationTime).ToUniversalTime()
                                    if ($ctTime -lt $startU -or $ctTime -ge $endU) { continue }
                                }
                                $rid = if ($rec.Id) { [string]$rec.Id } else { [guid]::NewGuid().ToString() }
                                if (-not $seenIds.ContainsKey($rid)) {
                                    $seenIds[$rid] = $true
                                    [void]$dlpEvents.Add($rec)
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

        if ($enabledTypes.ContainsKey('DLP.All') -and $dlpStatus -ne 'PermissionMissing') {
            $dlpStatus = if ($Mode -eq 'Monthly' -and $Start.ToUniversalTime() -lt $apiFloor) { 'Partial' } else { 'Available' }
            $dlpDetail = "O365 Activity DLP.All ($($dlpEvents.Count) DLP olayi)"
        }
        elseif ($dlpEvents.Count -gt 0) {
            $dlpStatus = 'Available'
            $dlpDetail = "Audit akislarindan $($dlpEvents.Count) DLP eslesmesi cikarildi"
        }

        $feedCount = @($activeFeeds | Where-Object { $_ -ne 'DLP.All' }).Count
        if ($feedCount -gt 0) {
            $auditStatus = 'Available'
            $auditDetail = "Audit.General/SharePoint/Exchange ($($auditEvents.Count) denetim kaydi)"
        }
    }
    catch {
        $code = Get-HttpStatusCode $_
        $msg  = Get-HttpErrorBody $_
        $auditStatus = if ($code -in @(401, 403)) { 'PermissionMissing' } else { 'Unavailable' }
        $auditDetail = "HTTP $code - ActivityFeed.Read erisimi alinamadi"
        if ($dlpStatus -eq 'Unavailable') {
            $dlpStatus = $auditStatus
            $dlpDetail = $auditDetail
        }
        Write-Log "O365 Activity uyarisi: $msg" 'WARN'
    }

    return [pscustomobject]@{
        DlpStatus   = $dlpStatus
        DlpDetail   = $dlpDetail
        DlpEvents   = @($dlpEvents.ToArray())
        AuditStatus = $auditStatus
        AuditDetail = $auditDetail
        AuditEvents = @($auditEvents.ToArray())
    }
}

# -------------------------------------- Graph Purview Audit Log Queries -----
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

        $queryId = ''
        $finalState = ''
        try {
            $existing = Invoke-RestMethod -Method Get -Uri "$script:GraphResource/v1.0/security/auditLog/queries?`$top=10" -Headers $headers
            $match = @($existing.value | Where-Object {
                $_.filterStartDateTime -and $_.filterEndDateTime -and
                ([datetime]$_.filterStartDateTime).ToUniversalTime().ToString('yyyy-MM-dd') -eq $Start.ToUniversalTime().ToString('yyyy-MM-dd') -and
                $_.status -in @('succeeded', 'running', 'notStarted')
            }) | Sort-Object { if ($_.status -eq 'succeeded') { 0 } else { 1 } } | Select-Object -First 1
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
                operationFilters    = @(
                    'DlpRuleMatch', 'DlpRuleUndo', 'SensitivityLabelApplied', 'SensitivityLabelUpdated',
                    'SensitivityLabelRemoved', 'FileSensitivityLabelChanged', 'MipLabel', 'LabelApplied',
                    'LabelChanged', 'LabelRemoved', 'FileCopiedToRemovableMedia', 'FileUploadedToCloud',
                    'New-DlpCompliancePolicy', 'Set-DlpCompliancePolicy', 'New-DlpComplianceRule',
                    'Set-DlpComplianceRule', 'New-Label', 'Set-Label', 'Set-LabelPolicy', 'AuditSearchCreated'
                )
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

# ------------------------------------------------- Policy Snapshot + Labels -
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

    $snapObj = $null
    $status  = 'SnapshotRequired'
    $detail  = 'IPPS anlik goruntusu yok; Collect-PurviewPolicies.ps1 calistirin'

    if ($snapPath -and (Test-Path $snapPath)) {
        try {
            $snapObj = Get-Content -Path $snapPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $status  = 'Available'
            $detail  = "IPPS anlik goruntusu ($([IO.Path]::GetFileName($snapPath)))"
        }
        catch {
            Write-Log "IPPS anlik goruntusu okunamadi ($snapPath): $($_.Exception.Message)" 'WARN'
        }
    }

    # Graph uzerinden canli Hassasiyet Etiketi tanimlarini ve politika ayarlarini tamamla
    $graphLabels = @()
    $graphPolicySettings = $null
    $labelSourceDetail = ''
    if ($GraphToken) {
        $gLblRes = Get-GraphSensitivityLabelInventory -GraphToken $GraphToken
        if ($gLblRes.Status -eq 'Available' -and $gLblRes.Labels.Count -gt 0) {
            $graphLabels = $gLblRes.Labels
            $labelSourceDetail = $gLblRes.Detail
        }
        $graphPolicySettings = $gLblRes.PolicySettings
    }

    if ($snapObj) {
        $hasSnapLabels = ($snapObj.PSObject.Properties['sensitivityLabels'] -and @($snapObj.sensitivityLabels).Count -gt 0)
        if (-not $hasSnapLabels -and $graphLabels.Count -gt 0) {
            $snapObj | Add-Member -NotePropertyName 'sensitivityLabels' -NotePropertyValue $graphLabels -Force
            $snapObj | Add-Member -NotePropertyName 'sensitivityLabelCount' -NotePropertyValue $graphLabels.Count -Force
            $detail = "$detail + $labelSourceDetail"
        }
        if ($graphPolicySettings -and (-not $snapObj.PSObject.Properties['labelPolicySettings'])) {
            $snapObj | Add-Member -NotePropertyName 'labelPolicySettings' -NotePropertyValue $graphPolicySettings -Force
        }
    }
    elseif ($graphLabels.Count -gt 0) {
        $snapObj = [pscustomobject]@{
            collectedAt                 = (Get-Date).ToUniversalTime().ToString('o')
            dlpPolicies                 = @()
            dlpRules                    = @()
            sensitivityLabels           = $graphLabels
            sensitivityLabelCount       = $graphLabels.Count
            sensitivityLabelPolicyCount = 0
            labelPolicySettings         = $graphPolicySettings
            retentionPolicyCount        = 0
            insiderRiskPolicyCount      = 0
            commCompliancePolicyCount   = 0
        }
        $status = 'Beta'
        $detail = $labelSourceDetail
    }

    return [pscustomobject]@{
        Status      = $status
        Detail      = $detail
        Snapshot    = $snapObj
        GraphLabels = $graphLabels
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
        $sources['AlertsV2'] = [pscustomobject]@{ Name = 'Graph Security Alerts v2'; Status = $st; Detail = "HTTP $code - SecurityAlert.Read.All kontrol edin" }
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
        $sources['Incidents'] = [pscustomobject]@{ Name = 'Graph Security Incidents'; Status = $st; Detail = "HTTP $code - SecurityIncident.Read.All kontrol edin" }
        Write-Log "Security Incidents alinamadi: $(Get-HttpErrorBody $_)" 'WARN'
    }

    # 3. Office 365 Management Activity API (DLP.All + Audit.General/SharePoint/Exchange)
    Write-Log 'Office 365 Management Activity API (DLP + Audit) kontrol ediliyor...'
    $o365Res = Get-O365ActivityTelemetry -Config $Config -Start $Start -End $End -Mode $Mode
    Write-Log "  DLP.All durum: $($o365Res.DlpStatus) ($($o365Res.DlpEvents.Count) DLP olayi) | Audit: $($o365Res.AuditStatus) ($($o365Res.AuditEvents.Count) kayit)"
    $sources['DlpActivity']   = [pscustomobject]@{ Name = 'O365 Activity API (DLP.All)'; Status = $o365Res.DlpStatus; Detail = $o365Res.DlpDetail }
    $sources['O365AuditFeed'] = [pscustomobject]@{ Name = 'O365 Activity API (Audit Akislari)'; Status = $o365Res.AuditStatus; Detail = $o365Res.AuditDetail }

    # 4. Graph Purview Audit Log Queries
    Write-Log 'Graph Purview Audit sorgusu calistiriliyor...'
    $auditRes = Get-PurviewAuditSummary -Config $Config -GraphToken $graphTok -Start $Start -End $End
    Write-Log "  Graph Audit durum: $($auditRes.Status) ($($auditRes.Records.Count) kayit)"
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

    # 6. IPPS Politika Anlik Goruntusu + Graph Hassasiyet Etiketleri
    Write-Log 'Purview IPPS politika ve Hassasiyet Etiketi envanteri yukleniyor...'
    $polRes = Get-PolicySnapshotData -Config $Config -GraphToken $graphTok -OverridePath $PolicySnapshotOverride
    Write-Log "  Politika ve Etiket envanteri: $($polRes.Status) ($($polRes.Detail))"
    $sources['Policies'] = [pscustomobject]@{ Name = 'Purview Politika & Etiket Envanteri'; Status = $polRes.Status; Detail = $polRes.Detail }

    # O365 AuditEvents ve Graph AuditRecords birlestir
    $combinedAudit = New-Object System.Collections.ArrayList
    foreach ($a in @($o365Res.AuditEvents)) { [void]$combinedAudit.Add($a) }
    foreach ($g in @($auditRes.Records))    { [void]$combinedAudit.Add($g) }

    return [pscustomobject]@{
        AlertsAll       = $alertsAll
        Incidents       = $incidents
        DlpEvents       = $o365Res.DlpEvents
        AuditRecords    = @($combinedAudit.ToArray())
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

    $alertsAll     = @($Data.AlertsAll)
    $purviewAlerts = @($alertsAll | Where-Object { Test-IsPurviewRelatedAlert $_ })
    $incidents     = @($Data.Incidents)
    $dlpEvents     = @($Data.DlpEvents)
    $auditRecs     = @($Data.AuditRecords)
    $cases         = @($Data.EDiscoveryCases)
    $snap          = $Data.PolicySnapshot
    $sources       = $Data.Sources
    $th            = if ($Config -and $Config.PSObject.Properties['Thresholds']) { $Config.Thresholds } else { $null }

    $dlpPolicies     = @()
    $dlpRules        = @()
    $labels          = @()
    $labelPolicies   = @()
    $labelCount      = 0
    $labelActiveCnt  = 0
    $labelPolCount   = 0
    $autoLblPolCount = 0
    $retPolCount     = 0
    $retLblCount     = 0
    $irPolCount      = 0
    $commPolCount    = 0
    $snapCollectedAt = ''
    $labelPolicySet  = $null

    if ($snap) {
        if ($snap.PSObject.Properties['dlpPolicies'] -and $snap.dlpPolicies)                 { $dlpPolicies     = @($snap.dlpPolicies) }
        if ($snap.PSObject.Properties['dlpRules'] -and $snap.dlpRules)                       { $dlpRules        = @($snap.dlpRules) }
        if ($snap.PSObject.Properties['sensitivityLabels'] -and $snap.sensitivityLabels)     { $labels          = @($snap.sensitivityLabels) }
        if ($snap.PSObject.Properties['sensitivityLabelPolicies'] -and $snap.sensitivityLabelPolicies) { $labelPolicies = @($snap.sensitivityLabelPolicies) }
        if ($snap.PSObject.Properties['labelPolicySettings'] -and $snap.labelPolicySettings) { $labelPolicySet  = $snap.labelPolicySettings }
        if ($snap.PSObject.Properties['sensitivityLabelCount'])                              { $labelCount      = [int]$snap.sensitivityLabelCount }
        if ($snap.PSObject.Properties['sensitivityLabelPolicyCount'])                        { $labelPolCount   = [int]$snap.sensitivityLabelPolicyCount }
        if ($snap.PSObject.Properties['autoLabelPolicyCount'])                               { $autoLblPolCount = [int]$snap.autoLabelPolicyCount }
        if ($snap.PSObject.Properties['retentionPolicyCount'])                               { $retPolCount     = [int]$snap.retentionPolicyCount }
        if ($snap.PSObject.Properties['retentionLabelCount'])                                { $retLblCount     = [int]$snap.retentionLabelCount }
        if ($snap.PSObject.Properties['insiderRiskPolicyCount'])                             { $irPolCount      = [int]$snap.insiderRiskPolicyCount }
        if ($snap.PSObject.Properties['commCompliancePolicyCount'])                          { $commPolCount    = [int]$snap.commCompliancePolicyCount }
        if ($snap.PSObject.Properties['collectedAt'])                                        { $snapCollectedAt = [string]$snap.collectedAt }
        if ($snap.PSObject.Properties['activityRecords'] -and $snap.activityRecords) {
            foreach ($ar in @($snap.activityRecords)) { $auditRecs += $ar }
        }
    }

    if ($labels.Count -gt 0 -and $labelCount -eq 0) { $labelCount = $labels.Count }
    $labelActiveCnt = @($labels | Where-Object { $_.isActive -ne $false }).Count

    # Etiket ID -> Görünen Ad sözlüğü
    $labelLookup = @{}
    foreach ($l in $labels) {
        $disp = if ($l.displayName) { [string]$l.displayName } else { [string]$l.name }
        if ($l.id)   { $labelLookup[[string]$l.id.ToLowerInvariant()]   = $disp }
        if ($l.name) { $labelLookup[[string]$l.name.ToLowerInvariant()] = $disp }
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

    # Audit kayitlarindaki ek DLP ve Etiket olaylarini ayristir
    $allDlpRecords = New-Object System.Collections.ArrayList
    foreach ($e in $dlpEvents) { [void]$allDlpRecords.Add($e) }

    $labelAppliedCount    = 0
    $labelChangedCount    = 0
    $labelRemovedCount    = 0
    $labelAutoCount       = 0
    $labelUsageByName     = @{}
    $labelUsageByWorkload = [ordered]@{}
    $labelUsageByUser     = @{}

    $auditByWorkload   = [ordered]@{}
    $auditByOperation  = @{}
    $auditByActor      = @{}
    $auditPurviewCount = 0

    $egressCounts = [ordered]@{
        'Harici E-posta (Exchange DLP)'             = 0
        'SharePoint / OneDrive Dış & Anonim Paylaşım' = 0
        'USB / Çıkarılabilir Medya (Endpoint)'      = 0
        '3. Taraf Bulut / Web Yükleme (Cloud Egress)'= 0
        'Fiziksel Yazıcı & Pano (Print / Clipboard)' = 0
        'Üretken Yapay Zekâ / Copilot & AI Siteleri'= 0
    }
    $governanceDriftCount = 0

    foreach ($rec in $auditRecs) {
        if (-not $rec) { continue }
        $payload = $rec
        if ($rec.PSObject.Properties['auditData'] -and $rec.auditData) {
            if ($rec.auditData -is [string]) {
                try { $payload = $rec.auditData | ConvertFrom-Json } catch { $payload = $rec }
            }
            else { $payload = $rec.auditData }
        }

        $op = if ($rec.PSObject.Properties['Operation'] -and $rec.Operation) { [string]$rec.Operation }
              elseif ($rec.PSObject.Properties['operation'] -and $rec.operation) { [string]$rec.operation }
              elseif ($payload.PSObject.Properties['Operation']) { [string]$payload.Operation }
              elseif ($payload.PSObject.Properties['Activity']) { [string]$payload.Activity }
              else { 'Bilinmiyor' }

        $rawWl = if ($rec.PSObject.Properties['Workload'] -and $rec.Workload) { [string]$rec.Workload }
                 elseif ($rec.PSObject.Properties['service'] -and $rec.service) { [string]$rec.service }
                 elseif ($payload.PSObject.Properties['Workload']) { [string]$payload.Workload }
                 else { 'Diğer' }
        $wl = ConvertTo-NormalizedWorkload $rawWl

        $actor = if ($rec.PSObject.Properties['UserId'] -and $rec.UserId) { [string]$rec.UserId }
                 elseif ($rec.PSObject.Properties['userPrincipalName'] -and $rec.userPrincipalName) { [string]$rec.userPrincipalName }
                 elseif ($payload.PSObject.Properties['UserId']) { [string]$payload.UserId }
                 elseif ($payload.PSObject.Properties['User']) { [string]$payload.User }
                 else { '' }

        if (-not $auditByWorkload.Contains($wl)) { $auditByWorkload[$wl] = 0 }
        $auditByWorkload[$wl] = [int]$auditByWorkload[$wl] + 1

        if ($op -notlike 'Get-*') {
            if (-not $auditByOperation.ContainsKey($op)) { $auditByOperation[$op] = 0 }
            $auditByOperation[$op] = [int]$auditByOperation[$op] + 1

            if ($actor -and $actor -notmatch '^NT SERVICE|MSExchangeAdminApi|SHAREPOINT\\system|Not Available') {
                if (-not $auditByActor.ContainsKey($actor)) { $auditByActor[$actor] = 0 }
                $auditByActor[$actor] = [int]$auditByActor[$actor] + 1
            }
        }

        if ("$op $rawWl" -match 'Dlp|Label|Sensitivity|Compliance|Purview|Insider|Retention|eDiscovery|Mip') {
            $auditPurviewCount++
        }

        # Sizinti Kanali (Egress) ve Yonetisim Kaymasi (Admin Drift)
        switch -Regex ($op) {
            'FileCopiedToRemovableMedia'              { $egressCounts['USB / Çıkarılabilir Medya (Endpoint)']++ }
            'FileUploadedToCloud'                     { $egressCounts['3. Taraf Bulut / Web Yükleme (Cloud Egress)']++ }
            'FilePrinted|FileCopiedToClipboard'       { $egressCounts['Fiziksel Yazıcı & Pano (Print / Clipboard)']++ }
            'AnonymousLinkCreated|CompanyLinkCreated|SharingSet|AddedToSecureLink' { $egressCounts['SharePoint / OneDrive Dış & Anonim Paylaşım']++ }
            'CopilotInteraction|AIAppInteraction|ConnectedAIApp' { $egressCounts['Üretken Yapay Zekâ / Copilot & AI Siteleri']++ }
            '^(New|Set|Remove)-(Dlp|Label|Retention|Insider|Supervisory|Compliance)|AuditSearchCreated|Start-ComplianceSearchAction' { $governanceDriftCount++ }
        }

        # Hassasiyet Etiketi Kullanim Ayristirma (Admin Get-* sorgularini haric tut)
        if ($op -notlike 'Get-*' -and $op -match '^(SensitivityLabelApplied|SensitivityLabelUpdated|SensitivityLabelRemoved|FileSensitivityLabelChanged|MipLabel|LabelApplied|LabelChanged|LabelRemoved|LabelDowngraded)$') {
            $rawLblId = ''
            if ($payload.PSObject.Properties['SensitivityLabelEventData'] -and $payload.SensitivityLabelEventData) {
                $rawLblId = [string]$payload.SensitivityLabelEventData.SensitivityLabelId
            }
            if (-not $rawLblId -and $payload.PSObject.Properties['SensitivityLabelId']) { $rawLblId = [string]$payload.SensitivityLabelId }
            if (-not $rawLblId -and $payload.PSObject.Properties['LabelId'])            { $rawLblId = [string]$payload.LabelId }
            if (-not $rawLblId -and $payload.PSObject.Properties['Label'])              { $rawLblId = [string]$payload.Label }

            $lblName = 'Genel / Bilinmeyen Etiket'
            if ($rawLblId) {
                $kId = $rawLblId.Trim().ToLowerInvariant()
                $lblName = if ($labelLookup.ContainsKey($kId)) { $labelLookup[$kId] } else { $rawLblId }
            }

            if (-not $labelUsageByName.ContainsKey($lblName)) {
                $labelUsageByName[$lblName] = @{ Applied = 0; Changed = 0; Removed = 0; Total = 0 }
            }

            if ($op -match 'Removed') {
                $labelRemovedCount++
                $labelUsageByName[$lblName].Removed++
            }
            elseif ($op -match 'Updated|Changed|Downgraded') {
                $labelChangedCount++
                $labelUsageByName[$lblName].Changed++
            }
            else {
                $labelAppliedCount++
                $labelUsageByName[$lblName].Applied++
            }
            $labelUsageByName[$lblName].Total++

            if ($payload.PSObject.Properties['ActionSource'] -and "$($payload.ActionSource)" -match 'Auto|Default|Recommended') {
                $labelAutoCount++
            }

            if (-not $labelUsageByWorkload.Contains($wl)) { $labelUsageByWorkload[$wl] = 0 }
            $labelUsageByWorkload[$wl] = [int]$labelUsageByWorkload[$wl] + 1

            $uKey = if ($actor) { $actor } else { 'Sistem / Otomatik' }
            if (-not $labelUsageByUser.ContainsKey($uKey)) {
                $labelUsageByUser[$uKey] = @{ Applied = 0; Changed = 0; Removed = 0; Total = 0; Workload = $wl }
            }
            if ($op -match 'Removed') { $labelUsageByUser[$uKey].Removed++ }
            elseif ($op -match 'Updated|Changed|Downgraded') { $labelUsageByUser[$uKey].Changed++ }
            else { $labelUsageByUser[$uKey].Applied++ }
            $labelUsageByUser[$uKey].Total++
        }
    }

    # DLP Derin Analiz (Politika, Kural, SIT, Kullanici, Override, Is Yuku)
    $dlpHigh          = 0
    $dlpBlockedCount  = 0
    $dlpOverrideCount = 0
    $dlpNotifyCount   = 0
    $dlpAuditCount    = 0
    $dlpPolicyHits    = @{}
    $dlpRuleHits      = @{}
    $dlpSitHits       = @{}
    $dlpUserStats     = @{}
    $dlpWorkloadHits  = [ordered]@{}

    foreach ($ev in $allDlpRecords) {
        if (-not $ev) { continue }
        $pName = 'Genel DLP Politikası'
        $rName = 'Varsayılan Kural'
        $sev   = if ($ev.PSObject.Properties['Severity'] -and $ev.Severity) { [string]$ev.Severity } else { 'Medium' }
        $act   = 'Audit'
        $isOverride = $false
        $justText   = ''

        if ($ev.PSObject.Properties['ExceptionInfo'] -and -not [string]::IsNullOrWhiteSpace([string]$ev.ExceptionInfo)) {
            $isOverride = $true
            $justText   = [string]$ev.ExceptionInfo
        }
        if ($ev.PSObject.Properties['EndpointMetaData'] -and $ev.EndpointMetaData) {
            if ($ev.EndpointMetaData.Justification) {
                $isOverride = $true
                $justText   = [string]$ev.EndpointMetaData.Justification
            }
            if ($ev.EndpointMetaData.EnforcementMode -eq 'Block' -and -not $isOverride) {
                $act = 'Block'
            }
        }

        $sitsInEvent = New-Object System.Collections.ArrayList

        if ($ev.PSObject.Properties['PolicyDetails'] -and $ev.PolicyDetails) {
            $pd = @($ev.PolicyDetails)[0]
            if ($pd.PolicyName) { $pName = [string]$pd.PolicyName }
            if ($pd.PSObject.Properties['Rules'] -and $pd.Rules) {
                $rl = @($pd.Rules)[0]
                if ($rl.RuleName) { $rName = [string]$rl.RuleName }
                if ($rl.Severity) { $sev   = [string]$rl.Severity }
                if ($rl.PSObject.Properties['OverriddenActions'] -and @($rl.OverriddenActions).Count -gt 0) {
                    $isOverride = $true
                }
                $rawActs = (@($rl.Actions) -join ' ')
                if ($isOverride) { $act = 'Override' }
                elseif ($rawActs -match 'Block|Restrict|Reject|Quarantine') { $act = 'Block' }
                elseif ($rawActs -match 'Notify|Warn') { $act = 'Notify' }

                if ($rl.PSObject.Properties['ConditionsMatched'] -and $rl.ConditionsMatched -and $rl.ConditionsMatched.SensitiveInformation) {
                    foreach ($si in @($rl.ConditionsMatched.SensitiveInformation)) {
                        $sName = if ($si.SensitiveInfoTypeName) { [string]$si.SensitiveInfoTypeName }
                                 elseif ($si.SensitiveInformationTypeName) { [string]$si.SensitiveInformationTypeName }
                                 else { 'Hassas Veri (SIT)' }
                        $sCnt  = if ($si.Count) { [int]$si.Count } else { 1 }
                        [void]$sitsInEvent.Add([pscustomobject]@{ Name = $sName; Count = $sCnt })
                    }
                }
            }
        }
        elseif ($ev.PSObject.Properties['PolicyName'] -and $ev.PolicyName) {
            $pName = [string]$ev.PolicyName
        }

        if ($sitsInEvent.Count -eq 0 -and $ev.PSObject.Properties['SensitiveInfoTypeData'] -and $ev.SensitiveInfoTypeData) {
            foreach ($si in @($ev.SensitiveInfoTypeData)) {
                $sName = if ($si.SensitiveInfoTypeName) { [string]$si.SensitiveInfoTypeName } else { 'Hassas Veri (SIT)' }
                $sCnt  = if ($si.Count) { [int]$si.Count } else { 1 }
                [void]$sitsInEvent.Add([pscustomobject]@{ Name = $sName; Count = $sCnt })
            }
        }

        if ($isOverride) { $act = 'Override'; $dlpOverrideCount++ }
        elseif ($act -eq 'Block') { $dlpBlockedCount++ }
        elseif ($act -eq 'Notify') { $dlpNotifyCount++ }
        else { $dlpAuditCount++ }

        $isHigh = ($sev -match 'High')
        if ($isHigh) { $dlpHigh++ }

        if (-not $dlpPolicyHits.ContainsKey($pName)) { $dlpPolicyHits[$pName] = 0 }
        $dlpPolicyHits[$pName] = [int]$dlpPolicyHits[$pName] + 1

        $ruleKey = "$pName|$rName"
        if (-not $dlpRuleHits.ContainsKey($ruleKey)) {
            $dlpRuleHits[$ruleKey] = @{ Policy = $pName; Rule = $rName; Severity = $sev; Action = $act; Count = 0; Overrides = 0 }
        }
        $dlpRuleHits[$ruleKey].Count++
        if ($isOverride) { $dlpRuleHits[$ruleKey].Overrides++ }

        $evSitInstances = 0
        foreach ($sItem in $sitsInEvent) {
            if (-not $dlpSitHits.ContainsKey($sItem.Name)) {
                $dlpSitHits[$sItem.Name] = @{ Events = 0; Instances = 0 }
            }
            $dlpSitHits[$sItem.Name].Events++
            $dlpSitHits[$sItem.Name].Instances += [int]$sItem.Count
            $evSitInstances += [int]$sItem.Count
        }

        $rawWl = if ($ev.PSObject.Properties['Workload'] -and $ev.Workload) { [string]$ev.Workload } else { 'Exchange' }
        $wl = ConvertTo-NormalizedWorkload $rawWl
        if (-not $dlpWorkloadHits.Contains($wl)) { $dlpWorkloadHits[$wl] = 0 }
        $dlpWorkloadHits[$wl] = [int]$dlpWorkloadHits[$wl] + 1

        switch -Regex ("$wl $pName $rName") {
            'Copilot|AI'              { $egressCounts['Üretken Yapay Zekâ / Copilot & AI Siteleri']++; break }
            'Exchange'                { $egressCounts['Harici E-posta (Exchange DLP)']++; break }
            'SharePoint|OneDrive'     { $egressCounts['SharePoint / OneDrive Dış & Anonim Paylaşım']++; break }
            'Endpoint'                { $egressCounts['3. Taraf Bulut / Web Yükleme (Cloud Egress)']++; break }
        }

        $uId = if ($ev.PSObject.Properties['UserId'] -and $ev.UserId) { [string]$ev.UserId }
               elseif ($ev.PSObject.Properties['ExchangeMetaData'] -and $ev.ExchangeMetaData -and $ev.ExchangeMetaData.From) { [string]$ev.ExchangeMetaData.From }
               elseif ($ev.PSObject.Properties['SharePointMetaData'] -and $ev.SharePointMetaData -and $ev.SharePointMetaData.FileOwner) { [string]$ev.SharePointMetaData.FileOwner }
               else { 'bilinmeyen@kurum.local' }

        if (-not $dlpUserStats.ContainsKey($uId)) {
            $dlpUserStats[$uId] = @{
                TotalHits     = 0
                HighHits      = 0
                Overrides     = 0
                Blocked       = 0
                SitInstances  = 0
                Workloads     = New-Object System.Collections.ArrayList
                Justification = ''
            }
        }
        $dlpUserStats[$uId].TotalHits++
        if ($isHigh)            { $dlpUserStats[$uId].HighHits++ }
        if ($isOverride)        { $dlpUserStats[$uId].Overrides++ }
        if ($act -eq 'Block')   { $dlpUserStats[$uId].Blocked++ }
        $dlpUserStats[$uId].SitInstances += $evSitInstances
        if ($dlpUserStats[$uId].Workloads -notcontains $wl) { [void]$dlpUserStats[$uId].Workloads.Add($wl) }
        if ($justText -and -not $dlpUserStats[$uId].Justification) { $dlpUserStats[$uId].Justification = $justText }
    }

    $topDlpPolicies = @($dlpPolicyHits.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 8 |
        ForEach-Object { [pscustomobject]@{ Politika = $_.Key; Adet = $_.Value } })

    $topDlpRules = @($dlpRuleHits.GetEnumerator() | Sort-Object { $_.Value.Count } -Descending | Select-Object -First 8 |
        ForEach-Object {
            [pscustomobject]@{
                Politika  = $_.Value.Policy
                Kural     = $_.Value.Rule
                Siddet    = $_.Value.Severity
                Aksiyon   = $_.Value.Action
                Adet      = $_.Value.Count
                Override  = $_.Value.Overrides
            }
        })

    $topDlpSits = @($dlpSitHits.GetEnumerator() | Sort-Object { $_.Value.Instances } -Descending | Select-Object -First 8 |
        ForEach-Object {
            [pscustomobject]@{
                HassasBilgiTuru = $_.Key
                OlaySayisi      = $_.Value.Events
                OrnekSayisi     = $_.Value.Instances
            }
        })

    $topDlpUsers = @($dlpUserStats.GetEnumerator() | Sort-Object { $_.Value.TotalHits } -Descending | Select-Object -First 8 |
        ForEach-Object {
            [pscustomobject]@{
                Kullanici    = $_.Key
                ToplamOlay   = $_.Value.TotalHits
                YuksekSiddet = $_.Value.HighHits
                Engellenen   = $_.Value.Blocked
                Override     = $_.Value.Overrides
                HassasOrnek  = $_.Value.SitInstances
                IsYukleri    = ($_.Value.Workloads -join ', ')
                Gerekce      = $_.Value.Justification
            }
        })

    $topLabelUsage = @($labelUsageByName.GetEnumerator() | Sort-Object { $_.Value.Total } -Descending | Select-Object -First 8 |
        ForEach-Object {
            [pscustomobject]@{
                Etiket   = $_.Key
                Uygulama = $_.Value.Applied
                Degisim  = $_.Value.Changed
                Silme    = $_.Value.Removed
                Toplam   = $_.Value.Total
            }
        })

    $topLabelUsers = @($labelUsageByUser.GetEnumerator() | Sort-Object { $_.Value.Total } -Descending | Select-Object -First 8 |
        ForEach-Object {
            [pscustomobject]@{
                Kullanici = $_.Key
                Uygulama  = $_.Value.Applied
                Degisim   = $_.Value.Changed
                Silme     = $_.Value.Removed
                Toplam    = $_.Value.Total
                IsYuku    = $_.Value.Workload
            }
        })

    $topAuditOperations = @($auditByOperation.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 8 |
        ForEach-Object { [pscustomobject]@{ Operasyon = $_.Key; Adet = $_.Value } })

    $topAuditActors = @($auditByActor.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 6 |
        ForEach-Object { [pscustomobject]@{ Kullanici = $_.Key; Adet = $_.Value } })

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

    $egressList = @($egressCounts.GetEnumerator() | ForEach-Object {
        [pscustomobject]@{ Kanal = $_.Key; Adet = $_.Value }
    })

    # 10 Maddelik Deterministik CISO Guvenlik Durusu ve Yapilandirma Hijyeni Matrisi
    $postureChecks = New-Object System.Collections.ArrayList

    # 1. DLP-01: Politika Zorlama (Enforce) Durumu
    $dlp01St = if ($dlpPolicies.Count -eq 0) { 'Fail' } elseif ($dlpTest -eq 0) { 'Pass' } else { 'Warn' }
    $dlp01Dt = if ($dlpPolicies.Count -eq 0) { 'Hic DLP politikasi tanimli degil' }
               elseif ($dlpTest -eq 0) { "Tum DLP politikalari ($dlpEnforce/$($dlpPolicies.Count)) Enforce kipinde" }
               else { "$dlpEnforce Enforce, $dlpTest politika halen Test/Simulasyon kipinde" }
    [void]$postureChecks.Add([pscustomobject]@{ Code = 'DLP-01'; Title = 'DLP Politika Zorlama (Enforce) Duruşu'; Status = $dlp01St; Detail = $dlp01Dt })

    # 2. DLP-02: Is Yuku Kapsam Tamligi
    $hasEx = $workloadCounts.Contains('Exchange')
    $hasSp = ($workloadCounts.Contains('SharePoint') -or $workloadCounts.Contains('OneDrive') -or $workloadCounts.Contains('Microsoft 365'))
    $hasTm = ($workloadCounts.Contains('Teams') -or $workloadCounts.Contains('Microsoft 365'))
    $hasEp = $workloadCounts.Contains('Endpoint')
    $covCnt = @($hasEx, $hasSp, $hasTm, $hasEp | Where-Object { $_ }).Count
    $dlp02St = if ($covCnt -eq 4) { 'Pass' } elseif ($covCnt -ge 2) { 'Warn' } else { 'Fail' }
    [void]$postureChecks.Add([pscustomobject]@{ Code = 'DLP-02'; Title = 'Kritik İş Yükü Kapsamı (Exchange, SharePoint, Teams, Endpoint)'; Status = $dlp02St; Detail = "$covCnt / 4 ana is yuku katmani DLP kapsami altinda" })

    # 3. DLP-03: Kullanici Ezme (Override) Denetimi
    $dlp03St = if ($dlpOverrideCount -eq 0) { 'Pass' } elseif ($dlpOverrideCount -le 5) { 'Warn' } else { 'Fail' }
    [void]$postureChecks.Add([pscustomobject]@{ Code = 'DLP-03'; Title = 'DLP Kullanıcı Override ve Gerekçe Hijyeni'; Status = $dlp03St; Detail = "$dlpOverrideCount kullanici override islemi ($dlpBlockedCount dogrudan engelleme)" })

    # 4. MIP-01: Zorunlu Etiketleme (isMandatory)
    $isMand = if ($labelPolicySet) { [bool]$labelPolicySet.isMandatory }
              elseif ($labelPolicies.Count -gt 0) { (@($labelPolicies | Where-Object { $_.mandatory }).Count -gt 0) }
              else { $false }
    $mip01St = if ($isMand) { 'Pass' } else { 'Warn' }
    $mip01Dt = if ($isMand) { 'Zorunlu etiketleme (isMandatory: true) etkin' } else { 'Zorunlu etiketleme kapali (isMandatory: false); etiketsiz belge kaydedilebilir' }
    [void]$postureChecks.Add([pscustomobject]@{ Code = 'MIP-01'; Title = 'Zorunlu Hassasiyet Etiketlemesi (Mandatory Labeling)'; Status = $mip01St; Detail = $mip01Dt })

    # 5. MIP-02: Etiket Dusurme Gerekcesi (isDowngradeJustificationRequired)
    $isDownReq = if ($labelPolicySet) { [bool]$labelPolicySet.isDowngradeJustificationRequired }
                 elseif ($labelPolicies.Count -gt 0) { (@($labelPolicies | Where-Object { $_.requireDowngradeJustification }).Count -gt 0) }
                 else { $false }
    $mip02St = if ($isDownReq) { 'Pass' } else { 'Fail' }
    $mip02Dt = if ($isDownReq) { 'Etiket dusurme gerekcesi zorunlulugu (true) etkin' } else { 'Etiket dusurme gerekcesi zorunlu degil (sızıntı riski)' }
    [void]$postureChecks.Add([pscustomobject]@{ Code = 'MIP-02'; Title = 'Etiket Seviyesi Düşürme Gerekçesi (Downgrade Justification)'; Status = $mip02St; Detail = $mip02Dt })

    # 6. MIP-03: Varsayilan Etiket (defaultLabelId)
    $defLbl = if ($labelPolicySet -and $labelPolicySet.defaultLabelId) { [string]$labelPolicySet.defaultLabelId } else { '' }
    $mip03St = if (-not [string]::IsNullOrWhiteSpace($defLbl)) { 'Pass' } else { 'Warn' }
    $mip03Dt = if (-not [string]::IsNullOrWhiteSpace($defLbl)) { "Varsayilan etiket tanimli ($defLbl)" } else { 'Varsayilan belge/e-posta etiketi (defaultLabelId) tanimsiz' }
    [void]$postureChecks.Add([pscustomobject]@{ Code = 'MIP-03'; Title = 'Varsayılan Hassasiyet Etiketi (Default Label)'; Status = $mip03St; Detail = $mip03Dt })

    # 7. MIP-04: Gizli Etiketlerde Kriptografik Sifreleme (hasProtection)
    $highLabels = @($labels | Where-Object { $_.isActive -and $_.priority -ge 5 })
    $unencHigh  = @($highLabels | Where-Object { -not $_.encryptionEnabled })
    $mip04St = if ($highLabels.Count -eq 0) { 'Warn' } elseif ($unencHigh.Count -eq 0) { 'Pass' } else { 'Warn' }
    $unencNames = ($unencHigh | ForEach-Object { $_.displayName }) -join ', '
    $mip04Dt = if ($highLabels.Count -eq 0) { 'Oncelik >= 5 olan aktif etiket bulunamadi' }
               elseif ($unencHigh.Count -eq 0) { "$($highLabels.Count) gizli/kritik etiketin tamaminda RMS sifreleme etkin" }
               else { "$($unencHigh.Count) gizli etikette sifreleme kapali: $unencNames" }
    [void]$postureChecks.Add([pscustomobject]@{ Code = 'MIP-04'; Title = 'Gizli ve Kritik Etiketlerde Şifreleme (hasProtection)'; Status = $mip04St; Detail = $mip04Dt })

    # 8. MIP-05: SharePoint Site & Teams Kapsayici (site, unifiedgroup) Kapsami
    $siteLabels = @($labels | Where-Object { $_.isActive -and "$($_.contentType)" -match 'site|unifiedgroup' })
    $mip05St = if ($siteLabels.Count -ge 2) { 'Pass' } elseif ($siteLabels.Count -eq 1) { 'Warn' } else { 'Fail' }
    $siteNames = ($siteLabels | ForEach-Object { $_.displayName }) -join ', '
    $mip05Dt = if ($siteLabels.Count -gt 0) { "$($siteLabels.Count) aktif etikette SharePoint Site / M365 Grup kapsami acik ($siteNames)" }
               else { 'Hicbir aktif etikette SharePoint Site / Teams kapsayici korumasi acik degil' }
    [void]$postureChecks.Add([pscustomobject]@{ Code = 'MIP-05'; Title = 'SharePoint Site ve Teams Kapsayıcı Etiketleme Kapsamı'; Status = $mip05St; Detail = $mip05Dt })

    # 9. DLM-01: Veri Yasam Dongusu ve Saklama (Retention)
    $dlm01St = if ($retPolCount -gt 0 -or $retLblCount -gt 0) { 'Pass' } else { 'Fail' }
    $dlm01Dt = if ($retPolCount -gt 0 -or $retLblCount -gt 0) { "$retPolCount saklama politikasi, $retLblCount kayit etiketi aktif" }
               else { '0 aktif saklama (Retention) politikasi — KVKK/GDPR veri minimizasyonu acigi' }
    [void]$postureChecks.Add([pscustomobject]@{ Code = 'DLM-01'; Title = 'Veri Yaşam Döngüsü ve Saklama Politikası (Data Lifecycle)'; Status = $dlm01St; Detail = $dlm01Dt })

    # 10. IRM-01: Ic Tehdit (Insider Risk) ve Iletisim Uyumu
    $irm01St = if ($irPolCount -gt 0 -and $commPolCount -gt 0) { 'Pass' } elseif ($irPolCount -gt 0 -or $commPolCount -gt 0) { 'Warn' } else { 'Fail' }
    [void]$postureChecks.Add([pscustomobject]@{ Code = 'IRM-01'; Title = 'İç Tehdit (Insider Risk) ve İletişim Uyumu Kapsamı'; Status = $irm01St; Detail = "$irPolCount Ic Tehdit politikasi, $commPolCount Iletisim Uyumu politikasi aktif" })

    $posturePassCnt = @($postureChecks | Where-Object { $_.Status -eq 'Pass' }).Count
    $postureWarnCnt = @($postureChecks | Where-Object { $_.Status -eq 'Warn' }).Count
    $postureFailCnt = @($postureChecks | Where-Object { $_.Status -eq 'Fail' }).Count

    # Otomatik yonetim onerileri
    $recs = New-Object System.Collections.ArrayList
    $testLimit = if ($th -and $th.PSObject.Properties['TestModeDlpPolicies']) { [int]$th.TestModeDlpPolicies } else { 1 }
    if ($dlpTest -ge $testLimit -and $dlpTest -gt 0) {
        [void]$recs.Add("Test kipindeki $dlpTest DLP politikasini yanlis pozitif dogrulamasi sonrasi Enforce kipine gecirin.")
    }
    if (-not $isMand) {
        [void]$recs.Add('Etiket politikasinda Zorunlu Etiketleme (isMandatory: true) ve Varsayilan Etiket (defaultLabelId) ayarlarini etkinlestirin.')
    }
    if ($unencHigh.Count -gt 0) {
        [void]$recs.Add("Gizli seviyede olmasina ragmen sifrelemesi kapali olan etiketlerde ($unencNames) RMS sifrelemesini etkinlestirin veya devre disi birakin.")
    }
    if ($siteLabels.Count -le 1) {
        [void]$recs.Add('Confidential, Highly Confidential ve RECETE etiketlerinde SharePoint Sitesi ve Teams (site, unifiedgroup) kapsayici kapsamini acin.')
    }
    if ($dlpOverrideCount -gt 0) {
        [void]$recs.Add("Donem icinde kullanicilar tarafindan $dlpOverrideCount kez DLP kurali gerekce girilerek asilmistir (Override); gerekce metinlerini denetleyin.")
    }
    if ($labelRemovedCount -gt 0 -or $labelChangedCount -gt 0) {
        [void]$recs.Add("$labelChangedCount etiket degisimi/dusurmesi ve $labelRemovedCount etiket kaldirma islemi kaydedilmistir; kritik verilerde etiket dusurme gerekcelerini inceleyin.")
    }
    if ($retPolCount -eq 0 -and $snap) {
        [void]$recs.Add('Aktif Veri Saklama (Retention) politikasi bulunmuyor; kritik M365 is yukleri icin yasam dongusu politikasi tanimlayin.')
    }
    if ($sources -and $sources['DlpActivity'] -and $sources['DlpActivity'].Status -eq 'PermissionMissing') {
        [void]$recs.Add('Canli DLP.All olay akisi icin Office 365 Management API uzerinde ActivityFeed.ReadDlp uygulama iznine yonetici onayi verin.')
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
        DlpRuleTotal              = $dlpRules.Count
        DlpPolicies               = @($dlpPolicies)
        DlpRules                  = @($dlpRules)
        DlpWorkloadScope          = $workloadCounts

        SensitivityLabels         = @($labels)
        SensitivityLabelCount     = $labelCount
        SensitivityLabelActive    = $labelActiveCnt
        SensitivityLabelPolicies  = $labelPolCount
        SensitivityLabelPolicyList= @($labelPolicies)
        AutoLabelPolicies         = $autoLblPolCount
        LabelEventsTotal          = ($labelAppliedCount + $labelChangedCount + $labelRemovedCount)
        LabelAppliedCount         = $labelAppliedCount
        LabelChangedCount         = $labelChangedCount
        LabelRemovedCount         = $labelRemovedCount
        LabelAutoCount            = $labelAutoCount
        TopLabelUsage             = $topLabelUsage
        TopLabelUsers             = $topLabelUsers
        LabelWorkloadHits         = $labelUsageByWorkload

        RetentionPolicies         = $retPolCount
        RetentionLabels           = $retLblCount
        InsiderRiskPolicies       = $irPolCount
        CommCompliancePolicies    = $commPolCount
        SnapshotCollectedAt       = $snapCollectedAt

        DlpEventsTotal            = $allDlpRecords.Count
        DlpEventsHigh             = $dlpHigh
        DlpBlockedCount           = $dlpBlockedCount
        DlpOverrideCount          = $dlpOverrideCount
        DlpNotifyCount            = $dlpNotifyCount
        DlpAuditCount             = $dlpAuditCount
        TopDlpPolicies            = $topDlpPolicies
        TopDlpRules               = $topDlpRules
        TopDlpSits                = $topDlpSits
        TopDlpUsers               = $topDlpUsers
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
        AuditWorkloadBreakdown    = $auditByWorkload
        TopAuditOperations        = $topAuditOperations
        TopAuditActors            = $topAuditActors
        GovernanceDriftCount      = $governanceDriftCount
        EgressChannels            = $egressList

        PostureChecks             = @($postureChecks.ToArray())
        PosturePassCount          = $posturePassCnt
        PostureWarnCount          = $postureWarnCnt
        PostureFailCount          = $postureFailCnt
        PostureTotalCount         = $postureChecks.Count
        LabelPolicyMandatory      = $isMand
        LabelPolicyDowngradeReq   = $isDownReq

        EDiscoveryCasesTotal      = $cases.Count
        EDiscoveryCasesOpen       = @($cases | Where-Object { $_.status -eq 'active' }).Count

        SourceStatuses            = $sourceList
        Recommendations           = @($recs)
    }

    return [pscustomobject]$k
}

# ------------------------------------------- Kurumsal Ornek Veri Uretici ----
function New-PurviewSampleData {
    param(
        [datetime]$Start,
        [datetime]$End,
        [ValidateSet('Weekly', 'Monthly')][string]$Mode = 'Monthly'
    )

    $labels = @(
        [pscustomobject]@{ id = 'defa4170-0d19-0005-0000-bc88714345d2'; name = 'Personal'; displayName = 'Personal'; parentName = ''; priority = 0; encryptionEnabled = $false; markingEnabled = $false; contentType = 'File, Email'; tooltip = 'Kişisel hassas olmayan içerik'; isActive = $true }
        [pscustomobject]@{ id = 'defa4170-0d19-0005-0001-bc88714345d2'; name = 'Public'; displayName = 'Public'; parentName = ''; priority = 1; encryptionEnabled = $false; markingEnabled = $false; contentType = 'File, Email, Site'; tooltip = 'Kamuya açık kurumsal yayınlar'; isActive = $true }
        [pscustomobject]@{ id = 'defa4170-0d19-0005-0004-bc88714345d2'; name = 'All Employees (unrestricted)'; displayName = 'General / All Employees'; parentName = 'General'; priority = 2; encryptionEnabled = $false; markingEnabled = $false; contentType = 'File, Email, Site'; tooltip = 'Tüm kurum çalışanlarına açık genel veri'; isActive = $true }
        [pscustomobject]@{ id = 'defa4170-0d19-0005-0007-bc88714345d2'; name = 'All Employees'; displayName = 'Confidential / All Employees'; parentName = 'Confidential'; priority = 5; encryptionEnabled = $true; markingEnabled = $true; contentType = 'File, Email, Site'; tooltip = 'Kurum içi gizli veri (şifreli ve filigranlı)'; isActive = $true }
        [pscustomobject]@{ id = 'defa4170-0d19-0005-0008-bc88714345d2'; name = 'Trusted People'; displayName = 'Confidential / Trusted People'; parentName = 'Confidential'; priority = 6; encryptionEnabled = $true; markingEnabled = $true; contentType = 'File, Email'; tooltip = 'Yalnızca yetkilendirilmiş iş ortakları'; isActive = $true }
        [pscustomobject]@{ id = 'defa4170-0d19-0005-000a-bc88714345d2'; name = 'All Employees'; displayName = 'Highly Confidential / All Employees'; parentName = 'Highly Confidential'; priority = 9; encryptionEnabled = $true; markingEnabled = $true; contentType = 'File, Email'; tooltip = 'Yüksek gizlilikli kurumsal sır'; isActive = $true }
        [pscustomobject]@{ id = 'defa4170-0d19-0005-000b-bc88714345d2'; name = 'Specific People'; displayName = 'Highly Confidential / Specific People'; parentName = 'Highly Confidential'; priority = 10; encryptionEnabled = $true; markingEnabled = $true; contentType = 'File, Email'; tooltip = 'Yalnızca adlandırılmış kişilere özel şifreleme'; isActive = $true }
        [pscustomobject]@{ id = '78b75aa9-787a-4ae4-b151-de2310a6217f'; name = 'RECETE'; displayName = 'RECETE (Kritik Veri)'; parentName = ''; priority = 12; encryptionEnabled = $true; markingEnabled = $true; contentType = 'File, Email, Endpoint'; tooltip = 'Bu etiket, kritik veriler için kullanılır. Etiketten çıkış audit edilir ve incelenir.'; isActive = $true }
    )

    $dlpPolicies = @(
        [pscustomobject]@{ id = '8b31ebde-0fb5-41f3-bd28-ec4375c9863f'; name = 'Default policy for Teams'; workloadScope = @('Teams'); mode = 'Enforce'; ruleCount = 2; sensitiveInfoTypes = @('Credit Card Number', 'TR IBAN'); lastModifiedAt = '2026-06-12T21:59:18Z' }
        [pscustomobject]@{ id = '77a1b880-5169-41bf-95fe-7ceac35ca21a'; name = 'TC Onay (KVKK & PII Koruması)'; workloadScope = @('Exchange', 'SharePoint', 'OneDrive'); mode = 'Enforce'; ruleCount = 3; sensitiveInfoTypes = @('Turkey National Identification Number (TCKN)', 'TR IBAN', 'Credit Card Number'); lastModifiedAt = '2026-08-15T12:08:33Z' }
        [pscustomobject]@{ id = 'dde1a4f1-c6da-42dc-ac45-20c5f626a2bd'; name = 'DSPM for AI - Protect sensitive data from Copilot processing'; workloadScope = @('Microsoft 365', 'Copilot / AI'); mode = 'TestWithoutNotifications'; ruleCount = 2; sensitiveInfoTypes = @('RECETE / Sağlık Verisi', 'Kaynak Kod & API Anahtarı'); lastModifiedAt = '2026-10-02T08:08:39Z' }
        [pscustomobject]@{ id = '5feefd82-d793-41b6-8690-a2fe58f823eb'; name = 'DSPM for AI: Detect sensitive info added to AI sites'; workloadScope = @('Endpoint'); mode = 'Enforce'; ruleCount = 2; sensitiveInfoTypes = @('Turkey National Identification Number (TCKN)', 'Kaynak Kod & API Anahtarı', 'Credit Card Number'); lastModifiedAt = '2026-10-02T08:12:05Z' }
    )

    $mult = if ($Mode -eq 'Weekly') { 1 } else { 3 }
    $dlpEvents = New-Object System.Collections.ArrayList

    $dlpTemplates = @(
        @{ Pol = 'TC Onay (KVKK & PII Koruması)'; Rule = 'Dış E-postada Toplu TCKN ve IBAN Engelleme'; Sev = 'High'; Act = @('BlockAccess', 'NotifyUser'); Override = @();Wl = 'Exchange'; User = 'finans.operasyon@contoso.com'; Sit = 'Turkey National Identification Number (TCKN)'; SitCnt = 18; Count = (4 * $mult); Just = '' }
        @{ Pol = 'TC Onay (KVKK & PII Koruması)'; Rule = 'SharePoint Dış Paylaşımda Kredi Kartı & TCKN'; Sev = 'High'; Act = @('BlockAccess', 'NotifyUser'); Override = @('BlockAccess'); Wl = 'SharePoint'; User = 'ik.bordro@contoso.com'; Sit = 'Turkey National Identification Number (TCKN)'; SitCnt = 25; Count = (3 * $mult); Just = 'Yıllık bağımsız denetim firması aktarımı (Onay #4412)' }
        @{ Pol = 'DSPM for AI: Detect sensitive info added to AI sites'; Rule = 'Harici Üretken Yapay Zekâ Sitelerine Veri Yükleme Engeli'; Sev = 'High'; Act = @('BlockAccess'); Override = @(); Wl = 'Endpoint'; User = 'arge.analist@contoso.com'; Sit = 'Kaynak Kod & API Anahtarı'; SitCnt = 6; Count = (3 * $mult); Just = '' }
        @{ Pol = 'Default policy for Teams'; Rule = 'Teams Dış Sohbette Kredi Kartı / IBAN Paylaşımı'; Sev = 'Medium'; Act = @('BlockAccess', 'NotifyUser'); Override = @(); Wl = 'MicrosoftTeams'; User = 'satis.destek@contoso.com'; Sit = 'Credit Card Number'; SitCnt = 4; Count = (2 * $mult); Just = '' }
        @{ Pol = 'TC Onay (KVKK & PII Koruması)'; Rule = 'OneDrive Harici Bağlantıda Finansal IBAN Tespiti'; Sev = 'Medium'; Act = @('NotifyUser'); Override = @('BlockAccess'); Wl = 'OneDrive'; User = 'tedarik.uzmani@contoso.com'; Sit = 'TR IBAN'; SitCnt = 9; Count = (2 * $mult); Just = 'Tedarikçi mutabakat dosyası' }
        @{ Pol = 'DSPM for AI - Protect sensitive data from Copilot processing'; Rule = 'Copilot İstemi İçinde RECETE / Kritik Veri Denetimi'; Sev = 'Medium'; Act = @('Audit'); Override = @(); Wl = 'Copilot / AI'; User = 'klinik.koordinator@contoso.com'; Sit = 'RECETE / Sağlık Verisi'; SitCnt = 5; Count = (2 * $mult); Just = '' }
    )

    foreach ($t in $dlpTemplates) {
        for ($i = 1; $i -le $t.Count; $i++) {
            [void]$dlpEvents.Add([pscustomobject]@{
                Id            = [guid]::NewGuid().ToString()
                Workload      = $t.Wl
                UserId        = $t.User
                Severity      = $t.Sev
                ExceptionInfo = $t.Just
                PolicyDetails = @(
                    [pscustomobject]@{
                        PolicyName = $t.Pol
                        Rules      = @(
                            [pscustomobject]@{
                                RuleName          = $t.Rule
                                Severity          = $t.Sev
                                Actions           = $t.Act
                                OverriddenActions = $t.Override
                                ConditionsMatched = [pscustomobject]@{
                                    SensitiveInformation = @(
                                        [pscustomobject]@{
                                            SensitiveInfoTypeName = $t.Sit
                                            Count                 = $t.SitCnt
                                        }
                                    )
                                }
                            }
                        )
                    }
                )
            })
        }
    }

    $auditRecs = New-Object System.Collections.ArrayList
    $labelTemplates = @(
        @{ Lbl = '78b75aa9-787a-4ae4-b151-de2310a6217f'; Op = 'SensitivityLabelApplied'; Wl = 'SharePoint'; User = 'klinik.koordinator@contoso.com'; Src = 'Auto'; Cnt = (9 * $mult) }
        @{ Lbl = '78b75aa9-787a-4ae4-b151-de2310a6217f'; Op = 'SensitivityLabelUpdated'; Wl = 'Endpoint'; User = 'arge.analist@contoso.com'; Src = 'Manual'; Cnt = (2 * $mult) }
        @{ Lbl = 'defa4170-0d19-0005-0007-bc88714345d2'; Op = 'SensitivityLabelApplied'; Wl = 'SharePoint'; User = 'finans.operasyon@contoso.com'; Src = 'Manual'; Cnt = (14 * $mult) }
        @{ Lbl = 'defa4170-0d19-0005-0007-bc88714345d2'; Op = 'SensitivityLabelUpdated'; Wl = 'Exchange'; User = 'ik.bordro@contoso.com'; Src = 'Manual'; Cnt = (3 * $mult) }
        @{ Lbl = 'defa4170-0d19-0005-0004-bc88714345d2'; Op = 'SensitivityLabelApplied'; Wl = 'OneDrive'; User = 'satis.destek@contoso.com'; Src = 'Default'; Cnt = (18 * $mult) }
        @{ Lbl = 'defa4170-0d19-0005-000a-bc88714345d2'; Op = 'SensitivityLabelApplied'; Wl = 'Exchange'; User = 'hukuk.musavir@contoso.com'; Src = 'Manual'; Cnt = (6 * $mult) }
        @{ Lbl = 'defa4170-0d19-0005-000a-bc88714345d2'; Op = 'SensitivityLabelRemoved'; Wl = 'Endpoint'; User = 'tedarik.uzmani@contoso.com'; Src = 'Manual'; Cnt = (1 * $mult) }
        @{ Lbl = 'defa4170-0d19-0005-0001-bc88714345d2'; Op = 'SensitivityLabelApplied'; Wl = 'SharePoint'; User = 'kurumsal.iletisim@contoso.com'; Src = 'Manual'; Cnt = (7 * $mult) }
    )
    foreach ($lt in $labelTemplates) {
        for ($i = 1; $i -le $lt.Cnt; $i++) {
            [void]$auditRecs.Add([pscustomobject]@{
                Operation         = $lt.Op
                Workload          = $lt.Wl
                UserId            = $lt.User
                SensitivityLabelId= $lt.Lbl
                ActionSource      = $lt.Src
            })
        }
    }

    foreach ($eg in @(
        @{ Op = 'FileCopiedToRemovableMedia'; Wl = 'Endpoint'; User = 'arge.analist@contoso.com'; Cnt = (3 * $mult) }
        @{ Op = 'FileUploadedToCloud'; Wl = 'Endpoint'; User = 'satis.destek@contoso.com'; Cnt = (4 * $mult) }
        @{ Op = 'FilePrinted'; Wl = 'Endpoint'; User = 'ik.bordro@contoso.com'; Cnt = (2 * $mult) }
        @{ Op = 'AnonymousLinkCreated'; Wl = 'SharePoint'; User = 'tedarik.uzmani@contoso.com'; Cnt = (3 * $mult) }
        @{ Op = 'CopilotInteraction'; Wl = 'Copilot'; User = 'klinik.koordinator@contoso.com'; Cnt = (8 * $mult) }
        @{ Op = 'Set-DlpComplianceRule'; Wl = 'SecurityComplianceCenter'; User = 'secops.admin@contoso.com'; Cnt = 2 }
    )) {
        for ($i = 1; $i -le $eg.Cnt; $i++) {
            [void]$auditRecs.Add([pscustomobject]@{
                Operation = $eg.Op
                Workload  = $eg.Wl
                UserId    = $eg.User
            })
        }
    }

    $alerts = @(
        [pscustomobject]@{ id = 'a1'; title = 'DLP policy match: Multiple TCKN and IBAN records shared externally'; severity = 'high'; status = 'inProgress'; serviceSource = 'microsoftPurview'; category = 'DataLossPrevention'; createdDateTime = $End.AddDays(-2).ToString('o') }
        [pscustomobject]@{ id = 'a2'; title = 'Sensitivity label downgraded from RECETE (Kritik Veri) to General'; severity = 'high'; status = 'new'; serviceSource = 'microsoftPurview'; category = 'InformationProtection'; createdDateTime = $End.AddDays(-4).ToString('o') }
        [pscustomobject]@{ id = 'a3'; title = 'Endpoint DLP blocked sensitive source code paste to external AI site'; severity = 'medium'; status = 'resolved'; serviceSource = 'microsoftPurview'; category = 'DataLossPrevention'; createdDateTime = $End.AddDays(-6).ToString('o') }
        [pscustomobject]@{ id = 'a4'; title = 'Unusual volume of labeled file downloads from SharePoint Finance site'; severity = 'medium'; status = 'resolved'; serviceSource = 'microsoftPurview'; category = 'InsiderRiskManagement'; createdDateTime = $End.AddDays(-9).ToString('o') }
    )

    $incidents = @(
        [pscustomobject]@{ id = 'inc-101'; severity = 'high'; status = 'inProgress'; classification = 'truePositive'; createdDateTime = $End.AddDays(-2).ToString('o'); lastUpdateDateTime = $End.AddDays(-1).ToString('o') }
        [pscustomobject]@{ id = 'inc-102'; severity = 'high'; status = 'resolved'; classification = 'truePositive'; createdDateTime = $End.AddDays(-5).ToString('o'); lastUpdateDateTime = $End.AddDays(-5).AddHours(3.5).ToString('o') }
        [pscustomobject]@{ id = 'inc-103'; severity = 'medium'; status = 'resolved'; classification = 'benignPositive'; createdDateTime = $End.AddDays(-7).ToString('o'); lastUpdateDateTime = $End.AddDays(-7).AddHours(2.1).ToString('o') }
        [pscustomobject]@{ id = 'inc-104'; severity = 'low'; status = 'resolved'; classification = 'falsePositive'; createdDateTime = $End.AddDays(-11).ToString('o'); lastUpdateDateTime = $End.AddDays(-11).AddHours(1.4).ToString('o') }
    )

    $snap = [pscustomobject]@{
        collectedAt                 = (Get-Date).ToUniversalTime().ToString('o')
        dlpPolicies                 = $dlpPolicies
        dlpRules                    = @()
        sensitivityLabels           = $labels
        sensitivityLabelCount       = 13
        sensitivityLabelPolicyCount = 2
        labelPolicySettings         = [pscustomobject]@{
            isMandatory                      = $false
            isDowngradeJustificationRequired = $true
            defaultLabelId                   = ''
            moreInfoUrl                      = ''
        }
        autoLabelPolicyCount        = 2
        retentionPolicyCount        = 3
        retentionLabelCount         = 4
        insiderRiskPolicyCount      = 2
        commCompliancePolicyCount   = 2
    }

    $sources = [ordered]@{
        AlertsV2      = [pscustomobject]@{ Name = 'Graph Security Alerts v2'; Status = 'Available'; Detail = "$($alerts.Count) Purview uyarisi" }
        Incidents     = [pscustomobject]@{ Name = 'Graph Security Incidents'; Status = 'Available'; Detail = "$($incidents.Count) olay (top=50)" }
        DlpActivity   = [pscustomobject]@{ Name = 'O365 Activity API (DLP.All)'; Status = 'Available'; Detail = "$($dlpEvents.Count) DLP kural eslesmesi" }
        O365AuditFeed = [pscustomobject]@{ Name = 'O365 Activity API (Audit Akislari)'; Status = 'Available'; Detail = "$($auditRecs.Count) etiket ve uyum kaydi" }
        AuditLog      = [pscustomobject]@{ Name = 'Graph Audit Log Queries'; Status = 'Available'; Detail = "Birlesik denetim sorgusu tamamlandi" }
        EDiscovery    = [pscustomobject]@{ Name = 'Graph eDiscovery Cases'; Status = 'Available'; Detail = '2 aktif vaka' }
        Policies      = [pscustomobject]@{ Name = 'Purview Politika & Etiket Envanteri'; Status = 'Available'; Detail = 'IPPS + Graph Etiket API (13 etiket, 4 DLP pol.)' }
    }

    return [pscustomobject]@{
        AlertsAll       = $alerts
        Incidents       = $incidents
        DlpEvents       = @($dlpEvents.ToArray())
        AuditRecords    = @($auditRecs.ToArray())
        EDiscoveryCases = @(
            [pscustomobject]@{ id = 'case-1'; status = 'active' }
            [pscustomobject]@{ id = 'case-2'; status = 'active' }
        )
        PolicySnapshot  = $snap
        Sources         = $sources
        Start           = $Start
        End             = $End
        Mode            = $Mode
    }
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
