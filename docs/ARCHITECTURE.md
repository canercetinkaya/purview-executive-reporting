# Mimari Tasarım ve Raporlama Kataloğu

Bu doküman `Purview Executive Reporting` servisinin teknik mimarisini, veri kaynaklarının sınırlarını ve ürettiği 3 sayfalık aylık yönetici raporunun yapısını özetler.

## 1. Temel Mimari İlkeleri

- **Sıfır Web Sunucusu ve Sıfır Ek Altyapı:** Çalışma zamanı yalnızca PowerShell, yerel JSON/CSV arşivi ve Windows Task Scheduler üzerine kuruludur.
- **Salt Okunur Tasarım:** Tüm API çağrıları `GET` (yalnızca `auditLog/queries` için geçici arama işi açma ve `DLP.All` aboneliği başlatma `POST` istekleri) ve `Connect-IPPSSession` üzerinde yalnızca `Get-*` komutlarıyla sınırlıdır.
- **Şeffaf Veri Durumu:** Lisansı bulunmayan veya henüz onaylanmamış bir kaynak sessizce sıfır olarak gösterilmez; her raporda **Veri Kaynağı Sağlık Matrisi** tablosunda `Erişilebilir`, `Kısmi Veri`, `Yetki Eksik`, `Lisanssız`, `Beta API` veya `IPPS Anlık Görüntüsü Gerekli` durumu belirtilir.

## 2. Kullanılan Microsoft Veri Kaynakları ve Bilinen API Sınırları

| Katman | Uç Nokta / Komut | Teknik Not ve Sınır |
| :--- | :--- | :--- |
| Uyarılar | `GET /v1.0/security/alerts_v2` | Emekliye ayrılan `/security/alerts` yerine v2 kullanılır. |
| Olaylar | `GET /v1.0/security/incidents?$top=50` | Microsoft Graph v1.0 `$top` parametresi üst sınırı **50** olarak uygulanır. |
| DLP Olayları | `manage.office.com/.../content?contentType=DLP.All` | Canlı sorgu yalnızca **son 7 günü** ve istek başına **24 saatlik** dilimi kapsar; haftalık arşivler aylık raporda tekilleştirilerek birleştirilir. |
| Denetim Günlüğü | `POST/GET /v1.0/security/auditLog/queries` | Asenkron çalışır; yapılandırılan bekleme süresinde bitmezse raporu bloke etmez, `Kısmi Veri` işaretler. |
| eDiscovery | `GET /v1.0/security/cases/ediscoveryCases` | İlgili lisans yoksa HTTP 403 döner ve `Lisanssız` olarak raporlanır. |
| Politika Envanteri | `Get-DlpCompliancePolicy`, `Get-Label`, `Get-LabelPolicy`, `Get-RetentionCompliancePolicy`, `Get-InsiderRiskPolicy`, `Get-SupervisoryReviewPolicyV2` | `Snapshots\purview-policies.json` üzerinden okunur. Opsiyonel `EnableBetaLabelApi` bayrağı açıkça `Beta API` etiketiyle kullanılabilir. |

## 3. Rapor Çıktı Yapısı

### Haftalık Özet (`-Mode Weekly` — 1 Sayfa A4)
1. 6 KPI Kartı (DLP Politikası, Test Kipindeki Politikalar, DLP Olay Eşleşmesi, Purview Uyarıları, Açık Olaylar, Etiket/İç Tehdit Politikaları)
2. Eşik Tabanlı Dikkat Gerektiren Başlıklar (`thresholds`)
3. Son Güvenlik Uyarıları + Veri Kaynağı Sağlık Matrisi
4. DLP Politika Envanteri Özeti

### Aylık Yönetim Raporu (`-Mode Monthly` — 3 Sayfa A4)
- **Sayfa 1 — Yönetici Özeti ve Kapsam:** Dönem anlatımı, önceki aya kıyas özeti, Purview kontrol kartları, DLP İş Yükü Kapsamı çubukları ve Veri Kaynağı Sağlık Matrisi.
- **Sayfa 2 — Olay, DLP ve Dönem Trendi:** Önceki dönem `Archive/Monthly/<YYYY-MM>/kpi.json` dosyasıyla karşılaştırmalı KPI tablosu, incident şiddet dağılımı, en çok tetiklenen DLP politikaları ve son güvenlik uyarıları.
- **Sayfa 3 — Envanter ve Hizmet Aksiyonları:** Aktif DLP politikalarının kip (`Enforce`, `TestWithNotifications`, `TestWithoutNotifications`) tablosu, yönetilen hizmet faaliyet kartları, incident sınıflandırması ve gelecek ay için otomatik üretilmiş öncelikli aksiyon önerileri.
