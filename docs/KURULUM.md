# Kurulum, İzin Kısıtlama ve Geri Dönüş Kılavuzu

Bu doküman, `Purview Executive Reporting` servisinin sıfırdan kurulumunu, en az ayrıcalıklı yetki sınırlandırmasını ve gerektiğinde tek adımda kaldırılmasını açıklar.

## 1. Ön Koşullar

- **İşletim Sistemi:** Windows 10 / 11 veya Windows Server 2019 / 2022+
- **PowerShell:** Windows PowerShell 5.1 veya PowerShell 7.x
- **PDF Üretimi (Opsiyonel):** Microsoft Edge kuruluysa rapor otomatik olarak A4 PDF dosyasına dönüştürülür; yoksa HTML gönderilir.
- **IPPS Politika Envanteri (Opsiyonel):** `ExchangeOnlineManagement` modülü (`Install-Module ExchangeOnlineManagement -Scope CurrentUser`).

## 2. Kurulum Adımları

1. Klasöre geçin ve **`Kurulum-Baslat.cmd`** dosyasını çalıştırın veya PowerShell açın:
   ```powershell
   cd C:\PurviewReport
   .\Install-PurviewReport.ps1
   ```
2. Sihirbaz sizden şu bilgileri ister:
   - Kurum adı, hizmet sağlayıcı adı, kiracı alan adı veya GUID (`contoso.onmicrosoft.com`)
   - Haftalık ve/veya aylık zamanlama günü ve saati
   - Mail gönderim yöntemi (**Graph `sendMail`** veya **SMTP**)
3. Tarayıcıda açılan Microsoft Device Code ekranında Global Administrator veya Privileged Role Administrator hesabıyla onay verin. Sihirbaz otomatik olarak:
   - `Purview-Report-<Kurum>` tek kiracılı uygulamasını oluşturur,
   - Salt okunur izinleri tanımlayıp yönetici onayını verir,
   - Gizli anahtarı DPAPI ile şifreleyerek `secret.txt` dosyasına yazar,
   - `customer.json` yapılandırmasını oluşturur,
   - 8 adımlı erişim testini çalıştırır,
   - `Purview-WeeklyReport` ve `Purview-MonthlyReport` Windows Task Scheduler görevlerini kurar.

## 3. Üretim Sertleştirme Önerileri

### A. Graph `Mail.Send` İzni Tek Posta Kutusuna Kısıtlama
Exchange Online PowerShell üzerinde `New-ApplicationAccessPolicy` kullanarak uygulamanın yalnızca belirlenen gönderici posta kutusundan mail atmasını sağlayın:

```powershell
New-ApplicationAccessPolicy `
  -AppId "<ClientId>" `
  -PolicyScopeGroupId "purview-report@contoso.com" `
  -AccessRight RestrictAccess `
  -Description "Purview Reporting sendMail kisitlamasi"
```

### B. IPPS Politika Envanterini Katılımsız Çalıştırma
Haftalık görev öncesinde DLP ve Etiket politikalarını da otomatik güncellemek için `Exchange.ManageAsApp` rolü ve sertifika parmak iziyle şu komutu ayrı bir zamanlanmış görev olarak ekleyebilirsiniz:

```powershell
.\Collect-PurviewPolicies.ps1 `
  -Organization contoso.onmicrosoft.com `
  -AppId "<ClientId>" `
  -CertificateThumbprint "<Thumbprint>"
```

## 4. Gizli Anahtar Yenileme ve Bakım

- `secret.txt` Windows **DPAPI** (`CurrentUser`) ile şifrelenmiştir; dosyayı başka makineye kopyalamak yetmez, yeni makinede sihirbazı yeniden çalıştırın.
- İstemci gizli anahtarı varsayılan olarak 12 ay geçerlidir; süresi dolmadan önce Entra ID üzerinden yeni secret üretip `.\Install-PurviewReport.ps1 -UseExistingApp` komutuyla güncelleyebilirsiniz.

## 5. Geri Dönüş (Kaldırma) Planı

Servisi kaldırmak istediğinizde aşağıdaki salt okunur olmayan temizlik adımlarını sırayla uygulayın:

```powershell
# 1. Zamanlanmış görevleri kaldırın
Unregister-ScheduledTask -TaskName 'Purview-WeeklyReport'  -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'Purview-MonthlyReport' -Confirm:$false -ErrorAction SilentlyContinue

# 2. Entra ID Portal > App registrations altından "Purview-Report-<Kurum>" kaydını silin

# 3. Yerel yapılandırma ve sırları temizleyin
Remove-Item .\secret.txt, .\smtp.txt, .\customer.json -ErrorAction SilentlyContinue
```
