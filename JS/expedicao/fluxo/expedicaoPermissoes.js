/* =========================================================
   ATLAS EXPEDIÇÃO — PERMISSÕES / ESCOPO
   Responsabilidade extraída do antigo expedicaoCore.js.
   Arquivo definitivo do módulo; sem camada de patch.
========================================================= */

(function(){
  "use strict";

  if(window.__ATLAS_EXP_ESCOPO_PERFIL_350__) return;
  window.__ATLAS_EXP_ESCOPO_PERFIL_350__ = true;

  function atlasNorm(v){
    return String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  }

  function atlasUsuario(){
    try{
      if(typeof window.usuarioAtual === "function") return window.usuarioAtual() || {};
    }catch(e){}
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        "{}"
      );
    }catch(e){ return {}; }
  }

  function atlasPerfil(){ return atlasNorm(atlasUsuario()?.perfil); }
  function atlasObraUsuario(){ return Number(atlasUsuario()?.obra_id || 0); }
  function atlasOwnerGlobal(){ return Number(atlasUsuario()?.id) === 1; }
  function atlasPermissoes(){
    return atlasNorm(atlasUsuario()?.permissoes).split(/[;,|]/).map(x => x.trim()).filter(Boolean);
  }

  function atlasObrasVisiveis(){
    const u=atlasUsuario()||{};
    const ids=new Set();

    if(u.obra_id) ids.add(Number(u.obra_id));

    String(u.permissoes||"")
      .split(",")
      .map(x=>x.trim())
      .filter(Boolean)
      .forEach(token=>{
        const m=String(token).toUpperCase().match(/^EXPEDICAO_OBRA_(\d+)$/);
        if(m) ids.add(Number(m[1]));
      });

    return [...ids].filter(Number.isFinite);
  }

  function atlasVeTodasObras(){
    return atlasOwnerGlobal() || atlasTemPermissao("VER_TODAS_OBRAS");
  }

  function atlasObraVisivel(id){
    if(atlasVeTodasObras()) return true;
    const obraId=Number(id||0);
    return !!obraId && atlasObrasVisiveis().includes(obraId);
  }

  function atlasTemPermissao(...permissoes){
    const atuais = atlasPermissoes();
    return permissoes.some(p => atuais.includes(atlasNorm(p)));
  }
  function atlasEhGestor(){ return ["MASTER","ADMIN"].includes(atlasPerfil()); }
  function atlasEhAlmoxarife(){ return ["ALMOXARIFE","ALMOXARIFADO"].includes(atlasPerfil()); }
  function atlasEquipeOperacional(){
    return atlasEhGestor() || atlasEhAlmoxarife() || atlasTemPermissao("EXPEDICAO_SEPARAR","SEPARAR_PEDIDO");
  }
  function atlasEhResponsavelTransporte(){
    return atlasOwnerGlobal() || atlasTemPermissao("EXPEDICAO_TRANSPORTE","EXPEDICAO_ENTREGAR","ENTREGAR_MATERIAL");
  }

  function atlasPedidoPorId(id){
    const lista = window.pedidos || (typeof pedidos !== "undefined" ? pedidos : []) || [];
    return lista.find(p => Number(p?.id) === Number(id));
  }

  function atlasObraOrigem(p){ return Number(p?.obra_origem_id || 0); }
  function atlasObraDestino(p){ return Number(p?.obra_destino_id || p?.obra_id || 0); }
  function atlasMesmaObraOrigem(p){
    return atlasObraVisivel(atlasObraOrigem(p));
  }
  function atlasMesmaObraDestino(p){
    return atlasObraVisivel(atlasObraDestino(p));
  }

  function atlasPedidoDoUsuario(p){
    if(atlasOwnerGlobal()) return true;
    const u = atlasUsuario() || {};
    const uid = Number(u.id || u.usuario_id || 0);
    const ids = [
      p?.solicitante_id,
      p?.solicitado_por,
      p?.usuario_criacao_id,
      p?.criado_por_id,
      p?.usuario_id
    ].map(Number).filter(Boolean);
    if(uid && ids.includes(uid)) return true;

    const nome = atlasNorm(u.nome || u.usuario || u.email);
    if(!nome) return false;
    return [p?.solicitante, p?.usuario_criacao, p?.solicitado_por_nome]
      .some(v => atlasNorm(v) === nome);
  }

  function atlasPodeAutorizar(p){
    return atlasOwnerGlobal() || (atlasEhGestor() && atlasMesmaObraOrigem(p));
  }

  function atlasPodeSeparar(p){
    return atlasOwnerGlobal() || (atlasEquipeOperacional() && atlasMesmaObraOrigem(p));
  }

  function atlasPodeRetirada(p){
    return atlasOwnerGlobal() || (atlasEhResponsavelTransporte() && atlasMesmaObraOrigem(p));
  }
  function atlasPodeNfe(p){ return atlasPodeAutorizar(p); }
  function atlasPodeReceber(p){ return atlasOwnerGlobal() || atlasMesmaObraDestino(p); }

  function atlasPodeAcompanhar(p){
    if(atlasOwnerGlobal()) return true;
    return atlasPedidoDoUsuario(p) || atlasMesmaObraOrigem(p) || atlasMesmaObraDestino(p);
  }

  window.AtlasExpedicaoPermissoes = Object.freeze({
    ownerGlobal: atlasOwnerGlobal,
    podeAutorizar: atlasPodeAutorizar,
    podeSeparar: atlasPodeSeparar,
    podeRetirada: atlasPodeRetirada,
    podeReceber: atlasPodeReceber,
    podeAcompanhar: atlasPodeAcompanhar,
    pedidoDoUsuario: atlasPedidoDoUsuario,
    mesmaObraOrigem: atlasMesmaObraOrigem,
    mesmaObraDestino: atlasMesmaObraDestino,
    obrasVisiveis: atlasObrasVisiveis,
    obraVisivel: atlasObraVisivel
  });

  function atlasStatus(p){ return atlasNorm(p?.status).replaceAll(" ", "_"); }

  function atlasAjustarAbaRetirada(){
    const podeVerRetirada = atlasEhResponsavelTransporte();
    const botao = [...document.querySelectorAll(".tab-btn")].find(btn => {
      const onclick = btn.getAttribute("onclick") || "";
      return onclick.includes("'retirada'") || onclick.includes('"retirada"');
    });
    const secao = document.getElementById("tab-retirada");
    if(botao){ botao.style.display = podeVerRetirada ? "" : "none"; botao.setAttribute("aria-hidden", podeVerRetirada ? "false" : "true"); }
    if(secao){ secao.style.display = podeVerRetirada ? "" : "none"; secao.setAttribute("aria-hidden", podeVerRetirada ? "false" : "true"); }
  }

  function atlasAjustarAbaAprovacao(){
    const podeVerAprovacao = atlasOwnerGlobal() || atlasEhGestor();

    const botao = [...document.querySelectorAll(".tab-btn")]
      .find(btn => {
        const onclick = btn.getAttribute("onclick") || "";
        return onclick.includes("'solicitacoes'") ||
               onclick.includes('"solicitacoes"');
      });

    const secao = document.getElementById("tab-solicitacoes");

    if(botao){
      botao.style.display = podeVerAprovacao ? "" : "none";
      botao.setAttribute("aria-hidden", podeVerAprovacao ? "false" : "true");
    }

    if(secao){
      secao.style.display = podeVerAprovacao ? "" : "none";
      secao.setAttribute("aria-hidden", podeVerAprovacao ? "false" : "true");
    }

    /*
     * Se um usuário sem permissão entrou por URL ou ficou com a aba
     * ativa no navegador, volta automaticamente ao Catálogo.
     */
    if(!podeVerAprovacao && secao?.classList.contains("active")){
      const botaoCatalogo = [...document.querySelectorAll(".tab-btn")]
        .find(btn => {
          const onclick = btn.getAttribute("onclick") || "";
          return onclick.includes("'catalogo'") ||
                 onclick.includes('"catalogo"');
        });

      if(typeof window.abrirAba === "function"){
        window.abrirAba("catalogo", botaoCatalogo || null);
      }
    }
  }

  function atlasListaEscopo(id, arr, vazio){
    const el = document.getElementById(id);
    if(!el) return;
    if(!arr.length){
      el.innerHTML = `<div class="cart-empty">${typeof esc === "function" ? esc(vazio) : vazio}</div>`;
      return;
    }
    el.innerHTML = arr.map(p => typeof pedidoHTML === "function" ? pedidoHTML(p) : "").join("");
  }

  /* Cada aba recebe somente os pedidos que cabem ao usuário atual. */
  window.renderizarPedidos = renderizarPedidos = function(){
    atlasAjustarAbaAprovacao();
    atlasAjustarAbaRetirada();

    const todos = (window.pedidos || (typeof pedidos !== "undefined" ? pedidos : []) || [])
      .filter(atlasPodeAcompanhar);

    const solicitacoes = todos.filter(p => {
      const st = atlasStatus(p);

      if(!["SOLICITADO","AGUARDANDO_AUTORIZACAO"].includes(st)){
        return false;
      }

      /*
       * REGRA OFICIAL ATLAS:
       * o solicitante não entra na fila de aprovação do próprio pedido.
       * A aba Solicitações é exclusiva de quem realmente pode decidir:
       * OWNER global ou MASTER/ADMIN da obra de origem.
       */
      return atlasPodeAutorizar(p);
    });

    const separacao = todos.filter(p =>
      atlasStatus(p) === "EM_SEPARACAO" && atlasPodeSeparar(p)
    );

    const retirada = todos.filter(p =>
      atlasStatus(p) === "AGUARDANDO_RETIRADA" && atlasPodeRetirada(p)
    );

    const transito = todos.filter(p => {
      if(atlasStatus(p) !== "EM_TRANSITO") return false;
      if(atlasOwnerGlobal()) return true;
      return atlasPodeRetirada(p) || atlasPodeReceber(p) || atlasPedidoDoUsuario(p);
    });

    const historico = todos.filter(p => [
      "RECEBIDO","RECEBIDO_PARCIAL","RECUSADO","CANCELADO","ENTREGUE",
      "NEGADO","RECEBIDO_COM_DIVERGENCIA"
    ].includes(atlasStatus(p)));

    atlasListaEscopo(
      "listaSolicitacoes",
      solicitacoes,
      "Nenhuma solicitação da sua obra aguardando autorização."
    );
    atlasListaEscopo("listaSeparacao", separacao,
      "Nenhum pedido da sua obra aguardando separação.");
    atlasListaEscopo("listaRetirada", retirada,
      "Nenhum pedido da sua obra aguardando retirada.");
    atlasListaEscopo("listaTransito", transito,
      "Nenhum pedido relacionado à sua obra está em trânsito.");
    atlasListaEscopo("listaHistorico", historico,
      "Nenhum histórico relacionado à sua obra ou às suas solicitações.");
  };

  function atlasNegarAcao(msg){
    const texto = msg || "Esta etapa pertence à equipe da obra de origem do pedido.";

    if(window.AtlasModal?.erro){
      window.AtlasModal.erro(texto);
    }else if(typeof window.atlasToast === "function"){
      window.atlasToast("🔒 " + texto);
    }else{
      console.warn("Atlas Expedição:", texto);
    }

    return false;
  }

  function atlasProtegerFuncao(nome, regra, mensagem){
    const original = window[nome];
    if(typeof original !== "function" || original.__atlasProtegida350) return;
    const protegida = async function(pedidoId, ...args){
      const p = atlasPedidoPorId(pedidoId);
      if(!p || !regra(p)) return atlasNegarAcao(mensagem);
      return await original.call(this, pedidoId, ...args);
    };
    protegida.__atlasProtegida350 = true;
    window[nome] = protegida;
    try{ eval(`${nome}=window[nome]`); }catch(e){}
  }

  function atlasInstalarProtecoes(){
    atlasProtegerFuncao("autorizar", atlasPodeAutorizar, "Somente MASTER/ADMIN da obra de origem pode autorizar.");
    atlasProtegerFuncao("negar", atlasPodeAutorizar, "Somente MASTER/ADMIN da obra de origem pode recusar.");
    atlasProtegerFuncao("autorizarTodosAtlas", atlasPodeAutorizar, "Somente MASTER/ADMIN da obra de origem pode autorizar.");
    atlasProtegerFuncao("recusarTodosAtlas", atlasPodeAutorizar, "Somente MASTER/ADMIN da obra de origem pode recusar.");
    atlasProtegerFuncao("abrirAprovacaoParcialAtlas", atlasPodeAutorizar, "Somente MASTER/ADMIN da obra de origem pode decidir os itens.");
    atlasProtegerFuncao("confirmarAprovacaoParcialAtlas", atlasPodeAutorizar, "Somente MASTER/ADMIN da obra de origem pode decidir os itens.");
    atlasProtegerFuncao("reservar", atlasPodeSeparar, "Somente a equipe da obra de origem pode concluir a separação.");
    atlasProtegerFuncao("abrirRetirada", atlasPodeRetirada, "Somente o responsável por retirada e transporte da obra de origem pode executar esta etapa.");
    atlasProtegerFuncao("abrirRegistroNfeAtlas", atlasPodeNfe, "Somente MASTER/ADMIN da obra de origem pode registrar a NF-e.");
    atlasProtegerFuncao("confirmarRecebimentoAtlas", atlasPodeReceber, "Somente a obra de destino pode confirmar o recebimento.");

    if(window.AtlasSeparacaoQR && typeof window.AtlasSeparacaoQR.abrir === "function" && !window.AtlasSeparacaoQR.abrir.__atlasProtegida350){
      const abrirQr = window.AtlasSeparacaoQR.abrir;
      window.AtlasSeparacaoQR.abrir = function(pedidoId, ...args){
        const p = atlasPedidoPorId(pedidoId);
        if(!p || !atlasPodeSeparar(p)) return atlasNegarAcao("Somente a equipe da obra de origem pode iniciar a separação.");
        return abrirQr.call(this, pedidoId, ...args);
      };
      window.AtlasSeparacaoQR.abrir.__atlasProtegida350 = true;
    }
  }

  function atlasClassificarBotao(btn){
    const txt = atlasNorm((btn.innerText || "") + " " + (btn.getAttribute("onclick") || ""));
    if(txt.includes("AUTORIZ") || txt.includes("APROVACAO") || txt.includes("RECUSAR") || txt.includes("NEGAR")) return "AUTORIZAR";
    if(txt.includes("SEPAR") || txt.includes("RESERV")) return "SEPARAR";
    if(txt.includes("RETIRADA") || txt.includes("TRANSITO") || txt.includes("ENVIAR")) return "RETIRADA";
    if(txt.includes("NF-E") || txt.includes("NFE")) return "NFE";
    if(txt.includes("RECEBIMENTO") || txt.includes("RECEBER")) return "RECEBER";
    return "OUTRO";
  }

  function atlasLimparBotoesModal(pedidoId){
    const p = atlasPedidoPorId(pedidoId);
    if(!p) return;
    const raiz = document.getElementById("modalDetalhe") || document;
    raiz.querySelectorAll("button").forEach(btn => {
      const tipo = atlasClassificarBotao(btn);
      let pode = true;
      if(tipo === "AUTORIZAR") pode = atlasPodeAutorizar(p);
      if(tipo === "SEPARAR") pode = atlasPodeSeparar(p);
      if(tipo === "RETIRADA") pode = atlasPodeRetirada(p);
      if(tipo === "NFE") pode = atlasPodeNfe(p);
      if(tipo === "RECEBER") pode = atlasPodeReceber(p);
      if(!pode) btn.remove();
    });
  }

  function atlasProtegerModal(){
    const original = window.abrirDetalhePedidoAtlas;
    if(typeof original !== "function" || original.__atlasEscopo350) return;
    const nova = function(pedidoId, ...args){
      const p = atlasPedidoPorId(pedidoId);
      if(!p || !atlasPodeAcompanhar(p)) return atlasNegarAcao("Este pedido não pertence à sua obra nem foi solicitado por você.");
      const r = original.call(this, pedidoId, ...args);
      [0,70,180,350].forEach(t => setTimeout(() => atlasLimparBotoesModal(pedidoId), t));
      return r;
    };
    nova.__atlasEscopo350 = true;
    window.abrirDetalhePedidoAtlas = nova;
    try{ abrirDetalhePedidoAtlas = nova; }catch(e){}
  }

  function atlasAplicarTudo(){
    atlasInstalarProtecoes();
    atlasProtegerModal();
    try{ window.renderizarPedidos(); }catch(e){ console.warn("Atlas escopo: renderização pendente.", e); }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(atlasAplicarTudo, 50);
      setTimeout(atlasAplicarTudo, 500);
      setTimeout(atlasAplicarTudo, 1400);
    });
  }else{
    setTimeout(atlasAplicarTudo, 0);
    setTimeout(atlasAplicarTudo, 500);
  }

  window.addEventListener("load", () => setTimeout(atlasAplicarTudo, 300));
  window.addEventListener("atlas:owner-mode-changed", () => setTimeout(atlasAplicarTudo, 80));

})();

console.info("✅ ATLAS EXPEDIÇÃO PERMISSÕES / ESCOPO carregada");
