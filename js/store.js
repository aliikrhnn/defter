/* =====================================================================
   store.js — Veri katmanı
   Tek doğruluk kaynağı. UI buradan okur, buraya yazar.
   Şema değişikliğinde SURUM'u artır ve migrasyon() içine adım ekle.
   ===================================================================== */
"use strict";

const Store = (() => {
  const ANAHTAR = "defter-v1";
  const SURUM = 1;
  let bellek = null; // localStorage erişilemezse (gizli mod) bellek yedeği

  /* --- Şema ---
     veri = {
       surum: 1,
       kisiler: [{
         id, ad, not,
         hareketler: [{ id, tur, tutar, tarih(ISO), vade(ISO|null), aciklama }]
       }]
     }
  */

  /* İşaret kuralı — TEK YER. Yeni hareket türü buraya eklenir.
     +  → kişi bana borçlu (alacak artar)
     −  → ben kişiye borçluyum (borcum artar) */
  const ISARET = {
    "borc-verdim": 1,   // ona borç verdim
    "borc-aldim": -1,   // ondan borç aldım
    "odeme-aldim": -1,  // bana olan borcunu ödedi → alacağım azalır
    "odeme-yaptim": 1   // ona olan borcumu ödedim → borcum azalır
  };
  const TUR_AD = {
    "borc-verdim": "Borç verdim",
    "borc-aldim": "Borç aldım",
    "odeme-aldim": "Ödeme aldım",
    "odeme-yaptim": "Ödeme yaptım"
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function migrasyon(v) {
    // Gelecekteki şema yükseltmeleri buraya: if(v.surum < 2){ ... v.surum = 2; }
    if (!v.surum) v.surum = 1;
    return v;
  }

  function yukle() {
    try {
      const ham = localStorage.getItem(ANAHTAR);
      if (ham) return migrasyon(JSON.parse(ham));
    } catch (e) { /* erişim yok */ }
    return bellek || { surum: SURUM, kisiler: [] };
  }

  function kaydet(v) {
    bellek = v;
    try { localStorage.setItem(ANAHTAR, JSON.stringify(v)); } catch (e) {}
  }

  let veri = yukle();

  /* --- Sorgular --- */
  const kisiler = () => veri.kisiler;
  const kisiBul = id => veri.kisiler.find(k => k.id === id) || null;
  const kisiNet = k => k.hareketler.reduce((t, h) => t + ISARET[h.tur] * h.tutar, 0);
  const sonTarih = k => k.hareketler.reduce((t, h) => (h.tarih > t ? h.tarih : t), "") || null;

  function bugunISO() {
    const d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  /* Kişinin vadeli borç hareketleri içinden en kritik vade durumu */
  function vadeDurumu(k) {
    const bugun = bugunISO();
    let enYakin = null;
    for (const h of k.hareketler) {
      if (!h.vade) continue;
      if (h.tur !== "borc-verdim" && h.tur !== "borc-aldim") continue;
      if (!enYakin || h.vade < enYakin) enYakin = h.vade;
    }
    if (!enYakin) return null;
    if (enYakin < bugun) return { tip: "gecmis", vade: enYakin };
    const fark = (new Date(enYakin) - new Date(bugun)) / 86400000;
    if (fark <= 7) return { tip: "yakin", vade: enYakin };
    return { tip: "normal", vade: enYakin };
  }

  /* --- Komutlar (tek yazma noktaları) --- */
  function kisiEkle(ad, not) {
    const k = { id: uid(), ad, not: not || "", hareketler: [] };
    veri.kisiler.push(k);
    kaydet(veri);
    return k;
  }
  function kisiSil(id) {
    veri.kisiler = veri.kisiler.filter(k => k.id !== id);
    kaydet(veri);
  }
  function hareketEkle(kisiId, { tur, tutar, tarih, vade, aciklama }) {
    const k = kisiBul(kisiId);
    if (!k || !ISARET.hasOwnProperty(tur) || !(tutar > 0) || !tarih) return null;
    const h = {
      id: uid(), tur,
      tutar: Math.round(tutar * 100) / 100,
      tarih, vade: vade || null,
      aciklama: (aciklama || "").trim()
    };
    k.hareketler.push(h);
    kaydet(veri);
    return h;
  }
  function hareketGuncelle(kisiId, hareketId, { tur, tutar, tarih, vade, aciklama }) {
    const k = kisiBul(kisiId);
    if (!k || !ISARET.hasOwnProperty(tur) || !(tutar > 0) || !tarih) return null;
    const eski = k.hareketler.find(h => h.id === hareketId);
    if (!eski) return null;
    const yeni = {
      ...eski, tur,
      tutar: Math.round(tutar * 100) / 100,
      tarih, vade: vade || null,
      aciklama: (aciklama || "").trim()
    };
    k.hareketler = k.hareketler.map(h => (h.id === hareketId ? yeni : h));
    kaydet(veri);
    return yeni;
  }
  function hareketSil(kisiId, hareketId) {
    const k = kisiBul(kisiId);
    if (!k) return;
    k.hareketler = k.hareketler.filter(h => h.id !== hareketId);
    kaydet(veri);
  }

  /* Defterin tamamını CSV olarak üretir (";" ayraçlı — TR Excel uyumu).
     Hücreler daima tırnaklanır; içerideki tırnaklar ikilenir (CSV kaçışı). */
  function csvUret() {
    const satirlar = [["Kişi", "Tür", "İşaret", "Tutar", "Tarih", "Vade", "Açıklama"]];
    for (const k of veri.kisiler) {
      for (const h of k.hareketler) {
        satirlar.push([
          k.ad, TUR_AD[h.tur], ISARET[h.tur] > 0 ? "+" : "−",
          h.tutar.toFixed(2).replace(".", ","),
          h.tarih, h.vade || "", h.aciklama || ""
        ]);
      }
    }
    return satirlar
      .map(s => s.map(h => `"${String(h).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
  }

  return {
    ISARET, TUR_AD, bugunISO,
    kisiler, kisiBul, kisiNet, sonTarih, vadeDurumu,
    kisiEkle, kisiSil, hareketEkle, hareketGuncelle, hareketSil, csvUret
  };
})();
