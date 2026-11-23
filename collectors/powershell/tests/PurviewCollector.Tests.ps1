BeforeAll {
    $script:CollectorPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'Invoke-PurviewComplianceCollect.ps1'
}

Describe 'Purview PowerShell Collector Security & Normalization' {
    It 'parses cleanly with zero AST syntax errors' {
        $tokens = $null; $errors = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile($script:CollectorPath, [ref]$tokens, [ref]$errors)
        $errors.Count | Should -Be 0
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
