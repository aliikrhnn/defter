/* =====================================================================
   auth.js — Giriş kapısı (Supabase Auth)
   Şifre KODDA TUTULMAZ: doğrulama sunucuda yapılır, şifre Supabase'te
   bcrypt ile saklanır. Kullanıcı adı e-postaya eşlenir
   (ör. "muratozh" → muratozh@defter.alegstudio.com).
   Arayüz korunmuştur: girisYapildiMi, girisDene, cikisYap.
   ===================================================================== */
"use strict";

const Auth = (() => {
  const EPOSTA_ALANI = "@defter.alegstudio.com";

  function girisYapildiMi() {
    return Bulut.oturumVar();
  }

  /* Başarılıysa true döner ve oturumu açar (cihazda kalıcı). */
  async function girisDene(kullanici, sifre) {
    const ad = (kullanici || "").trim().toLocaleLowerCase("tr");
    if (!ad || !sifre) return false;
    const eposta = ad.includes("@") ? ad : ad + EPOSTA_ALANI;
    return Bulut.girisYap(eposta, sifre);
  }

  function cikisYap() {
    Bulut.cikisYap();
  }

  return { girisYapildiMi, girisDene, cikisYap };
})();
