function carregarFiltros(){
  atualizarResumoFiltrosPremium();
  renderizarModalObras();
  renderizarModalTipos();
}

function atualizarResumoFiltrosPremium(){
  const resumoObras = document.getElementById("resumoObrasFiltro");
  const resumoTipos = document.getElementById("resumoTiposFiltro");
  const modo = document.getElementById("modoDashboardTexto");

  if(resumoObras){
    if(obrasSelecionadasDashboard.length === 0){
      resumoObras.innerText = "Todas";
    }else if(obrasSelecionadasDashboard.length === 1){
      const o = obras.find(x => String(x.id) === String(obrasSelecionadasDashboard[0]));
      resumoObras.innerText = o ? `${o.codigo_obra || ""} ${o.nome || "-"}`.trim() : "1 selecionada";
    }else{
      resumoObras.innerText = `${obrasSelecionadasDashboard.length} selecionadas`;
    }
  }

  if(resumoTipos){
    if(tiposSelecionadosDashboard.length === 0){
      resumoTipos.innerText = "Todos";
    }else if(tiposSelecionadosDashboard.length === 1){
      resumoTipos.innerText = tiposSelecionadosDashboard[0];
    }else{
      resumoTipos.innerText = `${tiposSelecionadosDashboard.length} selecionados`;
    }
  }

  if(modo){
    modo.innerText = modoDashboard === "ATUAL" ? "Modo: Atual" : "Modo: Cadastros";
    modo.classList.toggle("periodo", modoDashboard !== "ATUAL");
  }
}

function abrirModalObras(event){
  if(event) event.stopPropagation();
  renderizarModalObras();
  document.getElementById("modalObrasFiltro")?.classList.add("ativo");
}

function fecharModalObras(){
  document.getElementById("modalObrasFiltro")?.classList.remove("ativo");
}

function abrirModalTipos(event){
  if(event) event.stopPropagation();
  renderizarModalTipos();
  document.getElementById("modalTiposFiltro")?.classList.add("ativo");
}

function fecharModalTipos(){
  document.getElementById("modalTiposFiltro")?.classList.remove("ativo");
}

function limparObrasSelecionadas(){
  obrasSelecionadasDashboard = [];
  renderizarModalObras();
  renderizarModalTipos();
  aplicarFiltros();
}

function limparTiposSelecionados(){
  tiposSelecionadosDashboard = [];
  renderizarModalTipos();
  aplicarFiltros();
}

function selecionarTodasObras(){
  limparObrasSelecionadas();
}

function selecionarTodosTipos(){
  limparTiposSelecionados();
}

function alternarObraDashboard(id){
  id = String(id);

  if(obrasSelecionadasDashboard.includes(id)){
    obrasSelecionadasDashboard = obrasSelecionadasDashboard.filter(x => x !== id);
  }else{
    obrasSelecionadasDashboard.push(id);
  }

  renderizarModalObras();
  renderizarModalTipos();
  aplicarFiltros();
}

function alternarTipoDashboard(tipo){
  tipo = String(tipo || "SEM TIPO");

  if(tiposSelecionadosDashboard.includes(tipo)){
    tiposSelecionadosDashboard = tiposSelecionadosDashboard.filter(x => x !== tipo);
  }else{
    tiposSelecionadosDashboard.push(tipo);
  }

  renderizarModalTipos();
  aplicarFiltros();
}

function renderizarModalObras(){
  const lista = document.getElementById("listaObrasModal");
  if(!lista) return;

  const busca = normalizarBusca(document.getElementById("buscaObraModal")?.value || "");
  const baseContagem = basePatrimoniosDashboard();
  const baseTotal = patrimonios.filter(p => p.ativo !== false);

  const obrasComQtd = obras
    .map(o => ({
      ...o,
      qtd: baseContagem.filter(p => String(p.obra_id) === String(o.id)).length,
      total: baseTotal.filter(p => String(p.obra_id) === String(o.id)).length
    }))
    .filter(o => o.total > 0)
    .filter(o => {
      const txt = normalizarBusca(`${o.codigo_obra || ""} ${o.nome || ""}`);
      return !busca || txt.includes(busca);
    })
    .sort((a,b) => String(a.codigo_obra || a.nome || "").localeCompare(String(b.codigo_obra || b.nome || "")));

  lista.innerHTML = `
    <div class="bdr-filter-option ${obrasSelecionadasDashboard.length === 0 ? "ativo" : ""}" onclick="selecionarTodasObras()">
      <strong>🏢 TODAS</strong>
      <span>${baseContagem.length}</span>
    </div>
  `;

  obrasComQtd.forEach(o => {
    const ativo = obrasSelecionadasDashboard.includes(String(o.id)) ? "ativo" : "";
    const label = `${o.codigo_obra || ""} - ${o.nome || "-"}`.replace(/^ - /,"").trim();

    lista.innerHTML += `
      <div class="bdr-filter-option ${ativo}" onclick="alternarObraDashboard('${o.id}')">
        <strong>${escapeHtmlBDR(label)}</strong>
        <span>${o.qtd}</span>
      </div>
    `;
  });

  atualizarResumoFiltrosPremium();
}

function renderizarModalTipos(){
  const lista = document.getElementById("listaTiposModal");
  if(!lista) return;

  const busca = normalizarBusca(document.getElementById("buscaTipoModal")?.value || "");
  const base = basePatrimoniosDashboard().filter(p => {
    return obrasSelecionadasDashboard.length === 0 ||
      obrasSelecionadasDashboard.includes(String(p.obra_id));
  });

  const tipos = [...new Set(base.map(p => p.tipo_item || "SEM TIPO"))]
    .sort()
    .filter(t => !busca || normalizarBusca(t).includes(busca))
    .map(t => ({
      tipo:t,
      qtd:base.filter(p => (p.tipo_item || "SEM TIPO") === t).length
    }));

  lista.innerHTML = `
    <div class="bdr-filter-option ${tiposSelecionadosDashboard.length === 0 ? "ativo" : ""}" onclick="selecionarTodosTipos()">
      <strong>🧩 TODOS</strong>
      <span>${base.length}</span>
    </div>
  `;

  tipos.forEach(t => {
    const ativo = tiposSelecionadosDashboard.includes(String(t.tipo)) ? "ativo" : "";
    lista.innerHTML += `
      <div class="bdr-filter-option ${ativo}" onclick="alternarTipoDashboard('${escapeJsBDR(t.tipo)}')">
        <strong>${escapeHtmlBDR(t.tipo)}</strong>
        <span>${t.qtd}</span>
      </div>
    `;
  });

  atualizarResumoFiltrosPremium();
}

function normalizarBusca(txt){
  return String(txt || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeHtmlBDR(str){
  return String(str || "").replace(/[&<>'"]/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
  }[c]));
}

function escapeJsBDR(str){
  return String(str || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function aplicarFiltroKPI(tipo){
  filtroKPIAtual = tipo;

  document.querySelectorAll(".kpi-card").forEach(k => k.classList.remove("active"));
  document.querySelector(`.kpi-card[data-kpi="${tipo}"]`)?.classList.add("active");

  aplicarFiltros();

  if(tipo === "SEM_VALOR"){
    setTimeout(() => mostrarItensAlerta("SEM_VALOR"), 120);
  }

  if(tipo === "ESTOQUE"){
    setTimeout(() => mostrarItensAlerta("ESTOQUE"), 120);
  }

  if(tipo === "MANUTENCAO"){
    setTimeout(() => mostrarItensAlerta("MANUTENCAO"), 120);
  }

  if(tipo === "BAIXADO"){
    setTimeout(() => mostrarItensAlerta("BAIXADO"), 120);
  }

  if(tipo === "EM_USO"){
    setTimeout(() => mostrarItensAlerta("EM_USO"), 120);
  }

  if(tipo === "TODOS" || tipo === "VALOR"){
    setTimeout(() => mostrarItensAlerta("TODOS"), 120);
  }
}


function aplicarFiltroObraDashboard(obraId){
  if(!obraId) return;
  obrasSelecionadasDashboard = [String(obraId)];
  renderizarModalObras();
  renderizarModalTipos();
  aplicarFiltros();
  mostrarItensObraRanking(String(obraId), "QTD");
}

function aplicarFiltroTipoDashboard(tipo){
  tipo = String(tipo || "SEM TIPO");
  tiposSelecionadosDashboard = [tipo];
  renderizarModalTipos();
  aplicarFiltros();
  renderizarListaItensDashboard(filtrados, `🧩 Tipo: ${tipo}`);
}

function limparFiltrosDashboard(){
  filtroKPIAtual = "TODOS";
  periodoAtual = "ATUAL";
  modoDashboard = "ATUAL";
  obrasSelecionadasDashboard = [];
  tiposSelecionadosDashboard = [];

  document.querySelectorAll(".kpi-card").forEach(k => k.classList.remove("active"));
  document.querySelector('.kpi-card[data-kpi="TODOS"]')?.classList.add("active");
  document.querySelectorAll(".pill-btn").forEach(btn => btn.classList.remove("active"));

  const card = document.getElementById("cardItensAlerta");
  if(card) card.style.display = "none";

  carregarFiltros();
  aplicarFiltros();
}

function aplicarFiltros(){
  const base = patrimonioPorFiltrosTela();
  filtrados = aplicarFiltroKPILista(base);
  atualizarResumoFiltrosPremium();
  atualizarTudo();
}
