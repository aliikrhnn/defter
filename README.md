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

## Giriş ve senkron

Kimlik doğrulama **Supabase Auth** iledir — şifre kodda tutulmaz, sunucuda bcrypt ile
saklanır. Kullanıcı adı e-postaya eşlenir (`muratozh` → `muratozh@defter.alegstudio.com`).
Şifre değiştirmek için: Supabase Dashboard → Authentication → Users → kullanıcıyı seç →
"Reset password" (ya da SQL ile `auth.users` üzerinden).

Defter verisi cihazlar arasında senkronize edilir: localStorage önbellektir, her
değişiklik buluta itilir, açılışta ve sekme öne gelince buluttan çekilir
(son yazan kazanır). Çevrimdışıyken yerelde kaydedilir, bağlantı gelince gönderilir.

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
