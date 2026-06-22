/* =========================================================
   BDR ERP - SININHO GLOBAL DEFINITIVO
   Versão: 2026-06-18

   OBJETIVO
   - Acabar com badge fantasma: número aparece, abre e não tem nada.
   - Usar UMA fonte de verdade.
   - Badge mostra somente pedidos NÃO LIDOS pelo usuário.
   - Ao abrir o sininho, marca como lido e não volta ao recarregar.
   - Se o pedido mudar de status, aparece de novo.

   IMPORTANTE
   - Deixe SOMENTE este arquivo de sininho nas páginas:
     <script src="./JS/bdrSininhoDashboard.js"></script>
   - Remova bdrNotificacoes.js e funções inline antigas de sininho.
========================================================= */
(function(){
  "use strict";

  if(window.__BDR_SININHO_GLOBAL_INICIADO__){
    console.warn("BDR Sininho: já iniciado. Bloqueando segunda inicialização.");
    return;
  }
  window.__BDR_SININHO_GLOBAL_INICIADO__ = true;

  const CANAL_NOME = "bdr_sininho_global_definitivo";
  const INTERVALO_MS = 30000;

  let notificacoes = [];
  let canal = null;
  let intervalo = null;
  let observerBadge = null;
  let carregando = false;
  let primeiraCarga = true;
  let assinaturaAnterior = "";

  async function bdrSininhoOfflineReal(){
    if(localStorage.getItem("BDR_MODO_OFFLINE") === "SIM") return true;
    if(navigator.onLine === false) return true;

    try{
      if(window.BDROfflineSync?.estaOnlineReal){
        return !(await window.BDROfflineSync.estaOnlineReal({forcar:true}));
      }
      if(window.estaOnlineReal){
        return !(await window.estaOnlineReal({forcar:true}));
      }
    }catch(e){
      return true;
    }

    return false;
  }

  function bdrSininhoErroInternet(e){
    const msg = String(e?.message || e || "").toLowerCase();
    return msg.includes("failed to fetch") ||
           msg.includes("internet_disconnected") ||
           msg.includes("networkerror") ||
           msg.includes("err_internet") ||
           msg.includes("err_name_not_resolved");
  }

  function banco(){
    if(typeof window.db === "function"){
      try{
        const b = window.db();
        if(b) return b;
      }catch(e){}
    }
    return window.client || window.supabaseClient || window.clientSupabase || null;
  }

  function usuarioAtual(){
    try{
      const raw = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
      return raw ? JSON.parse(raw) : null;
    }catch(e){
      return null;
    }
  }

  function perfilUsuario(){
    return String(usuarioAtual()?.perfil || "").toUpperCase();
  }

  function permissoesUsuario(){
    return String(usuarioAtual()?.permissoes || "")
      .split(",")
      .map(p => p.trim().toUpperCase())
      .filter(Boolean);
  }

  function usuarioRecebeNotificacoes(){
    const u = usuarioAtual();
    if(!u) return false;

    const perfil = perfilUsuario();
    const perms = permissoesUsuario();

    if(perfil === "MASTER" || perfil === "ADMIN") return true;
    return perms.includes("RECEBER_NOTIFICACOES") ||
           perms.includes("VER_NOTIFICACOES") ||
           perms.includes("NOTIFICACOES");
  }

  function storageKeyLidas(){
    const u = usuarioAtual();
    const id = u?.id || u?.usuario || u?.nome || "anon";
    return "bdr_sininho_lidas_usuario_" + String(id).replace(/[^a-zA-Z0-9_-]/g,"_");
  }

  function lerLidas(){
    try{
      const obj = JSON.parse(localStorage.getItem(storageKeyLidas()) || "{}");
      return obj && typeof obj === "object" ? obj : {};
    }catch(e){
      return {};
    }
  }

  function salvarLidas(obj){
    try{
      const entradas = Object.entries(obj || {}).slice(-1000);
      localStorage.setItem(storageKeyLidas(), JSON.stringify(Object.fromEntries(entradas)));
    }catch(e){
      localStorage.setItem(storageKeyLidas(), JSON.stringify(obj || {}));
    }
  }

  function statusTexto(status){
    const mapa = {
      AGUARDANDO_AUTORIZACAO:"Aguardando autorização",
      EM_SEPARACAO:"Em separação",
      AGUARDANDO_RETIRADA:"Aguardando retirada",
      EM_TRANSITO:"Em trânsito",
      AGUARDANDO_CONFERENCIA:"Aguardando conferência",
      RECEBIDO_COM_DIVERGENCIA:"Recebido com divergência",
      EM_ANALISE_DIVERGENCIA:"Em análise de divergência",
      ENTREGUE:"Entregue",
      NEGADO:"Negado"
    };
    return mapa[status] || status || "-";
  }

  function dataBR(data){
    if(!data) return "";
    const d = new Date(String(data).replace(" ", "T"));
    if(isNaN(d.getTime())) return "";
    return d.toLocaleString("pt-BR");
  }

  function rotaPorStatus(status){
    status = String(status || "");
    if(status === "AGUARDANDO_AUTORIZACAO") return "retirada.html?aba=autorizar";
    if(status === "EM_SEPARACAO") return "retirada.html?aba=separar";
    if(status === "AGUARDANDO_RETIRADA") return "retirada.html?aba=prontos";
    if(["EM_TRANSITO","AGUARDANDO_CONFERENCIA","RECEBIDO_COM_DIVERGENCIA","EM_ANALISE_DIVERGENCIA"].includes(status)) return "transferencia.html";
    return "pedidos.html";
  }

  function chavePedido(p){
    // Chave por pedido + status. Se muda status, aparece como nova notificação.
    return `PEDIDO:${p.id || ""}:${p.status || ""}`;
  }

  function esconderBadgeAgora(){
    const badge = document.getElementById("notifBadge");
    if(badge){
      badge.innerText = "0";
      badge.style.display = "none";
    }
  }

  function aplicarCss(){
    if(document.getElementById("bdrSininhoDefinitivoCss")) return;
    const st = document.createElement("style");
    st.id = "bdrSininhoDefinitivoCss";
    st.textContent = `
      .notif-wrap{position:relative!important;}
      .notif-btn{position:relative!important;width:38px!important;height:38px!important;border:none!important;border-radius:50%!important;background:#fff!important;color:#111827!important;display:flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;padding:0!important;outline:none!important;box-shadow:none!important;user-select:none!important;caret-color:transparent!important;-webkit-tap-highlight-color:transparent!important;}
      .notif-btn:hover{background:#fff1f2!important;color:#d71920!important;transform:translateY(-1px)!important;}
      .notif-badge{position:absolute!important;top:-3px!important;right:-4px!important;min-width:18px!important;height:18px!important;padding:0 5px!important;border-radius:999px!important;background:#dc2626!important;color:#fff!important;font-size:10px!important;font-weight:900!important;display:none;align-items:center!important;justify-content:center!important;border:2px solid #fff!important;}
      .notif-dropdown{position:absolute!important;top:50px!important;right:0!important;width:380px!important;background:#fff!important;border:1px solid #e5e7eb!important;border-radius:14px!important;box-shadow:0 18px 35px rgba(15,23,42,.18)!important;overflow:hidden!important;display:none;z-index:9999!important;}
      .notif-dropdown.ativo{display:block!important;}
      .notif-head{padding:12px 14px!important;font-weight:900!important;color:#d71920!important;background:#fff5f5!important;border-bottom:1px solid #fecaca!important;display:flex!important;justify-content:space-between!important;align-items:center!important;gap:8px!important;}
      .notif-list{max-height:350px!important;overflow:auto!important;}
      .notif-item{padding:11px 14px!important;border-bottom:1px solid #f1f5f9!important;font-size:12px!important;color:#374151!important;cursor:pointer!important;line-height:1.35!important;}
      .notif-item:hover{background:#fff1f2!important;}
      .notif-item strong{display:block!important;color:#111827!important;margin-bottom:3px!important;}
      .notif-empty{padding:14px!important;font-size:12px!important;color:#6b7280!important;line-height:1.45!important;}
      .notif-footer{padding:10px 14px!important;background:#f9fafb!important;border-top:1px solid #e5e7eb!important;display:flex!important;gap:8px!important;justify-content:space-between!important;align-items:center!important;}
      .notif-footer button{border:none!important;border-radius:9px!important;padding:8px 10px!important;font-size:11px!important;font-weight:900!important;cursor:pointer!important;background:#111827!important;color:white!important;}
      .notif-footer button.btn-clear{background:#6b7280!important;}
      @media(max-width:900px){.notif-dropdown{right:-120px!important;width:310px!important;}}
    `;
    document.head.appendChild(st);
  }

  function naoLidas(){
    return notificacoes.filter(n => !n.lida);
  }

  function renderizar(){
    aplicarCss();

    const wrap = document.querySelector(".notif-wrap");
    const badge = document.getElementById("notifBadge");
    const lista = document.getElementById("notifLista");
    const head = document.querySelector(".notif-head");

    if(!badge || !lista) return;

    if(!usuarioRecebeNotificacoes()){
      if(wrap) wrap.style.display = "none";
      esconderBadgeAgora();
      return;
    }

    if(wrap) wrap.style.display = "";

    if(head){
      head.innerHTML = `<span>🔔 Central de notificações</span><small style="font-size:11px;color:#6b7280;font-weight:800;">Pedidos</small>`;
    }

    const novas = naoLidas();
    const total = novas.length;

    badge.innerText = total > 9 ? "9+" : String(total);
    badge.style.display = total > 0 ? "inline-flex" : "none";

    if(total === 0){
      lista.innerHTML = `
        <div class="notif-empty">
          Nenhuma notificação nova no momento.<br>
          As notificações lidas não voltam ao recarregar a página.
        </div>
        <div class="notif-footer">
          <button onclick="window.location.href='retirada.html'">Abrir retirada</button>
          <button class="btn-clear" onclick="window.bdrLimparSininho()">Limpar</button>
        </div>
      `;
      return;
    }

    lista.innerHTML = novas.map(n => `
      <div class="notif-item" onclick="window.bdrAbrirNotificacao('${String(n.id).replace(/'/g,"")}', '${String(n.chave).replace(/'/g,"")}', '${String(n.link).replace(/'/g,"")}')">
        <strong>🔴 ${n.titulo}</strong>
        <span>${n.texto}</span><br>
        <small>${n.data || ""}</small>
      </div>
    `).join("") + `
      <div class="notif-footer">
        <button onclick="window.location.href='retirada.html'">Abrir retirada/transferência</button>
        <button class="btn-clear" onclick="window.bdrLimparSininho()">Marcar como lido</button>
      </div>
    `;
  }

  function marcarComoLidasAtuais(){
    const lidas = lerLidas();
    notificacoes.forEach(n => { lidas[n.chave] = new Date().toISOString(); });
    salvarLidas(lidas);
    notificacoes = notificacoes.map(n => ({...n, lida:true}));
    assinaturaAnterior = "";
    renderizar();
  }

  window.bdrLimparSininho = function(){
    marcarComoLidasAtuais();
  };

  window.bdrAbrirNotificacao = function(id, chave, link){
    const lidas = lerLidas();
    if(chave) lidas[chave] = new Date().toISOString();
    salvarLidas(lidas);
    if(id) localStorage.setItem("bdr_pedido_foco", String(id));
    window.location.href = link || "pedidos.html";
  };

  window.toggleNotificacoes = function(event){
    if(event) event.stopPropagation();

    const dropdown = document.getElementById("notifDropdown");
    if(!dropdown) return;

    const abrir = !dropdown.classList.contains("ativo");
    dropdown.classList.toggle("ativo", abrir);

    document.getElementById("dropdownUser")?.classList.remove("ativo");
    document.getElementById("userDropdown")?.classList.remove("show");

    if(abrir){
      renderizar();
      // Marca como lido na hora. Assim, ao voltar/recarregar, não volta o número.
      marcarComoLidasAtuais();
    }
  };

  function fechar(){
    document.getElementById("notifDropdown")?.classList.remove("ativo");
  }

  document.addEventListener("click", fechar);
  document.addEventListener("keydown", e => { if(e.key === "Escape") fechar(); });

  async function carregar(){
    if(carregando) return;

    if(await bdrSininhoOfflineReal()){
      notificacoes = [];
      renderizar();
      esconderBadgeAgora();
      return;
    }

    carregando = true;

    try{
      const b = banco();
      if(!b){
        notificacoes = [];
        renderizar();
        return;
      }

      if(!usuarioRecebeNotificacoes()){
        notificacoes = [];
        renderizar();
        return;
      }

      const statusMonitorados = [
        "AGUARDANDO_AUTORIZACAO",
        "EM_SEPARACAO",
        "AGUARDANDO_RETIRADA",
        "EM_TRANSITO",
        "AGUARDANDO_CONFERENCIA",
        "RECEBIDO_COM_DIVERGENCIA",
        "EM_ANALISE_DIVERGENCIA"
      ];

      const resp = await b
        .from("pedidos_retirada")
        .select("*")
        .in("status", statusMonitorados)
        .order("id", { ascending:false })
        .limit(40);

      if(resp.error){
        if(!(await bdrSininhoOfflineReal())) console.warn("BDR Sininho: erro ao buscar pedidos:", resp.error.message);
        notificacoes = [];
        renderizar();
        return;
      }

      let pedidos = resp.data || [];
      const u = usuarioAtual();
      const perfil = perfilUsuario();
      const perms = permissoesUsuario();

      const podeVerTudo = perfil === "MASTER" ||
                          perfil === "ADMIN" ||
                          perms.includes("VER_TODAS_OBRAS") ||
                          perms.includes("VER_ESTOQUE_OUTRAS_OBRAS");

      if(!podeVerTudo){
        pedidos = pedidos.filter(p =>
          String(p.solicitante || "") === String(u?.nome || "") ||
          String(p.usuario_criacao || "") === String(u?.nome || "") ||
          String(p.obra_id || "") === String(u?.obra_id || "") ||
          String(p.obra_destino_id || "") === String(u?.obra_id || "") ||
          String(p.obra_origem_id || "") === String(u?.obra_id || "")
        );
      }

      const lidas = lerLidas();

      notificacoes = pedidos.map(p => {
        const chave = chavePedido(p);
        return {
          id:p.id,
          chave,
          lida:Boolean(lidas[chave]),
          titulo:`${p.codigo || "PED-" + String(p.id).padStart(4,"0")} • ${statusTexto(p.status)}`,
          texto:`${p.obra_nome || p.obra || "Obra/setor"} • Solicitante: ${p.solicitante || p.usuario_criacao || "-"}`,
          data:dataBR(p.criado_em || p.atualizado_em || p.updated_at || p.data_pedido || p.data_solicitacao),
          link:rotaPorStatus(p.status)
        };
      });

      const assinatura = naoLidas().map(n => n.chave).sort().join("|");
      if(!primeiraCarga && assinatura && assinatura !== assinaturaAnterior){
        // Não toca som ainda; vamos evitar susto durante ajuste.
      }
      primeiraCarga = false;
      assinaturaAnterior = assinatura;

      renderizar();

    }catch(e){
      console.warn("BDR Sininho: falha geral:", e);
      notificacoes = [];
      renderizar();
    }finally{
      carregando = false;
    }
  }

  async function pararRealtime(){
    const b = banco();
    if(canal && b && typeof b.removeChannel === "function"){
      try{ await b.removeChannel(canal); }catch(e){}
    }
    canal = null;
  }

  async function iniciarRealtime(){
    if(await bdrSininhoOfflineReal()){
      await pararRealtime();
      return;
    }

    const b = banco();
    if(!b || typeof b.channel !== "function") return;
    if(canal) return;

    try{
      canal = b.channel(CANAL_NOME)
        .on("postgres_changes", {event:"*", schema:"public", table:"pedidos_retirada"}, carregar)
        .on("postgres_changes", {event:"*", schema:"public", table:"itens_retirada"}, carregar)
        .on("postgres_changes", {event:"*", schema:"public", table:"historico_pedidos_retirada"}, carregar)
        .subscribe();
    }catch(e){
      canal = null;
      console.warn("BDR Sininho: realtime não iniciou:", e);
    }
  }

  function protegerBadgeContraScriptsAntigos(){
    const badge = document.getElementById("notifBadge");
    if(!badge || observerBadge) return;

    observerBadge = new MutationObserver(() => {
      const totalReal = naoLidas().length;
      const deveMostrar = totalReal > 0;
      const textoReal = totalReal > 9 ? "9+" : String(totalReal);

      if(!deveMostrar && badge.style.display !== "none"){
        badge.style.display = "none";
        badge.innerText = "0";
      }else if(deveMostrar && badge.innerText !== textoReal){
        badge.innerText = textoReal;
        badge.style.display = "inline-flex";
      }
    });

    observerBadge.observe(badge, { attributes:true, childList:true, characterData:true, subtree:true });
  }

  function iniciar(){
    aplicarCss();
    esconderBadgeAgora();
    protegerBadgeContraScriptsAntigos();

    carregar();
    iniciarRealtime();

    if(intervalo) clearInterval(intervalo);
    intervalo = setInterval(async () => {
      if(await bdrSininhoOfflineReal()){
        notificacoes = [];
        renderizar();
        esconderBadgeAgora();
        await pararRealtime();
        return;
      }

      await carregar();
      await iniciarRealtime();
    }, INTERVALO_MS);
  }

  
  window.addEventListener("offline", async () => {
    console.log("BDR Sininho: offline detectado, pausando buscas e realtime.");
    if(window.BDROfflineSync?.ativarOfflineAuto){
      window.BDROfflineSync.ativarOfflineAuto("sininho_offline");
    }
    notificacoes = [];
    renderizar();
    esconderBadgeAgora();
    await pararRealtime();
  });

  window.addEventListener("online", async () => {
    if(window.BDROfflineSync?.tentarVoltarOnline){
      await window.BDROfflineSync.tentarVoltarOnline();
    }
    await carregar();
    await iniciarRealtime();
  });

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", iniciar);
  }else{
    iniciar();
  }
  console.log("✅ BDR Sininho Global SAFE OFFLINE V2 carregado.");
})();