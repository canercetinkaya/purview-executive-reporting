BeforeAll {
    $script:CollectorPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'Invoke-PurviewComplianceCollect.ps1'
    $script:SetupPath     = Join-Path (Split-Path -Parent $PSScriptRoot) 'Setup-PurviewTestTenant.ps1'
}

Describe 'Purview PowerShell Collector Security & Normalization' {
    It 'parses collector and setup scripts cleanly with zero AST syntax errors' {
        foreach ($path in @($script:CollectorPath, $script:SetupPath)) {
            $tokens = $null; $errors = $null
            [void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
            $errors.Count | Should -Be 0
        }
    }

    It 'requests strictly read-only application permissions in Setup-PurviewTestTenant.ps1' {
        $raw = Get-Content -Path $script:SetupPath -Raw -Encoding UTF8
        $rolesBlock = [regex]::Match($raw, '(?s)\$script:ReadOnlyRoles\s*=\s*@\((.*?)\)').Groups[1].Value
        $rolesBlock | Should -Not -BeNullOrEmpty
        $rolesBlock | Should -Not -Match 'ReadWrite' -Because 'assigned app permissions must remain strictly read-only'
        $rolesBlock | Should -Match 'SecurityAlert\.Read\.All'
        $rolesBlock | Should -Match 'ActivityFeed\.Read'
    }

    It 'contains zero state-changing Set-/New-/Remove- compliance cmdlets (strictly read-only)' {
        $raw = Get-Content -Path $script:CollectorPath -Raw -Encoding UTF8
        $raw | Should -Not -Match '\b(Set|New|Remove)-(DlpCompliancePolicy|DlpComplianceRule|Label|LabelPolicy|RetentionCompliancePolicy|InsiderRiskPolicy)\b'
        $raw | Should -Not -Match 'Invoke-Expression'
    }

    It 'produces a valid versioned JSON snapshot in -DryRunOutput mode' {
        $tempOut = Join-Path ([IO.Path]::GetTempPath()) ("purview-ps-test-" + [guid]::NewGuid().ToString('N'))
        try {
            & $script:CollectorPath -CustomerId 'cust-contoso-fin' -OutputDirectory $tempOut -DryRunOutput | Out-Null
            $jsonPath = Join-Path $tempOut 'cust-contoso-fin.purview-snapshot.json'
            Test-Path $jsonPath | Should -BeTrue
            $parsed = Get-Content -Path $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $parsed.schemaVersion | Should -Be '1.0.0'
            $parsed.customerId | Should -Be 'cust-contoso-fin'
            $parsed.dlpPolicies.Count | Should -BeGreaterOrEqual 1
            $parsed.dlpPolicies[0].mode | Should -Be 'Enforce'
        }
        finally {
            if (Test-Path $tempOut) { Remove-Item -Path $tempOut -Recurse -Force }
        }
    }
}
