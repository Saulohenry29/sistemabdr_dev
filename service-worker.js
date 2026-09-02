/* BDR ERP - Service Worker V4 SAFE OFFLINE */
const BDR_CACHE_VERSION = "bdr-erp-atlas-patrimonio-ajustes-20260902";

const BDR_ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./dashboard.html",
  "./atlas.html",
  "./estoque.html",
  "./expedicao.html",
  "./patrimonio.html",
  "./manutencao.html",
  "./manutencaobdr-fornecedor.html",
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
  "./CSS/atlas-shell.css",
  "./CSS/patrimonio.css",
  "./CSS/patrimonio-lote.css",
  "./CSS/patrimonio-remessas.css",

  "./CSS/dashboard/dashboardBase.css",
  "./CSS/dashboard/dashboardKpis.css",
  "./CSS/dashboard/dashboardLayout.css",
  "./CSS/dashboard/dashboardComponentes.css",
  "./JS/dashboard/dashboardCore.js",
  "./JS/dashboard/dashboardDados.js",
  "./JS/dashboard/dashboardFiltros.js",
  "./JS/dashboard/dashboardKpis.js",
  "./JS/dashboard/dashboardGraficos.js",
  "./JS/dashboard/dashboardAnalise.js",
  "./JS/dashboard/dashboardEstoque.js",
  "./JS/dashboard/dashboardMovimentacoes.js",
  "./JS/dashboard/dashboardRankings.js",
  "./JS/dashboard/dashboardBoot.js",

  "./JS/pwa-install.js",
  "./JS/pwa-update.js",
  "./JS/notificacoes/atlasPush.js",
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
  "./JS/expedicao/expedicaoBoot.js",
  "./JS/expedicao/expedicaoCatalogo.js",
  "./JS/expedicao/expedicaoPedidos.js",
  "./JS/expedicao/expedicaoCore.js",
  "./JS/expedicao/fluxo/expedicaoAprovacao.js",
  "./JS/expedicao/fluxo/expedicaoSolicitacoes.js",
  "./JS/expedicao/fluxo/expedicaoLogistica.js",
  "./JS/expedicao/fluxo/expedicaoFiscal.js",
  "./JS/expedicao/fluxo/expedicaoPermissoes.js",
  "./JS/expedicao/expedicaoImagens.js",
  "./JS/patrimonioService.js",
  "./JS/patrimonio/patrimonio.js",
  "./JS/patrimonio/patrimonio-remessas.js",
  "./JS/patrimonio/atlasPatrimonioAssistente.js",
  "./JS/atlasWorkflowManutencao.js",
  "./JS/manutencao/atlasManutencaoPreventiva.js",
  "./JS/manutencao/atlasManutencaoPreventivaAlertas.js",
  "./CSS/atlasManutencaoPreventiva.css",
  "./JS/atlasManutencao.js",
  "./JS/atlasManutencaoFornecedor.js",
  "./CSS/atlasManutencao.css",
  "./CSS/atlasManutencaoFornecedor.css",
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

    // Evita guardar erros e respostas inválidas.
    if(!response.ok) return false;

    /*
      IMPORTANTE:
      O clone precisa acontecer ANTES do primeiro await.
      Se esperarmos caches.open(), o navegador pode começar a consumir
      o body da resposta original e response.clone() passa a lançar:
      "Response body is already used".
    */
    let copia;
    try{
      copia = response.clone();
    }catch(errorClone){
      console.warn(
        "BDR SW: não foi possível clonar resposta antes do cache:",
        request.url,
        errorClone
      );
      return false;
    }

    const cache = await caches.open(cacheName);
    await cache.put(request, copia);
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
        bdrSalvarRespostaCompletaNoCache(BDR_CACHE_VERSION, req, resp);
        return resp;
      }).catch(() => cached))
    );
    return;
  }

  if(req.headers.get("accept")?.includes("text/html")){
    event.respondWith(
      fetch(req).then(resp => {
        bdrSalvarRespostaCompletaNoCache(BDR_CACHE_VERSION, req, resp);
        return resp;
      }).catch(async () => await caches.match(req) || await caches.match("./login.html") || await caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    fetch(req).then(resp => {
      bdrSalvarRespostaCompletaNoCache(BDR_CACHE_VERSION, req, resp);
      return resp;
    }).catch(async () => {
      const cached = await caches.match(req);
      if(cached) return cached;

      // Arquivos de áudio são opcionais. Se estiverem temporariamente
      // indisponíveis, responde vazio em vez de rejeitar o FetchEvent.
      if(url.pathname.includes('/assets/audio/')){
        return new Response(null, { status:204 });
      }

      return new Response('Offline', {
        status:503,
        statusText:'Service Unavailable',
        headers:{ 'Content-Type':'text/plain; charset=utf-8' }
      });
    })
  );
});

self.addEventListener("message", event => {
  if(event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});


/* =========================================================
   ATLAS PUSH — FCM / WEB PUSH
   Usa o MESMO Service Worker da PWA. Não existe segundo SW.
========================================================= */
function atlasPushPayload(event){
  try{
    if(!event.data) return {};
    return event.data.json() || {};
  }catch(_){
    try{ return {notification:{body:event.data?.text?.()||""}}; }
    catch(__){ return {}; }
  }
}

self.addEventListener("push", event => {
  const payload=atlasPushPayload(event);
  const n=payload.notification || {};
  const d=payload.data || {};
  const title=n.title || d.title || "Atlas";
  const options={
    body:n.body || d.body || d.mensagem || "Você recebeu uma nova notificação.",
    icon:n.icon || d.icon || "./icons/icon-192.png",
    badge:n.badge || d.badge || "./icons/icon-192.png",
    tag:d.tag || d.notificacao_id || d.tipo || "atlas-notificacao",
    renotify:true,
    data:{
      url:d.link || d.url || "./dashboard.html",
      notificacao_id:d.notificacao_id || null,
      tipo:d.tipo || null
    }
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const destino=new URL(event.notification?.data?.url || "./dashboard.html", self.registration.scope).href;
  event.waitUntil((async()=>{
    const clientes=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const cliente of clientes){
      try{
        const atual=new URL(cliente.url);
        const alvo=new URL(destino);
        if(atual.origin===alvo.origin){
          await cliente.focus();
          if("navigate" in cliente) await cliente.navigate(destino);
          return;
        }
      }catch(_){ }
    }
    if(self.clients.openWindow) await self.clients.openWindow(destino);
  })());
});
