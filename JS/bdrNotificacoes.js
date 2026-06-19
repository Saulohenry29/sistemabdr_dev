/* =========================================================
   BDR SININHO GLOBAL - VERSÃO CORRIGIDA
   Arquivo padrão para TODAS as páginas.

   O que corrige:
   1) Evita iniciar mais de uma vez na mesma página.
   2) Usa somente 1 canal realtime.
   3) Usa somente 1 intervalo.
   4) Badge mostra somente notificações novas/não lidas.
   5) Ao abrir o sininho, marca as atuais como lidas.
   6) Funciona com MASTER, ADMIN, ALMOXARIFADO e usuários de obra/setor.

   IMPORTANTE:
   - Deixe apenas UM script de sininho por página.
   - Recomendado usar:
     <script src="./JS/bdrSininhoDashboard.js"></script>
   - Remova duplicados como bdrNotificacoes.js ou funções inline antigas,
     quando eles também mexerem em notifBadge/notifLista/notifDropdown.
========================================================= */
(function(){
  "use strict";

  if(window.BDR_SININHO_GLOBAL_ATIVO){
    console.warn("BDR Sininho: já iniciado nesta página. Ignorando duplicado.");
    return;
  }
  window.BDR_SININHO_GLOBAL_ATIVO = true;

  const STORAGE_LIDAS = "bdr_sininho_pedidos_lidos_v3";
  const STORAGE_SOM = "bdr_som_liberado";
  const CANAL_NOME = "bdr_sininho_global_pedidos_v3";

  let notificacoes = [];
  let canal = null;
  let intervalo = null;
  let primeiraCarga = true;
  let ultimaAssinaturaNaoLidas = "";
  let audioCtx = null;

  function db(){
    if(typeof window.db === "function"){
      try{
        const banco = window.db();
        if(banco) return banco;
      }catch(e){}
    }
    return window.client || window.supabaseClient || window.clientSupabase || globalThis.client || null;
  }

  function usuarioAtual(){
    try{
      const raw = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
      return raw ? JSON.parse(raw) : null;
    }catch(e){
      return null;
    }
  }

  function listaPermissoes(){
    const u = usuarioAtual();
    return String(u?.permissoes || "")
      .split(",")
      .map(p => p.trim().toUpperCase())
      .filter(Boolean);
  }

  function perfilUsuario(){
    return String(usuarioAtual()?.perfil || "").toUpperCase();
  }

  function usuarioRecebeNotificacoes(){
    const perfil = perfilUsuario();
    const perms = listaPermissoes();

    if(["MASTER", "ADMIN", "ALMOXARIFE", "ALMOXARIFADO"].includes(perfil)) return true;

    return perms.includes("RECEBER_NOTIFICACOES") ||
           perms.includes("NOTIFICACOES") ||
           perms.includes("VER_NOTIFICACOES");
  }

  function usuarioPodeVerPedido(p){
    const u = usuarioAtual();
    if(!u) return false;

    const perfil = perfilUsuario();
    const perms = listaPermissoes();

    if(["MASTER", "ADMIN"].includes(perfil)) return true;

    if(perms.includes("VER_TODAS_OBRAS") ||
       perms.includes("VER_ESTOQUE_OUTRAS_OBRAS") ||
       perms.includes("VER_ESTOQUE_OUTRAS_OBRAS")){
      return true;
    }

    const obraUsuario = String(u.obra_id || "");
    if(!obraUsuario) return false;

    return String(p.obra_id || "") === obraUsuario ||
           String(p.obra_destino_id || "") === obraUsuario ||
           String(p.obra_origem_id || "") === obraUsuario ||
           String(p.solicitante || "") === String(u.nome || "") ||
           String(p.usuario_criacao || "") === String(u.nome || "");
  }

  function statusPedidoTexto(status){
    const mapa = {
      AGUARDANDO_AUTORIZACAO:"Aguardando autorização",
      EM_SEPARACAO:"Em separação",
      AGUARDANDO_RETIRADA:"Aguardando retirada",
      EM_TRANSITO:"Em trânsito",
      AGUARDANDO_CONFERENCIA:"Aguardando conferência",
      ENTREGUE:"Entregue",
      RECEBIDO_COM_DIVERGENCIA:"Recebido com divergência",
      EM_ANALISE_DIVERGENCIA:"Em análise de divergência",
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

  function rotaPedido(status){
    status = String(status || "");
    if(status === "AGUARDANDO_AUTORIZACAO") return "retirada.html?aba=autorizar";
    if(status === "EM_SEPARACAO") return "retirada.html?aba=separar";
    if(status === "AGUARDANDO_RETIRADA") return "retirada.html?aba=prontos";
    if(["EM_TRANSITO", "AGUARDANDO_CONFERENCIA", "RECEBIDO_COM_DIVERGENCIA", "EM_ANALISE_DIVERGENCIA"].includes(status)){
      return "transferencia.html";
    }
    return "pedidos.html";
  }

  function chavePedido(p){
    return `PEDIDO-${p.id || ""}-${p.status || ""}`;
  }

  function lerLidas(){
    try{
      const obj = JSON.parse(localStorage.getItem(STORAGE_LIDAS) || "{}");
      return obj && typeof obj === "object" ? obj : {};
    }catch(e){
      return {};
    }
  }

  function salvarLidas(obj){
    try{
      const entries = Object.entries(obj || {}).slice(-900);
      localStorage.setItem(STORAGE_LIDAS, JSON.stringify(Object.fromEntries(entries)));
    }catch(e){
      localStorage.setItem(STORAGE_LIDAS, JSON.stringify(obj || {}));
    }
  }

  function marcarUmaComoLida(chave){
    const lidas = lerLidas();
    lidas[chave] = new Date().toISOString();
    salvarLidas(lidas);
  }

  function marcarAtuaisComoLidas(){
    const lidas = lerLidas();
    notificacoes.forEach(n => {
      if(n.chave) lidas[n.chave] = new Date().toISOString();
    });
    salvarLidas(lidas);
    notificacoes = notificacoes.map(n => ({...n, lida:true}));
    atualizarTela();
  }

  async function liberarSom(){
    try{
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return false;
      if(!audioCtx) audioCtx = new Ctx();
      if(audioCtx.state === "suspended") await audioCtx.resume();
      localStorage.setItem(STORAGE_SOM, "SIM");
      return true;
    }catch(e){
      return false;
    }
  }

  function tocarSom(){
    try{
      if(localStorage.getItem(STORAGE_SOM) !== "SIM") return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return;
      if(!audioCtx) audioCtx = new Ctx();
      if(audioCtx.state === "suspended") audioCtx.resume();

      [880, 1175].forEach((freq, i) => {
        const delay = i * 0.16;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
        gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.23, audioCtx.currentTime + delay + 0.02);
        gain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + delay + 0.13);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + 0.16);
      });

      if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }catch(e){}
  }

  window.bdrLiberarSomSininho = liberarSom;
  window.bdrTestarSomSininho = function(){ liberarSom().then(tocarSom); };

  document.addEventListener("click", liberarSom, { passive:true });
  document.addEventListener("touchstart", liberarSom, { passive:true });

  function aplicarCss(){
    if(document.getElementById("bdrSininhoGlobalCss")) return;
    const style = document.createElement("style");
    style.id = "bdrSininhoGlobalCss";
    style.textContent = `
      .notif-wrap{position:relative!important;}
      .notif-btn{position:relative!important;width:38px!important;height:38px!important;border:none!important;border-radius:50%!important;background:#fff!important;color:#111827!important;display:flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;padding:0!important;outline:none!important;box-shadow:none!important;caret-color:transparent!important;user-select:none!important;-webkit-user-select:none!important;-webkit-tap-highlight-color:transparent!important;}
      .notif-btn:hover{background:#fff1f2!important;color:#d71920!important;transform:translateY(-1px)!important;}
      .notif-badge{position:absolute!important;top:-3px!important;right:-4px!important;min-width:18px!important;height:18px!important;padding:0 5px!important;border-radius:999px!important;background:#dc2626!important;color:#fff!important;font-size:10px!important;font-weight:900!important;display:none;align-items:center!important;justify-content:center!important;border:2px solid #fff!important;}
      .notif-dropdown{position:absolute!important;top:50px!important;right:0!important;width:380px!important;background:#fff!important;border:1px solid #e5e7eb!important;border-radius:14px!important;box-shadow:0 18px 35px rgba(15,23,42,.18)!important;overflow:hidden!important;display:none;z-index:9999!important;}
      .notif-dropdown.ativo{display:block!important;animation:dropdownTop .16s ease!important;}
      .notif-head{padding:12px 14px!important;font-weight:900!important;color:#d71920!important;background:#fff5f5!important;border-bottom:1px solid #fecaca!important;display:flex!important;justify-content:space-between!important;align-items:center!important;gap:8px!important;}
      .notif-list{max-height:350px!important;overflow:auto!important;}
      .notif-item{padding:11px 14px!important;border-bottom:1px solid #f1f5f9!important;font-size:12px!important;color:#374151!important;cursor:pointer!important;line-height:1.35!important;}
      .notif-item:hover{background:#fff1f2!important;}
      .notif-item strong{display:block!important;color:#111827!important;margin-bottom:3px!important;}
      .notif-item small{color:#6b7280!important;}
      .notif-empty{padding:14px!important;font-size:12px!important;color:#6b7280!important;line-height:1.45!important;}
      .notif-footer{padding:10px 14px!important;background:#f9fafb!important;border-top:1px solid #e5e7eb!important;display:flex!important;gap:8px!important;justify-content:space-between!important;align-items:center!important;}
      .notif-footer button{border:none!important;border-radius:9px!important;padding:8px 10px!important;font-size:11px!important;font-weight:900!important;cursor:pointer!important;background:#111827!important;color:white!important;}
      .notif-footer button.btn-clear{background:#6b7280!important;}
      @media(max-width:900px){.notif-dropdown{right:-120px!important;width:310px!important;}}
    `;
    document.head.appendChild(style);
  }

  function limparTexto(txt){
    return String(txt || "").replace(/[<>]/g, "");
  }

  window.abrirPedidoNotificacao = function(id, chave, destino){
    if(chave) marcarUmaComoLida(chave);
    if(id) localStorage.setItem("bdr_pedido_foco", String(id));
    window.location.href = destino || "pedidos.html";
  };

  window.irHistoricoPedidos = function(){
    window.location.href = "retirada.html?aba=autorizar";
  };

  window.limparMemoriaSininho = function(){
    marcarAtuaisComoLidas();
  };

  function atualizarTela(){
    aplicarCss();

    const wrap = document.querySelector(".notif-wrap");
    const badge = document.getElementById("notifBadge");
    const lista = document.getElementById("notifLista");
    const head = document.querySelector(".notif-head");

    if(!usuarioRecebeNotificacoes()){
      if(badge) badge.style.display = "none";
      if(lista) lista.innerHTML = `<div class="notif-empty">Notificações desativadas para este usuário.</div>`;
      return;
    }

    if(head){
      head.innerHTML = `<span>🔔 Central de notificações</span><small style="font-size:11px;color:#6b7280;font-weight:800;">Pedidos</small>`;
    }

    if(!badge || !lista) return;

    const naoLidas = notificacoes.filter(n => !n.lida);
    const total = naoLidas.length;

    badge.innerText = total > 9 ? "9+" : total;
    badge.style.display = total > 0 ? "inline-flex" : "none";

    if(total === 0){
      lista.innerHTML = `
        <div class="notif-empty">
          Nenhuma notificação nova no momento.<br>
          As pendências já visualizadas continuam nas telas de <b>Retirada</b> e <b>Transferência</b>.
        </div>
        <div class="notif-footer">
          <button onclick="irHistoricoPedidos()">Abrir retirada</button>
          <button class="btn-clear" onclick="limparMemoriaSininho()">Marcar como lido</button>
        </div>
      `;
      return;
    }

    lista.innerHTML = naoLidas.map(n => `
      <div class="notif-item" onclick="abrirPedidoNotificacao('${limparTexto(n.id)}','${limparTexto(n.chave)}','${limparTexto(n.destinoTela)}')">
        <strong>🔴 ${limparTexto(n.titulo)}</strong>
        <span>${limparTexto(n.texto)}</span><br>
        <small>${limparTexto(n.data)}</small>
      </div>
    `).join("") + `
      <div class="notif-footer">
        <button onclick="irHistoricoPedidos()">Abrir retirada/transferência</button>
        <button class="btn-clear" onclick="limparMemoriaSininho()">Marcar como lido</button>
      </div>
    `;
  }

  async function carregar(){
    const banco = db();
    if(!banco){
      notificacoes = [];
      atualizarTela();
      return;
    }

    if(!usuarioRecebeNotificacoes()){
      notificacoes = [];
      atualizarTela();
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

    const resp = await banco
      .from("pedidos_retirada")
      .select("*")
      .in("status", statusMonitorados)
      .order("id", { ascending:false })
      .limit(50);

    if(resp.error){
      console.warn("BDR Sininho: erro ao carregar notificações:", resp.error.message);
      notificacoes = [];
      atualizarTela();
      return;
    }

    const lidas = lerLidas();
    const pedidos = (resp.data || []).filter(usuarioPodeVerPedido);

    notificacoes = pedidos.map(p => {
      const chave = chavePedido(p);
      return {
        id: p.id,
        chave,
        lida: Boolean(lidas[chave]),
        titulo: `${p.codigo || "PED-" + String(p.id).padStart(4,"0")} • ${statusPedidoTexto(p.status)}`,
        texto: `${p.obra_nome || p.obra || "Obra/setor"} • Solicitante: ${p.solicitante || p.usuario_criacao || "-"}`,
        data: dataBR(p.criado_em || p.atualizado_em || p.updated_at || p.data_pedido || p.data_solicitacao),
        destinoTela: rotaPedido(p.status)
      };
    });

    const assinaturaNaoLidas = notificacoes
      .filter(n => !n.lida)
      .map(n => n.chave)
      .sort()
      .join("|");

    if(!primeiraCarga && assinaturaNaoLidas && assinaturaNaoLidas !== ultimaAssinaturaNaoLidas){
      tocarSom();
    }

    primeiraCarga = false;
    ultimaAssinaturaNaoLidas = assinaturaNaoLidas;

    atualizarTela();
  }

  function iniciarRealtime(){
    const banco = db();
    if(!banco || typeof banco.channel !== "function") return;
    if(canal) return;

    try{
      canal = banco
        .channel(CANAL_NOME)
        .on("postgres_changes", { event:"*", schema:"public", table:"pedidos_retirada" }, carregar)
        .on("postgres_changes", { event:"*", schema:"public", table:"itens_retirada" }, carregar)
        .on("postgres_changes", { event:"*", schema:"public", table:"historico_pedidos_retirada" }, carregar)
        .subscribe();
    }catch(e){
      console.warn("BDR Sininho: realtime não iniciado.", e);
    }
  }

  window.toggleNotificacoes = function(event){
    if(event) event.stopPropagation();

    const dropdown = document.getElementById("notifDropdown");
    if(!dropdown) return;

    const vaiAbrir = !dropdown.classList.contains("ativo");
    dropdown.classList.toggle("ativo");

    document.getElementById("dropdownUser")?.classList.remove("ativo");
    document.getElementById("userDropdown")?.classList.remove("show");
    document.getElementById("userMenuTop")?.classList.remove("open");

    atualizarTela();

    if(vaiAbrir){
      setTimeout(() => {
        if(document.getElementById("notifDropdown")?.classList.contains("ativo")){
          marcarAtuaisComoLidas();
        }
      }, 900);
    }
  };

  function fechar(){
    document.getElementById("notifDropdown")?.classList.remove("ativo");
  }

  document.addEventListener("click", fechar);
  document.addEventListener("keydown", e => { if(e.key === "Escape") fechar(); });

  function iniciar(){
    aplicarCss();
    atualizarTela();
    carregar();
    iniciarRealtime();

    if(intervalo) clearInterval(intervalo);
    intervalo = setInterval(carregar, 30000);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", iniciar);
  }else{
    iniciar();
  }
})();
