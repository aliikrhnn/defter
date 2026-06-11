/* =====================================================================
   app.js — Başlatma, görünüm geçişleri ve olay bağlama
   Tüm uygulama state'i burada yaşar; render UI'a, veri Store'a delege edilir.
   Oturum yoksa giris.html'e yönlendirir (giriş ayrı sayfadadır).
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
    hareketMod: "borc",       // "borc" | "odeme"
    duzenlenenHareketId: null // doluysa hareket formu düzenleme modundadır
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
        else if (!$("#ozetGorunum").hidden) UI.ozetCiz();
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
  function anaGoster() {
    durum.acikKisiId = null;
    $("#detayGorunum").hidden = true;
    $("#ozetGorunum").hidden = true;
    $("#anaGorunum").hidden = false;
    $("#altEylem").hidden = false;
    $("#detayEylemler").hidden = true;
    $("#anaEylemler").hidden = false;
    listeCanlandir($("#kisiListe"));
    cizAna();
    gecisOynat($("#anaGorunum"));
    window.scrollTo(0, 0);
  }
  function detayGoster(kisiId) {
    durum.acikKisiId = kisiId;
    $("#anaGorunum").hidden = true;
    $("#ozetGorunum").hidden = true;
    $("#detayGorunum").hidden = false;
    $("#altEylem").hidden = false;
    $("#anaEylemler").hidden = true;
    $("#detayEylemler").hidden = false;
    listeCanlandir($("#hareketListe"));
    cizDetay();
    gecisOynat($("#detayGorunum"));
    $("#detayAd").focus();
    window.scrollTo(0, 0);
  }
  function ozetGoster() {
    durum.acikKisiId = null;
    $("#anaGorunum").hidden = true;
    $("#detayGorunum").hidden = true;
    $("#ozetGorunum").hidden = false;
    $("#altEylem").hidden = true; // özet salt okunurdur
    UI.ozetCiz();
    gecisOynat($("#ozetGorunum"));
    $("#ozetBaslik").focus();
    window.scrollTo(0, 0);
  }

  /* ---------- Render sarmalayıcıları ---------- */
  function cizAna() {
    UI.anaCiz({
      filtre: durum.filtre,
      arama: durum.arama,
      satirTiklandi: detayGoster
    });
  }
  function cizDetay() {
    const ok = UI.detayCiz(durum.acikKisiId, {
      hareketSilIstendi(h) {
        const kisiId = durum.acikKisiId;
        Store.hareketSil(kisiId, h.id);
        cizDetay();
        bildir("Hareket silindi.", () => {
          Store.hareketGeriAl(kisiId, h);
          if (durum.acikKisiId === kisiId) cizDetay(); else cizAna();
        });
      },
      hareketDuzenleIstendi(h) {
        const mod = (h.tur === "borc-verdim" || h.tur === "borc-aldim") ? "borc" : "odeme";
        hareketFormuAc(mod, h);
      }
    });
    if (!ok) anaGoster();
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

  /* ---------- Hareket formu ---------- */
  const hareketDialog = $("#hareketDialog");
  const YONLER = {
    borc:  [["borc-verdim", "Borç verdim"], ["borc-aldim", "Borç aldım"]],
    odeme: [["odeme-aldim", "Ödeme aldım"], ["odeme-yaptim", "Ödeme yaptım"]]
  };
  /* hareket doluysa düzenleme modu; kisiSecimi true ise (ana ekrandan açılış)
     formda kişi seçici gösterilir ve hareket seçilen kişiye atanır. */
  function hareketFormuAc(mod, hareket, kisiSecimi) {
    durum.hareketMod = mod;
    durum.duzenlenenHareketId = hareket ? hareket.id : null;
    $("#hFormBaslik").textContent = hareket
      ? "Hareketi düzenle"
      : (mod === "borc" ? "Borç ekle" : "Ödeme ekle");

    const kisiAlan = $("#hKisiAlan");
    const kisiSec = $("#hKisi");
    kisiAlan.hidden = !kisiSecimi;
    kisiSec.required = Boolean(kisiSecimi);
    kisiSec.innerHTML = "";
    if (kisiSecimi) {
      [...Store.kisiler()]
        .sort((a, b) => a.ad.localeCompare(b.ad, "tr"))
        .forEach(k => {
          const sec = document.createElement("option");
          sec.value = k.id;
          sec.textContent = k.ad;
          kisiSec.appendChild(sec);
        });
    }

    const kutu = $("#yonSecim");
    kutu.innerHTML = "";
    YONLER[mod].forEach(([deger, etiket], i) => {
      const l = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio"; input.name = "tur"; input.value = deger;
      if (i === 0) input.checked = true;
      l.appendChild(input);
      l.appendChild(document.createTextNode(" " + etiket));
      kutu.appendChild(l);
    });
    $("#vadeAlan").hidden = (mod === "odeme");
    $("#hareketForm").reset();
    kutu.querySelector("input").checked = true; // reset sonrası ilk seçenek
    $("#hTarih").value = Store.bugunISO();
    if (hareket) {
      const secili = kutu.querySelector(`input[value="${hareket.tur}"]`);
      if (secili) secili.checked = true;
      $("#hTutar").value = hareket.tutar;
      $("#hTarih").value = hareket.tarih;
      $("#hVade").value = hareket.vade || "";
      $("#hAciklama").value = hareket.aciklama || "";
    }
    hareketDialog.showModal();
  }
  $("#borcEkleBtn").addEventListener("click", () => hareketFormuAc("borc"));
  $("#odemeEkleBtn").addEventListener("click", () => hareketFormuAc("odeme"));

  /* Ana ekrandan borç/ödeme: kişi seçimi zorunlu; hiç kişi yoksa önce kişi ekletilir. */
  function anaHareket(mod) {
    if (Store.kisiler().length === 0) {
      bildir("Önce bir kişi ekle — borç ve ödemeler kişiye işlenir.");
      $("#kisiForm").reset();
      kisiDialog.showModal();
      return;
    }
    hareketFormuAc(mod, null, true);
  }
  $("#anaBorcBtn").addEventListener("click", () => anaHareket("borc"));
  $("#anaOdemeBtn").addEventListener("click", () => anaHareket("odeme"));

  $("#hareketForm").addEventListener("submit", e => {
    e.preventDefault();
    /* Hedef kişi: detaydaysak açık kişi, ana ekrandan açıldıysa seçilen kişi */
    const hedefKisiId = durum.acikKisiId || $("#hKisi").value;
    const hedefKisi = Store.kisiBul(hedefKisiId);
    if (!hedefKisi) return;
    const alanlar = {
      tur: new FormData(e.target).get("tur"),
      tutar: parseFloat($("#hTutar").value),
      tarih: $("#hTarih").value,
      vade: (durum.hareketMod === "borc" && $("#hVade").value) ? $("#hVade").value : null,
      aciklama: $("#hAciklama").value
    };
    const guncellemeydi = Boolean(durum.duzenlenenHareketId);
    const sonuc = guncellemeydi
      ? Store.hareketGuncelle(hedefKisiId, durum.duzenlenenHareketId, alanlar)
      : Store.hareketEkle(hedefKisiId, alanlar);
    if (!sonuc) return;
    hareketDialog.close();
    durum.duzenlenenHareketId = null;
    if (durum.acikKisiId) cizDetay(); else cizAna();
    bildir(guncellemeydi
      ? "Hareket güncellendi."
      : `"${hedefKisi.ad}" defterine işlendi.`);
  });

  document.querySelectorAll("[data-kapat]").forEach(b => {
    b.addEventListener("click", () => b.closest("dialog").close());
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
  $("#ozetBtn").addEventListener("click", ozetGoster);
  $("#ozetGeriBtn").addEventListener("click", anaGoster);
  $("#kisiSilBtn").addEventListener("click", () => {
    const k = Store.kisiBul(durum.acikKisiId);
    if (!k) return;
    const sira = Store.kisiler().indexOf(k);
    Store.kisiSil(k.id);
    anaGoster();
    bildir(`"${k.ad}" silindi.`, () => {
      Store.kisiGeriAl(k, sira);
      cizAna();
    });
  });
  $("#csvBtn").addEventListener("click", () => {
    const csv = Store.csvUret();
    // BOM, Excel'in UTF-8'i doğru tanıması için gerekli
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "defter-" + Store.bugunISO() + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
    bildir("CSV indirildi.");
  });
  $("#aramaKutu").addEventListener("input", e => {
    durum.arama = e.target.value;
    cizAna();
  });
  document.querySelectorAll(".segment button").forEach(b => {
    b.addEventListener("click", () => {
      durum.filtre = b.dataset.f;
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
