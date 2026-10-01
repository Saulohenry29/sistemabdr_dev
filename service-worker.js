/* BDR ERP - Service Worker V4 SAFE OFFLINE */
const BDR_CACHE_VERSION = "bdr-erp-v4.0.6-cache-response-clone-safe";

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
  "./etiqueta-impressao.html",
  "./etiqueta-lote.html",
  "./etiqueta-config.html",
  "./manifest.json",

  "./icons/icon-192.png",
  "./icons/icon-512.png",

  "./assets/logo-bdr.png",
  "./assets/obra-bdr.jpg",
  "./imagens/engrenagem.png",

  "./CSS/layout-bdr.css",
  "./CSS/responsivo-bdr.css",
  "./CSS/bdr-fix-menu-final.css",

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
  "./JS/atlasEtiquetaConfig.js",
  "./JS/atlasPrintCenter.js",
  "./JS/atlasQRCode/qrcode.min.js",
  "./JS/atlasQRCode.js",

  "./JS/entrada.js",
  "./JS/triagem.js",
  "./JS/estoque.js",
  "./JS/expedicao.js",
  "./JS/patrimonioService.js",
  "./JS/patrimonio/patrimonio.js",
  "./JS/movimentacao.js",
  "./JS/usuarios.js"
];


/* =========================================================
   CACHE SEGURO
   ---------------------------------------------------------
   O navegador pode carregar MP3 em partes usando HTTP 206.
   O Cache Storage não aceita respostas parciais.

   Esta função salva somente respostas completas e válidas.
========================================================= */
async function bdrSalvarRespostaCompletaNoCache(cacheName, request, response){
  try{
    if(!response) return false;

    // Resposta parcial de áudio/vídeo: não pode entrar no Cache Storage.
    if(response.status === 206) return false;

    // Evita guardar erros, redirecionamentos problemáticos e respostas inválidas.
    if(!response.ok) return false;

    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    return true;
  }catch(error){
    console.warn("BDR SW: resposta não armazenada no cache:", request.url, error);
    return false;
  }
}

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
      caches.match(req).then(cached => cached || fetch(req).then(resp => {
        bdrSalvarRespostaCompletaNoCache(BDR_CACHE_VERSION, req, resp.clone());
        return resp;
      }).catch(() => cached))
    );
    return;
  }

  if(req.headers.get("accept")?.includes("text/html")){
    event.respondWith(
      fetch(req).then(resp => {
        bdrSalvarRespostaCompletaNoCache(BDR_CACHE_VERSION, req, resp.clone());
        return resp;
      }).catch(async () => await caches.match(req) || await caches.match("./login.html") || await caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    fetch(req).then(resp => {
      bdrSalvarRespostaCompletaNoCache(BDR_CACHE_VERSION, req, resp.clone());
      return resp;
    }).catch(async () => await caches.match(req))
  );
});

self.addEventListener("message", event => {
  if(event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
