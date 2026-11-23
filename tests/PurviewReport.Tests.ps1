BeforeAll {
    $script:RepoRoot = Split-Path -Parent $PSScriptRoot
    $script:Root = $script:RepoRoot
    . (Join-Path $script:RepoRoot 'PurviewReport.Core.ps1')
    . (Join-Path $script:RepoRoot 'PurviewReport.Html.ps1')

    $script:SampleConfig = Get-Content (Join-Path $script:RepoRoot 'customer.example.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $script:Start = [datetime]'2026-10-01T00:00:00Z'
    $script:End   = [datetime]'2026-11-01T00:00:00Z'

    $script:SyntheticData = [pscustomobject]@{
        AlertsAll = @(
            [pscustomobject]@{ id = 'a1'; title = 'Purview DLP Critical Match'; severity = 'high'; status = 'resolved'; serviceSource = 'microsoftPurview'; category = 'DataLossPrevention'; createdDateTime = '2026-10-12T10:00:00Z' }
            [pscustomobject]@{ id = 'a2'; title = '<script>alert(1)</script>'; severity = 'medium'; status = 'new'; serviceSource = 'microsoftPurview'; category = 'InsiderRisk'; createdDateTime = '2026-10-18T11:00:00Z' }
            [pscustomobject]@{ id = 'a3'; title = 'Unrelated Defender Signin'; severity = 'low'; status = 'resolved'; serviceSource = 'microsoftDefenderForEndpoint'; category = 'InitialAccess'; createdDateTime = '2026-10-20T12:00:00Z' }
        )
        Incidents = @(
            [pscustomobject]@{ id = 'inc1'; severity = 'high'; status = 'resolved'; classification = 'truePositive'; createdDateTime = '2026-10-12T10:00:00Z'; lastUpdateDateTime = '2026-10-12T15:00:00Z' }
            [pscustomobject]@{ id = 'inc2'; severity = 'medium'; status = 'active'; classification = ''; createdDateTime = '2026-10-25T10:00:00Z'; lastUpdateDateTime = '2026-10-25T11:00:00Z' }
        )
        DlpEvents = @(
            [pscustomobject]@{ Id = 'd1'; Workload = 'Exchange'; Severity = 'High'; PolicyDetails = @([pscustomobject]@{ PolicyName = 'Finans-DLP' }) }
            [pscustomobject]@{ Id = 'd2'; Workload = 'Teams'; Severity = 'Medium'; PolicyDetails = @([pscustomobject]@{ PolicyName = '<img src=x onerror=alert(1)>' }) }
        )
        AuditRecords = @(
            [pscustomobject]@{ operation = 'DlpRuleMatch'; service = 'Compliance' }
            [pscustomobject]@{ operation = 'UserLoggedIn'; service = 'Exchange' }
        )
        EDiscoveryCases = @(
            [pscustomobject]@{ id = 'c1'; status = 'active' }
        )
        PolicySnapshot = [pscustomobject]@{
            collectedAt = '2026-10-31T12:00:00Z'
            dlpPolicies = @(
                [pscustomobject]@{ id = 'p1'; name = 'Finans-DLP'; mode = 'Enforce'; workloadScope = @('Exchange', 'Teams'); lastModifiedAt = '2026-10-01T10:00:00Z' }
                [pscustomobject]@{ id = 'p2'; name = 'AI-Copilot-DLP'; mode = 'TestWithoutNotifications'; workloadScope = @('Microsoft 365'); lastModifiedAt = '2026-10-15T10:00:00Z' }
            )
            sensitivityLabelCount       = 6
            sensitivityLabelPolicyCount = 2
            retentionPolicyCount        = 0
            insiderRiskPolicyCount      = 2
            commCompliancePolicyCount   = 1
        }
        Sources = [ordered]@{
            AlertsV2    = [pscustomobject]@{ Name = 'Graph Security Alerts v2'; Status = 'Available'; Detail = '3 uyari' }
            Incidents   = [pscustomobject]@{ Name = 'Graph Security Incidents'; Status = 'Available'; Detail = '2 olay' }
            DlpActivity = [pscustomobject]@{ Name = 'O365 Activity API (DLP.All)'; Status = 'Partial'; Detail = 'Son 7 gun' }
            AuditLog    = [pscustomobject]@{ Name = 'Graph Audit Log Queries'; Status = 'Available'; Detail = '2 kayit' }
            EDiscovery  = [pscustomobject]@{ Name = 'Graph eDiscovery Cases'; Status = 'NotLicensed'; Detail = 'Lisanssiz' }
            Policies    = [pscustomobject]@{ Name = 'Purview IPPS Politikalari'; Status = 'Available'; Detail = 'IPPS' }
        }
        Start = $script:Start
        End   = $script:End
        Mode  = 'Monthly'
    }
}

Describe 'PowerShell AST ve Dosya Hijyeni' {
    It 'Tum .ps1 dosyalari sozdizimi hatasi ve PS 5.1 uyumsuzlugu (??) icermez' {
        $psFiles = Get-ChildItem -Path $script:RepoRoot -Filter '*.ps1' -File
        $psFiles.Count | Should -BeGreaterOrEqual 5
        foreach ($file in $psFiles) {
            $tokens = $null; $errors = $null
            [void][System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
            $errors.Count | Should -Be 0 -Because "Sozdizimi hatasi olmamali: $($file.Name)"
            $raw = Get-Content -Path $file.FullName -Raw -Encoding UTF8
            $raw | Should -Not -Match '\?\?' -Because "PowerShell 5.1 uyumu icin ?? operatoru kullanilmamali: $($file.Name)"
        }
    }

    It 'Public depoda kurum, test kiracisi veya gizli bilgi sizintisi bulunmaz' {
        $forbidden = @('KocSistem', 'KoçSistem', 'kocsistem\.com', 'Eureko', 'cnrctnky', 'bb91646b-dc19-4e3f-b51b-91b358e143ab', '2fb2bcee-61be-48af-972c-0b11a606578f')
        $files = Get-ChildItem -Path $script:RepoRoot -Recurse -File |
            Where-Object {
                $_.FullName -notmatch '[\\/]\.git[\\/]' -and
                $_.FullName -notmatch '[\\/](Snapshots|Output|Archive|Logs|apps|node_modules)[\\/]' -and
                $_.Name -notin @('PurviewReport.Tests.ps1', 'customer.json', 'secret.txt', 'smtp.txt')
            }
        foreach ($file in $files) {
            $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
            if (-not $content) { continue }
            foreach ($pattern in $forbidden) {
                $content | Should -Not -Match $pattern -Because "$($file.Name) icinde '$pattern' bulunmamali"
            }
        }
    }
}

Describe 'Purview KPI ve Durum Motoru' {
    It 'New-PurviewKpi sentetik veriden dogru sayilari ve seffaf kaynak durumlarini hesaplar' {
        $kpi = New-PurviewKpi -Data $script:SyntheticData -Config $script:SampleConfig
        $kpi.DlpPolicyTotal | Should -Be 2
        $kpi.DlpPolicyEnforce | Should -Be 1
        $kpi.DlpPolicyTest | Should -Be 1
        $kpi.SensitivityLabelCount | Should -Be 6
        $kpi.RetentionPolicies | Should -Be 0
        $kpi.DlpEventsTotal | Should -Be 2
        $kpi.DlpEventsHigh | Should -Be 1
        $kpi.TotalAlertsM365 | Should -Be 3
        $kpi.PurviewAlerts | Should -Be 2
        $kpi.IncClosed | Should -Be 1
        $kpi.IncOpen | Should -Be 1
        $kpi.AvgCloseHours | Should -Be 5
        $kpi.AuditPurviewEvents | Should -Be 1

        $edisc = @($kpi.SourceStatuses | Where-Object { $_.Key -eq 'EDiscovery' })[0]
        $edisc.Status | Should -Be 'NotLicensed'
        $edisc.Label | Should -Be 'Lisanssız'
    }
}

Describe 'HTML Rapor Guvenligi (XSS, CSP ve Trend)' {
    It 'Aylik HTML raporu XSS yuklerini kacislar, siki CSP icerir ve onceki donem trendini gosterir' {
        $kpi  = New-PurviewKpi -Data $script:SyntheticData -Config $script:SampleConfig
        $prev = [pscustomobject]@{
            DlpPolicyTotal   = 1
            DlpPolicyEnforce = 1
            DlpEventsTotal   = 4
            DlpEventsHigh    = 1
            PurviewAlerts    = 1
            TotalAlertsM365  = 2
            TotalIncidents   = 2
            IncClosed        = 1
            AuditRecordsTotal= 2
        }
        $html = New-PurviewMonthlyHtml -k $kpi -Config $script:SampleConfig -Root $script:RepoRoot -Prev $prev

        $html | Should -Match 'Content-Security-Policy'
        $html | Should -Match "default-src 'none'"
        $html | Should -Not -Match '<script>alert\(1\)</script>'
        $html | Should -Match '&lt;script&gt;alert\(1\)&lt;/script&gt;'
        $html | Should -Not -Match '<img src=x onerror=alert\(1\)>'
        $html | Should -Match '&lt;img src=x onerror=alert\(1\)&gt;'
        $html | Should -Match 'Contoso Corp'
        $html | Should -Match 'Finans-DLP'
        $html | Should -Match 'Lisanssiz|Lisanssız'
    }

    It 'Haftalik HTML raporu temiz ve tek sayfalik olarak uretilir' {
        $kpi  = New-PurviewKpi -Data $script:SyntheticData -Config $script:SampleConfig
        $html = New-PurviewWeeklyHtml -k $kpi -Config $script:SampleConfig -Root $script:RepoRoot -Prev $null

        $html | Should -Match 'Haftalık Purview Veri Güvenliği Özeti'
        $html | Should -Match "default-src 'none'"
        $html | Should -Match 'AI-Copilot-DLP'
    }
}
