/* =====================================================================
   bulut.js — Supabase istemcisi (bağımlılıksız, fetch tabanlı)
   Kimlik: Supabase Auth (şifre sunucuda bcrypt ile saklanır, kodda yoktur).
   Veri: public.defter tablosu, RLS ile yalnız sahibine açık.
   ANAHTAR herkese açık "publishable" anahtardır — gizli değildir,
   veri güvenliği tamamen RLS politikalarındadır.
   ===================================================================== */
"use strict";

const Bulut = (() => {
  const TABAN = "https://gjuvhhkwenffkuwubvzc.supabase.co";
  const ANAHTAR = "sb_publishable_hW7bZfMhLxYj1eVbcFj3EQ_p5UDtYb2";
  const OTURUM_ANAHTAR = "defter-bulut-oturum";

  /* --- Oturum saklama (localStorage: cihazda kalıcı giriş) --- */
  function oturumOku() {
    try { return JSON.parse(localStorage.getItem(OTURUM_ANAHTAR)); }
    catch (e) { return null; }
  }
  function oturumYaz(o) {
    try { localStorage.setItem(OTURUM_ANAHTAR, JSON.stringify(o)); } catch (e) {}
  }
  function oturumSil() {
    try { localStorage.removeItem(OTURUM_ANAHTAR); } catch (e) {}
  }
  const oturumVar = () => Boolean(oturumOku());

  function oturumKur(j) {
    oturumYaz({
      erisim: j.access_token,
      yenileme: j.refresh_token,
      bitis: Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      eposta: (j.user && j.user.email) || (oturumOku() || {}).eposta || null
    });
  }

  /* --- Auth uçları --- */
  async function authIstek(yol, govde, erisim) {
    const basliklar = { "apikey": ANAHTAR, "Content-Type": "application/json" };
    if (erisim) basliklar["Authorization"] = "Bearer " + erisim;
    return fetch(TABAN + "/auth/v1/" + yol, {
      method: "POST", headers: basliklar,
      body: govde === undefined ? undefined : JSON.stringify(govde)
    });
  }

  async function girisYap(eposta, sifre) {
    try {
      const r = await authIstek("token?grant_type=password", { email: eposta, password: sifre });
      if (!r.ok) return false;
      oturumKur(await r.json());
      return true;
    } catch (e) { return false; }
  }

  async function yenile() {
    const o = oturumOku();
    if (!o) return false;
    try {
      const r = await authIstek("token?grant_type=refresh_token", { refresh_token: o.yenileme });
      if (!r.ok) { oturumSil(); return false; } // token geçersiz: oturum bitti
      oturumKur(await r.json());
      return true;
    } catch (e) { return false; } // ağ hatası: oturumu silme (çevrimdışı olabilir)
  }

  /* Süresi dolmak üzereyse yenileyip geçerli erişim jetonunu döner. */
  async function tazeErisim() {
    let o = oturumOku();
    if (!o) return null;
    if (o.bitis - 60 < Date.now() / 1000) {
      await yenile();
      o = oturumOku();
    }
    return o ? o.erisim : null;
  }

  function cikisYap() {
    const o = oturumOku();
    oturumSil();
    if (o) authIstek("logout", {}, o.erisim).catch(() => {});
  }

  /* --- Veri uçları (PostgREST) --- */
  async function restIstek(yol, secenek = {}, tekrarDenendi = false) {
    const erisim = await tazeErisim();
    if (!erisim) return null;
    const r = await fetch(TABAN + "/rest/v1/" + yol, {
      ...secenek,
      headers: {
        "apikey": ANAHTAR,
        "Authorization": "Bearer " + erisim,
        "Content-Type": "application/json",
        ...(secenek.headers || {})
      }
    });
    if (r.status === 401 && !tekrarDenendi && await yenile()) {
      return restIstek(yol, secenek, true);
    }
    return r;
  }

  /* Buluttaki defter: {veri, guncellendi} | null (henüz kayıt yok)
     | undefined (ulaşılamadı — çevrimdışı ya da oturum sorunu) */
  async function veriCek() {
    try {
      const r = await restIstek("defter?select=veri,guncellendi&limit=1");
      if (!r || !r.ok) return undefined;
      const liste = await r.json();
      return liste.length ? liste[0] : null;
    } catch (e) { return undefined; }
  }

  /* Defterin tamamını buluta yazar (upsert). user_id sunucuda
     auth.uid() varsayılanıyla dolar. true/false döner. */
  async function veriGonder(veri) {
    try {
      const r = await restIstek("defter", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ veri, guncellendi: new Date().toISOString() })
      });
      return Boolean(r && r.ok);
    } catch (e) { return false; }
  }

  /* Oturumdaki e-postayı döner; eski oturumlarda sunucudan alır. */
  async function epostaGetir() {
    const o = oturumOku();
    if (!o) return null;
    if (o.eposta) return o.eposta;
    try {
      const erisim = await tazeErisim();
      if (!erisim) return null;
      const r = await fetch(TABAN + "/auth/v1/user", {
        headers: { "apikey": ANAHTAR, "Authorization": "Bearer " + erisim }
      });
      if (!r.ok) return null;
      const j = await r.json();
      if (j.email) oturumYaz({ ...oturumOku(), eposta: j.email });
      return j.email || null;
    } catch (e) { return null; }
  }

  /* Şifre değiştirir. Önce mevcut şifre yeniden girişle doğrulanır.
     Dönüş: "tamam" | "mevcut" (mevcut şifre yanlış) | "ayni" (yeni=eski)
     | "oturum" | "ag" */
  async function sifreDegistir(mevcutSifre, yeniSifre) {
    const eposta = await epostaGetir();
    if (!eposta) return "oturum";
    const dogrulandi = await girisYap(eposta, mevcutSifre);
    if (!dogrulandi) return navigator.onLine ? "mevcut" : "ag";
    try {
      const erisim = await tazeErisim();
      const r = await fetch(TABAN + "/auth/v1/user", {
        method: "PUT",
        headers: {
          "apikey": ANAHTAR,
          "Authorization": "Bearer " + erisim,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password: yeniSifre })
      });
      if (r.ok) return "tamam";
      const j = await r.json().catch(() => ({}));
      const mesaj = (j.msg || j.message || j.error_description || "").toLowerCase();
      return mesaj.includes("different") ? "ayni" : "ag";
    } catch (e) { return "ag"; }
  }

  return { oturumVar, girisYap, cikisYap, veriCek, veriGonder, sifreDegistir };
})();
