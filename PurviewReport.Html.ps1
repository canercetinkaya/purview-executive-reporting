<#
    Purview Reporting
    PurviewReport.Html.ps1  -  HTML rapor uretimi (haftalik 1 sayfa + aylik 4 sayfa A4)
#>

function ConvertTo-HtmlSafe {
    param([AllowNull()]$Value)
    if ($null -eq $Value) { return '' }
    [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

function Get-PurviewReportCss {
@'
<style>
 @page { size: A4; margin: 9mm 9mm; }
 body { font-family: "Segoe UI", Arial, sans-serif; color:#0f172a; font-size:9pt; margin:0; background:#fff; }
 .wrap { max-width: 920px; margin: 0 auto; padding: 4px 12px; }
 .page { page-break-after: always; }
 .page:last-child { page-break-after: auto; }
 header { border-bottom:3px solid #0f4c81; padding-bottom:5px; margin-bottom:8px; overflow:hidden; }
 header h1 { color:#0f4c81; font-size:16pt; margin:0; }
 header .sub { color:#475569; font-size:8.5pt; margin-top:2px; line-height:1.35; }
 .brand { float:right; color:#0f4c81; font-weight:600; font-size:9.5pt; }
 .logo { float:right; max-height:36px; }
 h2 { color:#0f4c81; font-size:11pt; margin:10px 0 5px; border-left:4px solid #0f4c81; padding-left:7px; }
 p { margin: 5px 0; line-height: 1.4; }
 .cards { display:table; width:100%; table-layout:fixed; border-spacing:5px 0; margin-top:4px; }
 .card { display:table-cell; text-align:center; border:1px solid #cbd5e1; border-radius:4px; padding:6px 3px; background:#f8fafc; }
 .card b { display:block; font-size:15.5pt; color:#0f4c81; line-height:1.15; }
 .card span { font-size:7.5pt; color:#475569; }
 .card.warn { background:#fef2f2; border-color:#fecaca; }
 .card.warn b { color:#b91c1c; }
 .card.amber { background:#fffbeb; border-color:#fde68a; }
 .card.amber b { color:#b45309; }
 .card.good { background:#f0fdf4; border-color:#bbf7d0; }
 .card.good b { color:#15803d; }
 table { width:100%; border-collapse:collapse; margin-top:4px; font-size:8.3pt; }
 th { background:#0f4c81; color:#fff; text-align:left; padding:3.5px 6px; font-weight:600; }
 td { border-bottom:1px solid #e2e8f0; padding:3.5px 6px; vertical-align:top; }
 td.num { text-align:right; white-space:nowrap; }
 .two { display:table; width:100%; table-layout:fixed; border-spacing:8px 0; }
 .col { display:table-cell; vertical-align:top; }
 .bar { display:table; width:100%; margin:3px 0; font-size:8.3pt; }
 .bl { display:table-cell; width:40%; color:#334155; }
 .bt { display:table-cell; vertical-align:middle; background:#f1f5f9; border-radius:2px; }
 .bt i { display:block; height:9px; border-radius:2px; }
 .bv { display:table-cell; width:12%; text-align:right; font-weight:600; }
 .note { font-size:7.6pt; color:#64748b; margin-top:7px; line-height:1.4; }
 .up { color:#b91c1c; font-weight:600; }
 .down { color:#15803d; font-weight:600; }
 .flag { background:#fffbeb; border-left:4px solid #d97706; padding:5px 8px; margin:4px 0; font-size:8.4pt; }
 .flag.crit { background:#fef2f2; border-left-color:#b91c1c; }
 .flag.ok { background:#f0fdf4; border-left-color:#15803d; }
 .badge { display:inline-block; padding:1px 5px; border-radius:3px; font-size:7.6pt; font-weight:600; }
 .st-ok { background:#dcfce7; color:#166534; }
 .st-warn { background:#fef3c7; color:#92400e; }
 .st-bad { background:#fee2e2; color:#991b1b; }
 .st-muted { background:#f1f5f9; color:#475569; }
</style>
'@
}

function Get-PurviewBar {
    param([string]$Label, [double]$Value, [double]$Max, [string]$Color = '#0f4c81')
    $pct = if ($Max -gt 0) { [math]::Round(($Value / $Max) * 100, 0) } else { 0 }
    if ($Value -gt 0 -and $pct -lt 4) { $pct = 4 }
    $safeLabel = ConvertTo-HtmlSafe $Label
    "<div class='bar'><span class='bl'>$safeLabel</span><span class='bt'><i style='width:$pct%;background:$Color'></i></span><span class='bv'>$Value</span></div>"
}

function Get-PurviewTrendCell {
    param([string]$Field, [double]$Now, $Prev)
    if (-not $Prev -or $null -eq $Prev.$Field) { return "<td class='num'>-</td><td class='num'>-</td>" }
    $p = [double]$Prev.$Field
    $d = $Now - $p
    if ($d -eq 0) { return "<td class='num'>$p</td><td class='num'>değişim yok</td>" }
    $pct = if ($p -gt 0) { ' (%' + [math]::Abs([math]::Round(($d / $p) * 100, 0)) + ')' } else { '' }
    $cls = if ($d -gt 0) { 'up' } else { 'down' }
    $sgn = if ($d -gt 0) { '+' } else { '' }
    "<td class='num'>$p</td><td class='num $cls'>$sgn$d$pct</td>"
}

function Get-PurviewLogoHtml {
    param($Config, [string]$Root)
    if ($Config.Report -and $Config.Report.LogoPath) {
        $lp = Join-Path $Root $Config.Report.LogoPath
        if (Test-Path $lp) {
            $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($lp))
            return "<img class='logo' alt='Logo' src='data:image/png;base64,$b64'/>"
        }
    }
    $provider = ConvertTo-HtmlSafe (Get-ProviderName $Config)
    "<span class='brand'>$provider</span>"
}

function Get-StatusBadgeHtml {
    param([string]$Status, [string]$Label)
    $cls = switch ($Status) {
        'Available'         { 'st-ok'; break }
        'Partial'           { 'st-warn'; break }
        'Beta'              { 'st-ok'; break }
        'SnapshotRequired'  { 'st-warn'; break }
        'NotLicensed'       { 'st-muted'; break }
        default             { 'st-bad' }
    }
    "<span class='badge $cls'>$(ConvertTo-HtmlSafe $Label)</span>"
}

function Get-ModeBadgeHtml {
    param([string]$Mode)
    $cls = switch ($Mode) {
        'Enforce'                 { 'st-ok'; break }
        'TestWithNotifications'   { 'st-warn'; break }
        'TestWithoutNotifications'{ 'st-warn'; break }
        default                   { 'st-muted' }
    }
    $lbl = switch ($Mode) {
        'Enforce'                  { 'Zorunlu (Enforce)'; break }
        'TestWithNotifications'    { 'Test + Bildirim'; break }
        'TestWithoutNotifications' { 'Sessiz Test'; break }
        default                    { 'Devre Dışı' }
    }
    "<span class='badge $cls'>$lbl</span>"
}

function Get-ActionBadgeHtml {
    param([string]$Action)
    switch ($Action) {
        'Block'             { return "<span class='badge st-ok'>Engellendi (Block)</span>" }
        'BlockWithOverride' { return "<span class='badge st-warn'>Engel + Override</span>" }
        'Override'          { return "<span class='badge st-bad'>Kullanıcı Override</span>" }
        'Notify'            { return "<span class='badge st-warn'>Bildirim</span>" }
        default             { return "<span class='badge st-muted'>Denetim (Audit)</span>" }
    }
}

function Get-PostureBadgeHtml {
    param([string]$Status)
    switch ($Status) {
        'Pass'  { return "<span class='badge st-ok'>GEÇTİ</span>" }
        'Warn'  { return "<span class='badge st-warn'>DİKKAT</span>" }
        default { return "<span class='badge st-bad'>AÇIK (RİSK)</span>" }
    }
}

function Get-PurviewFlag {
    param($k, $Config)
    $th = $Config.Thresholds
    $out = New-Object System.Collections.ArrayList

    if ($k.IncOpen -ge [int]$th.OpenIncidents) {
        [void]$out.Add("<div class='flag crit'>$($k.IncOpen) güvenlik olayı açık durumdadır ve analist takibi gerektirmektedir.</div>")
    }
    if ($k.AlertHigh -ge [int]$th.HighSeverityAlerts) {
        [void]$out.Add("<div class='flag crit'>Dönem içinde $($k.AlertHigh) yüksek şiddetli uyarı kaydedilmiştir.</div>")
    }
    if ($k.DlpOverrideCount -gt 0) {
        [void]$out.Add("<div class='flag crit'>DLP engeli $($k.DlpOverrideCount) kez kullanıcı gerekçesiyle aşılmıştır (Override); veri çıkışı gerekçeleri doğrulanmalıdır.</div>")
    }
    if ($k.LabelRemovedCount -gt 0 -or $k.LabelChangedCount -gt 0) {
        [void]$out.Add("<div class='flag'>$($k.LabelChangedCount) hassasiyet etiketi değişimi/düşürmesi ve $($k.LabelRemovedCount) etiket kaldırma işlemi tespit edilmiştir.</div>")
    }
    if ($k.DlpPolicyTest -ge [int]$th.TestModeDlpPolicies) {
        [void]$out.Add("<div class='flag'>$($k.DlpPolicyTest) DLP politikası hâlen Test/Denetim kipindedir; yanlış pozitif doğrulaması sonrası Enforce kipine geçiş değerlendirilmelidir.</div>")
    }
    $missing = @($k.SourceStatuses | Where-Object { $_.Status -in @('PermissionMissing', 'Unavailable', 'SnapshotRequired') })
    if ($missing.Count -gt 0) {
        $names = ($missing | ForEach-Object { ConvertTo-HtmlSafe $_.Name }) -join ', '
        [void]$out.Add("<div class='flag'>Kısmi görünürlük: $names kaynakları için ek izin veya IPPS anlık görüntüsü beklenmektedir.</div>")
    }
    if ($out.Count -eq 0) {
        [void]$out.Add("<div class='flag ok'>Bu dönemde kritik eşik değerlerini aşan bir Purview bulgusu tespit edilmemiştir.</div>")
    }
    return ($out -join '')
}

# ------------------------------------------------------------------ HAFTALIK
function New-PurviewWeeklyHtml {
    param($k, $Config, [string]$Root, $Prev)

    $tr       = [Globalization.CultureInfo]::GetCultureInfo('tr-TR')
    $bas      = [datetime]$k.DonemBaslangic
    $bit      = [datetime]$k.DonemBitis
    $donem    = '{0} - {1}' -f $bas.ToString('dd MMMM', $tr), $bit.ToString('dd MMMM yyyy', $tr)
    $logo     = Get-PurviewLogoHtml $Config $Root
    $flags    = Get-PurviewFlag $k $Config
    $customer = ConvertTo-HtmlSafe $Config.CustomerName
    $provider = ConvertTo-HtmlSafe (Get-ProviderName $Config)
    $prevNote = if ($Prev) { " Önceki hafta: $($Prev.DlpEventsTotal) DLP olayı, $($Prev.LabelEventsTotal) etiket işlemi." } else { '' }

    $dlpRuleRows = ''
    foreach ($r in ($k.TopDlpRules | Select-Object -First 4)) {
        $dlpRuleRows += "<tr><td>$(ConvertTo-HtmlSafe $r.Kural)</td><td>$(Get-ActionBadgeHtml $r.Aksiyon)</td><td class='num'>$($r.Adet)</td></tr>"
    }
    if (-not $dlpRuleRows) {
        foreach ($p in ($k.DlpPolicies | Select-Object -First 4)) {
            $dlpRuleRows += "<tr><td>$(ConvertTo-HtmlSafe $p.name)</td><td>$(Get-ModeBadgeHtml $p.mode)</td><td class='num'>0</td></tr>"
        }
    }
    if (-not $dlpRuleRows) { $dlpRuleRows = "<tr><td colspan='3'>Bu hafta DLP eşleşmesi kaydedilmedi.</td></tr>" }

    $userRows = ''
    foreach ($u in ($k.TopDlpUsers | Select-Object -First 4)) {
        $userRows += "<tr><td>$(ConvertTo-HtmlSafe $u.Kullanici)</td><td class='num'>$($u.ToplamOlay)</td><td class='num'>$($u.Override)</td><td>$(ConvertTo-HtmlSafe $u.IsYukleri)</td></tr>"
    }
    if (-not $userRows) {
        foreach ($au in ($k.TopAuditActors | Select-Object -First 4)) {
            $userRows += "<tr><td>$(ConvertTo-HtmlSafe $au.Kullanici)</td><td class='num'>$($au.Adet) (Audit)</td><td class='num'>0</td><td>Purview / M365</td></tr>"
        }
    }
    if (-not $userRows) { $userRows = "<tr><td colspan='4'>Bu hafta DLP tetikleyen kullanıcı kaydı yok.</td></tr>" }

    $lblRows = ''
    if ($k.TopLabelUsage -and @($k.TopLabelUsage).Count -gt 0) {
        foreach ($lu in ($k.TopLabelUsage | Select-Object -First 5)) {
            $lblRows += "<tr><td>$(ConvertTo-HtmlSafe $lu.Etiket)</td><td class='num'>$($lu.Uygulama)</td><td class='num'>$($lu.Degisim)</td><td class='num'>$($lu.Silme)</td></tr>"
        }
    }
    else {
        foreach ($l in ($k.SensitivityLabels | Where-Object { $_.isActive } | Sort-Object priority -Descending | Select-Object -First 5)) {
            $lblRows += "<tr><td>$(ConvertTo-HtmlSafe $l.displayName) (Öncelik: $($l.priority))</td><td class='num'>0</td><td class='num'>0</td><td class='num'>0</td></tr>"
        }
    }
    if (-not $lblRows) { $lblRows = "<tr><td colspan='4'>Etiket verisi bulunamadı.</td></tr>" }

    $srcRows = ''
    foreach ($s in $k.SourceStatuses) {
        $srcRows += "<tr><td>$(ConvertTo-HtmlSafe $s.Name)</td><td>$(Get-StatusBadgeHtml $s.Status $s.Label)</td><td>$(ConvertTo-HtmlSafe $s.Detail)</td></tr>"
    }

@"
<!DOCTYPE html><html lang='tr'><head><meta charset='utf-8'>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
<title>Haftalık Purview Özeti</title>
$(Get-PurviewReportCss)</head><body><div class='wrap'>
<div class='page'>
  <header>$logo<h1>Haftalık Purview Veri Güvenliği Özeti</h1>
  <div class='sub'>$customer &nbsp;|&nbsp; Microsoft Purview Yönetilen Uyumluluk Hizmeti<br>
  Dönem: $donem &nbsp;|&nbsp; Üretim: $(Get-Date -Format 'dd.MM.yyyy HH:mm') &nbsp;|&nbsp; $provider</div></header>

  <div class='cards'>
    <div class='card'><b>$($k.DlpPolicyTotal)</b><span>DLP pol. ($($k.DlpPolicyEnforce) Enforce)</span></div>
    <div class='card'><b>$($k.SensitivityLabelActive) / $($k.SensitivityLabelCount)</b><span>Aktif hassasiyet etiketi</span></div>
    <div class='card'><b>$($k.LabelEventsTotal)</b><span>Etiket işlemi ($($k.LabelChangedCount) değişim)</span></div>
    <div class='card $(if($k.DlpEventsHigh -gt 0){'warn'})'><b>$($k.DlpEventsTotal)</b><span>DLP olayı ($($k.DlpOverrideCount) override)</span></div>
    <div class='card $(if($k.IncOpen -gt 0){'warn'})'><b>$($k.IncOpen)</b><span>Açık incident ($($k.TotalAlertsM365) uyarı)</span></div>
    <div class='card'><b>$($k.AuditRecordsTotal)</b><span>Denetim günlüğü kaydı</span></div>
  </div>

  <h2>Dikkat Gerektiren Başlıklar</h2>
  $flags

  <div class='two'>
    <div class='col'>
      <h2>DLP Kural Eşleşmeleri / Politikalar</h2>
      <table><tr><th>Kural / Politika</th><th>Aksiyon / Kip</th><th style='text-align:right'>Olay</th></tr>$dlpRuleRows</table>
      <h2>En Çok DLP / Denetim Tetikleyen Kullanıcılar</h2>
      <table><tr><th>Kullanıcı</th><th style='text-align:right'>Olay</th><th style='text-align:right'>Override</th><th>İş Yükü</th></tr>$userRows</table>
    </div>
    <div class='col'>
      <h2>Hassasiyet Etiketleri ve Kullanım Özeti</h2>
      <table><tr><th>Etiket</th><th style='text-align:right'>Uygulama</th><th style='text-align:right'>Değişim</th><th style='text-align:right'>Silme</th></tr>$lblRows</table>
      <h2>Veri Kaynağı Sağlık Matrisi</h2>
      <table><tr><th>Kaynak</th><th>Durum</th><th>Kapsam</th></tr>$srcRows</table>
    </div>
  </div>

  <p class='note'>Bu özet Microsoft Graph Security v2, Graph Information Protection, Office 365 Management Activity API ve salt okunur IPPS envanterinden üretilmiştir.
  Ayrıntılı hassasiyet etiketi analizi, SIT dağılımı, kullanıcı override gerekçeleri ve dönem kıyaslaması 4 sayfalık aylık raporda yer alır.$prevNote Gizlilik: Kuruma Özel.</p>
</div>
</div></body></html>
"@
}

# --------------------------------------------------------------- AYLIK (4 S)
function New-PurviewMonthlyHtml {
    param($k, $Config, [string]$Root, $Prev)

    $tr       = [Globalization.CultureInfo]::GetCultureInfo('tr-TR')
    $bas      = [datetime]$k.DonemBaslangic
    $donem    = $bas.ToString('MMMM yyyy', $tr)
    $logo     = Get-PurviewLogoHtml $Config $Root
    $flags    = Get-PurviewFlag $k $Config
    $customer = ConvertTo-HtmlSafe $Config.CustomerName
    $provider = ConvertTo-HtmlSafe (Get-ProviderName $Config)

    # --- Sayfa 1 Verileri ---
    $wlMax = 1
    if ($k.DlpWorkloadScope -and $k.DlpWorkloadScope.Count -gt 0) {
        $wlMax = ($k.DlpWorkloadScope.Values | Measure-Object -Maximum).Maximum
    }
    $wlBars = ''
    if ($k.DlpWorkloadScope -and $k.DlpWorkloadScope.Count -gt 0) {
        $wlBars = ($k.DlpWorkloadScope.GetEnumerator() | Sort-Object Value -Descending |
            ForEach-Object { Get-PurviewBar $_.Key $_.Value $wlMax '#0f4c81' }) -join ''
    }
    else {
        $wlBars = "<p class='note'>İş yükü dağılımı için IPPS politika anlık görüntüsü beklenmektedir.</p>"
    }

    $srcRows = ''
    foreach ($s in $k.SourceStatuses) {
        $srcRows += "<tr><td>$(ConvertTo-HtmlSafe $s.Name)</td><td>$(Get-StatusBadgeHtml $s.Status $s.Label)</td><td>$(ConvertTo-HtmlSafe $s.Detail)</td></tr>"
    }

    $trendCumle = ''
    if ($Prev) {
        $yon = if ($k.DlpEventsTotal -ge $Prev.DlpEventsTotal) { 'artış' } else { 'azalış' }
        $trendCumle = "Önceki döneme göre DLP olay sayısı $yon göstermiştir ($($Prev.DlpEventsTotal) -&gt; $($k.DlpEventsTotal))."
    }

    $snapNote = if ($k.SnapshotCollectedAt) {
        try { "Son envanter toplama: $(([datetime]$k.SnapshotCollectedAt).ToString('dd.MM.yyyy HH:mm UTC'))." } catch { '' }
    } else { '' }

    # --- Sayfa 2: CISO Guvenlik Durusu (10 Hijyen Kontrolu) ve Veri Sizinti Kanallari ---
    $postureRows = ''
    if ($k.PSObject.Properties['PostureChecks'] -and $k.PostureChecks) {
        foreach ($pc in $k.PostureChecks) {
            $postureRows += "<tr><td><b>$(ConvertTo-HtmlSafe $pc.Code)</b></td><td>$(ConvertTo-HtmlSafe $pc.Title)</td><td>$(Get-PostureBadgeHtml $pc.Status)</td><td>$(ConvertTo-HtmlSafe $pc.Detail)</td></tr>"
        }
    }
    if (-not $postureRows) { $postureRows = "<tr><td colspan='4'>Yapılandırma hijyeni kontrol verisi bulunamadı.</td></tr>" }

    $egressRows = ''
    if ($k.PSObject.Properties['EgressChannels'] -and $k.EgressChannels) {
        foreach ($eg in $k.EgressChannels) {
            $egressRows += "<tr><td>$(ConvertTo-HtmlSafe $eg.Kanal)</td><td class='num'><b>$($eg.Adet)</b></td></tr>"
        }
    }
    if (-not $egressRows) { $egressRows = "<tr><td colspan='2'>Sızıntı kanalı verisi bulunamadı.</td></tr>" }

    $mandBadge = if ($k.LabelPolicyMandatory) { "<span class='badge st-ok'>Açık (Mandatory)</span>" } else { "<span class='badge st-warn'>Kapalı (İsteğe Bağlı)</span>" }
    $downBadge = if ($k.LabelPolicyDowngradeReq) { "<span class='badge st-ok'>Zorunlu (Açık)</span>" } else { "<span class='badge st-bad'>Kapalı</span>" }

    # --- Sayfa 3: Hassasiyet Etiketleri (Sensitivity Labels) ---
    $labelInvRows = ''
    foreach ($l in ($k.SensitivityLabels | Sort-Object priority -Descending | Select-Object -First 13)) {
        $stBadge = if ($l.isActive) { "<span class='badge st-ok'>Aktif</span>" } else { "<span class='badge st-muted'>Üst Grup</span>" }
        $prot    = if ($l.encryptionEnabled) { "<span class='badge st-ok'>RMS Şifreli</span>" } else { "<span class='badge st-muted'>Sınıflandırma</span>" }
        $fmt     = if ($l.contentType) { ConvertTo-HtmlSafe $l.contentType } else { 'file, email' }
        $tip     = ConvertTo-HtmlSafe $l.tooltip
        if ($tip.Length -gt 58) { $tip = $tip.Substring(0, 55) + '...' }
        $labelInvRows += "<tr><td><b>$(ConvertTo-HtmlSafe $l.displayName)</b></td><td class='num'>$($l.priority)</td><td>$prot</td><td>$fmt</td><td>$stBadge</td><td>$tip</td></tr>"
    }
    if (-not $labelInvRows) { $labelInvRows = "<tr><td colspan='6'>Hassasiyet etiketi tanımı bulunamadı.</td></tr>" }

    $labelUsageRows = ''
    foreach ($lu in $k.TopLabelUsage) {
        $labelUsageRows += "<tr><td>$(ConvertTo-HtmlSafe $lu.Etiket)</td><td class='num'>$($lu.Uygulama)</td><td class='num'>$($lu.Degisim)</td><td class='num'>$($lu.Silme)</td><td class='num'><b>$($lu.Toplam)</b></td></tr>"
    }
    if (-not $labelUsageRows) {
        $labelUsageRows = "<tr><td colspan='5'>Bu dönemde etiket uygulama veya düşürme olayı kaydedilmedi (envanterde $($k.SensitivityLabelCount) etiket tanımlı).</td></tr>"
    }

    $labelUserRows = ''
    foreach ($lu in $k.TopLabelUsers) {
        $labelUserRows += "<tr><td>$(ConvertTo-HtmlSafe $lu.Kullanici)</td><td>$(ConvertTo-HtmlSafe $lu.IsYuku)</td><td class='num'>$($lu.Uygulama)</td><td class='num'>$($lu.Degisim)</td><td class='num'>$($lu.Silme)</td></tr>"
    }
    if (-not $labelUserRows) {
        $labelUserRows = "<tr><td colspan='5'>Dönem içinde kullanıcı bazlı etiket değişikliği kaydedilmedi.</td></tr>"
    }

    # --- Sayfa 3: DLP Kural, SIT ve Kullanıcı Analizi ---
    $dlpRuleTableRows = ''
    foreach ($r in $k.TopDlpRules) {
        $dlpRuleTableRows += "<tr><td>$(ConvertTo-HtmlSafe $r.Politika)</td><td>$(ConvertTo-HtmlSafe $r.Kural)</td><td>$(ConvertTo-HtmlSafe $r.Siddet)</td><td>$(Get-ActionBadgeHtml $r.Aksiyon)</td><td class='num'><b>$($r.Adet)</b></td><td class='num'>$($r.Override)</td></tr>"
    }
    if (-not $dlpRuleTableRows) {
        $dlpRuleTableRows = "<tr><td colspan='6'>Bu dönemde DLP kural eşleşmesi kaydedilmedi ($($k.DlpPolicyTotal) DLP politikası izleniyor).</td></tr>"
    }

    $sitRows = ''
    foreach ($s in $k.TopDlpSits) {
        $sitRows += "<tr><td>$(ConvertTo-HtmlSafe $s.HassasBilgiTuru)</td><td class='num'>$($s.OlaySayisi)</td><td class='num'><b>$($s.OrnekSayisi)</b></td></tr>"
    }
    if (-not $sitRows) {
        $sitRows = "<tr><td colspan='3'>Bu dönemde hassas bilgi türü (SIT) eşleşmesi kaydedilmedi.</td></tr>"
    }

    $dlpWlBars = ''
    if ($k.DlpWorkloadHits -and $k.DlpWorkloadHits.Count -gt 0) {
        $maxDwl = ($k.DlpWorkloadHits.Values | Measure-Object -Maximum).Maximum
        $dlpWlBars = ($k.DlpWorkloadHits.GetEnumerator() | Sort-Object Value -Descending |
            ForEach-Object { Get-PurviewBar $_.Key $_.Value $maxDwl '#0f4c81' }) -join ''
    }
    else {
        $dlpWlBars = $wlBars
    }

    $dlpUserRows = ''
    foreach ($u in $k.TopDlpUsers) {
        $just = if ($u.Gerekce) { ConvertTo-HtmlSafe $u.Gerekce } else { '-' }
        $dlpUserRows += "<tr><td><b>$(ConvertTo-HtmlSafe $u.Kullanici)</b></td><td class='num'>$($u.ToplamOlay)</td><td class='num'>$($u.YuksekSiddet)</td><td class='num'>$($u.Engellenen)</td><td class='num'>$($u.Override)</td><td class='num'>$($u.HassasOrnek)</td><td>$(ConvertTo-HtmlSafe $u.IsYukleri)</td><td>$just</td></tr>"
    }
    if (-not $dlpUserRows) {
        $dlpUserRows = "<tr><td colspan='8'>Dönem içinde DLP kuralı tetikleyen kullanıcı kaydı bulunmuyor.</td></tr>"
    }

    # --- Sayfa 4: Trend, Politika Envanteri, Denetim ve Öneriler ---
    $polRows = ''
    foreach ($p in $k.DlpPolicies) {
        $scopes = ConvertTo-HtmlSafe ((@($p.workloadScope)) -join ', ')
        $sits   = if ($p.PSObject.Properties['sensitiveInfoTypes'] -and @($p.sensitiveInfoTypes).Count -gt 0) {
            ConvertTo-HtmlSafe ((@($p.sensitiveInfoTypes)) -join ', ')
        } else { 'Politika varsayılan SIT kuralları' }
        $modDate = if ($p.lastModifiedAt) { try { ([datetime]$p.lastModifiedAt).ToString('dd.MM.yyyy') } catch { '-' } } else { '-' }
        $polRows += "<tr><td>$(ConvertTo-HtmlSafe $p.name)</td><td>$(Get-ModeBadgeHtml $p.mode)</td><td>$scopes</td><td>$sits</td><td class='num'>$modDate</td></tr>"
    }
    if (-not $polRows) { $polRows = "<tr><td colspan='5'>IPPS anlık görüntüsü sağlanmadığı için DLP politikası listelenemedi.</td></tr>" }

    $alertRows = ''
    foreach ($a in ($k.TopAlerts | Select-Object -First 5)) {
        $alertRows += "<tr><td>$(ConvertTo-HtmlSafe $a.Baslik)</td><td>$(ConvertTo-HtmlSafe $a.Siddet)</td><td>$(ConvertTo-HtmlSafe $a.Durum)</td><td class='num'>$(ConvertTo-HtmlSafe $a.Tarih)</td></tr>"
    }
    if (-not $alertRows) { $alertRows = "<tr><td colspan='4'>Dönem boyunca yeni uyarı kaydedilmedi.</td></tr>" }

    $auditOpRows = ''
    foreach ($op in ($k.TopAuditOperations | Select-Object -First 5)) {
        $auditOpRows += "<tr><td>$(ConvertTo-HtmlSafe $op.Operasyon)</td><td class='num'>$($op.Adet)</td></tr>"
    }
    if (-not $auditOpRows) { $auditOpRows = "<tr><td colspan='2'>Denetim operasyonu kaydı yok.</td></tr>" }

    $recRows = ''
    $idx = 1
    foreach ($r in $k.Recommendations) {
        $recRows += "<tr><td class='num'>$idx</td><td>$(ConvertTo-HtmlSafe $r)</td></tr>"
        $idx++
    }

@"
<!DOCTYPE html><html lang='tr'><head><meta charset='utf-8'>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
<title>Aylık Purview Veri Güvenliği Raporu</title>
$(Get-PurviewReportCss)</head><body><div class='wrap'>

<div class='page'>
  <header>$logo<h1>Aylık Purview Veri Güvenliği ve Uyumluluk Raporu</h1>
  <div class='sub'>$customer &nbsp;|&nbsp; Microsoft Purview Yönetilen Hizmet Raporu (Sayfa 1/5 — Yönetici Özeti)<br>
  Dönem: $donem &nbsp;|&nbsp; Rapor tarihi: $(Get-Date -Format 'dd.MM.yyyy') &nbsp;|&nbsp; Hizmet sağlayıcı: $provider</div></header>

  <h2>Yönetici Özeti</h2>
  <p>$donem döneminde $customer kiracısında <b>$($k.DlpPolicyTotal)</b> DLP politikası (<b>$($k.DlpPolicyEnforce)</b> Enforce, <b>$($k.DlpPolicyTest)</b> Test),
  <b>$($k.SensitivityLabelCount)</b> hassasiyet etiketi tanımı (<b>$($k.SensitivityLabelActive)</b> aktif), <b>$($k.SensitivityLabelPolicies)</b> etiket yayınlama politikası,
  <b>$($k.InsiderRiskPolicies)</b> iç tehdit ve <b>$($k.CommCompliancePolicies)</b> iletişim uyumu politikası izlenmiştir.
  Yapılandırma hijyeni denetiminde <b>$($k.PostureTotalCount)</b> kontrolün <b>$($k.PosturePassCount)</b> tanesi tam uyumlu bulunmuş, <b>$($k.PostureWarnCount + $k.PostureFailCount)</b> iyileştirme alanı tespit edilmiştir.
  Dönem boyunca <b>$($k.DlpEventsTotal)</b> DLP kural eşleşmesi (<b>$($k.DlpBlockedCount)</b> engelleme, <b>$($k.DlpOverrideCount)</b> kullanıcı override),
  <b>$($k.LabelEventsTotal)</b> hassasiyet etiketi işlemi (<b>$($k.LabelAppliedCount)</b> uygulama, <b>$($k.LabelChangedCount)</b> değişim/düşürme, <b>$($k.LabelRemovedCount)</b> silme)
  ve <b>$($k.TotalIncidents)</b> güvenlik olayı (<b>$($k.IncClosed)</b> kapatılan, <b>$($k.IncOpen)</b> açık) kaydedilmiştir. $trendCumle</p>

  <h2>Dikkat Gerektiren Başlıklar</h2>
  $flags

  <h2>Purview Koruma ve Operasyon Özeti</h2>
  <div class='cards'>
    <div class='card'><b>$($k.PosturePassCount) / $($k.PostureTotalCount)</b><span>Hijyen kontrolü geçti</span></div>
    <div class='card'><b>$($k.DlpPolicyTotal)</b><span>DLP pol. ($($k.DlpPolicyEnforce) Enforce)</span></div>
    <div class='card $(if($k.DlpEventsHigh -gt 0){'warn'})'><b>$($k.DlpEventsTotal)</b><span>DLP olayı ($($k.DlpEventsHigh) yüksek)</span></div>
    <div class='card $(if($k.DlpOverrideCount -gt 0){'amber'})'><b>$($k.DlpBlockedCount) / $($k.DlpOverrideCount)</b><span>DLP Engel / Override</span></div>
    <div class='card'><b>$($k.SensitivityLabelActive) / $($k.SensitivityLabelCount)</b><span>Aktif hassasiyet etiketi</span></div>
    <div class='card $(if($k.IncOpen -gt 0){'warn'})'><b>$($k.IncOpen) / $($k.TotalIncidents)</b><span>Açık / Toplam incident</span></div>
  </div>

  <div class='two'>
    <div class='col'><h2>DLP Politika İş Yükü Kapsamı</h2>$wlBars</div>
    <div class='col'><h2>Veri Yönetişimi ve Uyumluluk Kapsamı</h2>
      <table>
        <tr><th>Purview Kontrol Alanı</th><th style='text-align:right'>Kapsam / Adet</th></tr>
        <tr><td>Hassasiyet Etiketi Yayınlama / Otomatik Etiket Pol.</td><td class='num'>$($k.SensitivityLabelPolicies) / $($k.AutoLabelPolicies)</td></tr>
        <tr><td>Veri Saklama (Retention) Politikası / Kayıt Etiketi</td><td class='num'>$($k.RetentionPolicies) / $($k.RetentionLabels)</td></tr>
        <tr><td>İç Tehdit Yönetimi (Insider Risk) Politikası</td><td class='num'>$($k.InsiderRiskPolicies)</td></tr>
        <tr><td>İletişim Uyumu (Communication Compliance) Politikası</td><td class='num'>$($k.CommCompliancePolicies)</td></tr>
        <tr><td>Birleşik Denetim Kaydı (Toplam / Purview İlişkili)</td><td class='num'>$($k.AuditRecordsTotal) / $($k.AuditPurviewEvents)</td></tr>
        <tr><td>eDiscovery Vakaları (Açık / Toplam)</td><td class='num'>$($k.EDiscoveryCasesOpen) / $($k.EDiscoveryCasesTotal)</td></tr>
      </table>
    </div>
  </div>

  <h2>Veri Kaynağı Sağlık ve Bağlantı Matrisi</h2>
  <table><tr><th>Veri Kaynağı</th><th>Durum</th><th>Doğrulama ve Kapsam Notu</th></tr>$srcRows</table>
  <p class='note'>$snapNote Eksik izin veya lisans nedeniyle alınamayan veriler sıfır olarak varsayılmaz, açıkça durum etiketiyle belirtilir.</p>
</div>

<div class='page'>
  <header><span class='brand'>$provider</span><h1>CISO Güvenlik Duruşu, Yapılandırma Hijyeni ve Sızıntı Kanalları</h1>
  <div class='sub'>$customer &nbsp;|&nbsp; $donem (Sayfa 2/5 — Posture Hygiene, Exfiltration Channels &amp; Managed Service Value)</div></header>

  <div class='cards'>
    <div class='card good'><b>$($k.PosturePassCount)</b><span>Tam uyumlu kontrol (GEÇTİ)</span></div>
    <div class='card $(if($k.PostureWarnCount -gt 0){'amber'})'><b>$($k.PostureWarnCount)</b><span>İyileştirme önerisi (DİKKAT)</span></div>
    <div class='card $(if($k.PostureFailCount -gt 0){'warn'})'><b>$($k.PostureFailCount)</b><span>Mimari kör nokta (AÇIK)</span></div>
    <div class='card good'><b>$($k.DlpBlockedCount)</b><span>Önlenen veri çıkışı (Block)</span></div>
    <div class='card'><b>$($k.GovernanceDriftCount)</b><span>Yönetişim / politika işlemi</span></div>
  </div>

  <h2>10 Maddelik Purview Yapılandırma Hijyeni ve Kör Nokta Denetimi</h2>
  <table>
    <tr><th>Kod</th><th>Kontrol Başlığı</th><th>Durum</th><th>Canlı Kiracı Bulgusu ve Mimari Değerlendirme</th></tr>
    $postureRows
  </table>

  <div class='two'>
    <div class='col'>
      <h2>Veri Sızıntı Kanalları (Exfiltration / Egress Vectors)</h2>
      <table>
        <tr><th>Veri Çıkış / Paylaşım Kanalı</th><th style='text-align:right'>Tespit / Olay</th></tr>
        $egressRows
      </table>
    </div>
    <div class='col'>
      <h2>Küresel Bilgi Koruma ve Yönetişim Duruşu</h2>
      <table>
        <tr><th>Politika Parametresi</th><th>Durum</th></tr>
        <tr><td>Zorunlu Etiketleme (isMandatory)</td><td>$mandBadge</td></tr>
        <tr><td>Etiket Düşürme Gerekçesi (Downgrade Justification)</td><td>$downBadge</td></tr>
        <tr><td>Otomatik / Varsayılan Etiketleme İşlemi</td><td><b>$($k.LabelAutoCount)</b> otomatik / <b>$($k.LabelEventsTotal)</b> toplam</td></tr>
        <tr><td>İncelenen / Kapatılan Güvenlik Olayı (MTTR)</td><td><b>$($k.IncClosed)</b> kapatılan (Ort. <b>$($k.AvgCloseHours) sa</b>)</td></tr>
        <tr><td>Yönetici Politika ve Arama İşlemi (Admin Drift)</td><td><b>$($k.GovernanceDriftCount)</b> işlem denetlendi</td></tr>
      </table>
    </div>
  </div>

  <p class='note'>Not: Yapılandırma hijyeni kontrolleri deterministik olarak IPPS politika envanteri, Microsoft Graph labelPolicySettings ve sensitivityLabels API yanıtlarından hesaplanır; ağırlıklı yapay skor yerine her kontrolün gerçek geçme/kalma kanıtı sunulur.</p>
</div>

<div class='page'>
  <header><span class='brand'>$provider</span><h1>Hassasiyet Etiketleri ve Bilgi Koruma Analizi</h1>
  <div class='sub'>$customer &nbsp;|&nbsp; $donem (Sayfa 3/5 — Information Protection &amp; Sensitivity Labels)</div></header>

  <div class='cards'>
    <div class='card'><b>$($k.SensitivityLabelActive) / $($k.SensitivityLabelCount)</b><span>Aktif / Toplam etiket tanımı</span></div>
    <div class='card'><b>$($k.LabelEventsTotal)</b><span>Toplam etiket işlemi</span></div>
    <div class='card good'><b>$($k.LabelAppliedCount)</b><span>Etiket uygulama (Applied)</span></div>
    <div class='card $(if($k.LabelChangedCount -gt 0){'amber'})'><b>$($k.LabelChangedCount)</b><span>Etiket değişimi / düşürme</span></div>
    <div class='card $(if($k.LabelRemovedCount -gt 0){'warn'})'><b>$($k.LabelRemovedCount)</b><span>Etiket kaldırma (Removed)</span></div>
  </div>

  <h2>Kiracı Hassasiyet Etiketi Envanteri (Information Protection)</h2>
  <table>
    <tr><th>Etiket Görünen Adı</th><th style='text-align:right'>Öncelik</th><th>Koruma Biçimi</th><th>Kapsam Formatları</th><th>Durum</th><th>Politika Açıklaması</th></tr>
    $labelInvRows
  </table>

  <div class='two'>
    <div class='col'>
      <h2>Etiket Bazlı Kullanım ve Değişim Dağılımı</h2>
      <table>
        <tr><th>Etiket</th><th style='text-align:right'>Uyg.</th><th style='text-align:right'>Değ.</th><th style='text-align:right'>Silme</th><th style='text-align:right'>Toplam</th></tr>
        $labelUsageRows
      </table>
    </div>
    <div class='col'>
      <h2>En Çok Etiket İşlemi Yapan Kullanıcılar</h2>
      <table>
        <tr><th>Kullanıcı</th><th>İş Yükü</th><th style='text-align:right'>Uyg.</th><th style='text-align:right'>Değ.</th><th style='text-align:right'>Silme</th></tr>
        $labelUserRows
      </table>
    </div>
  </div>

  <p class='note'>Not: Hassasiyet etiketi tanımları IPPS (Get-Label) ve Microsoft Graph Information Protection API üzerinden doğrulanır.
  Yüksek öncelikli etiketlerden (ör. RECETE, Highly Confidential) daha düşük seviyeye yapılan indirmeler (downgrade) denetim kaydı gerektirir.</p>
</div>

<div class='page'>
  <header><span class='brand'>$provider</span><h1>DLP Eşleşmeleri, Hassas Bilgi Türleri ve Kullanıcılar</h1>
  <div class='sub'>$customer &nbsp;|&nbsp; $donem (Sayfa 4/5 — Data Loss Prevention Derin Analizi)</div></header>

  <div class='cards'>
    <div class='card'><b>$($k.DlpEventsTotal)</b><span>Toplam DLP eşleşmesi</span></div>
    <div class='card $(if($k.DlpEventsHigh -gt 0){'warn'})'><b>$($k.DlpEventsHigh)</b><span>Yüksek şiddetli DLP</span></div>
    <div class='card good'><b>$($k.DlpBlockedCount)</b><span>Engellenen (Block)</span></div>
    <div class='card $(if($k.DlpOverrideCount -gt 0){'warn'})'><b>$($k.DlpOverrideCount)</b><span>Kullanıcı Override</span></div>
    <div class='card'><b>$($k.DlpNotifyCount + $k.DlpAuditCount)</b><span>Bildirim / Denetim</span></div>
  </div>

  <h2>En Çok Eşleşen DLP Politikaları ve Kuralları</h2>
  <table>
    <tr><th>Politika Adı</th><th>Eşleşen Kural</th><th>Şiddet</th><th>Alınan Aksiyon</th><th style='text-align:right'>Olay</th><th style='text-align:right'>Override</th></tr>
    $dlpRuleTableRows
  </table>

  <div class='two'>
    <div class='col'>
      <h2>En Çok Eşleşen Hassas Bilgi Türleri (SIT)</h2>
      <table>
        <tr><th>Hassas Bilgi Türü (SIT)</th><th style='text-align:right'>Olay</th><th style='text-align:right'>Tespit Örneği</th></tr>
        $sitRows
      </table>
    </div>
    <div class='col'>
      <h2>DLP Olaylarının İş Yükü Dağılımı</h2>
      $dlpWlBars
    </div>
  </div>

  <h2>En Çok DLP Tetikleyen Kullanıcılar ve Override Gerekçeleri</h2>
  <table>
    <tr><th>Kullanıcı (UPN)</th><th style='text-align:right'>Olay</th><th style='text-align:right'>Yüksek</th><th style='text-align:right'>Engel</th><th style='text-align:right'>Override</th><th style='text-align:right'>SIT Örneği</th><th>İş Yükleri</th><th>Son Override Gerekçesi</th></tr>
    $dlpUserRows
  </table>

  <p class='note'>Kaynak: Office 365 Management Activity API (DLP.All), Unified Audit Log (DlpRuleMatch) ve IPPS DLP kural envanteri.</p>
</div>

<div class='page'>
  <header><span class='brand'>$provider</span><h1>Dönem Trendi, Politika Envanteri ve Aksiyon Planı</h1>
  <div class='sub'>$customer &nbsp;|&nbsp; $donem (Sayfa 5/5 — Trend, Denetim ve Yönetim Önerileri)</div></header>

  <h2>Aylık Purview ve Güvenlik KPI Kıyaslaması</h2>
  <table>
    <tr><th>KPI</th><th style='text-align:right'>Bu dönem</th><th style='text-align:right'>Önceki dönem</th><th style='text-align:right'>Değişim</th></tr>
    <tr><td>Toplam DLP politikası / Enforce kipinde</td><td class='num'>$($k.DlpPolicyTotal) ($($k.DlpPolicyEnforce))</td>$(Get-PurviewTrendCell 'DlpPolicyTotal' $k.DlpPolicyTotal $Prev)</tr>
    <tr><td>DLP kural eşleşmesi (Toplam)</td><td class='num'>$($k.DlpEventsTotal)</td>$(Get-PurviewTrendCell 'DlpEventsTotal' $k.DlpEventsTotal $Prev)</tr>
    <tr><td>Yüksek şiddetli DLP olayı</td><td class='num'>$($k.DlpEventsHigh)</td>$(Get-PurviewTrendCell 'DlpEventsHigh' $k.DlpEventsHigh $Prev)</tr>
    <tr><td>DLP kullanıcı override sayısı</td><td class='num'>$($k.DlpOverrideCount)</td>$(Get-PurviewTrendCell 'DlpOverrideCount' $k.DlpOverrideCount $Prev)</tr>
    <tr><td>Hassasiyet etiketi uygulama (Applied)</td><td class='num'>$($k.LabelAppliedCount)</td>$(Get-PurviewTrendCell 'LabelAppliedCount' $k.LabelAppliedCount $Prev)</tr>
    <tr><td>Hassasiyet etiketi değişim / kaldırma</td><td class='num'>$($k.LabelChangedCount + $k.LabelRemovedCount)</td>$(Get-PurviewTrendCell 'LabelChangedCount' ($k.LabelChangedCount + $k.LabelRemovedCount) $Prev)</tr>
    <tr><td>Purview / M365 güvenlik uyarısı (alerts_v2)</td><td class='num'>$($k.TotalAlertsM365)</td>$(Get-PurviewTrendCell 'TotalAlertsM365' $k.TotalAlertsM365 $Prev)</tr>
    <tr><td>Güvenlik olayı (Toplam / Kapatılan)</td><td class='num'>$($k.TotalIncidents) ($($k.IncClosed))</td>$(Get-PurviewTrendCell 'TotalIncidents' $k.TotalIncidents $Prev)</tr>
    <tr><td>Birleşik denetim kaydı (Unified Audit)</td><td class='num'>$($k.AuditRecordsTotal)</td>$(Get-PurviewTrendCell 'AuditRecordsTotal' $k.AuditRecordsTotal $Prev)</tr>
  </table>

  <h2>Aktif DLP Politika Envanteri</h2>
  <table>
    <tr><th>Politika Adı</th><th>Kip</th><th>İş Yükü Kapsamı</th><th>Korunan Hassas Bilgi Türleri (SIT)</th><th style='text-align:right'>Son Güncelleme</th></tr>
    $polRows
  </table>

  <div class='two'>
    <div class='col'>
      <h2>Son Güvenlik Uyarıları (alerts_v2)</h2>
      <table><tr><th>Uyarı Başlığı</th><th>Şiddet</th><th>Durum</th><th style='text-align:right'>Tarih</th></tr>$alertRows</table>
      <h2>En Sık Denetim Operasyonları</h2>
      <table><tr><th>Operasyon</th><th style='text-align:right'>Kayıt</th></tr>$auditOpRows</table>
    </div>
    <div class='col'>
      <h2>Gelecek Ay İçin Öncelikli Aksiyonlar</h2>
      <table><tr><th>#</th><th>Öneri</th></tr>$recRows</table>
    </div>
  </div>

  <p class='note'>Bu rapor $provider tarafından Microsoft Purview, Microsoft Graph Security v2 ve Office 365 Management Activity API verilerinden salt
  okunur erişimle otomatik üretilmiştir. Üretim zamanı: $(Get-Date -Format 'dd.MM.yyyy HH:mm'). Gizlilik: Kuruma Özel.</p>
</div>

</div></body></html>
"@
}
