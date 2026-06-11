/* =====================================================================
   giris.js — Giriş sayfası mantığı
   Başarılı girişte defter sayfasına (index) yönlendirir. Oturum zaten
   açıksa formu hiç göstermeden geçer.
   ===================================================================== */
"use strict";

(() => {
  const $ = s => document.querySelector(s);

  if (Auth.girisYapildiMi()) {
    location.replace("./");
    return;
  }

  $("#gKullanici").focus();

  $("#girisForm").addEventListener("submit", async e => {
    e.preventDefault();
    const hata = $("#girisHata");
    hata.hidden = true;
    const kutu = $(".giris-kutu");
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    const tamam = await Auth.girisDene($("#gKullanici").value, $("#gSifre").value);
    btn.disabled = false;
    if (tamam) {
      location.replace("./");
    } else {
      hata.textContent = navigator.onLine
        ? "Kullanıcı adı veya şifre hatalı."
        : "İnternet bağlantısı yok — giriş için bağlantı gerekli.";
      hata.hidden = false;
      $("#gSifre").value = "";
      $("#gSifre").focus();
      kutu.classList.remove("hata");
      void kutu.offsetWidth; // animasyonu yeniden tetikle
      kutu.classList.add("hata");
    }
  });
})();
