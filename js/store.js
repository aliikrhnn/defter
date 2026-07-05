/* =====================================================================
   store.js — Veri katmanı
   Tek doğruluk kaynağı. UI buradan okur, buraya yazar.
   Şema değişikliğinde SURUM'u artır ve migrasyon() içine adım ekle.

   NOT: Borç/alacak sistemi kaldırıldı. Uygulama yalnız KASA (gelir/gider)
   üzerinden çalışır. Eski kişi.hareketler verisi storage'da korunur ama
   artık okunmaz — kullanıcı verisi asla sıfırlanmaz.
   ===================================================================== */
"use strict";

const Store = (() => {
  const ANAHTAR = "defter-v1";
  const SURUM = 2;
  const PARSEL_SAYISI = 63;
  let bellek = null; // localStorage erişilemezse (gizli mod) bellek yedeği

  /* --- Şema ---
     veri = {
       surum: 2,
       kisiler: [{ id, ad, not }],            // borç/alacak hareketleri kaldırıldı
       parseller: { "1": kisiId, ... },        // yalnız atanmış parseller; yoksa pasif
       kasa: [{ id, tur: "gelir"|"gider", tutar, tarih(ISO), aciklama, kisiId|null, parselNo|null }]
     }
     İşaret KASA bakışıdır: gelir +  (kasaya girer), gider −  (kasadan çıkar). */
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
    v.parseller = v.parseller || {};
    v.kasa = v.kasa || [];
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

  /* Kişinin gelir/gider toplamı — yalnız o kişiye not düşülmüş kasa kayıtları.
     net = gelir − gider (kasa bakışı). */
  function kisiKasaToplam(k) {
    let gelir = 0, gider = 0;
    for (const h of veri.kasa) {
      if (h.kisiId !== k.id) continue;
      if (h.tur === "gelir") gelir += h.tutar; else gider += h.tutar;
    }
    return { gelir, gider, net: gelir - gider };
  }
  const kisiNet = k => kisiKasaToplam(k).net;

  /* Kişinin son kasa hareketi tarihi (gelir/gider kayıtlarından). */
  const sonTarih = k => {
    let t = "";
    for (const h of veri.kasa)
      if (h.kisiId === k.id && h.tarih > t) t = h.tarih;
    return t || null;
  };

  function bugunISO() {
    const d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  /* Kasa toplamı — yalnız gelir/gider kayıtları. */
  function kasaNet() {
    let t = 0;
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
    const k = { id: uid(), ad, not: not || "" };
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

  /* Toplu kasa (gelir/gider): seçilen her kişi ve her parsel için ayrı kasa
     kaydı. Kişi/parsel yalnız nottur. Geri al için {tip:"kasa", hareket}. */
  function topluKasaEkle(tur, { kisiIds = [], parselNos = [], tutar, tarih, aciklama }) {
    if (!KASA_TUR_AD.hasOwnProperty(tur) || !(tutar > 0) || !tarih) return [];
    const eklenen = [];
    const tek = (kisiId, parselNo) => {
      const h = {
        id: uid(), tur,
        tutar: Math.round(tutar * 100) / 100,
        tarih,
        aciklama: (aciklama || "").trim(),
        kisiId: kisiId || null,
        parselNo: parselNo || null
      };
      veri.kasa.push(h);
      eklenen.push({ tip: "kasa", hareket: h });
    };
    for (const id of kisiIds) { if (kisiBul(id)) tek(id, null); }
    for (const no of parselNos) tek(null, Number(no));
    if (eklenen.length) kaydet(veri);
    return eklenen;
  }
  const topluGiderEkle = (alanlar) => topluKasaEkle("gider", alanlar);
  const topluGelirEkle = (alanlar) => topluKasaEkle("gelir", alanlar);

  /* Toplu kasa sonucunu geri al/sil. */
  function kasaSonucSil(item) {
    if (item && item.hareket) kasaSil(item.hareket.id);
  }

  /* --- Kasa: gelir/gider. Kişi ve parsel isteğe bağlı NOT alanlarıdır. --- */
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
  function kasaGuncelle(id, { tur, tutar, tarih, aciklama, kisiId, parselNo }) {
    if (!KASA_TUR_AD.hasOwnProperty(tur) || !(tutar > 0) || !tarih) return null;
    const eski = veri.kasa.find(h => h.id === id);
    if (!eski) return null;
    const yeni = {
      ...eski, tur,
      tutar: Math.round(tutar * 100) / 100,
      tarih,
      aciklama: (aciklama || "").trim(),
      kisiId: kisiId || null,
      parselNo: parselNo ? Number(parselNo) : null
    };
    veri.kasa = veri.kasa.map(h => (h.id === id ? yeni : h));
    kaydet(veri);
    return yeni;
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
  function kasaGeriAl(hareket) {
    if (!hareket || veri.kasa.some(h => h.id === hareket.id)) return;
    veri.kasa.push(hareket);
    kaydet(veri);
  }

  /* Defteri okunur bir CSV olarak üretir (";" ayraçlı — TR Excel uyumu).
     Gelirler ve giderler ayrı bölümlerde; en üstte özet, altta ara toplamlar.
     Her kayıtta, kişi seçilmişse o kişiye ATANMIŞ parseller de yazılır.
     Hücreler daima tırnaklanır; içerideki tırnaklar ikilenir. */
  function csvUret() {
    const tl = n => n.toFixed(2).replace(".", ",") + " TL";
    const trTarih = iso => {
      const p = String(iso || "").split("-");
      return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : (iso || "");
    };
    const kisiParselMetni = kisiId => {
      const nos = kisiId ? kisiParselleri(kisiId) : [];
      return nos.length ? nos.join(", ") : "";
    };

    const { gelir, gider } = kasaToplamlar();
    const bakiye = gelir - gider;

    const satirlar = [];
    satirlar.push(["DEFTER ÖZETİ", trTarih(bugunISO())]);
    satirlar.push([]);
    satirlar.push(["Toplam Gelir", tl(gelir)]);
    satirlar.push(["Toplam Gider", tl(gider)]);
    satirlar.push(["Kasa Bakiyesi", tl(bakiye)]);
    satirlar.push([]);

    const bolum = (baslik, tur, aratoplam) => {
      const kayitlar = veri.kasa
        .filter(h => h.tur === tur)
        .slice()
        .sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0));
      satirlar.push([baslik + " (" + kayitlar.length + " kayıt)"]);
      satirlar.push(["Tarih", "Kişi", "Kişinin Parselleri", "Kayıt Parseli", "Tutar", "Açıklama"]);
      for (const h of kayitlar) {
        const kisi = h.kisiId ? kisiBul(h.kisiId) : null;
        satirlar.push([
          trTarih(h.tarih),
          kisi ? kisi.ad : "",
          kisiParselMetni(h.kisiId),
          h.parselNo || "",
          tl(h.tutar),
          h.aciklama || ""
        ]);
      }
      satirlar.push(["", "", "", "Ara Toplam", tl(aratoplam), ""]);
      satirlar.push([]);
    };

    bolum("GELİRLER", "gelir", gelir);
    bolum("GİDERLER", "gider", gider);

    return satirlar
      .map(s => s.map(h => `"${String(h).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
  }

  return {
    KASA_TUR_AD, KASA_ISARET, bugunISO,
    kisiler, kisiBul, kisiNet, kisiKasaToplam, sonTarih,
    kasaNet, kasaToplamlar, kasaListe,
    parseller, parselSahibi, kisiParselleri, parselAta,
    kisiEkle, kisiSil,
    topluGiderEkle, topluGelirEkle, kasaEkle, kasaGuncelle, kasaSil, kasaSonucSil,
    kisiGeriAl, kasaGeriAl, csvUret,
    degisimDinle, disYukle, ham
  };
})();
