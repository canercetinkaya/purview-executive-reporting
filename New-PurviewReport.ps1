<#
.SYNOPSIS
    Purview Reporting - Microsoft Purview haftalik ve aylik yonetici raporu.

.DESCRIPTION
    Haftalik mod  : kisa yonetici ozeti, tek sayfa, gecen tam hafta (Pazartesi-Pazar).
    Aylik mod     : ayrintili 3 bolumlu rapor, trend karsilastirmali, gecen takvim ayi.

.EXAMPLE
    .\New-PurviewReport.ps1 -Mode Weekly -DryRun
    .\New-PurviewReport.ps1 -Mode Monthly -DryRun -Pdf
    .\New-PurviewReport.ps1 -Mode Monthly -Date 2026-11-15 -ExportCsv -DryRun
    .\New-PurviewReport.ps1 -Test
#>
[CmdletBinding()]
param(
    [ValidateSet('Weekly', 'Monthly')][string] $Mode = 'Monthly',
    [datetime] $Date,
    [string]   $ConfigPath,
    [string]   $PolicySnapshotPath,
    [switch]   $CollectIpps,
    [switch]   $DryRun,
    [switch]   $Test,
    [switch]   $ExportCsv,
    [switch]   $Pdf,
    [string]   $ProxyUrl
)

$ErrorActionPreference = 'Stop'
$script:Root = $PSScriptRoot
. (Join-Path $script:Root 'PurviewReport.Core.ps1')
. (Join-Path $script:Root 'PurviewReport.Html.ps1')

if (-not $ConfigPath) { $ConfigPath = Join-Path $script:Root 'customer.json' }
if (-not (Test-Path $ConfigPath)) {
    throw "Yapilandirma bulunamadi: $ConfigPath (once Install-PurviewReport.ps1 calistirin)"
}
$cfg = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json

if ($ProxyUrl) { [Net.WebRequest]::DefaultWebProxy = New-Object Net.WebProxy($ProxyUrl) }
elseif ($cfg.PSObject.Properties['ProxyUrl'] -and $cfg.ProxyUrl) {
    [Net.WebRequest]::DefaultWebProxy = New-Object Net.WebProxy($cfg.ProxyUrl)
}

foreach ($d in 'Output', 'Archive', 'Logs', 'Snapshots') {
    $p = Join-Path $script:Root $d
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}
$script:LogFile = Join-Path $script:Root ('Logs\{0}-{1}.log' -f $Mode.ToLower(), (Get-Date -Format 'yyyyMMdd-HHmmss'))

# --------------------------------------------------------------- donem ------
function Get-ReportPeriod {
    param([string]$ReportMode, [datetime]$Ref, [bool]$Explicit)
    if ($ReportMode -eq 'Weekly') {
        $dow = [int]$Ref.DayOfWeek
        if ($dow -eq 0) { $dow = 7 }
        $thisMon = $Ref.Date.AddDays(1 - $dow)
        $start = if ($Explicit) { $thisMon } else { $thisMon.AddDays(-7) }
        return @{ Start = $start; End = $start.AddDays(7) }
    }
    $first = (Get-Date -Year $Ref.Year -Month $Ref.Month -Day 1).Date
    $start = if ($Explicit) { $first } else { $first.AddMonths(-1) }
    return @{ Start = $start; End = $start.AddMonths(1) }
}

$explicit = $PSBoundParameters.ContainsKey('Date')
$ref      = if ($Date) { $Date } else { Get-Date }
$period   = Get-ReportPeriod -ReportMode $Mode -Ref $ref -Explicit $explicit
$start    = $period.Start
$end      = $period.End

Write-Log ('=== {0} | {1} Purview raporu | {2:dd.MM.yyyy} - {3:dd.MM.yyyy} ===' -f $cfg.CustomerName, $Mode, $start, $end.AddDays(-1))
Write-Log ('Tenant: {0} | Uygulama: {1} | Kimlik: {2} | Mail: {3}' -f `
    (Get-Masked $cfg.TenantId), (Get-Masked $cfg.ClientId), $cfg.AuthMode, $cfg.Mail.Method)

# ----------------------------------------------------------------- TEST -----
if ($Test) {
    $script:fail = 0
    $script:warn = 0

    function Test-Step {
        param([string]$Name, [scriptblock]$Action, [switch]$Optional)
        try {
            $r = & $Action
            Write-Log ("{0,-42} OK    {1}" -f $Name, $r) 'OK'
        }
        catch {
            $msg = Get-HttpErrorBody $_
            if (-not $msg) { $msg = $_.Exception.Message }
            if ($Optional) {
                $script:warn++
                Write-Log ("{0,-42} UYARI {1}" -f $Name, $msg) 'WARN'
            }
            else {
                $script:fail++
                Write-Log ("{0,-42} HATA  {1}" -f $Name, $msg) 'ERROR'
            }
        }
    }

    Write-Host ''
    Write-Host '  KURULUM DOGRULAMA TESTLERI (PURVIEW)' -ForegroundColor Cyan
    Write-Host '  -----------------------------------' -ForegroundColor Cyan

    Test-Step '1. Microsoft Graph jetonu' {
        $script:grTok = Get-AppToken $cfg $script:GraphResource
        'jeton alindi'
    }
    Test-Step '2. Security alerts_v2 erisimi' {
        $r = Invoke-RestMethod "$script:GraphResource/v1.0/security/alerts_v2?`$top=1" -Headers @{ Authorization = "Bearer $script:grTok" }
        "$($r.value.Count) ornek kayit"
    }
    Test-Step '3. Security incidents erisimi ($top=50)' {
        $r = Invoke-RestMethod "$script:GraphResource/v1.0/security/incidents?`$top=50" -Headers @{ Authorization = "Bearer $script:grTok" }
        "$($r.value.Count) ornek kayit"
    }
    Test-Step '4. Audit Log Queries erisimi' -Optional {
        $r = Invoke-RestMethod "$script:GraphResource/v1.0/security/auditLog/queries?`$top=1" -Headers @{ Authorization = "Bearer $script:grTok" }
        "$($r.value.Count) mevcut sorgu"
    }
    Test-Step '5. eDiscovery Cases erisimi' -Optional {
        $r = Invoke-RestMethod "$script:GraphResource/v1.0/security/cases/ediscoveryCases?`$top=1" -Headers @{ Authorization = "Bearer $script:grTok" }
        "$($r.value.Count) vaka"
    }
    Test-Step '6. O365 Activity API (DLP.All)' -Optional {
        $script:o365Tok = Get-AppToken $cfg $script:O365Resource
        $subs = @(Invoke-RestMethod "$script:O365Resource/api/v1.0/$($cfg.TenantId)/activity/feed/subscriptions/list" -Headers @{ Authorization = "Bearer $script:o365Tok" })
        "jeton alindi ($($subs.Count) abonelik)"
    }
    Test-Step '7. IPPS politika anlik goruntusu' -Optional {
        $sp = Join-Path $script:Root 'Snapshots\purview-policies.json'
        if ($cfg.Purview -and $cfg.Purview.PolicySnapshotPath) {
            $sp = if ([IO.Path]::IsPathRooted($cfg.Purview.PolicySnapshotPath)) { $cfg.Purview.PolicySnapshotPath } else { Join-Path $script:Root $cfg.Purview.PolicySnapshotPath }
        }
        if (-not (Test-Path $sp)) { throw 'Snapshots\purview-policies.json henuz yok (Collect-PurviewPolicies.ps1 calistirin)' }
        $j = Get-Content $sp -Raw -Encoding UTF8 | ConvertFrom-Json
        "$(@($j.dlpPolicies).Count) DLP politikasi"
    }
    Test-Step '8. PDF motoru (Microsoft Edge)' -Optional {
        if (Get-EdgePath) { 'bulundu' } else { throw 'Edge yok - rapor HTML uretilecek' }
    }

    Write-Host ''
    if ($script:fail -eq 0) {
        Write-Log "TEMEL TESTLER BASARILI ($($script:warn) opsiyonel uyari). Rapor uretimine hazir." 'OK'
        exit 0
    }
    Write-Log "$($script:fail) temel test basarisiz. Yukaridaki hatalari giderin." 'ERROR'
    exit 1
}

# --------------------------------------------------------- opsiyonel IPPS ---
if ($CollectIpps) {
    $collectScript = Join-Path $script:Root 'Collect-PurviewPolicies.ps1'
    if (Test-Path $collectScript) {
        Write-Log 'IPPS politika envanteri guncelleniyor...'
        $org = if ($cfg.PSObject.Properties['Organization']) { [string]$cfg.Organization } else { '' }
        & $collectScript -Organization $org
    }
}

# --------------------------------------------------------------- uretim -----
try {
    $data = Get-PurviewData -Config $cfg -Start $start -End $end -Mode $Mode -PolicySnapshotOverride $PolicySnapshotPath
    $k    = New-PurviewKpi -Data $data -Config $cfg

    # Onceki donem (trend)
    $prevTag = if ($Mode -eq 'Weekly') { $start.AddDays(-7).ToString('yyyy-MM-dd') + '-hafta' }
               else                    { $start.AddMonths(-1).ToString('yyyy-MM') }
    $prev = $null
    $prevFile = Join-Path $script:Root "Archive\$Mode\$prevTag\kpi.json"
    if (Test-Path $prevFile) {
        try {
            $prev = Get-Content $prevFile -Raw -Encoding UTF8 | ConvertFrom-Json
            Write-Log "Onceki donem ($prevTag) trend icin yuklendi."
        }
        catch {
            Write-Log 'Onceki donem dosyasi okunamadi, trend gosterilmeyecek.' 'WARN'
        }
    }
    else {
        Write-Log 'Onceki donem verisi yok; trend sutunlari bos gelecek.'
    }

    # Arsiv
    $arch = Join-Path $script:Root "Archive\$Mode\$($k.Etiket)"
    if (-not (Test-Path $arch)) { New-Item -ItemType Directory -Path $arch -Force | Out-Null }
    $data.AlertsAll      | ConvertTo-Json -Depth 6 | Set-Content "$arch\raw-alerts.json"    -Encoding UTF8
    $data.Incidents      | ConvertTo-Json -Depth 6 | Set-Content "$arch\raw-incidents.json" -Encoding UTF8
    $data.DlpEvents      | ConvertTo-Json -Depth 6 | Set-Content "$arch\raw-dlp.json"       -Encoding UTF8
    if ($data.PolicySnapshot) {
        $data.PolicySnapshot | ConvertTo-Json -Depth 6 | Set-Content "$arch\raw-policies.json" -Encoding UTF8
    }
    $k | ConvertTo-Json -Depth 8 | Set-Content "$arch\kpi.json" -Encoding UTF8

    if ($ExportCsv) {
        $csv = Join-Path $arch 'CSV'
        if (-not (Test-Path $csv)) { New-Item -ItemType Directory -Path $csv | Out-Null }
        if (@($data.AlertsAll).Count) {
            $data.AlertsAll | Select-Object id, title, severity, status, serviceSource, category, createdDateTime |
                Export-Csv "$csv\uyarilar.csv" -NoTypeInformation -Encoding UTF8
        }
        if (@($data.Incidents).Count) {
            $data.Incidents | Select-Object id, displayName, severity, status, classification, determination, assignedTo, createdDateTime, lastUpdateDateTime |
                Export-Csv "$csv\olaylar.csv" -NoTypeInformation -Encoding UTF8
        }
        if (@($data.DlpEvents).Count) {
            $data.DlpEvents | Select-Object Id, Workload, Operation, CreationTime, UserId |
                Export-Csv "$csv\dlp-olaylari.csv" -NoTypeInformation -Encoding UTF8
        }
        if (@($k.DlpPolicies).Count) {
            $k.DlpPolicies | Select-Object id, name, mode, @{ Name = 'workloadScope'; Expression = { ($_.workloadScope -join ';') } }, lastModifiedAt |
                Export-Csv "$csv\dlp-politikalari.csv" -NoTypeInformation -Encoding UTF8
        }
        Write-Log "CSV dosyalari yazildi: $csv"
    }

    # HTML
    $html = if ($Mode -eq 'Weekly') { New-PurviewWeeklyHtml  $k $cfg $script:Root $prev }
            else                    { New-PurviewMonthlyHtml $k $cfg $script:Root $prev }

    $safe = ($cfg.CustomerName -replace '[^A-Za-z0-9]', '')
    if (-not $safe) { $safe = 'Organization' }
    $baseName = if ($Mode -eq 'Weekly') { "${safe}_Purview_Haftalik_$($k.Etiket)" } else { "${safe}_Purview_Aylik_$($k.Etiket)" }
    $htmlPath = Join-Path $script:Root "Output\$baseName.html"
    $html | Set-Content -Path $htmlPath -Encoding UTF8
    Write-Log "HTML uretildi: $htmlPath" 'OK'

    $attach = @($htmlPath)
    if ($Pdf -or ($cfg.Report -and $cfg.Report.AttachPdf)) {
        $pdfPath = Join-Path $script:Root "Output\$baseName.pdf"
        if (Convert-ToPdf $htmlPath $pdfPath) {
            $attach = @($pdfPath)
            Write-Log "PDF uretildi: $pdfPath" 'OK'
        }
        else {
            Write-Log 'PDF uretilemedi, HTML gonderilecek.' 'WARN'
        }
    }

    if ($DryRun) {
        Write-Log 'DryRun: mail gonderilmedi.' 'WARN'
    }
    else {
        Send-Report -Config $cfg -Kpi $k -Html $html -Attachments $attach -Mode $Mode
        Write-Log 'Rapor gonderildi.' 'OK'
    }

    Write-Log '=== Calisma basariyla tamamlandi ===' 'OK'
    exit 0
}
catch {
    Write-Log "HATA: $($_.Exception.Message)" 'ERROR'
    Write-Log $_.ScriptStackTrace 'ERROR'
    Send-FailureNotice -Config $cfg -Message $_.Exception.Message -LogPath $script:LogFile
    exit 1
}
finally {
    if ($script:TokenCache) { $script:TokenCache.Clear() }
    [GC]::Collect()
}
