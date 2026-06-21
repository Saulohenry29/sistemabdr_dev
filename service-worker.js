/* =========================================================
   BDR ERP - SERVICE WORKER
   Para forçar atualização, altere a versão:
   bdr-erp-v1.0.0 -> bdr-erp-v1.0.1
========================================================= */

const BDR_CACHE_VERSION = "bdr-erp-v1.0.0";

const BDR_ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./dashboard.html",
  "./estoque.html",
  "./expedicao.html",
  "./patrimonio.html",
  "./usuarios.html",
  "./relatorios.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./JS/pwa-install.js",
  "./JS/pwa-update.js"
];

self.addEventListener("install", event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(BDR_CACHE_VERSION).then(cache => {
      return cache.addAll(BDR_ASSETS).catch(() => null);
    })
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== BDR_CACHE_VERSION)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);

  if(
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("cdn.jsdelivr.net") ||
    url.hostname.includes("cdnjs.cloudflare.com")
  ){
    return;
  }

  if(req.headers.get("accept")?.includes("text/html")){
    event.respondWith(
      fetch(req)
        .then(resp => {
          const clone = resp.clone();
          caches.open(BDR_CACHE_VERSION).then(cache => cache.put(req, clone));
          return resp;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      return cached || fetch(req).then(resp => {
        const clone = resp.clone();
        caches.open(BDR_CACHE_VERSION).then(cache => cache.put(req, clone));
        return resp;
      });
    })
  );
});

self.addEventListener("message", event => {
  if(event.data && event.data.type === "SKIP_WAITING"){
    self.skipWaiting();
  }
});
