/* BDR ERP - Service Worker V4 SAFE OFFLINE */
const BDR_CACHE_VERSION = "bdr-erp-v4.0.0";

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
  "./empresa.html",
  "./entrada.html",
  "./triagem.html",
  "./manifest.json",

  "./icons/icon-192.png",
  "./icons/icon-512.png",

  "./assets/logo-bdr.png",
  "./assets/obra-bdr.jpg",

  "./CSS/layout-bdr.css",
  "./CSS/responsivo-bdr.css",

  "./JS/pwa-install.js",
  "./JS/pwa-update.js",
  "./JS/supabaseClient.js",
  "./JS/auth.js",
  "./JS/bdrCore.js",
  "./JS/bdrSessaoRealtime.js",
  "./JS/offlineDB.js",
  "./JS/offlineSync.js",
  "./JS/offlineQueue.js",
  "./JS/bdrLocalCache.js",
  "./JS/bdrSininhoDashboard.js",

  "./JS/entrada.js",
  "./JS/triagem.js",
  "./JS/estoque.js",
  "./JS/expedicao.js",
  "./JS/patrimonioService.js",
  "./JS/movimentacao.js",
  "./JS/usuarios.js"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(BDR_CACHE_VERSION).then(async cache => {
      for(const asset of BDR_ASSETS){
        try{ await cache.add(asset); }
        catch(e){ console.warn("Cache parcial:", asset, e.message || e); }
      }
    })
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== BDR_CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);

  if(url.hostname.includes("supabase.co")) return;

  if(url.hostname.includes("cdn.jsdelivr.net") || url.hostname.includes("cdnjs.cloudflare.com")){
    event.respondWith(
      caches.match(req).then(cached => {
        return cached || fetch(req).then(resp => {
          const clone = resp.clone();
          caches.open(BDR_CACHE_VERSION).then(cache => cache.put(req, clone));
          return resp;
        }).catch(() => cached);
      })
    );
    return;
  }

  if(req.headers.get("accept")?.includes("text/html")){
    event.respondWith(
      fetch(req).then(resp => {
        const clone = resp.clone();
        caches.open(BDR_CACHE_VERSION).then(cache => cache.put(req, clone));
        return resp;
      }).catch(async () => {
        return await caches.match(req) ||
               await caches.match("./login.html") ||
               await caches.match("./index.html");
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      return cached || fetch(req).then(resp => {
        const clone = resp.clone();
        caches.open(BDR_CACHE_VERSION).then(cache => cache.put(req, clone));
        return resp;
      }).catch(() => cached);
    })
  );
});

self.addEventListener("message", event => {
  if(event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
