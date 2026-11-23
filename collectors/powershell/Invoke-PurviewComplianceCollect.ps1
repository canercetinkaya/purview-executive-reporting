<#
.SYNOPSIS
    Read-only Microsoft Purview Security & Compliance PowerShell (IPPS) snapshot collector.

.DESCRIPTION
    Connects to Security & Compliance PowerShell via Connect-IPPSSession (supports unattended
    Certificate App-Only authentication or interactive sign-in) and collects policy configuration
    inventory strictly using Get-* cmdlets. Exports a versioned JSON snapshot for ingestion by
    PowerShellComplianceBridgeConnector in apps/api.

    SECURITY CLASSIFICATION: Read-Only Audit / Telemetry Collection.
    Zero Set-*, New-*, or Remove-* state-changing cmdlets are invoked.

.EXAMPLE
    .\Invoke-PurviewComplianceCollect.ps1 -CustomerId cust-contoso-fin -AppId <app-guid> -CertificateThumbprint <thumbprint> -Organization contoso.onmicrosoft.com
.EXAMPLE
    .\Invoke-PurviewComplianceCollect.ps1 -CustomerId cust-contoso-fin -SkipConnect -DryRunOutput
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$CustomerId,
    [string]$Organization,
    [string]$AppId,
    [string]$CertificateThumbprint,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'output'),
    [switch]$SkipConnect,
    [switch]$DryRunOutput
)

$ErrorActionPreference = 'Stop'

function Get-SafePolicyArray {
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
        Write-Warning "IPPS cmdlet [$Name] failed or unlicensed: $($_.Exception.Message)"
        return [pscustomobject]@{
            Status = 'Unavailable'
            Items  = @()
            Error  = $_.Exception.Message
        }
    }
}

function ConvertTo-NormalizedPurviewSnapshot {
    param(
        [Parameter(Mandatory)][string]$CustomerId,
        [AllowEmptyCollection()][array]$DlpPolicies = @(),
        [int]$SensitivityLabelPolicyCount = 0,
        [int]$RetentionPolicyCount = 0,
        [int]$InsiderRiskPolicyCount = 0,
        [int]$CommCompliancePolicyCount = 0
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
        if ($_.ExchangeLocation)   { $workloads += 'Exchange' }
        if ($_.SharePointLocation) { $workloads += 'SharePoint' }
        if ($_.OneDriveLocation)   { $workloads += 'OneDrive' }
        if ($_.TeamsLocation)      { $workloads += 'Teams' }
        if ($_.EndpointDlpLocation){ $workloads += 'Endpoint' }
        if ($workloads.Count -eq 0) { $workloads = @('Microsoft 365') }

        [ordered]@{
            id             = [string]($_.ImmutableId ?? $_.Guid ?? $_.Name)
            name           = [string]$_.Name
            workloadScope  = @($workloads)
            mode           = $mode
            lastModifiedAt = if ($_.WhenChangedUTC) { ([datetime]$_.WhenChangedUTC).ToString('o') } else { (Get-Date).ToUniversalTime().ToString('o') }
        }
    })

    return [ordered]@{
        schemaVersion               = '1.0.0'
        customerId                  = $CustomerId
        collectedAt                 = (Get-Date).ToUniversalTime().ToString('o')
        dlpPolicies                 = @($normalizedDlp)
        sensitivityLabelPolicyCount = $SensitivityLabelPolicyCount
        retentionPolicyCount        = $RetentionPolicyCount
        insiderRiskPolicyCount      = $InsiderRiskPolicyCount
        commCompliancePolicyCount   = $CommCompliancePolicyCount
    }
}

if (-not (Test-Path $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}

$outputPath = Join-Path $OutputDirectory "$CustomerId.purview-snapshot.json"

if ($DryRunOutput) {
    $sample = ConvertTo-NormalizedPurviewSnapshot -CustomerId $CustomerId -DlpPolicies @(
        [pscustomobject]@{
            ImmutableId        = 'sample-dlp-01'
            Name               = 'Contoso-Sample-DLP-Policy'
            Mode               = 'Enable'
            ExchangeLocation   = @('All')
            SharePointLocation = @('All')
            WhenChangedUTC     = (Get-Date).ToUniversalTime()
        }
    ) -SensitivityLabelPolicyCount 3 -RetentionPolicyCount 4 -InsiderRiskPolicyCount 2 -CommCompliancePolicyCount 1

    $sample | ConvertTo-Json -Depth 6 | Set-Content -Path $outputPath -Encoding UTF8
    Write-Output "Sample read-only snapshot exported to $outputPath"
    return
}

if (-not $SkipConnect) {
    Import-Module ExchangeOnlineManagement -ErrorAction Stop
    if ($AppId -and $CertificateThumbprint -and $Organization) {
        Connect-IPPSSession -AppId $AppId -CertificateThumbprint $CertificateThumbprint -Organization $Organization -ShowBanner:$false
    }
    else {
        Connect-IPPSSession -ShowBanner:$false
    }
}

try {
    $dlp   = Get-SafePolicyArray -Name 'Get-DlpCompliancePolicy'       -Command { Get-DlpCompliancePolicy }
    $lbl   = Get-SafePolicyArray -Name 'Get-LabelPolicy'               -Command { Get-LabelPolicy }
    $ret   = Get-SafePolicyArray -Name 'Get-RetentionCompliancePolicy' -Command { Get-RetentionCompliancePolicy }
    $ir    = Get-SafePolicyArray -Name 'Get-InsiderRiskPolicy'         -Command { Get-InsiderRiskPolicy }
    $comm  = Get-SafePolicyArray -Name 'Get-SupervisoryReviewPolicyV2' -Command { Get-SupervisoryReviewPolicyV2 }

    $snapshot = ConvertTo-NormalizedPurviewSnapshot `
        -CustomerId $CustomerId `
        -DlpPolicies $dlp.Items `
        -SensitivityLabelPolicyCount @($lbl.Items).Count `
        -RetentionPolicyCount @($ret.Items).Count `
        -InsiderRiskPolicyCount @($ir.Items).Count `
        -CommCompliancePolicyCount @($comm.Items).Count

    $snapshot | ConvertTo-Json -Depth 6 | Set-Content -Path $outputPath -Encoding UTF8
    Write-Output "Exported read-only Purview IPPS snapshot to $outputPath"
}
finally {
    if (-not $SkipConnect -and (Get-Command Disconnect-ExchangeOnline -ErrorAction SilentlyContinue)) {
        Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    }
}
