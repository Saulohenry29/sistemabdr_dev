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
  "VER_ESTOQUE_CD",
  "VER_ESTOQUE_PROPRIA_OBRA",
  "VER_ESTOQUE_OUTRAS_OBRAS",
  "VER_EM_USO_OUTRAS_OBRAS",
  "VER_VALORES"
];

const P_SOL = [
  "SOLICITAR_MATERIAL",
  "SOLICITAR_OUTRAS_OBRAS",
  "SOLICITAR_EM_USO",
  "SOLICITAR_TRANSFERENCIA",
  "RECEBER_NOTIFICACOES"
];

const P_OP = [
  "CONFERIR_MERCADORIA",
  "SEPARAR_PEDIDO",
  "ENTREGAR_MATERIAL",
  "APROVAR_PEDIDO_ORIGEM",
  "USUARIOS",
  "CONFIGURACOES"
];


/* =========================================================
   3) PERFIS RÁPIDOS
========================================================= */

const PERFIS = {
  MASTER: [
    ...P_VIS,
    ...P_SOL,
    ...P_OP,
    "RELATORIOS",
    "EMPRESAS",
    "VER_TODAS_OBRAS",
    "CADASTRAR_PATRIMONIO",
    "ALTERAR_STATUS",
    "RECEBER_NOTIFICACOES_GESTAO"
  ],

  GESTOR: [
    "VER_ESTOQUE_CD",
    "VER_ESTOQUE_PROPRIA_OBRA",
    "VER_ESTOQUE_OUTRAS_OBRAS",
    "SOLICITAR_MATERIAL",
    "SOLICITAR_OUTRAS_OBRAS",
    "RECEBER_NOTIFICACOES",
    "CONFERIR_MERCADORIA",
    "SEPARAR_PEDIDO",
    "ENTREGAR_MATERIAL",
    "APROVAR_PEDIDO_ORIGEM",
    "RELATORIOS"
  ],

  ALMOXARIFE: [
    "VER_ESTOQUE_CD",
    "VER_ESTOQUE_PROPRIA_OBRA",
    "SOLICITAR_MATERIAL",
    "RECEBER_NOTIFICACOES",
    "CONFERIR_MERCADORIA",
    "SEPARAR_PEDIDO",
    "ENTREGAR_MATERIAL"
  ],

  ALMOXARIFADO: [
    "VER_ESTOQUE_CD",
    "VER_ESTOQUE_PROPRIA_OBRA",
    "SOLICITAR_MATERIAL",
    "RECEBER_NOTIFICACOES",
    "CONFERIR_MERCADORIA",
    "SEPARAR_PEDIDO",
    "ENTREGAR_MATERIAL"
  ],

  OPERADOR: [
    "VER_ESTOQUE_PROPRIA_OBRA",
    "SOLICITAR_MATERIAL",
    "RECEBER_NOTIFICACOES"
  ],

  ADMIN: [
    ...P_VIS,
    ...P_SOL,
    ...P_OP,
    "RELATORIOS",
    "EMPRESAS"
  ],

  OBRA: [
    "VER_ESTOQUE_CD",
    "VER_ESTOQUE_PROPRIA_OBRA",
    "SOLICITAR_MATERIAL",
    "RECEBER_NOTIFICACOES"
  ],

  CONSULTA: [
    "VER_ESTOQUE_CD",
    "VER_ESTOQUE_PROPRIA_OBRA"
  ]
};


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
  renderizarUsuarios();
  renderizarObrasLiberadas();

  if(usuarios.length && !usuarioSelecionado){
    selecionarUsuario(usuarios[0].id);
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

  const foto = u.foto_url
    ? `<img src="${esc(u.foto_url)}" onerror="this.remove()">`
    : iniciais(u.nome);

  return `
    <div class="tr" onclick="selecionarUsuario(${u.id})">
      <div class="user-cell">
        <div class="user-avatar" style="background:#d71920">${foto}</div>
        <div>
          <b>${esc(u.nome || "-")}</b>
          <span>${esc(u.email || u.usuario || "-")}</span>
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


/* =========================================================
   11) SELECIONAR USUÁRIO
========================================================= */

function selecionarUsuario(id){
  usuarioSelecionado = usuarios.find(u => Number(u.id) === Number(id));

  if(!usuarioSelecionado) return;

  marcarPermissoes(usuarioSelecionado.permissoes || "");
  aplicarPerfilVisual(usuarioSelecionado.perfil || "");
  renderizarObrasLiberadas();
  atualizarResumo();
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
      ${linhaAcesso("CD", p.includes("VER_ESTOQUE_CD"))}
      ${linhaAcesso("Obra própria", p.includes("VER_ESTOQUE_PROPRIA_OBRA"))}
      ${linhaAcesso("Outras obras", p.includes("VER_ESTOQUE_OUTRAS_OBRAS"))}
      ${linhaAcesso("Itens em uso", p.includes("VER_EM_USO_OUTRAS_OBRAS"))}
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
  const p = normalizar(perfil);
  const lista = PERFIS[p] || [];

  setPermissoes(lista);
  aplicarPerfilVisual(p);

  if(usuarioSelecionado){
    usuarioSelecionado.perfil = p === "ALMOXARIFE" ? "ALMOXARIFE" : p;
    salvarPermissoesSelecionado(true);
  }
}
window.aplicarPerfilRapido = aplicarPerfilRapido;

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
    "VER_ESTOQUE_CD",
    "SOLICITAR_MATERIAL",
    "RECEBER_NOTIFICACOES"
  ]);

  salvarPermissoesSelecionado(true);
}
window.aplicarSomenteCD = aplicarSomenteCD;

function aplicarPropriaObra(){
  setPermissoes([
    "VER_ESTOQUE_PROPRIA_OBRA",
    "SOLICITAR_MATERIAL",
    "RECEBER_NOTIFICACOES"
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

  const payload = {
    permissoes: permissoesMarcadas().join(","),
    perfil: usuarioSelecionado.perfil || "OPERADOR",
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
