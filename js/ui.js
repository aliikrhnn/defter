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
  const tarihUzun = iso => new Date(iso + "T00:00:00")
    .toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  /* Tutar değiştiğinde kısa bir vurgu animasyonu oynatır (mürekkep "tik"i).
     Metni değil transform'u canlandırır; reduced-motion global kuralla kapanır. */
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

  /* ---------- Ana görünüm ---------- */
  function anaCiz({ filtre, arama, satirTiklandi }) {
    let alacakT = 0, borcT = 0;
    for (const k of Store.kisiler()) {
      const n = Store.kisiNet(k);
      if (n > 0) alacakT += n; else if (n < 0) borcT += -n;
    }
    /* Büyük rakam kasadır: tüm hareketler + gelir/gider, kasa işaretiyle */
    const kasa = Store.kasaNet();
    const netEl = $("#netTutar");
    tutarYaz(netEl, kasa, para(kasa), "tutar " + (kasa > 0 ? "poz" : kasa < 0 ? "neg" : ""));
    $("#ozAlacak").textContent = para(alacakT);
    $("#ozBorc").textContent = para(borcT);

    const liste = $("#kisiListe");
    liste.innerHTML = "";
    const q = (arama || "").toLocaleLowerCase("tr");
    const goster = Store.kisiler()
      .filter(k => k.ad.toLocaleLowerCase("tr").includes(q))
      .filter(k => {
        const n = Store.kisiNet(k);
        if (filtre === "alacak") return n > 0;
        if (filtre === "borc") return n < 0;
        return true;
      })
      .sort((a, b) => (Store.sonTarih(b) || "").localeCompare(Store.sonTarih(a) || ""));

    $("#bosDurum").hidden = Store.kisiler().length !== 0;
    if (Store.kisiler().length > 0 && goster.length === 0) {
      const li = document.createElement("li");
      li.className = "bos";
      li.style.borderBottom = "none";
      li.textContent = "Bu filtreyle eşleşen kişi yok.";
      liste.appendChild(li);
    }

    let sira = 0;
    for (const k of goster) {
      const n = Store.kisiNet(k);
      const vd = Store.vadeDurumu(k);
      const son = Store.sonTarih(k);
      const li = document.createElement("li");
      li.style.setProperty("--i", Math.min(sira++, 12)); // kademeli giriş animasyonu
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "satir " + (n > 0 ? "poz" : n < 0 ? "neg" : "notr");
      btn.innerHTML = `
        <span class="sol">
          <span class="ad"></span>
          <span class="alt">
            ${son ? `<time datetime="${son}">Son: ${tarihKisa(son)}</time>` : "Hareket yok"}
            ${vd && vd.tip === "gecmis" ? `<span class="rozet gecmis">Vadesi geçti</span>` : ""}
            ${vd && vd.tip === "yakin" ? `<span class="rozet yakin">Vade: ${tarihKisa(vd.vade)}</span>` : ""}
          </span>
        </span>
        <span class="sag">
          <span class="miktar">${para(Math.abs(n))}</span><br>
          <span class="yon">${n > 0 ? "Alacak" : n < 0 ? "Borç" : "Kapandı"}</span>
        </span>`;
      btn.querySelector(".ad").textContent = k.ad;
      btn.setAttribute("aria-label",
        `${k.ad}, ${n > 0 ? "sana " + para(n) + " borçlu"
          : n < 0 ? "ona " + para(-n) + " borçlusun" : "hesap kapalı"}` +
        (vd && vd.tip === "gecmis" ? ", vadesi geçti" : ""));
      btn.addEventListener("click", () => satirTiklandi(k.id));
      li.appendChild(btn);
      liste.appendChild(li);
    }
  }

  /* ---------- Kişi detay ---------- */
  function detayCiz(kisiId, { hareketSilIstendi, hareketDuzenleIstendi }) {
    const k = Store.kisiBul(kisiId);
    if (!k) return false;

    $("#detayAd").textContent = k.ad;
    $("#detayNot").textContent = k.not || "";
    $("#detayNot").hidden = !k.not;
    const parseller = Store.kisiParselleri(kisiId);
    $("#detayParsel").textContent = parseller.length ? "Parsel: " + parseller.join(", ") : "";
    $("#detayParsel").hidden = !parseller.length;

    const n = Store.kisiNet(k);
    const netEl = $("#detayNet");
    tutarYaz(netEl, kisiId + ":" + n, para(Math.abs(n)), "tutar " + (n > 0 ? "poz" : n < 0 ? "neg" : ""));
    const ozet = $("#detayOzet");
    ozet.innerHTML = n > 0 ? `<span class="y"><b></b> sana borçlu</span>`
      : n < 0 ? `<span class="k">Sen <b></b> kişisine borçlusun</span>`
      : `<span>Hesap kapalı</span>`;
    const adB = ozet.querySelector("b");
    if (adB) adB.textContent = k.ad;

    const ul = $("#hareketListe");
    ul.innerHTML = "";
    const sirali = [...k.hareketler].sort((a, b) => b.tarih.localeCompare(a.tarih));
    $("#detayBos").hidden = sirali.length > 0;

    const bugun = Store.bugunISO();
    let sira = 0;
    for (const h of sirali) {
      const isr = Store.ISARET[h.tur];
      const li = document.createElement("li");
      li.style.setProperty("--i", Math.min(sira++, 12)); // kademeli giriş animasyonu
      li.innerHTML = `
        <time class="gun" datetime="${h.tarih}">${tarihKisa(h.tarih)}</time>
        <span class="orta">
          <span class="tur">${Store.TUR_AD[h.tur]}${h.parselNo ? ` <span class="parsel-rozet">Parsel ${Number(h.parselNo)}</span>` : ""}</span>
          ${h.aciklama ? `<span class="aciklama"></span>` : ""}
          ${h.vade ? `<span class="vade ${h.vade < bugun ? "gecmis" : "normal"}">Vade: ${tarihUzun(h.vade)}${h.vade < bugun ? " · geçti" : ""}</span>` : ""}
        </span>
        <span class="tutarh ${isr > 0 ? "arti" : "eksi"}">${isr > 0 ? "+" : "−"}${para(h.tutar)}</span>
        <span class="h-eylem">
          <button type="button" class="h-duzenle" aria-label="Bu hareketi düzenle: ${Store.TUR_AD[h.tur]} ${para(h.tutar)}">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M9.8 3.1l3.1 3.1M3 13l.7-3.4 7.4-7.4a1.5 1.5 0 012.1 0l1.6 1.6a1.5 1.5 0 010 2.1L7.4 13.3 3 13z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button type="button" class="h-sil" aria-label="Bu hareketi sil: ${Store.TUR_AD[h.tur]} ${para(h.tutar)}">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.6 9h4.8L11 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </span>`;
      const ac = li.querySelector(".aciklama");
      if (ac) ac.textContent = h.aciklama;
      li.querySelector(".h-duzenle").addEventListener("click", () => hareketDuzenleIstendi(h));
      li.querySelector(".h-sil").addEventListener("click", () => hareketSilIstendi(h));
      ul.appendChild(li);
    }
    return true;
  }

  /* ---------- Kişi bazlı özet (çubuk grafik + tablo) ---------- */
  function ozetCiz() {
    const satirlar = Store.kisiler()
      .map(k => {
        const net = Store.kisiNet(k);
        return { ad: k.ad, net, alacak: net > 0 ? net : 0, borc: net < 0 ? -net : 0 };
      })
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

    $("#ozetBos").hidden = satirlar.length > 0;
    document.querySelector(".ozet-tablo").hidden = !satirlar.length;
    document.querySelectorAll(".ozet-altbaslik").forEach(b => b.hidden = !satirlar.length);

    const enBuyuk = Math.max(1, ...satirlar.map(s => Math.abs(s.net)));
    const ul = $("#ozetCubuk");
    ul.innerHTML = "";
    for (const s of satirlar) {
      const sinif = s.net > 0 ? "poz" : s.net < 0 ? "neg" : "notr";
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="c-ad"></span>
        <span class="c-bar" aria-hidden="true"><span class="c-dolgu ${sinif}"></span></span>
        <span class="c-tutar ${sinif}"></span>`;
      li.querySelector(".c-ad").textContent = s.ad;
      li.querySelector(".c-dolgu").style.setProperty("--olcek", (Math.abs(s.net) / enBuyuk).toFixed(3));
      li.querySelector(".c-tutar").textContent = para(s.net);
      ul.appendChild(li);
    }

    const govde = $("#ozetGovde");
    govde.innerHTML = "";
    let topAlacak = 0, topBorc = 0;
    for (const s of satirlar) {
      topAlacak += s.alacak; topBorc += s.borc;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <th scope="row"></th>
        <td class="y">${s.alacak ? para(s.alacak) : "—"}</td>
        <td class="k">${s.borc ? para(s.borc) : "—"}</td>
        <td class="${s.net > 0 ? "y" : s.net < 0 ? "k" : ""}">${para(s.net)}</td>`;
      tr.querySelector("th").textContent = s.ad;
      govde.appendChild(tr);
    }
    $("#ozetTopAlacak").textContent = para(topAlacak);
    $("#ozetTopBorc").textContent = para(topBorc);
    $("#ozetTopNet").textContent = para(topAlacak - topBorc);
    $("#ozetTopNet").className = topAlacak - topBorc > 0 ? "y" : topAlacak - topBorc < 0 ? "k" : "";
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
  function kasaCiz({ kayitSilIstendi }) {
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
      const isr = Store.KASA_ISARET[h.tur];
      const kisi = h.kisiId ? Store.kisiBul(h.kisiId) : null;
      const li = document.createElement("li");
      li.style.setProperty("--i", Math.min(sira++, 12));
      li.innerHTML = `
        <time class="gun" datetime="${h.tarih}">${tarihKisa(h.tarih)}</time>
        <span class="orta">
          <span class="tur">${Store.KASA_TUR_AD[h.tur]}${h.parselNo ? ` <span class="parsel-rozet">Parsel ${Number(h.parselNo)}</span>` : ""}</span>
          ${kisi ? `<span class="aciklama kasa-kisi"></span>` : ""}
          ${h.aciklama ? `<span class="aciklama"></span>` : ""}
        </span>
        <span class="tutarh ${isr > 0 ? "arti" : "eksi"}">${isr > 0 ? "+" : "−"}${para(h.tutar)}</span>
        <span class="h-eylem">
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
      li.querySelector(".h-sil").addEventListener("click", () => kayitSilIstendi(h));
      ul.appendChild(li);
    }
  }

  return { anaCiz, detayCiz, ozetCiz, parselCiz, kasaCiz, para };
})();
