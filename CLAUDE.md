# Defter — Claude Code Proje Direktifleri

Kişisel borç/alacak takip uygulaması. Tek kullanıcı, mobil öncelikli, framework'süz vanilla HTML/CSS/JS.
Bu dosyadaki kurallar **her geliştirmede geçerlidir** — yeni özellik eklerken bu tasarım dilinin dışına çıkma.

## Tasarım dili: "Veresiye defteri"

Konsept Türk esnaf defterinden gelir. Jenerik AI/fintech estetiği YASAK:

- ❌ Mor/mavi gradyan, glassmorphism, neon glow
- ❌ Inter, Roboto gibi varsayılan fontlar
- ❌ Gölgeli beyaz kart ızgarası (standart dashboard dizilimi)
- ❌ Dekoratif ikon ve renk; emoji kullanma
- ✅ Renk yalnızca anlam taşır: yeşil = alacak, kırmızı = borç (muhasebe mürekkebi)
- ✅ Tüm tutarlar ve tarihler mono fontla dizilir (defter hizası)
- ✅ İmza öğesi: net toplamların altındaki **çift çizgi** (muhasebede "kesin toplam")
- ✅ Cömert beyaz alan, ince defter çizgileri (`--cizgi`) ile ayrım
- ✅ Her ekran/bölüm TEK iş yapar; ekrana ikinci bir amaç ekleme, yeni görünüm aç

## Token sistemi (css/style.css başında tanımlı — değiştirme, kullan)

| Token | Değer | Amaç |
|---|---|---|
| `--kagit` | #FBFBF9 | Zemin (krem DEĞİL, soğuk-sıcak arası beyaz) |
| `--murekkep` | #1A1C1E | Ana metin, birincil eylemler |
| `--soluk` | #5C6064 | İkincil metin (kontrast ≥ 7:1) |
| `--cizgi` / `--cizgi-koyu` | #E4E2DC / #C9C6BE | Defter çizgileri, çerçeveler |
| `--alacak` | #1E6E4E | Yeşil mürekkep (beyazda 6.3:1) |
| `--borc` | #B3372B | Kırmızı mürekkep (beyazda 5.9:1) |
| `--uyari` | #8A5A00 | Yaklaşan vade |

Tipografi: başlıklar **Bricolage Grotesque**, rakamlar **IBM Plex Mono**, gövde system-ui.
Yeni font ekleme. Yeni renk gerekiyorsa önce buradaki paletten türet ve tabloya işle.

## WCAG 2.1 AA — pazarlık yok

- Dokunma hedefleri ≥ 44×44px (`--dokunma`)
- Metin kontrastı ≥ 4.5:1; renk tek başına bilgi taşımaz (yanında "Alacak/Borç" etiketi olmalı)
- `:focus-visible` görünür kalır; odağı asla `outline:none` ile kaldırma
- Formlarda native `<dialog>` + `<label for>`; ikonlara `aria-label`/`aria-hidden`
- `prefers-reduced-motion` saygı görür; dinamik toplamlar `aria-live="polite"`

## Mimari

```
index.html           Defter görünümleri (ana / detay) + dialoglar + bildirim — oturum yoksa giris.html'e yönlendirir
giris.html           Giriş sayfası (ayrı sayfa; başarılı girişte index'e yönlendirir)
css/style.css        Tokenlar + bileşenler (bölüm yorumlarıyla ayrılmış)
js/store.js          Veri katmanı — localStorage önbellek, sürümlü şema, geri al, değişim dinleyicisi
js/bulut.js          Supabase istemcisi — auth jetonları, yenileme, defter çek/gönder (fetch, bağımlılıksız)
js/auth.js           Giriş kapısı — Supabase Auth'a delege eder (kullanıcı adı → e-posta eşlemesi)
js/ui.js             Saf render fonksiyonları (anaCiz, detayCiz) — DOM'a yazar, state tutmaz
js/app.js            Olay bağlama, görünüm geçişleri, bildirim/geri al, başlatma, SW kaydı
js/giris.js          Giriş sayfası mantığı (yönlendirme + hata sallanması)
sw.js                Çevrimdışı önbellek (network-first; değişiklikte SURUM artır)
icon.svg             Favicon / PWA ikonu (defter motifi, token renkleri)
manifest.webmanifest PWA manifest'i
vercel.json          Yayın güvenlik başlıkları (CSP dahil — yeni dış kaynak eklersen güncelle)
```

Animasyon kuralları: yalnızca `transform`/`opacity` canlandırılır; `prefers-reduced-motion`
taban kuralı tüm animasyonları kapatır. Silme işlemleri onay kutusu yerine
**geri al destekli bildirim** kullanır (`bildir(mesaj, geriAlFn)` — `app.js`).

Kurallar:
- State yalnızca `app.js` + `store.js`'te yaşar; `ui.js` parametreyle çizer.
- İşaret kuralı tek yerde (`store.js` → `ISARET`): `+` kişi bana borçlu, `−` ben borçluyum. Yeni hareket türü eklerken bu tabloya satır ekle, başka yerde işaret hesaplama.
- Şema değişikliğinde `SURUM`'u artır ve `store.js` içine migration yaz; kullanıcı verisini asla sıfırlama.
- Kullanıcıdan gelen metni DOM'a daima `textContent` ile yaz (XSS).

## Kimlik doğrulama ve bulut senkronu (Supabase)

- **Auth:** Supabase Auth (proje: `defter-app` / gjuvhhkwenffkuwubvzc). Şifre kodda YOKTUR;
  sunucuda bcrypt ile saklanır. Kullanıcı adı e-postaya eşlenir:
  `muratozh` → `muratozh@defter.alegstudio.com`. Oturum localStorage'da kalıcıdır
  (`defter-bulut-oturum`), jeton süresi dolunca `bulut.js` kendiliğinden yeniler.
- **Veri:** `public.defter` tablosu — kullanıcı başına tek satır, tüm defter `veri` (jsonb)
  kolonunda. RLS: yalnız `auth.uid() = user_id` okur/yazar; oturumsuz erişim engellidir.
- **Senkron modeli:** localStorage önbellektir. Her değişiklik 600ms debounce ile buluta
  itilir (upsert, **son yazan kazanır**); açılışta, sekme öne gelince ve çevrimiçi olunca
  çekilir. Bulutta kayıt yoksa yereldeki taşınır. Göstergeler: "Kaydediliyor…" /
  "Çevrimdışı — yerelde kayıtlı" (`#senkronDurum`).
- `js/bulut.js` içindeki `ANAHTAR` herkese açık publishable anahtardır — gizli değildir,
  güvenlik RLS'tedir. Service role anahtarını ASLA istemciye koyma.
- Yeni dış kaynak = `vercel.json` CSP `connect-src` güncellenmeli.

## Yol haritası (geliştirmeye açık alanlar)

- ✅ Hareket düzenleme (`Store.hareketGuncelle` + form düzenleme modu)
- ✅ CSV dışa aktarma (`Store.csvUret` — ";" ayraçlı, BOM'lu, TR Excel uyumlu)
- ✅ PWA / çevrimdışı destek (`sw.js`, `manifest.webmanifest`)
- ✅ Supabase ile senkron + gerçek auth (`js/bulut.js`)
- Taksit / kısmi ödeme planı (hareket şemasına `plan` alanı)
- PDF dışa aktarma (defter görünümünü koru)
- Vade bildirimleri (Notification API, izin akışıyla)
- Çoklu para birimi (`store.js`'e `paraBirimi`, formatlamayı `ui.js`'te merkezi tut)
- Çakışma çözümü: "son yazan kazanır" yerine hareket bazlı birleştirme
