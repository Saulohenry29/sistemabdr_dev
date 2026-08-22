let patrimonios = [];
let movimentacoes = [];
let obras = [];
let filtrados = [];
let filtroKPIAtual = "TODOS";
let periodoAtual = "ATUAL";
let modoDashboard = "ATUAL";
let obrasSelecionadasDashboard = [];
let tiposSelecionadosDashboard = [];
let charts = {};

function ir(pagina){ window.location.href = pagina; }
function db(){ return window.client || window.supabaseClient; }
function valor(id){ const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
function usuarioAtual(){
  try{
    const raw = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return null;
  }
}

/* =========================================================
   BDR PATCH SEGURO - PERMISSÕES SEPARADAS
   MENU: DASHBOARD, PATRIMONIO, USUARIOS...
   DADOS: TODAS_OBRAS_VER, PROPRIA_OBRA_VER, VALORES_VER
========================================================= */
function permissoesUsuarioBDR(usuario = usuarioAtual()){
  if(!usuario) return [];
  if(Array.isArray(usuario.permissoes)){
    return usuario.permissoes.map(p => String(p).trim().toUpperCase()).filter(Boolean);
  }
  return String(usuario.permissoes || "")
    .split(",")
    .map(p => p.trim().toUpperCase())
    .filter(Boolean);
}

function usuarioOwnerBDR(usuario = usuarioAtual()){
  return Number(usuario?.id) === 1;
}

function usuarioTemPermissaoBDR(permissao, usuario = usuarioAtual()){
  if(!usuario) return false;
  if(usuarioOwnerBDR(usuario)) return true;

  const ps = permissoesUsuarioBDR(usuario);
  const p = String(permissao || "").toUpperCase();

  const aliases = {
    DASHBOARD: "DASHBOARD_VER",
    ENTRADA: "ENTRADA_VER",
    TRIAGEM: "TRIAGEM_VER",
    ESTOQUE: "ESTOQUE_VER",
    PATRIMONIO: "PATRIMONIO_VER",
    EXPEDICAO: "EXPEDICAO_VER",
    RELATORIOS: "RELATORIOS_VER",
    EMPRESAS: "EMPRESAS_VER",
    USUARIOS: "USUARIOS_VER",
    CONFIGURACOES: "CONFIGURACOES_VER",
    VER_TODAS_OBRAS: "TODAS_OBRAS_VER",
    VER_ESTOQUE_PROPRIA_OBRA: "PROPRIA_OBRA_VER",
    VER_VALORES: "VALORES_VER"
  };

  return ps.includes(p) || (aliases[p] && ps.includes(aliases[p]));
}

function bloquearPaginaSemPermissaoBDR(permissao){
  if(usuarioTemPermissaoBDR(permissao)) return true;

  /*
    Falta de permissão para o Dashboard não significa logout.
    Mantém a sessão e envia para o primeiro módulo autorizado.
  */
  const usuario = usuarioAtual();
  const destino =
    window.BDRMenuPermissoes?.primeiraPaginaPermitida?.(usuario) ||
    "login.html";

  window.location.replace(destino);
  return false;
}

function aplicarMenuPorPermissaoBDR(){
  document.querySelectorAll("[data-permissao]").forEach(el => {
    const permissao = el.getAttribute("data-permissao");
    el.style.display = usuarioTemPermissaoBDR(permissao) ? "" : "none";
  });
}

function usuarioPodeVerTodasObrasBDR(usuario = usuarioAtual()){
  return usuarioTemPermissaoBDR("TODAS_OBRAS_VER", usuario);
}

function normalizarObrasLiberadasBDR(valor){
  if(valor === null || valor === undefined || valor === "") return [];

  let bruto = valor;

  if(typeof bruto === "string"){
    const texto = bruto.trim();
    if(!texto) return [];

    try{
      const parsed = JSON.parse(texto);
      bruto = Array.isArray(parsed) ? parsed : [parsed];
    }catch(_){
      bruto = texto.split(/[,;|]/);
    }
  }

  if(!Array.isArray(bruto)) bruto = [bruto];

  return [...new Set(
    bruto
      .flatMap(item => {
        if(item && typeof item === "object"){
          return [item.id, item.obra_id, item.value];
        }
        return [item];
      })
      .map(v => String(v ?? "").trim())
      .filter(v => /^\d+$/.test(v))
      .map(Number)
      .filter(id => Number.isFinite(id) && id > 0)
  )];
}

function obrasPermitidasDashboardBDR(usuario = usuarioAtual()){
  if(!usuario) return [];

  const ids = [];
  const principal = Number(usuario.obra_id);

  if(Number.isFinite(principal) && principal > 0){
    ids.push(principal);
  }

  normalizarObrasLiberadasBDR(usuario.obras_liberadas)
    .forEach(id => ids.push(id));

  return [...new Set(ids)];
}

function usuarioPodeVerPropriaObraBDR(usuario = usuarioAtual()){
  /*
    Mantido por compatibilidade com o restante do Dashboard.
    A própria obra agora é definida pelo vínculo obra_id/obras_liberadas,
    sem exigir a antiga permissão PROPRIA_OBRA_VER.
  */
  return obrasPermitidasDashboardBDR(usuario).length > 0;
}

function usuarioPodeVerValoresBDR(usuario = usuarioAtual()){
  return usuarioTemPermissaoBDR("VALORES_VER", usuario);
}

function aplicarVisibilidadeValoresBDR(){
  const pode = usuarioPodeVerValoresBDR();
  document.querySelector('[data-kpi="VALOR"]')?.style.setProperty("display", pode ? "" : "none");
  document.querySelector(".valor-principal")?.style.setProperty("display", pode ? "" : "none");
  const topValor = document.getElementById("topObrasValor")?.closest("section");
  if(topValor) topValor.style.display = pode ? "" : "none";
}
function fecharUserMenu(){
  const menu = document.getElementById("dropdownUser");
  const box = document.getElementById("userMenuTop");

  menu?.classList.remove("show", "ativo");
  box?.classList.remove("open", "ativo");
}

function fecharNotificacoes(){
  const menu = document.getElementById("notifDropdown");
  menu?.classList.remove("ativo", "show");
}

function fecharMenusTopbar(){
  fecharUserMenu();
  fecharNotificacoes();
}

function sairSistema(){
  window.AtlasTopbar?.closeAll?.();

  if(typeof logout === "function"){
    logout();
    return;
  }

  localStorage.removeItem("usuario_logado");
  localStorage.removeItem("usuarioLogado");
  window.location.href = "login.html";
}

function moeda(v){
  return Number(v || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}

function moedaCurta(v){
  const n = Number(v || 0);
  if(n >= 1000000) return "R$ " + (n/1000000).toFixed(1).replace(".",",") + "M";
  if(n >= 1000) return "R$ " + (n/1000).toFixed(1).replace(".",",") + "K";
  return moeda(n);
}

/* =========================================================
   VALOR OFICIAL DO PATRIMÔNIO
   Usa valor_bem primeiro. Se não tiver, usa valor_aquisicao.
   Converte número BR tipo "70.000,00" corretamente.
========================================================= */
function numeroBR(v){
  if(v === null || v === undefined || v === "") return 0;

  if(typeof v === "number"){
    return isNaN(v) ? 0 : v;
  }

  let s = String(v).trim();

  if(!s) return 0;

  s = s.replace(/R\$/gi, "").replace(/\s/g, "");

  if(s.includes(",") && s.includes(".")){
    s = s.replace(/\./g, "").replace(",", ".");
  }else if(s.includes(",")){
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function valorPatrimonio(p){
  const vb = numeroBR(p?.valor_bem);
  if(vb > 0) return vb;

  const va = numeroBR(p?.valor_aquisicao);
  if(va > 0) return va;

  return 0;
}

function dataBR(data){
  if(!data) return "-";
  const d = new Date(String(data).replace(" ","T"));
  return isNaN(d.getTime()) ? data : d.toLocaleString("pt-BR");
}

function nomeObraCurto(id){
  const o = obras.find(x => String(x.id) === String(id));
  return o ? (o.nome || o.codigo_obra || "-") : "-";
}

function nomePatrimonio(id){
  const p = patrimonios.find(x => Number(x.id) === Number(id));
  return p ? `${p.nome_bem || "-"} | ${p.codigo_qr || "-"}` : "-";
}

function nomePeriodoAtual(){
  if(periodoAtual === "ATUAL") return "Atual";
  if(periodoAtual === "15DIAS") return "Últimos 15 dias";
  if(periodoAtual === "30DIAS") return "Últimos 30 dias";
  if(periodoAtual === "MES") return "Este mês";
  if(periodoAtual === "ANO") return "Este ano";
  return "Período selecionado";
}

function aplicarPeriodo(periodo, botao){
  periodoAtual = periodo;
  modoDashboard = "CADASTRO_PERIODO";

  document.querySelectorAll(".pill-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  if(botao){
    botao.classList.add("active");
  }

  carregarFiltros();
  aplicarFiltros();
}

function dataDentroPeriodo(dataTexto){
  if(!dataTexto) return true;

  const data = new Date(String(dataTexto).replace(" ", "T"));

  if(isNaN(data.getTime())){
    return true;
  }

  const agora = new Date();

  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicioData = new Date(data.getFullYear(), data.getMonth(), data.getDate());

  if(periodoAtual === "HOJE"){
    return inicioData.getTime() === inicioHoje.getTime();
  }

  if(periodoAtual === "15DIAS"){
    const limite = new Date(inicioHoje);
    limite.setDate(limite.getDate() - 14);
    return inicioData >= limite;
  }

  if(periodoAtual === "30DIAS"){
    const limite = new Date(inicioHoje);
    limite.setDate(limite.getDate() - 29);
    return inicioData >= limite;
  }

  if(periodoAtual === "MES"){
    return data.getFullYear() === agora.getFullYear() &&
           data.getMonth() === agora.getMonth();
  }

  if(periodoAtual === "ANO"){
    return data.getFullYear() === agora.getFullYear();
  }

  return true;
}

function movimentacoesPeriodo(){
  return movimentacoes.filter(m => {
    const dentroPeriodo = modoDashboard === "ATUAL"
      ? true
      : dataDentroPeriodo(m.data_movimentacao || m.criado_em);

    const dentroObra = obrasSelecionadasDashboard.length === 0 ||
      obrasSelecionadasDashboard.includes(String(m.obra_origem_id)) ||
      obrasSelecionadasDashboard.includes(String(m.obra_destino_id));

    return dentroPeriodo && dentroObra;
  });
}

/* =========================================================
   BASE OFICIAL DO DASHBOARD
   Patrimônio mostra a posição atual do cadastro.
   O período serve para "Últimas movimentações", não para zerar o total patrimonial.
========================================================= */
function patrimoniosDoPeriodo(){
  return patrimonios;
}

function basePatrimoniosDashboard(){
  const base = patrimonios.filter(p => p.ativo !== false);

  if(modoDashboard === "ATUAL"){
    return base;
  }

  return base.filter(p => {
    const data = p.criado_em || p.created_at || p.data_cadastro || p.data_lancamento || p.data_aquisicao || p.data || null;
    if(!data) return false;
    return dataDentroPeriodo(data);
  });
}

function patrimonioPorFiltrosTela(){
  return basePatrimoniosDashboard().filter(p => {
    const passaObra = obrasSelecionadasDashboard.length === 0 ||
      obrasSelecionadasDashboard.includes(String(p.obra_id));

    const tipoAtual = p.tipo_item || "SEM TIPO";
    const passaTipo = tiposSelecionadosDashboard.length === 0 ||
      tiposSelecionadosDashboard.includes(String(tipoAtual));

    return passaObra && passaTipo;
  });
}

function aplicarFiltroKPILista(lista){
  return lista.filter(p => {
    if(filtroKPIAtual === "EM_USO") return p.status === "EM_USO";
    if(filtroKPIAtual === "ESTOQUE") return p.status === "ESTOQUE";
    if(filtroKPIAtual === "MANUTENCAO") return p.status === "MANUTENCAO";
    if(filtroKPIAtual === "BAIXADO") return p.status === "BAIXADO";
    if(filtroKPIAtual === "VALOR") return valorPatrimonio(p) > 0;
    if(filtroKPIAtual === "SEM_VALOR") return valorPatrimonio(p) <= 0;
    return true;
  });
}
