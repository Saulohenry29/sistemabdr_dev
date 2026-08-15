/* =========================================================
   ATLAS EXPEDIÇÃO — SOLICITAÇÕES
   Responsabilidade extraída do antigo expedicaoCore.js.
   Arquivo definitivo do módulo; sem camada de patch.
========================================================= */

(function(){
  "use strict";

  function atlasEnsureSolicitacoesCss(){
    if(document.getElementById("atlasSolicitacoesCompactasCss")) return;
    const css = document.createElement("style");
    css.id = "atlasSolicitacoesCompactasCss";
    css.textContent = `
      .atlas-pedido-compacto{
        padding:0!important;
        overflow:hidden;
      }
      .atlas-pedido-row{
        display:grid;
        grid-template-columns:110px minmax(0,1fr) 130px 96px;
        gap:12px;
        align-items:center;
        padding:12px 14px;
      }
      .atlas-pedido-numero{
        font-size:16px;
        font-weight:950;
        color:var(--bdr-red,#b91c1c);
        line-height:1.1;
      }
      .atlas-pedido-codigo{
        display:block;
        font-size:10px;
        color:#94a3b8;
        font-weight:800;
        margin-top:4px;
        word-break:break-word;
      }
      .atlas-pedido-main{min-width:0;}
      .atlas-pedido-destino{
        font-size:13px;
        font-weight:950;
        color:#0f172a;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .atlas-pedido-meta,
      .atlas-pedido-itens-resumo{
        font-size:11px;
        color:#64748b;
        font-weight:800;
        margin-top:4px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .atlas-pedido-itens-resumo{color:#334155;}
      .atlas-pedido-status{text-align:right;}
      .atlas-pedido-status .pedido-small{margin-top:4px;}
      .atlas-pedido-actions{display:flex;justify-content:flex-end;}
      .atlas-btn-abrir{
        background:#2563eb!important;
        color:#fff!important;
        border:0!important;
        border-radius:10px!important;
        padding:9px 13px!important;
        font-size:12px!important;
        font-weight:950!important;
        cursor:pointer;
      }
      .atlas-modal-pedido-head{
        display:grid;
        grid-template-columns:1fr auto;
        gap:12px;
        align-items:start;
        margin-bottom:12px;
      }
      .atlas-modal-pedido-num{
        font-size:22px;
        font-weight:950;
        color:#0f172a;
      }
      .atlas-modal-pedido-codigo{
        font-size:11px;
        color:#64748b;
        font-weight:800;
        margin-top:2px;
      }
      .atlas-modal-grid-info{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:8px;
        margin:12px 0;
      }
      .atlas-info-mini{
        background:#f8fafc;
        border:1px solid #e5e7eb;
        border-radius:12px;
        padding:9px 10px;
      }
      .atlas-info-mini small{
        display:block;
        color:#64748b;
        font-size:10px;
        font-weight:950;
        text-transform:uppercase;
        margin-bottom:3px;
      }
      .atlas-info-mini b{
        color:#0f172a;
        font-size:12px;
        line-height:1.25;
      }
      .atlas-itens-lista{
        display:grid;
        gap:8px;
        max-height:340px;
        overflow:auto;
        padding-right:4px;
      }
      .atlas-item-pedido{
        display:grid;
        grid-template-columns:36px 1fr auto;
        gap:10px;
        align-items:center;
        border:1px solid #e5e7eb;
        border-radius:13px;
        padding:10px;
        background:#fff;
      }
      .atlas-item-ordem{
        width:30px;
        height:30px;
        border-radius:10px;
        background:#eff6ff;
        color:#2563eb;
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight:950;
        font-size:12px;
      }
      .atlas-item-codigo{
        font-size:12px;
        font-weight:950;
        color:#0f172a;
      }
      .atlas-item-nome{
        font-size:11px;
        color:#64748b;
        font-weight:800;
        margin-top:3px;
      }
      .atlas-modal-acoes{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-top:14px;
        padding-top:12px;
        border-top:1px solid #e5e7eb;
      }
      .atlas-modal-acoes button{
        border:0;
        border-radius:10px;
        padding:10px 12px;
        font-size:12px;
        font-weight:950;
        cursor:pointer;
      }
      @media(max-width:760px){
        .atlas-pedido-row{grid-template-columns:1fr;gap:8px;}
        .atlas-pedido-status{text-align:left;}
        .atlas-pedido-actions{justify-content:flex-start;}
        .atlas-modal-grid-info{grid-template-columns:1fr;}
        .atlas-item-pedido{grid-template-columns:30px 1fr;}
        .atlas-item-pedido .badge-status{grid-column:2;justify-self:start;}
      }
    `;
    document.head.appendChild(css);
  }

  function pedidoCurtoAtlas(p){
    return "PED-" + (p?.id || "-");
  }

  function obraLabelCurtaAtlas(id, fallback){
    const txt = fallback || nomeObra(id) || "-";
    return String(txt).replace(/^\d+\s*-\s*/, "").replace(/^999\s*-\s*/, "");
  }

  function codigoItemAtlas(i){
    const cod = i?.patrimonio_codigo || i?.codigo || i?.codigo_bem;
    if(cod) return String(cod);
    if(i?.patrimonio_id) return "PAT-" + String(i.patrimonio_id).padStart(6,"0");
    if(i?.produto_id) return "EST-" + String(i.produto_id).padStart(6,"0");
    return "ITEM-" + String(i?.id || "-").padStart(6,"0");
  }

  function nomeItemAtlas(i){
    return i?.patrimonio_nome || i?.produto_nome || i?.descricao || i?.nome || "Item solicitado";
  }

  function resumoItensAtlas(itens){
    if(!itens || !itens.length) return "Sem itens carregados";
    const primeiros = itens.slice(0,2).map(i => codigoItemAtlas(i) + " — " + nomeItemAtlas(i));
    const resto = itens.length > 2 ? ` +${itens.length - 2} item(ns)` : "";
    return primeiros.join(" • ") + resto;
  }

  function statusPedidoAtlas(p){
    return String(p?.status || "-").toUpperCase();
  }

  const antigoRenderizarPedidos = window.renderizarPedidos || renderizarPedidos;

  pedidoHTML = function(p){
    atlasEnsureSolicitacoesCss();
    const itens = Array.isArray(p?.itens_retirada) ? p.itens_retirada : [];
    const destino = obraLabelCurtaAtlas(p?.obra_destino_id || p?.obra_id, p?.obra_nome);
    const origem = obraLabelCurtaAtlas(p?.obra_origem_id);
    const st = statusPedidoAtlas(p);
    return `<div class="pedido-card atlas-pedido-compacto">
      <div class="atlas-pedido-row">
        <div>
          <div class="atlas-pedido-numero">${esc(pedidoCurtoAtlas(p))}</div>
          <span class="atlas-pedido-codigo">${esc(p.codigo || "")}</span>
        </div>
        <div class="atlas-pedido-main">
          <div class="atlas-pedido-destino">${esc(destino)}</div>
          <div class="atlas-pedido-meta">${esc(p.solicitante || "-")} • ${esc(origem)} → ${esc(destino)}</div>
          <div class="atlas-pedido-itens-resumo">${esc(resumoItensAtlas(itens))}</div>
        </div>
        <div class="atlas-pedido-status">
          <span class="badge-status ${statusClass(st)}">${esc(st)}</span>
          <div class="pedido-small">${itens.length} item(ns)</div>
        </div>
        <div class="atlas-pedido-actions">
          <button class="atlas-btn-abrir" onclick="abrirDetalhePedidoAtlas(${Number(p.id)})">Abrir</button>
        </div>
      </div>
    </div>`;
  };

  acoesPedido = function(p){
    return `<button class="atlas-btn-abrir" onclick="abrirDetalhePedidoAtlas(${Number(p.id)})">Abrir</button>`;
  };

  window.abrirDetalhePedidoAtlas = function(pedidoId){
    atlasEnsureSolicitacoesCss();
    const p = (window.pedidos || pedidos || []).find(x => Number(x.id) === Number(pedidoId));
    if(!p){ alert("Pedido não encontrado na tela. Atualize a página."); return; }
    const itens = Array.isArray(p.itens_retirada) ? p.itens_retirada : [];
    const st = statusPedidoAtlas(p);
    const destino = obraLabelCurtaAtlas(p.obra_destino_id || p.obra_id, p.obra_nome);
    const origem = obraLabelCurtaAtlas(p.obra_origem_id);
    const podeDecidir = ["SOLICITADO","AGUARDANDO_AUTORIZACAO"].includes(st) && podeAlmoxarife();
    const podeConcluirSeparacao = st === "EM_SEPARACAO" && podeAlmoxarife();
    const podeRetirar = st === "AGUARDANDO_RETIRADA" && podeAlmoxarife();

    let botoes = `<button style="background:#2563eb;color:#fff" onclick="fecharModalDetalhe()">Fechar</button>`;
    if(podeDecidir){
      botoes = `
        <button style="background:#16a34a;color:#fff" onclick="autorizarTodosAtlas(${Number(p.id)})">Autorizar todos</button>
        <button style="background:#2563eb;color:#fff" onclick="abrirAprovacaoParcialAtlas(${Number(p.id)})">Autorizar parcial</button>
        <button style="background:#b91c1c;color:#fff" onclick="recusarTodosAtlas(${Number(p.id)})">Recusar todos</button>
        <button style="background:#e5e7eb;color:#0f172a" onclick="fecharModalDetalhe()">Fechar</button>`;
    }else if(podeConcluirSeparacao){
      botoes = `
        <button style="background:#2563eb;color:#fff" onclick="AtlasSeparacaoQR.abrir(${Number(p.id)});fecharModalDetalhe()">📷 Iniciar separação guiada</button>
        <button style="background:#e5e7eb;color:#0f172a" onclick="fecharModalDetalhe()">Fechar</button>`;
    }else if(podeRetirar){
      botoes = `
        <button style="background:#16a34a;color:#fff" onclick="abrirRetirada(${Number(p.id)});fecharModalDetalhe()">Confirmar retirada</button>
        <button style="background:#e5e7eb;color:#0f172a" onclick="fecharModalDetalhe()">Fechar</button>`;
    }

    document.getElementById("modalTitulo").innerText = "Detalhes do pedido";
    document.getElementById("modalConteudo").innerHTML = `
      <div class="atlas-modal-pedido-head">
        <div>
          <div class="atlas-modal-pedido-num">${esc(pedidoCurtoAtlas(p))}</div>
          <div class="atlas-modal-pedido-codigo">Código completo: ${esc(p.codigo || "-")}</div>
        </div>
        <span class="badge-status ${statusClass(st)}">${esc(st)}</span>
      </div>

      <div class="atlas-modal-grid-info">
        <div class="atlas-info-mini"><small>Solicitante</small><b>${esc(p.solicitante || "-")}</b></div>
        <div class="atlas-info-mini"><small>Fluxo</small><b>${esc(origem)} → ${esc(destino)}</b></div>
        <div class="atlas-info-mini"><small>Origem</small><b>${esc(nomeObra(p.obra_origem_id))}</b></div>
        <div class="atlas-info-mini"><small>Destino</small><b>${esc(nomeObra(p.obra_destino_id || p.obra_id))}</b></div>
      </div>

      <h3 style="margin:12px 0 8px;color:#0f172a">Itens do pedido (${itens.length})</h3>
      <div class="atlas-itens-lista">
        ${itens.length ? itens.map((i,idx) => `
          <div class="atlas-item-pedido">
            <div class="atlas-item-ordem">${idx+1}</div>
            <div>
              <div class="atlas-item-codigo">${esc(codigoItemAtlas(i))}</div>
              <div class="atlas-item-nome">${esc(nomeItemAtlas(i))}${i.motivo_recusa ? " • Motivo: " + esc(i.motivo_recusa) : ""}</div>
              ${badgeQuantidadeAtlasGlobal(i)}
            </div>
            <span class="badge-status ${statusClass(i.status || 'PENDENTE')}">${esc(i.status || 'PENDENTE')}</span>
          </div>`).join("") : `<div class="cart-empty">Nenhum item carregado.</div>`}
      </div>
      <div class="atlas-modal-acoes">${botoes}</div>
    `;
    document.getElementById("modalDetalhe").classList.add("ativo");
  };

})();

console.info("✅ ATLAS EXPEDIÇÃO SOLICITAÇÕES carregada");
