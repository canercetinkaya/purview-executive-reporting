# Mimari Tasarım, Kimlik Doğrulama Katmanları ve 4 Sayfalık KPI Kataloğu

Bu doküman `Purview Executive Reporting` servisinin çok katmanlı veri toplama mimarisini, desteklediği kimlik doğrulama yöntemlerini ve ürettiği 4 sayfalık aylık yönetici/teknik raporun metrik haritasını açıklar.

## 1. Çok Katmanlı Veri Toplama ve Kimlik Doğrulama Mimarisi

Microsoft Purview telemetrisi tek bir API altında toplanmadığı için servis **3 tamamlayıcı bağlantı katmanını** birleştirir:

| Katman | Kimlik Doğrulama | Kullanılan Uç Noktalar / Komutlar | Sağladığı Metrikler |
| :--- | :--- | :--- | :--- |
| **1. Microsoft Graph API** | App-Only (`Secret` DPAPI veya `Certificate` RS256 JWT) | `/v1.0/security/alerts_v2`<br>`/v1.0/security/incidents?$top=50`<br>`/beta/informationProtection/policy/labels`<br>`/v1.0/security/auditLog/queries`<br>`/v1.0/security/cases/ediscoveryCases` | Purview ve M365 güvenlik uyarıları, olay kapanış süreleri, **Hassasiyet Etiketi tanımları ve öncelikleri**, 30-180 günlük birleşik denetim sorguları, eDiscovery vakaları |
| **2. Office 365 Management Activity API** | App-Only (`ActivityFeed.Read` + `ActivityFeed.ReadDlp`) | `manage.office.com/.../subscriptions/content`<br>Akışlar: `DLP.All`, `Audit.General`, `Audit.SharePoint`, `Audit.Exchange` | **En çok eşleşen DLP politikaları ve kuralları**, **Hassas Bilgi Türleri (SIT)**, **en çok DLP tetikleyen kullanıcılar**, **kullanıcı override gerekçeleri**, **etiket uygulama/düşürme/kaldırma olayları**, iş yükü denetim dağılımı |
| **3. Purview IPPS & EXO PowerShell** | Katılımsız X.509 Sertifika (`Exchange.ManageAsApp` + `Compliance Reader`) veya Etkileşimli Oturum | `Get-DlpCompliancePolicy`, `Get-DlpComplianceRule`, `Get-Label`, `Get-LabelPolicy`, `Get-AutoSensitivityLabelPolicy`, `Get-RetentionCompliancePolicy`, `Get-ComplianceTag`, `Get-InsiderRiskPolicy`, `Get-SupervisoryReviewPolicyV2`, `Export-ActivityExplorerData` | DLP politika ve kural envanteri, korunan SIT listesi, zorunlu etiketleme ve düşürme gerekçesi ayarları, otomatik etiketleme, saklama ve kayıt etiketleri, iç tehdit ve iletişim uyumu politikaları |

## 2. Aylık Raporun 4 Sayfalık Metrik Kataloğu (`-Mode Monthly`)

### Sayfa 1 — Yönetici Özeti, Purview Kapsamı ve Kaynak Sağlık Matrisi
- **Yönetici Özeti:** Dönem içindeki DLP politika/kural kapsamı, aktif hassasiyet etiketleri, gerçekleşen DLP eşleşmeleri (engelleme ve override), etiket işlemleri ve olay müdahale performansı.
- **Dikkat Gerektiren Başlıklar:** Açık olaylar, yüksek şiddetli uyarılar, kullanıcı DLP override sayıları, etiket düşürme/silme hareketleri, Test kipinde kalan DLP politikaları.
- **Veri Kaynağı Sağlık Matrisi:** 7 veri kaynağının gerçek durumu (`Erişilebilir`, `Kısmi Veri`, `Graph Etiket API`, `Yetki Eksik`, `Lisanssız`, `IPPS Anlık Görüntüsü Gerekli`).

### Sayfa 2 — Hassasiyet Etiketleri (Sensitivity Labels) ve Bilgi Koruma Analizi
- **Etiket KPI Kartları:** Aktif / Toplam Etiket Tanımı, Toplam Etiket İşlemi, Uygulanan (`Applied`), Değiştirilen / Düşürülen (`Changed / Downgraded`), Kaldırılan (`Removed`).
- **Kiracı Hassasiyet Etiketi Envanteri:** Etiket görünen adı (üst/alt etiket hiyerarşisiyle, ör. `Confidential / All Employees`, `RECETE`), öncelik (`0..12`), koruma biçimi (`Şifreleme + Filigran` / `Sınıflandırma`), durum ve politika açıklaması.
- **Etiket Bazlı Kullanım Dağılımı & Kullanıcılar:** Hangi etiketin kaç kez uygulandığı, düşürüldüğü veya silindiği; en çok etiket işlemi yapan kullanıcılar ve iş yükleri.

### Sayfa 3 — DLP Kural Eşleşmeleri, Hassas Bilgi Türleri (SIT) ve Kullanıcı Analizi
- **DLP KPI Kartları:** Toplam DLP Eşleşmesi, Yüksek Şiddetli DLP, Engellenen (`Block`), Kullanıcı Override, Bildirim / Denetim (`Notify / Audit`).
- **En Çok Eşleşen DLP Politikaları ve Kuralları:** Politika adı, kural adı, şiddet, aksiyon rozeti (`Engellendi`, `Kullanıcı Override`, `Bildirim`, `Denetim`), eşleşme ve override adetleri.
- **En Çok Eşleşen Hassas Bilgi Türleri (SIT):** Tespit edilen SIT adı (ör. `Turkey National Identification Number (TCKN)`, `Credit Card Number`, `TR IBAN`, `RECETE / Sağlık Verisi`), olay sayısı ve toplam tespit edilen veri örneği (`Instance Count`).
- **En Çok DLP Tetikleyen Kullanıcılar:** Kullanıcı UPN, toplam olay, yüksek şiddetli olay, engellenen, override sayısı, tespit edilen SIT örneği, iş yükleri ve **kullanıcının girdiği son override gerekçesi**.

### Sayfa 4 — Dönem Trendi, Politika Envanteri ve Öncelikli Aksiyonlar
- **Önceki Dönemle Karşılaştırmalı KPI Tablosu:** `Archive/Monthly/<YYYY-MM>/kpi.json` üzerinden önceki ayla fark ve yüzde değişim.
- **Aktif DLP Politika Envanteri:** Politika adı, kip (`Enforce` / `Test`), iş yükü kapsamı, korunan SIT türleri ve son güncelleme tarihi.
- **Son Güvenlik Uyarıları (`alerts_v2`), En Sık Denetim Operasyonları ve Gelecek Ay İçin Öncelikli Aksiyonlar.**
