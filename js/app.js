/* =====================================================================
   app.js — Başlatma, görünüm geçişleri ve olay bağlama
   Tüm uygulama state'i burada yaşar; render UI'a, veri Store'a delege edilir.
   ===================================================================== */
"use strict";

(() => {
  const $ = s => document.querySelector(s);

  /* ---------- Uygulama durumu ---------- */
  const durum = {
    filtre: "tumu",
    arama: "",
    acikKisiId: null,
    hareketMod: "borc",       // "borc" | "odeme"
    duzenlenenHareketId: null // doluysa hareket formu düzenleme modundadır
  };

  /* ---------- Görünüm geçişleri ---------- */
  function girisGoster() {
    $("#girisGorunum").hidden = false;
    $("#uygulama").hidden = true;
    $("#altEylem").hidden = true;
    $("#gKullanici").focus();
  }
  function uygulamaGoster() {
    $("#girisGorunum").hidden = true;
    $("#uygulama").hidden = false;
    $("#altEylem").hidden = false;
    anaGoster();
  }
  function anaGoster() {
    durum.acikKisiId = null;
    $("#detayGorunum").hidden = true;
    $("#anaGorunum").hidden = false;
    $("#detayEylemler").hidden = true;
    $("#anaEylemler").hidden = false;
    cizAna();
    window.scrollTo(0, 0);
  }
  function detayGoster(kisiId) {
    durum.acikKisiId = kisiId;
    $("#anaGorunum").hidden = true;
    $("#detayGorunum").hidden = false;
    $("#anaEylemler").hidden = true;
    $("#detayEylemler").hidden = false;
    cizDetay();
    $("#detayAd").focus();
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
        if (confirm("Bu hareket silinsin mi?")) {
          Store.hareketSil(durum.acikKisiId, h.id);
          cizDetay();
        }
      },
      hareketDuzenleIstendi(h) {
        const mod = (h.tur === "borc-verdim" || h.tur === "borc-aldim") ? "borc" : "odeme";
        hareketFormuAc(mod, h);
      }
    });
    if (!ok) anaGoster();
  }

  /* ---------- Giriş ---------- */
  $("#girisForm").addEventListener("submit", async e => {
    e.preventDefault();
    const hata = $("#girisHata");
    hata.hidden = true;
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    const tamam = await Auth.girisDene($("#gKullanici").value, $("#gSifre").value);
    btn.disabled = false;
    if (tamam) {
      e.target.reset();
      uygulamaGoster();
    } else {
      hata.hidden = false;
      $("#gSifre").value = "";
      $("#gSifre").focus();
    }
  });
  $("#cikisBtn").addEventListener("click", () => {
    Auth.cikisYap();
    girisGoster();
  });

  /* ---------- Kişi formu ---------- */
  const kisiDialog = $("#kisiDialog");
  $("#kisiEkleBtn").addEventListener("click", () => {
    $("#kisiForm").reset();
    kisiDialog.showModal();
  });
  $("#kisiForm").addEventListener("submit", e => {
    if (e.submitter && e.submitter.value !== "kaydet") return;
    const ad = $("#kisiAd").value.trim();
    if (!ad) { e.preventDefault(); return; }
    Store.kisiEkle(ad, $("#kisiNotAlan").value.trim());
    cizAna();
  });

  /* ---------- Hareket formu ---------- */
  const hareketDialog = $("#hareketDialog");
  const YONLER = {
    borc:  [["borc-verdim", "Borç verdim"], ["borc-aldim", "Borç aldım"]],
    odeme: [["odeme-aldim", "Ödeme aldım"], ["odeme-yaptim", "Ödeme yaptım"]]
  };
  /* hareket parametresi doluysa form düzenleme modunda açılır ve alanlar dolar. */
  function hareketFormuAc(mod, hareket) {
    durum.hareketMod = mod;
    durum.duzenlenenHareketId = hareket ? hareket.id : null;
    $("#hFormBaslik").textContent = hareket
      ? "Hareketi düzenle"
      : (mod === "borc" ? "Borç ekle" : "Ödeme ekle");
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

  $("#hareketForm").addEventListener("submit", e => {
    if (e.submitter && e.submitter.value !== "kaydet") return;
    const alanlar = {
      tur: new FormData(e.target).get("tur"),
      tutar: parseFloat($("#hTutar").value),
      tarih: $("#hTarih").value,
      vade: (durum.hareketMod === "borc" && $("#hVade").value) ? $("#hVade").value : null,
      aciklama: $("#hAciklama").value
    };
    const sonuc = durum.duzenlenenHareketId
      ? Store.hareketGuncelle(durum.acikKisiId, durum.duzenlenenHareketId, alanlar)
      : Store.hareketEkle(durum.acikKisiId, alanlar);
    if (!sonuc) { e.preventDefault(); return; }
    durum.duzenlenenHareketId = null;
    cizDetay();
  });

  document.querySelectorAll("[data-kapat]").forEach(b => {
    b.addEventListener("click", () => b.closest("dialog").close());
  });

  /* ---------- Diğer etkileşimler ---------- */
  $("#geriBtn").addEventListener("click", anaGoster);
  $("#kisiSilBtn").addEventListener("click", () => {
    const k = Store.kisiBul(durum.acikKisiId);
    if (k && confirm(`"${k.ad}" ve tüm hareketleri silinsin mi? Bu işlem geri alınamaz.`)) {
      Store.kisiSil(durum.acikKisiId);
      anaGoster();
    }
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

  if (Auth.girisYapildiMi()) uygulamaGoster();
  else girisGoster();

  /* Çevrimdışı destek — yalnızca güvenli bağlamda (https/localhost) çalışır */
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
