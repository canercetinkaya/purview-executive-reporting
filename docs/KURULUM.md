# Kurulum, Kimlik Doğrulama Seçenekleri ve Geri Dönüş Kılavuzu

Bu doküman, `Purview Executive Reporting` servisinin sıfırdan kurulumunu, **Secret (DPAPI)** ve **X.509 Sertifika (Katılımsız IPPS)** yapılandırmasını, mevcut bir test kiracısında `DLP.All` (`ActivityFeed.ReadDlp`) yetkisinin nasıl açılacağını ve geri dönüş adımlarını açıklar.

## 1. Sıfırdan Kurulum (`Install-PurviewReport.ps1`)

```powershell
cd C:\PurviewReport
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
Get-ChildItem *.ps1 | Unblock-File
.\Install-PurviewReport.ps1
```

Kurulum sihirbazı otomatik olarak:
1. Tek kiracılı `Purview-Report-<Kurum>` Entra ID uygulamasını açar,
2. Microsoft Graph (`SecurityAlert.Read.All`, `SecurityIncident.Read.All`, `AuditLogsQuery.Read.All`, `InformationProtectionPolicy.Read.All`, `RecordsManagement.Read.All`, `eDiscovery.Read.All`) ve Office 365 Management API (`ActivityFeed.Read`, **`ActivityFeed.ReadDlp`**) izinlerini ekleyip yönetici onayını (`Admin Consent`) verir,
3. Gizli anahtarı Windows **DPAPI** (`secret.txt`) ile şifreler,
4. `customer.json` yapılandırmasını yazar ve 9 adımlı erişim testini (`.\New-PurviewReport.ps1 -Test`) çalıştırır,
5. Haftalık (`Purview-WeeklyReport`) ve Aylık (`Purview-MonthlyReport`) Windows Task Scheduler görevlerini kurar.

## 2. X.509 Sertifika ile %100 Katılımsız IPPS (`Connect-IPPSSession`) Kurulumu

Security & Compliance PowerShell (`Get-Label`, `Get-DlpComplianceRule`, `Export-ActivityExplorerData`) uygulama modunda (`App-Only`) istemci gizli anahtarı yerine **X.509 Sertifikası** ister. Katılımsız IPPS toplamasını etkinleştirmek için:

```powershell
# 1. Sunucuda 24 ay geçerli sertifika üretin ve genel anahtarı (.cer) dışa aktarın
$cert = New-SelfSignedCertificate -Subject "CN=Purview-Reporting-Cert" -CertStoreLocation "Cert:\CurrentUser\My" -KeyExportPolicy Exportable -KeySpec Signature -KeyLength 2048 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddMonths(24)
Export-Certificate -Cert $cert -FilePath ".\Purview-Reporting.cer"

# 2. Entra ID > App registrations > Purview-Report-<Kurum> > Certificates & secrets altından Purview-Reporting.cer dosyasını yükleyin
# 3. API permissions > Add a permission > APIs my organization uses > Office 365 Exchange Online > Application permissions > Exchange.ManageAsApp ekleyin ve Admin Consent verin
# 4. Entra ID > Roles and administrators > Compliance Reader (veya Global Reader) rolüne bu uygulamayı (Service Principal) atayın
```

Ardından `customer.json` içinde `"AuthMode": "Certificate"` ve `"CertificateThumbprint": "<Thumbprint>"` yazarak veya doğrudan şu komutla katılımsız politika ve aktivite envanteri çekebilirsiniz:

```powershell
.\Collect-PurviewPolicies.ps1 `
  -Organization contoso.onmicrosoft.com `
  -AppId "<ClientId>" `
  -CertificateThumbprint $cert.Thumbprint `
  -IncludeAuditTelemetry
```

## 3. Örnek Kurumsal Raporları Üretme (`-SampleDemo`)

Herhangi bir kiracı bağlantısı olmadan tüm tabloların (13 Hassasiyet Etiketi, Etiket Uygulama/Düşürme/Silme, En Çok Eşleşen DLP Kuralları, SIT'ler, En Çok DLP Tetikleyen Kullanıcılar, Override Gerekçeleri ve Trend) dolu olduğu örnek A4 HTML ve PDF raporları üretmek için:

```powershell
.\New-PurviewReport.ps1 -Mode Monthly -SampleDemo -DryRun -Pdf
.\New-PurviewReport.ps1 -Mode Weekly  -SampleDemo -DryRun -Pdf
```

## 4. Geri Dönüş (Kaldırma) Planı

```powershell
Unregister-ScheduledTask -TaskName 'Purview-WeeklyReport'  -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'Purview-MonthlyReport' -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item .\secret.txt, .\smtp.txt, .\customer.json -ErrorAction SilentlyContinue
```
