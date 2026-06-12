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
    hareketMod: "borc",        // "borc" | "odeme"
    duzenlenenHareketId: null, // doluysa hareket formu düzenleme modundadır
    kasaTur: "gelir",          // kasa formu: "gelir" | "gider"
    acikParselNo: null         // parsel atama dialogunun hedefi
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
  const GORUNUMLER = ["#anaGorunum", "#detayGorunum", "#ozetGorunum", "#parselGorunum", "#kasaGorunum"];
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
  function ozetGoster() {
    durum.acikKisiId = null;
    gorunumAc("#ozetGorunum", null); // özet salt okunurdur
    UI.ozetCiz();
    $("#ozetBaslik").focus();
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

  /* ---------- Hareket formu ---------- */
  const hareketDialog = $("#hareketDialog");
  /* Etiketlerdeki işaret kasa yönüdür: + kasaya girer, − kasadan çıkar */
  const YONLER = {
    borc:  [["borc-verdim", "Borç verdim (−)"], ["borc-aldim", "Borç aldım (+)"]],
    odeme: [["odeme-aldim", "Ödeme aldım (+)"], ["odeme-yaptim", "Ödeme yaptım (−)"]]
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
    parselDialog.showModal();
  }
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

  /* ---------- Kasa: gelir/gider formu ---------- */
  const kasaDialog = $("#kasaDialog");
  function kasaFormuAc(tur) {
    durum.kasaTur = tur;
    $("#kasaFormBaslik").textContent = tur === "gelir" ? "Gelir ekle" : "Gider ekle";
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
    kasaDialog.showModal();
  }
  $("#gelirEkleBtn").addEventListener("click", () => kasaFormuAc("gelir"));
  $("#giderEkleBtn").addEventListener("click", () => kasaFormuAc("gider"));
  $("#kasaForm").addEventListener("submit", e => {
    e.preventDefault();
    const kayit = Store.kasaEkle({
      tur: durum.kasaTur,
      tutar: parseFloat($("#kTutar").value),
      tarih: $("#kTarih").value,
      aciklama: $("#kAciklama").value,
      kisiId: $("#kKisi").value || null,
      parselNo: $("#kParsel").value || null
    });
    if (!kayit) return;
    kasaDialog.close();
    cizKasa();
    cizAna(); // ana ekrandaki kasa toplamı da değişti
    bildir(durum.kasaTur === "gelir" ? "Gelir kasaya işlendi." : "Gider kasadan düşüldü.");
  });

  /* ---------- Toplu borç (kişi ve parsel seçimiyle) ---------- */
  const topluDialog = $("#topluDialog");
  function topluFormuAc() {
    if (Store.kisiler().length === 0) {
      bildir("Önce bir kişi ekle — toplu borç kişilere işlenir.");
      $("#kisiForm").reset();
      kisiDialog.showModal();
      return;
    }
    $("#topluForm").reset();
    $("#topluHata").hidden = true;
    $("#tTarih").value = Store.bugunISO();

    const kKutu = $("#topluKisiler");
    kKutu.innerHTML = "";
    [...Store.kisiler()]
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr"))
      .forEach(k => {
        const l = document.createElement("label");
        const c = document.createElement("input");
        c.type = "checkbox"; c.name = "tkisi"; c.value = k.id;
        l.appendChild(c);
        l.appendChild(document.createTextNode(" " + k.ad));
        kKutu.appendChild(l);
      });

    const pKutu = $("#topluParseller");
    pKutu.innerHTML = "";
    const atanmis = Store.parseller().filter(p => p.kisiId && Store.kisiBul(p.kisiId));
    if (atanmis.length === 0) {
      const bos = document.createElement("p");
      bos.className = "secim-bos";
      bos.textContent = "Atanmış parsel yok — önce Parseller ekranından atama yap.";
      pKutu.appendChild(bos);
    }
    for (const p of atanmis) {
      const sahip = Store.kisiBul(p.kisiId);
      const l = document.createElement("label");
      const c = document.createElement("input");
      c.type = "checkbox"; c.name = "tparsel"; c.value = p.no;
      l.appendChild(c);
      l.appendChild(document.createTextNode(` ${p.no} · ${sahip.ad}`));
      pKutu.appendChild(l);
    }
    topluDialog.showModal();
  }
  $("#topluBtn").addEventListener("click", topluFormuAc);
  $("#topluForm").addEventListener("submit", e => {
    e.preventDefault();
    const hata = $("#topluHata");
    hata.hidden = true;
    const kisiIds = [...document.querySelectorAll("#topluKisiler input:checked")].map(c => c.value);
    const parselNos = [...document.querySelectorAll("#topluParseller input:checked")].map(c => Number(c.value));
    if (kisiIds.length === 0 && parselNos.length === 0) {
      hata.textContent = "En az bir kişi veya parsel seç.";
      hata.hidden = false;
      return;
    }
    const eklenen = Store.topluBorcEkle({
      kisiIds, parselNos,
      tur: new FormData(e.target).get("ttur"),
      tutar: parseFloat($("#tTutar").value),
      tarih: $("#tTarih").value,
      vade: $("#tVade").value || null,
      aciklama: $("#tAciklama").value
    });
    if (eklenen.length === 0) return;
    topluDialog.close();
    cizAna();
    bildir(`${eklenen.length} kayıt deftere işlendi.`, () => {
      for (const { kisiId, hareket } of eklenen) Store.hareketSil(kisiId, hareket.id);
      if (durum.acikKisiId) cizDetay(); else cizAna();
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
  $("#ozetBtn").addEventListener("click", ozetGoster);
  $("#ozetGeriBtn").addEventListener("click", anaGoster);
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
