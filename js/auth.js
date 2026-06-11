/* =====================================================================
   auth.js — Giriş kapısı
   İstemci tarafı doğrulama: gizlilik perdesidir, gerçek güvenlik değildir
   (kaynak koda erişen biri aşabilir). Gerçek auth için bu modülün
   arayüzünü koruyarak içini backend'e (örn. Supabase Auth) bağla.
   ===================================================================== */
"use strict";

const Auth = (() => {
  const KULLANICI = "muratozh";
  // SHA-256("M236702") — şifre düz metin olarak kodda tutulmaz
  const SIFRE_HASH = "db00c733a072d001cc130555c99392ec039194bfa11faf6aa7fedafc6a91d026";
  const OTURUM_ANAHTAR = "defter-oturum";

  async function sha256(metin) {
    const veri = new TextEncoder().encode(metin);
    const ozet = await crypto.subtle.digest("SHA-256", veri);
    return Array.from(new Uint8Array(ozet))
      .map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function girisYapildiMi() {
    try { return sessionStorage.getItem(OTURUM_ANAHTAR) === "1"; }
    catch (e) { return false; }
  }

  /* Başarılıysa true döner ve oturumu açar. */
  async function girisDene(kullanici, sifre) {
    const adDogru = (kullanici || "").trim().toLocaleLowerCase("tr") === KULLANICI;
    const hash = await sha256(sifre || "");
    if (adDogru && hash === SIFRE_HASH) {
      try { sessionStorage.setItem(OTURUM_ANAHTAR, "1"); } catch (e) {}
      return true;
    }
    return false;
  }

  function cikisYap() {
    try { sessionStorage.removeItem(OTURUM_ANAHTAR); } catch (e) {}
  }

  return { girisYapildiMi, girisDene, cikisYap };
})();
