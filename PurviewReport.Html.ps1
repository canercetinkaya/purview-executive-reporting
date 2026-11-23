<#
    Purview Reporting
    PurviewReport.Html.ps1  -  HTML rapor uretimi (haftalik 1 sayfa + aylik 3 sayfa A4)
#>

function ConvertTo-HtmlSafe {
    param([AllowNull()]$Value)
    if ($null -eq $Value) { return '' }
    [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

function Get-PurviewReportCss {
@'
<style>
 @page { size: A4; margin: 10mm 10mm; }
 body { font-family: "Segoe UI", Arial, sans-serif; color:#0f172a; font-size:9.5pt; margin:0; background:#fff; }
 .wrap { max-width: 900px; margin: 0 auto; padding: 6px 14px; }
 .page { page-break-after: always; }
 .page:last-child { page-break-after: auto; }
 header { border-bottom:3px solid #0f4c81; padding-bottom:6px; margin-bottom:10px; overflow:hidden; }
 header h1 { color:#0f4c81; font-size:17pt; margin:0; }
 header .sub { color:#475569; font-size:9pt; margin-top:3px; line-height:1.35; }
 .brand { float:right; color:#0f4c81; font-weight:600; font-size:10pt; }
 .logo { float:right; max-height:38px; }
 h2 { color:#0f4c81; font-size:12pt; margin:12px 0 6px; border-left:4px solid #0f4c81; padding-left:8px; }
 .cards { display:table; width:100%; table-layout:fixed; border-spacing:5px 0; margin-top:4px; }
 .card { display:table-cell; text-align:center; border:1px solid #cbd5e1; border-radius:4px; padding:7px 4px; background:#f8fafc; }
 .card b { display:block; font-size:16.5pt; color:#0f4c81; line-height:1.15; }
 .card span { font-size:7.8pt; color:#475569; }
 .card.warn { background:#fef2f2; border-color:#fecaca; }
 .card.warn b { color:#b91c1c; }
 .card.amber { background:#fffbeb; border-color:#fde68a; }
 .card.amber b { color:#b45309; }
 table { width:100%; border-collapse:collapse; margin-top:4px; font-size:8.8pt; }
 th { background:#0f4c81; color:#fff; text-align:left; padding:4px 6px; font-weight:600; }
 td { border-bottom:1px solid #e2e8f0; padding:4px 6px; vertical-align:top; }
 td.num { text-align:right; white-space:nowrap; }
 .two { display:table; width:100%; table-layout:fixed; border-spacing:10px 0; }
 .col { display:table-cell; vertical-align:top; }
 .bar { display:table; width:100%; margin:4px 0; font-size:9pt; }
 .bl { display:table-cell; width:38%; color:#334155; }
 .bt { display:table-cell; vertical-align:middle; background:#f1f5f9; border-radius:2px; }
 .bt i { display:block; height:10px; border-radius:2px; }
 .bv { display:table-cell; width:12%; text-align:right; font-weight:600; }
 .note { font-size:8pt; color:#64748b; margin-top:10px; line-height:1.45; }
 .up { color:#b91c1c; font-weight:600; }
 .down { color:#15803d; font-weight:600; }
 .flag { background:#fffbeb; border-left:4px solid #d97706; padding:7px 10px; margin:5px 0; font-size:9pt; }
 .flag.crit { background:#fef2f2; border-left-color:#b91c1c; }
 .flag.ok { background:#f0fdf4; border-left-color:#15803d; }
 .badge { display:inline-block; padding:1px 6px; border-radius:3px; font-size:8pt; font-weight:600; }
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
        'Beta'              { 'st-warn'; break }
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
    if ($k.DlpPolicyTest -ge [int]$th.TestModeDlpPolicies) {
        [void]$out.Add("<div class='flag'>$($k.DlpPolicyTest) DLP politikası hâlen Test/Denetim kipindedir; yanlış pozitif doğrulaması sonrası Enforce kipine geçiş değerlendirilmelidir.</div>")
    }
    if ($k.DlpEventsTotal -ge [int]$th.DlpEventsMonthly -and $k.Mode -eq 'Monthly') {
        [void]$out.Add("<div class='flag'>Toplam $($k.DlpEventsTotal) DLP kural eşleşmesi eşik değeri olan $($th.DlpEventsMonthly) üzerindedir.</div>")
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
    $prevNote = if ($Prev) { " Önceki hafta: $($Prev.DlpEventsTotal) DLP olayı, $($Prev.TotalAlertsM365) uyarı." } else { '' }

    $srcRows = ''
    foreach ($s in $k.SourceStatuses) {
        $srcRows += "<tr><td>$(ConvertTo-HtmlSafe $s.Name)</td><td>$(Get-StatusBadgeHtml $s.Status $s.Label)</td><td>$(ConvertTo-HtmlSafe $s.Detail)</td></tr>"
    }

    $polRows = ''
    foreach ($p in ($k.DlpPolicies | Select-Object -First 8)) {
        $scopes = ConvertTo-HtmlSafe ((@($p.workloadScope)) -join ', ')
        $polRows += "<tr><td>$(ConvertTo-HtmlSafe $p.name)</td><td>$(Get-ModeBadgeHtml $p.mode)</td><td>$scopes</td></tr>"
    }
    if (-not $polRows) { $polRows = "<tr><td colspan='3'>IPPS politika anlık görüntüsü bulunamadı.</td></tr>" }

    $alertRows = ''
    foreach ($a in ($k.TopAlerts | Select-Object -First 5)) {
        $alertRows += "<tr><td>$(ConvertTo-HtmlSafe $a.Baslik)</td><td>$(ConvertTo-HtmlSafe $a.Siddet)</td><td>$(ConvertTo-HtmlSafe $a.Tarih)</td></tr>"
    }
    if (-not $alertRows) { $alertRows = "<tr><td colspan='3'>Bu hafta yeni uyarı kaydedilmedi.</td></tr>" }

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
    <div class='card'><b>$($k.DlpPolicyTotal)</b><span>DLP politikası ($($k.DlpPolicyEnforce) Enforce)</span></div>
    <div class='card $(if($k.DlpPolicyTest -gt 0){'amber'})'><b>$($k.DlpPolicyTest)</b><span>Test kipinde DLP</span></div>
    <div class='card'><b>$($k.DlpEventsTotal)</b><span>DLP olay eşleşmesi</span></div>
    <div class='card'><b>$($k.PurviewAlerts)</b><span>Purview uyarısı ($($k.TotalAlertsM365) M365)</span></div>
    <div class='card $(if($k.IncOpen -gt 0){'warn'})'><b>$($k.IncOpen)</b><span>Açık incident</span></div>
    <div class='card'><b>$($k.SensitivityLabelPolicies)</b><span>Etiket / $($k.InsiderRiskPolicies) İç Tehdit pol.</span></div>
  </div>

  <h2>Dikkat Gerektiren Başlıklar</h2>
  $flags

  <div class='two'>
    <div class='col'>
      <h2>Son Güvenlik Uyarıları</h2>
      <table><tr><th>Uyarı Başlığı</th><th>Şiddet</th><th>Tarih</th></tr>$alertRows</table>
    </div>
    <div class='col'>
      <h2>Veri Kaynağı Sağlık Matrisi</h2>
      <table><tr><th>Kaynak</th><th>Durum</th><th>Kapsam</th></tr>$srcRows</table>
    </div>
  </div>

  <h2>DLP Politika Envanteri Özeti</h2>
  <table><tr><th>Politika Adı</th><th>Kip</th><th>İş Yükü Kapsamı</th></tr>$polRows</table>

  <p class='note'>Bu özet Microsoft Graph Security v2, Office 365 Management Activity API (DLP.All) ve salt okunur IPPS anlık görüntüsünden üretilmiştir.
  Ayrıntılı dönem kıyaslaması ve yönetim önerileri aylık raporda yer alır.$prevNote Gizlilik: Kuruma Özel.</p>
</div>
</div></body></html>
"@
}

# --------------------------------------------------------------------- AYLIK
function New-PurviewMonthlyHtml {
    param($k, $Config, [string]$Root, $Prev)

    $tr       = [Globalization.CultureInfo]::GetCultureInfo('tr-TR')
    $bas      = [datetime]$k.DonemBaslangic
    $donem    = $bas.ToString('MMMM yyyy', $tr)
    $logo     = Get-PurviewLogoHtml $Config $Root
    $flags    = Get-PurviewFlag $k $Config
    $customer = ConvertTo-HtmlSafe $Config.CustomerName
    $provider = ConvertTo-HtmlSafe (Get-ProviderName $Config)

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

    $sevMax = @($k.IncHigh, $k.IncMedium, $k.IncLow, $k.IncInfo | Measure-Object -Maximum).Maximum
    $sbars  = (Get-PurviewBar 'High (Kritik)' $k.IncHigh   $sevMax '#b91c1c') +
              (Get-PurviewBar 'Medium'        $k.IncMedium $sevMax '#d97706') +
              (Get-PurviewBar 'Low'           $k.IncLow    $sevMax '#2563eb') +
              (Get-PurviewBar 'Informational' $k.IncInfo   $sevMax '#94a3b8')

    $srcRows = ''
    foreach ($s in $k.SourceStatuses) {
        $srcRows += "<tr><td>$(ConvertTo-HtmlSafe $s.Name)</td><td>$(Get-StatusBadgeHtml $s.Status $s.Label)</td><td>$(ConvertTo-HtmlSafe $s.Detail)</td></tr>"
    }

    $topDlpRows = ''
    foreach ($d in $k.TopDlpPolicies) {
        $topDlpRows += "<tr><td>$(ConvertTo-HtmlSafe $d.Politika)</td><td class='num'>$($d.Adet)</td></tr>"
    }
    if (-not $topDlpRows) { $topDlpRows = "<tr><td colspan='2'>Bu pencerede DLP olay eşleşmesi kaydedilmedi.</td></tr>" }

    $alertRows = ''
    foreach ($a in $k.TopAlerts) {
        $alertRows += "<tr><td>$(ConvertTo-HtmlSafe $a.Baslik)</td><td>$(ConvertTo-HtmlSafe $a.Siddet)</td><td>$(ConvertTo-HtmlSafe $a.Durum)</td><td>$(ConvertTo-HtmlSafe $a.Tarih)</td></tr>"
    }
    if (-not $alertRows) { $alertRows = "<tr><td colspan='4'>Dönem boyunca yeni uyarı kaydedilmedi.</td></tr>" }

    $polRows = ''
    foreach ($p in $k.DlpPolicies) {
        $scopes = ConvertTo-HtmlSafe ((@($p.workloadScope)) -join ', ')
        $modDate = if ($p.lastModifiedAt) { try { ([datetime]$p.lastModifiedAt).ToString('dd.MM.yyyy') } catch { '-' } } else { '-' }
        $polRows += "<tr><td>$(ConvertTo-HtmlSafe $p.name)</td><td>$(Get-ModeBadgeHtml $p.mode)</td><td>$scopes</td><td class='num'>$modDate</td></tr>"
    }
    if (-not $polRows) { $polRows = "<tr><td colspan='4'>IPPS anlık görüntüsü sağlanmadığı için DLP politikası listelenemedi.</td></tr>" }

    $clsRows = ''
    if ($k.Classification -and $k.Classification.Count -gt 0) {
        $clsRows = ($k.Classification.GetEnumerator() | Sort-Object Value -Descending |
            ForEach-Object { "<tr><td>$(ConvertTo-HtmlSafe $_.Key)</td><td class='num'>$($_.Value)</td></tr>" }) -join ''
    }
    if (-not $clsRows) { $clsRows = "<tr><td colspan='2'>Sınıflandırılmış incident bulunmuyor.</td></tr>" }

    $recRows = ''
    $idx = 1
    foreach ($r in $k.Recommendations) {
        $recRows += "<tr><td class='num'>$idx</td><td>$(ConvertTo-HtmlSafe $r)</td></tr>"
        $idx++
    }

    $trendCumle = ''
    if ($Prev) {
        $yon = if ($k.TotalAlertsM365 -ge $Prev.TotalAlertsM365) { 'artış' } else { 'azalış' }
        $trendCumle = "Önceki aya göre toplam güvenlik uyarısı sayısı $yon göstermiştir ($($Prev.TotalAlertsM365) -&gt; $($k.TotalAlertsM365))."
    }

    $snapNote = if ($k.SnapshotCollectedAt) {
        try { "Son IPPS toplama: $(([datetime]$k.SnapshotCollectedAt).ToString('dd.MM.yyyy HH:mm UTC'))." } catch { '' }
    } else { 'IPPS anlık görüntüsü henüz alınmadı.' }

@"
<!DOCTYPE html><html lang='tr'><head><meta charset='utf-8'>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
<title>Aylık Purview Veri Güvenliği Raporu</title>
$(Get-PurviewReportCss)</head><body><div class='wrap'>

<div class='page'>
  <header>$logo<h1>Aylık Purview Veri Güvenliği ve Uyumluluk Raporu</h1>
  <div class='sub'>$customer &nbsp;|&nbsp; Microsoft Purview Yönetilen Hizmet Raporu<br>
  Dönem: $donem &nbsp;|&nbsp; Rapor tarihi: $(Get-Date -Format 'dd.MM.yyyy') &nbsp;|&nbsp; Hizmet sağlayıcı: $provider</div></header>

  <h2>Yönetici Özeti</h2>
  <p>$donem döneminde $customer kiracısında <b>$($k.DlpPolicyTotal)</b> DLP politikası (<b>$($k.DlpPolicyEnforce)</b> Enforce, <b>$($k.DlpPolicyTest)</b> Test),
  <b>$($k.SensitivityLabelPolicies)</b> hassasiyet etiketi politikası, <b>$($k.InsiderRiskPolicies)</b> iç tehdit ve <b>$($k.CommCompliancePolicies)</b> iletişim uyumu politikası takip edilmiştir.
  Dönem içinde <b>$($k.DlpEventsTotal)</b> DLP olay eşleşmesi, <b>$($k.PurviewAlerts)</b> Purview uyarısı (toplam <b>$($k.TotalAlertsM365)</b> M365 uyarısı) ve
  <b>$($k.TotalIncidents)</b> güvenlik olayı işlenmiştir; bunların <b>$($k.IncClosed)</b> tanesi kapatılmış, <b>$($k.IncOpen)</b> tanesi açık durumdadır. $trendCumle</p>

  <h2>Dikkat Gerektiren Başlıklar</h2>
  $flags

  <h2>Purview Politika ve Koruma Kapsamı</h2>
  <div class='cards'>
    <div class='card'><b>$($k.DlpPolicyTotal)</b><span>Toplam DLP politikası</span></div>
    <div class='card'><b>$($k.DlpPolicyEnforce)</b><span>Enforce kipinde</span></div>
    <div class='card $(if($k.DlpPolicyTest -gt 0){'amber'})'><b>$($k.DlpPolicyTest)</b><span>Test kipinde</span></div>
    <div class='card'><b>$($k.SensitivityLabelPolicies)</b><span>Etiket politikası</span></div>
    <div class='card'><b>$($k.InsiderRiskPolicies)</b><span>İç Tehdit politikası</span></div>
    <div class='card'><b>$($k.RetentionPolicies)</b><span>Saklama politikası</span></div>
  </div>

  <div class='two'>
    <div class='col'><h2>DLP İş Yükü Kapsamı</h2>$wlBars</div>
    <div class='col'><h2>Diğer Purview Kapsamı</h2>
      <table>
        <tr><th>Kontrol Alanı</th><th>Adet</th></tr>
        <tr><td>Hassasiyet Etiketi Tanımı</td><td class='num'>$($k.SensitivityLabelCount)</td></tr>
        <tr><td>İletişim Uyumu Politikası</td><td class='num'>$($k.CommCompliancePolicies)</td></tr>
        <tr><td>Purview Audit Kayıtları</td><td class='num'>$($k.AuditPurviewEvents)</td></tr>
        <tr><td>eDiscovery Vakaları (Açık / Toplam)</td><td class='num'>$($k.EDiscoveryCasesOpen) / $($k.EDiscoveryCasesTotal)</td></tr>
      </table>
    </div>
  </div>

  <h2>Veri Kaynağı Sağlık Matrisi</h2>
  <table><tr><th>Veri Kaynağı</th><th>Durum</th><th>Doğrulama ve Kapsam Notu</th></tr>$srcRows</table>
  <p class='note'>$snapNote Eksik izin veya lisans nedeniyle alınamayan veriler sıfır olarak varsayılmaz, açıkça durum etiketiyle belirtilir.</p>
</div>

<div class='page'>
  <header><span class='brand'>$provider</span><h1>Olay, DLP ve Dönem Trend Özeti</h1>
  <div class='sub'>$customer &nbsp;|&nbsp; $donem</div></header>

  <h2>Aylık Purview ve Güvenlik KPI Kıyaslaması</h2>
  <table>
    <tr><th>KPI</th><th>Bu dönem</th><th>Önceki dönem</th><th>Değişim</th></tr>
    <tr><td>Toplam DLP politikası</td><td class='num'>$($k.DlpPolicyTotal)</td>$(Get-PurviewTrendCell 'DlpPolicyTotal' $k.DlpPolicyTotal $Prev)</tr>
    <tr><td>Enforce kipindeki DLP politikası</td><td class='num'>$($k.DlpPolicyEnforce)</td>$(Get-PurviewTrendCell 'DlpPolicyEnforce' $k.DlpPolicyEnforce $Prev)</tr>
    <tr><td>DLP olay eşleşmesi (Activity API)</td><td class='num'>$($k.DlpEventsTotal)</td>$(Get-PurviewTrendCell 'DlpEventsTotal' $k.DlpEventsTotal $Prev)</tr>
    <tr><td>Yüksek şiddetli DLP olayı</td><td class='num'>$($k.DlpEventsHigh)</td>$(Get-PurviewTrendCell 'DlpEventsHigh' $k.DlpEventsHigh $Prev)</tr>
    <tr><td>Purview ilişkili güvenlik uyarısı</td><td class='num'>$($k.PurviewAlerts)</td>$(Get-PurviewTrendCell 'PurviewAlerts' $k.PurviewAlerts $Prev)</tr>
    <tr><td>Toplam M365 güvenlik uyarısı (alerts_v2)</td><td class='num'>$($k.TotalAlertsM365)</td>$(Get-PurviewTrendCell 'TotalAlertsM365' $k.TotalAlertsM365 $Prev)</tr>
    <tr><td>Toplam güvenlik olayı (incidents)</td><td class='num'>$($k.TotalIncidents)</td>$(Get-PurviewTrendCell 'TotalIncidents' $k.TotalIncidents $Prev)</tr>
    <tr><td>Kapatılan güvenlik olayı</td><td class='num'>$($k.IncClosed)</td>$(Get-PurviewTrendCell 'IncClosed' $k.IncClosed $Prev)</tr>
    <tr><td>Denetim kaydı (Audit Log)</td><td class='num'>$($k.AuditRecordsTotal)</td>$(Get-PurviewTrendCell 'AuditRecordsTotal' $k.AuditRecordsTotal $Prev)</tr>
  </table>

  <div class='two'>
    <div class='col'><h2>Incident Şiddet Dağılımı</h2>$sbars
      <p class='note'>Toplam incident: $($k.TotalIncidents) &nbsp;|&nbsp; Kapatılan: $($k.IncClosed) &nbsp;|&nbsp; Açık: $($k.IncOpen)<br>
      Ortalama kapanış süresi: $($k.AvgCloseHours) saat</p>
    </div>
    <div class='col'><h2>En Çok Tetiklenen DLP Politikaları</h2>
      <table><tr><th>DLP Politikası</th><th>Olay</th></tr>$topDlpRows</table>
    </div>
  </div>

  <h2>Son Purview ve M365 Güvenlik Uyarıları</h2>
  <table><tr><th>Uyarı Başlığı</th><th>Şiddet</th><th>Durum</th><th>Tarih</th></tr>$alertRows</table>

  <p class='note'>Not: Office 365 Management Activity API canlı sorguları son 7 günü kapsar; haftalık görevlerle biriken arşivler aylık raporda otomatik birleştirilir.</p>
</div>

<div class='page'>
  <header><span class='brand'>$provider</span><h1>Politika Envanteri ve Hizmet Aksiyonları</h1>
  <div class='sub'>$customer &nbsp;|&nbsp; $donem</div></header>

  <h2>Aktif DLP Politika Envanteri</h2>
  <table>
    <tr><th>Politika Adı</th><th>Kip</th><th>İş Yükü Kapsamı</th><th style='text-align:right'>Son Güncelleme</th></tr>
    $polRows
  </table>

  <h2>Yönetilen Hizmet Faaliyetleri</h2>
  <div class='cards'>
    <div class='card'><b>$($k.InvestigatedIncidents)</b><span>İncelenen olay</span></div>
    <div class='card'><b>$($k.IncClosed)</b><span>Kapatılan olay</span></div>
    <div class='card'><b>$($k.AvgCloseHours) sa</b><span>Ort. kapanış süresi</span></div>
    <div class='card'><b>$($k.AuditPurviewEvents)</b><span>Purview audit olayı</span></div>
    <div class='card'><b>$($k.EDiscoveryCasesTotal)</b><span>Takip edilen vaka</span></div>
  </div>

  <div class='two'>
    <div class='col'><h2>Incident Sınıflandırması</h2><table><tr><th>Sınıflandırma</th><th>Adet</th></tr>$clsRows</table></div>
    <div class='col'><h2>Gelecek Ay İçin Öncelikli Aksiyonlar</h2><table><tr><th>#</th><th>Öneri</th></tr>$recRows</table></div>
  </div>

  <p class='note'>Bu rapor $provider tarafından Microsoft Purview, Microsoft Graph Security v2 ve Office 365 Management Activity API verilerinden salt okunur erişimle otomatik üretilmiştir.
  Üretim zamanı: $(Get-Date -Format 'dd.MM.yyyy HH:mm'). Gizlilik: Kuruma Özel.</p>
</div>

</div></body></html>
"@
}
