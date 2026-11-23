<#
.SYNOPSIS
    Salt okunur Microsoft Purview Security & Compliance PowerShell (IPPS) politika toplayicisi.

.DESCRIPTION
    Connect-IPPSSession uzerinden yalnizca Get-* cmdlet'leri ile DLP, Hassasiyet Etiketi,
    Veri Saklama, Ic Tehdit Yonetimi ve Iletisim Uyumu politika envanterini ceker ve
    Snapshots\purview-policies.json dosyasina yazar.

    Guvenlik Siniflandirmasi: Salt okunur denetim / telemetri toplama.
    Hicbir Set-*, New-* veya Remove-* komutu calistirilmaz.

.EXAMPLE
    .\Collect-PurviewPolicies.ps1 -Organization contoso.onmicrosoft.com
    .\Collect-PurviewPolicies.ps1 -Organization contoso.onmicrosoft.com -AppId <guid> -CertificateThumbprint <thumbprint>
    .\Collect-PurviewPolicies.ps1 -SkipConnect -DryRunOutput
#>
[CmdletBinding()]
param(
    [string]$Organization,
    [string]$AppId,
    [string]$CertificateThumbprint,
    [string]$OutputPath = (Join-Path $PSScriptRoot 'Snapshots\purview-policies.json'),
    [switch]$SkipConnect,
    [switch]$DryRunOutput
)

$ErrorActionPreference = 'Stop'

function Get-SafeIppsPolicy {
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

function ConvertTo-PurviewPolicySnapshot {
    param(
        [AllowEmptyCollection()][array]$DlpPolicies = @(),
        [int]$SensitivityLabelCount = 0,
        [int]$SensitivityLabelPolicyCount = 0,
        [int]$RetentionPolicyCount = 0,
        [int]$InsiderRiskPolicyCount = 0,
        [int]$CommCompliancePolicyCount = 0,
        [hashtable]$CommandStatuses = @{}
    )

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
        if ($workloads.Count -eq 0) { $workloads = @('Microsoft 365') }

        $policyId = if ($_.ImmutableId) { [string]$_.ImmutableId }
                    elseif ($_.Guid)    { [string]$_.Guid }
                    else                { [string]$_.Name }

        $modified = if ($_.WhenChangedUTC) { ([datetime]$_.WhenChangedUTC).ToString('o') }
                    else { (Get-Date).ToUniversalTime().ToString('o') }

        [ordered]@{
            id             = $policyId
            name           = [string]$_.Name
            workloadScope  = @($workloads)
            mode           = $mode
            lastModifiedAt = $modified
        }
    })

    return [ordered]@{
        schemaVersion               = '1.0.0'
        collectedAt                 = (Get-Date).ToUniversalTime().ToString('o')
        dlpPolicies                 = @($normalizedDlp)
        sensitivityLabelCount       = $SensitivityLabelCount
        sensitivityLabelPolicyCount = $SensitivityLabelPolicyCount
        retentionPolicyCount        = $RetentionPolicyCount
        insiderRiskPolicyCount      = $InsiderRiskPolicyCount
        commCompliancePolicyCount   = $CommCompliancePolicyCount
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
    ) -SensitivityLabelCount 5 -SensitivityLabelPolicyCount 2 -RetentionPolicyCount 3 -InsiderRiskPolicyCount 1 -CommCompliancePolicyCount 1 -CommandStatuses @{
        GetDlpCompliancePolicy       = 'Available'
        GetLabel                     = 'Available'
        GetLabelPolicy               = 'Available'
        GetRetentionCompliancePolicy = 'Available'
        GetInsiderRiskPolicy         = 'Available'
        GetSupervisoryReviewPolicyV2 = 'Available'
    }

    $sample | ConvertTo-Json -Depth 6 | Set-Content -Path $OutputPath -Encoding UTF8
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
    $dlp   = Get-SafeIppsPolicy -Name 'Get-DlpCompliancePolicy'       -Command { Get-DlpCompliancePolicy }
    $label = Get-SafeIppsPolicy -Name 'Get-Label'                     -Command { Get-Label }
    $lblP  = Get-SafeIppsPolicy -Name 'Get-LabelPolicy'               -Command { Get-LabelPolicy }
    $ret   = Get-SafeIppsPolicy -Name 'Get-RetentionCompliancePolicy' -Command { Get-RetentionCompliancePolicy }
    $ir    = Get-SafeIppsPolicy -Name 'Get-InsiderRiskPolicy'         -Command { Get-InsiderRiskPolicy }
    $comm  = Get-SafeIppsPolicy -Name 'Get-SupervisoryReviewPolicyV2' -Command { Get-SupervisoryReviewPolicyV2 }

    $statuses = [ordered]@{
        GetDlpCompliancePolicy       = $dlp.Status
        GetLabel                     = $label.Status
        GetLabelPolicy               = $lblP.Status
        GetRetentionCompliancePolicy = $ret.Status
        GetInsiderRiskPolicy         = $ir.Status
        GetSupervisoryReviewPolicyV2 = $comm.Status
    }

    $snapshot = ConvertTo-PurviewPolicySnapshot `
        -DlpPolicies $dlp.Items `
        -SensitivityLabelCount @($label.Items).Count `
        -SensitivityLabelPolicyCount @($lblP.Items).Count `
        -RetentionPolicyCount @($ret.Items).Count `
        -InsiderRiskPolicyCount @($ir.Items).Count `
        -CommCompliancePolicyCount @($comm.Items).Count `
        -CommandStatuses $statuses

    $snapshot | ConvertTo-Json -Depth 6 | Set-Content -Path $OutputPath -Encoding UTF8
    Write-Output "Purview IPPS anlik goruntusu kaydedildi: $OutputPath"
}
finally {
    if (-not $SkipConnect -and (Get-Command Disconnect-ExchangeOnline -ErrorAction SilentlyContinue)) {
        Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    }
}
