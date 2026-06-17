/* =========================================================
   BDR SININHO PADRÃO DASHBOARD COM MEMÓRIA DE LEITURA
   VERSÃO AJUSTADA: rotas por status + lista não acumula visualizados
   - Badge mostra somente notificações NÃO LIDAS.
   - Ao abrir o sininho, as notificações atuais são marcadas como lidas.
   - Se o pedido mudar de status depois, ele volta como nova notificação.
   - Não usa created_at para evitar erro no Supabase.
========================================================= */
(function(){
  if(window.BDR_SININHO_DASHBOARD_ATIVO) return;
  window.BDR_SININHO_DASHBOARD_ATIVO = true;

  let notificacoesBDR = [];
  let notificacoesVisiveisBDR = [];
  let canalNotificacoesBDR = null;
  let intervaloNotificacoesBDR = null;
  let sininhoAbertoAgora = false;
  let primeiraCargaSininho = true;
  let ultimaAssinaturaNaoLidas = "";
  let audioCtxBDR = null;
  let somLiberadoBDR = localStorage.getItem("bdr_som_liberado") === "SIM";

  const STORAGE_LIDAS = "bdr_sininho_pedidos_lidos_v2";

  function banco(){
    if(typeof window.db === "function"){
      try{ const b = window.db(); if(b) return b; }catch(e){}
    }
    return window.client || window.supabaseClient || window.clientSupabase || null;
  }

  function usuarioAtualBDR(){
    try{
      const u = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
      return u ? JSON.parse(u) : null;
    }catch(e){ return null; }
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

  function dataBRNotificacao(data){
    if(!data) return "";
    const d = new Date(String(data).replace(" ", "T"));
    if(isNaN(d.getTime())) return "";
    return d.toLocaleString("pt-BR");
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
    // Mantém a memória pequena para não virar uma lista gigante no navegador.
    try{
      const entries = Object.entries(obj || {}).slice(-900);
      localStorage.setItem(STORAGE_LIDAS, JSON.stringify(Object.fromEntries(entries)));
    }catch(e){
      localStorage.setItem(STORAGE_LIDAS, JSON.stringify(obj || {}));
    }
  }

  function chaveEventoPedido(p){
    /*
      Chave por ID + STATUS.
      Assim: leu AGUARDANDO_AUTORIZACAO e some.
      Quando mudar para EM_SEPARACAO, vira outra chave e aparece de novo.
    */
    return `PEDIDO-${p.id || ""}-${p.status || ""}`;
  }


  /* =========================================================
     SOM DO SININHO
     Navegadores só permitem áudio depois de clique real/touch.
  ========================================================= */
  async function liberarSomBDR(){
    try{
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return false;
      if(!audioCtxBDR) audioCtxBDR = new Ctx();
      if(audioCtxBDR.state === "suspended") await audioCtxBDR.resume();
      somLiberadoBDR = true;
      localStorage.setItem("bdr_som_liberado", "SIM");
      return true;
    }catch(e){
      console.warn("Sininho: áudio não liberado ainda.", e);
      return false;
    }
  }

  function tocarSomSininhoBDR(){
    try{
      if(!somLiberadoBDR && localStorage.getItem("bdr_som_liberado") !== "SIM") return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return;
      if(!audioCtxBDR) audioCtxBDR = new Ctx();
      if(audioCtxBDR.state === "suspended") audioCtxBDR.resume();

      const ctx = audioCtxBDR;
      const tons = [880, 1175];

      tons.forEach((freq, i) => {
        const delay = i * 0.16;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.23, ctx.currentTime + delay + 0.02);
        gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.13);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.16);
      });

      if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }catch(e){
      console.warn("Sininho: não foi possível tocar o som.", e);
    }
  }

  window.bdrLiberarSomSininho = liberarSomBDR;
  window.bdrRotaNotificacao = function(status){
    status = String(status || "");

    // Rotas inteligentes por etapa do pedido.
    if(status === "AGUARDANDO_AUTORIZACAO") return "retirada.html?aba=autorizar";
    if(status === "EM_SEPARACAO") return "retirada.html?aba=separar";
    if(status === "AGUARDANDO_RETIRADA") return "retirada.html?aba=prontos";

    if(["EM_TRANSITO","AGUARDANDO_CONFERENCIA","ENTREGUE","RECEBIDO_COM_DIVERGENCIA","EM_ANALISE_DIVERGENCIA"].includes(status)) return "transferencia.html";
    return "pedidos.html";
  };

  window.bdrTestarSomSininho = function(){
    liberarSomBDR().then(() => tocarSomSininhoBDR());
  };

  document.addEventListener("click", liberarSomBDR, { passive:true });
  document.addEventListener("touchstart", liberarSomBDR, { passive:true });

  function aplicarCssSininho(){
    if(document.getElementById("bdrSininhoDashboardCss")) return;
    const style = document.createElement("style");
    style.id = "bdrSininhoDashboardCss";
    style.textContent = `
      .notif-wrap{position:relative!important;}
      .notif-btn{position:relative!important;width:38px!important;height:38px!important;border:none!important;border-radius:50%!important;background:#fff!important;color:#111827!important;display:flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;padding:0!important;outline:none!important;box-shadow:none!important;caret-color:transparent!important;user-select:none!important;-webkit-user-select:none!important;-webkit-tap-highlight-color:transparent!important;}
      .notif-btn:hover{background:#fff1f2!important;color:#d71920!important;transform:translateY(-1px)!important;}
      .notif-badge{position:absolute!important;top:-3px!important;right:-4px!important;min-width:18px!important;height:18px!important;padding:0 5px!important;border-radius:999px!important;background:#dc2626!important;color:#fff!important;font-size:10px!important;font-weight:900!important;display:none;align-items:center!important;justify-content:center!important;border:2px solid #fff!important;}
      .notif-dropdown{position:absolute!important;top:50px!important;right:0!important;width:380px!important;background:#fff!important;border:1px solid #e5e7eb!important;border-radius:14px!important;box-shadow:0 18px 35px rgba(15,23,42,.18)!important;overflow:hidden!important;display:none;z-index:9999!important;}
      .notif-dropdown.ativo{display:block!important;animation:dropdownUser .16s ease!important;}
      .notif-head{padding:12px 14px!important;font-weight:900!important;color:#d71920!important;background:#fff5f5!important;border-bottom:1px solid #fecaca!important;display:flex!important;justify-content:space-between!important;align-items:center!important;gap:8px!important;}
      .notif-list{max-height:350px!important;overflow:auto!important;}
      .notif-item{padding:11px 14px!important;border-bottom:1px solid #f1f5f9!important;font-size:12px!important;color:#374151!important;cursor:pointer!important;line-height:1.35!important;}
      .notif-item:hover{background:#fff1f2!important;}
      .notif-item strong{display:block!important;color:#111827!important;margin-bottom:3px!important;}
      .notif-item small{color:#6b7280!important;}
      .notif-item.lida{opacity:.62!important;background:#fafafa!important;}
      .notif-empty{padding:14px!important;font-size:12px!important;color:#6b7280!important;line-height:1.45!important;}
      .notif-footer{padding:10px 14px!important;background:#f9fafb!important;border-top:1px solid #e5e7eb!important;display:flex!important;gap:8px!important;justify-content:space-between!important;align-items:center!important;}
      .notif-footer button{border:none!important;border-radius:9px!important;padding:8px 10px!important;font-size:11px!important;font-weight:900!important;cursor:pointer!important;background:#111827!important;color:white!important;}
      .notif-footer button.btn-clear{background:#6b7280!important;}
      @media(max-width:900px){.notif-dropdown{right:-120px!important;width:310px!important;}}
    `;
    document.head.appendChild(style);
  }

  function abrirPedidoNotificacao(id, chave, destino){
    if(chave) marcarUmaComoLida(chave);
    if(id){ localStorage.setItem("bdr_pedido_foco", String(id)); }
    window.location.href = destino || "pedidos.html";
  }
  window.abrirPedidoNotificacao = abrirPedidoNotificacao;

  function irHistoricoPedidos(){ window.location.href = "retirada.html?aba=autorizar"; }
  window.irHistoricoPedidos = irHistoricoPedidos;

  function limparMemoriaSininho(){
    // Mantém o layout bonito do Dashboard, mas sem confirmação chata.
    // Agora "limpar" significa marcar as pendências atuais como lidas.
    marcarAtuaisComoLidas();
  }
  window.limparMemoriaSininho = limparMemoriaSininho;

  function marcarUmaComoLida(chave){
    const lidas = lerLidas();
    lidas[chave] = new Date().toISOString();
    salvarLidas(lidas);
  }

  function marcarAtuaisComoLidas(){
    const lidas = lerLidas();
    notificacoesBDR.forEach(n => { lidas[n.chave] = new Date().toISOString(); });
    salvarLidas(lidas);
    notificacoesBDR = notificacoesBDR.map(n => ({...n, lida:true}));
    atualizarSininho(false);
  }

  function atualizarSininho(manterListaAberta=false){
    aplicarCssSininho();
    const badge = document.getElementById("notifBadge");
    const lista = document.getElementById("notifLista");
    const head = document.querySelector(".notif-head");

    if(head){
      head.innerHTML = `<span>🔔 Central de notificações</span><small style="font-size:11px;color:#6b7280;font-weight:800;">Pedidos</small>`;
    }
    if(!badge || !lista) return;

    const naoLidas = notificacoesBDR.filter(n => !n.lida);
    const totalNaoLidas = naoLidas.length;

    badge.innerText = totalNaoLidas > 9 ? "9+" : totalNaoLidas;
    badge.style.display = totalNaoLidas > 0 ? "inline-flex" : "none";

    // Mostra somente novas/não lidas.
    // Depois que o usuário abriu o sininho, some da lista para não acumular “quilômetro” de informação.
    const listaParaMostrar = naoLidas;

    if(listaParaMostrar.length === 0){
      lista.innerHTML = `
        <div class="notif-empty">
          Nenhuma notificação nova no momento.<br>
          As pendências visualizadas somem daqui. O processo continua em <b>Retirada/Transferência</b>.
        </div>
        <div class="notif-footer">
          <button onclick="irHistoricoPedidos()">Abrir retirada</button>
          <button class="btn-clear" onclick="limparMemoriaSininho()">Marcar como lido</button>
        </div>
      `;
      return;
    }

    lista.innerHTML = listaParaMostrar.map(n => `
      <div class="notif-item ${n.lida ? "lida" : ""}" onclick="abrirPedidoNotificacao('${String(n.id || "").replace(/'/g, "")}', '${String(n.chave || "").replace(/'/g, "")}', '${String(n.destinoTela || "pedidos.html").replace(/'/g, "")}')">
        <strong>${n.lida ? "✅ " : "🔴 "}${n.titulo}</strong>
        <span>${n.texto}</span><br>
        <small>${n.data || ""}${n.lida ? " • visualizado" : ""}</small>
      </div>
    `).join("") + `
      <div class="notif-footer">
        <button onclick="irHistoricoPedidos()">Abrir retirada/transferência</button>
        <button class="btn-clear" onclick="limparMemoriaSininho()">Marcar como lido</button>
      </div>
    `;
  }

  async function carregarNotificacoesPedidos(){
    const b = banco();
    if(!b) return;

    const usuario = usuarioAtualBDR();
    const perfil = String(usuario?.perfil || "").toUpperCase();

    const statusMonitorados = [
      "AGUARDANDO_AUTORIZACAO",
      "EM_SEPARACAO",
      "AGUARDANDO_RETIRADA",
      "EM_TRANSITO",
      "AGUARDANDO_CONFERENCIA",
      "ENTREGUE",
      "RECEBIDO_COM_DIVERGENCIA",
      "EM_ANALISE_DIVERGENCIA"
    ];

    const resp = await b
      .from("pedidos_retirada")
      .select("*")
      .in("status", statusMonitorados)
      .order("id", { ascending:false })
      .limit(30);

    if(resp.error){
      console.warn("Erro ao carregar notificações:", resp.error.message);
      notificacoesBDR = [];
      atualizarSininho();
      return;
    }

    let pedidos = resp.data || [];

    if(perfil !== "MASTER" && perfil !== "ADMIN" && perfil !== "ALMOXARIFE" && perfil !== "ALMOXARIFADO"){
      pedidos = pedidos.filter(p =>
        String(p.solicitante || "") === String(usuario?.nome || "") ||
        String(p.usuario_criacao || "") === String(usuario?.nome || "") ||
        String(p.obra_id || "") === String(usuario?.obra_id || "") ||
        String(p.obra_destino_id || "") === String(usuario?.obra_id || "") ||
        String(p.obra_origem_id || "") === String(usuario?.obra_id || "")
      );
    }

    const assinaturaAntes = ultimaAssinaturaNaoLidas;
    const lidas = lerLidas();

    notificacoesBDR = pedidos.map(p => {
      const chave = chaveEventoPedido(p);
      return {
        id:p.id,
        chave,
        lida:Boolean(lidas[chave]),
        titulo:`${p.codigo || "PED-" + String(p.id).padStart(4,"0")} • ${statusPedidoTexto(p.status)}`,
        texto:`${p.obra_nome || p.obra || "Obra/setor"} • Solicitante: ${p.solicitante || p.usuario_criacao || "-"}`,
        data:dataBRNotificacao(p.criado_em || p.atualizado_em || p.updated_at || p.data_pedido || p.data_solicitacao),
        destinoTela: window.bdrRotaNotificacao(p.status)
      };
    });

    const naoLidasAgora = notificacoesBDR
      .filter(n => !n.lida)
      .map(n => n.chave)
      .sort()
      .join("|");

    if(!primeiraCargaSininho && naoLidasAgora && naoLidasAgora !== assinaturaAntes){
      tocarSomSininhoBDR();
    }

    primeiraCargaSininho = false;
    ultimaAssinaturaNaoLidas = naoLidasAgora;

    atualizarSininho(sininhoAbertoAgora);
  }

  function iniciarRealtimeNotificacoes(){
    const b = banco();
    if(!b || typeof b.channel !== "function") return;
    if(canalNotificacoesBDR) return;

    try{
      canalNotificacoesBDR = b
        .channel("bdr-pedidos-notificacoes-memoria-dashboard")
        .on("postgres_changes", { event:"*", schema:"public", table:"pedidos_retirada" }, carregarNotificacoesPedidos)
        .on("postgres_changes", { event:"*", schema:"public", table:"itens_retirada" }, carregarNotificacoesPedidos)
        .on("postgres_changes", { event:"*", schema:"public", table:"historico_pedidos_retirada" }, carregarNotificacoesPedidos)
        .subscribe();
    }catch(e){
      console.warn("Realtime de notificações não iniciado:", e);
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

    sininhoAbertoAgora = vaiAbrir;

    if(vaiAbrir){
      atualizarSininho(true);
      // Dá tempo de enxergar a lista e depois limpa o contador.
      setTimeout(() => {
        if(document.getElementById("notifDropdown")?.classList.contains("ativo")){
          marcarAtuaisComoLidas();
          atualizarSininho(false);
        }
      }, 700);
    }
  };

  function fecharSininhoDashboard(){
    document.getElementById("notifDropdown")?.classList.remove("ativo");
    sininhoAbertoAgora = false;
    atualizarSininho(false);
  }

  document.addEventListener("click", fecharSininhoDashboard);
  document.addEventListener("keydown", e => { if(e.key === "Escape") fecharSininhoDashboard(); });

  function iniciar(){
    aplicarCssSininho();
    atualizarSininho();
    carregarNotificacoesPedidos();
    iniciarRealtimeNotificacoes();
    if(intervaloNotificacoesBDR) clearInterval(intervaloNotificacoesBDR);
    intervaloNotificacoesBDR = setInterval(carregarNotificacoesPedidos, 30000);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", iniciar);
  }else{
    iniciar();
  }
})();