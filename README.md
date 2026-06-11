# Defter

Kişisel borç & alacak takip uygulaması. Tek kullanıcı, mobil öncelikli, bağımlılıksız vanilla HTML/CSS/JS.

## Çalıştırma

Sunucu gerekmez — `index.html`'i tarayıcıda aç, yeter.
Geliştirme sırasında canlı sunucu istersen:

```bash
npx serve .
# veya
python3 -m http.server 8000
```

> Not: Giriş ekranı `crypto.subtle` kullanır; bu API `file://`, `localhost` ve `https` üzerinde çalışır. Uzak bir sunucuya koyacaksan HTTPS şart.

## Giriş

Kullanıcı adı ve şifre `js/auth.js` içinde tanımlıdır (şifre SHA-256 hash olarak tutulur).
Şifreyi değiştirmek için yeni hash üret ve `SIFRE_HASH` sabitini güncelle:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('YENI_SIFRE').digest('hex'))"
```

⚠️ Bu istemci tarafı bir kapıdır; cihazı paylaşanlara karşı gizlilik sağlar, gerçek güvenlik sağlamaz. Detay: `CLAUDE.md` → "Kimlik doğrulama notu".

## Yapı

```
index.html           Defter (ana liste / kişi detayı) + form dialogları — giriş gerektirir
giris.html           Giriş sayfası (başarılı girişte deftere yönlendirir)
css/style.css        Token sistemi + bileşen stilleri + animasyonlar
js/store.js          Veri katmanı (localStorage, sürümlü şema, geri al)
js/auth.js           Giriş kapısı
js/ui.js             Render fonksiyonları
js/giris.js          Giriş sayfası mantığı
js/app.js            Olaylar, görünüm geçişleri, bildirim/geri al, başlatma
sw.js                Çevrimdışı önbellek (PWA)
manifest.webmanifest PWA manifest'i
icon.svg             Favicon / uygulama ikonu
vercel.json          Yayın güvenlik başlıkları
```

## Yayın (defter.alegstudio.com)

Statik sitedir, build adımı yoktur. Vercel ile:

```bash
vercel --prod
```

Sonra Vercel projesinin **Settings → Domains** bölümüne `defter.alegstudio.com` ekle.
`alegstudio.com` DNS'i Vercel'deyse kayıt otomatik oluşur; değilse
`defter` adına `cname.vercel-dns.com` hedefli bir CNAME kaydı ekle.

> Veriler tarayıcının localStorage'ında tutulur — sunucuya hiçbir veri gitmez,
> yedek almak için "Dışa aktar (CSV)" düğmesini kullan.

## Geliştirme

Tasarım dili, token tablosu, WCAG kuralları ve yol haritası **`CLAUDE.md`** dosyasındadır.
Claude Code bu projede çalışırken o dosyayı otomatik okur — yeni özellikler oradaki
kurallar içinde kalmalıdır.
