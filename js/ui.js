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
    const net = alacakT - borcT;
    const netEl = $("#netTutar");
    tutarYaz(netEl, net, para(net), "tutar " + (net > 0 ? "poz" : net < 0 ? "neg" : ""));
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
          <span class="tur">${Store.TUR_AD[h.tur]}</span>
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

  return { anaCiz, detayCiz, para };
})();
