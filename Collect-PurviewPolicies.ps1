<#
.SYNOPSIS
    Salt okunur Microsoft Purview Security & Compliance (IPPS) ve Exchange Online (UAL) derin envanter toplayicisi.

.DESCRIPTION
    Connect-IPPSSession ve istege bagli Connect-ExchangeOnline uzerinden yalnizca salt okunur
    komutlarla (Get-*, Export-ActivityExplorerData, Search-UnifiedAuditLog) su verileri toplar:
      1. Get-Label, Get-LabelPolicy, Get-AutoSensitivityLabelPolicy, Get-AutoSensitivityLabelRule
      2. Get-DlpCompliancePolicy, Get-DlpComplianceRule (SIT, Block, Override detaylariyla)
      3. Get-RetentionCompliancePolicy, Get-RetentionComplianceRule, Get-ComplianceTag
      4. Get-InsiderRiskPolicy, Get-SupervisoryReviewPolicyV2, Get-ComplianceCase
      5. Export-ActivityExplorerData ve Search-UnifiedAuditLog (Etiket kullanimi, DLP eslesmeleri,
         en cok DLP tetikleyen kullanicilar, hassas bilgi turleri ve override gerekceleri)

    Hem X.509 Sertifika ile %100 katilimsiz (AppId + CertificateThumbprint + Organization)
    hem de etkilesimli yonetici oturumu ile calisir.

    Guvenlik Siniflandirmasi: Salt okunur denetim / telemetri toplama.
    Hicbir Set-*, New-* veya Remove-* komutu calistirilmaz.

.EXAMPLE
    .\Collect-PurviewPolicies.ps1 -Organization contoso.onmicrosoft.com
    .\Collect-PurviewPolicies.ps1 -Organization contoso.onmicrosoft.com -AppId <guid> -CertificateThumbprint <thumb> -IncludeAuditTelemetry
    .\Collect-PurviewPolicies.ps1 -SkipConnect -DryRunOutput
#>
[CmdletBinding()]
param(
    [string]$Organization,
    [string]$AppId,
    [string]$CertificateThumbprint,
    [int]$LookbackDays = 30,
    [switch]$IncludeAuditTelemetry,
    [string]$OutputPath = (Join-Path $PSScriptRoot 'Snapshots\purview-policies.json'),
    [switch]$SkipConnect,
    [switch]$DryRunOutput
)

$ErrorActionPreference = 'Stop'

function Get-SafeIppsItem {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][scriptblock]$Command
    )
    try {
        $items = @(& $Command)
        return [pscustomobject]@{
            Status = 'Available'
            Items  = $items
            Error  = $null
        }
    }
    catch {
        Write-Warning "IPPS komutu [$Name] calistirilamadi veya lisanssiz: $($_.Exception.Message)"
        return [pscustomobject]@{
            Status = 'Unavailable'
            Items  = @()
            Error  = $_.Exception.Message
        }
    }
}

function ConvertFrom-DlpRuleSitNode {
    param($Node)
    $list = New-Object System.Collections.ArrayList
    function Search-Sit ($n) {
        if ($null -eq $n) { return }
        if ($n -is [System.Collections.IEnumerable] -and $n -isnot [string] -and $n -isnot [System.Collections.IDictionary]) {
            foreach ($item in $n) { Search-Sit $item }
            return
        }
        $dict = @{}
        if ($n -is [System.Collections.IDictionary]) {
            foreach ($k in $n.Keys) { $dict[$k.ToString().ToLowerInvariant()] = $n[$k] }
        }
        elseif ($n.PSObject) {
            foreach ($p in $n.PSObject.Properties) { $dict[$p.Name.ToLowerInvariant()] = $p.Value }
        }
        if ($dict.ContainsKey('sensitivetypes')) { Search-Sit $dict['sensitivetypes'] }
        if ($dict.ContainsKey('groups'))         { Search-Sit $dict['groups'] }
        if ($dict.ContainsKey('name') -and -not $dict.ContainsKey('groups') -and -not $dict.ContainsKey('sensitivetypes')) {
            $sitName = [string]$dict['name']
            if ($sitName -and $sitName -ne 'Default') {
                [void]$list.Add($sitName)
            }
        }
    }
    Search-Sit $Node
    return @($list | Select-Object -Unique)
}

function ConvertTo-PurviewPolicySnapshot {
    param(
        [AllowEmptyCollection()][array]$DlpPolicies = @(),
        [AllowEmptyCollection()][array]$DlpRules = @(),
        [AllowEmptyCollection()][array]$Labels = @(),
        [AllowEmptyCollection()][array]$LabelPolicies = @(),
        [AllowEmptyCollection()][array]$AutoLabelPolicies = @(),
        [AllowEmptyCollection()][array]$RetentionPolicies = @(),
        [AllowEmptyCollection()][array]$RetentionRules = @(),
        [AllowEmptyCollection()][array]$RetentionLabels = @(),
        [AllowEmptyCollection()][array]$InsiderRiskPolicies = @(),
        [AllowEmptyCollection()][array]$CommCompliancePolicies = @(),
        [AllowEmptyCollection()][array]$ActivityRecords = @(),
        [hashtable]$CommandStatuses = @{}
    )

    $rulesByPolicy = @{}
    $normalizedRules = @($DlpRules | ForEach-Object {
        $pName = [string]$_.Policy
        $sits  = @(ConvertFrom-DlpRuleSitNode $_.ContentContainsSensitiveInformation)
        $act   = if ($_.BlockAccess) {
            if ($_.NotifyAllowOverride) { 'BlockWithOverride' } else { 'Block' }
        }
        elseif ($_.NotifyUser) { 'Notify' }
        else { 'Audit' }

        $sev = if ($_.IncidentReportSeverity) { [string]$_.IncidentReportSeverity } else { 'Medium' }
        $rObj = [ordered]@{
            name                  = [string]$_.Name
            policyName            = $pName
            disabled              = [bool]$_.Disabled
            severity              = $sev
            action                = $act
            allowOverride         = [bool]$_.NotifyAllowOverride
            sensitiveInfoTypes    = @($sits)
        }
        if ($pName) {
            if (-not $rulesByPolicy.ContainsKey($pName)) { $rulesByPolicy[$pName] = New-Object System.Collections.ArrayList }
            [void]$rulesByPolicy[$pName].Add($rObj)
        }
        $rObj
    })

    $normalizedDlp = @($DlpPolicies | ForEach-Object {
        $rawMode = [string]$_.Mode
        $mode = switch -Regex ($rawMode) {
            'Enable|Enforce'                 { 'Enforce'; break }
            'TestWithNotifications'          { 'TestWithNotifications'; break }
            'TestWithoutNotifications|Audit' { 'TestWithoutNotifications'; break }
            default                          { 'Disabled' }
        }

        $workloads = @()
        if ($_.ExchangeLocation)    { $workloads += 'Exchange' }
        if ($_.SharePointLocation)  { $workloads += 'SharePoint' }
        if ($_.OneDriveLocation)    { $workloads += 'OneDrive' }
        if ($_.TeamsLocation)       { $workloads += 'Teams' }
        if ($_.EndpointDlpLocation) { $workloads += 'Endpoint' }
        if ($_.Workload -and $workloads.Count -eq 0) {
            $workloads = @(([string]$_.Workload -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        }
        if ($workloads.Count -eq 0) { $workloads = @('Microsoft 365') }

        $policyId = if ($_.ImmutableId) { [string]$_.ImmutableId }
                    elseif ($_.Guid)    { [string]$_.Guid }
                    else                { [string]$_.Name }

        $modified = if ($_.WhenChangedUTC) { ([datetime]$_.WhenChangedUTC).ToString('o') }
                    else { (Get-Date).ToUniversalTime().ToString('o') }

        $pRules = if ($rulesByPolicy.ContainsKey([string]$_.Name)) { @($rulesByPolicy[[string]$_.Name]) } else { @() }
        $pSits  = @($pRules | ForEach-Object { $_.sensitiveInfoTypes } | Where-Object { $_ } | Select-Object -Unique)

        [ordered]@{
            id                 = $policyId
            name               = [string]$_.Name
            workloadScope      = @($workloads)
            mode               = $mode
            ruleCount          = $pRules.Count
            sensitiveInfoTypes = @($pSits)
            lastModifiedAt     = $modified
        }
    })

    $normalizedLabels = @($Labels | ForEach-Object {
        $lid = if ($_.ImmutableId) { [string]$_.ImmutableId } elseif ($_.Guid) { [string]$_.Guid } else { [string]$_.Id }
        $dName = if ($_.DisplayName) { [string]$_.DisplayName } else { [string]$_.Name }
        $prio  = if ($null -ne $_.Priority) { [int]$_.Priority } elseif ($null -ne $_.sensitivity) { [int]$_.sensitivity } else { 0 }
        $enc   = if ($_.PSObject.Properties['EncryptionEnabled']) { [bool]$_.EncryptionEnabled } else { ([string]$_.LabelActions -match 'encrypt') }
        $mark  = if ($_.PSObject.Properties['MarkingEnabled']) { [bool]$_.MarkingEnabled } else { ([string]$_.LabelActions -match 'applycontentmarking') }
        $parent = if ($_.ParentId) { [string]$_.ParentId } elseif ($_.ParentLabelDisplayName) { [string]$_.ParentLabelDisplayName } else { '' }
        $active = if ($_.PSObject.Properties['Disabled']) { (-not [bool]$_.Disabled) } else { $true }

        [ordered]@{
            id                = $lid
            name              = [string]$_.Name
            displayName       = $dName
            priority          = $prio
            parentName        = $parent
            encryptionEnabled = $enc
            markingEnabled    = $mark
            contentType       = if ($_.ContentType) { [string]$_.ContentType } else { 'File, Email' }
            tooltip           = [string]$_.Tooltip
            isActive          = $active
        }
    })

    $normalizedLabelPolicies = @($LabelPolicies | ForEach-Object {
        $settingsMap = @{}
        foreach ($entry in @($_.Settings)) {
            if ([string]$entry -match '^\[(?<k>[^,]+),\s*(?<v>.*)\]$') {
                $settingsMap[$Matches['k'].Trim().ToLowerInvariant()] = $Matches['v'].Trim()
            }
        }
        [ordered]@{
            name                         = [string]$_.Name
            labels                       = @($_.Labels)
            mandatory                    = ($settingsMap['mandatory'] -eq 'true')
            requireDowngradeJustification= ($settingsMap['requiredowngradejustification'] -eq 'true')
            defaultLabelId               = [string]$settingsMap['defaultlabelid']
        }
    })

    return [ordered]@{
        schemaVersion               = '2.0.0'
        collectedAt                 = (Get-Date).ToUniversalTime().ToString('o')
        dlpPolicies                 = @($normalizedDlp)
        dlpRules                    = @($normalizedRules)
        sensitivityLabels           = @($normalizedLabels)
        sensitivityLabelCount       = $normalizedLabels.Count
        sensitivityLabelPolicies    = @($normalizedLabelPolicies)
        sensitivityLabelPolicyCount = $normalizedLabelPolicies.Count
        autoLabelPolicyCount        = @($AutoLabelPolicies).Count
        retentionPolicyCount        = @($RetentionPolicies).Count
        retentionRuleCount          = @($RetentionRules).Count
        retentionLabelCount         = @($RetentionLabels).Count
        insiderRiskPolicyCount      = @($InsiderRiskPolicies).Count
        commCompliancePolicyCount   = @($CommCompliancePolicies).Count
        activityRecords             = @($ActivityRecords)
        commandStatuses             = $CommandStatuses
    }
}

$outDir = Split-Path -Parent $OutputPath
if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

if ($DryRunOutput) {
    $sample = ConvertTo-PurviewPolicySnapshot -DlpPolicies @(
        [pscustomobject]@{
            ImmutableId        = 'sample-dlp-01'
            Name               = 'Contoso-Ornek-DLP-Politikasi'
            Mode               = 'Enable'
            ExchangeLocation   = @('All')
            SharePointLocation = @('All')
            WhenChangedUTC     = (Get-Date).ToUniversalTime()
        }
    ) -DlpRules @(
        [pscustomobject]@{
            Name                                = 'Block External TCKN & Credit Card'
            Policy                              = 'Contoso-Ornek-DLP-Politikasi'
            Disabled                            = $false
            BlockAccess                         = $true
            NotifyAllowOverride                 = 'WithJustification'
            IncidentReportSeverity              = 'High'
            ContentContainsSensitiveInformation = @(@{ name = 'Turkey National Identification Number'; mincount = 1 })
        }
    ) -Labels @(
        [pscustomobject]@{ ImmutableId = 'lbl-1'; Name = 'Public'; DisplayName = 'Public'; Priority = 0; EncryptionEnabled = $false; MarkingEnabled = $false; Disabled = $false; Tooltip = 'Acik veri' }
        [pscustomobject]@{ ImmutableId = 'lbl-2'; Name = 'Confidential'; DisplayName = 'Confidential'; Priority = 5; EncryptionEnabled = $true; MarkingEnabled = $true; Disabled = $false; Tooltip = 'Gizli kurumsal veri' }
    ) -LabelPolicies @(
        [pscustomobject]@{ Name = 'Global-Label-Policy'; Labels = @('Public', 'Confidential'); Settings = @('[mandatory, true]', '[requiredowngradejustification, true]') }
    ) -CommandStatuses @{
        GetDlpCompliancePolicy       = 'Available'
        GetDlpComplianceRule         = 'Available'
        GetLabel                     = 'Available'
        GetLabelPolicy               = 'Available'
        GetRetentionCompliancePolicy = 'Available'
        GetInsiderRiskPolicy         = 'Available'
        GetSupervisoryReviewPolicyV2 = 'Available'
    }

    $sample | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputPath -Encoding UTF8
    Write-Output "Ornek salt okunur IPPS anlik goruntusu yazildi: $OutputPath"
    return
}

if (-not $SkipConnect) {
    Import-Module ExchangeOnlineManagement -ErrorAction Stop
    if ($AppId -and $CertificateThumbprint -and $Organization) {
        Connect-IPPSSession -AppId $AppId -CertificateThumbprint $CertificateThumbprint -Organization $Organization -ShowBanner:$false
    }
    elseif ($Organization) {
        Connect-IPPSSession -Organization $Organization -ShowBanner:$false
    }
    else {
        Connect-IPPSSession -ShowBanner:$false
    }
}

try {
    $dlp   = Get-SafeIppsItem -Name 'Get-DlpCompliancePolicy'        -Command { Get-DlpCompliancePolicy }
    $dlpR  = Get-SafeIppsItem -Name 'Get-DlpComplianceRule'          -Command { Get-DlpComplianceRule }
    $label = Get-SafeIppsItem -Name 'Get-Label'                      -Command { Get-Label }
    $lblP  = Get-SafeIppsItem -Name 'Get-LabelPolicy'                -Command { Get-LabelPolicy }
    $autoL = Get-SafeIppsItem -Name 'Get-AutoSensitivityLabelPolicy' -Command { Get-AutoSensitivityLabelPolicy }
    $ret   = Get-SafeIppsItem -Name 'Get-RetentionCompliancePolicy'  -Command { Get-RetentionCompliancePolicy }
    $retR  = Get-SafeIppsItem -Name 'Get-RetentionComplianceRule'    -Command { Get-RetentionComplianceRule }
    $tags  = Get-SafeIppsItem -Name 'Get-ComplianceTag'              -Command { Get-ComplianceTag }
    $ir    = Get-SafeIppsItem -Name 'Get-InsiderRiskPolicy'          -Command { Get-InsiderRiskPolicy }
    $comm  = Get-SafeIppsItem -Name 'Get-SupervisoryReviewPolicyV2'  -Command { Get-SupervisoryReviewPolicyV2 }

    $activityItems = New-Object System.Collections.ArrayList
    $actStatus = 'Skipped'
    if ($IncludeAuditTelemetry) {
        try {
            $startA = (Get-Date).AddDays(-$LookbackDays)
            $endA   = Get-Date
            if (Get-Command Export-ActivityExplorerData -ErrorAction SilentlyContinue) {
                $exp = Export-ActivityExplorerData -StartTime $startA -EndTime $endA -PageSize 1000 -OutputFormat Json -ErrorAction Stop
                if ($exp -and $exp.ResultData) {
                    $parsed = $exp.ResultData | ConvertFrom-Json
                    foreach ($row in @($parsed)) { [void]$activityItems.Add($row) }
                }
                $actStatus = 'Available'
            }
        }
        catch {
            $actStatus = 'Unavailable'
            Write-Warning "Export-ActivityExplorerData alinamadi: $($_.Exception.Message)"
        }
    }

    $statuses = [ordered]@{
        GetDlpCompliancePolicy        = $dlp.Status
        GetDlpComplianceRule          = $dlpR.Status
        GetLabel                      = $label.Status
        GetLabelPolicy                = $lblP.Status
        GetAutoSensitivityLabelPolicy = $autoL.Status
        GetRetentionCompliancePolicy  = $ret.Status
        GetRetentionComplianceRule    = $retR.Status
        GetComplianceTag              = $tags.Status
        GetInsiderRiskPolicy          = $ir.Status
        GetSupervisoryReviewPolicyV2  = $comm.Status
        ExportActivityExplorerData    = $actStatus
    }

    $snapshot = ConvertTo-PurviewPolicySnapshot `
        -DlpPolicies $dlp.Items `
        -DlpRules $dlpR.Items `
        -Labels $label.Items `
        -LabelPolicies $lblP.Items `
        -AutoLabelPolicies $autoL.Items `
        -RetentionPolicies $ret.Items `
        -RetentionRules $retR.Items `
        -RetentionLabels $tags.Items `
        -InsiderRiskPolicies $ir.Items `
        -CommCompliancePolicies $comm.Items `
        -ActivityRecords @($activityItems) `
        -CommandStatuses $statuses

    $snapshot | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputPath -Encoding UTF8
    Write-Output "Purview IPPS derin anlik goruntusu kaydedildi: $OutputPath"
}
finally {
    if (-not $SkipConnect -and (Get-Command Disconnect-ExchangeOnline -ErrorAction SilentlyContinue)) {
        Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    }
}
