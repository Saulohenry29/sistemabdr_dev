/* =========================================================
   BDR ERP - ESTOQUE PROFISSIONAL V6
   MARCAÇÃO GERAL:
   - Estoque agora mostra TUDO que existe no controle físico:
     1) estoque_produtos = material comum / consumo
     2) patrimonio = bens patrimoniais, mesmo quando estão em ESTOQUE ou EM_USO
   - Patrimônio NÃO fica escondido: ele aparece como item do estoque geral.
   - MASTER/ADMIN vê tudo.
   - Usuário com permissão VER_TODOS_ESTOQUES vê tudo.
   - Usuário sem permissão vê apenas sua obra_id.
   - Usuário sem obra_id cai no CD, se existir.
========================================================= */
(function(){
  "use strict";

  let usuario = null;
  let obras = [];
  let itensTodos = [];
  let itensPermitidos = [];
  let movimentacoesEstoque = [];
  let movimentacoesPatrimonio = [];
  let obraSelecionadaId = "";
  let podeVerTudo = false;

  // =========================================================
  // MARCAÇÃO 1: FUNÇÕES BÁSICAS / GLOBAIS
  // =========================================================
  window.ir = function(pagina){ window.location.href = pagina; };

  function db(){ return window.client || window.supabaseClient || window.clientSupabase || globalThis.client; }

  function usuarioAtual(){
    try{
      const u = localStorage.getItem("usuario_logado");
      return u ? JSON.parse(u) : null;
    }catch(e){ return null; }
  }

  function valor(id){
    const el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function normalizar(txt){
    return String(txt || "").trim().toUpperCase();
  }

  function formatarMoeda(v){
    return Number(v || 0).toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
  }

  function formatarData(data){
    if(!data) return "-";
    const d = new Date(String(data).replace(" ", "T"));
    return isNaN(d.getTime()) ? data : d.toLocaleString("pt-BR");
  }

  function permissoesUsuario(){
    return String(usuario?.permissoes || "")
      .split(",")
      .map(p => p.trim().toUpperCase())
      .filter(Boolean);
  }

  function temPermissao(permissao){
    const perfil = normalizar(usuario?.perfil);
    if(perfil === "MASTER" || perfil === "ADMIN") return true;
    return permissoesUsuario().includes(normalizar(permissao));
  }

  function usuarioPodeVerTudo(){
    const perfil = normalizar(usuario?.perfil);
    return perfil === "MASTER" || perfil === "ADMIN" || temPermissao("VER_TODOS_ESTOQUES");
  }

  function nomeObra(id){
    if(!id) return "CD / sem obra";
    const o = obras.find(x => String(x.id) === String(id));
    if(!o) return "Obra ID " + id;
    return `${o.codigo_obra || "-"} - ${o.nome || "-"}`;
  }

  function acharCdPadrao(){
    return obras.find(o =>
      normalizar(o.nome).includes("CENTRO DE DISTRIB") ||
      normalizar(o.nome).includes("CD") ||
      normalizar(o.codigo_obra) === "10013"
    ) || null;
  }

  function statusEstoque(item){
    const st = normalizar(item.status || "DISPONIVEL");
    if(st === "ESTOQUE") return "DISPONIVEL";
    return st || "DISPONIVEL";
  }

  function textoStatus(item){
    const st = normalizar(item.status || "DISPONIVEL");
    if(st === "ESTOQUE" || st === "DISPONIVEL") return "NO ESTOQUE";
    if(st === "EM_USO") return "EM USO";
    if(st === "MANUTENCAO") return "MANUTENÇÃO";
    if(st === "BAIXADO") return "BAIXADO";
    return item.status || "DISPONÍVEL";
  }

  // =========================================================
  // MARCAÇÃO 2: CONVERTE ESTOQUE + PATRIMÔNIO EM UMA LISTA SÓ
  // =========================================================
  function itemDeEstoqueProduto(p){
    return {
      uid: "EST-" + p.id,
      origem: "ESTOQUE",
      id_original: p.id,
      codigo: p.codigo || p.codigo_qr || ("EST-" + p.id),
      descricao: p.descricao || "Produto sem descrição",
      tipo_controle: p.tipo_controle || "CONSUMO",
      status: p.status || "DISPONIVEL",
      quantidade: Number(p.quantidade || 0),
      valor_unitario: Number(p.valor_unitario || 0),
      empresa_id: p.empresa_id || null,
      obra_id: p.obra_id || null,
      localizacao_fisica: p.localizacao_fisica || p.localizacao || "-",
      rua: p.rua || null,
      prateleira: p.prateleira || null,
      coluna: p.coluna || null,
      nivel: p.nivel || null,
      caixa: p.caixa || null,
      estoque_minimo: Number(p.estoque_minimo || 0),
      lote: p.lote || null,
      observacao: p.observacao || null,
      raw: p
    };
  }

  function itemDePatrimonio(p){
    return {
      uid: "PAT-" + p.id,
      origem: "PATRIMONIO",
      id_original: p.id,
      codigo: p.codigo_qr || p.codigo_antigo || ("PAT-" + p.id),
      descricao: p.nome_bem || "Patrimônio sem descrição",
      tipo_controle: "PATRIMONIO",
      status: p.status || "ESTOQUE",
      quantidade: 1,
      valor_unitario: Number(p.valor_bem || 0),
      empresa_id: p.empresa_id || null,
      obra_id: p.obra_id || null,
      localizacao_fisica: p.localizacao || nomeObra(p.obra_id),
      rua: null,
      prateleira: null,
      coluna: null,
      nivel: null,
      caixa: null,
      estoque_minimo: 0,
      lote: p.numero_serie || null,
      observacao: p.observacao || null,
      marca: p.marca || null,
      modelo: p.modelo || null,
      numero_serie: p.numero_serie || null,
      codigo_antigo: p.codigo_antigo || null,
      raw: p
    };
  }

  // =========================================================
  // MARCAÇÃO 3: TOPO / USUÁRIO / SININHO
  // =========================================================
  function carregarUsuarioTopo(){
    const nome = document.getElementById("usuarioNome");
    const perfil = document.getElementById("usuarioPerfil");
    if(nome) nome.innerText = usuario ? "Olá, " + (usuario.nome || "usuário") : "Olá, usuário";
    if(perfil) perfil.innerText = usuario ? (usuario.perfil || "-") : "-";
  }

  window.toggleMenuUsuario = function(event){
    if(event) event.stopPropagation();
    document.getElementById("dropdownUser")?.classList.toggle("ativo");
    document.getElementById("notifDropdown")?.classList.remove("ativo");
  };

  window.toggleNotificacoes = function(event){
    if(event) event.stopPropagation();
    document.getElementById("notifDropdown")?.classList.toggle("ativo");
    document.getElementById("dropdownUser")?.classList.remove("ativo");
  };

  function fecharMenusTopo(){
    document.getElementById("dropdownUser")?.classList.remove("ativo");
    document.getElementById("notifDropdown")?.classList.remove("ativo");
  }

  function atualizarNotificacoes(lista){
    const badge = document.getElementById("notifBadge");
    const box = document.getElementById("notifLista");
    if(!badge || !box) return;

    const total = lista.length;
    badge.innerText = total > 9 ? "9+" : total;
    badge.style.display = total > 0 ? "inline-flex" : "none";

    if(total === 0){
      box.innerHTML = `<div class="notif-item">Nenhuma notificação no momento.</div>`;
      return;
    }

    box.innerHTML = lista.map(n => `
      <div class="notif-item" onclick="${n.link ? `ir('${n.link}')` : ""}">
        <strong>${n.titulo || "Notificação"}</strong>
        <span>${n.mensagem || ""}</span>
      </div>
    `).join("");
  }

  async function carregarNotificacoes(){
    try{
      const banco = db();
      if(!banco){ atualizarNotificacoes([]); return; }

      const { data, error } = await banco
        .from("bdr_notificacoes")
        .select("*")
        .eq("lida", false)
        .order("id", { ascending:false })
        .limit(15);

      if(error){ console.warn("Sininho:", error.message); atualizarNotificacoes([]); return; }

      const perfil = normalizar(usuario?.perfil);
      const nome = String(usuario?.nome || "");
      const obraId = usuario?.obra_id ? String(usuario.obra_id) : "";

      const lista = (data || []).filter(n => {
        const perfilDestino = normalizar(n.perfil_destino);
        const usuarioDestino = String(n.usuario_destino || "");
        const obraDestino = n.obra_id ? String(n.obra_id) : "";

        if(perfilDestino && perfilDestino !== perfil) return false;
        if(usuarioDestino && usuarioDestino !== nome) return false;
        if(obraDestino && obraId && obraDestino !== obraId && !podeVerTudo) return false;
        return true;
      });

      atualizarNotificacoes(lista);
    }catch(e){
      console.warn("Erro ao carregar notificações:", e);
      atualizarNotificacoes([]);
    }
  }

  function iniciarRealtimeSininho(){
    carregarNotificacoes();
    setInterval(carregarNotificacoes, 30000);

    try{
      const banco = db();
      if(!banco || typeof banco.channel !== "function") return;
      banco.channel("bdr_estoque_notificacoes_v6")
        .on("postgres_changes", {event:"*", schema:"public", table:"bdr_notificacoes"}, carregarNotificacoes)
        .subscribe();
    }catch(e){ console.warn("Realtime indisponível:", e); }
  }

  // =========================================================
  // MARCAÇÃO 4: CARREGAMENTO DO BANCO
  // =========================================================
  async function carregarDados(){
    const banco = db();
    if(!banco){
      alert("Supabase não carregado. Confira JS/supabaseClient.js");
      return;
    }

    const obrasResp = await banco.from("obras").select("*").eq("ativa", true).order("nome");
    if(obrasResp.error){ console.error(obrasResp.error); alert(obrasResp.error.message); return; }
    obras = obrasResp.data || [];

    const prodResp = await banco.from("estoque_produtos").select("*").order("id", { ascending:false });
    if(prodResp.error){ console.error(prodResp.error); alert(prodResp.error.message); return; }

    const patResp = await banco.from("patrimonio").select("*").order("id", { ascending:false });
    if(patResp.error){ console.error(patResp.error); alert(patResp.error.message); return; }

    itensTodos = [
      ...(prodResp.data || []).map(itemDeEstoqueProduto),
      ...(patResp.data || []).map(itemDePatrimonio)
    ];

    const movEstResp = await banco.from("estoque_movimentacoes").select("*").order("id", { ascending:false }).limit(300);
    if(movEstResp.error){ console.warn("Movimentações estoque:", movEstResp.error.message); }
    movimentacoesEstoque = movEstResp.data || [];

    const movPatResp = await banco.from("movimentacoes").select("*").order("id", { ascending:false }).limit(300);
    if(movPatResp.error){ console.warn("Movimentações patrimônio:", movPatResp.error.message); }
    movimentacoesPatrimonio = movPatResp.data || [];

    aplicarRegraAcesso();
    carregarFiltroObras();
    renderizarTudo();
  }

  // =========================================================
  // MARCAÇÃO 5: REGRA DE ACESSO POR OBRA / SETOR
  // =========================================================
  function aplicarRegraAcesso(){
    podeVerTudo = usuarioPodeVerTudo();

    if(podeVerTudo){
      itensPermitidos = [...itensTodos];
      obraSelecionadaId = "";
      atualizarContexto("Todas as obras/setores autorizados", "Você tem permissão para visualizar consumo e patrimônios de todos os setores.");
      return;
    }

    let obraIdUsuario = usuario?.obra_id ? String(usuario.obra_id) : "";

    if(!obraIdUsuario){
      const cd = acharCdPadrao();
      obraIdUsuario = cd ? String(cd.id) : "";
    }

    obraSelecionadaId = obraIdUsuario;

    if(obraIdUsuario){
      itensPermitidos = itensTodos.filter(p => String(p.obra_id || "") === String(obraIdUsuario));
      atualizarContexto(nomeObra(obraIdUsuario), "Seu perfil visualiza apenas itens comuns e patrimônios do seu setor/obra.");
    }else{
      itensPermitidos = itensTodos.filter(p => !p.obra_id);
      atualizarContexto("CD / sem obra", "Seu perfil não possui obra vinculada; exibindo itens sem obra/CD.");
    }
  }

  function atualizarContexto(titulo, regra){
    const texto = document.getElementById("textoContexto");
    const regraEl = document.getElementById("textoRegraAcesso");
    const btn = document.getElementById("btnLimparObra");

    if(texto) texto.innerText = titulo;
    if(regraEl) regraEl.innerText = regra;
    if(btn) btn.style.display = podeVerTudo && obraSelecionadaId ? "inline-flex" : "none";
  }

  function carregarFiltroObras(){
    const select = document.getElementById("filtroObra");
    if(!select) return;

    if(!podeVerTudo){
      select.style.display = "none";
      return;
    }

    select.style.display = "block";
    select.innerHTML = `<option value="">Todas as obras/setores autorizados</option>`;
    select.innerHTML += `<option value="__SEM_OBRA__">CD / sem obra</option>`;

    obras.forEach(o => {
      select.innerHTML += `<option value="${o.id}">${o.codigo_obra || "-"} - ${o.nome || "-"}</option>`;
    });

    select.value = obraSelecionadaId;
  }

  window.selecionarObraFiltro = function(){
    const v = valor("filtroObra");
    obraSelecionadaId = v;

    if(!v){
      itensPermitidos = [...itensTodos];
      atualizarContexto("Todas as obras/setores autorizados", "Você está vendo consumo e patrimônios de todos os estoques permitidos.");
    }else if(v === "__SEM_OBRA__"){
      itensPermitidos = itensTodos.filter(p => !p.obra_id);
      atualizarContexto("CD / sem obra", "Itens sem obra vinculada.");
    }else{
      itensPermitidos = itensTodos.filter(p => String(p.obra_id || "") === String(v));
      atualizarContexto(nomeObra(v), "Filtro aplicado para esta obra/setor.");
    }

    renderizarTudo();
  };

  window.limparFiltroObra = function(){
    obraSelecionadaId = "";
    const select = document.getElementById("filtroObra");
    if(select) select.value = "";
    itensPermitidos = [...itensTodos];
    atualizarContexto("Todas as obras/setores autorizados", "Você está vendo consumo e patrimônios de todos os estoques permitidos.");
    renderizarTudo();
  };

  // =========================================================
  // MARCAÇÃO 6: RESUMO E FILTROS
  // =========================================================
  function listaFiltrada(){
    const busca = valor("busca").toLowerCase();
    const filtroStatus = valor("filtroStatus");
    const filtroTipo = valor("filtroTipo");

    return itensPermitidos.filter(p => {
      const qtd = Number(p.quantidade || 0);
      const status = statusEstoque(p);
      const baixo = p.origem === "ESTOQUE" && (qtd <= Number(p.estoque_minimo || 0) || qtd <= 0);

      const texto = `
        ${p.uid || ""}
        ${p.id_original || ""}
        ${p.codigo || ""}
        ${p.codigo_antigo || ""}
        ${p.descricao || ""}
        ${p.tipo_controle || ""}
        ${p.status || ""}
        ${p.localizacao_fisica || ""}
        ${p.marca || ""}
        ${p.modelo || ""}
        ${p.numero_serie || ""}
        ${nomeObra(p.obra_id)}
      `.toLowerCase();

      let passaStatus = true;
      if(filtroStatus === "DISPONIVEL") passaStatus = status === "DISPONIVEL";
      if(filtroStatus === "EM_USO") passaStatus = status === "EM_USO";
      if(filtroStatus === "MANUTENCAO") passaStatus = status === "MANUTENCAO";
      if(filtroStatus === "BAIXADO") passaStatus = status === "BAIXADO";
      if(filtroStatus === "BAIXO") passaStatus = baixo;

      let passaTipo = true;
      if(filtroTipo === "CONSUMO") passaTipo = p.origem === "ESTOQUE" && normalizar(p.tipo_controle) !== "PATRIMONIO";
      if(filtroTipo === "PATRIMONIO") passaTipo = p.origem === "PATRIMONIO" || normalizar(p.tipo_controle) === "PATRIMONIO";

      return texto.includes(busca) && passaStatus && passaTipo;
    });
  }

  function atualizarResumo(){
    const lista = listaFiltrada();
    const disponiveis = lista.filter(p => statusEstoque(p) === "DISPONIVEL").length;
    const emUso = lista.filter(p => statusEstoque(p) === "EM_USO").length;
    const patrimonios = lista.filter(p => p.origem === "PATRIMONIO" || normalizar(p.tipo_controle) === "PATRIMONIO").length;
    const valorTotal = lista.reduce((s,p) => s + (Number(p.quantidade || 0) * Number(p.valor_unitario || 0)), 0);

    document.getElementById("resumoProdutos").innerText = lista.length;
    document.getElementById("resumoDisponiveis").innerText = disponiveis;
    document.getElementById("resumoEmUso").innerText = emUso;
    document.getElementById("resumoBaixo").innerText = patrimonios;
    document.getElementById("resumoValor").innerText = formatarMoeda(valorTotal);
  }

  window.filtrarResumo = function(tipo){
    const filtroStatus = document.getElementById("filtroStatus");
    const filtroTipo = document.getElementById("filtroTipo");
    if(tipo === "TODOS"){
      if(filtroStatus) filtroStatus.value = "";
      if(filtroTipo) filtroTipo.value = "";
    }else if(tipo === "PATRIMONIO"){
      if(filtroTipo) filtroTipo.value = "PATRIMONIO";
    }else{
      if(filtroStatus) filtroStatus.value = tipo;
    }
    renderizarProdutos();
  };

  window.abrirResumoValor = function(){
    const lista = listaFiltrada();
    const valorTotal = lista.reduce((s,p) => s + (Number(p.quantidade || 0) * Number(p.valor_unitario || 0)), 0);
    const patrimonios = lista.filter(p => p.origem === "PATRIMONIO").length;
    const consumo = lista.length - patrimonios;
    alert(`Valor estimado do filtro atual: ${formatarMoeda(valorTotal)}\nItens considerados: ${lista.length}\nConsumo: ${consumo}\nPatrimônios: ${patrimonios}`);
  };

  function renderizarTudo(){
    atualizarResumo();
    renderizarProdutos();
  }

  // =========================================================
  // MARCAÇÃO 7: LISTA COMPACTA DO ESTOQUE GERAL
  // =========================================================
  window.renderizarProdutos = function(){
    atualizarResumo();

    const lista = listaFiltrada();
    const box = document.getElementById("listaProdutos");
    if(!box) return;

    if(lista.length === 0){
      box.innerHTML = `<p style="color:#6b7280;font-weight:800;">Nenhum item encontrado para este filtro/permissão.</p>`;
      return;
    }

    box.innerHTML = `
      <div class="estoque-header">
        <div>Código</div>
        <div>Item</div>
        <div>Obra / Setor</div>
        <div>Qtd</div>
        <div>Status</div>
        <div>Local</div>
      </div>
    `;

    lista.forEach(p => {
      const qtd = Number(p.quantidade || 0);
      const status = statusEstoque(p);
      const baixo = p.origem === "ESTOQUE" && (qtd <= Number(p.estoque_minimo || 0) || qtd <= 0);
      let badgeClasse = "badge-ok";
      if(p.origem === "PATRIMONIO") badgeClasse = "badge-pat";
      if(status === "EM_USO") badgeClasse = "badge-uso";
      if(status === "MANUTENCAO") badgeClasse = "badge-baixo";
      if(status === "BAIXADO") badgeClasse = "badge-zero";
      if(baixo) badgeClasse = "badge-zero";

      const uidSeguro = JSON.stringify(p.uid);
      const tipoLinha = p.origem === "PATRIMONIO" ? "PATRIMÔNIO" : (p.tipo_controle || "CONSUMO");

      box.innerHTML += `
        <div class="estoque-linha" onclick='abrirProduto(${uidSeguro})'>
          <div class="prod-codigo">${p.codigo || p.uid}</div>
          <div>
            <div class="prod-nome" title="${p.descricao || "-"}">${p.descricao || "-"}</div>
            <div class="prod-sub">${tipoLinha} • ${formatarMoeda(p.valor_unitario)}</div>
          </div>
          <div class="prod-obra" title="${nomeObra(p.obra_id)}">${nomeObra(p.obra_id)}</div>
          <div class="prod-qtd">${qtd}</div>
          <div><span class="badge ${badgeClasse}">${baixo ? "BAIXO/ZERADO" : textoStatus(p)}</span></div>
          <div class="prod-local" title="${p.localizacao_fisica || "-"}">${p.localizacao_fisica || "-"}</div>
        </div>
      `;
    });
  };

  // =========================================================
  // MARCAÇÃO 8: MODAL DO ITEM
  // =========================================================
  window.abrirProduto = function(uid){
    const p = itensPermitidos.find(x => String(x.uid) === String(uid)) || itensTodos.find(x => String(x.uid) === String(uid));
    if(!p){ alert("Item não encontrado."); return; }

    document.getElementById("modalTitulo").innerText = p.descricao || "Item";

    const extraPatrimonio = p.origem === "PATRIMONIO" ? `
      <strong>Código antigo:</strong> ${p.codigo_antigo || "-"}<br>
      <strong>Marca:</strong> ${p.marca || "-"}<br>
      <strong>Modelo:</strong> ${p.modelo || "-"}<br>
      <strong>Nº Série:</strong> ${p.numero_serie || "-"}<br>
    ` : "";

    document.getElementById("modalInfo").innerHTML = `
      <strong>Origem:</strong> ${p.origem === "PATRIMONIO" ? "Patrimônio" : "Estoque comum"}<br>
      <strong>Código:</strong> ${p.codigo || "-"}<br>
      <strong>Descrição:</strong> ${p.descricao || "-"}<br>
      <strong>Obra / Setor:</strong> ${nomeObra(p.obra_id)}<br>
      <strong>Quantidade:</strong> ${p.quantidade || 0}<br>
      <strong>Status:</strong> ${textoStatus(p)}<br>
      <strong>Tipo controle:</strong> ${p.tipo_controle || "-"}<br>
      ${extraPatrimonio}
      <strong>Valor unitário:</strong> ${formatarMoeda(p.valor_unitario)}<br>
      <strong>Valor total:</strong> ${formatarMoeda(Number(p.quantidade || 0) * Number(p.valor_unitario || 0))}<br>
      <strong>Localização:</strong> ${p.localizacao_fisica || "-"}<br>
      <strong>Rua/Prat./Col./Nível:</strong> ${p.rua || "-"} / ${p.prateleira || "-"} / ${p.coluna || "-"} / ${p.nivel || "-"}<br>
      <strong>Lote/Série:</strong> ${p.lote || p.numero_serie || "-"}<br>
      <strong>Observação:</strong> ${p.observacao || "-"}
    `;

    const boxMov = document.getElementById("modalMovimentacoes");

    if(p.origem === "PATRIMONIO"){
      const movs = movimentacoesPatrimonio
        .filter(m => Number(m.patrimonio_id) === Number(p.id_original))
        .slice(0, 8);

      if(movs.length === 0){
        boxMov.innerHTML = `<div class="mov-item">Nenhuma movimentação encontrada para este patrimônio.</div>`;
      }else{
        boxMov.innerHTML = movs.map(m => `
          <div class="mov-item">
            <strong>${m.tipo || "MOVIMENTAÇÃO"}</strong><br>
            ${m.status_anterior || "-"} → ${m.status_novo || "-"}<br>
            Obra origem: ${nomeObra(m.obra_origem_id)}<br>
            Obra destino: ${nomeObra(m.obra_destino_id)}<br>
            Usuário: ${m.usuario || "-"}<br>
            ${formatarData(m.data_movimentacao || m.criado_em)}<br>
            ${m.observacao || ""}
          </div>
        `).join("");
      }
    }else{
      const movs = movimentacoesEstoque
        .filter(m => Number(m.produto_id) === Number(p.id_original))
        .slice(0, 8);

      if(movs.length === 0){
        boxMov.innerHTML = `<div class="mov-item">Nenhuma movimentação encontrada para este produto.</div>`;
      }else{
        boxMov.innerHTML = movs.map(m => `
          <div class="mov-item">
            <strong>${m.tipo_movimentacao || m.tipo || "MOVIMENTAÇÃO"}</strong><br>
            Qtd: ${m.quantidade || "-"} • ${formatarData(m.criado_em)}<br>
            ${m.origem || m.local_origem || "-"} → ${m.destino || m.local_destino || "-"}<br>
            Usuário: ${m.usuario || "-"}<br>
            ${m.observacao || ""}
          </div>
        `).join("");
      }
    }

    document.getElementById("modalProdutoBg").style.display = "flex";
  };

  window.fecharModalProduto = function(){
    document.getElementById("modalProdutoBg").style.display = "none";
  };

  window.fecharModalProdutoFora = function(event){
    if(event.target && event.target.id === "modalProdutoBg") fecharModalProduto();
  };

  // =========================================================
  // MARCAÇÃO 9: INICIALIZAÇÃO
  // =========================================================
  async function iniciar(){
    usuario = usuarioAtual();
    carregarUsuarioTopo();

    document.addEventListener("click", fecharMenusTopo);
    document.addEventListener("keydown", e => {
      if(e.key === "Escape"){
        fecharMenusTopo();
        fecharModalProduto();
      }
    });

    await carregarDados();
    iniciarRealtimeSininho();
  }

  iniciar();
})();
document.addEventListener("keydown", function(e){
  if(e.key === "Escape"){
    document.querySelectorAll(".modal-bg.ativo, .modal.ativo").forEach(m=>{
      m.classList.remove("ativo");
    });

    const modalDetalhe = document.getElementById("modalDetalhe");
    if(modalDetalhe) modalDetalhe.classList.remove("ativo");

    const dropdown = document.getElementById("dropdownUser");
    if(dropdown) dropdown.classList.remove("ativo");

    const notif = document.getElementById("notifDropdown");
    if(notif) notif.classList.remove("ativo");
  }
});


/* =========================================================
   BDR ESTOQUE - ENDEREÇAMENTO 3D + CENTRAL QR BDR
   Este bloco fica fora do módulo principal para poder ser chamado
   direto pelos botões do HTML.
========================================================= */

let bdrLayout3DTipo = "RETO";

function bdrV(id){
  return String(document.getElementById(id)?.value || "").trim();
}
function bdrN(id){
  return Number(bdrV(id) || 0);
}
function bdrPad(num){
  return String(num).padStart(2,"0");
}
function bdrCodigoEndereco(rua, face, prat, col, nivel, caixa){
  let codigo = `${rua}-F${face}-P${bdrPad(prat)}-C${col}-N${nivel}`;
  if(Number(caixa) > 1) codigo += `-CX${caixa}`;
  return codigo.toUpperCase();
}
function abrirEnderecamento3D(){
  document.getElementById("modalEnderecamento3D")?.classList.add("ativo");
  setTimeout(() => montarPrateleira3D(), 60);
}
function fecharEnderecamento3D(){
  document.getElementById("modalEnderecamento3D")?.classList.remove("ativo");
}
function abrirCentralEtiquetas(){
  document.getElementById("modalCentralEtiquetas")?.classList.add("ativo");
  gerarPreviewEtiquetas();
}
function fecharCentralEtiquetas(){
  document.getElementById("modalCentralEtiquetas")?.classList.remove("ativo");
}
function setLayoutTipo(btn, tipo){
  bdrLayout3DTipo = tipo;
  document.querySelectorAll(".layout-type").forEach(b => b.classList.remove("active"));
  btn?.classList.add("active");
  montarPrateleira3D(true);
}
function bdrLerConfig3D(){
  return {
    rua:bdrV("rua3d").toUpperCase() || "R1",
    faces:Math.max(1,bdrN("faces3d")),
    prateleiras:Math.max(1,bdrN("prateleiras3d")),
    colunas:Math.max(1,bdrN("colunas3d")),
    niveis:Math.max(1,bdrN("niveis3d")),
    caixas:Math.max(1,bdrN("caixas3d")),
    tipoArea:bdrV("tipoArea3d") || "GERAL",
    zoom:Number(bdrV("zoom3d") || .82)
  };
}
function montarPrateleira3D(animado=false){
  const cfg = bdrLerConfig3D();
  document.documentElement.style.setProperty("--zoom-3d", cfg.zoom);
  const scene = document.getElementById("scene3d");
  if(!scene) return;

  let html = `
    <div class="street-title">
      <div>
        <strong>${cfg.rua}</strong>
        <div style="font-size:12px;color:#6b7280;font-weight:800;">
          ${cfg.faces} face(s) • ${cfg.prateleiras} prateleira(s) • ${cfg.colunas} coluna(s) • ${cfg.niveis} nível(is) • Layout ${bdrLayout3DTipo}
        </div>
      </div>
      <button class="btn-orange" onclick="marcarExemplo3D()">Marcar exemplos</button>
    </div>
    <div class="rack-area">
  `;

  for(let f=1; f<=cfg.faces; f++){
    html += `<div class="face-box"><h3><span>Face F${f}</span><small>${cfg.tipoArea}</small></h3><div class="rack">`;

    for(let p=1; p<=cfg.prateleiras; p++){
      html += `<div class="prateleira" style="animation-delay:${animado ? (p*.08) : 0}s"><div class="prat-title">P${bdrPad(p)}</div><div class="levels">`;

      for(let nv=1; nv<=cfg.niveis; nv++){
        html += `<div class="level-row" style="grid-template-columns:repeat(${cfg.colunas}, var(--slot-w));">`;

        for(let c=1; c<=cfg.colunas; c++){
          const codigo = bdrCodigoEndereco(cfg.rua, f, p, c, nv, 1);
          const delay = animado ? ((f*.05)+(p*.08)+(nv*.04)+(c*.025)) : 0;
          html += `<div class="slot" data-codigo="${codigo}" data-face="${f}" data-prateleira="${p}" data-coluna="${c}" data-nivel="${nv}" onclick="selecionarSlot3D(this)" style="animation-delay:${delay}s" title="${codigo}">C${c}/N${nv}</div>`;
        }

        html += `</div>`;
      }

      html += `</div></div>`;
    }

    html += `</div></div>`;
  }

  html += `</div>`;
  scene.innerHTML = html;
  preencherTabela3D();
}
function animarMontagem3D(){
  montarPrateleira3D(true);
}
function selecionarSlot3D(el){
  document.querySelectorAll(".slot").forEach(s => s.classList.remove("selected"));
  el.classList.add("selected");
  const codigo = el.dataset.codigo;
  document.getElementById("qrCodePreview").innerText = codigo;
  document.getElementById("codigoSelecionado3d").innerHTML = `
    <b>Código:</b> ${codigo}<br>
    <b>QR sugerido:</b> END-${codigo}<br>
    <b>Face:</b> F${el.dataset.face}<br>
    <b>Prateleira:</b> P${bdrPad(el.dataset.prateleira)}<br>
    <b>Coluna:</b> C${el.dataset.coluna}<br>
    <b>Nível:</b> N${el.dataset.nivel}<br><br>
    Esse endereço será bipado para guardar ou retirar produto.
  `;
}
function marcarExemplo3D(){
  const slots=[...document.querySelectorAll(".slot")];
  slots.forEach(s=>s.classList.remove("busy","reserved","block"));
  if(slots[1]) slots[1].classList.add("busy");
  if(slots[4]) slots[4].classList.add("reserved");
  if(slots[7]) slots[7].classList.add("block");
  if(slots[11]) slots[11].classList.add("busy");
}
function gerarListaCodigos3D(){
  const cfg = bdrLerConfig3D();
  const lista = [];
  for(let f=1; f<=cfg.faces; f++){
    for(let p=1; p<=cfg.prateleiras; p++){
      for(let c=1; c<=cfg.colunas; c++){
        for(let nv=1; nv<=cfg.niveis; nv++){
          for(let cx=1; cx<=cfg.caixas; cx++){
            lista.push({
              rua:cfg.rua,
              face:`F${f}`,
              prateleira:`P${bdrPad(p)}`,
              coluna:`C${c}`,
              nivel:`N${nv}`,
              caixa:cfg.caixas > 1 ? `CX${cx}` : "",
              tipo_area:cfg.tipoArea,
              status:"LIVRE",
              codigo_curto:bdrCodigoEndereco(cfg.rua,f,p,c,nv,cx)
            });
          }
        }
      }
    }
  }
  return lista;
}
function preencherTabela3D(){
  const listaTotal = gerarListaCodigos3D();
  const lista = listaTotal.slice(0,18);
  const el = document.getElementById("tabelaCodigos3d");
  if(!el) return;
  el.innerHTML = `
    <div style="font-size:12px;color:#6b7280;margin-bottom:8px;font-weight:800;">
      Total: ${listaTotal.length} endereço(s). Mostrando ${lista.length}.
    </div>
    <table class="table-codes">
      <thead><tr><th>Código</th><th>Face</th><th>Prat.</th><th>Col.</th><th>Nível</th></tr></thead>
      <tbody>
      ${lista.map(x => `<tr><td><b>${x.codigo_curto}</b></td><td>${x.face}</td><td>${x.prateleira}</td><td>${x.coluna}</td><td>${x.nivel}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}
async function cadastrarEnderecos3D(){
  const lista = gerarListaCodigos3D();
  if(!confirm(`Cadastrar ${lista.length} endereço(s) no sistema?`)) return;

  try{
    const banco = window.client || window.supabaseClient || window.clientSupabase || globalThis.client;
    if(!banco){
      alert("Banco não carregado.");
      return;
    }

    const payload = lista.map(x => ({
      rua:x.rua,
      prateleira:x.prateleira,
      coluna:x.coluna,
      nivel:x.nivel,
      caixa:x.caixa,
      tipo_area:x.tipo_area,
      status:x.status,
      face:x.face,
      codigo_curto:x.codigo_curto
    }));

    const { error } = await banco.from("enderecamento_estoque").insert(payload);
    if(error){
      alert("Erro ao cadastrar: " + error.message);
      return;
    }

    alert("Endereços cadastrados com sucesso!");
  }catch(e){
    alert("Erro inesperado ao cadastrar endereços.");
    console.error(e);
  }
}
function gerarPreviewEtiquetas(){
  const box = document.getElementById("previewEtiquetas");
  if(!box) return;

  const tipo = bdrV("tipoEtiqueta") || "ENDERECO";
  let lista = [];

  if(tipo === "ENDERECO"){
    lista = gerarListaCodigos3D().slice(0,12).map(x => ({
      titulo:"ENDEREÇO",
      codigo:x.codigo_curto,
      sub:`${x.rua} • ${x.face} • ${x.prateleira}`
    }));
  }else if(tipo === "PRODUTO"){
    lista = Array.from({length:8}).map((_,i)=>({
      titulo:"PRODUTO",
      codigo:`EST-${String(i+1).padStart(6,"0")}`,
      sub:"Produto comum"
    }));
  }else if(tipo === "PATRIMONIO"){
    lista = Array.from({length:8}).map((_,i)=>({
      titulo:"PATRIMÔNIO",
      codigo:`PAT-${String(i+1).padStart(6,"0")}`,
      sub:"Bem rastreável"
    }));
  }else{
    lista = Array.from({length:8}).map((_,i)=>({
      titulo:"VOLUME",
      codigo:`EXP-${String(i+1).padStart(6,"0")}`,
      sub:"Pedido / volume"
    }));
  }

  box.innerHTML = lista.map(x => `
    <div class="etiqueta-preview">
      <div class="mini-qr"></div>
      <div>
        <strong>${x.titulo}</strong><br>
        <b>${x.codigo}</b><br>
        <small>${x.sub}</small>
      </div>
    </div>
  `).join("");
}

/* ESC fecha todos os modais novos */
document.addEventListener("keydown", function(e){
  if(e.key !== "Escape") return;
  document.getElementById("modalEnderecamento3D")?.classList.remove("ativo");
  document.getElementById("modalCentralEtiquetas")?.classList.remove("ativo");
});
