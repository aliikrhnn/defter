/* =====================================================================
   sw.js — Çevrimdışı destek
   Aynı kaynaklı statik varlıkları önbelleğe alır; ağ varsa ağı tercih
   eder (network-first), yoksa önbellekten sunar. Dosya listesi veya
   içerik değiştiğinde SURUM'u artır — eski önbellek otomatik silinir.
   ===================================================================== */
"use strict";

const SURUM = "defter-sw-v20";
const VARLIKLAR = [
  "./",
  "index.html",
  "giris.html",
  "css/style.css",
  "js/store.js",
  "js/bulut.js",
  "js/auth.js",
  "js/ui.js",
  "js/app.js",
  "js/giris.js",
  "icon.svg",
  "manifest.webmanifest"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SURUM).then(c => c.addAll(VARLIKLAR)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ad => Promise.all(ad.filter(a => a !== SURUM).map(a => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(yanit => {
        const kopya = yanit.clone();
        caches.open(SURUM).then(c => c.put(e.request, kopya));
        return yanit;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
