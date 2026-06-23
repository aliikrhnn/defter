/* =====================================================================
   ui.js — Saf render katmanı
   State tutmaz; parametre alır, DOM'a yazar. Kullanıcı metni daima
   textContent ile yazılır (XSS). Yeni görünüm eklerken aynı deseni izle.
   ===================================================================== */
"use strict";

const UI = (() => {
  const $ = s => document.querySelector(s);

  const paraFmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
  const para = n => paraFmt.format(n);
  const tarihKisa = iso => new Date(iso + "T00:00:00")
    .toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

  /* Tutar değiştiğinde kısa bir vurgu animasyonu oynatır (mürekkep "tik"i). */
  let oncekiTutarlar = {};
  function tutarYaz(el, deger, metin, sinif) {
    el.textContent = metin;
    el.className = sinif;
    if (oncekiTutarlar[el.id] !== undefined && oncekiTutarlar[el.id] !== deger) {
      el.classList.remove("vurgu");
      void el.offsetWidth;
      el.classList.add("vurgu");
    }
    oncekiTutarlar[el.id] = deger;
  }

  /* Tek gelir/gider satırı üretir — ana ekran Kasa filtresi, Kasa görünümü ve
     kişi detayı aynı satırı paylaşır. duzenleIstendi verilirse düzenle düğmesi
     eklenir; kisiGoster true ise kişi adı satırda gösterilir. */
  function kasaSatir(h, { kayitSilIstendi, duzenleIstendi, kisiGoster } = {}) {
    const isr = Store.KASA_ISARET[h.tur];
    const kisi = (kisiGoster && h.kisiId) ? Store.kisiBul(h.kisiId) : null;
    const li = document.createElement("li");
    li.innerHTML = `
      <time class="gun" datetime="${h.tarih}">${tarihKisa(h.tarih)}</time>
      <span class="orta">
        <span class="tur">${Store.KASA_TUR_AD[h.tur]}${h.parselNo ? ` <span class="parsel-rozet">Parsel ${Number(h.parselNo)}</span>` : ""}</span>
        ${kisi ? `<span class="aciklama kasa-kisi"></span>` : ""}
        ${h.aciklama ? `<span class="aciklama"></span>` : ""}
      </span>
      <span class="tutarh ${isr > 0 ? "arti" : "eksi"}">${isr > 0 ? "+" : "−"}${para(h.tutar)}</span>
      <span class="h-eylem">
        ${duzenleIstendi ? `<button type="button" class="h-duzenle" aria-label="Bu kaydı düzenle: ${Store.KASA_TUR_AD[h.tur]} ${para(h.tutar)}">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M9.8 3.1l3.1 3.1M3 13l.7-3.4 7.4-7.4a1.5 1.5 0 012.1 0l1.6 1.6a1.5 1.5 0 010 2.1L7.4 13.3 3 13z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>` : ""}
        <button type="button" class="h-sil" aria-label="Bu kaydı sil: ${Store.KASA_TUR_AD[h.tur]} ${para(h.tutar)}">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.6 9h4.8L11 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </span>`;
    const kk = li.querySelector(".kasa-kisi");
    if (kk) kk.textContent = "Kişi: " + kisi.ad;
    const ac = li.querySelector(".aciklama:not(.kasa-kisi)");
    if (ac) ac.textContent = h.aciklama;
    const dz = li.querySelector(".h-duzenle");
    if (dz) dz.addEventListener("click", () => duzenleIstendi(h));
    li.querySelector(".h-sil").addEventListener("click", () => kayitSilIstendi(h));
    return li;
  }

  /* "Devamını göster (N ... daha)" satırı */
  function devamSatiri(n, birim, devamiIstendi) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "devam";
    btn.textContent = `Devamını göster (${n} ${birim} daha)`;
    btn.addEventListener("click", devamiIstendi);
    li.appendChild(btn);
    return li;
  }

  /* ---------- Ana görünüm ---------- */
  const LISTE_LIMIT = 10; // ilk gösterilen satır sayısı; kalanı "Devamını göster" açar
  function anaCiz({ filtre, arama, satirTiklandi, tumunuGoster, devamiIstendi, kayitSilIstendi }) {
    /* Büyük rakam kasadır: tüm gelir/gider kayıtlarının kasa işaretli toplamı */
    const kasa = Store.kasaNet();
    const t = Store.kasaToplamlar();
    const netEl = $("#netTutar");
    tutarYaz(netEl, kasa, para(kasa), "tutar " + (kasa > 0 ? "poz" : kasa < 0 ? "neg" : ""));
    $("#ozGelir").textContent = para(t.gelir);
    $("#ozGider").textContent = para(t.gider);

    const liste = $("#kisiListe");
    liste.innerHTML = "";
    /* Kasa filtresi gelir/gider satırı çizer — hareket satırı stilleri devreye girer */
    liste.classList.toggle("hareketler", filtre === "kasa");
    const q = (arama || "").toLocaleLowerCase("tr");

    if (filtre === "kasa") {
      $("#bosDurum").hidden = true;
      const kayitlar = [...Store.kasaListe()]
        .filter(h => {
          if (!q) return true;
          const kisi = h.kisiId ? Store.kisiBul(h.kisiId) : null;
          return (h.aciklama || "").toLocaleLowerCase("tr").includes(q) ||
            (kisi !== null && kisi.ad.toLocaleLowerCase("tr").includes(q)) ||
            Store.KASA_TUR_AD[h.tur].toLocaleLowerCase("tr").includes(q);
        })
        .sort((a, b) => b.tarih.localeCompare(a.tarih));
      if (kayitlar.length === 0) {
        const li = document.createElement("li");
        li.className = "bos";
        li.style.borderBottom = "none";
        li.textContent = q
          ? "Bu aramayla eşleşen gelir/gider kaydı yok."
          : "Henüz gelir/gider kaydı yok — Gelir ya da Gider ekleyerek başla.";
        liste.appendChild(li);
        return;
      }
      const gizli = tumunuGoster ? 0 : Math.max(0, kayitlar.length - LISTE_LIMIT);
      const gorunurK = gizli > 0 ? kayitlar.slice(0, LISTE_LIMIT) : kayitlar;
      let i = 0;
      for (const h of gorunurK) {
        const li = kasaSatir(h, { kayitSilIstendi, kisiGoster: true });
        li.style.setProperty("--i", Math.min(i++, 12));
        liste.appendChild(li);
      }
      if (gizli > 0) liste.appendChild(devamSatiri(gizli, "kayıt", devamiIstendi));
      return;
    }

    const goster = Store.kisiler()
      .filter(k => k.ad.toLocaleLowerCase("tr").includes(q))
      .sort((a, b) => (Store.sonTarih(b) || "").localeCompare(Store.sonTarih(a) || ""));

    $("#bosDurum").hidden = Store.kisiler().length !== 0;
    if (Store.kisiler().length > 0 && goster.length === 0) {
      const li = document.createElement("li");
      li.className = "bos";
      li.style.borderBottom = "none";
      li.textContent = "Bu aramayla eşleşen kişi yok.";
      liste.appendChild(li);
    }

    const gizliSayi = tumunuGoster ? 0 : Math.max(0, goster.length - LISTE_LIMIT);
    const gorunur = gizliSayi > 0 ? goster.slice(0, LISTE_LIMIT) : goster;

    let sira = 0;
    for (const k of gorunur) {
      const { net } = Store.kisiKasaToplam(k);
      const son = Store.sonTarih(k);
      const li = document.createElement("li");
      li.style.setProperty("--i", Math.min(sira++, 12)); // kademeli giriş animasyonu
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "satir " + (net > 0 ? "poz" : net < 0 ? "neg" : "notr");
      btn.innerHTML = `
        <span class="sol">
          <span class="ad"></span>
          <span class="alt">
            ${son ? `<time datetime="${son}">Son: ${tarihKisa(son)}</time>` : "Kayıt yok"}
          </span>
        </span>
        <span class="sag">
          <span class="miktar">${para(Math.abs(net))}</span><br>
          <span class="yon">${net > 0 ? "Gelir" : net < 0 ? "Gider" : "—"}</span>
        </span>`;
      btn.querySelector(".ad").textContent = k.ad;
      btn.setAttribute("aria-label",
        `${k.ad}, net ${net > 0 ? para(net) + " gelir" : net < 0 ? para(-net) + " gider" : "kayıt yok"}`);
      btn.addEventListener("click", () => satirTiklandi(k.id));
      li.appendChild(btn);
      liste.appendChild(li);
    }

    if (gizliSayi > 0) liste.appendChild(devamSatiri(gizliSayi, "kişi", devamiIstendi));
  }

  /* ---------- Kişi detay ---------- */
  function detayCiz(kisiId, { kasaSilIstendi, kasaDuzenleIstendi }) {
    const k = Store.kisiBul(kisiId);
    if (!k) return false;

    $("#detayAd").textContent = k.ad;
    $("#detayNot").textContent = k.not || "";
    $("#detayNot").hidden = !k.not;
    const parseller = Store.kisiParselleri(kisiId);
    $("#detayParsel").textContent = parseller.length ? "Parsel: " + parseller.join(", ") : "";
    $("#detayParsel").hidden = !parseller.length;

    const { gelir, gider, net } = Store.kisiKasaToplam(k);
    const netEl = $("#detayNet");
    tutarYaz(netEl, kisiId + ":" + net, para(Math.abs(net)), "tutar " + (net > 0 ? "poz" : net < 0 ? "neg" : ""));
    const ozet = $("#detayOzet");
    ozet.innerHTML = `<span class="y">Gelir <b>${para(gelir)}</b></span><span class="k">Gider <b>${para(gider)}</b></span>`;

    const ul = $("#hareketListe");
    ul.innerHTML = "";
    const sirali = Store.kasaListe()
      .filter(h => h.kisiId === kisiId)
      .sort((a, b) => b.tarih.localeCompare(a.tarih));
    $("#detayBos").hidden = sirali.length > 0;

    let sira = 0;
    for (const h of sirali) {
      const li = kasaSatir(h, { kayitSilIstendi: kasaSilIstendi, duzenleIstendi: kasaDuzenleIstendi });
      li.style.setProperty("--i", Math.min(sira++, 12));
      ul.appendChild(li);
    }
    return true;
  }

  /* ---------- Parseller (1-63 ızgara: aktif = atanmış, pasif = boş) ---------- */
  function parselCiz({ parselTiklandi }) {
    const izgara = $("#parselIzgara");
    izgara.innerHTML = "";
    let aktif = 0;
    const tum = Store.parseller();
    for (const p of tum) {
      const sahip = p.kisiId ? Store.kisiBul(p.kisiId) : null;
      if (sahip) aktif++;
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "parsel " + (sahip ? "aktif" : "pasif");
      const noEl = document.createElement("span");
      noEl.className = "p-no";
      noEl.textContent = p.no;
      btn.appendChild(noEl);
      if (sahip) {
        const adEl = document.createElement("span");
        adEl.className = "p-ad";
        adEl.textContent = sahip.ad;
        btn.appendChild(adEl);
      }
      btn.setAttribute("aria-label",
        `Parsel ${p.no}, ${sahip ? "aktif — " + sahip.ad : "pasif — atanmamış"}`);
      btn.addEventListener("click", () => parselTiklandi(p.no));
      li.appendChild(btn);
      izgara.appendChild(li);
    }
    $("#parselOzet").textContent = `${aktif} aktif · ${tum.length - aktif} pasif`;
  }

  /* ---------- Kasa (gelir/gider listesi) ---------- */
  function kasaCiz({ kayitSilIstendi, duzenleIstendi }) {
    const kasa = Store.kasaNet();
    tutarYaz($("#kasaTutar"), kasa, para(kasa),
      "tutar " + (kasa > 0 ? "poz" : kasa < 0 ? "neg" : ""));
    const t = Store.kasaToplamlar();
    $("#kasaGelir").textContent = para(t.gelir);
    $("#kasaGider").textContent = para(t.gider);

    const ul = $("#kasaListe");
    ul.innerHTML = "";
    const sirali = [...Store.kasaListe()].sort((a, b) => b.tarih.localeCompare(a.tarih));
    $("#kasaBos").hidden = sirali.length > 0;

    let sira = 0;
    for (const h of sirali) {
      const li = kasaSatir(h, { kayitSilIstendi, duzenleIstendi, kisiGoster: true });
      li.style.setProperty("--i", Math.min(sira++, 12));
      ul.appendChild(li);
    }
  }

  return { anaCiz, detayCiz, parselCiz, kasaCiz, para };
})();
