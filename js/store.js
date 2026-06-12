/* =====================================================================
   store.js — Veri katmanı
   Tek doğruluk kaynağı. UI buradan okur, buraya yazar.
   Şema değişikliğinde SURUM'u artır ve migrasyon() içine adım ekle.
   ===================================================================== */
"use strict";

const Store = (() => {
  const ANAHTAR = "defter-v1";
  const SURUM = 2;
  const PARSEL_SAYISI = 63;
  let bellek = null; // localStorage erişilemezse (gizli mod) bellek yedeği

  /* --- Şema (v2) ---
     veri = {
       surum: 2,
       kisiler: [{
         id, ad, not,
         hareketler: [{ id, tur, tutar, tarih(ISO), vade(ISO|null), aciklama, parselNo(1-63|null) }]
       }],
       parseller: { "1": kisiId, ... },   // yalnız atanmış parseller; yoksa pasif
       kasa: [{ id, tur: "gelir"|"gider", tutar, tarih(ISO), aciklama, kisiId|null, parselNo|null }]
     }
  */

  /* İşaret kuralı — TEK YER. KASA bakışıyla yazılır:
     +  → kasaya para girer
     −  → kasadan para çıkar
     Alacak/borç yönü bunun TERSİDİR (bkz. kisiNet): borç verdiğimde
     kasadan para çıkar (−) ama kişi bana borçlanır (alacak +). */
  const ISARET = {
    "borc-verdim": -1,  // ona borç verdim → kasadan çıktı
    "borc-aldim": 1,    // ondan borç aldım → kasaya girdi
    "odeme-aldim": 1,   // bana ödeme yaptı → kasaya girdi
    "odeme-yaptim": -1  // ona ödeme yaptım → kasadan çıktı
  };
  const TUR_AD = {
    "borc-verdim": "Borç verdim",
    "borc-aldim": "Borç aldım",
    "odeme-aldim": "Ödeme aldım",
    "odeme-yaptim": "Ödeme yaptım"
  };
  const KASA_TUR_AD = { gelir: "Gelir", gider: "Gider" };
  const KASA_ISARET = { gelir: 1, gider: -1 };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function migrasyon(v) {
    if (!v.surum) v.surum = 1;
    if (v.surum < 2) {
      v.parseller = v.parseller || {};
      v.kasa = v.kasa || [];
      v.surum = 2;
    }
    return v;
  }

  function yukle() {
    try {
      const ham = localStorage.getItem(ANAHTAR);
      if (ham) return migrasyon(JSON.parse(ham));
    } catch (e) { /* erişim yok */ }
    return bellek || { surum: SURUM, kisiler: [], parseller: {}, kasa: [] };
  }

  /* Her yerel değişiklikte çağrılır (bulut senkronu app.js'te bağlar).
     disYukle bu dinleyiciyi TETİKLEMEZ — buluttan gelen veri geri itilmesin. */
  let dinleyici = null;
  function degisimDinle(fn) { dinleyici = fn; }

  function kaydet(v) {
    bellek = v;
    try { localStorage.setItem(ANAHTAR, JSON.stringify(v)); } catch (e) {}
    if (dinleyici) dinleyici();
  }

  let veri = yukle();

  /* Buluttan gelen defteri yerel duruma yükler (dinleyici tetiklenmez). */
  function disYukle(dis) {
    if (!dis || !Array.isArray(dis.kisiler)) return false;
    veri = migrasyon(dis);
    bellek = veri;
    try { localStorage.setItem(ANAHTAR, JSON.stringify(veri)); } catch (e) {}
    return true;
  }
  const ham = () => veri;

  /* --- Sorgular --- */
  const kisiler = () => veri.kisiler;
  const kisiBul = id => veri.kisiler.find(k => k.id === id) || null;
  /* Alacak bakışı: + kişi bana borçlu, − ben borçluyum (kasa işaretinin tersi) */
  const kisiNet = k => k.hareketler.reduce((t, h) => t - ISARET[h.tur] * h.tutar, 0);
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

  /* Kasa: kişi hareketleri + gelir/gider kayıtlarının kasa işaretli toplamı */
  function kasaNet() {
    let t = 0;
    for (const k of veri.kisiler)
      for (const h of k.hareketler) t += ISARET[h.tur] * h.tutar;
    for (const h of veri.kasa) t += KASA_ISARET[h.tur] * h.tutar;
    return t;
  }
  function kasaToplamlar() {
    let gelir = 0, gider = 0;
    for (const h of veri.kasa) {
      if (h.tur === "gelir") gelir += h.tutar; else gider += h.tutar;
    }
    return { gelir, gider };
  }
  const kasaListe = () => veri.kasa;

  /* --- Parseller (1..PARSEL_SAYISI) --- */
  function parseller() {
    const dizi = [];
    for (let no = 1; no <= PARSEL_SAYISI; no++)
      dizi.push({ no, kisiId: veri.parseller[no] || null });
    return dizi;
  }
  const parselSahibi = no => veri.parseller[no] || null;
  const kisiParselleri = kisiId =>
    parseller().filter(p => p.kisiId === kisiId).map(p => p.no);

  /* --- Komutlar (tek yazma noktaları) --- */
  function kisiEkle(ad, not) {
    const k = { id: uid(), ad, not: not || "", hareketler: [] };
    veri.kisiler.push(k);
    kaydet(veri);
    return k;
  }
  function kisiSil(id) {
    veri.kisiler = veri.kisiler.filter(k => k.id !== id);
    // kişinin parselleri pasife düşer (sahipsiz atama kalmasın)
    for (const no of Object.keys(veri.parseller))
      if (veri.parseller[no] === id) delete veri.parseller[no];
    kaydet(veri);
  }
  /* kisiId null/"" ise parsel boşaltılır (pasif olur) */
  function parselAta(no, kisiId) {
    no = Number(no);
    if (!(no >= 1 && no <= PARSEL_SAYISI)) return false;
    if (kisiId && !kisiBul(kisiId)) return false;
    if (kisiId) veri.parseller[no] = kisiId;
    else delete veri.parseller[no];
    kaydet(veri);
    return true;
  }
  function hareketEkle(kisiId, { tur, tutar, tarih, vade, aciklama, parselNo }) {
    const k = kisiBul(kisiId);
    if (!k || !ISARET.hasOwnProperty(tur) || !(tutar > 0) || !tarih) return null;
    const h = {
      id: uid(), tur,
      tutar: Math.round(tutar * 100) / 100,
      tarih, vade: vade || null,
      aciklama: (aciklama || "").trim(),
      parselNo: parselNo ? Number(parselNo) : null
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

  /* Toplu borç: seçilen kişilere birer, seçilen parsellerin sahiplerine
     parsel notuyla birer hareket işler. Geri al için eklenenleri döndürür. */
  function topluBorcEkle({ kisiIds = [], parselNos = [], tur, tutar, tarih, vade, aciklama }) {
    if (!ISARET.hasOwnProperty(tur) || !(tutar > 0) || !tarih) return [];
    const eklenen = [];
    const tek = (kisiId, parselNo) => {
      const k = kisiBul(kisiId);
      if (!k) return;
      const h = {
        id: uid(), tur,
        tutar: Math.round(tutar * 100) / 100,
        tarih, vade: vade || null,
        aciklama: (aciklama || "").trim(),
        parselNo: parselNo || null
      };
      k.hareketler.push(h);
      eklenen.push({ kisiId, hareket: h });
    };
    for (const id of kisiIds) tek(id, null);
    for (const no of parselNos) {
      const sahip = parselSahibi(Number(no));
      if (sahip) tek(sahip, Number(no));
    }
    if (eklenen.length) kaydet(veri);
    return eklenen;
  }

  /* --- Kasa: gelir/gider (kişi ve parsel isteğe bağlı not alanlarıdır) --- */
  function kasaEkle({ tur, tutar, tarih, aciklama, kisiId, parselNo }) {
    if (!KASA_TUR_AD.hasOwnProperty(tur) || !(tutar > 0) || !tarih) return null;
    const h = {
      id: uid(), tur,
      tutar: Math.round(tutar * 100) / 100,
      tarih,
      aciklama: (aciklama || "").trim(),
      kisiId: kisiId || null,
      parselNo: parselNo ? Number(parselNo) : null
    };
    veri.kasa.push(h);
    kaydet(veri);
    return h;
  }
  function kasaSil(id) {
    veri.kasa = veri.kasa.filter(h => h.id !== id);
    kaydet(veri);
  }

  /* --- Geri al (undo) --- silinen kaydı olduğu gibi geri koyar */
  function kisiGeriAl(kisi, sira) {
    if (!kisi || kisiBul(kisi.id)) return;
    const hedef = Math.max(0, Math.min(sira ?? veri.kisiler.length, veri.kisiler.length));
    veri.kisiler.splice(hedef, 0, kisi);
    kaydet(veri);
  }
  function hareketGeriAl(kisiId, hareket) {
    const k = kisiBul(kisiId);
    if (!k || !hareket || k.hareketler.some(h => h.id === hareket.id)) return;
    k.hareketler.push(hareket);
    kaydet(veri);
  }
  function kasaGeriAl(hareket) {
    if (!hareket || veri.kasa.some(h => h.id === hareket.id)) return;
    veri.kasa.push(hareket);
    kaydet(veri);
  }

  /* Defterin tamamını CSV olarak üretir (";" ayraçlı — TR Excel uyumu).
     Hücreler daima tırnaklanır; içerideki tırnaklar ikilenir (CSV kaçışı).
     İşaret kasa bakışıdır: + kasaya girdi, − kasadan çıktı. */
  function csvUret() {
    const satirlar = [["Kişi", "Tür", "İşaret", "Tutar", "Tarih", "Vade", "Parsel", "Açıklama"]];
    for (const k of veri.kisiler) {
      for (const h of k.hareketler) {
        satirlar.push([
          k.ad, TUR_AD[h.tur], ISARET[h.tur] > 0 ? "+" : "−",
          h.tutar.toFixed(2).replace(".", ","),
          h.tarih, h.vade || "", h.parselNo || "", h.aciklama || ""
        ]);
      }
    }
    for (const h of veri.kasa) {
      const kisi = h.kisiId ? kisiBul(h.kisiId) : null;
      satirlar.push([
        kisi ? kisi.ad : "", KASA_TUR_AD[h.tur], KASA_ISARET[h.tur] > 0 ? "+" : "−",
        h.tutar.toFixed(2).replace(".", ","),
        h.tarih, "", h.parselNo || "", h.aciklama || ""
      ]);
    }
    return satirlar
      .map(s => s.map(h => `"${String(h).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
  }

  return {
    ISARET, TUR_AD, KASA_TUR_AD, KASA_ISARET, bugunISO,
    kisiler, kisiBul, kisiNet, sonTarih, vadeDurumu,
    kasaNet, kasaToplamlar, kasaListe,
    parseller, parselSahibi, kisiParselleri, parselAta,
    kisiEkle, kisiSil, hareketEkle, hareketGuncelle, hareketSil,
    topluBorcEkle, kasaEkle, kasaSil,
    kisiGeriAl, hareketGeriAl, kasaGeriAl, csvUret,
    degisimDinle, disYukle, ham
  };
})();
