/* =========================================================
   BDR ERP - USUÁRIOS PROFISSIONAL
   Layout novo + Supabase + permissões por categoria
========================================================= */
let usuarios = [];
let empresas = [];
let obras = [];
let logsUsuario = [];
let usuarioSelecionadoId = null;
let paginaAtual = 1;
const porPagina = 8;
let acaoPendenteMaster = null;

const PERMISSOES = [
  {grupo:"Entradas", itens:[
    ["VER_ENTRADAS","Ver entradas"], ["CADASTRAR_ENTRADAS","Cadastrar entradas"], ["EDITAR_ENTRADAS","Editar entradas"], ["EXCLUIR_ENTRADAS","Excluir entradas"]
  ]},
  {grupo:"Estoque", itens:[
    ["VER_ESTOQUE_CD","Ver estoque CD"], ["VER_ESTOQUE_PROPRIA_OBRA","Ver estoque da própria obra"], ["VER_ESTOQUE_OUTRAS_OBRAS","Ver estoque de outras obras"], ["VER_EM_USO_OUTRAS_OBRAS","Ver itens em uso de outras obras"], ["VER_VALORES","Ver valores"], ["GUARDAR_ESTOQUE","Guardar estoque"], ["CONFERIR_MERCADORIA","Conferir mercadoria"], ["INVENTARIO","Inventário"], ["ENDERECAMENTO","Endereçamento"]
  ]},
  {grupo:"Pedidos", itens:[
    ["SOLICITAR_MATERIAL","Solicitar material"], ["SOLICITAR_OUTRAS_OBRAS","Solicitar de outras obras"], ["SOLICITAR_EM_USO","Solicitar itens em uso"], ["SEPARAR_PEDIDO","Separar pedido"], ["ENTREGAR_MATERIAL","Entregar material"], ["APROVAR_PEDIDO_ORIGEM","Aprovar pedido da origem"]
  ]},
  {grupo:"Patrimônio", itens:[
    ["CONSULTAR_PATRIMONIO","Consultar patrimônios"], ["VER_PATRIMONIO_OBRA","Ver patrimônio da própria obra"], ["CADASTRAR_PATRIMONIO","Cadastrar patrimônio"], ["ALTERAR_STATUS","Alterar status / movimentar"], ["AUDITORIA_PATRIMONIO","Auditoria de patrimônio"], ["BAIXAR_PATRIMONIO","Dar baixa"]
  ]},
  {grupo:"Relatórios", critico:true, itens:[
    ["RELATORIOS","Ver relatórios"], ["EXPORTAR_RELATORIOS","Exportar relatórios"], ["RELATORIOS_FINANCEIROS","Relatórios financeiros"], ["RELATORIOS_GERENCIAIS","Relatórios gerenciais"]
  ]},
  {grupo:"Administração", critico:true, itens:[
    ["USUARIOS","Gerenciar usuários"], ["EMPRESAS","Gerenciar empresas/obras"], ["CONFIGURACOES","Configurações"], ["RECEBER_NOTIFICACOES","Receber notificações"], ["VER_TODAS_OBRAS","Ver todas as obras"]
  ]}
];

function ir(pagina){ window.location.href = pagina; }
window.ir = ir;
function db(){ return window.client || window.supabaseClient || window.clientSupabase || null; }
function campo(id){ const el=document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
function usuarioLogadoAtual(){ try{ const u=localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado"); return u ? JSON.parse(u) : null; }catch(e){ return null; } }
function esc(v){ return String(v ?? "").replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function iniciais(nome){ return String(nome || "U").split(" ").filter(Boolean).slice(0,2).map(p=>p[0]).join("").toUpperCase() || "U"; }
function normalizar(txt){ return String(txt || "").toUpperCase().trim(); }
function dataBR(d){ if(!d) return "-"; const dt = new Date(String(d).replace(" ","T")); return isNaN(dt.getTime()) ? String(d) : dt.toLocaleString("pt-BR"); }
function nomeEmpresa(id){ const e=empresas.find(x=>String(x.id)===String(id)); return e ? (e.nome || "-") : "-"; }
function nomeObra(id){ const o=obras.find(x=>String(x.id)===String(id)); return o ? `${o.codigo_obra || "-"} - ${o.nome || "-"}` : "-"; }
function perfilClasse(p){ return `badge-${normalizar(p).toLowerCase()}`; }

function carregarTopo(){
  const u = usuarioLogadoAtual();
  const nome = document.getElementById("usuarioNome");
  const perfil = document.getElementById("usuarioPerfil");
  if(nome) nome.innerText = u ? "Olá, " + (u.nome || "usuário") : "Olá, usuário";
  if(perfil) perfil.innerText = u ? (u.perfil || "-") : "-";
}
function toggleMenuUsuario(event){
  if(event) event.stopPropagation();
  document.getElementById("dropdownUser")?.classList.toggle("ativo");
  document.getElementById("notifDropdown")?.classList.remove("ativo");
}
window.toggleMenuUsuario = toggleMenuUsuario;
document.addEventListener("click",()=>document.getElementById("dropdownUser")?.classList.remove("ativo"));

function validarAcesso(){
  const u = usuarioLogadoAtual();
  const perfil = normalizar(u?.perfil);
  const permissoes = String(u?.permissoes || "").toUpperCase();
  if(perfil === "MASTER" || perfil === "ADMIN" || permissoes.includes("USUARIOS")) return true;
  alert("Acesso permitido apenas para MASTER, ADMIN ou usuário com permissão USUARIOS.");
  window.location.href = "dashboard.html";
  return false;
}

function renderizarPermissoes(){
  const grid = document.getElementById("permissoesGrid");
  grid.innerHTML = PERMISSOES.map(g => `
    <div class="perm-group" data-grupo="${esc(g.grupo)}">
      <h4>${g.critico ? "🔒 " : ""}${esc(g.grupo)}</h4>
      <div class="perm-list">
        ${g.itens.map(([valor,titulo]) => `
          <label class="perm-item" data-texto="${esc((titulo + ' ' + valor).toLowerCase())}">
            <input type="checkbox" class="perm" value="${esc(valor)}" onchange="atualizarQtdPermissoes()">
            <div><strong>${esc(titulo)}</strong><span>${esc(valor)}</span></div>
          </label>
        `).join("")}
      </div>
    </div>
  `).join("");
}

function filtrarPermissoes(){
  const termo = campo("buscaPermissao").toLowerCase();
  document.querySelectorAll(".perm-item").forEach(item=>{
    item.style.display = item.dataset.texto.includes(termo) ? "flex" : "none";
  });
}
window.filtrarPermissoes = filtrarPermissoes;
function pegarPermissoes(){ return [...document.querySelectorAll(".perm:checked")].map(x=>x.value).join(","); }
function marcarPermissoes(perms){
  const lista = String(perms || "").split(",").map(p=>p.trim()).filter(Boolean);
  document.querySelectorAll(".perm").forEach(p=>p.checked = lista.includes(p.value));
  atualizarQtdPermissoes();
}
function marcarTodasPermissoes(marcar){ document.querySelectorAll(".perm").forEach(p=>p.checked = marcar); atualizarQtdPermissoes(); }
window.marcarTodasPermissoes = marcarTodasPermissoes;
function atualizarQtdPermissoes(){
  const total = document.querySelectorAll(".perm:checked").length;
  document.getElementById("qtdPermissoes").innerText = `${total} selecionada${total===1?"":"s"}`;
}
window.atualizarQtdPermissoes = atualizarQtdPermissoes;

function sugerirPermissoes(){
  const perfil = normalizar(campo("perfil"));
  const sugestoes = {
    MASTER:["VER_ESTOQUE_CD","VER_ESTOQUE_PROPRIA_OBRA","VER_ESTOQUE_OUTRAS_OBRAS","VER_EM_USO_OUTRAS_OBRAS","VER_VALORES","SOLICITAR_MATERIAL","SOLICITAR_OUTRAS_OBRAS","SOLICITAR_EM_USO","RECEBER_NOTIFICACOES","CONFERIR_MERCADORIA","GUARDAR_ESTOQUE","SEPARAR_PEDIDO","ENTREGAR_MATERIAL","APROVAR_PEDIDO_ORIGEM","CONSULTAR_PATRIMONIO","VER_PATRIMONIO_OBRA","CADASTRAR_PATRIMONIO","ALTERAR_STATUS","AUDITORIA_PATRIMONIO","BAIXAR_PATRIMONIO","EMPRESAS","RELATORIOS","EXPORTAR_RELATORIOS","RELATORIOS_GERENCIAIS","USUARIOS","CONFIGURACOES","VER_TODAS_OBRAS","INVENTARIO","ENDERECAMENTO"],
    ADMIN:["VER_ESTOQUE_CD","VER_ESTOQUE_PROPRIA_OBRA","VER_ESTOQUE_OUTRAS_OBRAS","VER_EM_USO_OUTRAS_OBRAS","VER_VALORES","SOLICITAR_MATERIAL","SOLICITAR_OUTRAS_OBRAS","RECEBER_NOTIFICACOES","CONFERIR_MERCADORIA","GUARDAR_ESTOQUE","SEPARAR_PEDIDO","ENTREGAR_MATERIAL","APROVAR_PEDIDO_ORIGEM","CONSULTAR_PATRIMONIO","VER_PATRIMONIO_OBRA","CADASTRAR_PATRIMONIO","ALTERAR_STATUS","EMPRESAS","RELATORIOS","USUARIOS","VER_TODAS_OBRAS","INVENTARIO","ENDERECAMENTO"],
    ALMOXARIFADO:["VER_ESTOQUE_CD","VER_ESTOQUE_PROPRIA_OBRA","SOLICITAR_MATERIAL","RECEBER_NOTIFICACOES","CONFERIR_MERCADORIA","GUARDAR_ESTOQUE","SEPARAR_PEDIDO","ENTREGAR_MATERIAL","APROVAR_PEDIDO_ORIGEM","CONSULTAR_PATRIMONIO","VER_PATRIMONIO_OBRA","INVENTARIO","ENDERECAMENTO"],
    OBRA:["VER_ESTOQUE_CD","VER_ESTOQUE_PROPRIA_OBRA","SOLICITAR_MATERIAL","CONSULTAR_PATRIMONIO","VER_PATRIMONIO_OBRA"],
    CONSULTA:["VER_ESTOQUE_CD","CONSULTAR_PATRIMONIO"]
  };
  marcarPermissoes((sugestoes[perfil] || []).join(","));
}
window.sugerirPermissoes = sugerirPermissoes;

async function carregarDados(){
  if(!db()){ alert("Supabase não carregado."); return; }
  if(!validarAcesso()) return;
  carregarTopo();
  renderizarPermissoes();

  const [empResp, obrasResp, userResp] = await Promise.all([
    db().from("empresas").select("*").order("nome"),
    db().from("obras").select("*").order("nome"),
    db().from("usuarios_sistema").select("*").order("nome")
  ]);

  if(userResp.error){ alert("Erro ao carregar usuários: " + userResp.error.message); return; }
  empresas = empResp.data || [];
  obras = obrasResp.data || [];
  usuarios = userResp.data || [];
  carregarSelects();
  atualizarKPIs();
  renderizarUsuarios();
  limparFormulario();
}
window.carregarDados = carregarDados;

function carregarSelects(){
  const emp = document.getElementById("empresa_id");
  emp.innerHTML = `<option value="">Empresa opcional</option>` + empresas.map(e=>`<option value="${e.id}">${esc(e.nome || "-")}</option>`).join("");
  const obra = document.getElementById("obra_id");
  obra.innerHTML = `<option value="">Obra/Setor opcional</option>` + obras.map(o=>`<option value="${o.id}">${esc(o.codigo_obra || "-")} - ${esc(o.nome || "-")}</option>`).join("");
}
function atualizarKPIs(){
  const ativos = usuarios.filter(u=>u.ativo !== false).length;
  const inativos = usuarios.filter(u=>u.ativo === false).length;
  const perfis = new Set(usuarios.map(u=>u.perfil).filter(Boolean)).size;
  const permissoes = new Set(usuarios.flatMap(u=>String(u.permissoes||"").split(",").map(p=>p.trim()).filter(Boolean))).size;
  document.getElementById("kpiAtivos").innerText = ativos;
  document.getElementById("kpiInativos").innerText = inativos;
  document.getElementById("kpiPerfis").innerText = perfis;
  document.getElementById("kpiPermissoes").innerText = permissoes;
}
function aplicarFiltroRapido(tipo){
  if(tipo === "ATIVO") document.getElementById("filtroStatus").value = "ATIVO";
  if(tipo === "INATIVO") document.getElementById("filtroStatus").value = "INATIVO";
  if(tipo === "TODOS" || tipo === "PERFIS"){ document.getElementById("filtroStatus").value=""; document.getElementById("filtroPerfil").value=""; document.getElementById("busca").value=""; }
  paginaAtual = 1; renderizarUsuarios();
}
window.aplicarFiltroRapido = aplicarFiltroRapido;
function limparFiltros(){ document.getElementById("busca").value=""; document.getElementById("filtroPerfil").value=""; document.getElementById("filtroStatus").value=""; paginaAtual=1; renderizarUsuarios(); }
window.limparFiltros = limparFiltros;

function usuariosFiltrados(){
  const busca = campo("busca").toLowerCase();
  const filtroPerfil = campo("filtroPerfil");
  const filtroStatus = campo("filtroStatus");
  return usuarios.filter(u=>{
    const status = u.ativo === false ? "INATIVO" : "ATIVO";
    const texto = `${u.nome||""} ${u.usuario||""} ${u.email||""} ${u.telefone||""} ${u.cargo||""} ${u.perfil||""} ${nomeEmpresa(u.empresa_id)} ${nomeObra(u.obra_id)}`.toLowerCase();
    return texto.includes(busca) && (!filtroPerfil || u.perfil === filtroPerfil) && (!filtroStatus || status === filtroStatus);
  });
}
function renderizarUsuarios(){
  const lista = document.getElementById("listaUsuarios");
  const dados = usuariosFiltrados();
  const totalPaginas = Math.max(1, Math.ceil(dados.length / porPagina));
  if(paginaAtual > totalPaginas) paginaAtual = totalPaginas;
  const ini = (paginaAtual - 1) * porPagina;
  const pagina = dados.slice(ini, ini + porPagina);
  document.getElementById("contadorLista").innerText = `(${dados.length})`;
  document.getElementById("textoPaginacao").innerText = dados.length ? `Mostrando ${ini+1} a ${ini+pagina.length} de ${dados.length} usuários` : "Nenhum usuário";
  if(!pagina.length){ lista.innerHTML = `<div class="empty-state">Nenhum usuário encontrado.</div>`; renderizarPaginacao(totalPaginas); return; }
  lista.innerHTML = pagina.map(u=>{
    const status = u.ativo === false ? "INATIVO" : "ATIVO";
    const selected = String(u.id) === String(usuarioSelecionadoId) ? "ativo-select" : "";
    const avatar = u.foto_url ? `<img src="${esc(u.foto_url)}" onerror="this.remove();">` : iniciais(u.nome);
    return `<div class="usuario-row ${selected}" onclick="selecionarUsuario(${u.id})">
      <div class="user-cell"><div class="user-avatar">${avatar}</div><div class="user-title"><strong>${esc(u.nome || "-")}</strong><small>${esc(u.usuario || "-")}</small></div></div>
      <div><span class="badge ${perfilClasse(u.perfil)}">${esc(u.perfil || "-")}</span></div>
      <div class="user-title"><small>${esc(u.email || "-")}</small></div>
      <div class="user-title"><small>${esc(u.telefone || "-")}</small></div>
      <div><span class="badge ${status === "ATIVO" ? "badge-ativo" : "badge-inativo"}">${status}</span></div>
      <div class="row-actions" onclick="event.stopPropagation()">
        <button class="btn btn-mini btn-blue" title="Editar usuário" onclick="selecionarUsuario(${u.id})"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-mini btn-dark" title="Permissões" onclick="selecionarUsuario(${u.id});document.getElementById('buscaPermissao').focus();"><i class="fa-solid fa-key"></i></button>
        <button class="btn btn-mini btn-gray" title="Resetar senha provisória" onclick="resetarSenhaUsuario(${u.id})"><i class="fa-solid fa-unlock-keyhole"></i></button>
        <button class="btn btn-mini ${status === "ATIVO" ? "btn-red" : "btn-green"}" title="${status === "ATIVO" ? "Inativar" : "Ativar"}" onclick="alterarStatusUsuario(${u.id})"><i class="fa-solid ${status === "ATIVO" ? "fa-ban" : "fa-check"}"></i></button>
        <button class="btn btn-mini btn-red" title="Excluir usuário com dupla confirmação" onclick="excluirUsuario(${u.id})"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
  }).join("");
  renderizarPaginacao(totalPaginas);
}
window.renderizarUsuarios = renderizarUsuarios;
function renderizarPaginacao(totalPaginas){
  const box = document.getElementById("paginacao");
  let html = `<button onclick="mudarPagina(${Math.max(1,paginaAtual-1)})">Anterior</button>`;
  for(let i=1;i<=totalPaginas;i++) html += `<button class="${i===paginaAtual?'ativo':''}" onclick="mudarPagina(${i})">${i}</button>`;
  html += `<button onclick="mudarPagina(${Math.min(totalPaginas,paginaAtual+1)})">Próximo</button>`;
  box.innerHTML = html;
}
function mudarPagina(p){ paginaAtual = p; renderizarUsuarios(); }
window.mudarPagina = mudarPagina;

async function selecionarUsuario(id){
  const u = usuarios.find(x=>Number(x.id)===Number(id));
  if(!u) return;
  usuarioSelecionadoId = u.id;
  document.getElementById("modoForm").innerText = "Editando";
  document.getElementById("usuario_id").value = u.id;
  document.getElementById("nome").value = u.nome || "";
  document.getElementById("usuario").value = u.usuario || "";
  document.getElementById("senha").value = "";
  document.getElementById("email").value = u.email || "";
  document.getElementById("telefone").value = u.telefone || "";
  document.getElementById("cargo").value = u.cargo || "";
  document.getElementById("foto_url").value = u.foto_url || "";
  document.getElementById("perfil").value = u.perfil || "";
  document.getElementById("empresa_id").value = u.empresa_id || "";
  document.getElementById("obra_id").value = u.obra_id || "";
  document.getElementById("ativo").value = String(u.ativo !== false);
  document.getElementById("updated_at").value = dataBR(u.updated_at || u.created_at);
  marcarPermissoes(u.permissoes || "");
  renderizarUsuarios();
  await carregarLogsUsuario(u.id);
}
window.selecionarUsuario = selecionarUsuario;

function novoUsuario(){ limparFormulario(); document.getElementById("nome").focus(); }
window.novoUsuario = novoUsuario;
function limparFormulario(){
  usuarioSelecionadoId = null;
  document.getElementById("modoForm").innerText = "Novo";
  ["usuario_id","nome","usuario","senha","email","telefone","cargo","foto_url","perfil","empresa_id","obra_id","updated_at"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
  document.getElementById("ativo").value = "true";
  marcarPermissoes("");
  document.getElementById("listaLogs").innerHTML = `<div class="empty-state">Selecione um usuário para ver os logs.</div>`;
  renderizarUsuarios();
}
window.limparFormulario = limparFormulario;


/* =========================================================
   PERFIL RÁPIDO
   Preenche perfil, cargo e permissões com um clique.
========================================================= */
function aplicarPerfilRapido(tipo){
  const perfil = normalizar(tipo);
  const selectPerfil = document.getElementById("perfil");
  const cargo = document.getElementById("cargo");
  const ativo = document.getElementById("ativo");

  const perfis = {
    MASTER: {
      perfil:"MASTER",
      cargo:"Administrador Master",
      permissoes:["VER_ESTOQUE_CD","VER_ESTOQUE_PROPRIA_OBRA","VER_ESTOQUE_OUTRAS_OBRAS","VER_EM_USO_OUTRAS_OBRAS","VER_VALORES","SOLICITAR_MATERIAL","SOLICITAR_OUTRAS_OBRAS","SOLICITAR_EM_USO","RECEBER_NOTIFICACOES","CONFERIR_MERCADORIA","GUARDAR_ESTOQUE","SEPARAR_PEDIDO","ENTREGAR_MATERIAL","APROVAR_PEDIDO_ORIGEM","CONSULTAR_PATRIMONIO","VER_PATRIMONIO_OBRA","CADASTRAR_PATRIMONIO","ALTERAR_STATUS","AUDITORIA_PATRIMONIO","BAIXAR_PATRIMONIO","EMPRESAS","RELATORIOS","EXPORTAR_RELATORIOS","RELATORIOS_FINANCEIROS","RELATORIOS_GERENCIAIS","USUARIOS","CONFIGURACOES","VER_TODAS_OBRAS","INVENTARIO","ENDERECAMENTO","VER_ENTRADAS","CADASTRAR_ENTRADAS","EDITAR_ENTRADAS"]
    },
    ADMIN: {
      perfil:"ADMIN",
      cargo:"Administrador",
      permissoes:["VER_ESTOQUE_CD","VER_ESTOQUE_PROPRIA_OBRA","VER_ESTOQUE_OUTRAS_OBRAS","VER_EM_USO_OUTRAS_OBRAS","VER_VALORES","SOLICITAR_MATERIAL","SOLICITAR_OUTRAS_OBRAS","RECEBER_NOTIFICACOES","CONFERIR_MERCADORIA","GUARDAR_ESTOQUE","SEPARAR_PEDIDO","ENTREGAR_MATERIAL","APROVAR_PEDIDO_ORIGEM","CONSULTAR_PATRIMONIO","VER_PATRIMONIO_OBRA","CADASTRAR_PATRIMONIO","ALTERAR_STATUS","AUDITORIA_PATRIMONIO","EMPRESAS","RELATORIOS","EXPORTAR_RELATORIOS","RELATORIOS_GERENCIAIS","USUARIOS","VER_TODAS_OBRAS","INVENTARIO","ENDERECAMENTO","VER_ENTRADAS","CADASTRAR_ENTRADAS","EDITAR_ENTRADAS"]
    },
    ALMOXARIFADO: {
      perfil:"ALMOXARIFADO",
      cargo:"Almoxarife",
      permissoes:["VER_ESTOQUE_CD","VER_ESTOQUE_PROPRIA_OBRA","SOLICITAR_MATERIAL","RECEBER_NOTIFICACOES","CONFERIR_MERCADORIA","GUARDAR_ESTOQUE","SEPARAR_PEDIDO","ENTREGAR_MATERIAL","APROVAR_PEDIDO_ORIGEM","CONSULTAR_PATRIMONIO","VER_PATRIMONIO_OBRA","INVENTARIO","ENDERECAMENTO","VER_ENTRADAS","CADASTRAR_ENTRADAS"]
    },
    OBRA: {
      perfil:"OBRA",
      cargo:"Usuário de Obra / Setor",
      permissoes:["VER_ESTOQUE_CD","VER_ESTOQUE_PROPRIA_OBRA","SOLICITAR_MATERIAL","CONSULTAR_PATRIMONIO","VER_PATRIMONIO_OBRA"]
    },
    CONSULTA: {
      perfil:"CONSULTA",
      cargo:"Consulta",
      permissoes:["VER_ESTOQUE_CD","CONSULTAR_PATRIMONIO"]
    }
  };

  const cfg = perfis[perfil];
  if(!cfg) return;

  if(selectPerfil) selectPerfil.value = cfg.perfil;
  if(cargo && !cargo.value) cargo.value = cfg.cargo;
  if(ativo) ativo.value = "true";

  marcarPermissoes(cfg.permissoes.join(","));

  const buscaPermissao = document.getElementById("buscaPermissao");
  if(buscaPermissao) buscaPermissao.value = "";
  filtrarPermissoes();

  const qtd = document.getElementById("qtdPermissoes");
  if(qtd){
    qtd.innerText = `${cfg.permissoes.length} selecionadas • perfil ${cfg.perfil}`;
  }
}
window.aplicarPerfilRapido = aplicarPerfilRapido;

async function validarSenhaMaster(senha){
  const { data, error } = await db().from("usuarios_sistema").select("id").eq("perfil","MASTER").eq("senha",senha).eq("ativo",true).limit(1);
  if(error) return false;
  return Array.isArray(data) && data.length > 0;
}
function abrirModalSenhaMaster(resumo, callback){
  acaoPendenteMaster = callback;
  document.getElementById("masterResumoAcao").innerHTML = resumo || "Alteração pendente.";
  document.getElementById("senhaMasterConfirmacao").value = "";
  document.getElementById("masterErroSenha").classList.remove("ativo");
  document.getElementById("modalSenhaMaster").classList.add("ativo");
  setTimeout(()=>document.getElementById("senhaMasterConfirmacao").focus(),100);
}
function fecharModalSenhaMaster(){ document.getElementById("modalSenhaMaster").classList.remove("ativo"); acaoPendenteMaster = null; }
window.fecharModalSenhaMaster = fecharModalSenhaMaster;
async function confirmarSenhaMaster(){
  const senha = campo("senhaMasterConfirmacao");
  const ok = await validarSenhaMaster(senha);
  if(!ok){ document.getElementById("masterErroSenha").classList.add("ativo"); return; }
  const fn = acaoPendenteMaster;
  fecharModalSenhaMaster();
  if(typeof fn === "function") await fn();
}
window.confirmarSenhaMaster = confirmarSenhaMaster;

function salvarUsuario(){
  abrirModalSenhaMaster("Salvar alterações do usuário e permissões.", salvarUsuarioConfirmado);
}
window.salvarUsuario = salvarUsuario;
async function salvarUsuarioConfirmado(){
  const id = campo("usuario_id");
  const nome = campo("nome");
  const usuario = campo("usuario");
  const perfil = campo("perfil");
  if(!nome || !usuario || !perfil){ alert("Preencha nome, usuário e perfil."); return; }
  const senha = campo("senha");
  const payload = {
    nome, usuario, perfil,
    email: campo("email") || null,
    telefone: campo("telefone") || null,
    cargo: campo("cargo") || null,
    foto_url: campo("foto_url") || null,
    empresa_id: campo("empresa_id") ? Number(campo("empresa_id")) : null,
    obra_id: campo("obra_id") ? Number(campo("obra_id")) : null,
    ativo: campo("ativo") === "true",
    permissoes: pegarPermissoes(),
    updated_at: new Date().toISOString()
  };
  if(senha) payload.senha = senha;
  let resp;
  if(id){ resp = await db().from("usuarios_sistema").update(payload).eq("id",id).select().single(); }
  else{
    if(!senha){ alert("Informe uma senha para novo usuário."); return; }
    resp = await db().from("usuarios_sistema").insert([payload]).select().single();
  }
  if(resp.error){ alert("Erro ao salvar usuário: " + resp.error.message); return; }
  await gravarLogUsuario(resp.data.id, id ? "ALTERACAO_USUARIO" : "NOVO_USUARIO", `Usuário ${id ? "atualizado" : "criado"}: ${nome}`);
  atualizarLocalStorageSeForUsuarioAtual(resp.data);
  alert("Usuário salvo com sucesso!");
  await carregarDados();
  selecionarUsuario(resp.data.id);
}
async function alterarStatusUsuario(id){
  const u = usuarios.find(x=>Number(x.id)===Number(id));
  if(!u) return;
  abrirModalSenhaMaster(`${u.ativo === false ? "Ativar" : "Inativar"} o usuário <b>${esc(u.nome)}</b>.`, async()=>{
    const novo = !(u.ativo !== false);
    const { error } = await db().from("usuarios_sistema").update({ativo:novo,updated_at:new Date().toISOString()}).eq("id",id);
    if(error){ alert(error.message); return; }
    await gravarLogUsuario(id, novo ? "ATIVAR_USUARIO" : "INATIVAR_USUARIO", `${novo ? "Ativou" : "Inativou"} usuário ${u.nome}`);
    await carregarDados();
  });
}
window.alterarStatusUsuario = alterarStatusUsuario;


/* =========================================================
   SEGURANÇA - RESET DE SENHA E EXCLUSÃO DEFINITIVA
   - Reset: MASTER/ADMIN define senha provisória e usuário troca no próximo acesso.
   - Excluir: dupla confirmação + senha MASTER.
========================================================= */
async function resetarSenhaUsuario(id){
  const u = usuarios.find(x => Number(x.id) === Number(id));
  if(!u){ alert("Usuário não encontrado."); return; }

  const atual = usuarioLogadoAtual();
  const perfilAtual = normalizar(atual?.perfil);
  if(!["MASTER","ADMIN"].includes(perfilAtual)){
    alert("Apenas MASTER ou ADMIN pode resetar senha.");
    return;
  }

  const senha1 = prompt(`Digite a SENHA PROVISÓRIA para ${u.nome || u.usuario}:`);
  if(!senha1) return;
  if(String(senha1).trim().length < 4){
    alert("Use uma senha provisória com pelo menos 4 caracteres.");
    return;
  }

  const senha2 = prompt("Confirme a senha provisória:");
  if(String(senha1).trim() !== String(senha2 || "").trim()){
    alert("As senhas não conferem.");
    return;
  }

  abrirModalSenhaMaster(
    `Resetar a senha de <b>${esc(u.nome || u.usuario)}</b> e obrigar troca no próximo acesso.`,
    async()=>{
      const { error } = await db()
        .from("usuarios_sistema")
        .update({
          senha: String(senha1).trim(),
          senha_provisoria: true,
          trocar_senha: true,
          data_reset_senha: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ativo: true
        })
        .eq("id", id);

      if(error){ alert("Erro ao resetar senha: " + error.message); return; }
      await gravarLogUsuario(id, "RESET_SENHA", `Senha provisória criada para ${u.nome || u.usuario}`);
      alert("Senha provisória definida. No próximo acesso o usuário será obrigado a criar uma nova senha.");
      await carregarDados();
    }
  );
}
window.resetarSenhaUsuario = resetarSenhaUsuario;

async function excluirUsuario(id){
  const u = usuarios.find(x => Number(x.id) === Number(id));
  if(!u){ alert("Usuário não encontrado."); return; }

  const atual = usuarioLogadoAtual();
  if(String(atual?.id) === String(id)){
    alert("Você não pode excluir o usuário que está logado agora.");
    return;
  }

  const perfilAtual = normalizar(atual?.perfil);
  if(perfilAtual !== "MASTER"){
    alert("Exclusão definitiva é permitida apenas para MASTER.");
    return;
  }

  const ok1 = confirm(`ATENÇÃO: você vai EXCLUIR definitivamente o usuário:\n\n${u.nome || "-"} (${u.usuario || "-"})\n\nConfirma a primeira etapa?`);
  if(!ok1) return;

  const digitado = prompt(`Confirmação final: digite o USUÁRIO exatamente como está cadastrado:\n\n${u.usuario || ""}`);
  if(String(digitado || "").trim() !== String(u.usuario || "").trim()){
    alert("Confirmação incorreta. Exclusão cancelada.");
    return;
  }

  abrirModalSenhaMaster(
    `Excluir definitivamente o usuário <b>${esc(u.nome || u.usuario)}</b>. Esta ação não poderá ser desfeita.`,
    async()=>{
      await gravarLogUsuario(id, "EXCLUIR_USUARIO", `Usuário excluído: ${u.nome || u.usuario}`);
      const { error } = await db().from("usuarios_sistema").delete().eq("id", id);
      if(error){ alert("Erro ao excluir usuário: " + error.message); return; }
      alert("Usuário excluído com sucesso.");
      if(String(usuarioSelecionadoId) === String(id)) usuarioSelecionadoId = null;
      await carregarDados();
    }
  );
}
window.excluirUsuario = excluirUsuario;

async function gravarLogUsuario(usuarioId, acao, descricao){
  try{
    const atual = usuarioLogadoAtual();
    await db().from("usuarios_logs").insert([{usuario_id:usuarioId,acao,descricao,responsavel:atual?.nome || "SISTEMA",criado_em:new Date().toISOString()}]);
  }catch(e){ /* tabela opcional */ }
}
async function carregarLogsUsuario(usuarioId){
  const box = document.getElementById("listaLogs");
  try{
    const { data, error } = await db().from("usuarios_logs").select("*").eq("usuario_id",usuarioId).order("id",{ascending:false}).limit(6);
    if(error) throw error;
    const logs = data || [];
    if(!logs.length){ box.innerHTML = `<div class="empty-state">Nenhum log registrado para este usuário.</div>`; return; }
    box.innerHTML = `<div class="log-row"><div>Data/Hora</div><div>Usuário</div><div>Ação realizada</div><div>Responsável</div></div>` + logs.map(l=>`<div class="log-row"><div>${dataBR(l.criado_em)}</div><div>${esc(usuarioSelecionadoId || "-")}</div><div>${esc(l.descricao || l.acao || "-")}</div><div>${esc(l.responsavel || "-")}</div></div>`).join("");
  }catch(e){
    box.innerHTML = `<div class="empty-state">Logs ainda não configurados. A tela funciona normalmente sem eles.</div>`;
  }
}
function atualizarLocalStorageSeForUsuarioAtual(user){
  try{
    const atual = usuarioLogadoAtual();
    if(atual && String(atual.id) === String(user.id)){
      const novo = {...atual,...user};
      localStorage.setItem("usuario_logado", JSON.stringify(novo));
      localStorage.setItem("usuarioLogado", JSON.stringify(novo));
    }
  }catch(e){}
}
function exportarUsuarios(){
  const linhas = [["id","nome","usuario","email","perfil","ativo","empresa","obra"]];
  usuariosFiltrados().forEach(u=>linhas.push([u.id,u.nome,u.usuario,u.email,u.perfil,u.ativo !== false ? "ATIVO":"INATIVO",nomeEmpresa(u.empresa_id),nomeObra(u.obra_id)]));
  const csv = linhas.map(l=>l.map(c=>`"${String(c||"").replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "usuarios_bdr.csv"; a.click();
}
window.exportarUsuarios = exportarUsuarios;

document.addEventListener("DOMContentLoaded", carregarDados);

// Atalho global para fechar modais com ESC // 
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