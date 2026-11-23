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
            [pscustomobject]@{
                Id            = 'd1'
                Workload      = 'Exchange'
                UserId        = 'finans.uzman@contoso.com'
                Severity      = 'High'
                ExceptionInfo = 'Musteri mutabakat aktarimi'
                PolicyDetails = @(
                    [pscustomobject]@{
                        PolicyName = 'Finans-DLP'
                        Rules      = @(
                            [pscustomobject]@{
                                RuleName          = 'Dis E-posta TCKN Kurali'
                                Severity          = 'High'
                                Actions           = @('BlockAccess')
                                OverriddenActions = @('BlockAccess')
                                ConditionsMatched = [pscustomobject]@{
                                    SensitiveInformation = @(
                                        [pscustomobject]@{ SensitiveInfoTypeName = 'Turkey National Identification Number'; Count = 14 }
                                    )
                                }
                            }
                        )
                    }
                )
            }
            [pscustomobject]@{
                Id            = 'd2'
                Workload      = 'Teams'
                UserId        = '<img src=x onerror=alert(1)>@contoso.com'
                Severity      = 'Medium'
                PolicyDetails = @(
                    [pscustomobject]@{
                        PolicyName = '<img src=x onerror=alert(1)>'
                        Rules      = @(
                            [pscustomobject]@{
                                RuleName = 'Teams Kart Kurali'
                                Severity = 'Medium'
                                Actions  = @('BlockAccess')
                                ConditionsMatched = [pscustomobject]@{
                                    SensitiveInformation = @(
                                        [pscustomobject]@{ SensitiveInfoTypeName = 'Credit Card Number'; Count = 4 }
                                    )
                                }
                            }
                        )
                    }
                )
            }
        )
        AuditRecords = @(
            [pscustomobject]@{ Operation = 'SensitivityLabelApplied'; Workload = 'SharePoint'; UserId = 'analist@contoso.com'; SensitivityLabelId = 'lbl-recete'; ActionSource = 'Auto' }
            [pscustomobject]@{ Operation = 'SensitivityLabelUpdated'; Workload = 'Endpoint'; UserId = 'analist@contoso.com'; SensitivityLabelId = 'lbl-recete'; ActionSource = 'Manual' }
            [pscustomobject]@{ Operation = 'SensitivityLabelRemoved'; Workload = 'Exchange'; UserId = 'finans.uzman@contoso.com'; SensitivityLabelId = 'lbl-conf'; ActionSource = 'Manual' }
        )
        EDiscoveryCases = @(
            [pscustomobject]@{ id = 'c1'; status = 'active' }
        )
        PolicySnapshot = [pscustomobject]@{
            collectedAt = '2026-10-31T12:00:00Z'
            dlpPolicies = @(
                [pscustomobject]@{ id = 'p1'; name = 'Finans-DLP'; mode = 'Enforce'; workloadScope = @('Exchange', 'Teams'); sensitiveInfoTypes = @('Turkey National Identification Number', 'Credit Card Number'); lastModifiedAt = '2026-10-01T10:00:00Z' }
                [pscustomobject]@{ id = 'p2'; name = 'AI-Copilot-DLP'; mode = 'TestWithoutNotifications'; workloadScope = @('Microsoft 365'); sensitiveInfoTypes = @('RECETE'); lastModifiedAt = '2026-10-15T10:00:00Z' }
            )
            sensitivityLabels = @(
                [pscustomobject]@{ id = 'lbl-recete'; name = 'RECETE'; displayName = 'RECETE (Kritik Veri)'; priority = 12; encryptionEnabled = $true; markingEnabled = $true; isActive = $true; tooltip = 'Kritik veri etiketi' }
                [pscustomobject]@{ id = 'lbl-conf'; name = 'Confidential'; displayName = 'Confidential / All Employees'; priority = 5; encryptionEnabled = $true; markingEnabled = $false; isActive = $true; tooltip = 'Gizli kurumsal veri' }
            )
            sensitivityLabelCount       = 2
            sensitivityLabelPolicyCount = 2
            autoLabelPolicyCount        = 1
            retentionPolicyCount        = 0
            retentionLabelCount         = 2
            insiderRiskPolicyCount      = 2
            commCompliancePolicyCount   = 1
        }
        Sources = [ordered]@{
            AlertsV2      = [pscustomobject]@{ Name = 'Graph Security Alerts v2'; Status = 'Available'; Detail = '3 uyari' }
            Incidents     = [pscustomobject]@{ Name = 'Graph Security Incidents'; Status = 'Available'; Detail = '2 olay' }
            DlpActivity   = [pscustomobject]@{ Name = 'O365 Activity API (DLP.All)'; Status = 'Partial'; Detail = 'Son 7 gun' }
            O365AuditFeed = [pscustomobject]@{ Name = 'O365 Activity API (Audit Akislari)'; Status = 'Available'; Detail = '3 kayit' }
            AuditLog      = [pscustomobject]@{ Name = 'Graph Audit Log Queries'; Status = 'Available'; Detail = '3 kayit' }
            EDiscovery    = [pscustomobject]@{ Name = 'Graph eDiscovery Cases'; Status = 'NotLicensed'; Detail = 'Lisanssiz' }
            Policies      = [pscustomobject]@{ Name = 'Purview Politika & Etiket Envanteri'; Status = 'Available'; Detail = 'IPPS + Graph' }
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

Describe 'Purview Derin Telemetri (Etiket, DLP Kural, SIT ve Kullanici) Motoru' {
    It 'New-PurviewKpi hassasiyet etiketi kullanimi, DLP kurallari, SIT ve kullanicilari dogru hesaplar' {
        $kpi = New-PurviewKpi -Data $script:SyntheticData -Config $script:SampleConfig
        $kpi.DlpPolicyTotal | Should -Be 2
        $kpi.DlpPolicyEnforce | Should -Be 1
        $kpi.DlpPolicyTest | Should -Be 1

        # Hassasiyet Etiketi metrikleri
        $kpi.SensitivityLabelCount | Should -Be 2
        $kpi.SensitivityLabelActive | Should -Be 2
        $kpi.LabelEventsTotal | Should -Be 3
        $kpi.LabelAppliedCount | Should -Be 1
        $kpi.LabelChangedCount | Should -Be 1
        $kpi.LabelRemovedCount | Should -Be 1
        $kpi.LabelAutoCount | Should -Be 1
        $kpi.TopLabelUsage[0].Etiket | Should -Be 'RECETE (Kritik Veri)'
        $kpi.TopLabelUsage[0].Toplam | Should -Be 2

        # DLP kural, SIT ve kullanici metrikleri
        $kpi.DlpEventsTotal | Should -Be 2
        $kpi.DlpEventsHigh | Should -Be 1
        $kpi.DlpBlockedCount | Should -Be 1
        $kpi.DlpOverrideCount | Should -Be 1
        $kpi.TopDlpRules.Count | Should -Be 2
        $kpi.TopDlpSits[0].HassasBilgiTuru | Should -Be 'Turkey National Identification Number'
        $kpi.TopDlpSits[0].OrnekSayisi | Should -Be 14
        $kpi.TopDlpUsers.Count | Should -Be 2

        $edisc = @($kpi.SourceStatuses | Where-Object { $_.Key -eq 'EDiscovery' })[0]
        $edisc.Status | Should -Be 'NotLicensed'
        $edisc.Label | Should -Be 'Lisanssız'
    }

    It 'New-PurviewSampleData zengin ornek kurumsal veri seti uretir' {
        $sample = New-PurviewSampleData -Start $script:Start -End $script:End -Mode Monthly
        $kpi = New-PurviewKpi -Data $sample -Config $script:SampleConfig
        $kpi.SensitivityLabelCount | Should -Be 13
        $kpi.DlpEventsTotal | Should -BeGreaterThan 20
        $kpi.LabelEventsTotal | Should -BeGreaterThan 50
        $kpi.TopDlpUsers.Count | Should -BeGreaterOrEqual 5
        $kpi.TopDlpSits.Count | Should -BeGreaterOrEqual 4
    }
}

Describe 'HTML Rapor Guvenligi (XSS, CSP, 4 Sayfa Aylik ve 1 Sayfa Haftalik)' {
    It 'Aylik 4 sayfalik HTML raporu XSS yuklerini kacislar, Etiket/DLP/SIT/Kullanici tablolarini ve CSP icerir' {
        $kpi  = New-PurviewKpi -Data $script:SyntheticData -Config $script:SampleConfig
        $prev = [pscustomobject]@{
            DlpPolicyTotal    = 1
            DlpEventsTotal    = 4
            DlpEventsHigh     = 1
            DlpOverrideCount  = 0
            LabelAppliedCount = 2
            LabelChangedCount = 0
            TotalAlertsM365   = 2
            TotalIncidents    = 2
            AuditRecordsTotal = 2
        }
        $html = New-PurviewMonthlyHtml -k $kpi -Config $script:SampleConfig -Root $script:RepoRoot -Prev $prev

        $html | Should -Match 'Content-Security-Policy'
        $html | Should -Match "default-src 'none'"
        $html | Should -Not -Match '<script>alert\(1\)</script>'
        $html | Should -Match '&lt;script&gt;alert\(1\)&lt;/script&gt;'
        $html | Should -Not -Match '<img src=x onerror=alert\(1\)>'
        $html | Should -Match '&lt;img src=x onerror=alert\(1\)&gt;'
        $html | Should -Match 'RECETE \(Kritik Veri\)'
        $html | Should -Match 'Turkey National Identification Number'
        $html | Should -Match 'finans\.uzman@contoso\.com'
        $html | Should -Match 'Musteri mutabakat aktarimi'
        $html | Should -Match 'Sayfa 2/5'
        $html | Should -Match 'Sayfa 3/5'
        $html | Should -Match 'Sayfa 4/5'
        $html | Should -Match 'Sayfa 5/5'
        $html | Should -Match 'DLP-01'
        $html | Should -Match 'MIP-01'
    }

    It 'Haftalik HTML raporu temiz ve tek sayfalik olarak uretilir' {
        $kpi  = New-PurviewKpi -Data $script:SyntheticData -Config $script:SampleConfig
        $html = New-PurviewWeeklyHtml -k $kpi -Config $script:SampleConfig -Root $script:RepoRoot -Prev $null

        $html | Should -Match 'Haftalık Purview Veri Güvenliği Özeti'
        $html | Should -Match "default-src 'none'"
        $html | Should -Match 'Dis E-posta TCKN Kurali'
        $html | Should -Match 'RECETE \(Kritik Veri\)'
    }
}
