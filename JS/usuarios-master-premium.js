/* =========================================================
   ATUALIZADO: USUÁRIOS COM OFFLINE BDR
========================================================= */
console.log("✅ BDR USUÁRIOS PREMIUM V5 carregado - arquivo correto");
/* =========================================================
   BDR ERP 9.0 - USUÁRIOS MASTER PREMIUM
   Arquivo: JS/usuarios-master-premium.js

   OBJETIVO:
   - Buscar usuários reais no banco
   - Mostrar no layout premium
   - Salvar permissões
   - Salvar obras liberadas
   - Manter código separado por blocos para facilitar leitura
========================================================= */


/* =========================================================
   1) VARIÁVEIS GLOBAIS
========================================================= */

let usuarios = [];
let empresas = [];
let obras = [];
let usuarioSelecionado = null;
let TABELA_USUARIOS = "usuarios_sistema";


/* =========================================================
   2) PERMISSÕES POR GRUPO
========================================================= */

const P_VIS = [
  "DASHBOARD_VER",
  "PATRIMONIO_VER",
  "ESTOQUE_VER",
  "EMPRESAS_VER",
  "RELATORIOS_VER",
  "VALORES_VER",
  "TODAS_OBRAS_VER",
  "PROPRIA_OBRA_VER"
];

const P_SOL = [
  "PATRIMONIO_CRIAR",
  "PATRIMONIO_EDITAR",
  "PATRIMONIO_MOVIMENTAR",
  "PATRIMONIO_IMPRIMIR",
  "ESTOQUE_ENTRADA",
  "ESTOQUE_SAIDA",
  "ESTOQUE_TRANSFERIR",
  "EXPEDICAO_SEPARAR",
  "EXPEDICAO_ENTREGAR"
];

const P_OP = [
  "USUARIOS_VER",
  "USUARIOS_CRIAR",
  "USUARIOS_EDITAR",
  "USUARIOS_BLOQUEAR",
  "USUARIOS_PERMISSOES",
  "EMPRESAS_CRIAR",
  "EMPRESAS_EDITAR",
  "EMPRESAS_INATIVAR",
  "EMPRESAS_EXCLUIR",
  "RELATORIOS_EXPORTAR"
];


/* =========================================================
   3) PERFIS RÁPIDOS DINÂMICOS
========================================================= */

let PERFIS = {};
let PERFIS_DB = [];

const PERFIS_PADRAO_FALLBACK = [
  {nome:"MASTER", descricao:"Acesso total", permissoes:"DASHBOARD_VER,DASHBOARD_VALORES,PATRIMONIO_VER,PATRIMONIO_CRIAR,PATRIMONIO_EDITAR,PATRIMONIO_MOVIMENTAR,PATRIMONIO_IMPRIMIR,PATRIMONIO_EXCLUIR,PATRIMONIO_EXPORTAR,ESTOQUE_VER,ESTOQUE_ENTRADA,ESTOQUE_SAIDA,ESTOQUE_TRANSFERIR,ESTOQUE_EXPORTAR,ENTRADA_VER,ENTRADA_CRIAR,TRIAGEM_VER,TRIAGEM_EXECUTAR,EXPEDICAO_VER,EXPEDICAO_SEPARAR,EXPEDICAO_ENTREGAR,RELATORIOS_VER,RELATORIOS_EXPORTAR,EMPRESAS_VER,EMPRESAS_CRIAR,EMPRESAS_EDITAR,EMPRESAS_INATIVAR,EMPRESAS_EXCLUIR,USUARIOS_VER,USUARIOS_CRIAR,USUARIOS_EDITAR,USUARIOS_BLOQUEAR,USUARIOS_PERMISSOES,CONFIGURACOES_VER,VALORES_VER,TODAS_OBRAS_VER,PROPRIA_OBRA_VER"},
  {nome:"ADMIN", descricao:"Administração sem owner core", permissoes:"DASHBOARD_VER,PATRIMONIO_VER,PATRIMONIO_CRIAR,PATRIMONIO_EDITAR,PATRIMONIO_MOVIMENTAR,PATRIMONIO_IMPRIMIR,ESTOQUE_VER,ESTOQUE_ENTRADA,ESTOQUE_SAIDA,ENTRADA_VER,TRIAGEM_VER,EXPEDICAO_VER,RELATORIOS_VER,RELATORIOS_EXPORTAR,EMPRESAS_VER,EMPRESAS_CRIAR,EMPRESAS_EDITAR,EMPRESAS_INATIVAR,USUARIOS_VER,USUARIOS_CRIAR,USUARIOS_EDITAR,USUARIOS_BLOQUEAR,USUARIOS_PERMISSOES,TODAS_OBRAS_VER,PROPRIA_OBRA_VER"},
  {nome:"CONSULTA", descricao:"Somente leitura", permissoes:"DASHBOARD_VER,PATRIMONIO_VER,RELATORIOS_VER,PROPRIA_OBRA_VER"},
  {nome:"CONSULTA GERAL", descricao:"Consulta todas as obras sem editar", permissoes:"DASHBOARD_VER,PATRIMONIO_VER,ESTOQUE_VER,RELATORIOS_VER,TODAS_OBRAS_VER"},
  {nome:"ALMOXARIFE", descricao:"Operacional do estoque", permissoes:"DASHBOARD_VER,ESTOQUE_VER,ESTOQUE_ENTRADA,ESTOQUE_SAIDA,ESTOQUE_TRANSFERIR,ENTRADA_VER,TRIAGEM_VER,EXPEDICAO_VER,EXPEDICAO_SEPARAR,EXPEDICAO_ENTREGAR,PATRIMONIO_VER,PATRIMONIO_MOVIMENTAR,PROPRIA_OBRA_VER"},
  {nome:"PATRIMONIO", descricao:"Controle de patrimônio", permissoes:"DASHBOARD_VER,PATRIMONIO_VER,PATRIMONIO_CRIAR,PATRIMONIO_EDITAR,PATRIMONIO_MOVIMENTAR,PATRIMONIO_IMPRIMIR,PATRIMONIO_EXPORTAR,RELATORIOS_VER,TODAS_OBRAS_VER"},
  {nome:"FINANCEIRO", descricao:"Relatórios e valores", permissoes:"DASHBOARD_VER,RELATORIOS_VER,RELATORIOS_EXPORTAR,VALORES_VER,TODAS_OBRAS_VER"}
];



/* =========================================================
   4) FUNÇÕES BÁSICAS
========================================================= */

function ir(pagina){
  window.location.href = pagina;
}
window.ir = ir;

function db(){
  return (
    window.client ||
    window.supabaseClient ||
    window.clientSupabase ||
    null
  );
}

function esc(valor){
  return String(valor ?? "").replace(/[&<>'"]/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "'":"&#39;",
    '"':"&quot;"
  }[c]));
}

function normalizar(valor){
  return String(valor || "").trim().toUpperCase();
}

function iniciais(nome){
  return String(nome || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0,2)
    .map(p => p[0])
    .join("")
    .toUpperCase() || "U";
}

function dataBR(valor){
  if(!valor) return "-";

  const data = new Date(String(valor).replace(" ","T"));

  return isNaN(data.getTime())
    ? String(valor)
    : data.toLocaleString("pt-BR");
}

function usuarioLocal(){
  try{
    const raw =
      localStorage.getItem("usuario_logado") ||
      localStorage.getItem("usuarioLogado");

    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return null;
  }
}

function usuarioLogadoEhOwner(){
  return Number(usuarioLocal()?.id) === 1;
}

function usuarioAlvoEhOwner(usuarioOuId){
  const id = typeof usuarioOuId === "object" ? usuarioOuId?.id : usuarioOuId;
  return Number(id) === 1;
}

function bloquearAcaoNoOwner(usuarioOuId, acao="alterar"){
  if(usuarioAlvoEhOwner(usuarioOuId) && !usuarioLogadoEhOwner()){
    alert(`Usuário protegido. Somente o Owner Root pode ${acao} este usuário.`);
    return true;
  }
  return false;
}

function logoutSeguro(){
  if(typeof logout === "function"){
    return logout();
  }

  localStorage.removeItem("usuario_logado");
  localStorage.removeItem("usuarioLogado");
  location.href = "login.html";
}
window.logoutSeguro = logoutSeguro;


/* =========================================================
   5) TOPO DA TELA
========================================================= */


/* =========================================================
   PATCH V5 - COMPATIBILIDADE COM TOPO PADRÃO PATRIMÔNIO
========================================================= */

function toggleMenuUsuario(event){
  if(event) event.stopPropagation();
  document.getElementById("dropdownUser")?.classList.toggle("ativo");
  document.getElementById("notifDropdown")?.classList.remove("ativo");
}
window.toggleMenuUsuario = toggleMenuUsuario;

function fecharMenusTopo(){
  document.getElementById("dropdownUser")?.classList.remove("ativo");
  document.getElementById("notifDropdown")?.classList.remove("ativo");
}

document.addEventListener("click", fecharMenusTopo);

function atualizarNotificacoes(lista){
  const badge = document.getElementById("notifBadge");
  const box = document.getElementById("notifLista");

  if(!badge || !box) return;

  const total = Array.isArray(lista) ? lista.length : 0;

  badge.innerText = total > 9 ? "9+" : String(total);
  badge.style.display = total > 0 ? "inline-flex" : "none";

  if(total === 0){
    box.innerHTML = `<div class="notif-item">Nenhuma notificação no momento.</div>`;
    return;
  }

  box.innerHTML = lista.map(n => `
    <div class="notif-item" onclick="${n.acao || ''}">
      <strong>${n.titulo || "Notificação"}</strong>
      <span>${n.texto || ""}</span>
    </div>
  `).join("");
}

function toggleNotificacoes(event){
  if(event) event.stopPropagation();
  document.getElementById("notifDropdown")?.classList.toggle("ativo");
  document.getElementById("dropdownUser")?.classList.remove("ativo");
  atualizarNotificacoes([]);
}
window.toggleNotificacoes = toggleNotificacoes;

function preencherTopoPatrimonio(){
  const u = usuarioLocal ? usuarioLocal() : null;
  const nome = document.getElementById("usuarioNome");
  const perfil = document.getElementById("usuarioPerfil");

  if(nome) nome.innerText = "Olá, " + (u?.nome || "usuário");
  if(perfil) perfil.innerText = u?.perfil || "-";
}

function carregarTopo(){
  const u = usuarioLocal();

  const nomeNovo = document.getElementById("usuarioNomeTopo");
  const perfilNovo = document.getElementById("usuarioPerfilTopo");

  const nomePadrao = document.getElementById("usuarioNome");
  const perfilPadrao = document.getElementById("usuarioPerfil");

  if(nomeNovo) nomeNovo.innerText = "Olá, " + (u?.nome || "Master");
  if(perfilNovo) perfilNovo.innerText = u?.perfil || "MASTER";

  if(nomePadrao) nomePadrao.innerText = "Olá, " + (u?.nome || "usuário");
  if(perfilPadrao) perfilPadrao.innerText = u?.perfil || "-";
}


/* =========================================================
   6) BUSCA NO BANCO COM FALLBACK
   Primeiro tenta usuarios_sistema.
   Se não existir ou vier vazio, tenta usuarios.
========================================================= */

async function buscarUsuariosComFallback(){
  const banco = db();

  const tentativas = ["usuarios_sistema", "usuarios"];

  for(const tabela of tentativas){
    try{
      const resp = await banco
        .from(tabela)
        .select("*")
        .order("nome");

      if(!resp.error && Array.isArray(resp.data) && resp.data.length > 0){
        TABELA_USUARIOS = tabela;
        console.log("✅ Usuários carregados da tabela:", tabela, resp.data.length);
        return resp.data;
      }

      if(!resp.error && Array.isArray(resp.data)){
        console.log("⚠️ Tabela existe, mas sem usuários:", tabela);
      }

      if(resp.error){
        console.warn("⚠️ Não carregou tabela:", tabela, resp.error.message);
      }

    }catch(e){
      console.warn("⚠️ Erro ao tentar tabela:", tabela, e);
    }
  }

  return [];
}

async function buscarTabelaSegura(nomeTabela, ordem){
  const banco = db();

  try{
    const resp = await banco
      .from(nomeTabela)
      .select("*")
      .order(ordem || "nome");

    if(resp.error){
      console.warn("⚠️ Erro ao carregar", nomeTabela, resp.error.message);
      return [];
    }

    return resp.data || [];
  }catch(e){
    console.warn("⚠️ Erro inesperado ao carregar", nomeTabela, e);
    return [];
  }
}




/* =========================================================
   PERFIS RÁPIDOS DO BANCO
========================================================= */

function montarMapaPerfisRapidos(lista){
  PERFIS_DB = (lista || []).filter(p => p && p.nome);
  PERFIS = {};
  PERFIS_DB.forEach(p => {
    PERFIS[normalizar(p.nome)] = String(p.permissoes || "").split(",").map(x => x.trim()).filter(Boolean);
  });
  renderizarPerfisRapidos();
}

async function carregarPerfisRapidos(){
  const banco = db();

  if(!banco){
    console.warn("⚠️ Supabase não carregado para perfis rápidos. Usando fallback.");
    montarMapaPerfisRapidos(PERFIS_PADRAO_FALLBACK);
    return;
  }

  try{
    const { data, error } = await banco
      .from("perfis_rapidos")
      .select("*")
      .order("id", { ascending:true });

    if(error){
      console.warn("⚠️ Perfis rápidos bloqueados/erro. Usando fallback.", error.message);
      montarMapaPerfisRapidos(PERFIS_PADRAO_FALLBACK);
      return;
    }

    const ativos = (data || []).filter(p =>
      p && p.nome && p.ativo !== false && String(p.ativo).toLowerCase() !== "false"
    );

    if(!ativos.length){
      console.warn("⚠️ Nenhum perfil rápido ativo veio do banco. Usando fallback.", data);
      montarMapaPerfisRapidos(PERFIS_PADRAO_FALLBACK);
      return;
    }

    montarMapaPerfisRapidos(ativos);
    console.log("✅ Perfis rápidos carregados do banco:", ativos.length);
  }catch(e){
    console.warn("⚠️ Falha inesperada nos perfis rápidos. Usando fallback.", e);
    montarMapaPerfisRapidos(PERFIS_PADRAO_FALLBACK);
  }
}
window.carregarPerfisRapidos = carregarPerfisRapidos;

function iconePerfilRapido(nome){
  const p = normalizar(nome);
  if(p.includes("MASTER")) return "fa-crown";
  if(p.includes("ADMIN")) return "fa-user-shield";
  if(p.includes("CONFER")) return "fa-clipboard-check";
  if(p.includes("CONSULTA")) return "fa-eye";
  if(p.includes("ALMOX")) return "fa-boxes-stacked";
  if(p.includes("OBRA")) return "fa-building";
  if(p.includes("FINANCE")) return "fa-dollar-sign";
  return "fa-rocket";
}

function renderizarPerfisRapidos(){
  const box = document.getElementById("quickPerfis");
  if(!box) return;

  const atual = normalizar(usuarioSelecionado?.perfil_rapido || usuarioSelecionado?.perfil || "");

  const topo = `
    <div class="perfil-toolbar">
      <button type="button" class="perfil-mini-btn red" onclick="abrirModalPerfilRapido(null); event.stopPropagation();">
        <i class="fa-solid fa-plus"></i> Novo perfil
      </button>
      <button type="button" class="perfil-mini-btn" onclick="abrirModalPerfilComMarcadas(); event.stopPropagation();">
        <i class="fa-solid fa-wand-magic-sparkles"></i> Criar com marcadas
      </button>
    </div>
  `;

  if(!PERFIS_DB.length){
    box.innerHTML = topo + `<div class="perfil-vazio">Nenhum perfil rápido ativo encontrado.</div>`;
    return;
  }

  box.innerHTML = topo + PERFIS_DB.map(p => {
    const ativo = atual && (normalizar(p.nome) === atual || normalizar(p.nome) === normalizar(usuarioSelecionado?.perfil));
    return `
      <div class="profile-card ${ativo ? "active" : ""}" onclick="aplicarPerfilRapido('${esc(p.nome)}')">
        <button type="button" class="perfil-card-edit" title="Editar perfil" onclick="event.stopPropagation(); abrirModalPerfilRapido(${Number(p.id || 0)})">
          <i class="fa-solid fa-pen"></i>
        </button>
        <i class="fa-solid ${iconePerfilRapido(p.nome)}"></i>
        <b>${esc(p.nome)}</b>
        <p>${esc(p.descricao || "Perfil rápido")}</p>
        <div class="perfil-card-actions" onclick="event.stopPropagation()">
          <button type="button" onclick="aplicarPerfilRapido('${esc(p.nome)}')">${ativo ? "Ativo" : "Aplicar"}</button>
          <button type="button" class="btn-ghost" onclick="duplicarPerfilRapido(${Number(p.id || 0)})">Copiar</button>
        </div>
      </div>
    `;
  }).join("");
}
window.renderizarPerfisRapidos = renderizarPerfisRapidos;
/* =========================================================
   7) CARREGAR TUDO
========================================================= */

async function carregarTudo(){
  carregarTopo();

  const banco = db();

  if(!banco){
    alert("Supabase não carregado. Confira JS/supabaseClient.js.");
    return;
  }

  empresas = await buscarTabelaSegura("empresas", "nome");
  obras = await buscarTabelaSegura("obras", "nome");
  usuarios = await buscarUsuariosComFallback();

  carregarSelects();
  await carregarPerfisRapidos();
  renderizarUsuarios();
  renderizarObrasLiberadas();

  if(usuarioSelecionado){
    const aindaExiste = usuarios.find(u => Number(u.id) === Number(usuarioSelecionado.id));
    if(aindaExiste) selecionarUsuario(aindaExiste.id);
  }

  if(!usuarios.length){
    console.warn("Nenhum usuário encontrado nas tabelas usuarios_sistema e usuarios.");
  }
}
window.carregarTudo = carregarTudo;


/* =========================================================
   8) SELECTS DE EMPRESA E OBRA
========================================================= */

function carregarSelects(){
  carregarSelectEmpresa("filtroEmpresa", "Todas as empresas");
  carregarSelectEmpresa("formEmpresa", "Empresa opcional");

  carregarSelectObra("filtroObra", "Todas as obras");
  carregarSelectObra("formObra", "Obra opcional");
}

function carregarSelectEmpresa(id, textoInicial){
  const sel = document.getElementById(id);
  if(!sel) return;

  sel.innerHTML = `
    <option value="">${textoInicial}</option>
    ${empresas.map(e => `
      <option value="${e.id}">
        ${esc(e.nome || e.razao_social || "-")}
      </option>
    `).join("")}
  `;
}

function carregarSelectObra(id, textoInicial){
  const sel = document.getElementById(id);
  if(!sel) return;

  sel.innerHTML = `
    <option value="">${textoInicial}</option>
    ${obras.map(o => `
      <option value="${o.id}">
        ${esc(o.codigo_obra || o.codigo || "-")} - ${esc(o.nome || "-")}
      </option>
    `).join("")}
  `;
}


/* =========================================================
   9) NOMES DE EMPRESA E OBRA
========================================================= */

function nomeEmpresa(id){
  const e = empresas.find(x => String(x.id) === String(id));

  return e
    ? (e.nome || e.razao_social || "BDR CONSTRUART")
    : "BDR CONSTRUART";
}

function nomeObra(id){
  const o = obras.find(x => String(x.id) === String(id));

  if(!o) return "-";

  return `${o.codigo_obra || o.codigo || "-"} - ${o.nome || "-"}`;
}


/* =========================================================
   10) FILTRAR E RENDERIZAR USUÁRIOS
========================================================= */

function filtrarUsuarios(){
  const perfil = normalizar(document.getElementById("filtroPerfil")?.value);
  const empresa = document.getElementById("filtroEmpresa")?.value || "";
  const obra = document.getElementById("filtroObra")?.value || "";
  const status = document.getElementById("filtroStatus")?.value || "";
  const busca = normalizar(document.getElementById("buscaUsuario")?.value);

  return usuarios.filter(u => {
    const st = u.ativo === false ? "INATIVO" : "ATIVO";

    const texto = normalizar(`
      ${u.nome || ""}
      ${u.usuario || ""}
      ${u.email || ""}
      ${u.perfil || ""}
      ${nomeEmpresa(u.empresa_id)}
      ${nomeObra(u.obra_id)}
    `);

    return (!perfil || normalizar(u.perfil) === perfil)
      && (!empresa || String(u.empresa_id) === String(empresa))
      && (!obra || String(u.obra_id) === String(obra))
      && (!status || st === status)
      && (!busca || texto.includes(busca));
  });
}

function renderizarUsuarios(){
  const box = document.getElementById("listaUsuarios");
  if(!box) return;

  const dados = filtrarUsuarios();

  if(!dados.length){
    box.innerHTML = `
      <div style="padding:28px;text-align:center;color:#667085;">
        Nenhum usuário encontrado.<br>
        <small>Confira se a tabela correta é usuarios_sistema ou usuarios.</small>
      </div>
    `;
    return;
  }

  box.innerHTML = dados.map(u => criarLinhaUsuario(u)).join("");
}
window.renderizarUsuarios = renderizarUsuarios;

function criarLinhaUsuario(u){
  const status = u.ativo === false ? "INATIVO" : "ATIVO";
  const perfil = u.perfil || "-";
  const ownerProtegido = usuarioAlvoEhOwner(u) && !usuarioLogadoEhOwner();

  const foto = u.foto_url
    ? `<img src="${esc(u.foto_url)}" onerror="this.remove()">`
    : iniciais(u.nome);

  const botoesAcao = ownerProtegido ? `
        <span class="badge badge-red" title="Owner Root protegido">🔒 Owner</span>
      ` : `
        <button class="icon-btn icon-blue" title="Editar" onclick="abrirModalUsuario(${u.id})">
          <i class="fa-solid fa-pen"></i>
        </button>

        <button class="icon-btn icon-yellow" title="Aplicar permissões" onclick="selecionarUsuario(${u.id})">
          <i class="fa-solid fa-key"></i>
        </button>

        <button class="icon-btn icon-red" title="Bloquear/Ativar" onclick="alternarStatus(${u.id})">
          <i class="fa-solid fa-lock"></i>
        </button>

        <button class="icon-btn icon-more" title="Mais">
          <i class="fa-solid fa-ellipsis"></i>
        </button>
      `;

  return `
    <div class="tr ${usuarioSelecionado && Number(usuarioSelecionado.id) === Number(u.id) ? "usuario-ativo" : ""}" onclick="selecionarUsuario(${u.id})">
      <div class="user-cell">
        <div class="user-avatar" style="background:#d71920">${foto}</div>
        <div>
          <b>${esc(u.nome || "-")}</b>
          <span>${esc(u.email || u.usuario || "-")}</span>
          <span style="display:block;margin-top:3px;color:#d71920;font-weight:900;">
            ${esc(u.perfil || "-")}${u.perfil_rapido ? ` • 🛡 ${esc(u.perfil_rapido)}` : ""}
          </span>
        </div>
      </div>

      <div>${badgePerfil(perfil)}</div>
      <div>${esc(nomeEmpresa(u.empresa_id))}</div>
      <div>${esc(nomeObra(u.obra_id))}</div>

      <div>
        <span class="badge ${status === "ATIVO" ? "badge-green" : "badge-red"}">
          ${status}
        </span>
      </div>

      <div>${dataBR(u.ultimo_acesso || u.ultimo_login || u.updated_at || u.created_at)}</div>

      <div class="actions" onclick="event.stopPropagation()">
        ${botoesAcao}
      </div>
    </div>
  `;
}

function badgePerfil(perfil){
  const p = normalizar(perfil);

  let cls = "badge-gray";

  if(p === "MASTER") cls = "badge-red";
  if(p === "ADMIN" || p === "GESTOR") cls = "badge-orange";
  if(p === "ALMOXARIFE" || p === "ALMOXARIFADO") cls = "badge-blue";
  if(p === "OPERADOR" || p === "OBRA") cls = "badge-green";

  return `<span class="badge ${cls}">${esc(perfil || "-")}</span>`;
}




function atualizarUsuarioSelecionadoCard(){
  const nome = document.getElementById("usuarioSelecionadoNome");
  const detalhe = document.getElementById("usuarioSelecionadoDetalhe");
  if(!nome || !detalhe) return;
  if(!usuarioSelecionado){
    nome.innerText = "Nenhum usuário selecionado";
    detalhe.innerText = "Clique em um usuário na lista para aplicar permissões.";
    return;
  }
  nome.innerText = `${usuarioSelecionado.nome || "-"} — ${usuarioSelecionado.perfil || "-"}`;
  detalhe.innerHTML = `ID ${usuarioSelecionado.id} • Perfil rápido: <b>${esc(usuarioSelecionado.perfil_rapido || "-")}</b> • Marque as permissões e clique em salvar.`;
}
/* =========================================================
   11) SELECIONAR USUÁRIO
========================================================= */

function selecionarUsuario(id){
  const alvo = usuarios.find(u => Number(u.id) === Number(id));
  if(!alvo) return;
  if(bloquearAcaoNoOwner(alvo, "alterar")) return;
  usuarioSelecionado = alvo;

  marcarPermissoes(usuarioSelecionado.permissoes || "");
  aplicarPerfilVisual(usuarioSelecionado.perfil_rapido || usuarioSelecionado.perfil || "");
  atualizarUsuarioSelecionadoCard();
  renderizarObrasLiberadas();
  renderizarPerfisRapidos();
  atualizarResumo();
  renderizarUsuarios();
}
window.selecionarUsuario = selecionarUsuario;


/* =========================================================
   12) PERMISSÕES
========================================================= */

function permissoesMarcadas(){
  return [...document.querySelectorAll(".perm:checked")].map(x => x.value);
}

function marcarPermissoes(permissoesTexto){
  const set = new Set(
    String(permissoesTexto || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
  );

  document.querySelectorAll(".perm").forEach(c => {
    c.checked = set.has(c.value);
  });

  atualizarResumo();
}

function setPermissoes(lista){
  const set = new Set(lista || []);

  document.querySelectorAll(".perm").forEach(c => {
    c.checked = set.has(c.value);
  });

  atualizarResumo();
}

document.addEventListener("change", e => {
  if(e.target.classList.contains("perm")){
    atualizarResumo();
    salvarPermissoesSelecionado(false);
  }
});


/* =========================================================
   13) RESUMO DE PERMISSÕES
========================================================= */

function atualizarResumo(){
  const p = permissoesMarcadas();

  const vis = p.filter(x => P_VIS.includes(x)).length;
  const sol = p.filter(x => P_SOL.includes(x)).length;
  const op = p.filter(x => P_OP.includes(x)).length;

  setText("sumVis", vis);
  setText("sumSol", sol);
  setText("sumOp", op);

  setWidth("barVis", (vis / 5) * 100);
  setWidth("barSol", (sol / 5) * 100);
  setWidth("barOp", (op / 6) * 100);

  const perfil = usuarioSelecionado?.perfil || "-";

  setText("perfilAtualResumo", perfil);
  setText("resumoNotif", p.includes("RECEBER_NOTIFICACOES") ? "Ativas" : "Desativadas");

  const acesso = document.getElementById("resumoAcessoAtual");

  if(acesso){
    acesso.innerHTML = `
      ${linhaAcesso("Dashboard", p.includes("DASHBOARD_VER"))}
      ${linhaAcesso("Patrimônio", p.includes("PATRIMONIO_VER"))}
      ${linhaAcesso("Todas obras", p.includes("TODAS_OBRAS_VER"))}
      ${linhaAcesso("Obra própria", p.includes("PROPRIA_OBRA_VER"))}
    `;
  }
}

function linhaAcesso(nome, ok){
  return `
    <div class="access-line ${ok ? "ok" : "no"}">
      <i class="fa-solid ${ok ? "fa-check-circle" : "fa-xmark-circle"}"></i>
      ${nome}: ${ok ? "PERMITIDO" : "BLOQUEADO"}
    </div>
  `;
}

function setText(id, valor){
  const el = document.getElementById(id);
  if(el) el.innerText = valor;
}

function setWidth(id, valor){
  const el = document.getElementById(id);
  if(el){
    el.style.width = `${Math.min(100, Math.max(0, valor))}%`;
  }
}


/* =========================================================
   14) PERFIS RÁPIDOS
========================================================= */

function aplicarPerfilRapido(perfil){
  if(!usuarioSelecionado){
    alert("Selecione um usuário primeiro.");
    return;
  }
  const p = normalizar(perfil);
  const lista = PERFIS[p] || [];
  if(!lista.length){
    alert("Perfil rápido sem permissões cadastradas: " + perfil);
    return;
  }
  setPermissoes(lista);
  usuarioSelecionado.perfil_rapido = perfil;
  // Perfil/cargo não é a mesma coisa que perfil rápido.
  // Mantém o cargo atual e salva o pacote em perfil_rapido.
  usuarioSelecionado.perfil = usuarioSelecionado.perfil || p.replace(/\s+/g, "_");
  aplicarPerfilVisual(perfil);
  atualizarUsuarioSelecionadoCard();
  renderizarPerfisRapidos();
  salvarPermissoesSelecionado(true);
}
window.aplicarPerfilRapido = aplicarPerfilRapido;

/* =========================================================
   PERFIS RÁPIDOS EDITÁVEIS - BDR
   - Editar / criar / copiar / inativar perfis rápidos
   - Usa tabela perfis_rapidos
========================================================= */
let perfilRapidoEditandoId = null;

function perfilRapidoPorId(id){
  return PERFIS_DB.find(p => Number(p.id) === Number(id)) || null;
}

function criarModalPerfilRapido(){
  if(document.getElementById("modalPerfilRapido")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="modalPerfilRapido" class="modal-bg">
      <div class="modal modal-perfil-rapido">
        <div class="modal-head">
          <h3 id="perfilRapidoTitulo">Perfil rápido</h3>
          <button class="close-btn" type="button" onclick="fecharModalPerfilRapido()"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="modal-body">
          <input type="hidden" id="perfilRapidoId">

          <div class="form-grid">
            <label>
              Nome do perfil
              <input id="perfilRapidoNome" placeholder="Ex: CONSULTA, ALMOXARIFE, FINANCEIRO">
            </label>

            <label>
              Status
              <select id="perfilRapidoAtivo">
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>

            <label class="wide">
              Descrição
              <input id="perfilRapidoDescricao" placeholder="Ex: Somente consulta de patrimônio">
            </label>

            <label class="wide">
              Permissões do perfil
              <textarea id="perfilRapidoPermissoes" rows="5" placeholder="DASHBOARD_VER,PATRIMONIO_VER,RELATORIOS_VER"></textarea>
            </label>
          </div>

          <div class="perfil-modal-actions">
            <button type="button" class="btn btn-soft" onclick="usarPermissoesMarcadasNoPerfil()">
              <i class="fa-solid fa-check-double"></i> Usar permissões marcadas
            </button>
            <button type="button" class="btn btn-gray" onclick="fecharModalPerfilRapido()">Cancelar</button>
            <button type="button" class="btn btn-red" onclick="salvarPerfilRapido()">
              <i class="fa-solid fa-floppy-disk"></i> Salvar perfil
            </button>
            <button type="button" class="btn btn-soft" id="btnInativarPerfilRapido" onclick="inativarPerfilRapidoAtual()">
              <i class="fa-solid fa-ban"></i> Inativar
            </button>
          </div>
        </div>
      </div>
    </div>
  `);
}

function abrirModalPerfilRapido(id){
  criarModalPerfilRapido();
  perfilRapidoEditandoId = id ? Number(id) : null;
  const p = perfilRapidoEditandoId ? perfilRapidoPorId(perfilRapidoEditandoId) : null;

  document.getElementById("perfilRapidoTitulo").innerText = p ? "Editar perfil rápido" : "Novo perfil rápido";
  document.getElementById("perfilRapidoId").value = p?.id || "";
  document.getElementById("perfilRapidoNome").value = p?.nome || "";
  document.getElementById("perfilRapidoDescricao").value = p?.descricao || "";
  document.getElementById("perfilRapidoPermissoes").value = p?.permissoes || permissoesMarcadas().join(",");
  document.getElementById("perfilRapidoAtivo").value = String(p?.ativo !== false);

  const btnInativar = document.getElementById("btnInativarPerfilRapido");
  if(btnInativar) btnInativar.style.display = p ? "" : "none";

  document.getElementById("modalPerfilRapido").classList.add("ativo");
}
window.abrirModalPerfilRapido = abrirModalPerfilRapido;

function abrirModalPerfilComMarcadas(){
  if(!permissoesMarcadas().length){
    alert("Marque as permissões primeiro para criar um perfil com elas.");
    return;
  }
  abrirModalPerfilRapido(null);
}
window.abrirModalPerfilComMarcadas = abrirModalPerfilComMarcadas;

function fecharModalPerfilRapido(){
  document.getElementById("modalPerfilRapido")?.classList.remove("ativo");
}
window.fecharModalPerfilRapido = fecharModalPerfilRapido;

function usarPermissoesMarcadasNoPerfil(){
  document.getElementById("perfilRapidoPermissoes").value = permissoesMarcadas().join(",");
}
window.usarPermissoesMarcadasNoPerfil = usarPermissoesMarcadasNoPerfil;

async function salvarPerfilRapido(){
  const banco = db();
  if(!banco){ alert("Supabase não carregado."); return; }

  const id = document.getElementById("perfilRapidoId").value;
  const nome = String(document.getElementById("perfilRapidoNome").value || "").trim().toUpperCase();
  const descricao = String(document.getElementById("perfilRapidoDescricao").value || "").trim();
  const permissoes = String(document.getElementById("perfilRapidoPermissoes").value || "")
    .split(",")
    .map(p => p.trim().toUpperCase())
    .filter(Boolean)
    .join(",");
  const ativo = document.getElementById("perfilRapidoAtivo").value === "true";

  if(!nome){ alert("Informe o nome do perfil."); return; }
  if(!permissoes){ alert("Informe pelo menos uma permissão."); return; }

  const payload = { nome, descricao, permissoes, ativo };
  let resp;

  if(id){
    resp = await banco.from("perfis_rapidos").update(payload).eq("id", id).select();
  }else{
    resp = await banco.from("perfis_rapidos").insert([payload]).select();
  }

  if(resp.error){
    alert("Erro ao salvar perfil rápido: " + resp.error.message);
    return;
  }

  if(!resp.data || resp.data.length === 0){
    alert("O Supabase não confirmou a alteração. Verifique RLS/policy da tabela perfis_rapidos.");
    return;
  }

  fecharModalPerfilRapido();
  await carregarPerfisRapidos();
  alert("Perfil rápido salvo com sucesso.");
}
window.salvarPerfilRapido = salvarPerfilRapido;

async function inativarPerfilRapidoAtual(){
  const id = document.getElementById("perfilRapidoId")?.value;
  if(!id){ return; }
  await inativarPerfilRapido(id);
}
window.inativarPerfilRapidoAtual = inativarPerfilRapidoAtual;

async function inativarPerfilRapido(id){
  const p = perfilRapidoPorId(id);
  if(!p) return;
  if(!confirm(`Inativar o perfil rápido "${p.nome}"?`)) return;

  const resp = await db().from("perfis_rapidos").update({ativo:false}).eq("id", id).select();
  if(resp.error){ alert("Erro ao inativar perfil: " + resp.error.message); return; }

  fecharModalPerfilRapido();
  await carregarPerfisRapidos();
}
window.inativarPerfilRapido = inativarPerfilRapido;

function duplicarPerfilRapido(id){
  const p = perfilRapidoPorId(id);
  if(!p) return;
  abrirModalPerfilRapido(null);
  document.getElementById("perfilRapidoNome").value = (p.nome || "PERFIL") + " COPIA";
  document.getElementById("perfilRapidoDescricao").value = p.descricao || "";
  document.getElementById("perfilRapidoPermissoes").value = p.permissoes || "";
  document.getElementById("perfilRapidoAtivo").value = "true";
}
window.duplicarPerfilRapido = duplicarPerfilRapido;


function aplicarPerfilVisual(perfil){
  const p = normalizar(perfil);

  document.querySelectorAll(".profile-card").forEach(card => {
    card.classList.remove("active");

    const nomeCard = normalizar(card.querySelector("b")?.innerText || "");

    const igual =
      nomeCard === p ||
      (p === "ALMOXARIFADO" && nomeCard === "ALMOXARIFE");

    if(igual){
      card.classList.add("active");

      const btn = card.querySelector("button");
      if(btn) btn.innerText = "Ativo";
    }else{
      const btn = card.querySelector("button");
      if(btn) btn.innerText = "Aplicar";
    }
  });
}


/* =========================================================
   15) BOTÕES MASTER
========================================================= */

function liberarTudo(){
  document.querySelectorAll(".perm").forEach(c => c.checked = true);
  atualizarResumo();
  salvarPermissoesSelecionado(true);
}
window.liberarTudo = liberarTudo;

function aplicarSomenteCD(){
  setPermissoes([
    "DASHBOARD_VER",
    "ESTOQUE_VER",
    "PROPRIA_OBRA_VER"
  ]);

  salvarPermissoesSelecionado(true);
}
window.aplicarSomenteCD = aplicarSomenteCD;

function aplicarPropriaObra(){
  setPermissoes([
    "DASHBOARD_VER",
    "PATRIMONIO_VER",
    "PROPRIA_OBRA_VER"
  ]);

  salvarPermissoesSelecionado(true);
}
window.aplicarPropriaObra = aplicarPropriaObra;

function bloquearExterno(){
  const remover = [
    "VER_ESTOQUE_OUTRAS_OBRAS",
    "VER_EM_USO_OUTRAS_OBRAS",
    "SOLICITAR_OUTRAS_OBRAS",
    "SOLICITAR_EM_USO"
  ];

  const atual = permissoesMarcadas().filter(p => !remover.includes(p));

  setPermissoes(atual);
  salvarPermissoesSelecionado(true);
}
window.bloquearExterno = bloquearExterno;


/* =========================================================
   16) SALVAR PERMISSÕES
========================================================= */

async function salvarPermissoesSelecionado(mostrarMsg){
  if(!usuarioSelecionado || !db()) return;

  if(bloquearAcaoNoOwner(usuarioSelecionado, "alterar")) return;
  const payload = {
    permissoes: permissoesMarcadas().join(","),
    perfil: usuarioSelecionado.perfil || "OPERADOR",
    perfil_rapido: usuarioSelecionado.perfil_rapido || null,
    updated_at: new Date().toISOString()
  };

  const resp = await bdrSalvarUpdate(TABELA_USUARIOS, payload, {id:usuarioSelecionado.id});

  if(resp.error){
    alert("Erro ao salvar permissões: " + resp.error.message);
    return;
  }

  const alvo = usuarios.find(u => Number(u.id) === Number(usuarioSelecionado.id));

  if(alvo){
    alvo.permissoes = payload.permissoes;
    alvo.perfil = payload.perfil;
    alvo.perfil_rapido = payload.perfil_rapido;
  }

  if(mostrarMsg){
    console.log("Permissões atualizadas.");
  }

  renderizarUsuarios();
}


/* =========================================================
   17) OBRAS LIBERADAS
========================================================= */

function renderizarObrasLiberadas(){
  const box = document.getElementById("listaObrasLiberadas");
  if(!box) return;

  const termo = normalizar(document.getElementById("buscaObraLiberada")?.value || "");

  const lista = obras.filter(o => {
    return normalizar(`${o.codigo_obra || o.codigo || ""} ${o.nome || ""}`).includes(termo);
  });

  if(!lista.length){
    box.innerHTML = `
      <div style="padding:18px;text-align:center;color:#667085;">
        Nenhuma obra encontrada.
      </div>
    `;
    return;
  }

  const liberadas = new Set(
    String(usuarioSelecionado?.obras_liberadas || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
  );

  box.innerHTML = lista.map(o => {
    const id = String(o.id);
    const checked = liberadas.has(id);
    const nome = `${o.codigo_obra || o.codigo || "-"} - ${o.nome || "-"}`;
    const tag = tipoObra(o);

    return `
      <label class="obra-row">
        <input class="chk obra-check" type="checkbox" value="${id}" ${checked ? "checked" : ""}>
        <span>${esc(nome)}</span>
        <span class="tag ${tag.cls}">${tag.txt}</span>
      </label>
    `;
  }).join("");
}
window.renderizarObrasLiberadas = renderizarObrasLiberadas;

function tipoObra(o){
  const txt = normalizar(`${o.nome || ""} ${o.tipo || ""}`);

  if(txt.includes("CD") || txt.includes("CENTRO")) return {txt:"CD", cls:"tag-cd"};
  if(txt.includes("FAZENDA")) return {txt:"FAZENDA", cls:"tag-fazenda"};
  if(txt.includes("APOIO")) return {txt:"APOIO", cls:"tag-apoio"};

  return {txt:"OBRA", cls:"tag-obra"};
}

function marcarTodasObras(marcar){
  document.querySelectorAll(".obra-check").forEach(c => {
    c.checked = marcar;
  });
}
window.marcarTodasObras = marcarTodasObras;

async function salvarLiberacoesObras(){
  if(!usuarioSelecionado || !db()){
    alert("Selecione um usuário.");
    return;
  }

  const lista = [...document.querySelectorAll(".obra-check:checked")]
    .map(c => c.value)
    .join(",");

  const payload = {
    obras_liberadas: lista,
    updated_at:new Date().toISOString()
  };

  const resp = await bdrSalvarUpdate(TABELA_USUARIOS, payload, {id:usuarioSelecionado.id});

  if(resp.error){
    alert("Erro ao salvar obras liberadas: " + resp.error.message);
    return;
  }

  usuarioSelecionado.obras_liberadas = lista;

  const alvo = usuarios.find(u => Number(u.id) === Number(usuarioSelecionado.id));
  if(alvo) alvo.obras_liberadas = lista;

  alert(typeof estaOnline === "function" && !estaOnline() ? "📦 Obras liberadas salvas offline." : "Obras/setores liberados com sucesso!");
}
window.salvarLiberacoesObras = salvarLiberacoesObras;


/* =========================================================
   18) MODAL DE USUÁRIO
========================================================= */

function abrirModalUsuario(id){
  if(bloquearAcaoNoOwner(id, "editar")) return;
  const modal = document.getElementById("modalUsuario");
  modal.classList.add("ativo");

  const u = id ? usuarios.find(x => Number(x.id) === Number(id)) : null;

  document.getElementById("modalTitulo").innerText = u ? "Editar usuário" : "Novo usuário";
  document.getElementById("usuarioId").value = u?.id || "";
  document.getElementById("formNome").value = u?.nome || "";
  document.getElementById("formUsuario").value = u?.usuario || "";
  document.getElementById("formEmail").value = u?.email || "";
  document.getElementById("formSenha").value = "";
  document.getElementById("formPerfil").value = u?.perfil || "OPERADOR";
  document.getElementById("formAtivo").value = String(u?.ativo !== false);
  document.getElementById("formEmpresa").value = u?.empresa_id || "";
  document.getElementById("formObra").value = u?.obra_id || "";
  document.getElementById("formFoto").value = u?.foto_url || "";
}
window.abrirModalUsuario = abrirModalUsuario;

function fecharModalUsuario(){
  document.getElementById("modalUsuario").classList.remove("ativo");
}
window.fecharModalUsuario = fecharModalUsuario;

async function salvarUsuario(){
  const banco = db();

  if(!banco){
    alert("Supabase não carregado.");
    return;
  }

  const id = document.getElementById("usuarioId").value;
  const nome = document.getElementById("formNome").value.trim();
  const usuario = document.getElementById("formUsuario").value.trim();
  const senha = document.getElementById("formSenha").value.trim();
  const perfil = document.getElementById("formPerfil").value;

  if(!nome || !usuario || !perfil){
    alert("Preencha nome, usuário e perfil.");
    return;
  }

  const payload = {
    nome,
    usuario,
    perfil,
    email: document.getElementById("formEmail").value.trim() || null,
    empresa_id: document.getElementById("formEmpresa").value ? Number(document.getElementById("formEmpresa").value) : null,
    obra_id: document.getElementById("formObra").value ? Number(document.getElementById("formObra").value) : null,
    foto_url: document.getElementById("formFoto").value.trim() || null,
    ativo: document.getElementById("formAtivo").value === "true",
    updated_at: new Date().toISOString()
  };

  if(senha){
    payload.senha = senha;
    payload.senha_temporaria = true;
    payload.senha_provisoria = true;
    payload.trocar_senha = true;
  }

  let resp;

  if(id){
    resp = await bdrSalvarUpdate(TABELA_USUARIOS, payload, {id});
  }else{
    if(!senha){
      alert("Informe uma senha para novo usuário.");
      return;
    }

    payload.perfil_rapido = perfil;
    payload.permissoes = (PERFIS[normalizar(perfil)] || []).join(",");
    resp = await bdrSalvarInsert(TABELA_USUARIOS, [payload]);
  }

  if(resp.error){
    alert("Erro ao salvar usuário: " + resp.error.message);
    return;
  }

  fecharModalUsuario();

  if(typeof estaOnline === "function" && !estaOnline()){
    alert("📦 Usuário salvo offline. Será sincronizado quando a internet voltar.");
    return;
  }

  await carregarTudo();

  if(resp.data?.id){
    selecionarUsuario(resp.data.id);
  }else if(Array.isArray(resp.data) && resp.data[0]?.id){
    selecionarUsuario(resp.data[0].id);
  }

  alert("Usuário salvo com sucesso!");
}
window.salvarUsuario = salvarUsuario;


/* =========================================================
   19) ATIVAR / BLOQUEAR USUÁRIO
========================================================= */

async function alternarStatus(id){
  const u = usuarios.find(x => Number(x.id) === Number(id));

  if(!u) return;
  if(bloquearAcaoNoOwner(u, "bloquear/inativar")) return;
  const novo = !(u.ativo !== false);

  const resp = await bdrSalvarUpdate(TABELA_USUARIOS, {
    ativo: novo,
    updated_at: new Date().toISOString()
  }, {id});

  if(resp.error){
    alert("Erro: " + resp.error.message);
    return;
  }

  if(typeof estaOnline === "function" && !estaOnline()){
    u.ativo = novo;
    renderizarUsuarios();
    alert("📦 Status salvo offline.");
    return;
  }

  await carregarTudo();
}
window.alternarStatus = alternarStatus;


/* =========================================================
   20) NOTIFICAÇÕES
========================================================= */




/* =========================================================
   21) INICIAR
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  carregarTudo();
});


/* compatibilidade caso algum botão antigo chame carregarDados */
window.carregarDados = window.carregarTudo || carregarTudo;


/* =========================================================
   PATCH FINAL - COMPATIBILIDADE DE BOTÕES ANTIGOS
========================================================= */
window.salvarPermissoesUsuarioSelecionado = window.salvarPermissoesUsuarioSelecionado || function(){ return salvarPermissoesSelecionado(true); };
window.salvarAlteracoesUsuarioSelecionado = window.salvarAlteracoesUsuarioSelecionado || function(){ return salvarPermissoesSelecionado(true); };


/* =========================================================
   BDR DEBUG/GLOBAL - facilita teste no console
========================================================= */
window.BDRUsuarios = window.BDRUsuarios || {};
window.BDRUsuarios.carregarPerfisRapidos = carregarPerfisRapidos;
window.BDRUsuarios.usuarioLogadoEhOwner = usuarioLogadoEhOwner;
window.BDRUsuarios.bloquearAcaoNoOwner = bloquearAcaoNoOwner;
window.BDRUsuarios.renderizarPerfisRapidos = renderizarPerfisRapidos;
window.BDRUsuarios.selecionarUsuario = selecionarUsuario;
window.BDRUsuarios.aplicarPerfilRapido = aplicarPerfilRapido;


/* =========================================================
   PATCH BDR PERMISSÕES NOVAS V1
   - Renderiza cards por módulo na tela de usuários.
   - Mantém salvamento no mesmo campo permissoes.
   - Não mexe no banco.
========================================================= */

const BDR_PERMISSOES_NOVAS = [
  {
    titulo:"Dashboard e Dados",
    icone:"fa-chart-simple",
    itens:[
      ["DASHBOARD_VER","Ver dashboard","Abre a tela inicial e indicadores."],
      ["DASHBOARD_VALORES","Dashboard com valores","Mostra cards e gráficos financeiros."],
      ["VALORES_VER","Ver valores","Mostra valores em telas e relatórios."],
      ["TODAS_OBRAS_VER","Ver todas as obras","Libera dados de todas as obras/setores."],
      ["PROPRIA_OBRA_VER","Ver própria obra","Limita dados à obra do usuário."]
    ]
  },
  {
    titulo:"Patrimônio",
    icone:"fa-tags",
    itens:[
      ["PATRIMONIO_VER","Consultar patrimônio","Abre a tela de patrimônio e permite buscar."],
      ["PATRIMONIO_CRIAR","Cadastrar patrimônio","Mostra formulário de entrada de patrimônio."],
      ["PATRIMONIO_EDITAR","Editar patrimônio","Permite correção cadastral."],
      ["PATRIMONIO_MOVIMENTAR","Movimentar patrimônio","Permite mudar status, obra e baixa."],
      ["PATRIMONIO_IMPRIMIR","Imprimir etiqueta","Permite imprimir etiqueta/QR Code."],
      ["PATRIMONIO_EXPORTAR","Exportar patrimônio","Permite exportar planilhas."],
      ["PATRIMONIO_EXCLUIR","Excluir patrimônio","Permite exclusão quando existir no módulo."]
    ]
  },
  {
    titulo:"Estoque / Entrada / Triagem",
    icone:"fa-boxes-stacked",
    itens:[
      ["ESTOQUE_VER","Consultar estoque","Abre estoque e consulta itens."],
      ["ESTOQUE_ENTRADA","Entrada no estoque","Permite registrar entrada."],
      ["ESTOQUE_SAIDA","Saída do estoque","Permite retirar/baixar itens."],
      ["ESTOQUE_TRANSFERIR","Transferir estoque","Permite movimentar entre obras."],
      ["ESTOQUE_EXPORTAR","Exportar estoque","Permite exportar estoque."],
      ["ENTRADA_VER","Ver entrada","Abre tela de entrada."],
      ["ENTRADA_CRIAR","Criar entrada","Permite lançar entrada."],
      ["TRIAGEM_VER","Ver triagem","Abre tela de triagem."],
      ["TRIAGEM_EXECUTAR","Executar triagem","Permite classificar itens."]
    ]
  },
  {
    titulo:"Expedição / Pedidos",
    icone:"fa-truck-fast",
    itens:[
      ["EXPEDICAO_VER","Ver expedição","Abre expedição e pedidos."],
      ["EXPEDICAO_SEPARAR","Separar pedido","Permite separar materiais."],
      ["EXPEDICAO_ENTREGAR","Entregar pedido","Permite finalizar entrega."],
      ["EXPEDICAO_APROVAR","Aprovar pedido","Permite aprovação de pedidos."],
      ["RECEBER_NOTIFICACOES","Receber notificações","Mostra alertas/sininho."]
    ]
  },
  {
    titulo:"Empresas / Obras",
    icone:"fa-building",
    itens:[
      ["EMPRESAS_VER","Ver empresas/obras","Abre cadastro de empresas e obras."],
      ["EMPRESAS_CRIAR","Criar empresa/obra","Permite cadastrar."],
      ["EMPRESAS_EDITAR","Editar empresa/obra","Permite alterar cadastro."],
      ["EMPRESAS_INATIVAR","Inativar/Reativar","Permite desativar ou reativar."],
      ["EMPRESAS_EXCLUIR","Excluir empresa/obra","Permite apagar quando não houver vínculo."]
    ]
  },
  {
    titulo:"Usuários e Administração",
    icone:"fa-users-gear",
    itens:[
      ["USUARIOS_VER","Ver usuários","Abre tela de usuários."],
      ["USUARIOS_CRIAR","Criar usuário","Permite cadastrar usuários."],
      ["USUARIOS_EDITAR","Editar usuário","Permite alterar dados."],
      ["USUARIOS_BLOQUEAR","Bloquear usuário","Permite ativar/inativar."],
      ["USUARIOS_PERMISSOES","Alterar permissões","Permite marcar/desmarcar acessos."],
      ["CONFIGURACOES_VER","Configurações","Abre configurações do sistema."]
    ]
  },
  {
    titulo:"Relatórios / Exportação",
    icone:"fa-file-export",
    itens:[
      ["RELATORIOS_VER","Ver relatórios","Abre relatórios."],
      ["RELATORIOS_EXPORTAR","Exportar relatórios","Permite exportar Excel/PDF."],
      ["SIENGE_EXPORTAR","Exportar Sienge","Permite gerar arquivo Sienge."],
      ["FINANCEIRO_VER","Ver financeiro","Mostra dados financeiros."]
    ]
  }
];

function renderizarQuadroPermissoesNovoBDR(){
  const board = document.querySelector(".board");
  if(!board || board.dataset.bdrPermissoesNovas === "SIM") return;

  board.dataset.bdrPermissoesNovas = "SIM";
  board.innerHTML = BDR_PERMISSOES_NOVAS.map(grupo => `
    <div class="panel">
      <div class="panel-head"><i class="fa-solid ${grupo.icone}"></i> ${grupo.titulo}</div>
      <div class="panel-body">
        ${grupo.itens.map(([valor, titulo, desc]) => `
          <div class="perm-row">
            <div class="perm-ico"><i class="fa-solid fa-key"></i></div>
            <div class="perm-text"><b>${titulo}</b><span>${desc}</span></div>
            <label class="switch">
              <input type="checkbox" class="perm" value="${valor}">
              <span class="slider"></span>
            </label>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");
}

try{
  const carregarTudoOriginalBDR = carregarTudo;
  carregarTudo = async function(){
    renderizarQuadroPermissoesNovoBDR();
    const r = await carregarTudoOriginalBDR.apply(this, arguments);
    renderizarQuadroPermissoesNovoBDR();
    return r;
  };
  window.carregarTudo = carregarTudo;
}catch(e){
  console.warn("Patch permissões novas não conseguiu envolver carregarTudo.", e);
}

document.addEventListener("DOMContentLoaded", () => {
  renderizarQuadroPermissoesNovoBDR();
});
window.renderizarQuadroPermissoesNovoBDR = renderizarQuadroPermissoesNovoBDR;

