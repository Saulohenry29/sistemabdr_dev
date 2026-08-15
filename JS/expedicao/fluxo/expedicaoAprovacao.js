/* =========================================================
   ATLAS EXPEDIÇÃO — APROVAÇÃO
   Responsabilidade extraída do antigo expedicaoCore.js.
   Arquivo definitivo do módulo; sem camada de patch.
========================================================= */

(function(){
  "use strict";

  function isSolicitado(p){
    return ["SOLICITADO","AGUARDANDO_AUTORIZACAO"].includes(String(p?.status || "").toUpperCase());
  }

  function pedidoLocal(id){
    return (window.pedidos || pedidos || []).find(p => Number(p.id) === Number(id));
  }

  function itensDoPedidoLocal(p){
    return Array.isArray(p?.itens_retirada) ? p.itens_retirada : [];
  }

  function quantidadeItemAtlas(i){
    const qtd = Number(i?.quantidade || i?.quantidade_solicitada || 1);
    return Number.isFinite(qtd) && qtd > 0 ? qtd : 1;
  }

  function badgeQuantidadeAtlas(i){
    return `<span style="
      display:inline-flex;
      align-items:center;
      gap:5px;
      margin-top:6px;
      padding:5px 9px;
      border-radius:999px;
      background:#dbeafe;
      color:#1d4ed8;
      font-size:11px;
      font-weight:950;
      white-space:nowrap;
    ">📦 Qtd solicitada: ${quantidadeItemAtlas(i)}</span>`;
  }

  function itemTituloAtlas(i){
    return esc(
      i.patrimonio_codigo ||
      i.codigo ||
      i.produto_codigo ||
      (i.produto_id ? "EST-" + i.produto_id : "") ||
      ("ITEM-" + i.id)
    );
  }

  renderizarPedidos = function(){
    const todos = window.pedidos || pedidos || [];
    const solicitados = todos.filter(p => isSolicitado(p));
    lista("listaSolicitacoes", solicitados);
    lista("listaSeparacao", todos.filter(p => ["EM_SEPARACAO"].includes(String(p.status||"").toUpperCase())));
        lista("listaRetirada", todos.filter(p => String(p.status||"").toUpperCase()==="AGUARDANDO_RETIRADA"));
    lista("listaTransito", todos.filter(p => String(p.status||"").toUpperCase()==="EM_TRANSITO"));
    lista("listaHistorico", todos.filter(p => ["RECEBIDO","RECEBIDO_PARCIAL","RECUSADO","CANCELADO","ENTREGUE","NEGADO","RECEBIDO_COM_DIVERGENCIA"].includes(String(p.status||"").toUpperCase())));
  };

  acoesPedido = function(p){
    const st = String(p.status || "").toUpperCase();

    if(isSolicitado(p) && podeAlmoxarife()){
      return `
        <button class="btn-mini btn-red" onclick="recusarTodosAtlas(${p.id})">Recusar todos</button>
        <button class="btn-mini btn-blue" onclick="abrirAprovacaoParcialAtlas(${p.id})">Autorizar parcial</button>
        <button class="btn-mini btn-ok" onclick="autorizarTodosAtlas(${p.id})">Autorizar todos</button>`;
    }


    if(st === "EM_SEPARACAO" && podeAlmoxarife()){
      return `<button class="btn-mini btn-ok" onclick="reservar(${p.id})">Concluir separação</button>`;
    }

    if(st==="AGUARDANDO_RETIRADA" && podeAlmoxarife()){
      return `<button class="btn-mini btn-ok" onclick="abrirRetirada(${p.id})">Retirada</button>`;
    }

    if(st==="EM_TRANSITO"){
      return `<button class="btn-mini btn-blue" onclick="alert('Recebimento pelo destino será a próxima etapa da Sprint.')">Acompanhar</button>`;
    }

    return `<button class="btn-mini btn-blue" onclick="abrirDetalhePedidoAtlas(${p.id})">Detalhes</button>`;
  };

  pedidoHTML = function(p){
    const itens = itensDoPedidoLocal(p);
    const resumoItens = itens.map(i => `${esc(i.patrimonio_codigo || i.patrimonio_nome || 'Item')} • Qtd solicitada: ${quantidadeItemAtlas(i)} • ${esc(i.status || '-')}`).join('<br>');
    return `<div class="pedido-card">
      <div class="pedido-top">
        <div class="pedido-cod">${esc(p.codigo||"PED-"+p.id)}</div>
        <div>
          <b>${esc(p.obra_nome||"-")}</b>
          <div class="pedido-small">Solicitante: ${esc(p.solicitante||"-")} • Origem: ${esc(nomeObra(p.obra_origem_id))}</div>
          <div class="pedido-small" style="margin-top:4px">${resumoItens || 'Sem itens carregados'}</div>
        </div>
        <div><span class="badge-status ${statusClass(p.status)}">${esc(p.status)}</span><div class="pedido-small">${itens.length} item(ns)</div></div>
        <div class="pedido-actions">${acoesPedido(p)}</div>
      </div>
    </div>`;
  };

  function atlasBtnProcessando(pedidoId, texto="Processando..."){
    document.querySelectorAll(`button[onclick*="${pedidoId}"]`).forEach(btn => {
      btn.dataset.txtOriginal = btn.dataset.txtOriginal || btn.innerText;
      btn.innerText = texto;
      btn.disabled = true;
      btn.style.opacity = "0.65";
      btn.style.cursor = "not-allowed";
    });
  }

  function atlasBtnRestaurar(pedidoId){
    document.querySelectorAll(`button[onclick*="${pedidoId}"]`).forEach(btn => {
      btn.innerText = btn.dataset.txtOriginal || btn.innerText;
      btn.disabled = false;
      btn.style.opacity = "";
      btn.style.cursor = "";
    });
  }

  function atlasAtualizarPedidoLocal(pedidoId, status){
    const p = pedidoLocal(pedidoId);
    if(p){ p.status = status; }
    try{ renderizarPedidos(); atualizarKPIs?.(); }catch(e){}
  }

  window.autorizarTodosAtlas = async function(pedidoId){
    if(!window.AtlasWorkflow?.aprovarTodosItensPedido){ alert("AtlasWorkflow Sprint 2.3 não carregado."); return; }
    atlasBtnProcessando(pedidoId, "Processando...");
    atlasAtualizarPedidoLocal(pedidoId, "EM_SEPARACAO");
    try{
      const r = await AtlasWorkflow.aprovarTodosItensPedido(pedidoId);
      atlasAtualizarPedidoLocal(pedidoId, r?.statusPedido || "EM_SEPARACAO");
      fecharModalDetalhe?.();
      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      atlasBtnRestaurar(pedidoId);
      alert("Erro ao autorizar: " + (e?.message || e));
    }
  };

  window.recusarTodosAtlas = async function(pedidoId){
    const motivo = prompt("Motivo para recusar todos os itens:") || "Recusado pela origem.";
    if(!window.AtlasWorkflow?.recusarTodosItensPedido){ alert("AtlasWorkflow Sprint 2.3 não carregado."); return; }
    try{
      await AtlasWorkflow.recusarTodosItensPedido(pedidoId, motivo);
      alert("Pedido recusado. Notificação enviada ao solicitante.");
      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      alert("Erro ao recusar: " + (e?.message || e));
    }
  };


  window.atlasAlternarMotivoRecusa = function(selectEl, itemId){
    const campo = document.getElementById("motivoItem_" + itemId);
    if(!campo) return;

    const recusando = String(selectEl?.value || "").toUpperCase() === "RECUSAR";
    campo.style.display = recusando ? "block" : "none";
    campo.required = recusando;
    if(recusando){
      setTimeout(() => campo.focus(), 30);
    }else{
      campo.value = "";
    }
  };

  window.abrirAprovacaoParcialAtlas = function(pedidoId){
    const p = pedidoLocal(pedidoId);
    if(!p){ alert("Pedido não encontrado na tela. Atualize a página."); return; }
    const itens = itensDoPedidoLocal(p);
    if(!itens.length){ alert("Pedido sem itens carregados."); return; }

    document.getElementById("modalTitulo").innerText = "Autorizar parcial - " + (p.codigo || ("PED-" + p.id));
    document.getElementById("modalConteudo").innerHTML = `
      <div class="info-box" style="margin-top:0">Escolha item por item. O Atlas vai definir o status geral automaticamente: APROVADO, RECUSADO ou APROVADO_PARCIAL.</div>
      <div style="display:grid;gap:10px;margin-top:12px">
        ${itens.map(i => `
          <div style="
            display:grid;
            grid-template-columns:1fr;
            gap:10px;
            padding:13px;
            border:1px solid #e2e8f0;
            border-radius:14px;
            background:#fff;
          ">
            <div style="min-width:0">
              <div style="
                color:#0f172a;
                font-size:14px;
                font-weight:950;
                line-height:1.35;
                white-space:normal;
                overflow-wrap:anywhere;
              ">${esc(i.patrimonio_nome || i.produto_nome || i.descricao || itemTituloAtlas(i))}</div>

              <div style="
                margin-top:5px;
                color:#64748b;
                font-size:11px;
                font-weight:850;
                line-height:1.35;
                overflow-wrap:anywhere;
              ">Código: ${itemTituloAtlas(i)}</div>

              ${badgeQuantidadeAtlasGlobal(i)}
            </div>

            <select
              id="decisaoItem_${i.id}"
              onchange="atlasAlternarMotivoRecusa(this,${i.id})"
              style="
                width:100%;
                height:42px;
                border:1px solid #cbd5e1;
                border-radius:11px;
                padding:0 10px;
                background:#fff;
                color:#0f172a;
                font-weight:950;
                font-size:14px;
              ">
              <option value="APROVAR">✅ Autorizar item</option>
              <option value="RECUSAR">❌ Recusar item</option>
            </select>

            <input
              id="motivoItem_${i.id}"
              placeholder="Informe o motivo da recusa"
              style="
                display:none;
                width:100%;
                min-height:42px;
                border:1px solid #fca5a5;
                border-radius:11px;
                padding:0 10px;
                background:#fff7f7;
                color:#7f1d1d;
                font-size:14px;
                font-weight:750;
              ">
          </div>`).join('')}
      </div>
      <br>
      <button class="btn-ok" onclick="confirmarAprovacaoParcialAtlas(${p.id})">Confirmar seleção</button>
    `;
    document.getElementById("modalDetalhe").classList.add("ativo");
  };

  window.confirmarAprovacaoParcialAtlas = async function(pedidoId){
    const p = pedidoLocal(pedidoId);
    const itens = itensDoPedidoLocal(p);
    const decisoes = itens.map(i => ({
      item_id: i.id,
      acao: document.getElementById("decisaoItem_" + i.id)?.value || "APROVAR",
      motivo: document.getElementById("motivoItem_" + i.id)?.value || ""
    }));

    const recusaSemMotivo = decisoes.find(d =>
      String(d.acao).toUpperCase() === "RECUSAR" &&
      !String(d.motivo || "").trim()
    );

    if(recusaSemMotivo){
      atlasToast("⚠ Informe o motivo do item recusado.");
      document.getElementById("motivoItem_" + recusaSemMotivo.item_id)?.focus();
      return;
    }

    if(!window.AtlasWorkflow?.aprovarItensPedido){ alert("AtlasWorkflow Sprint 2.3 não carregado."); return; }

    try{
      atlasBtnProcessando(pedidoId, "Processando...");
      const r = await AtlasWorkflow.aprovarItensPedido(pedidoId, decisoes);
      atlasAtualizarPedidoLocal(pedidoId, r?.statusPedido || "EM_SEPARACAO");
      fecharModalDetalhe();
      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      alert("Erro ao salvar aprovação parcial: " + (e?.message || e));
    }
  };

  window.abrirDetalhePedidoAtlas = function(pedidoId){
    const p = pedidoLocal(pedidoId);
    if(!p) return;
    const itens = itensDoPedidoLocal(p);
    document.getElementById("modalTitulo").innerText = "Detalhes - " + (p.codigo || ("PED-" + p.id));
    document.getElementById("modalConteudo").innerHTML = `
      <div class="det-line"><b>Status:</b> ${esc(p.status || '-')}</div>
      <div class="det-line"><b>Solicitante:</b> ${esc(p.solicitante || '-')}</div>
      <div class="det-line"><b>Origem:</b> ${esc(nomeObra(p.obra_origem_id))}</div>
      <div class="det-line"><b>Destino:</b> ${esc(nomeObra(p.obra_destino_id || p.obra_id))}</div>
      <br>
      ${itens.map(i => `<div class="cart-item"><div class="cart-info"><strong>${itemTituloAtlas(i)}</strong>${badgeQuantidadeAtlasGlobal(i)}<span style="display:block;margin-top:5px">Status: ${esc(i.status || '-')} ${i.motivo_recusa ? '• Motivo: '+esc(i.motivo_recusa) : ''}</span></div></div>`).join('')}
    `;
    document.getElementById("modalDetalhe").classList.add("ativo");
  };

  // Compatibilidade com botões antigos, caso algum HTML cacheado ainda chame autorizar/negar.
  window.autorizar = window.autorizarTodosAtlas;
  window.negar = window.recusarTodosAtlas;

})();

console.info("✅ ATLAS EXPEDIÇÃO APROVAÇÃO carregada");
