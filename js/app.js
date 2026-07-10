/* =====================================================================
   app.js — Başlatma, görünüm geçişleri ve olay bağlama
   Tüm uygulama state'i burada yaşar; render UI'a, veri Store'a delege edilir.
   Oturum yoksa giris.html'e yönlendirir (giriş ayrı sayfadadır).

   NOT: Borç/alacak kaldırıldı. Uygulama yalnız kasa (gelir/gider) ve toplu
   gelir/gider üzerinden çalışır.
   ===================================================================== */
"use strict";

(() => {
  if (!Auth.girisYapildiMi()) {
    location.replace("giris.html");
    return;
  }

  const $ = s => document.querySelector(s);

  /* ---------- Uygulama durumu ---------- */
  const durum = {
    filtre: "tumu",
    arama: "",
    acikKisiId: null,
    kasaTur: "gelir",          // kasa formu: "gelir" | "gider"
    duzenlenenKasaId: null,    // doluysa kasa formu düzenleme modundadır
    acikParselNo: null,        // parsel atama dialogunun hedefi
    tumunuGoster: false        // ana liste: ilk 10'dan fazlası açık mı
  };

  /* ---------- Bildirim (geri al destekli) ---------- */
  const bildirimKutu = $("#bildirim");
  const bildirimMetin = $("#bildirimMetin");
  const bildirimEylem = $("#bildirimEylem");
  let bildirimSayac = null;
  let geriAlFn = null;

  function bildir(mesaj, geriAl) {
    clearTimeout(bildirimSayac);
    bildirimMetin.textContent = mesaj;
    geriAlFn = geriAl || null;
    bildirimEylem.hidden = !geriAl;
    bildirimKutu.hidden = false;
    bildirimKutu.classList.remove("goster");
    void bildirimKutu.offsetWidth; // animasyonu yeniden tetikle
    bildirimKutu.classList.add("goster");
    bildirimSayac = setTimeout(bildirimGizle, 6000);
  }
  function bildirimGizle() {
    clearTimeout(bildirimSayac);
    bildirimKutu.hidden = true;
    geriAlFn = null;
  }
  bildirimEylem.addEventListener("click", () => {
    const fn = geriAlFn;
    bildirimGizle();
    if (fn) fn();
  });

  /* ---------- PDF dışa aktarma (jsPDF, doğrudan indirme) ----------
     Gömülü Roboto fontu Türkçe (ş, ğ, İ, ı) verir; yazdırma diyaloğu YOK.
     Renkler defter mürekkebi: yeşil=gelir, kırmızı=gider. */
  const PDF_RENK = {
    murekkep: [26, 28, 30], soluk: [92, 96, 100], cizgi: [201, 198, 190],
    alacak: [30, 110, 78], borc: [179, 55, 43],
    acikYesil: [234, 243, 238], acikKirmizi: [247, 234, 232], beyaz: [255, 255, 255]
  };
  let fontYazildi = false;

  function pdfIndir(veri) {
    if (!window.jspdf || !window.jspdf.jsPDF || !window.RobotoTTF) {
      throw new Error("jsPDF/font yüklenmedi");
    }
    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    if (!fontYazildi) {
      doc.addFileToVFS("Roboto-Regular.ttf", window.RobotoTTF);
      doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
      fontYazildi = true;
    }
    doc.setFont("Roboto", "normal");

    const sayfaG = doc.internal.pageSize.getWidth();
    const sayfaY = doc.internal.pageSize.getHeight();
    const kenar = 14, altSinir = sayfaY - 14;
    let y = kenar;
    const yeniSayfa = () => { doc.addPage(); doc.setFont("Roboto", "normal"); y = kenar; };
    const yerAc = h => { if (y + h > altSinir) yeniSayfa(); };

    // başlık
    doc.setFontSize(20); doc.setTextColor(...PDF_RENK.murekkep);
    doc.text("DEFTER — " + veri.tarih, kenar, y + 6); y += 12;

    // özet kutusu
    const ozetSatir = (etiket, deger, renk) => {
      yerAc(11);
      doc.setDrawColor(...PDF_RENK.cizgi); doc.setFillColor(...PDF_RENK.beyaz);
      doc.rect(kenar, y, sayfaG - 2 * kenar, 10, "FD");
      doc.setFontSize(13); doc.setTextColor(...PDF_RENK.murekkep);
      doc.text(etiket, kenar + 3, y + 6.6);
      doc.setTextColor(...renk);
      doc.text(deger, sayfaG - kenar - 3, y + 6.6, { align: "right" });
      y += 10;
    };
    ozetSatir("Toplam Gelir", veri.ozet.gelir, PDF_RENK.alacak);
    ozetSatir("Toplam Gider", veri.ozet.gider, PDF_RENK.borc);
    ozetSatir("Kasa Bakiyesi", veri.ozet.bakiye,
      veri.ozet.bakiyeArtida ? PDF_RENK.alacak : PDF_RENK.borc);
    y += 6;

    // sütun düzeni: Tarih, Kişi, K.Parseller, Kayıt P., Tutar, Açıklama
    const genislik = sayfaG - 2 * kenar;
    const oran = [0.12, 0.20, 0.16, 0.12, 0.16, 0.24];
    const kol = oran.map(o => o * genislik);
    // kümülatif sütun X konumları
    let acc = kenar; const X = kol.map(w => { const x = acc; acc += w; return x; });

    const hucreMetin = (metin, x, w, cy, hiza) => {
      const yazi = doc.splitTextToSize(String(metin || ""), w - 4);
      const tx = hiza === "right" ? x + w - 2 : (hiza === "center" ? x + w / 2 : x + 2);
      doc.text(yazi, tx, cy, { align: hiza === "right" ? "right" : (hiza === "center" ? "center" : "left") });
      return yazi.length;
    };
    const satirYuk = satirlar => {
      let m = 1;
      for (let i = 0; i < satirlar.length; i++) {
        m = Math.max(m, doc.splitTextToSize(String(satirlar[i] || ""), kol[i] - 4).length);
      }
      return Math.max(8, 4 + m * 4.6);
    };

    const bolumCiz = b => {
      const vurgu = b.pozitif ? PDF_RENK.alacak : PDF_RENK.borc;
      const acik = b.pozitif ? PDF_RENK.acikYesil : PDF_RENK.acikKirmizi;

      // renkli şerit başlık
      yerAc(11);
      doc.setFillColor(...vurgu);
      doc.rect(kenar, y, genislik, 9, "F");
      doc.setFontSize(12); doc.setTextColor(...PDF_RENK.beyaz);
      doc.text(b.baslik + " — " + b.satirlar.length + " kayıt", kenar + 3, y + 6);
      y += 9;

      // sütun başlıkları
      const basliklar = ["Tarih", "Kişi", "Kişinin Parselleri", "Kayıt Parseli", "Tutar", "Açıklama"];
      const hizalar = ["left", "left", "center", "center", "right", "left"];
      yerAc(8);
      doc.setFillColor(...acik); doc.setDrawColor(...PDF_RENK.cizgi);
      doc.rect(kenar, y, genislik, 8, "FD");
      doc.setFontSize(9.5); doc.setTextColor(...PDF_RENK.murekkep);
      for (let i = 0; i < 6; i++) hucreMetin(basliklar[i], X[i], kol[i], y + 5.4, hizalar[i]);
      y += 8;

      // satırlar
      doc.setFontSize(10);
      for (const r of b.satirlar) {
        const alan = [r.tarih, r.kisi, r.kisiParseller, r.kayitParseli, r.tutar, r.aciklama];
        const h = satirYuk(alan);
        yerAc(h);
        doc.setDrawColor(...PDF_RENK.cizgi);
        doc.rect(kenar, y, genislik, h, "S");
        for (let i = 0; i < 6; i++) doc.line(X[i], y, X[i], y + h);
        const cy = y + 5;
        doc.setTextColor(...PDF_RENK.murekkep); hucreMetin(alan[0], X[0], kol[0], cy, "left");
        doc.setTextColor(...PDF_RENK.murekkep); hucreMetin(alan[1], X[1], kol[1], cy, "left");
        doc.setTextColor(...PDF_RENK.soluk); hucreMetin(alan[2], X[2], kol[2], cy, "center");
        doc.setTextColor(...PDF_RENK.soluk); hucreMetin(alan[3], X[3], kol[3], cy, "center");
        doc.setTextColor(...vurgu); hucreMetin(alan[4], X[4], kol[4], cy, "right");
        doc.setTextColor(...PDF_RENK.murekkep); hucreMetin(alan[5], X[5], kol[5], cy, "left");
        y += h;
      }

      // ara toplam
      yerAc(8);
      doc.setFillColor(...acik); doc.setDrawColor(...PDF_RENK.cizgi);
      doc.rect(kenar, y, genislik, 8, "FD");
      doc.setFontSize(10.5); doc.setTextColor(...PDF_RENK.murekkep);
      doc.text("Ara Toplam", X[4] + kol[4] - 2, y + 5.4, { align: "right" });
      doc.setTextColor(...vurgu);
      doc.text(b.aratoplam, X[5] + kol[5] - 2, y + 5.4, { align: "right" });
      y += 8 + 6;
    };

    veri.bolumler.forEach(bolumCiz);

    doc.save("defter-" + veri.tarih.replace(/\./g, "-") + ".pdf");
    bildir("PDF indirildi.");
  }

  /* ---------- Bulut senkronu ----------
     Yerel localStorage önbellektir; her değişiklik 600ms sonra buluta
     itilir (son yazan kazanır), açılışta ve sekme öne gelince çekilir. */
  let gonderSayac = null;
  let sonCekilen = null; // buluttan son alınan "guncellendi" damgası

  function senkronGoster(metin) {
    const el = $("#senkronDurum");
    el.hidden = !metin;
    el.textContent = metin || "";
    $("#bugunTarih").hidden = Boolean(metin); // dar ekranda başlık sıkışmasın
  }
  function degisiklikGonder() {
    clearTimeout(gonderSayac);
    senkronGoster("Kaydediliyor…");
    gonderSayac = setTimeout(async () => {
      const tamam = await Bulut.veriGonder(Store.ham());
      senkronGoster(tamam ? "" : "Çevrimdışı — yerelde kayıtlı");
    }, 600);
  }
  async function buluttanCek() {
    const kayit = await Bulut.veriCek();
    if (kayit === undefined) { senkronGoster("Çevrimdışı — yerelde kayıtlı"); return; }
    senkronGoster("");
    if (kayit === null) { // bulutta henüz defter yok: bu cihazdakini taşı
      await Bulut.veriGonder(Store.ham());
      return;
    }
    if (kayit.guncellendi !== sonCekilen) {
      sonCekilen = kayit.guncellendi;
      // koruma: buluttaki BOŞ defter, dolu yerel defteri ezmesin — tersine taşı
      if (!(kayit.veri && kayit.veri.kisiler && kayit.veri.kisiler.length) && Store.kisiler().length) {
        await Bulut.veriGonder(Store.ham());
        return;
      }
      if (Store.disYukle(kayit.veri)) {
        if (durum.acikKisiId) cizDetay();
        else if (!$("#parselGorunum").hidden) cizParsel();
        else if (!$("#kasaGorunum").hidden) cizKasa();
        else cizAna();
      }
    }
  }

  /* ---------- Geçiş animasyonu yardımcıları ---------- */
  function gecisOynat(el) {
    el.classList.remove("gecis");
    void el.offsetWidth;
    el.classList.add("gecis");
  }
  function listeCanlandir(ul) {
    ul.classList.add("canlandir");
    setTimeout(() => ul.classList.remove("canlandir"), 800);
  }

  /* ---------- Görünüm geçişleri ---------- */
  const GORUNUMLER = ["#anaGorunum", "#detayGorunum", "#parselGorunum", "#kasaGorunum"];
  const EYLEM_GRUPLARI = ["#anaEylemler", "#detayEylemler", "#kasaEylemler"];
  /* eylemGrubu null ise alt çubuk tamamen gizlenir (salt okunur görünümler) */
  function gorunumAc(secici, eylemGrubu) {
    GORUNUMLER.forEach(s => { $(s).hidden = s !== secici; });
    $("#altEylem").hidden = !eylemGrubu;
    EYLEM_GRUPLARI.forEach(s => { $(s).hidden = s !== eylemGrubu; });
    gecisOynat($(secici));
    window.scrollTo(0, 0);
  }
  function anaGoster() {
    durum.acikKisiId = null;
    durum.tumunuGoster = false; // dönüşte liste yine 10'a katlanır
    gorunumAc("#anaGorunum", "#anaEylemler");
    listeCanlandir($("#kisiListe"));
    cizAna();
  }
  function detayGoster(kisiId) {
    durum.acikKisiId = kisiId;
    gorunumAc("#detayGorunum", "#detayEylemler");
    listeCanlandir($("#hareketListe"));
    cizDetay();
    $("#detayAd").focus();
  }
  function parselGoster() {
    durum.acikKisiId = null;
    gorunumAc("#parselGorunum", null); // atama ızgaradaki parsele dokunarak yapılır
    cizParsel();
    $("#parselBaslik").focus();
  }
  function kasaGoster() {
    durum.acikKisiId = null;
    gorunumAc("#kasaGorunum", "#kasaEylemler");
    listeCanlandir($("#kasaListe"));
    cizKasa();
    $("#kasaBaslik").focus();
  }

  /* ---------- Render sarmalayıcıları ---------- */
  function cizAna() {
    UI.anaCiz({
      filtre: durum.filtre,
      arama: durum.arama,
      satirTiklandi: detayGoster,
      tumunuGoster: durum.tumunuGoster,
      devamiIstendi() {
        durum.tumunuGoster = true;
        cizAna();
      },
      kayitSilIstendi(h) { // Kasa filtresindeki gelir/gider satırının silinmesi
        Store.kasaSil(h.id);
        cizAna();
        bildir("Kayıt silindi.", () => {
          Store.kasaGeriAl(h);
          if (!$("#anaGorunum").hidden) cizAna();
          else if (!$("#kasaGorunum").hidden) cizKasa();
        });
      }
    });
  }
  function cizDetay() {
    const ok = UI.detayCiz(durum.acikKisiId, {
      kasaSilIstendi(h) {
        const kisiId = durum.acikKisiId;
        Store.kasaSil(h.id);
        cizDetay();
        bildir("Kayıt silindi.", () => {
          Store.kasaGeriAl(h);
          if (durum.acikKisiId === kisiId) cizDetay(); else cizAna();
        });
      },
      kasaDuzenleIstendi(h) {
        kasaFormuAc(h.tur, h.kisiId || "", h);
      }
    });
    if (!ok) anaGoster();
  }
  function cizParsel() {
    UI.parselCiz({ parselTiklandi: parselDialogAc });
  }
  function cizKasa() {
    UI.kasaCiz({
      kayitSilIstendi(h) {
        Store.kasaSil(h.id);
        cizKasa();
        bildir("Kayıt silindi.", () => {
          Store.kasaGeriAl(h);
          if (!$("#kasaGorunum").hidden) cizKasa();
        });
      },
      duzenleIstendi(h) {
        kasaFormuAc(h.tur, h.kisiId || "", h);
      }
    });
  }

  /* ---------- Çıkış ---------- */
  $("#cikisBtn").addEventListener("click", () => {
    Auth.cikisYap();
    location.replace("giris.html");
  });

  /* ---------- Kişi formu ---------- */
  const kisiDialog = $("#kisiDialog");
  $("#kisiEkleBtn").addEventListener("click", () => {
    $("#kisiForm").reset();
    kisiDialog.showModal();
  });
  /* Not: dialog formları method="dialog" gönderimine bırakılmaz — bazı
     tarayıcılar CSP form-action'ı buna da uygulayıp kaydetmeyi sessizce
     engelliyor. preventDefault + close() ile tamamen JS'te yönetilir. */
  $("#kisiForm").addEventListener("submit", e => {
    e.preventDefault();
    const ad = $("#kisiAd").value.trim();
    if (!ad) return;
    Store.kisiEkle(ad, $("#kisiNotAlan").value.trim());
    kisiDialog.close();
    cizAna();
    bildir(`"${ad}" deftere eklendi.`);
  });

  document.querySelectorAll("[data-kapat]").forEach(b => {
    b.addEventListener("click", () => b.closest("dialog").close());
  });

  /* ---------- Parseller: atama ---------- */
  const parselDialog = $("#parselDialog");
  function parselDialogAc(no) {
    durum.acikParselNo = no;
    $("#parselDlgBaslik").textContent = "Parsel " + no;
    const sec = $("#parselKisi");
    sec.innerHTML = "";
    const bos = document.createElement("option");
    bos.value = "";
    bos.textContent = "— Atanmamış (pasif) —";
    sec.appendChild(bos);
    [...Store.kisiler()]
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr"))
      .forEach(k => {
        const o = document.createElement("option");
        o.value = k.id;
        o.textContent = k.ad;
        sec.appendChild(o);
      });
    sec.value = Store.parselSahibi(no) || "";
    $("#parselKaldirBtn").hidden = !Store.parselSahibi(no);
    parselDialog.showModal();
  }
  $("#parselKaldirBtn").addEventListener("click", () => {
    const no = durum.acikParselNo;
    const eskiSahip = Store.parselSahibi(no);
    if (!eskiSahip || !Store.parselAta(no, null)) return;
    parselDialog.close();
    cizParsel();
    bildir(`Parsel ${no} boşaltıldı (pasif).`, () => {
      Store.parselAta(no, eskiSahip);
      if (!$("#parselGorunum").hidden) cizParsel();
    });
  });
  $("#parselForm").addEventListener("submit", e => {
    e.preventDefault();
    const no = durum.acikParselNo;
    const kisiId = $("#parselKisi").value || null;
    if (!Store.parselAta(no, kisiId)) return;
    parselDialog.close();
    cizParsel();
    const k = kisiId ? Store.kisiBul(kisiId) : null;
    bildir(k ? `Parsel ${no} → "${k.ad}" (aktif).` : `Parsel ${no} boşaltıldı (pasif).`);
  });

  /* ---------- Kasa: gelir/gider formu (ekle + düzenle) ----------
     sabitKisiId: ön seçili kişi (kişi detayından açılışta). hareket doluysa
     düzenleme modu. */
  const kasaDialog = $("#kasaDialog");
  function kasaFormuAc(tur, sabitKisiId, hareket) {
    durum.kasaTur = tur;
    durum.duzenlenenKasaId = hareket ? hareket.id : null;
    $("#kasaFormBaslik").textContent = hareket
      ? (tur === "gelir" ? "Geliri düzenle" : "Gideri düzenle")
      : (tur === "gelir" ? "Gelir ekle" : "Gider ekle");
    $("#kasaForm").reset();
    $("#kTarih").value = Store.bugunISO();

    const kisiSec = $("#kKisi");
    kisiSec.innerHTML = "";
    const bosK = document.createElement("option");
    bosK.value = "";
    bosK.textContent = "—";
    kisiSec.appendChild(bosK);
    [...Store.kisiler()]
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr"))
      .forEach(k => {
        const o = document.createElement("option");
        o.value = k.id;
        o.textContent = k.ad;
        kisiSec.appendChild(o);
      });

    const parselSec = $("#kParsel");
    parselSec.innerHTML = "";
    const bosP = document.createElement("option");
    bosP.value = "";
    bosP.textContent = "—";
    parselSec.appendChild(bosP);
    for (const p of Store.parseller()) {
      const sahip = p.kisiId ? Store.kisiBul(p.kisiId) : null;
      const o = document.createElement("option");
      o.value = p.no;
      o.textContent = "Parsel " + p.no + (sahip ? " · " + sahip.ad : "");
      parselSec.appendChild(o);
    }

    if (hareket) {
      $("#kTutar").value = hareket.tutar;
      $("#kTarih").value = hareket.tarih;
      $("#kAciklama").value = hareket.aciklama || "";
      kisiSec.value = hareket.kisiId || "";
      parselSec.value = hareket.parselNo || "";
    } else if (sabitKisiId) {
      kisiSec.value = sabitKisiId;
    }
    kasaDialog.showModal();
  }
  /* Ana ekran ve kasa görünümü: serbest gelir/gider. Kişi detayı: o kişiye ön seçili. */
  $("#anaGelirBtn").addEventListener("click", () => kasaFormuAc("gelir", ""));
  $("#anaGiderBtn").addEventListener("click", () => kasaFormuAc("gider", ""));
  $("#gelirEkleBtn").addEventListener("click", () => kasaFormuAc("gelir", ""));
  $("#giderEkleBtn").addEventListener("click", () => kasaFormuAc("gider", ""));
  $("#detayGelirBtn").addEventListener("click", () => kasaFormuAc("gelir", durum.acikKisiId));
  $("#detayGiderBtn").addEventListener("click", () => kasaFormuAc("gider", durum.acikKisiId));

  $("#kasaForm").addEventListener("submit", e => {
    e.preventDefault();
    const alanlar = {
      tur: durum.kasaTur,
      tutar: parseFloat($("#kTutar").value),
      tarih: $("#kTarih").value,
      aciklama: $("#kAciklama").value,
      kisiId: $("#kKisi").value || null,
      parselNo: $("#kParsel").value || null
    };
    const guncellemeydi = Boolean(durum.duzenlenenKasaId);
    const kayit = guncellemeydi
      ? Store.kasaGuncelle(durum.duzenlenenKasaId, alanlar)
      : Store.kasaEkle(alanlar);
    if (!kayit) return;
    kasaDialog.close();
    durum.duzenlenenKasaId = null;
    if (durum.acikKisiId) cizDetay();
    else if (!$("#kasaGorunum").hidden) cizKasa();
    cizAna(); // ana ekrandaki kasa toplamı da değişti
    bildir(guncellemeydi
      ? "Kayıt güncellendi."
      : (durum.kasaTur === "gelir" ? "Gelir kasaya işlendi." : "Gider kasadan düşüldü."));
  });

  /* ---------- Toplu gider (kişi ve parsel seçimiyle) ---------- */
  const topluGiderDialog = $("#topluGiderDialog");
  function topluGiderFormuAc() {
    $("#topluGiderForm").reset();
    $("#topluGiderHata").hidden = true;
    $("#gTarih").value = Store.bugunISO();

    const kKutu = $("#topluGiderKisiler");
    kKutu.innerHTML = "";
    if (Store.kisiler().length === 0) {
      const bos = document.createElement("p");
      bos.className = "secim-bos";
      bos.textContent = "Kayıtlı kişi yok.";
      kKutu.appendChild(bos);
    }
    [...Store.kisiler()]
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr"))
      .forEach(k => {
        const l = document.createElement("label");
        const c = document.createElement("input");
        c.type = "checkbox"; c.name = "gkisi"; c.value = k.id;
        l.appendChild(c);
        l.appendChild(document.createTextNode(" " + k.ad));
        kKutu.appendChild(l);
      });

    const pKutu = $("#topluGiderParseller");
    pKutu.innerHTML = "";
    for (const p of Store.parseller()) {
      const sahip = p.kisiId ? Store.kisiBul(p.kisiId) : null;
      const l = document.createElement("label");
      const c = document.createElement("input");
      c.type = "checkbox"; c.name = "gparsel"; c.value = p.no;
      l.appendChild(c);
      l.appendChild(document.createTextNode(sahip ? ` ${p.no} · ${sahip.ad}` : ` ${p.no}`));
      pKutu.appendChild(l);
    }
    topluGiderDialog.showModal();
  }
  $("#topluGiderBtn").addEventListener("click", topluGiderFormuAc);
  $("#topluGiderForm").addEventListener("submit", e => {
    e.preventDefault();
    const hata = $("#topluGiderHata");
    hata.hidden = true;
    const kisiIds = [...document.querySelectorAll("#topluGiderKisiler input:checked")].map(c => c.value);
    const parselNos = [...document.querySelectorAll("#topluGiderParseller input:checked")].map(c => Number(c.value));
    if (kisiIds.length === 0 && parselNos.length === 0) {
      hata.textContent = "En az bir kişi veya parsel seç.";
      hata.hidden = false;
      return;
    }
    const eklenen = Store.topluGiderEkle({
      kisiIds, parselNos,
      tutar: parseFloat($("#gTutar").value),
      tarih: $("#gTarih").value,
      aciklama: $("#gAciklama").value
    });
    if (eklenen.length === 0) return;
    topluGiderDialog.close();
    cizAna();
    bildir(`${eklenen.length} gider işlendi.`, () => {
      for (const it of eklenen) Store.kasaSonucSil(it);
      if (!$("#kasaGorunum").hidden) cizKasa(); else cizAna();
    });
  });

  /* ---------- Toplu gelir (kişi ve parsel seçimiyle) ---------- */
  const topluGelirDialog = $("#topluGelirDialog");
  function topluGelirFormuAc() {
    $("#topluGelirForm").reset();
    $("#topluGelirHata").hidden = true;
    $("#glTarih").value = Store.bugunISO();

    const kKutu = $("#topluGelirKisiler");
    kKutu.innerHTML = "";
    if (Store.kisiler().length === 0) {
      const bos = document.createElement("p");
      bos.className = "secim-bos";
      bos.textContent = "Kayıtlı kişi yok.";
      kKutu.appendChild(bos);
    }
    [...Store.kisiler()]
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr"))
      .forEach(k => {
        const l = document.createElement("label");
        const c = document.createElement("input");
        c.type = "checkbox"; c.name = "glkisi"; c.value = k.id;
        l.appendChild(c);
        l.appendChild(document.createTextNode(" " + k.ad));
        kKutu.appendChild(l);
      });

    const pKutu = $("#topluGelirParseller");
    pKutu.innerHTML = "";
    for (const p of Store.parseller()) {
      const sahip = p.kisiId ? Store.kisiBul(p.kisiId) : null;
      const l = document.createElement("label");
      const c = document.createElement("input");
      c.type = "checkbox"; c.name = "glparsel"; c.value = p.no;
      l.appendChild(c);
      l.appendChild(document.createTextNode(sahip ? ` ${p.no} · ${sahip.ad}` : ` ${p.no}`));
      pKutu.appendChild(l);
    }
    topluGelirDialog.showModal();
  }
  $("#topluGelirBtn").addEventListener("click", topluGelirFormuAc);
  $("#topluGelirForm").addEventListener("submit", e => {
    e.preventDefault();
    const hata = $("#topluGelirHata");
    hata.hidden = true;
    const kisiIds = [...document.querySelectorAll("#topluGelirKisiler input:checked")].map(c => c.value);
    const parselNos = [...document.querySelectorAll("#topluGelirParseller input:checked")].map(c => Number(c.value));
    if (kisiIds.length === 0 && parselNos.length === 0) {
      hata.textContent = "En az bir kişi veya parsel seç.";
      hata.hidden = false;
      return;
    }
    const eklenen = Store.topluGelirEkle({
      kisiIds, parselNos,
      tutar: parseFloat($("#glTutar").value),
      tarih: $("#glTarih").value,
      aciklama: $("#glAciklama").value
    });
    if (eklenen.length === 0) return;
    topluGelirDialog.close();
    cizAna();
    bildir(`${eklenen.length} gelir işlendi.`, () => {
      for (const it of eklenen) Store.kasaSonucSil(it);
      if (!$("#kasaGorunum").hidden) cizKasa(); else cizAna();
    });
  });

  /* ---------- Şifre değiştirme ---------- */
  const sifreDialog = $("#sifreDialog");
  $("#sifreBtn").addEventListener("click", () => {
    $("#sifreForm").reset();
    $("#sifreHata").hidden = true;
    sifreDialog.showModal();
  });
  $("#sifreForm").addEventListener("submit", async e => {
    e.preventDefault();
    const hata = $("#sifreHata");
    hata.hidden = true;
    const mevcut = $("#sMevcut").value;
    const yeni = $("#sYeni").value;
    const tekrar = $("#sTekrar").value;
    const goster = m => { hata.textContent = m; hata.hidden = false; };
    if (yeni.length < 6) { goster("Yeni şifre en az 6 karakter olmalı."); return; }
    if (yeni !== tekrar) { goster("Yeni şifreler birbirini tutmuyor."); return; }
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    const sonuc = await Auth.sifreDegistir(mevcut, yeni);
    btn.disabled = false;
    if (sonuc === "tamam") {
      sifreDialog.close();
      bildir("Şifre değiştirildi.");
    } else if (sonuc === "mevcut") {
      goster("Mevcut şifre hatalı.");
      $("#sMevcut").focus();
    } else if (sonuc === "ayni") {
      goster("Yeni şifre eskisiyle aynı olamaz.");
    } else if (sonuc === "oturum") {
      goster("Oturum doğrulanamadı — çıkıp yeniden giriş yap.");
    } else {
      goster("Bağlantı sorunu — internetini kontrol edip tekrar dene.");
    }
  });

  /* ---------- Diğer etkileşimler ---------- */
  $("#geriBtn").addEventListener("click", anaGoster);
  $("#parselBtn").addEventListener("click", parselGoster);
  $("#parselGeriBtn").addEventListener("click", anaGoster);
  $("#kasaBtn").addEventListener("click", kasaGoster);
  $("#kasaGeriBtn").addEventListener("click", anaGoster);
  $("#kisiSilBtn").addEventListener("click", () => {
    const k = Store.kisiBul(durum.acikKisiId);
    if (!k) return;
    const sira = Store.kisiler().indexOf(k);
    const parseller = Store.kisiParselleri(k.id); // silmek parselleri pasife düşürür
    Store.kisiSil(k.id);
    anaGoster();
    bildir(`"${k.ad}" silindi.`, () => {
      Store.kisiGeriAl(k, sira);
      for (const no of parseller) Store.parselAta(no, k.id);
      cizAna();
    });
  });
  $("#csvBtn").addEventListener("click", () => {
    try {
      pdfIndir(Store.pdfVeri());
    } catch (e) {
      bildir("PDF oluşturulamadı. Bağlantıyı kontrol edip tekrar deneyin.");
    }
  });
  $("#aramaKutu").addEventListener("input", e => {
    durum.arama = e.target.value;
    durum.tumunuGoster = false;
    cizAna();
  });
  document.querySelectorAll(".segment button").forEach(b => {
    b.addEventListener("click", () => {
      durum.filtre = b.dataset.f;
      durum.tumunuGoster = false;
      document.querySelectorAll(".segment button")
        .forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      cizAna();
    });
  });

  /* ---------- Başlat ---------- */
  $("#bugunTarih").textContent = new Date()
    .toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  $("#uygulama").hidden = false;
  $("#altEylem").hidden = false;
  anaGoster();

  Store.degisimDinle(degisiklikGonder);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) buluttanCek();
  });
  window.addEventListener("online", buluttanCek);
  buluttanCek();

  /* Çevrimdışı destek — yalnızca güvenli bağlamda (https/localhost) çalışır */
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
