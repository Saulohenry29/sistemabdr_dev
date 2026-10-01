/* =========================================================
   ATUALIZADO: USUÁRIOS COM OFFLINE BDR
========================================================= */
void 0;
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
   ATLAS USUÁRIOS V5.1 - SELEÇÃO INTELIGENTE
   Mantém o usuário selecionado durante a sessão e permite
   seleção automática pela busca sem mexer em outros módulos.
========================================================= */
const ATLAS_USUARIO_SELECIONADO_KEY = "atlas_usuario_selecionado_id";
let atlasAutoSelecionandoUsuario = false;
let atlasTimerSelecaoBusca = null;

function salvarUsuarioSelecionadoNaSessao(id){
  try{
    if(id === null || id === undefined || id === ""){
      sessionStorage.removeItem(ATLAS_USUARIO_SELECIONADO_KEY);
      return;
    }
    sessionStorage.setItem(ATLAS_USUARIO_SELECIONADO_KEY, String(id));
  }catch(error){
    console.warn("Atlas Usuários: não foi possível salvar a seleção da sessão.", error);
  }
}

function lerUsuarioSelecionadoDaSessao(){
  try{
    return sessionStorage.getItem(ATLAS_USUARIO_SELECIONADO_KEY);
  }catch(error){
    return null;
  }
}


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
  "CONFIGURAR_ETIQUETAS",
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
  {nome:"MASTER", descricao:"Acesso total", permissoes:"DASHBOARD_VER,DASHBOARD_VALORES,PATRIMONIO_VER,PATRIMONIO_CRIAR,PATRIMONIO_EDITAR,PATRIMONIO_MOVIMENTAR,PATRIMONIO_IMPRIMIR,CONFIGURAR_ETIQUETAS,PATRIMONIO_EXCLUIR,PATRIMONIO_EXPORTAR,ESTOQUE_VER,ESTOQUE_ENTRADA,ESTOQUE_SAIDA,ESTOQUE_TRANSFERIR,ESTOQUE_EXPORTAR,ENTRADA_VER,ENTRADA_CRIAR,TRIAGEM_VER,TRIAGEM_EXECUTAR,EXPEDICAO_VER,EXPEDICAO_SEPARAR,EXPEDICAO_ENTREGAR,RELATORIOS_VER,RELATORIOS_EXPORTAR,EMPRESAS_VER,EMPRESAS_CRIAR,EMPRESAS_EDITAR,EMPRESAS_INATIVAR,EMPRESAS_EXCLUIR,USUARIOS_VER,USUARIOS_CRIAR,USUARIOS_EDITAR,USUARIOS_BLOQUEAR,USUARIOS_PERMISSOES,CONFIGURACOES_VER,VALORES_VER,TODAS_OBRAS_VER,PROPRIA_OBRA_VER"},
  {nome:"ADMIN", descricao:"Administração sem owner core", permissoes:"DASHBOARD_VER,PATRIMONIO_VER,PATRIMONIO_CRIAR,PATRIMONIO_EDITAR,PATRIMONIO_MOVIMENTAR,PATRIMONIO_IMPRIMIR,ESTOQUE_VER,ESTOQUE_ENTRADA,ESTOQUE_SAIDA,ENTRADA_VER,TRIAGEM_VER,EXPEDICAO_VER,RELATORIOS_VER,RELATORIOS_EXPORTAR,EMPRESAS_VER,EMPRESAS_CRIAR,EMPRESAS_EDITAR,EMPRESAS_INATIVAR,USUARIOS_VER,USUARIOS_CRIAR,USUARIOS_EDITAR,USUARIOS_BLOQUEAR,USUARIOS_PERMISSOES,TODAS_OBRAS_VER,PROPRIA_OBRA_VER"},
  {nome:"CONSULTA", descricao:"Somente leitura", permissoes:"DASHBOARD_VER,PATRIMONIO_VER,RELATORIOS_VER,PROPRIA_OBRA_VER"},
  {nome:"CONSULTA GERAL", descricao:"Consulta todas as obras sem editar", permissoes:"DASHBOARD_VER,PATRIMONIO_VER,ESTOQUE_VER,RELATORIOS_VER,TODAS_OBRAS_VER"},
  {nome:"ALMOXARIFE", descricao:"Operacional do estoque", permissoes:"DASHBOARD_VER,ESTOQUE_VER,ESTOQUE_ENTRADA,ESTOQUE_SAIDA,ESTOQUE_TRANSFERIR,ENTRADA_VER,TRIAGEM_VER,EXPEDICAO_VER,EXPEDICAO_SEPARAR,EXPEDICAO_ENTREGAR,PATRIMONIO_VER,PATRIMONIO_MOVIMENTAR,PROPRIA_OBRA_VER"},
  {nome:"PATRIMONIO", descricao:"Controle de patrimônio", permissoes:"DASHBOARD_VER,PATRIMONIO_VER,PATRIMONIO_CRIAR,PATRIMONIO_EDITAR,PATRIMONIO_MOVIMENTAR,PATRIMONIO_IMPRIMIR,PATRIMONIO_EXPORTAR,RELATORIOS_VER,TODAS_OBRAS_VER"},
  {nome:"FINANCEIRO", descricao:"Relatórios e valores", permissoes:"DASHBOARD_VER,RELATORIOS_VER,RELATORIOS_EXPORTAR,VALORES_VER,TODAS_OBRAS_VER"},
  {nome:"SOLICITANTE", descricao:"Solicita e acompanha pedidos", permissoes:"DASHBOARD_VER,PATRIMONIO_VER,EXPEDICAO_VER,SOLICITAR_MATERIAL,RECEBER_NOTIFICACOES,NOTIF_EXPEDICAO_APROVACAO,NOTIF_EXPEDICAO_SEPARACAO,NOTIF_EXPEDICAO_TRANSPORTE,NOTIF_EXPEDICAO_RECEBIMENTO,NOTIF_MODO_SOM,PROPRIA_OBRA_VER"},
  {nome:"TRANSPORTE", descricao:"Retirada, motorista e trânsito", permissoes:"DASHBOARD_VER,EXPEDICAO_VER,EXPEDICAO_TRANSPORTE,ENTREGAR_MATERIAL,RECEBER_NOTIFICACOES,NOTIF_EXPEDICAO_TRANSPORTE,NOTIF_MODO_SOM,PROPRIA_OBRA_VER"}
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
        void 0;
        return resp.data;
      }

      if(!resp.error && Array.isArray(resp.data)){
        void 0;
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
    void 0;
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

  const idSelecionadoSessao = lerUsuarioSelecionadoDaSessao();
  const idParaRestaurar = usuarioSelecionado?.id || idSelecionadoSessao;

  if(idParaRestaurar){
    const aindaExiste = usuarios.find(u => Number(u.id) === Number(idParaRestaurar));

    if(aindaExiste){
      selecionarUsuario(aindaExiste.id, {
        naoRenderizarLista: false,
        rolarParaPermissoes: false,
        origem: "RESTAURACAO_SESSAO"
      });
    }else{
      salvarUsuarioSelecionadoNaSessao(null);
    }
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

function encontrarUsuarioExatoNaBusca(dados, termoBusca){
  const termo = normalizar(termoBusca);
  if(!termo) return null;

  return (dados || []).find(u => {
    const nome = normalizar(u.nome);
    const login = normalizar(u.usuario);
    const email = normalizar(u.email);

    return nome === termo || login === termo || email === termo;
  }) || null;
}

function agendarSelecaoAutomaticaUsuario(dados){
  clearTimeout(atlasTimerSelecaoBusca);

  const campoBusca = document.getElementById("buscaUsuario");
  const termoOriginal = String(campoBusca?.value || "").trim();

  if(termoOriginal.length < 2) return;

  const exato = encontrarUsuarioExatoNaBusca(dados, termoOriginal);
  const alvo = exato || (dados.length === 1 ? dados[0] : null);

  if(!alvo) return;
  if(Number(usuarioSelecionado?.id) === Number(alvo.id)) return;
  if(atlasAutoSelecionandoUsuario) return;

  atlasTimerSelecaoBusca = setTimeout(() => {
    atlasAutoSelecionandoUsuario = true;

    try{
      selecionarUsuario(alvo.id, {
        naoRenderizarLista: true,
        rolarParaPermissoes: true,
        origem: "BUSCA_AUTOMATICA"
      });

      // Reaplica a linha ativa sem recriar toda a tela várias vezes.
      document.querySelectorAll("#listaUsuarios .tr").forEach(linha => {
        linha.classList.remove("usuario-ativo");
      });

      const linhaAtiva = [...document.querySelectorAll("#listaUsuarios .tr")]
        .find(linha => linha.getAttribute("onclick")?.includes(`selecionarUsuario(${alvo.id})`));

      linhaAtiva?.classList.add("usuario-ativo");
    }finally{
      atlasAutoSelecionandoUsuario = false;
    }
  }, 220);
}

function renderizarUsuarios(){
  const box = document.getElementById("listaUsuarios");
  if(!box) return;

  const dados = filtrarUsuarios();

  if(!dados.length){
    box.innerHTML = `
      <div style="padding:28px;text-align:center;color:#667085;">
        Nenhum usuário encontrado.<br>
        <small>Confira os filtros ou o nome pesquisado.</small>
      </div>
    `;
    return;
  }

  box.innerHTML = dados.map(u => criarLinhaUsuario(u)).join("");
  agendarSelecaoAutomaticaUsuario(dados);
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

function selecionarUsuario(id, opcoes = {}){
  const alvo = usuarios.find(u => Number(u.id) === Number(id));
  if(!alvo) return false;
  if(bloquearAcaoNoOwner(alvo, "alterar")) return false;

  usuarioSelecionado = alvo;
  salvarUsuarioSelecionadoNaSessao(alvo.id);

  marcarPermissoes(usuarioSelecionado.permissoes || "");
  aplicarPerfilVisual(usuarioSelecionado.perfil_rapido || usuarioSelecionado.perfil || "");
  atualizarUsuarioSelecionadoCard();
  renderizarObrasLiberadas();
  renderizarPerfisRapidos();
  atualizarResumo();

  if(!opcoes.naoRenderizarLista){
    renderizarUsuarios();
  }

  if(opcoes.rolarParaPermissoes){
    requestAnimationFrame(() => {
      const card = document.getElementById("usuarioSelecionadoCard");
      if(card){
        card.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    });
  }

  return true;
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
    // Não salva automático ao marcar/desmarcar. Salva apenas no botão.
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
    void 0;
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

window.limparSelecaoPermissao = function(){
  usuarioSelecionado = null;
  salvarUsuarioSelecionadoNaSessao(null);

  document.querySelectorAll("input.perm[type='checkbox']").forEach(chk => {
    chk.checked = false;
  });

  document.querySelectorAll("#listaObrasLiberadas input[type='checkbox']").forEach(chk => {
    chk.checked = false;
  });

  atualizarUsuarioSelecionadoCard();
  atualizarResumo();
  renderizarObrasLiberadas();
  renderizarPerfisRapidos();
  renderizarUsuarios();
};


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
      ["CONFIGURAR_ETIQUETAS","Configurar etiquetas","Exibe o botão e permite ajustar tamanho, posição e padrão de impressão."],
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


/* =========================================================
   BDR USUÁRIOS FINAL V2 - SALVAR / PERMISSÕES / CACHE
   - Corrige USUARIOS x USUARIOS_VER
   - Salva somente pelo botão
   - Fallback se offlineQueue não carregar
   - Atualiza usuário logado no localStorage após salvar
========================================================= */
(function(){
  if(window.__BDR_USUARIOS_FINAL_V2__) return;
  window.__BDR_USUARIOS_FINAL_V2__ = true;

  const ALIASES = {
    DASHBOARD:'DASHBOARD_VER', DASHBOARD_VER:'DASHBOARD',
    ENTRADA:'ENTRADA_VER', ENTRADA_VER:'ENTRADA',
    TRIAGEM:'TRIAGEM_VER', TRIAGEM_VER:'TRIAGEM',
    ESTOQUE:'ESTOQUE_VER', ESTOQUE_VER:'ESTOQUE',
    PATRIMONIO:'PATRIMONIO_VER', PATRIMONIO_VER:'PATRIMONIO',
    EXPEDICAO:'EXPEDICAO_VER', EXPEDICAO_VER:'EXPEDICAO',
    RELATORIOS:'RELATORIOS_VER', RELATORIOS_VER:'RELATORIOS',
    EMPRESAS:'EMPRESAS_VER', EMPRESAS_VER:'EMPRESAS',
    USUARIOS:'USUARIOS_VER', USUARIOS_VER:'USUARIOS',
    CONFIGURACOES:'CONFIGURACOES_VER', CONFIGURACOES_VER:'CONFIGURACOES'
  };

  window.bdrUsuariosExpandirPermissoes = function(lista){
    const set = new Set((lista || []).map(p => String(p || '').trim()).filter(Boolean));
    [...set].forEach(p => { if(ALIASES[p]) set.add(ALIASES[p]); });
    return [...set];
  };

  window.permissoesMarcadas = function(){
    const base = [...document.querySelectorAll('.perm:checked')].map(x => String(x.value || '').trim()).filter(Boolean);
    return window.bdrUsuariosExpandirPermissoes(base);
  };

  window.marcarPermissoes = function(permissoesTexto){
    const lista = String(permissoesTexto || '').split(',').map(x => x.trim()).filter(Boolean);
    const set = new Set(window.bdrUsuariosExpandirPermissoes(lista));
    document.querySelectorAll('.perm').forEach(c => c.checked = set.has(c.value));
    if(typeof atualizarResumo === 'function') atualizarResumo();
  };

  window.setPermissoes = function(lista){
    const set = new Set(window.bdrUsuariosExpandirPermissoes(lista || []));
    document.querySelectorAll('.perm').forEach(c => c.checked = set.has(c.value));
    if(typeof atualizarResumo === 'function') atualizarResumo();
  };

  async function updateDireto(tabela, payload, filtro){
    if(typeof bdrSalvarUpdate === 'function'){
      return await bdrSalvarUpdate(tabela, payload, filtro);
    }
    const banco = db && db();
    if(!banco) return {error:{message:'Supabase não carregado.'}};
    let q = banco.from(tabela).update(payload);
    Object.entries(filtro || {}).forEach(([k,v]) => q = q.eq(k,v));
    return await q.select();
  }

  async function insertDireto(tabela, payload){
    if(typeof bdrSalvarInsert === 'function'){
      return await bdrSalvarInsert(tabela, payload);
    }
    const banco = db && db();
    if(!banco) return {error:{message:'Supabase não carregado.'}};
    return await banco.from(tabela).insert(payload).select();
  }

  window.bdrUsuariosUpdateDireto = updateDireto;
  window.bdrUsuariosInsertDireto = insertDireto;

  window.salvarPermissoesSelecionado = async function(mostrarMsg = true){
    if(!usuarioSelecionado){
      alert('Selecione um usuário primeiro.');
      return;
    }
    if(typeof bloquearAcaoNoOwner === 'function' && bloquearAcaoNoOwner(usuarioSelecionado, 'alterar')) return;

    const payload = {
      permissoes: window.permissoesMarcadas().join(','),
      perfil: usuarioSelecionado.perfil || 'OPERADOR',
      perfil_rapido: usuarioSelecionado.perfil_rapido || null,
      updated_at: new Date().toISOString()
    };

    const resp = await updateDireto(TABELA_USUARIOS, payload, {id: usuarioSelecionado.id});
    if(resp.error){
      alert('Erro ao salvar permissões: ' + resp.error.message);
      return;
    }

    const alvo = usuarios.find(u => Number(u.id) === Number(usuarioSelecionado.id));
    if(alvo){ Object.assign(alvo, payload); }
    Object.assign(usuarioSelecionado, payload);

    // Se alterou o próprio usuário logado, atualiza o cache local para não bloquear tela depois.
    try{
      const local = usuarioLocal && usuarioLocal();
      if(local && Number(local.id) === Number(usuarioSelecionado.id)){
        const novoLocal = {...local, ...payload};
        localStorage.setItem('usuario_logado', JSON.stringify(novoLocal));
        localStorage.setItem('usuarioLogado', JSON.stringify(novoLocal));
      }
    }catch(e){ console.warn('Não atualizou localStorage do usuário logado.', e); }

    if(typeof renderizarUsuarios === 'function') renderizarUsuarios();
    if(typeof atualizarUsuarioSelecionadoCard === 'function') atualizarUsuarioSelecionadoCard();
    if(typeof atualizarResumo === 'function') atualizarResumo();

    if(mostrarMsg !== false){ alert('Permissões salvas com sucesso.'); }
  };

  window.salvarPermissoesUsuarioSelecionado = function(){
    return window.salvarPermissoesSelecionado(true);
  };
  window.salvarAlteracoesUsuarioSelecionado = window.salvarPermissoesUsuarioSelecionado;

  // Reforça o salvar usuário com fallback caso offlineQueue não esteja carregado.
  const salvarUsuarioOriginal = window.salvarUsuario;
  window.salvarUsuario = async function(){
    try{
      if(typeof salvarUsuarioOriginal === 'function') return await salvarUsuarioOriginal();
    }catch(e){
      console.warn('Salvar usuário original falhou. Tentando fallback.', e);
    }

    const id = document.getElementById('usuarioId')?.value;
    const nome = document.getElementById('formNome')?.value.trim();
    const usuario = document.getElementById('formUsuario')?.value.trim();
    const senha = document.getElementById('formSenha')?.value.trim();
    const perfil = document.getElementById('formPerfil')?.value;

    if(!nome || !usuario || !perfil){ alert('Preencha nome, usuário e perfil.'); return; }

    const payload = {
      nome, usuario, perfil,
      email: document.getElementById('formEmail')?.value.trim() || null,
      empresa_id: document.getElementById('formEmpresa')?.value ? Number(document.getElementById('formEmpresa').value) : null,
      obra_id: document.getElementById('formObra')?.value ? Number(document.getElementById('formObra').value) : null,
      foto_url: document.getElementById('formFoto')?.value.trim() || null,
      ativo: document.getElementById('formAtivo')?.value === 'true',
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
      resp = await updateDireto(TABELA_USUARIOS, payload, {id});
    }else{
      if(!senha){ alert('Informe uma senha para novo usuário.'); return; }
      payload.perfil_rapido = perfil;
      payload.permissoes = window.bdrUsuariosExpandirPermissoes(PERFIS[normalizar(perfil)] || []).join(',');
      resp = await insertDireto(TABELA_USUARIOS, [payload]);
    }

    if(resp.error){ alert('Erro ao salvar usuário: ' + resp.error.message); return; }
    if(typeof fecharModalUsuario === 'function') fecharModalUsuario();
    if(typeof carregarTudo === 'function') await carregarTudo();
    alert('Usuário salvo com sucesso!');
  };

  document.addEventListener('keydown', e => {
    if(e.key === 'Escape'){
      document.getElementById('modalUsuario')?.classList.remove('ativo');
      document.getElementById('modalPerfilRapido')?.classList.remove('ativo');
      document.getElementById('dropdownUser')?.classList.remove('ativo');
      document.getElementById('notifDropdown')?.classList.remove('ativo');
    }
  });

  document.addEventListener('click', e => {
    if(e.target?.id === 'modalUsuario' && typeof fecharModalUsuario === 'function') fecharModalUsuario();
    if(e.target?.id === 'modalPerfilRapido' && typeof fecharModalPerfilRapido === 'function') fecharModalPerfilRapido();
  });

  void 0;
})();


/* =========================================================
   ATLAS USUÁRIOS V6.0 — ESCOPO REAL, OWNER ID 1 E SEM FLASH
========================================================= */
(function(){
  'use strict';
  const NOTIF=p=>p==='RECEBER_NOTIFICACOES'||p.startsWith('NOTIF_');
  const norm=v=>Array.isArray(v)?v.map(x=>String(x).trim().toUpperCase()).filter(Boolean):String(v||'').split(/[;,|]/).map(x=>x.trim().toUpperCase()).filter(Boolean);
  const editor=()=>{try{return usuarioLocal();}catch(e){return null;}};
  const owner=()=>Number(editor()?.id)===1;
  const perms=()=>new Set(norm(editor()?.permissoes));
  const podeGerenciar=()=>owner()||perms().has('USUARIOS_PERMISSOES');
  const podeConceder=p=>owner()||perms().has(String(p||'').toUpperCase());
  const proprio=()=>usuarioSelecionado&&Number(usuarioSelecionado.id)===Number(editor()?.id);

  function mostrar(el,sim){if(!el)return;el.hidden=!sim;el.style.display=sim?'':'none';}
  function aplicar(){
    const gerencia=podeGerenciar();
    document.querySelectorAll('input.perm').forEach(c=>{
      const p=String(c.value||'').toUpperCase();
      const visivel=gerencia?podeConceder(p):(proprio()&&NOTIF(p));
      const linha=c.closest('.perm-row,.atlas-notif-opcao,.atlas-notif-modulo');
      if(linha&&!linha.matches('.atlas-notif-modulo')) linha.classList.toggle('atlas-permissao-oculta',!visivel);
      c.disabled=!visivel;
      if(!visivel)c.checked=false;
    });

    document.querySelectorAll('[data-permissao]').forEach(el=>{
      const p=String(el.dataset.permissao||'').toUpperCase();
      if(p.startsWith('USUARIOS_')) mostrar(el,owner()||perms().has(p));
    });

    if(!gerencia){
      ['.filters','.master-actions','.users-panel','.lower .panel:first-child','.lower .panel:last-child','.alert-card'].forEach(sel=>document.querySelectorAll(sel).forEach(el=>mostrar(el,false)));
      document.querySelectorAll('.board>.panel,.ops-grid').forEach(el=>{
        const temNotif=!!el.querySelector('.perm[value="RECEBER_NOTIFICACOES"],#atlasPreferenciasNotificacoes');
        if(!temNotif) mostrar(el,false);
      });
      const titulo=document.querySelector('.master-strip h2');if(titulo)titulo.textContent='Meu perfil e preferências';
      const sub=document.querySelector('.master-strip p');if(sub)sub.textContent='Ajuste somente as opções disponibilizadas para o seu usuário.';
    }
    document.documentElement.classList.remove('atlas-usuarios-carregando');
  }

  const salvarOriginal=window.salvarPermissoesSelecionado;
  window.permissoesMarcadas=function(){
    const atuais=new Set(norm(usuarioSelecionado?.permissoes));
    const novas=new Set([...document.querySelectorAll('.perm:checked')].map(c=>String(c.value).toUpperCase()).filter(p=>owner()||podeConceder(p)||(proprio()&&NOTIF(p))));
    if(!owner()) atuais.forEach(p=>{if(!podeConceder(p)&&!(proprio()&&NOTIF(p)))novas.add(p)});
    return window.bdrUsuariosExpandirPermissoes?[...new Set(window.bdrUsuariosExpandirPermissoes([...novas]))]:[...novas];
  };
  window.salvarPermissoesSelecionado=async function(mostrarMsg=true){
    if(!podeGerenciar()&&!proprio()){alert('Você não pode alterar outro usuário.');return false;}
    if(Number(usuarioSelecionado?.id)===1&&!owner()){alert('Somente o OWNER pode alterar o usuário ID 1.');return false;}
    return await salvarOriginal(mostrarMsg);
  };
  window.salvarPermissoesUsuarioSelecionado=()=>window.salvarPermissoesSelecionado(true);
  window.salvarAlteracoesUsuarioSelecionado=window.salvarPermissoesUsuarioSelecionado;

  const selecionarOriginal=window.selecionarUsuario;
  window.selecionarUsuario=function(id,opcoes={}){
    if(!podeGerenciar()&&Number(id)!==Number(editor()?.id))return false;
    const r=selecionarOriginal(id,opcoes);setTimeout(aplicar,0);return r;
  };

  const carregarOriginal=window.carregarTudo;
  window.carregarTudo=async function(){
    await carregarOriginal();
    if(!podeGerenciar()&&editor()?.id) window.selecionarUsuario(editor().id,{naoRenderizarLista:true});
    setTimeout(aplicar,80);
  };

  const obs=new MutationObserver(()=>{clearTimeout(window.__atlasPermTimer);window.__atlasPermTimer=setTimeout(aplicar,25)});
  document.addEventListener('DOMContentLoaded',()=>obs.observe(document.body,{childList:true,subtree:true}));
  window.addEventListener('load',()=>setTimeout(aplicar,100));
  window.AtlasUsuariosEscopo={aplicar,owner,podeGerenciar,podeConceder};
  void 0;
})();


/* =========================================================
   ATLAS USUÁRIOS ORGANIZAÇÃO V2.1
   Mantém todas as regras e salvamentos da V2.
   Esta camada apenas organiza a interface já autorizada.
========================================================= */
(function(){
  "use strict";

  if(window.__ATLAS_USUARIOS_ORGANIZACAO_V21__) return;
  window.__ATLAS_USUARIOS_ORGANIZACAO_V21__ = true;

  function usuarioLogadoOrganizacao(){
    try{
      return typeof usuarioLocal === "function"
        ? usuarioLocal()
        : JSON.parse(localStorage.getItem("usuario_logado") || "null");
    }catch(e){
      return null;
    }
  }

  function atualizarCabecalhoSelecionado(){
    const nome = document.getElementById("usuarioSelecionadoNome");
    const detalhe = document.getElementById("usuarioSelecionadoDetalhe");

    if(!nome || !detalhe) return;

    if(!window.usuarioSelecionado){
      nome.textContent = "Nenhum usuário selecionado";
      detalhe.textContent =
        "Selecione um usuário para aplicar um perfil rápido ou ajustar permissões.";
      return;
    }

    const u = window.usuarioSelecionado;
    const obra = (window.obras || []).find(
      item => String(item.id) === String(u.obra_id)
    );

    nome.textContent = u.nome || u.usuario || "Usuário";

    detalhe.innerHTML = [
      `Perfil: <b>${String(u.perfil_rapido || u.perfil || "-")}</b>`,
      `Obra: <b>${obra ? `${obra.codigo_obra || "-"} — ${obra.nome || "-"}` : (u.obra_nome || "-")}</b>`,
      `Status: <b>${u.ativo === false ? "Inativo" : "Ativo"}</b>`
    ].join(" &nbsp;•&nbsp; ");
  }

  function prepararPaineisRecolhiveis(){
    document.querySelectorAll(".panel").forEach((painel, indice) => {
      if(painel.dataset.atlasRecolhivel === "1") return;

      const cabecalho = painel.querySelector(
        ":scope > .panel-head, :scope > .red-head"
      );

      if(!cabecalho) return;

      painel.dataset.atlasRecolhivel = "1";

      cabecalho.addEventListener("click", evento => {
        if(evento.target.closest("button,input,label,.switch,a")) return;
        painel.classList.toggle("atlas-recolhido");
      });

      /*
       * Perfis rápidos ficam abertos.
       * Obras começam recolhidas para reduzir o tamanho da tela.
       */
      const texto = String(cabecalho.textContent || "").toUpperCase();

      if(texto.includes("OBRAS / SETORES")){
        painel.classList.add("atlas-recolhido");
      }
    });
  }

  function removerEspacosDePermissoesOcultas(){
    document.querySelectorAll(".perm").forEach(input => {
      const linha = input.closest(
        ".perm-row,.atlas-notif-opcao"
      );

      if(!linha) return;

      const invisivel =
        input.disabled &&
        !input.checked;

      /*
       * O escopo de segurança V6 já define atlas-permissao-oculta.
       * Aqui apenas garante que não sobre espaço visual.
       */
      if(linha.classList.contains("atlas-permissao-oculta")){
        linha.hidden = true;
        linha.style.display = "none";
      }else if(!invisivel){
        linha.hidden = false;
        linha.style.display = "";
      }
    });
  }

  function aplicarOrganizacao(){
    prepararPaineisRecolhiveis();
    atualizarCabecalhoSelecionado();
    removerEspacosDePermissoesOcultas();

    if(window.AtlasPreferenciasNotificacoes?.sincronizar){
      window.AtlasPreferenciasNotificacoes.sincronizar();
    }
  }

  const selecionarAnterior = window.selecionarUsuario;
  if(typeof selecionarAnterior === "function"){
    window.selecionarUsuario = function(id, opcoes={}){
      const resultado = selecionarAnterior.call(this, id, opcoes);
      setTimeout(aplicarOrganizacao, 30);
      return resultado;
    };
  }

  const carregarAnterior = window.carregarTudo;
  if(typeof carregarAnterior === "function"){
    window.carregarTudo = async function(){
      const resultado = await carregarAnterior.apply(this, arguments);
      setTimeout(aplicarOrganizacao, 80);
      return resultado;
    };
  }

  const observer = new MutationObserver(() => {
    clearTimeout(window.__atlasUsuariosOrganizacaoTimer);
    window.__atlasUsuariosOrganizacaoTimer =
      setTimeout(aplicarOrganizacao, 40);
  });

  document.addEventListener("DOMContentLoaded", () => {
    observer.observe(document.body, {
      childList:true,
      subtree:true
    });

    setTimeout(aplicarOrganizacao, 120);
  });

  window.addEventListener("load", () => {
    setTimeout(aplicarOrganizacao, 160);
  });

  window.AtlasUsuariosOrganizacao = {
    aplicar:aplicarOrganizacao
  };

  void 0;
})();


/* =========================================================
   ATLAS USUÁRIOS MÓDULOS V2.2
   - abre a redefinição de senha do usuário selecionado;
   - mantém o formulário atual e o fluxo trocar_senha = true;
   - recolhe módulos vazios;
========================================================= */
(function(){
  "use strict";

  if(window.__ATLAS_USUARIOS_MODULOS_V22__) return;
  window.__ATLAS_USUARIOS_MODULOS_V22__ = true;

  window.atlasAbrirTrocaSenhaUsuario = function(){
    if(!window.usuarioSelecionado){
      alert("Selecione um usuário primeiro.");
      return;
    }

    if(typeof window.abrirModalUsuario !== "function"){
      alert("A edição de usuário não está disponível.");
      return;
    }

    window.abrirModalUsuario(window.usuarioSelecionado.id);

    setTimeout(() => {
      const senha = document.getElementById("formSenha");
      if(senha){
        senha.value = "";
        senha.focus();
        senha.scrollIntoView({behavior:"smooth", block:"center"});
      }
    }, 120);
  };

  function ocultarModulosVazios(){
    document.querySelectorAll(".atlas-modulo-permissoes").forEach(painel => {
      const visiveis = [...painel.querySelectorAll(".perm-row")].filter(linha => {
        const style = getComputedStyle(linha);
        return !linha.hidden &&
               !linha.classList.contains("atlas-permissao-oculta") &&
               style.display !== "none";
      });

      painel.hidden = visiveis.length === 0;
    });
  }

  const observer = new MutationObserver(() => {
    clearTimeout(window.__atlasModulosVaziosTimer);
    window.__atlasModulosVaziosTimer = setTimeout(ocultarModulosVazios, 40);
  });

  document.addEventListener("DOMContentLoaded", () => {
    observer.observe(document.body, {
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:["class","hidden","style","disabled"]
    });
    setTimeout(ocultarModulosVazios, 160);
  });

  window.addEventListener("load", () => setTimeout(ocultarModulosVazios, 200));

  void 0;
})();



/* =========================================================
   ATLAS USUÁRIOS V3.1 — SELEÇÃO REAL DO FUNCIONÁRIO
   Correções:
   - editar usuário também seleciona o funcionário;
   - salvar bloqueia quando ninguém está selecionado;
   - notificações sincronizam após a seleção;
   - perfil rápido apenas preenche a tela, sem salvar sozinho.
========================================================= */
(function(){
  "use strict";

  if(window.__ATLAS_USUARIOS_SELECAO_V31__) return;
  window.__ATLAS_USUARIOS_SELECAO_V31__ = true;

  function usuarioPorId(id){
    try{
      return (typeof usuarios !== "undefined" ? usuarios : [])
        .find(u => Number(u.id) === Number(id)) || null;
    }catch(error){
      return null;
    }
  }

  function sincronizarPreferencias(){
    setTimeout(() => {
      try{
        window.AtlasPreferenciasNotificacoes?.sincronizar?.();
      }catch(error){
        console.warn(
          "Atlas Usuários: não sincronizou preferências visuais.",
          error
        );
      }
    }, 40);
  }

  /*
   * SELEÇÃO OFICIAL
   * Mantém todas as proteções já existentes e acrescenta somente
   * a sincronização visual das notificações.
   */
  const selecionarAnterior = window.selecionarUsuario;

  if(typeof selecionarAnterior === "function"){
    window.selecionarUsuario = function(id, opcoes={}){
      const resultado = selecionarAnterior(id, opcoes);

      if(resultado !== false){
        sincronizarPreferencias();

        document
          .getElementById("usuarioSelecionadoCard")
          ?.classList.add("atlas-usuario-selecionado-ok");
      }

      return resultado;
    };

    if(window.BDRUsuarios){
      window.BDRUsuarios.selecionarUsuario =
        window.selecionarUsuario;
    }
  }

  /*
   * O lápis antes abria o modal, mas não selecionava o usuário.
   * Agora seleciona primeiro e só depois abre a edição.
   */
  const abrirModalAnterior = window.abrirModalUsuario;

  if(typeof abrirModalAnterior === "function"){
    window.abrirModalUsuario = function(id){
      if(id){
        const selecionou =
          typeof window.selecionarUsuario === "function"
            ? window.selecionarUsuario(id, {
                naoRenderizarLista:false,
                rolarParaPermissoes:false,
                origem:"BOTAO_EDITAR"
              })
            : false;

        if(selecionou === false){
          return;
        }
      }

      return abrirModalAnterior(id);
    };
  }

  /*
   * Segurança do botão Salvar permissões.
   */
  const salvarAnterior =
    window.salvarPermissoesSelecionado ||
    window.salvarPermissoesUsuarioSelecionado;

  window.salvarPermissoesSelecionado =
    async function(mostrarMsg=true){

      let selecionado = null;

      try{
        selecionado =
          typeof usuarioSelecionado !== "undefined"
            ? usuarioSelecionado
            : null;
      }catch(error){}

      if(!selecionado){
        alert(
          "Selecione um funcionário na lista antes de salvar as permissões."
        );
        return false;
      }

      if(typeof salvarAnterior !== "function"){
        alert("A função de salvar permissões não foi carregada.");
        return false;
      }

      const resultado = await salvarAnterior(mostrarMsg);
      sincronizarPreferencias();
      return resultado;
    };

  window.salvarPermissoesUsuarioSelecionado = function(){
    return window.salvarPermissoesSelecionado(true);
  };

  window.salvarAlteracoesUsuarioSelecionado =
    window.salvarPermissoesUsuarioSelecionado;

  /*
   * Perfil rápido:
   * - preenche as permissões;
   * - destaca o perfil;
   * - NÃO salva automaticamente.
   */
  window.aplicarPerfilRapido = function(perfil){
    let selecionado = null;

    try{
      selecionado =
        typeof usuarioSelecionado !== "undefined"
          ? usuarioSelecionado
          : null;
    }catch(error){}

    if(!selecionado){
      alert("Selecione um funcionário primeiro.");
      return false;
    }

    const chave =
      typeof normalizar === "function"
        ? normalizar(perfil)
        : String(perfil || "").trim().toUpperCase();

    const lista =
      typeof PERFIS !== "undefined"
        ? (PERFIS[chave] || [])
        : [];

    if(!lista.length){
      alert(
        "Perfil rápido sem permissões cadastradas: " + perfil
      );
      return false;
    }

    if(typeof setPermissoes === "function"){
      setPermissoes(lista);
    }

    selecionado.perfil_rapido = perfil;

    if(typeof aplicarPerfilVisual === "function"){
      aplicarPerfilVisual(perfil);
    }

    if(typeof atualizarUsuarioSelecionadoCard === "function"){
      atualizarUsuarioSelecionadoCard();
    }

    if(typeof renderizarPerfisRapidos === "function"){
      renderizarPerfisRapidos();
    }

    sincronizarPreferencias();

    void 0;

    return true;
  };

  if(window.BDRUsuarios){
    window.BDRUsuarios.aplicarPerfilRapido =
      window.aplicarPerfilRapido;
  }

  /*
   * Botões ficam visualmente bloqueados sem funcionário selecionado.
   */
  function atualizarBotoesSelecao(){
    let temSelecionado = false;

    try{
      temSelecionado =
        !!(
          typeof usuarioSelecionado !== "undefined" &&
          usuarioSelecionado
        );
    }catch(error){}

    document
      .querySelectorAll(
        '[onclick*="salvarPermissoesUsuarioSelecionado"],' +
        '[onclick*="salvarAlteracoesUsuarioSelecionado"]'
      )
      .forEach(botao => {
        botao.disabled = !temSelecionado;
        botao.title = temSelecionado
          ? "Salvar permissões do funcionário selecionado"
          : "Selecione um funcionário primeiro";
      });
  }

  const observer = new MutationObserver(() => {
    clearTimeout(window.__atlasSelecaoBotoesTimer);
    window.__atlasSelecaoBotoesTimer =
      setTimeout(atualizarBotoesSelecao, 30);
  });

  document.addEventListener("DOMContentLoaded", () => {
    observer.observe(document.body, {
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:["class","disabled"]
    });

    setTimeout(atualizarBotoesSelecao, 150);
  });

  document.addEventListener("click", evento => {
    if(
      evento.target.closest(
        "#listaUsuarios .tr, #listaUsuarios .icon-btn"
      )
    ){
      setTimeout(atualizarBotoesSelecao, 60);
    }
  });

  void 0;
})();
