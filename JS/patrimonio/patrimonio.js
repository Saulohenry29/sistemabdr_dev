/*
  ATLAS / BDR — PATRIMÔNIO V2 OFICIAL
  Regra de negócio preservada da versão atual.
  Fluxo de etiqueta consolidado e protegido contra impressão antecipada.
*/
let obras = [];
let patrimonios = [];
let bdrPatrimonioPaginaAtual = 1;
const bdrPatrimonioPorPagina = 30;
let bdrPatrimonioUltimaChaveFiltro = "";
let patrimonioSelecionado = null;
const bdrEtiquetasSelecionadas = new Set();
let bdrModoSelecaoEtiquetas = false;
let manutencoesPatrimonio = [];
let statusDestinoDepoisManutencao = null;
let atlasMostrarInativos = false;
window.obraAtiva = null;
window.obraTravada = false;



function bdrCampoTextoLivre(el){
  if(!el) return false;

  const id = String(el.id || "").toLowerCase();
  const type = String(el.type || "").toLowerCase();

  if(el.tagName === "TEXTAREA") return true;

  if(el.tagName === "INPUT"){
    if(type && !["text", "search", "tel", "email", "url", ""].includes(type)) return false;
    if(id.includes("valor")) return false;
    return true;
  }

  return false;
}

function bdrMaiusculoSemMoverCursor(el){
  if(!bdrCampoTextoLivre(el)) return;

  const inicio = el.selectionStart;
  const fim = el.selectionEnd;
  const antigo = el.value || "";
  const novo = antigo.toUpperCase();

  if(antigo === novo) return;

  el.value = novo;

  try{
    if(document.activeElement === el && typeof inicio === "number" && typeof fim === "number"){
      el.setSelectionRange(inicio, fim);
    }
  }catch(e){}
}

document.addEventListener("change", function(e){
  if(e && e.target && e.target.matches("input, textarea")){
    bdrMaiusculoSemMoverCursor(e.target);
  }
}, true);

document.addEventListener("blur", function(e){
  if(e && e.target && e.target.matches("input, textarea")){
    bdrMaiusculoSemMoverCursor(e.target);
  }
}, true);

function ir(pagina){
  window.location.href = pagina;
}

function db(){
  return window.client || window.supabaseClient || null;
}

function patrimonioErroInternet(err){
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("failed to fetch") ||
         msg.includes("internet_disconnected") ||
         msg.includes("networkerror") ||
         msg.includes("err_internet") ||
         msg.includes("err_name_not_resolved");
}

let BDR_PATRIMONIO_ONLINE_REAL = null;
window.BDR_PATRIMONIO_ONLINE_REAL = null;

async function patrimonioOnlineReal(){
  /*
    REGRA OFICIAL:
    usa o teste global do bdrCore.js.
    Se o Supabase falhar, é OFFLINE para esta tela.
  */
  if(typeof window.bdrOnlineReal === "function"){
    const ok = await window.bdrOnlineReal();
    BDR_PATRIMONIO_ONLINE_REAL = ok;
    window.BDR_PATRIMONIO_ONLINE_REAL = ok;
    return ok;
  }

  if(navigator.onLine === false || !db()){
    BDR_PATRIMONIO_ONLINE_REAL = false;
    window.BDR_PATRIMONIO_ONLINE_REAL = false;
    return false;
  }

  BDR_PATRIMONIO_ONLINE_REAL = true;
  window.BDR_PATRIMONIO_ONLINE_REAL = true;
  return true;
}

function patrimonioOffline(){
  return BDR_PATRIMONIO_ONLINE_REAL === false ||
         navigator.onLine === false ||
         !db();
}

function mostrarAvisoModoOffline(){
  const topo = document.getElementById("obraAtivaTexto");
  if(!topo) return;

  if(window.obraTravada && window.obraAtiva){
    topo.innerText = (BDR_PATRIMONIO_ONLINE_REAL === false ? "📴 OFFLINE / " : "") +
      "🔒 TRAVADO: " + (window.obraAtiva.codigo_obra || "-") + " - " + (window.obraAtiva.nome || "-");
  }else if(BDR_PATRIMONIO_ONLINE_REAL === false){
    topo.innerText = "📴 MODO OFFLINE - usando cache local";
  }else{
    topo.innerText = "🔓 Lançamento livre";
  }
}

async function salvarOperacaoPatrimonioOffline(tipo, tabela, dados, opcoes={}){
  if(typeof salvarOffline !== "function"){
    alert("offlineQueue.js não carregou. Não foi possível salvar offline.");
    return false;
  }

  await salvarOffline(tipo, tabela, dados, {
    origem:"patrimonio.html",
    ...opcoes
  });

  return true;
}


async function bdrSalvarPrimeiroNoTablet(tabela, payload, meta={}){
  /*
    REGRA NOVA:
    - Com internet real: grava direto no Supabase.
    - Sem internet: grava na fila/local para sincronizar depois.

    Antes esta função sempre usava BDRSync.criar quando ele existia,
    mesmo online. Por isso o patrimônio ficava como pendente/fila.
  */

  const onlineReal = await patrimonioOnlineReal();

  if(onlineReal && db()){
    const { data, error } = await db()
      .from(tabela)
      .insert([payload])
      .select();

    return {
      offlineFirst:false,
      sincronizado:true,
      data:data || null,
      error
    };
  }

  if(window.BDRSync?.criar){
    await window.BDRSync.criar(tabela, payload, {
      origem:"patrimonio.html",
      ...meta
    });
    return { offlineFirst:true, sincronizado:false, error:null };
  }

  await salvarOperacaoPatrimonioOffline("insert", tabela, [payload], meta);
  return { offlineFirst:true, sincronizado:false, error:null };
}

async function bdrAtualizarPrimeiroNoTablet(tabela, match, payload, meta={}){
  const onlineReal = await patrimonioOnlineReal();

  if(onlineReal && db()){
    let query = db().from(tabela).update(payload);

    Object.entries(match || {}).forEach(([campo, valor]) => {
      query = query.eq(campo, valor);
    });

    const { data, error } = await query.select();

    return {
      offlineFirst:false,
      sincronizado:true,
      data:data || null,
      error
    };
  }

  if(window.BDRSync?.atualizar){
    await window.BDRSync.atualizar(tabela, match, payload, {
      origem:"patrimonio.html",
      ...meta
    });
    return { offlineFirst:true, sincronizado:false, error:null };
  }

  await salvarOperacaoPatrimonioOffline("update", tabela, payload, {
    filtro:match,
    ...meta
  });

  return { offlineFirst:true, sincronizado:false, error:null };
}

/*
 * Mostra uma confirmação interna do Atlas.
 *
 * tipo = "sucesso" -> mensagem verde
 * tipo = "offline" -> mensagem laranja
 *
 * Não bloqueia a tela e não exige clicar em OK.
 */
function atlasAvisoPatrimonio(titulo, texto, tipo="sucesso"){
  // Dentro da shell, o aviso pertence ao topo global do Atlas.
  // Assim ele continua visível independentemente da rolagem do módulo/iframe.
  if(window.self !== window.top && typeof window.bdrAvisoAtlas === "function"){
    const tipoShell = tipo === "offline" ? "warning" : tipo === "info" ? "info" : "success";
    return window.bdrAvisoAtlas(String(texto || titulo || ""), String(titulo || "Atlas Patrimônio"), tipoShell, 4200);
  }

  let aviso = document.getElementById("atlasPatrimonioToast");

  if(!aviso){
    aviso = document.createElement("div");
    aviso.id = "atlasPatrimonioToast";
    aviso.className = "atlas-patrimonio-toast";
    aviso.setAttribute("role","status");
    aviso.setAttribute("aria-live","polite");
    document.body.appendChild(aviso);
  }

  aviso.className =
    "atlas-patrimonio-toast" +
    (tipo === "offline" ? " offline" : tipo === "info" ? " info" : "");

  aviso.innerHTML =
    `<span class="atlas-toast-titulo">${String(titulo || "Concluído")}</span>` +
    `<span class="atlas-toast-texto">${String(texto || "")}</span>`;

  aviso.classList.add("ativo");

  clearTimeout(window.__atlasPatrimonioToastTimer);
  window.__atlasPatrimonioToastTimer = setTimeout(()=>{
    aviso.classList.remove("ativo");
  },4200);
}

/*
 * Mantém compatibilidade com o fluxo offline antigo,
 * mas agora usando a mensagem visual do Atlas.
 */
function bdrAvisoSalvoTablet(texto="Salvo no tablet. Está pendente de sincronização. Pode continuar trabalhando."){
  atlasAvisoPatrimonio(
    "📦 Patrimônio salvo offline",
    texto,
    "offline"
  );
}

function usuarioAtual(){
  try{
    const u = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
    return u ? JSON.parse(u) : null;
  }catch(_){
    return null;
  }
}

function carregarUsuarioTopo(){
  const usuario = usuarioAtual();
  const nome = document.getElementById("usuarioNome");
  const perfil = document.getElementById("usuarioPerfil");
  if(nome) nome.innerText = usuario ? "Olá, " + (usuario.nome || "usuário") : "Olá, usuário";
  if(perfil) perfil.innerText = usuario ? (usuario.perfil || "-") : "-";
}

function fecharMenusTopo(){
  document.getElementById("dropdownUser")?.classList.remove("ativo");
}
document.addEventListener("click", fecharMenusTopo);

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

function usuarioTemPermissao(permissao){
  const u = usuarioAtual();
  if(!u) return false;

  if(window.BDRMenuPermissoes && typeof window.BDRMenuPermissoes.temPermissao === "function"){
    return window.BDRMenuPermissoes.temPermissao(permissao, u);
  }

  if(usuarioOwnerBDR(u)) return true;

  const p = String(permissao || "").toUpperCase();
  const ps = permissoesUsuarioBDR(u);

  const aliases = {
    "PATRIMONIO":"PATRIMONIO_VER",
    "DASHBOARD":"DASHBOARD_VER",
    "RELATORIOS":"RELATORIOS_VER",
    "EMPRESAS":"EMPRESAS_VER",
    "USUARIOS":"USUARIOS_VER",
    "VER_VALORES":"VALORES_VER",
    "VER_TODAS_OBRAS":"TODAS_OBRAS_VER",
    "VER_ESTOQUE_PROPRIA_OBRA":"PROPRIA_OBRA_VER",
    "CADASTRAR_PATRIMONIO":"PATRIMONIO_CRIAR",
    "EDITAR_PATRIMONIO":"PATRIMONIO_EDITAR",
    "ALTERAR_STATUS":"PATRIMONIO_MOVIMENTAR",
    "MOVIMENTAR_PATRIMONIO":"PATRIMONIO_MOVIMENTAR",
    "PATRIMONIO_MOVER":"PATRIMONIO_MOVIMENTAR",
    "VER_PATRIMONIOS_INATIVOS":"PATRIMONIO_INATIVOS_VER"
  };

  if(ps.includes(p)) return true;
  if(aliases[p] && ps.includes(aliases[p])) return true;

  const legado = Object.entries(aliases).find(([,novo]) => novo === p)?.[0];
  if(legado && ps.includes(legado)) return true;

  return false;
}

function usuarioEhGestao(){
  return usuarioTemPermissao("USUARIOS") || usuarioTemPermissao("EMPRESAS");
}

function usuarioPodeVerTodasObras(){
  // Somente o OWNER possui escopo global real no Patrimônio.
  return usuarioOwnerBDR(usuarioAtual());
}

function idsObrasAtuacaoUsuarioBDR(){
  const u=usuarioAtual();
  if(!u) return [];
  const ids=new Set();
  if(u.obra_id!=null && String(u.obra_id).trim()) ids.add(String(u.obra_id).trim());
  String(u.obras_liberadas||"").split(/[;,|]/).map(x=>x.trim()).filter(Boolean).forEach(id=>ids.add(String(id)));
  return [...ids];
}

function usuarioPodeLancarQualquerObra(){
  const u=usuarioAtual();
  if(!u || !usuarioTemPermissao("PATRIMONIO_CRIAR")) return false;
  if(usuarioOwnerBDR(u)) return true;
  return idsObrasAtuacaoUsuarioBDR().length > 1;
}

function obraVinculadaUsuarioBDR(){
  const u=usuarioAtual();
  if(!u) return null;
  const ids=idsObrasAtuacaoUsuarioBDR();
  if(ids.length!==1) return null;
  return (obras||[]).find(o=>String(o.id)===String(ids[0]))||null;
}

function aplicarRegraObraLancamentoBDR(){
  const select = document.getElementById("obraSelect");
  const btn = document.getElementById("btnTravarObra");
  const u = usuarioAtual();

  if(!select || !u) return;

  if(usuarioPodeLancarQualquerObra()){
    select.disabled = false;
    if(btn) btn.disabled = false;
    return;
  }

  const obraUsuario = obraVinculadaUsuarioBDR();

  if(!obraUsuario){
    select.value = "";
    select.disabled = true;
    if(btn){
      btn.disabled = true;
      btn.className = "lock-btn lock-off";
      btn.innerText = "⚠️ Sem obra";
    }
    window.obraAtiva = null;
    window.obraTravada = false;
    return;
  }

  window.obraAtiva = obraUsuario;
  window.obraTravada = true;
  select.value = String(obraUsuario.id);
  select.disabled = true;
  atlasSincronizarCampoObra();

  if(btn){
    btn.disabled = true;
    btn.className = "lock-btn lock-on";
    btn.innerText = "🔒 Travado";
  }

  mostrarAvisoModoOffline();
  setTimeout(atlasCompactarObraPatrimonio,0);
}

function bloquearPatrimonioSemPermissaoBDR(){
  if(usuarioTemPermissao("PATRIMONIO_VER")) return true;
  alert("Você não tem permissão para acessar Patrimônio.");
  window.location.href = "dashboard.html";
  return false;
}

function aplicarMenuPorPermissaoBDR(){
  if(typeof window.bdrAplicarMenuEstavelSemPiscar === "function"){
    window.bdrAplicarMenuEstavelSemPiscar();
    return;
  }

  document.querySelectorAll(".bdr-menu .bdr-menu-btn").forEach(el => {
    const permissao = el.getAttribute("data-permissao");
    el.hidden = !usuarioTemPermissao(permissao);
    el.style.display = usuarioTemPermissao(permissao) ? "" : "none";
  });
}

function valor(id){
  const el = document.getElementById(id);
  if(!el) return "";
  return String(el.value || "").trim();
}

function moedaParaNumero(valorTexto){
  if(!valorTexto) return null;

  return Number(
    valorTexto
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^\d.]/g, "")
  ) || null;
}



function bdrCodigoObraLimpo(codigo){
  return String(codigo || "")
    .trim()
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase();
}

function bdrMontarCodigoPatrimonio(codigoObra, sequencial){
  const cod = bdrCodigoObraLimpo(codigoObra);

  if(!cod){
    throw new Error("Código da obra/setor não informado.");
  }

  return "PAT-" + cod + String(Number(sequencial || 1)).padStart(4, "0");
}

function bdrExtrairSequencialPatrimonio(codigo_qr, codigoObra){
  const prefixo = "PAT-" + bdrCodigoObraLimpo(codigoObra);
  const codigo = String(codigo_qr || "");

  if(!codigo.startsWith(prefixo)) return 0;

  const final = codigo.replace(prefixo, "").replace(/\D/g, "");
  return Number(final) || 0;
}

async function bdrProximoSequencialObra(obra){
  const codigoObra = bdrCodigoObraLimpo(obra?.codigo_obra);

  if(!codigoObra){
    throw new Error("A obra/setor selecionada não tem código cadastrado.");
  }

  const prefixoCodigo = "PAT-" + codigoObra;
  let maior = 0;

  const onlineReal = await patrimonioOnlineReal();

  if(onlineReal){
    const { data, error } = await db()
      .from("patrimonio")
      .select("codigo_qr")
      .like("codigo_qr", prefixoCodigo + "%")
      .order("id", { ascending:false })
      .limit(500);

    if(error) throw error;

    (data || []).forEach(p => {
      const seq = bdrExtrairSequencialPatrimonio(p.codigo_qr, codigoObra);
      if(seq > maior) maior = seq;
    });
  }else{
    const cachePat = await BDROfflineDB.lerTabela("patrimonio") || [];
    const locais = patrimonios || [];
    const todos = [...cachePat, ...locais];

    todos.forEach(p => {
      const seq = bdrExtrairSequencialPatrimonio(p.codigo_qr, codigoObra);
      if(seq > maior) maior = seq;
    });
  }

  return maior + 1;
}


function bdrValorPatrimonioValido(){
  const valorNumero = moedaParaNumero(valor("valor_bem"));
  return Number.isFinite(Number(valorNumero)) && Number(valorNumero) > 0;
}

function bdrSetGerandoPatrimonio(gerando){
  const btn = document.getElementById("btnGerarPatrimonio");
  if(!btn) return;
  btn.disabled = !!gerando;
  btn.style.opacity = gerando ? "0.65" : "";
  btn.style.cursor = gerando ? "not-allowed" : "";
  btn.innerText = gerando ? "Salvando patrimônio..." : "Gerar Patrimônio";
}

function preencherFiltroObraPatrimonio(){
  const filtro = document.getElementById("filtroObra");
  if(!filtro) return;

  const valorAtual = filtro.value;
  filtro.innerHTML = `<option value="">Todas as obras/setores</option>`;

  (obras || []).forEach(o => {
    const texto = `${o.codigo_obra || "-"} - ${o.nome || "-"}`;
    filtro.innerHTML += `<option value="${o.id}">${texto}</option>`;
  });

  const usuario = usuarioAtual();
  if(usuario && !usuarioPodeVerTodasObras() && usuario.obra_id){
    filtro.value = usuario.obra_id;
    filtro.disabled = true;
    return;
  }

  if(valorAtual && [...filtro.options].some(op => op.value === valorAtual)){
    filtro.value = valorAtual;
  }
}

function formatarMoeda(valor){
  if(valor === null || valor === undefined || valor === ""){
    return "R$ 0,00";
  }

  return Number(valor).toLocaleString("pt-BR", {
    style:"currency",
    currency:"BRL"
  });
}

function mascaraMoeda(input){
  if(!input) return;

  const valorAntes = String(input.value || "");
  const inicioSelecao = Number.isInteger(input.selectionStart)
    ? input.selectionStart
    : valorAntes.length;

  // Quantos algarismos existiam à direita do cursor antes de formatar.
  // Isso permite editar no meio do valor sem jogar o cursor para o final.
  const digitosDireita = (valorAntes.slice(inicioSelecao).match(/\d/g) || []).length;
  const digitos = valorAntes.replace(/\D/g, "");

  if(!digitos){
    input.value = "";
    return;
  }

  const centavos = Number(digitos);
  const formatado = (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits:2,
    maximumFractionDigits:2,
    useGrouping:true
  });

  input.value = formatado;

  // Restaura a posição lógica do cursor contando os algarismos da direita.
  let novaPosicao = formatado.length;
  let encontrados = 0;

  while(novaPosicao > 0 && encontrados < digitosDireita){
    novaPosicao--;
    if(/\d/.test(formatado[novaPosicao])) encontrados++;
  }

  try{
    input.setSelectionRange(novaPosicao, novaPosicao);
  }catch(_){}
}



let atlasObraIndice = -1;
let atlasObraResultados = [];
let atlasObraComboIniciado = false;

function atlasNormalizarBuscaObra(valor){
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function atlasTextoObra(obra){
  return `${obra?.codigo_obra || "-"} - ${obra?.nome || "-"}`;
}

function atlasObraSelecionadaAtual(){
  const select = document.getElementById("obraSelect");
  if(!select?.value) return null;
  return (obras || []).find(o => String(o.id) === String(select.value)) || null;
}

function atlasFecharSugestoesObra(){
  document.getElementById("obraSugestoes")?.classList.remove("ativo");
  atlasObraIndice = -1;
}

function atlasSincronizarCampoObra(){
  const select = document.getElementById("obraSelect");
  const input = document.getElementById("obraBusca");
  const seta = document.getElementById("obraComboSeta");

  if(!select || !input) return;

  const obra = atlasObraSelecionadaAtual();
  input.value = obra ? atlasTextoObra(obra) : "";

  const bloqueado = Boolean(select.disabled);
  input.disabled = bloqueado;
  if(seta) seta.disabled = bloqueado;
}

function atlasFiltrarObras(termo, abrirTudo = false){
  const normalizado = atlasNormalizarBuscaObra(termo);

  atlasObraResultados = (obras || []).filter(obra => {
    if(abrirTudo || !normalizado) return true;

    const codigo = atlasNormalizarBuscaObra(obra.codigo_obra);
    const nome = atlasNormalizarBuscaObra(obra.nome);
    const completo = atlasNormalizarBuscaObra(atlasTextoObra(obra));

    return codigo.includes(normalizado)
      || nome.includes(normalizado)
      || completo.includes(normalizado);
  }).slice(0, 80);

  atlasObraIndice = atlasObraResultados.length ? 0 : -1;
  atlasRenderizarSugestoesObra();
}

function atlasRenderizarSugestoesObra(){
  const lista = document.getElementById("obraSugestoes");
  if(!lista) return;

  if(!atlasObraResultados.length){
    lista.innerHTML = `<div class="atlas-obra-vazio">Nenhuma obra encontrada.</div>`;
    lista.classList.add("ativo");
    return;
  }

  lista.innerHTML = atlasObraResultados.map((obra, indice) => `
    <button type="button"
            class="atlas-obra-opcao ${indice === atlasObraIndice ? "selecionada" : ""}"
            data-obra-id="${obra.id}">
      ${atlasTextoObra(obra)}
    </button>
  `).join("");

  lista.classList.add("ativo");

  lista.querySelectorAll(".atlas-obra-opcao").forEach(botao => {
    botao.addEventListener("mousedown", evento => evento.preventDefault());
    botao.addEventListener("click", () => {
      atlasSelecionarObraCombo(botao.dataset.obraId, false);
    });
  });
}

async function atlasSelecionarObraCombo(obraId, confirmarAutomaticamente = false){
  const select = document.getElementById("obraSelect");
  const input = document.getElementById("obraBusca");
  if(!select || !input) return false;

  const obra = (obras || []).find(o => String(o.id) === String(obraId));
  if(!obra) return false;

  select.value = String(obra.id);
  input.value = atlasTextoObra(obra);
  atlasFecharSugestoesObra();

  if(confirmarAutomaticamente && !window.obraTravada){
    await alternarTravaObra();
  }

  if(window.obraTravada){
    setTimeout(() => document.getElementById("nome_bem")?.focus(), 30);
  }

  return true;
}

async function atlasConfirmarObraDigitada(){
  const input = document.getElementById("obraBusca");
  if(!input || input.disabled) return false;

  const termo = atlasNormalizarBuscaObra(input.value);
  if(!termo) return false;

  const exata = (obras || []).find(obra =>
    atlasNormalizarBuscaObra(obra.codigo_obra) === termo ||
    atlasNormalizarBuscaObra(atlasTextoObra(obra)) === termo
  );

  const candidatas = exata
    ? [exata]
    : (atlasObraResultados.length
        ? atlasObraResultados
        : (obras || []).filter(obra =>
            atlasNormalizarBuscaObra(atlasTextoObra(obra)).includes(termo)
          ));

  if(candidatas.length === 1){
    return atlasSelecionarObraCombo(candidatas[0].id, false);
  }

  if(atlasObraIndice >= 0 && candidatas[atlasObraIndice]){
    return atlasSelecionarObraCombo(candidatas[atlasObraIndice].id, false);
  }

  atlasFiltrarObras(input.value);
  return false;
}

function atlasAtualizarComboObras(){
  atlasSincronizarCampoObra();

  const input = document.getElementById("obraBusca");
  if(input && !input.disabled && document.activeElement === input){
    atlasFiltrarObras(input.value);
  }
}

function atlasIniciarComboObras(){
  if(atlasObraComboIniciado) return;

  const input = document.getElementById("obraBusca");
  const seta = document.getElementById("obraComboSeta");
  const lista = document.getElementById("obraSugestoes");
  const select = document.getElementById("obraSelect");

  if(!input || !seta || !lista || !select) return;
  atlasObraComboIniciado = true;

  input.addEventListener("focus", () => {
    if(!input.disabled) atlasFiltrarObras(input.value);
  });

  input.addEventListener("input", () => {
    select.value = "";
    atlasFiltrarObras(input.value);
  });

  input.addEventListener("keydown", async evento => {
    if(evento.key === "ArrowDown"){
      evento.preventDefault();
      if(!lista.classList.contains("ativo")) atlasFiltrarObras(input.value);
      if(atlasObraResultados.length){
        atlasObraIndice = Math.min(atlasObraIndice + 1, atlasObraResultados.length - 1);
        atlasRenderizarSugestoesObra();
      }
      return;
    }

    if(evento.key === "ArrowUp"){
      evento.preventDefault();
      if(atlasObraResultados.length){
        atlasObraIndice = Math.max(atlasObraIndice - 1, 0);
        atlasRenderizarSugestoesObra();
      }
      return;
    }

    if(evento.key === "Enter"){
      evento.preventDefault();
      await atlasConfirmarObraDigitada();
      return;
    }

    if(evento.key === "Tab"){
      /*
       * TAB apenas confirma a opção digitada no campo interno.
       * O lançamento só fica travado quando o usuário aciona
       * explicitamente o botão "Confirmar obra".
       */
      await atlasConfirmarObraDigitada();
      return;
    }

    if(evento.key === "Escape"){
      atlasFecharSugestoesObra();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      atlasFecharSugestoesObra();
      const selecionada = atlasObraSelecionadaAtual();
      if(selecionada){
        input.value = atlasTextoObra(selecionada);
      }
    }, 140);
  });

  seta.addEventListener("click", () => {
    if(input.disabled) return;

    if(lista.classList.contains("ativo")){
      atlasFecharSugestoesObra();
    }else{
      input.focus();
      atlasFiltrarObras("", true);
    }
  });

  document.addEventListener("click", evento => {
    if(!document.getElementById("atlasObraCombo")?.contains(evento.target)){
      atlasFecharSugestoesObra();
    }
  });

  select.addEventListener("change", atlasSincronizarCampoObra);
  atlasSincronizarCampoObra();
}


async function carregarObras(){

  const limitarObrasAoUsuario = () => {
    const u=usuarioAtual();
    if(usuarioOwnerBDR(u)) return;
    const permitidas=new Set(idsObrasAtuacaoUsuarioBDR());
    obras=(obras||[]).filter(o=>permitidas.has(String(o.id)));
  };

  const preencherSelectObras = () => {
    limitarObrasAoUsuario();
    const select = document.getElementById("obraSelect");
    const novaSelect = document.getElementById("novaObraSelect");

    if(!select || !novaSelect) return;

    select.innerHTML = `<option value="">Selecione a obra/setor</option>`;
    novaSelect.innerHTML = `<option value="">Selecione nova obra/setor</option>`;

    obras.forEach(o => {
      const texto = `${o.codigo_obra || "-"} - ${o.nome || "-"}`;
      select.innerHTML += `<option value="${o.id}">${texto}</option>`;
      novaSelect.innerHTML += `<option value="${o.id}">${texto}</option>`;
    });

    preencherFiltroObraPatrimonio();

    atlasIniciarComboObras();
    atlasAtualizarComboObras();

    // Cadastro novo respeita a obra vinculada do usuário.
    // O select de movimentação (novaObraSelect) continua livre para enviar para outra obra.
    aplicarRegraObraLancamentoBDR();
  };

  try{
    const onlineReal = await patrimonioOnlineReal();

    if(!onlineReal){
      obras = await BDROfflineDB.lerTabela("obras") || [];
      const usuario = usuarioAtual();
      if(usuario && !usuarioOwnerBDR(usuario)){
        const permitidas = new Set(idsObrasAtuacaoUsuarioBDR());
        obras = obras.filter(o => permitidas.has(String(o.id)));
      }
      preencherSelectObras();
      mostrarAvisoModoOffline();
      return;
    }

    const { data, error } = await db()
      .from("obras")
      .select("*")
      .eq("ativa", true)
      .order("nome");

    if(error) throw error;

    obras = data || [];

    const usuario = usuarioAtual();
    if(usuario && !usuarioOwnerBDR(usuario)){
      const permitidas = new Set(idsObrasAtuacaoUsuarioBDR());
      obras = obras.filter(o => permitidas.has(String(o.id)));
    }

    if(window.BDROfflineDB?.salvarTabela){
      await BDROfflineDB.salvarTabela("obras", obras);
    }

    preencherSelectObras();

  }catch(e){
    console.warn("Patrimônio: falha ao carregar obras online, usando cache:", e.message || e);
    obras = await BDROfflineDB.lerTabela("obras") || [];
    const usuario = usuarioAtual();
    if(usuario && !usuarioOwnerBDR(usuario)){
      const permitidas = new Set(idsObrasAtuacaoUsuarioBDR());
      obras = obras.filter(o => permitidas.has(String(o.id)));
    }
    preencherSelectObras();
    BDR_PATRIMONIO_ONLINE_REAL = false;
    mostrarAvisoModoOffline();
  }
}

async function alternarTravaObra(){

  if(!usuarioTemPermissao("PATRIMONIO_CRIAR")){
    alert("Você não tem permissão para alterar obra de lançamento.");
    return;
  }

  if(!usuarioPodeLancarQualquerObra()){
    aplicarRegraObraLancamentoBDR();
    alert("Este usuário só pode lançar patrimônio na própria obra vinculada ao cadastro dele.");
    return;
  }

  if(window.obraTravada){
    const temDados =
      valor("nome_bem") ||
      valor("valor_bem") ||
      valor("observacao") ||
      valor("tipo_item");

    if(temDados){
      const ok = await bdrConfirmarAtlas(
        "Você vai alterar a obra de lançamento.\n\n" +
        "Os dados preenchidos no formulário serão mantidos.\n\n" +
        "Deseja destravar para escolher outra obra?"
      );
      if(!ok) return;
    }

    destravarObra();
    return;
  }

  let obra_id = document.getElementById("obraSelect").value;

  if(!obra_id && document.getElementById("obraBusca")?.value){
    const selecionouDigitacao = await atlasConfirmarObraDigitada();
    if(!selecionouDigitacao) return;
    obra_id = document.getElementById("obraSelect").value;
  }

  if(!obra_id){
    alert("Selecione uma obra/setor para travar.");
    return;
  }

  const obraSelecionada = obras.find(
    o => String(o.id) === String(obra_id)
  );

  if(!usuarioOwnerBDR(usuarioAtual()) && !idsObrasAtuacaoUsuarioBDR().includes(String(obra_id))){
    alert("Esta obra não está liberada para este usuário.");
    return;
  }

  if(!obraSelecionada){
    alert("Obra não encontrada.");
    return;
  }

  window.obraAtiva = obraSelecionada;
  window.obraTravada = true;

  localStorage.setItem("obraAtivaId", obraSelecionada.id);
  localStorage.setItem("obraTravada", "SIM");

  atualizarVisualTrava();
}

function destravarObra(){
  if(!usuarioPodeLancarQualquerObra()){
    aplicarRegraObraLancamentoBDR();
    return;
  }

  window.obraTravada = false;
  window.obraAtiva = null;

  localStorage.removeItem("obraAtivaId");
  localStorage.removeItem("obraTravada");

  atualizarVisualTrava();
}

function atualizarVisualTrava(){

  const btn = document.getElementById("btnTravarObra");
  const textoTopo = document.getElementById("obraAtivaTexto");
  const select = document.getElementById("obraSelect");
  const helper = document.getElementById("obraLockHelper");

  if(window.obraTravada && window.obraAtiva){

    if(select){
      select.value = String(window.obraAtiva.id);
      select.disabled = true;
      select.title = "Obra ativa para lançamento. Clique no cadeado para alterar.";
    }

    if(btn){
      btn.className = "lock-btn lock-on";
      btn.innerText = "🟢 🔒 Obra ativa";
      btn.title = "Clique para destravar e escolher outra obra.";
    }

    if(helper){
      helper.innerText =
        "🟢 Lançando nesta obra. Clique no cadeado para alterar antes de escolher outra.";
    }

    if(textoTopo){
      textoTopo.innerText =
        "🔒 OBRA ATIVA: " +
        (window.obraAtiva.codigo_obra || "-") +
        " - " +
        (window.obraAtiva.nome || "-");
    }

  }else{

    if(select){
      select.disabled = false;
      select.title = "Escolha a obra e confirme para travar o lançamento.";
    }

    if(btn){
      btn.className = "lock-btn lock-off";
      btn.innerText = "✅ Confirmar obra";
      btn.title = "Confirmar a obra selecionada para lançamento.";
    }

    if(helper){
      helper.innerText =
        "🔓 Escolha a obra e confirme. Depois disso, todos os patrimônios serão lançados nela.";
    }

    if(textoTopo){
      textoTopo.innerText = "🔓 Escolha uma obra de lançamento";
    }
  }

  /*
   * O select real fica oculto. Esta sincronização é indispensável
   * para bloquear/desbloquear também o campo visível "obraBusca".
   */
  atlasSincronizarCampoObra();
}

function obterObraParaLancamento(){

  if(!usuarioPodeLancarQualquerObra()){
    const obraUsuario = obraVinculadaUsuarioBDR();
    if(obraUsuario){
      window.obraAtiva = obraUsuario;
      window.obraTravada = true;
      return obraUsuario;
    }
    return null;
  }

  if(window.obraTravada && window.obraAtiva){
    return window.obraAtiva;
  }

  const obra_id = document.getElementById("obraSelect").value;

  if(!obra_id){
    return null;
  }

  const obraSelecionada = obras.find(
    o => String(o.id) === String(obra_id)
  );

  return obraSelecionada || null;
}



const ATLAS_NOMES_PATRIMONIO_PADRAO = [
  "ESMERILHADEIRA",
  "ESMERILHADEIRA ANGULAR",
  "FURADEIRA",
  "FURADEIRA DE IMPACTO",
  "FURADEIRA DE BANCADA",
  "PARAFUSADEIRA",
  "PARAFUSADEIRA DE IMPACTO",
  "MARTELETE",
  "SERRA CIRCULAR",
  "SERRA MÁRMORE",
  "SERRA TICO-TICO",
  "LIXADEIRA",
  "POLITRIZ",
  "COMPRESSOR DE AR",
  "MÁQUINA DE SOLDA",
  "GERADOR",
  "BETONEIRA",
  "LAVADORA DE ALTA PRESSÃO",
  "MOTOBOMBA",
  "TRATOR",
  "COLHEITADEIRA",
  "RETROESCAVADEIRA",
  "PÁ-CARREGADEIRA",
  "ESCAVADEIRA",
  "MOTONIVELADORA",
  "ROLO COMPACTADOR",
  "EMPILHADEIRA",
  "PLATAFORMA ELEVATÓRIA",
  "CAMINHÃO",
  "CAMINHONETE",
  "AUTOMÓVEL",
  "MOTOCICLETA",
  "NOTEBOOK",
  "COMPUTADOR",
  "MONITOR",
  "IMPRESSORA",
  "TELEVISÃO",
  "RÁDIO COMUNICADOR",
  "ROTEADOR",
  "NOBREAK",
  "MULTÍMETRO",
  "FONTE DE ALIMENTAÇÃO",
  "BANCADA DE OFICINA",
  "ARMÁRIO",
  "MESA",
  "CADEIRA"
];

let atlasIndiceSugestaoPatrimonio = -1;
let atlasCatalogoGlobalPatrimonio = [];
let atlasSugestoesPatrimonioAtuais = [];

function atlasNormalizarTextoSugestao(texto){
  return String(texto || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"");
}

function atlasChaveCatalogoPatrimonio(item){
  return [item?.nome_bem,item?.marca,item?.modelo]
    .map(atlasNormalizarTextoSugestao)
    .join('|');
}

async function atlasCarregarCatalogoGlobalPatrimonio(){
  try{
    if(!db()) return;
    const {data,error}=await db()
      .from('patrimonio')
      .select('id,nome_bem,marca,modelo')
      .neq('ativo',false)
      .limit(5000);

    if(error) throw error;

    const mapa=new Map();
    (data||[]).forEach(item=>{
      const nome=String(item?.nome_bem||'').trim();
      if(!nome) return;
      const registro={
        id:item.id,
        nome_bem:nome.toUpperCase(),
        marca:String(item?.marca||'').trim().toUpperCase(),
        modelo:String(item?.modelo||'').trim().toUpperCase()
      };
      const chave=atlasChaveCatalogoPatrimonio(registro);
      if(chave && !mapa.has(chave)) mapa.set(chave,registro);
    });
    atlasCatalogoGlobalPatrimonio=[...mapa.values()]
      .sort((a,b)=>a.nome_bem.localeCompare(b.nome_bem,'pt-BR'));
  }catch(e){
    console.warn('Atlas Patrimônio: catálogo global indisponível; usando dados locais.',e?.message||e);
    atlasCatalogoGlobalPatrimonio=[];
  }
}

function atlasCatalogoNomesPatrimonio(){
  const locais=(window.patrimonios||patrimonios||[]).map(p=>({
    id:p?.id,
    nome_bem:String(p?.nome_bem||'').trim().toUpperCase(),
    marca:String(p?.marca||'').trim().toUpperCase(),
    modelo:String(p?.modelo||'').trim().toUpperCase()
  })).filter(p=>p.nome_bem);

  const padrao=ATLAS_NOMES_PATRIMONIO_PADRAO.map(nome=>({id:null,nome_bem:nome,marca:'',modelo:''}));
  const mapa=new Map();
  [...atlasCatalogoGlobalPatrimonio,...locais,...padrao].forEach(item=>{
    const chave=atlasChaveCatalogoPatrimonio(item);
    if(chave && !mapa.has(chave)) mapa.set(chave,item);
  });
  return [...mapa.values()];
}

function atlasAtualizarSugestoesPatrimonio(){
  const input=document.getElementById('nome_bem');
  const lista=document.getElementById('atlasSugestoesPatrimonio');
  if(!input||!lista) return;

  const termo=atlasNormalizarTextoSugestao(input.value);
  atlasIndiceSugestaoPatrimonio=-1;
  if(termo.length<2){atlasFecharSugestoesPatrimonio();return;}

  atlasSugestoesPatrimonioAtuais=atlasCatalogoNomesPatrimonio()
    .filter(item=>[item.nome_bem,item.marca,item.modelo]
      .some(v=>atlasNormalizarTextoSugestao(v).includes(termo)))
    .slice(0,10);

  if(!atlasSugestoesPatrimonioAtuais.length){atlasFecharSugestoesPatrimonio();return;}

  lista.innerHTML=atlasSugestoesPatrimonioAtuais.map((item,indice)=>{
    const detalhe=[item.marca,item.modelo].filter(Boolean).join(' • ');
    return `<button type="button" class="atlas-sugestao" data-indice="${indice}"
      onmousedown="event.preventDefault(); atlasEscolherSugestaoPatrimonioIndice(${indice})">
      ${item.nome_bem}
      <small>${detalhe||'Nome padronizado do catálogo'}</small>
    </button>`;
  }).join('');
  lista.classList.add('ativo');
}

function atlasDefinirCampoSeExiste(id,valorCampo){
  if(valorCampo===null || valorCampo===undefined || String(valorCampo).trim()==='') return;
  const el=document.getElementById(id);
  if(!el) return;
  if(id==='valor_bem'){
    const numero=Number(valorCampo);
    if(Number.isFinite(numero)) el.value=numero.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    return;
  }
  el.value=String(valorCampo);
}

async function atlasAplicarPatrimonioComoModelo(registro){
  if(!registro) return;

  // Primeiro define o tipo para o Atlas criar os campos dinâmicos corretos.
  atlasDefinirCampoSeExiste('nome_bem',registro.nome_bem);
  const campoTipo=document.getElementById('tipo_item');
  if(campoTipo) campoTipo.value=String(registro.tipo_item||'');
  mostrarCampos();

  // Copia somente características reutilizáveis. Identificadores individuais,
  // obra/localização e medições atuais permanecem vazios para o novo patrimônio.
  const campos=[
    'tipo_outro','estado_conservacao','valor_bem',
    'marca','modelo','cor','combustivel','potencia','ano_fabricacao','ano_modelo',
    'especificacoes','descricao','fornecedor','departamento','responsavel',
    'endereco_estoque','ncm'
  ];
  campos.forEach(id=>{
    atlasDefinirCampoSeExiste(id,registro[id]);
  });

  // Nunca copiar dados que identificam uma unidade específica.
  ['numero_serie','placa','renavam','chassi','codigo_antigo','quilometragem','horimetro','numero_nfe','observacao']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });

  // Novo patrimônio começa sempre EM_USO; o status do patrimônio usado como modelo
  // não deve ser herdado.
  const statusInicial=document.getElementById('status_inicial');
  if(statusInicial){
    statusInicial.value='EM_USO';
    statusInicial.dispatchEvent(new Event('change',{bubbles:true}));
  }

  window.AtlasPatrimonioLote?.resetar?.();

  // O formulário já está renderizado neste ponto. O foco segue direto para o
  // único dado individual que falta informar, sem uma segunda renderização.
  const serie=document.getElementById('numero_serie');
  if(serie && !serie.disabled && serie.offsetParent!==null){
    serie.focus();
    serie.select?.();
  }else{
    const gerar=document.querySelector('#btnGerarPatrimonio, [data-acao="gerar-patrimonio"], button[onclick*="gerarPatrimonio"]');
    gerar?.focus();
  }
}

async function atlasEscolherSugestaoPatrimonioIndice(indice){
  const item=atlasSugestoesPatrimonioAtuais[indice];
  if(!item) return;

  atlasFecharSugestoesPatrimonio();

  if(!item.id){
    atlasDefinirCampoSeExiste('nome_bem',item.nome_bem);
    document.getElementById('nome_bem')?.focus();
    return;
  }

  try{
    const {data,error}=await db()
      .from('patrimonio')
      .select('*')
      .eq('id',item.id)
      .single();
    if(error) throw error;
    await atlasAplicarPatrimonioComoModelo(data);
  }catch(e){
    console.error('Atlas Patrimônio: não foi possível carregar os dados da sugestão.',e);
    atlasDefinirCampoSeExiste('nome_bem',item.nome_bem);
    atlasDefinirCampoSeExiste('marca',item.marca);
    atlasDefinirCampoSeExiste('modelo',item.modelo);
  }
}

function atlasEscolherSugestaoPatrimonioDados(dadosCodificados){
  let item=null;
  try{item=JSON.parse(decodeURIComponent(dadosCodificados));}catch(e){}
  if(!item) return;
  const indice=atlasSugestoesPatrimonioAtuais.findIndex(x=>String(x.id||'')===String(item.id||'') && atlasChaveCatalogoPatrimonio(x)===atlasChaveCatalogoPatrimonio(item));
  if(indice>=0) return atlasEscolherSugestaoPatrimonioIndice(indice);
  atlasDefinirCampoSeExiste('nome_bem',item.nome_bem);
}

function atlasEscolherSugestaoPatrimonio(nome){
  const indice=atlasSugestoesPatrimonioAtuais.findIndex(x=>x.nome_bem===nome);
  if(indice>=0) return atlasEscolherSugestaoPatrimonioIndice(indice);
  atlasDefinirCampoSeExiste('nome_bem',nome);
}

function atlasFecharSugestoesPatrimonio(){
  const lista = document.getElementById("atlasSugestoesPatrimonio");
  if(lista){
    lista.classList.remove("ativo");
    lista.innerHTML = "";
  }
  atlasIndiceSugestaoPatrimonio = -1;
}

function atlasTeclaSugestaoPatrimonio(event){
  const lista = document.getElementById("atlasSugestoesPatrimonio");
  if(!lista?.classList.contains("ativo")) return;

  const botoes = Array.from(lista.querySelectorAll(".atlas-sugestao"));
  if(!botoes.length) return;

  if(event.key === "ArrowDown"){
    event.preventDefault();
    atlasIndiceSugestaoPatrimonio = Math.min(atlasIndiceSugestaoPatrimonio + 1, botoes.length - 1);
  }else if(event.key === "ArrowUp"){
    event.preventDefault();
    atlasIndiceSugestaoPatrimonio = Math.max(atlasIndiceSugestaoPatrimonio - 1, 0);
  }else if(event.key === "Enter" || event.key === "Tab"){
    const indice = atlasIndiceSugestaoPatrimonio >= 0 ? atlasIndiceSugestaoPatrimonio : 0;
    if(event.key === "Enter") event.preventDefault();
    atlasEscolherSugestaoPatrimonioIndice(indice);
    return;
  }else if(event.key === "Escape"){
    atlasFecharSugestoesPatrimonio();
    return;
  }else{
    return;
  }

  botoes.forEach((botao,indice)=>{
    botao.classList.toggle("selecionada",indice === atlasIndiceSugestaoPatrimonio);
  });
}

atlasSincronizarCampoObra();

/*
 * Deixa o bloco da obra pequeno.
 *
 * Usuário com uma única obra:
 * - obra é selecionada automaticamente;
 * - botão verde desaparece;
 * - fica somente uma informação compacta.
 *
 * Usuário com várias obras:
 * - seletor continua disponível;
 * - botão permanece pequeno para preservar a lógica atual.
 */
function atlasCompactarObraPatrimonio(){
  const card = document.getElementById("cardObraLancamento");
  const select = document.getElementById("obraSelect");
  const btn = document.getElementById("btnTravarObra");
  const u = usuarioAtual();

  if(!card || !select || !u) return;

  const idsLiberados = String(u.obras_liberadas || "")
    .split(/[;,|]/)
    .map(x=>x.trim())
    .filter(Boolean);

  const ids = new Set(idsLiberados);
  if(u.obra_id) ids.add(String(u.obra_id));

  // O seletor fica disponível quando o usuário possui mais de uma obra de atuação.
  // Perfil/permissão não amplia o escopo além das obras marcadas no cadastro.
  const acessoAmplo = usuarioOwnerBDR(u) || idsObrasAtuacaoUsuarioBDR().length > 1;

  if(!acessoAmplo && ids.size === 1){
    const obraId = Array.from(ids)[0];
    const obra = (window.obras || obras || []).find(o=>String(o.id)===String(obraId));

    if(obra){
      select.value = String(obra.id);
      select.disabled = true;
      window.obraAtiva = obra;
      window.obraTravada = true;
      card.classList.add("obra-unica");

      const titulo = card.querySelector("h3");
      if(titulo) titulo.textContent = "🏗 Obra:";

      if(btn) btn.style.display = "none";
      return;
    }
  }

  card.classList.remove("obra-unica");
  if(btn) btn.style.display = "";
}



function atlasAlternarPatrimonioAntigo(){
  const check = document.getElementById("checkLegado");
  if(!check) return;

  check.checked = !check.checked;
  mostrarCamposLegado();

  if(check.checked){
    setTimeout(()=>document.getElementById("codigo_antigo")?.focus(),120);
  }
}

function mostrarCamposLegado(){
  const check = document.getElementById("checkLegado");
  const campo = document.getElementById("camposLegado");
  const botao = document.getElementById("atlasLegadoToggle");
  const icone = botao?.querySelector(".atlas-legado-icone");
  const ativo = !!check?.checked;

  if(campo) campo.classList.toggle("ativo",ativo);

  if(botao){
    botao.classList.toggle("ativo",ativo);
    botao.setAttribute("aria-pressed",ativo ? "true" : "false");
  }

  if(icone) icone.textContent = ativo ? "✓" : "○";

  if(!ativo){
    const input = document.getElementById("codigo_antigo");
    if(input) input.value = "";
  }
}

/* =========================================================
   ATLAS PATRIMÔNIO — CAMPOS DINÂMICOS DO CADASTRO
   ---------------------------------------------------------
   Este bloco é a única fonte de montagem dos campos por tipo.
   Marca e Modelo usam autocomplete; o componente de lote é
   renderizado sempre no final dos campos compatíveis.
========================================================= */
const atlasAutocompleteEstado = {
  marca:{indice:-1,itens:[]},
  modelo:{indice:-1,itens:[]}
};

function atlasTextoMaiusculo(texto){
  return String(texto || "").trim().toUpperCase();
}

function atlasListaUnica(valores){
  const mapa = new Map();
  (valores || []).forEach(valorItem => {
    const texto = atlasTextoMaiusculo(valorItem);
    if(!texto) return;
    const chave = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if(!mapa.has(chave)) mapa.set(chave, texto);
  });
  return [...mapa.values()].sort((a,b) => a.localeCompare(b,"pt-BR"));
}

function atlasOpcoesAutocomplete(tipo){
  if(tipo === "marca"){
    return atlasListaUnica((patrimonios || []).map(item => item?.marca));
  }

  const marca = atlasTextoMaiusculo(document.getElementById("marca")?.value);
  return atlasListaUnica(
    (patrimonios || [])
      .filter(item => !marca || atlasTextoMaiusculo(item?.marca) === marca)
      .map(item => item?.modelo)
  );
}

function atlasEscaparHTML(texto){
  return String(texto || "").replace(/[&<>"']/g, caractere => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[caractere]));
}

function atlasFecharAutocomplete(tipo){
  document.getElementById(`atlasAutocomplete${tipo === "marca" ? "Marca" : "Modelo"}`)
    ?.classList.remove("ativo");
  atlasAutocompleteEstado[tipo].indice = -1;
}

function atlasSelecionarAutocomplete(tipo, valorSelecionado){
  const campo = document.getElementById(tipo);
  if(!campo) return;
  campo.value = atlasTextoMaiusculo(valorSelecionado);
  atlasFecharAutocomplete(tipo);

  if(tipo === "marca"){
    const modelo = document.getElementById("modelo");
    if(modelo){
      modelo.value = "";
      modelo.focus();
      atlasAtualizarAutocomplete("modelo");
    }
  }
}

function atlasAtualizarAutocomplete(tipo){
  const campo = document.getElementById(tipo);
  const lista = document.getElementById(`atlasAutocomplete${tipo === "marca" ? "Marca" : "Modelo"}`);
  if(!campo || !lista) return;

  bdrMaiusculoSemMoverCursor(campo);
  const termo = atlasTextoMaiusculo(campo.value);
  const opcoes = atlasOpcoesAutocomplete(tipo)
    .filter(item => !termo || item.includes(termo))
    .slice(0,30);

  atlasAutocompleteEstado[tipo] = {indice:-1,itens:opcoes};

  if(!opcoes.length){
    lista.innerHTML = termo
      ? `<div class="atlas-autocomplete-vazio">Use “${atlasEscaparHTML(termo)}” como novo valor.</div>`
      : "";
    lista.classList.toggle("ativo", Boolean(termo));
    return;
  }

  lista.innerHTML = opcoes.map((opcao,indice) => `
    <button type="button" class="atlas-autocomplete-opcao" data-indice="${indice}"
      data-valor="${atlasEscaparHTML(opcao)}">${atlasEscaparHTML(opcao)}</button>
  `).join("");

  lista.querySelectorAll(".atlas-autocomplete-opcao").forEach(botao => {
    botao.addEventListener("mousedown", evento => evento.preventDefault());
    botao.addEventListener("click", () => atlasSelecionarAutocomplete(tipo, botao.dataset.valor));
  });

  lista.classList.add("ativo");
}

function atlasTeclaAutocomplete(evento,tipo){
  const estado = atlasAutocompleteEstado[tipo];
  const itens = estado.itens || [];
  const lista = document.getElementById(`atlasAutocomplete${tipo === "marca" ? "Marca" : "Modelo"}`);

  if(evento.key === "ArrowDown" && itens.length){
    evento.preventDefault();
    estado.indice = Math.min(estado.indice + 1, itens.length - 1);
  }else if(evento.key === "ArrowUp" && itens.length){
    evento.preventDefault();
    estado.indice = Math.max(estado.indice - 1, 0);
  }else if((evento.key === "Enter" || evento.key === "Tab") && lista?.classList.contains("ativo")){
    const selecionado = itens[estado.indice >= 0 ? estado.indice : 0];
    if(selecionado){
      if(evento.key === "Enter") evento.preventDefault();
      atlasSelecionarAutocomplete(tipo, selecionado);
    }else{
      atlasFecharAutocomplete(tipo);
    }
    return;
  }else if(evento.key === "Escape"){
    atlasFecharAutocomplete(tipo);
    return;
  }else{
    return;
  }

  lista?.querySelectorAll(".atlas-autocomplete-opcao").forEach((botao,indice) => {
    botao.classList.toggle("ativo", indice === estado.indice);
    if(indice === estado.indice) botao.scrollIntoView({block:"nearest"});
  });
}

function atlasCampoAutocomplete(tipo,placeholder){
  const nome = tipo === "marca" ? "Marca" : "Modelo";
  return `
    <div class="atlas-autocomplete-campo">
      <input id="${tipo}" autocomplete="off" placeholder="${placeholder}"
        onfocus="atlasAtualizarAutocomplete('${tipo}')"
        oninput="atlasAtualizarAutocomplete('${tipo}')"
        onkeydown="atlasTeclaAutocomplete(event,'${tipo}')"
        onblur="setTimeout(() => atlasFecharAutocomplete('${tipo}'),150)">
      <div class="atlas-autocomplete-lista" id="atlasAutocomplete${nome}" role="listbox"></div>
    </div>
  `;
}

function atlasCampoSerieComLote(placeholder="Número de série"){
  return window.AtlasPatrimonioLote?.renderizarCampo(placeholder) ||
    `<input id="numero_serie" placeholder="${placeholder}">`;
}

function mostrarCampos(){
  const tipo = valor("tipo_item");
  const div = document.getElementById("camposExtras");
  const campoOutro = document.getElementById("campoOutroTipo");
  if(!div || !campoOutro) return;

  window.AtlasPatrimonioLote?.fechar({limparSerie:false});
  div.innerHTML = "";
  campoOutro.style.display = tipo === "OUTRO" ? "grid" : "none";

  const marca = (placeholder="Marca") => atlasCampoAutocomplete("marca",placeholder);
  const modelo = (placeholder="Modelo") => atlasCampoAutocomplete("modelo",placeholder);
  const serie = (placeholder="Número de série") => atlasCampoSerieComLote(placeholder);

  if(["FERRAMENTA","EQUIPAMENTO","ELETRONICO","ELETRODOMESTICO","COMUNICACAO","ELETRICO","SEGURANCA","OFICINA"].includes(tipo)){
    div.innerHTML = `${marca()}${modelo()}${serie()}`;
  }

  if(tipo === "INFORMATICA"){
    div.innerHTML = `${marca()}${modelo()}<input id="especificacoes" placeholder="Especificações. Ex.: i5, 8 GB, SSD 256 GB">${serie()}`;
  }

  if(tipo === "VEICULO"){
    div.innerHTML = `
      <input id="placa" placeholder="Placa" onblur="validarDuplicidadeCampoPatrimonio('placa')">
      <input id="renavam" placeholder="RENAVAM" onblur="validarDuplicidadeCampoPatrimonio('renavam')">
      <input id="chassi" placeholder="Chassi" onblur="validarDuplicidadeCampoPatrimonio('chassi')">
      ${marca()}${modelo()}
      <input id="cor" placeholder="Cor">
      <input id="combustivel" placeholder="Combustível">
      <input id="ano_fabricacao" placeholder="Ano de fabricação" inputmode="numeric">
      <input id="ano_modelo" placeholder="Ano do modelo" inputmode="numeric">
      <input id="quilometragem" placeholder="KM atual" inputmode="decimal">
    `;
  }

  if(["MAQUINA","MAQUINA_PESADA"].includes(tipo)){
    div.innerHTML = `
      ${marca()}${modelo()}
      <input id="potencia" placeholder="Potência">
      <input id="horimetro" placeholder="Horímetro" inputmode="decimal">
      <input id="combustivel" placeholder="Combustível">
      <input id="ano_fabricacao" placeholder="Ano de fabricação" inputmode="numeric">
      <input id="ano_modelo" placeholder="Ano do modelo" inputmode="numeric">
      ${serie()}
    `;
  }
 
/*   - - Esses são para adicionar campo em cadastro de bens. tipo de patrimonio - cada 1 é uma coisa diferente, mas todos são campos de cadastro de bens. - -
      <input id="fornecedor" placeholder="Fornecedor">
      <input id="data_compra" type="date" title="Data de aquisição">
      <input id="responsavel" placeholder="Responsável pelo bem">
      <input id="departamento" placeholder="Departamento / setor">
      <input id="endereco_estoque" placeholder="Localização detalhada. Ex.: Sala 02 / Prateleira A">
      <textarea id="descricao" class="atlas-campo-largo" placeholder="Descrição detalhada do imobilizado"></textarea>*/

  if(tipo === "MOBILIARIO"){
    div.innerHTML = `
      ${marca("Marca / fabricante")}${modelo()}
      ${serie("Número de série, patrimônio do fabricante ou identificação")}
    `;
  }

  if(tipo === "MATERIAL_APOIO"){
    div.innerHTML = `${marca("Marca / fabricante")}${modelo("Modelo / descrição")}${serie("Número de série, se houver")}`;
  }

  if(tipo === "OUTRO"){
    div.innerHTML = `${marca("Marca, se houver")}${modelo("Modelo, se houver")}${serie("Número de série, se houver")}`;
  }

  window.AtlasPatrimonioLote?.conectar();
}

window.atlasAtualizarAutocomplete = atlasAtualizarAutocomplete;
window.atlasTeclaAutocomplete = atlasTeclaAutocomplete;
window.atlasSelecionarAutocomplete = atlasSelecionarAutocomplete;
window.atlasFecharAutocomplete = atlasFecharAutocomplete;


function bdrNormalizarComparacao(valor){
  return String(valor || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function bdrCampoVazioOuGenerico(valor){
  const v = bdrNormalizarComparacao(valor);
  return !v || ["SN", "SNN", "SEMNUMERO", "SEMNUMERACAO", "NA", "NAA", "NAOAPLICA", "NAOINFORMADO", "INFORMAR", "XXX", "000", "0000", "000000"].includes(v);
}

function bdrMesmoValor(a, b){
  if(bdrCampoVazioOuGenerico(a) || bdrCampoVazioOuGenerico(b)) return false;
  return bdrNormalizarComparacao(a) === bdrNormalizarComparacao(b);
}

function bdrResumoPatrimonioDuplicado(p){
  return `${p.codigo_qr || "SEM CÓDIGO"} — ${p.nome_bem || "-"}\n` +
    `Obra: ${p.localizacao || p.obra_nome || p.obra_id || "-"}\n` +
    `Placa: ${p.placa || "-"} | RENAVAM: ${p.renavam || "-"} | Chassi: ${p.chassi || "-"}`;
}

async function bdrBaseDuplicidadePatrimonio(){
  // Base local serve para alertas flexíveis (série/código antigo). Identificadores
  // fortes (placa/RENAVAM/chassi) são consultados diretamente no banco.
  try{
    const cache = window.BDROfflineDB?.lerTabela
      ? await BDROfflineDB.lerTabela("patrimonio")
      : [];
    return [ ...(patrimonios || []), ...(cache || []) ];
  }catch(e){
    return patrimonios || [];
  }
}

async function bdrBuscarIdentificadorFortePatrimonio(campo, valorCampo){
  const bruto=String(valorCampo||'').trim();
  if(bdrCampoVazioOuGenerico(bruto)) return [];

  const normalizado=bdrNormalizarComparacao(bruto);
  const unicos=new Map();
  const adicionar=(lista)=>{
    (lista||[]).forEach(p=>{
      if(!p || p.ativo===false) return;
      if(bdrNormalizarComparacao(p[campo])!==normalizado) return;
      unicos.set(String(p.id ?? `${campo}:${p[campo]}:${p.codigo_qr||''}`),p);
    });
  };

  // Consulta dirigida: não depende da paginação/limite da listagem de patrimônios.
  try{
    if(await patrimonioOnlineReal() && db()){
      const {data,error}=await db()
        .from("patrimonio")
        .select("id,codigo_qr,nome_bem,placa,renavam,chassi,numero_serie,codigo_antigo,obra_id,localizacao,ativo")
        .ilike(campo, bruto)
        .neq("ativo", false)
        .limit(20);
      if(error) throw error;
      adicionar(data);
    }
  }catch(e){
    console.warn(`Anti-duplicidade: falha ao consultar ${campo} diretamente no banco.`,e);
  }

  // Fallback/cache também cobre pequenas diferenças de máscara já carregadas.
  try{
    const cache=window.BDROfflineDB?.lerTabela ? await BDROfflineDB.lerTabela("patrimonio") : [];
    adicionar(patrimonios||[]);
    adicionar(cache||[]);
  }catch(e){
    adicionar(patrimonios||[]);
  }

  return [...unicos.values()];
}

async function bdrVerificarDuplicidadePatrimonio(dados,opcoes={}){
  const lista=await bdrBaseDuplicidadePatrimonio();
  const bloqueios=[];
  const alertas=[];
  const tipo=String(dados.tipo_item||'').toUpperCase();

  // Placa, RENAVAM e chassi precisam ser validados contra o banco inteiro,
  // e não contra a página/lista parcial que estiver carregada na tela.
  for(const campo of ["placa","renavam","chassi"]){
    const encontrados=await bdrBuscarIdentificadorFortePatrimonio(campo,dados[campo]);
    encontrados.forEach(p=>{
      if(dados.id && String(p.id)===String(dados.id)) return;
      bloqueios.push({motivo:`${campo.toUpperCase()} já cadastrado`,patrimonio:p});
    });
  }

  const igual=(a,b)=>bdrMesmoValor(a,b);
  const camposIguais=(p)=>
    igual(dados.nome_bem,p.nome_bem) &&
    igual(dados.marca,p.marca) &&
    igual(dados.modelo,p.modelo) &&
    igual(dados.numero_serie,p.numero_serie);

  (lista||[]).forEach(p=>{
    if(!p||p.ativo===false) return;
    if(dados.id && String(p.id)===String(dados.id)) return;

    // Placa, RENAVAM e chassi são identificadores fortes sempre que informados.
    // Se qualquer um já existir em outro patrimônio ativo, o cadastro é bloqueado.
    if(bloqueios.some(item=>String(item.patrimonio?.id)===String(p.id))) return;

    const quatroIguais=camposIguais(p);
    const codigoAntigoInformado=!bdrCampoVazioOuGenerico(dados.codigo_antigo);
    const codigoAntigoIgual=codigoAntigoInformado && igual(dados.codigo_antigo,p.codigo_antigo);

    // Bloqueio somente quando há certeza máxima: os quatro dados + código antigo.
    if(quatroIguais && codigoAntigoIgual){
      bloqueios.push({motivo:'Nome, marca, modelo, série e código antigo já cadastrados',patrimonio:p});
      return;
    }

    // Máquina recebe alerta forte quando nome, marca, modelo e série coincidem.
    if((tipo==='MAQUINA'||tipo==='MAQUINA_PESADA') && quatroIguais){
      alertas.push({motivo:'Máquina com nome, marca, modelo e série iguais',patrimonio:p});
      return;
    }

    if(quatroIguais){
      alertas.push({motivo:'Nome, marca, modelo e número de série iguais',patrimonio:p});
    }else if(codigoAntigoIgual){
      alertas.push({motivo:'Código antigo já encontrado em outro patrimônio',patrimonio:p});
    }else if(igual(dados.numero_serie,p.numero_serie)){
      alertas.push({motivo:'Número de série já encontrado; confirme os demais dados',patrimonio:p});
    }
  });

  const unicos=(itens)=>{
    const vistos=new Set();
    return itens.filter(item=>{
      const chave=`${item.motivo}-${item.patrimonio?.id}`;
      if(vistos.has(chave)) return false;
      vistos.add(chave);return true;
    });
  };

  const b=unicos(bloqueios),a=unicos(alertas);
  if(b.length){
    const msg=b.slice(0,5).map(item=>`🚫 ${item.motivo}\n${bdrResumoPatrimonioDuplicado(item.patrimonio)}\nSérie: ${item.patrimonio?.numero_serie||'-'}\nCódigo antigo: ${item.patrimonio?.codigo_antigo||'-'}`).join('\n\n');
    alert('Cadastro bloqueado por identificador já cadastrado.\n\n'+msg);
    return false;
  }

  if(a.length && opcoes.confirmar!==false){
    const msg=a.slice(0,5).map(item=>`⚠️ ${item.motivo}\n${bdrResumoPatrimonioDuplicado(item.patrimonio)}\nSérie: ${item.patrimonio?.numero_serie||'-'}\nCódigo antigo: ${item.patrimonio?.codigo_antigo||'-'}`).join('\n\n');
    return await bdrConfirmarAtlas('Possível duplicidade encontrada:\n\n'+msg+'\n\nOs dados não são suficientes para bloquear. Deseja cadastrar mesmo assim?');
  }
  return true;
}

async function validarDuplicidadeCampoPatrimonio(campo){
  const v = valor(campo);

  if(bdrCampoVazioOuGenerico(v)){
    return true;
  }

  const tipoItem = String(valor("tipo_item") || "").toUpperCase();
  const identificadorUnico = ["placa", "renavam", "chassi"].includes(campo);
  const lista = identificadorUnico
    ? await bdrBuscarIdentificadorFortePatrimonio(campo,v)
    : await bdrBaseDuplicidadePatrimonio();

  const achados = (lista || []).filter(p => {
    if(!p || p.ativo === false) return false;
    return bdrMesmoValor(v, p[campo]);
  });

  if(!achados.length){
    document.getElementById(campo)?.classList.remove(
      "atlas-campo-duplicado",
      "atlas-campo-alerta"
    );
    return true;
  }

  const msg = achados
    .slice(0,5)
    .map(bdrResumoPatrimonioDuplicado)
    .join("\n\n");

  if(identificadorUnico){
    alert(
      `🚫 ${campo.toUpperCase()} já cadastrado.\n\n` +
      msg +
      "\n\nEste identificador não pode se repetir em patrimônios ativos."
    );

    document.getElementById(campo)?.classList.add("atlas-campo-duplicado");
    return false;
  }

  alert(
    `⚠️ ${campo.toUpperCase()} já encontrado.\n\n` +
    msg +
    "\n\nVocê ainda poderá cadastrar este patrimônio."
  );

  document.getElementById(campo)?.classList.add("atlas-campo-alerta");
  return true;
}



function atlasMascaraNCM(input){
  if(!input) return;
  input.value = String(input.value || "").replace(/\D/g, "").slice(0, 8);
}

function atlasAlternarDadosFiscais(forcarEstado){
  const botao = document.getElementById("atlasFiscalToggle");
  const campos = document.getElementById("camposFiscais");
  if(!botao || !campos) return;

  const ativoAtual = botao.classList.contains("ativo");
  const ativo = typeof forcarEstado === "boolean" ? forcarEstado : !ativoAtual;

  botao.classList.toggle("ativo", ativo);
  botao.setAttribute("aria-pressed", String(ativo));
  campos.classList.toggle("ativo", ativo);
  campos.setAttribute("aria-hidden", String(!ativo));

  const icone = botao.querySelector(".atlas-fiscal-icone");
  if(icone) icone.textContent = ativo ? "✓" : "○";

  if(ativo && typeof forcarEstado !== "boolean"){
    setTimeout(() => document.getElementById("ncm")?.focus(), 120);
  }
}

async function gerarPatrimonio(){

  if(window.__BDR_PATRIMONIO_SALVANDO__){
    alert("Já existe um cadastro de patrimônio sendo salvo. Aguarde finalizar.");
    return;
  }

  if(!usuarioTemPermissao("PATRIMONIO_CRIAR")){
    alert("Você não tem permissão para cadastrar patrimônio.");
    return;
  }


  const obra = obterObraParaLancamento();

  if(!obra){
    alert("Selecione uma obra/setor para lançamento.");
    return;
  }

  const nome_bem = valor("nome_bem");
  const tipo_item = valor("tipo_item");
  const status_inicial = valor("status_inicial") || "EM_USO";

  if(!nome_bem || !tipo_item){
    alert("Preencha nome do bem e tipo.");
    return;
  }

  if(tipo_item === "OUTRO" && !valor("tipo_outro")){
    alert("Descreva o tipo do ativo.");
    return;
  }

  if(!bdrValorPatrimonioValido()){
    alert("🚫 Informe o valor do patrimônio.\n\nO sistema não vai mais aceitar patrimônio sem valor ou com valor R$ 0,00.");
    const campoValor = document.getElementById("valor_bem");
    if(campoValor){ campoValor.focus(); campoValor.select?.(); }
    return;
  }

  // Cadastro em lote: usa os mesmos dados do formulário e altera apenas a série/código.
  if(window.AtlasPatrimonioLote?.ativo()){
    await window.AtlasPatrimonioLote.salvar({
      obra,
      nome_bem,
      tipo_item,
      status_inicial
    });
    return;
  }

  window.__BDR_PATRIMONIO_SALVANDO__ = true;
  bdrSetGerandoPatrimonio(true);

  const dadosParaValidarDuplicidade = {
    nome_bem,
    tipo_item,
    placa: valor("placa") || null,
    renavam: valor("renavam") || null,
    chassi: valor("chassi") || null,
    codigo_antigo: valor("codigo_antigo") || null,
    marca: valor("marca") || null,
    modelo: valor("modelo") || null,
    numero_serie: valor("numero_serie") || null,
    obra_id: obra.id ? Number(obra.id) : null
  };

  const podeContinuarDuplicidade = await bdrVerificarDuplicidadePatrimonio(dadosParaValidarDuplicidade, { confirmar:true });
  if(!podeContinuarDuplicidade){
    window.__BDR_PATRIMONIO_SALVANDO__ = false;
    bdrSetGerandoPatrimonio(false);
    return;
  }

let sequencial = 1;
let codigo_qr = "";

try{
  sequencial = await bdrProximoSequencialObra(obra);
  codigo_qr = bdrMontarCodigoPatrimonio(obra.codigo_obra, sequencial);
}catch(e){
  console.error(e);
  alert(e.message || "Não foi possível gerar o código do patrimônio.");
  window.__BDR_PATRIMONIO_SALVANDO__ = false;
  bdrSetGerandoPatrimonio(false);
  return;
}

const usuarioLogado = JSON.parse(
  localStorage.getItem("usuario_logado")
);
const patrimonio = {
    nome_bem,
    tipo_item,
    tipo_outro: valor("tipo_outro") || null,

    empresa_id: obra.empresa_id ? Number(obra.empresa_id) : 17,
    obra_id: obra.id ? Number(obra.id) : null,
    localizacao: obra.nome || null,

    sequencial: Number(sequencial),
    codigo_qr,
    status: status_inicial,

    marca: valor("marca") || null,
    modelo: valor("modelo") || null,
    numero_serie: valor("numero_serie") || null,
    descricao: valor("descricao") || null,
    fornecedor: valor("fornecedor") || null,
    data_compra: valor("data_compra") || null,
    responsavel: valor("responsavel") || null,
    departamento: valor("departamento") || null,
    endereco_estoque: valor("endereco_estoque") || null,

    placa: valor("placa") || null,
    renavam: valor("renavam") || null,
    cor: valor("cor") || null,
    combustivel: valor("combustivel") || null,
    potencia: valor("potencia") || null,
    chassi: valor("chassi") || null,

horimetro: moedaParaNumero(valor("horimetro")),
quilometragem: moedaParaNumero(valor("quilometragem")),

ano_fabricacao: valor("ano_fabricacao")
  ? parseInt(valor("ano_fabricacao"))
  : null,

ano_modelo: valor("ano_modelo")
  ? parseInt(valor("ano_modelo"))
  : null,

    valor_bem: moedaParaNumero(valor("valor_bem")),
    codigo_antigo: valor("codigo_antigo") || null,
    ncm: valor("ncm") || null,
    numero_nfe: valor("numero_nfe") || null,
    estado_conservacao: valor("estado_conservacao") || "BOM",
    observacao: [
      valor("observacao"),
      valor("especificacoes") ? "Especificações: " + valor("especificacoes") : ""
    ].filter(Boolean).join(" | ") || null,

    origem_cadastro:
      document.getElementById("checkLegado").checked
        ? "LEGADO"
        : "NOVO",
usuario_cadastro:
  usuarioLogado?.nome || "Usuário não identificado",
  };

  const resp = await bdrSalvarPrimeiroNoTablet("patrimonio", patrimonio, {
    acao:"CADASTRO_PATRIMONIO",
    codigo_qr
  });

  if(resp.error){
    console.error(resp.error);
    alert(resp.error.message || "Erro ao salvar patrimônio.");
    window.__BDR_PATRIMONIO_SALVANDO__ = false;
    bdrSetGerandoPatrimonio(false);
    return;
  }

  // Atualiza a tela na hora. Se gravou online, não marca como pendente.
  const registroSalvo = Array.isArray(resp.data) && resp.data[0]
    ? resp.data[0]
    : {
        ...patrimonio,
        id: resp.offlineFirst ? "LOCAL-" + Date.now() : Date.now()
      };

  patrimonios.unshift({
    ...registroSalvo,
    __offline_pendente: !!resp.offlineFirst
  });

  // Pré-gera o QR local sem bloquear o cadastro.
  atlasPreGerarQRCodePatrimonio(codigo_qr).catch(error =>
    console.warn("Atlas: patrimônio salvo, mas o aquecimento do QR ficou para a impressão.",error)
  );

  if(resp.offlineFirst){
    bdrAvisoSalvoTablet(
      "Patrimônio criado offline: " +
      codigo_qr +
      "\nSerá sincronizado automaticamente quando a internet voltar."
    );
  }else{
    window.AtlasAudio?.concluido?.();
    atlasAvisoPatrimonio(
      "✅ Patrimônio cadastrado",
      `Código ${codigo_qr} salvo e sincronizado com sucesso.`
    );
  }
  limparFormularioCadastro();
  renderizarPatrimonios();
  window.__BDR_PATRIMONIO_SALVANDO__ = false;
  bdrSetGerandoPatrimonio(false);
}
function limparFormularioCadastro(){
  document.getElementById("nome_bem").value = "";
  document.getElementById("tipo_item").value = "";
  document.getElementById("status_inicial").value = "EM_USO";
  document.getElementById("valor_bem").value = "";
  document.getElementById("tipo_outro").value = "";
  document.getElementById("campoOutroTipo").style.display = "none";
  document.getElementById("observacao").value = "";
  document.getElementById("codigo_antigo").value = "";
  document.getElementById("ncm").value = "";
  document.getElementById("numero_nfe").value = "";
  atlasAlternarDadosFiscais(false);

  const campoEstado = document.getElementById("estado_conservacao");
  if(campoEstado){
    campoEstado.value = "BOM";
  }

  document.getElementById("checkLegado").checked = false;
  mostrarCamposLegado();
  document.getElementById("camposLegado").style.display = "none";
  document.getElementById("camposExtras").innerHTML = "";
  atlasFecharSugestoesPatrimonio();
}

/* =========================================================
   ATLAS — VISUALIZAÇÃO DE EXCLUÍDOS/INATIVOS
   ---------------------------------------------------------
   - Somente o usuário interno ID 1 enxerga a opção no filtro.
   - Para os demais usuários, o item apenas desaparece da lista.
========================================================= */
function atlasPodeVerInativos(){
  const usuario = usuarioAtual();
  return Number(usuario?.id || usuario?.usuario_id || 0) === 1;
}

function atlasAtualizarBotaoInativos(){
  const opcaoStatus = document.getElementById("filtroStatusInativo");
  if(opcaoStatus) opcaoStatus.hidden = !atlasPodeVerInativos();
}

async function atlasAoAlterarFiltroStatus(){
  const filtroStatus = document.getElementById("filtroStatus");
  const selecionado = String(filtroStatus?.value || "").toUpperCase();

  if(selecionado === "INATIVO" && !atlasPodeVerInativos()){
    if(filtroStatus) filtroStatus.value = "";
    alert("Você não tem permissão para visualizar patrimônios excluídos.");
    return;
  }

  atlasMostrarInativos = selecionado === "INATIVO";
  bdrResetPaginaPatrimonio();
  await carregarPatrimonios();
}

window.atlasAoAlterarFiltroStatus = atlasAoAlterarFiltroStatus;

function atlasEscaparHtml(valor){
  return String(valor ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

window.atlasRemessasAReceberCache = window.atlasRemessasAReceberCache || new Map();

function atlasRotuloStatusRemessa(status){
  return ({
    AGUARDANDO_RETIRADA:"Aguardando saída",
    EM_TRANSITO:"Em trânsito",
    AGUARDANDO_CONFERENCIA:"Aguardando conferência"
  })[String(status||"").toUpperCase()] || String(status||"").replaceAll("_"," ");
}

async function atlasIrParaRecebimentoRemessa(pedidoId){
  const id=Number(pedidoId);
  if(!Number.isFinite(id)) return;

  try{
    /* Patrimônio roda dentro do iframe do shell. A navegação precisa acontecer
       no PARENT, senão um novo atlas.html é aberto dentro do módulo. */
    if(window.parent && window.parent !== window && window.parent.Atlas?.navigate){
      window.parent.Atlas.navigate(`expedicao.html?aba=receber&pedido=${encodeURIComponent(id)}`);
      return;
    }

    if(window.Atlas?.navigate){
      window.Atlas.navigate(`expedicao.html?aba=receber&pedido=${encodeURIComponent(id)}`);
      return;
    }

    location.href=`atlas.html#m=expedicao&aba=receber&pedido=${encodeURIComponent(id)}`;
  }catch(e){
    console.error("Atlas Patrimônio: falha ao abrir recebimento da remessa.",e);
  }
}
window.atlasIrParaRecebimentoRemessa=atlasIrParaRecebimentoRemessa;

function atlasAbrirRemessaAReceber(pedidoId){
  const registro = window.atlasRemessasAReceberCache.get(String(pedidoId));
  if(!registro) return;
  const {remessa,itens}=registro;
  const pats=(itens||[]).filter(i=>i.patrimonio_id);
  const podeReceber=String(remessa.status||"").toUpperCase()==="EM_TRANSITO";
  const overlay=document.createElement("div");
  overlay.className="atlas-remessa-overlay";
  overlay.innerHTML=`
    <div class="atlas-remessa-modal" role="dialog" aria-modal="true">
      <div class="atlas-remessa-modal-topo">
        <div><strong>${atlasEscaparHtml(remessa.codigo||("Remessa #"+remessa.id))}</strong><small>${atlasEscaparHtml(atlasRotuloStatusRemessa(remessa.status))}</small></div>
        <button type="button" class="atlas-remessa-fechar" aria-label="Fechar">×</button>
      </div>
      <div class="atlas-remessa-rota"><span>${atlasEscaparHtml(remessa.obra_origem_nome||remessa.origem_nome||("Obra "+(remessa.obra_origem_id||"origem")))}</span><b>→</b><span>${atlasEscaparHtml(remessa.obra_nome||remessa.obra_destino_nome||"Destino")}</span></div>
      <div class="atlas-remessa-modal-resumo">${pats.length} patrimônio(s) nesta remessa</div>
      <div class="atlas-remessa-itens">${pats.map(i=>`<div><strong>${atlasEscaparHtml(i.patrimonio_codigo||("PAT #"+i.patrimonio_id))}</strong><span>${atlasEscaparHtml(i.patrimonio_nome||"Patrimônio")}</span></div>`).join("") || '<div class="atlas-remessa-vazia">Nenhum patrimônio vinculado.</div>'}</div>
      ${podeReceber?`<div class="atlas-remessa-acoes"><button type="button" class="atlas-remessa-receber">📦 Receber na Expedição</button></div>`:""}
    </div>`;
  const fechar=()=>overlay.remove();
  overlay.querySelector(".atlas-remessa-fechar")?.addEventListener("click",fechar);
  overlay.querySelector(".atlas-remessa-receber")?.addEventListener("click",async()=>{
    fechar();
    await atlasIrParaRecebimentoRemessa(remessa.id);
  });
  overlay.addEventListener("click",e=>{if(e.target===overlay)fechar();});
  document.body.appendChild(overlay);
}
window.atlasAbrirRemessaAReceber=atlasAbrirRemessaAReceber;

async function atlasCarregarAReceber(){
  const card=document.getElementById("atlasCardAReceber"), lista=document.getElementById("atlasAReceberLista"), qtd=document.getElementById("atlasAReceberQtd");
  if(!card||!lista)return;
  // O card só aparece depois que a consulta confirmar remessa real para receber.
  card.hidden=true;
  card.classList.add("atlas-sem-remessa");
  const u=usuarioAtual(), obraDestinoId=u?.obra_id?Number(u.obra_id):null;
  if(!obraDestinoId||patrimonioOffline()){card.hidden=true;card.classList.add("atlas-sem-remessa");return;}
  try{
    const {data:pedidos,error}=await db().from("pedidos_retirada").select("*").eq("obra_destino_id",obraDestinoId).in("status",["AGUARDANDO_RETIRADA","EM_TRANSITO","AGUARDANDO_CONFERENCIA"]).order("id",{ascending:false}).limit(100);
    if(error)throw error;
    const remessas=(pedidos||[]).filter(p=>String(p.codigo||"").startsWith("TR-"));
    if(!remessas.length){card.hidden=true;card.classList.add("atlas-sem-remessa");lista.innerHTML="";if(qtd)qtd.textContent="";return;}
    const {data:itens,error:erroItens}=await db().from("itens_retirada").select("*").in("pedido_id",remessas.map(p=>p.id));
    if(erroItens)throw erroItens;
    const todos=itens||[];
    const origemIds=[...new Set(remessas.map(r=>Number(r.obra_origem_id)).filter(Number.isFinite))];
    let nomesObras=new Map();
    if(origemIds.length){
      try{
        const {data:obrasOrigem}=await db().from("obras").select("id,nome,codigo_obra").in("id",origemIds);
        nomesObras=new Map((obrasOrigem||[]).map(o=>[String(o.id),o.nome||o.codigo_obra||("Obra "+o.id)]));
      }catch(e){}
    }
    window.atlasRemessasAReceberCache.clear();

    const linhas=[];
    let totalPatrimonios=0;
    remessas.forEach(r=>{
      const pats=todos.filter(i=>String(i.pedido_id)===String(r.id)&&i.patrimonio_id);
      totalPatrimonios+=pats.length;
      const unico=pats.length===1;
      const identificacao=unico?(pats[0].patrimonio_codigo||("PAT #"+pats[0].patrimonio_id)):(r.codigo||("Remessa #"+r.id));
      const conteudo=unico?(pats[0].patrimonio_nome||"Patrimônio"):(pats.length+" patrimônios");
      const origem=r.obra_origem_nome||r.origem_nome||nomesObras.get(String(r.obra_origem_id))||("Obra "+(r.obra_origem_id||"origem"));
      const destino=r.obra_nome||r.obra_destino_nome||"Sua obra";
      const remessaCache={...r,obra_origem_nome:origem,obra_destino_nome:destino};
      window.atlasRemessasAReceberCache.set(String(r.id),{remessa:remessaCache,itens:pats});
      linhas.push(`<div class="atlas-a-receber-linha">
        <div class="atlas-a-receber-id"><strong>${atlasEscaparHtml(identificacao)}</strong><span>${atlasEscaparHtml(conteudo)}</span></div>
        <div class="atlas-a-receber-rota"><span>${atlasEscaparHtml(origem)}</span><b>→</b><span>${atlasEscaparHtml(destino)}</span></div>
        <div class="atlas-a-receber-status">${atlasEscaparHtml(atlasRotuloStatusRemessa(r.status))}</div>
        <button type="button" class="atlas-a-receber-olho" onclick="atlasAbrirRemessaAReceber('${r.id}')" title="Ver patrimônios da remessa" aria-label="Ver patrimônios da remessa">◉</button>
      </div>`);
    });
    lista.innerHTML=linhas.slice(0,3).join("") + (linhas.length>3?`<button type="button" class="atlas-a-receber-ver-todas" onclick="this.previousElementSibling">Ver todas (${linhas.length})</button>`:"");
    if(linhas.length>3){
      const btn=lista.querySelector('.atlas-a-receber-ver-todas');
      btn?.addEventListener('click',()=>{lista.innerHTML=linhas.join('');});
    }
    if(qtd)qtd.textContent=`${remessas.length} remessa(s) • ${totalPatrimonios} patrimônio(s)`;
    card.classList.remove("atlas-sem-remessa");
    card.hidden=false;
  }catch(e){console.warn("Atlas Patrimônio: não foi possível carregar remessas a receber.",e?.message||e);card.hidden=true;card.classList.add("atlas-sem-remessa");}
}
window.atlasCarregarAReceber=atlasCarregarAReceber;

async function atlasAplicarTransferenciasAtivasNaLista(){
  if(!Array.isArray(patrimonios) || !patrimonios.length || patrimonioOffline()) return;
  const ids=patrimonios.map(p=>Number(p.id)).filter(Number.isFinite);
  if(!ids.length) return;
  try{
    const {data:itens,error}=await db().from("itens_retirada").select("pedido_id,patrimonio_id").in("patrimonio_id",ids);
    if(error)throw error;
    const pedidoIds=[...new Set((itens||[]).map(i=>i.pedido_id).filter(Boolean))];
    if(!pedidoIds.length)return;
    const {data:pedidos,error:erroPedidos}=await db().from("pedidos_retirada").select("id,status,obra_origem_id,obra_destino_id,obra_nome,codigo").in("id",pedidoIds).in("status",["AGUARDANDO_RETIRADA","EM_TRANSITO","AGUARDANDO_CONFERENCIA"]);
    if(erroPedidos)throw erroPedidos;
    const obraIds=[...new Set((pedidos||[]).flatMap(p=>[Number(p.obra_origem_id),Number(p.obra_destino_id)]).filter(Number.isFinite))];
    let nomesObras=new Map();
    if(obraIds.length){
      const {data:obras}=await db().from("obras").select("id,nome,codigo_obra").in("id",obraIds);
      nomesObras=new Map((obras||[]).map(o=>[String(o.id),o.nome||o.codigo_obra||("Obra "+o.id)]));
    }
    const ativos=new Map((pedidos||[]).map(p=>[String(p.id),{...p,obra_origem_nome:nomesObras.get(String(p.obra_origem_id))||null,obra_destino_nome:p.obra_nome||nomesObras.get(String(p.obra_destino_id))||null}]));
    const porPat=new Map();
    (itens||[]).forEach(i=>{const pedido=ativos.get(String(i.pedido_id));if(pedido&&i.patrimonio_id)porPat.set(String(i.patrimonio_id),pedido);});
    if(!porPat.size)return;
    patrimonios=patrimonios.map(p=>{
      const remessa=porPat.get(String(p.id));
      if(!remessa)return p;
      const st=String(remessa.status||"").toUpperCase();
      const statusContextual=st==="AGUARDANDO_RETIRADA"?"EM_TRANSFERENCIA":"EM_TRANSITO";
      return {...p,status:statusContextual,__atlas_remessa:remessa};
    });
  }catch(e){console.warn("Atlas Patrimônio: não foi possível aplicar o status contextual das transferências.",e?.message||e);}
}

async function carregarPatrimonios(){
  const visualizarInativos = atlasMostrarInativos && atlasPodeVerInativos();

  try{
    const onlineReal = await patrimonioOnlineReal();

    if(!onlineReal){
      let dadosCache = await BDROfflineDB.lerTabela("patrimonio") || [];
      const usuario = usuarioAtual();

      dadosCache = dadosCache.filter(p =>
        visualizarInativos ? p.ativo === false : p.ativo !== false
      );

      if(usuario && !usuarioPodeVerTodasObras()){
        const permitidas = new Set(idsObrasAtuacaoUsuarioBDR());
        dadosCache = dadosCache.filter(p => permitidas.has(String(p.obra_id)));
      }

      patrimonios = dadosCache;
      renderizarPatrimonios();
      mostrarAvisoModoOffline();
      atlasAtualizarBotaoInativos();
      return;
    }

    const usuario = usuarioAtual();


    // Busca todos os patrimônios em páginas de 1000.
    // Evita o teto de uma única resposta do PostgREST/Supabase.
    const TAMANHO_PAGINA = 1000;
    const dados = [];

    for(let inicio = 0; ; inicio += TAMANHO_PAGINA){
      const fim = inicio + TAMANHO_PAGINA - 1;
      let query = db().from("patrimonio").select("*");
      query = visualizarInativos
        ? query.eq("ativo", false)
        : query.neq("ativo", false);

      if(usuario && !usuarioPodeVerTodasObras()){
        const permitidas = idsObrasAtuacaoUsuarioBDR();
        if(!permitidas.length) break;
        query = query.in("obra_id", permitidas);
      }

      const { data:lote, error } = await query
        .order("id", { ascending:false })
        .range(inicio, fim);
      if(error) throw error;

      const pagina = lote || [];
      dados.push(...pagina);
      if(pagina.length < TAMANHO_PAGINA) break;
    }

    // A consulta online já é restringida por obra acima quando o usuário
    // não possui acesso global. Não refiltrar `dados` aqui: além de
    // redundante, `dados` é const e uma reatribuição quebra usuários
    // restritos com "Assignment to constant variable".
    patrimonios = dados;

    // O cache mantém apenas o conjunto carregado nesta visualização.
    if(window.BDROfflineDB?.salvarTabela && !visualizarInativos){
      await BDROfflineDB.salvarTabela("patrimonio", patrimonios);
    }

    await atlasAplicarTransferenciasAtivasNaLista();
    renderizarPatrimonios();
    await atlasCarregarAReceber();
    atlasAtualizarBotaoInativos();

  }catch(e){
    console.warn("Patrimônio: falha ao carregar patrimônios online, usando cache:", e.message || e);
    let dadosCache = await BDROfflineDB.lerTabela("patrimonio") || [];
    const usuario = usuarioAtual();

    dadosCache = dadosCache.filter(p =>
      visualizarInativos ? p.ativo === false : p.ativo !== false
    );

    if(usuario && !usuarioPodeVerTodasObras()){
      const permitidas = new Set(idsObrasAtuacaoUsuarioBDR());
      dadosCache = dadosCache.filter(p => permitidas.has(String(p.obra_id)));
    }

    patrimonios = dadosCache;
    BDR_PATRIMONIO_ONLINE_REAL = false;
    renderizarPatrimonios();
    mostrarAvisoModoOffline();
    atlasAtualizarBotaoInativos();
  }
}


function normalizarBuscaPatrimonio(txt){
  return String(txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function textoBuscaPatrimonio(p){
  return `
    ${p.nome_bem || ""}
    ${p.codigo_qr || ""}
    ${p.codigo_antigo || ""}
    ${p.codigo_bem || ""}
    ${p.patrimonio || ""}
    ${p.localizacao || ""}
    ${p.obra_nome || ""}
    ${p.codigo_obra || ""}
    ${p.marca || ""}
    ${p.modelo || ""}
    ${p.tipo_item || ""}
    ${p.tipo_outro || ""}
    ${p.status || ""}
    ${p.placa || ""}
    ${p.renavam || ""}
    ${p.chassi || ""}
    ${p.numero_serie || ""}
    ${p.serie || ""}
    ${p.numero_chassi || ""}
    ${p.cor || ""}
    ${p.combustivel || ""}
    ${p.ano_fabricacao || ""}
    ${p.ano_modelo || ""}
    ${p.horimetro || ""}
    ${p.quilometragem || ""}
    ${p.estado_conservacao || ""}
    ${p.observacao || ""}
    ${p.usuario_cadastro || ""}
    ${p.origem_cadastro || ""}
    ${p.valor_bem || ""}
  `;
}



function bdrResetPaginaPatrimonio(){
  bdrPatrimonioPaginaAtual = 1;
}

function bdrAlternarFiltroAntigo(botao){
  if(!botao) return;
  const ativo = botao.getAttribute("aria-pressed") === "true";
  botao.setAttribute("aria-pressed", ativo ? "false" : "true");
  botao.classList.toggle("ativo", !ativo);
  bdrResetPaginaPatrimonio();
  renderizarPatrimonios();
}


function bdrNomeCadastradorPatrimonio(nome){
  const bruto = String(nome || "").trim();
  if(!bruto) return "";

  const atual = usuarioAtual();
  const nomeAtual = String(atual?.nome || "").trim();

  // Compatibilidade com cadastros históricos gravados apenas com o primeiro nome.
  if(nomeAtual && nomeAtual.includes(" ")){
    const primeiro = nomeAtual.split(/\s+/)[0];
    if(bruto.localeCompare(primeiro, "pt-BR", {sensitivity:"base"}) === 0){
      return nomeAtual;
    }
  }

  return bruto;
}

function bdrPreencherFiltroUsuariosPatrimonio(){
  const filtro = document.getElementById("filtroUsuario");
  if(!filtro) return;

  const valorAtual = filtro.value;
  const nomes = [...new Set((patrimonios || [])
    .map(p => bdrNomeCadastradorPatrimonio(p.usuario_cadastro))
    .filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "pt-BR", {sensitivity:"base"}));

  filtro.replaceChildren(new Option("Todos os cadastradores", ""));

  nomes.forEach(nome => filtro.add(new Option(nome, nome)));

  if(nomes.includes(valorAtual)) filtro.value = valorAtual;
}


function bdrPatrimonioFiltroChave(){
  return [
    valor("busca"),
    valor("filtroObra"),
    valor("filtroStatus"),
    valor("filtroTipo"),
    valor("filtroUsuario"),
    document.getElementById("filtroAntigo")?.getAttribute("aria-pressed") === "true" ? "ANTIGO" : "",
    atlasMostrarInativos ? "INATIVOS" : "ATIVOS"
  ].join("||");
}

function bdrPatrimonioPaginaAnterior(){
  if(bdrPatrimonioPaginaAtual > 1){
    bdrPatrimonioPaginaAtual--;
    renderizarPatrimonios();
  }
}

function bdrPatrimonioProximaPagina(totalPaginas){
  if(bdrPatrimonioPaginaAtual < Number(totalPaginas || 1)){
    bdrPatrimonioPaginaAtual++;
    renderizarPatrimonios();
  }
}

function renderizarPatrimonios(){

  const buscaOriginal = valor("busca");
  const busca = normalizarBuscaPatrimonio(buscaOriginal);
  const filtroStatus = valor("filtroStatus");
  const filtroTipo = valor("filtroTipo");
  const filtroObra = valor("filtroObra");
  const filtroUsuario = valor("filtroUsuario");
  const filtroAntigo = document.getElementById("filtroAntigo")?.getAttribute("aria-pressed") === "true";

  bdrPreencherFiltroUsuariosPatrimonio();

  const chaveFiltro = bdrPatrimonioFiltroChave();
  if(chaveFiltro !== bdrPatrimonioUltimaChaveFiltro){
    bdrPatrimonioPaginaAtual = 1;
    bdrPatrimonioUltimaChaveFiltro = chaveFiltro;
  }

  const lista = document.getElementById("lista");
  lista.innerHTML = "";

  const filtrados = patrimonios.filter(p => {
    const textoBusca = normalizarBuscaPatrimonio(textoBuscaPatrimonio(p));
    const estadoAtivoCorreto = atlasMostrarInativos ? p.ativo === false : p.ativo !== false;

    return estadoAtivoCorreto &&
      (!busca || textoBusca.includes(busca)) &&
      (!filtroObra || String(p.obra_id || "") === String(filtroObra)) &&
      (!filtroStatus || p.status === filtroStatus) &&
      (!filtroTipo || p.tipo_item === filtroTipo) &&
      (!filtroUsuario || bdrNomeCadastradorPatrimonio(p.usuario_cadastro) === filtroUsuario) &&
      (!filtroAntigo || String(p.codigo_antigo || "").trim() !== "");
  });

  const total = filtrados.length;
  const porPagina = bdrPatrimonioPorPagina;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  if(bdrPatrimonioPaginaAtual > totalPaginas) bdrPatrimonioPaginaAtual = totalPaginas;

  const inicio = (bdrPatrimonioPaginaAtual - 1) * porPagina;
  const fim = Math.min(inicio + porPagina, total);
  const pagina = filtrados.slice(inicio, fim);

  if(total === 0){
    lista.innerHTML = `
      <p>Nenhum patrimônio encontrado.</p>
      ${buscaOriginal ? `<p style="color:#6b7280;font-size:12px;">Busca feita por: <b>${buscaOriginal}</b></p>` : ""}
    `;
    return;
  }

  lista.innerHTML = `
    <div class="lista-header">
      <div class="bdr-check-etiqueta"><input type="checkbox" aria-label="Selecionar itens desta página" title="Selecionar itens desta página" onchange="bdrSelecionarPaginaEtiquetas(this.checked)"></div>
      <div>Código</div>
      <div>Patrimônio</div>
      <div>Obra / Setor</div>
      <div>Tipo</div>
      <div>Valor</div>
      <div>Status</div>
    </div>
  `;

  pagina.forEach(p => {

    const statusClasse = String(p.status || "")
      .replaceAll(" ", "-")
      .replaceAll("_", "-")
      .replaceAll("Ç", "C")
      .replaceAll("Ã", "A");

    const infoExtra = [
      p.placa ? "Placa: " + p.placa : "",
      p.renavam ? "RENAVAM: " + p.renavam : "",
      p.chassi ? "Chassi: " + p.chassi : "",
      p.numero_serie ? "Série: " + p.numero_serie : "",
      p.ano_modelo ? "Ano mod: " + p.ano_modelo : ""
    ].filter(Boolean).join(" | ");

    lista.innerHTML += `
      <div class="linha-patrimonio" onclick="bdrCliqueLinhaPatrimonio(event,'${p.id}','${p.codigo_qr || ''}')">

        <div class="bdr-check-etiqueta" onclick="event.stopPropagation()">
          <input type="checkbox" class="bdr-etiqueta-check" data-codigo="${p.codigo_qr || ''}" ${bdrEtiquetasSelecionadas.has(String(p.codigo_qr || '')) ? 'checked' : ''} onchange="bdrAlternarSelecaoEtiqueta(this.dataset.codigo,this.checked)" aria-label="Selecionar etiqueta ${p.codigo_qr || ''}">
        </div>

        <div class="pat-codigo" title="${p.codigo_qr || "-"}">
          ${p.codigo_qr || "-"} ${p.__offline_pendente ? '<span class="bdr-pendente-offline">OFFLINE</span>' : ''}
        </div>

        <div class="pat-nome" title="${p.nome_bem || "-"} ${infoExtra}">
          ${p.nome_bem || "-"}
          ${infoExtra ? `<br><small style="color:#6b7280;font-weight:700;">${infoExtra}</small>` : ""}
        </div>

        <div class="pat-local" title="${p.__atlas_remessa ? ((p.__atlas_remessa.obra_origem_nome || p.localizacao || "Origem") + " → " + (p.__atlas_remessa.obra_destino_nome || "Destino")) : (p.localizacao || "SEM OBRA")}">
          ${p.__atlas_remessa ? `<strong>${atlasEscaparHtml(p.__atlas_remessa.obra_origem_nome || p.localizacao || "Origem")}</strong> <b class="atlas-rota-seta">→</b> <strong>${atlasEscaparHtml(p.__atlas_remessa.obra_destino_nome || "Destino")}</strong>` : (p.localizacao || "SEM OBRA")}
        </div>

        <div class="pat-tipo">
          ${p.tipo_item || "-"}
        </div>

        <div class="pat-valor">
          ${formatarMoeda(p.valor_bem)}
        </div>

        <div class="pat-status status-${statusClasse}">
          ${String(p.status || "SEM STATUS").replace(/_/g, " ")}
        </div>

      </div>
    `;
  });

  lista.innerHTML += `
    <div class="bdr-paginacao">
      <button type="button" onclick="bdrPatrimonioPaginaAnterior()" ${bdrPatrimonioPaginaAtual <= 1 ? "disabled" : ""}>◀ Anterior</button>
      <span class="pagina-info">Página ${bdrPatrimonioPaginaAtual} de ${totalPaginas}</span>
      <button type="button" onclick="bdrPatrimonioProximaPagina(${totalPaginas})" ${bdrPatrimonioPaginaAtual >= totalPaginas ? "disabled" : ""}>Próxima ▶</button>
    </div>
  `;
  bdrAtualizarContadorEtiquetas();
}

function bdrCliqueLinhaPatrimonio(event,id,codigo){
  if(document.body.classList.contains("bdr-modo-selecao-etiquetas")){
    if(event?.target?.closest?.("input,button,a,select,label")) return;

    const chave = String(codigo || "");
    if(!chave) return;

    const check = [...document.querySelectorAll(".bdr-etiqueta-check")]
      .find(el => String(el.dataset.codigo || "") === chave);
    const marcar = check ? !check.checked : !bdrEtiquetasSelecionadas.has(chave);

    if(check) check.checked = marcar;
    bdrAlternarSelecaoEtiqueta(chave, marcar);
    return;
  }

  abrirModal(id);
}


function bdrAlternarSelecaoEtiqueta(codigo, marcado){
  codigo = String(codigo || "").trim();
  if(!codigo) return;
  if(marcado) bdrEtiquetasSelecionadas.add(codigo); else bdrEtiquetasSelecionadas.delete(codigo);
  bdrAtualizarContadorEtiquetas();
}

function bdrSelecionarPaginaEtiquetas(marcado){
  document.querySelectorAll(".bdr-etiqueta-check").forEach(check => {
    check.checked = marcado;
    bdrAlternarSelecaoEtiqueta(check.dataset.codigo, marcado);
  });
}

function bdrAtualizarContadorEtiquetas(){
  const quantidade = bdrEtiquetasSelecionadas.size;
  const el = document.getElementById("bdrQtdEtiquetasSelecionadas");
  const ajuda = document.getElementById("bdrLoteAjuda");
  const btnSelecionar = document.getElementById("bdrBotaoSelecaoPatrimonio");
  const btnEtiquetas = document.getElementById("bdrBotaoAcaoEtiquetas");
  const btnRemessa = document.getElementById("bdrBotaoAcaoRemessa");
  const btnManutencao = document.getElementById("bdrBotaoAcaoManutencao");

  if(el) el.textContent = `${quantidade} patrimônio(s) selecionado(s)`;
  if(ajuda) ajuda.textContent = bdrModoSelecaoEtiquetas
    ? "Selecione os patrimônios na lista e depois escolha a ação."
    : "Imprima etiquetas, transfira ou envie patrimônios para manutenção.";

  if(btnSelecionar) btnSelecionar.style.display = bdrModoSelecaoEtiquetas ? "none" : "inline-flex";
  [btnEtiquetas,btnRemessa,btnManutencao].forEach(btn=>{
    if(!btn) return;
    btn.style.display = bdrModoSelecaoEtiquetas ? "inline-flex" : "none";
    btn.disabled = quantidade === 0;
  });
  if(btnEtiquetas) btnEtiquetas.textContent = quantidade ? `🏷 Etiquetas (${quantidade})` : "🏷 Etiquetas";
  if(btnRemessa) btnRemessa.textContent = quantidade ? `↔ Transferência (${quantidade})` : "↔ Transferência";
  if(btnManutencao) btnManutencao.textContent = quantidade ? `🔧 Manutenção (${quantidade})` : "🔧 Manutenção";
}
function bdrEntrarModoSelecaoPatrimonios(){
  // Entrar no modo de seleção é uma ação normal: não exibe aviso.
  // A regra de mesma obra só é validada quando Transferência/Manutenção for executada.
  bdrEntrarModoSelecaoEtiquetas();
}

function bdrPatrimoniosSelecionadosAtuais(){
  const codigos = new Set(Array.from(bdrEtiquetasSelecionadas).map(v=>String(v)));
  return patrimonios.filter(p=>codigos.has(String(p.codigo_qr || "")));
}

async function bdrEnviarSelecionadosRemessa(){
  const itens=bdrPatrimoniosSelecionadosAtuais();
  if(!itens.length){ atlasAvisoPatrimonio?.("Atlas Patrimônio","Selecione pelo menos um patrimônio.","info"); return; }
  const obras=[...new Set(itens.map(p=>String(p.obra_id||"")))].filter(Boolean);
  if(obras.length!==1){ atlasAvisoPatrimonio?.("Transferência patrimonial","Para transferir, selecione patrimônios que estejam atualmente na mesma obra/setor.","info"); return; }
  if(!window.AtlasPatrimonioRemessas?.abrirComPatrimonios){ alert("Transferência patrimonial não está disponível."); return; }
  await window.AtlasPatrimonioRemessas.abrirComPatrimonios(itens.map(p=>p.id));
}

async function bdrEnviarSelecionadosManutencao(){
  const itens=bdrPatrimoniosSelecionadosAtuais();
  if(!itens.length){ atlasAvisoPatrimonio?.("Atlas Patrimônio","Selecione pelo menos um patrimônio.","info"); return; }
  const obras=[...new Set(itens.map(p=>String(p.obra_id||"")))].filter(Boolean);
  if(obras.length!==1){ atlasAvisoPatrimonio?.("Manutenção patrimonial","Para manutenção, selecione patrimônios que estejam atualmente na mesma obra/setor.","info"); return; }
  if(!window.AtlasManutencao?.abrirPatrimoniosSelecionados){ alert("Central de Manutenção não está disponível."); return; }
  await window.AtlasManutencao.abrirPatrimoniosSelecionados(itens.map(p=>p.id));
}

function bdrEntrarModoSelecaoEtiquetas(){
  bdrModoSelecaoEtiquetas = true;
  document.body.classList.add("bdr-modo-selecao-etiquetas");
  bdrAtualizarContadorEtiquetas();
}

function bdrCancelarSelecaoEtiquetas(){
  bdrEtiquetasSelecionadas.clear();
  document.querySelectorAll(".bdr-etiqueta-check").forEach(c => c.checked=false);
  const checkPagina = document.querySelector('.lista-header .bdr-check-etiqueta input');
  if(checkPagina) checkPagina.checked = false;
  bdrModoSelecaoEtiquetas = false;
  document.body.classList.remove("bdr-modo-selecao-etiquetas");
  bdrAtualizarContadorEtiquetas();
}

function bdrLimparSelecaoEtiquetas(){
  bdrEtiquetasSelecionadas.clear();
  document.querySelectorAll(".bdr-etiqueta-check").forEach(c => c.checked=false);
  bdrAtualizarContadorEtiquetas();
}

function bdrAcaoPrincipalEtiquetas(){
  if(!bdrModoSelecaoEtiquetas){
    bdrEntrarModoSelecaoEtiquetas();
    return;
  }
  bdrImprimirEtiquetasSelecionadas();
}

function bdrImprimirEtiquetasSelecionadas(){
  if(!usuarioTemPermissao("PATRIMONIO_IMPRIMIR")){
    alert("Você não tem permissão para imprimir etiquetas.");
    return;
  }

  const codigos = Array.from(bdrEtiquetasSelecionadas);
  if(!codigos.length){
    alert("Selecione pelo menos um patrimônio na lista.");
    return;
  }

  if(!window.AtlasEtiquetasLote){
    alert("O módulo de impressão em lote não foi carregado.");
    return;
  }

  window.AtlasEtiquetasLote.abrir(codigos);
}

function bdrLabelTipo(tipo, tipoOutro=""){
  const mapa = {
    ELETRONICO:"Eletrônico",
    ELETRODOMESTICO:"Eletrodoméstico",
    VEICULO:"Veículo",
    FERRAMENTA:"Ferramenta",
    MAQUINA:"Máquina",
    MOBILIARIO:"Mobiliário",
    INFORMATICA:"Informática",
    EQUIPAMENTO:"Equipamento",
    MATERIAL_APOIO:"Material de apoio",
    OUTRO:"Outro"
  };
  const base = mapa[String(tipo || "").toUpperCase()] || tipo || "-";
  return tipoOutro ? `${base} - ${tipoOutro}` : base;
}

function bdrLabelEstado(estado){
  const v = String(estado || "").toUpperCase().trim();

  const mapa = {
    "1":"Ótimo",
    "2":"Bom",
    "3":"Regular",
    "4":"Ruim",
    "5":"Ruim",
    "NOVO":"Ótimo",
    "OTIMO":"Ótimo",
    "ÓTIMO":"Ótimo",
    "BOM":"Bom",
    "REGULAR":"Regular",
    "RUIM":"Ruim",
    "INSERVIVEL":"Ruim",
    "INSERVÍVEL":"Ruim"
  };

  return mapa[v] || (estado ? String(estado) : "-");
}

function bdrTemValor(v){
  const txt = String(v ?? "").trim();
  if(!txt) return false;
  return !["-", "NULL", "null", "undefined"].includes(txt);
}

function bdrLinhaInfo(label, valor){
  if(!bdrTemValor(valor)) return "";
  return `<strong>${label}:</strong> ${valor}<br>`;
}

function bdrLinhasTipoPatrimonio(p){
  const tipo = String(p.tipo_item || "").toUpperCase();
  let html = "";

  html += bdrLinhaInfo("Marca", p.marca);
  html += bdrLinhaInfo("Modelo", p.modelo);

  if(tipo === "VEICULO"){
    html += bdrLinhaInfo("Placa", p.placa);
    html += bdrLinhaInfo("RENAVAM", p.renavam);
    html += bdrLinhaInfo("Chassi", p.chassi);
    html += bdrLinhaInfo("Cor", p.cor);
    html += bdrLinhaInfo("Combustível", p.combustivel);
    html += bdrLinhaInfo("Ano fabricação", p.ano_fabricacao);
    html += bdrLinhaInfo("Ano modelo", p.ano_modelo);
    html += bdrLinhaInfo("KM/Horímetro", p.horimetro || p.quilometragem);
    return html;
  }

  if(tipo === "MAQUINA"){
    html += bdrLinhaInfo("Potência", p.potencia);
    html += bdrLinhaInfo("Combustível", p.combustivel);
    html += bdrLinhaInfo("Ano fabricação", p.ano_fabricacao);
    html += bdrLinhaInfo("Ano modelo", p.ano_modelo);
    html += bdrLinhaInfo("Horímetro", p.horimetro || p.quilometragem);
    html += bdrLinhaInfo("Nº Série", p.numero_serie);
    return html;
  }

  if(["ELETRONICO","ELETRODOMESTICO","FERRAMENTA","INFORMATICA","EQUIPAMENTO"].includes(tipo)){
    html += bdrLinhaInfo("Nº Série", p.numero_serie);
    return html;
  }

  if(["MOBILIARIO","MATERIAL_APOIO"].includes(tipo)){
    return html;
  }

  html += bdrLinhaInfo("Nº Série", p.numero_serie);
  return html;
}

async function atlasBuscarTransferenciaAtivaPatrimonio(patrimonioId){
  if(!db() || !patrimonioId) return null;

  const { data:itens, error:erroItens } = await db()
    .from("itens_retirada")
    .select("pedido_id,status,obra_origem_id,obra_destino_id,patrimonio_codigo")
    .eq("patrimonio_id", patrimonioId)
    .neq("status", "CANCELADO")
    .order("id", {ascending:false});
  if(erroItens) throw erroItens;
  const ids = [...new Set((itens || []).map(i => i.pedido_id).filter(Boolean))];
  if(!ids.length) return null;

  const { data:pedidos, error:erroPedidos } = await db()
    .from("pedidos_retirada")
    .select("id,codigo,status,obra_origem_id,obra_destino_id,obra_id,obra_nome,observacao")
    .in("id", ids)
    .in("status", ["AGUARDANDO_RETIRADA","EM_TRANSITO","AGUARDANDO_CONFERENCIA"])
    .order("id", {ascending:false})
    .limit(1);
  if(erroPedidos) throw erroPedidos;
  return Array.isArray(pedidos) && pedidos.length ? pedidos[0] : null;
}

function atlasAplicarBloqueioTransferencia(pedido){
  const box = document.getElementById("atlasTransferenciaBloqueio");
  const btnCancelar = document.getElementById("btnCancelarTransferencia");
  const controles = document.getElementById("atlasControlesPatrimonioAtivo");
  const ativa = !!pedido;
  const status = String(pedido?.status || "").toUpperCase();

  if(box){
    box.style.display = ativa ? "" : "none";
    box.innerHTML = ativa
      ? `<strong>🔒 Patrimônio vinculado à transferência ${atlasEscapeHtml(pedido.codigo || ("#" + pedido.id))}</strong><br>` +
        (status === "AGUARDANDO_RETIRADA"
          ? "Aguardando saída. Status e obra estão bloqueados. Se a transferência foi criada por engano, cancele-a antes do envio."
          : "A remessa já saiu da origem. Status e obra ficam bloqueados até o recebimento no destino.")
      : "";
  }

  if(controles) controles.style.display = ativa ? "none" : "";

  document.querySelectorAll(".acao-movimentar,.acao-editar,.acao-excluir").forEach(btn => {
    if(ativa){ btn.style.display = "none"; btn.disabled = true; }
  });

  if(btnCancelar){
    btnCancelar.style.display = status === "AGUARDANDO_RETIRADA" ? "" : "none";
    btnCancelar.disabled = status !== "AGUARDANDO_RETIRADA";
    btnCancelar.dataset.pedidoId = pedido?.id || "";
  }
}

let atlasPedidoCancelamentoAtual = null;

function fecharModalCancelarTransferencia(){
  const bg = document.getElementById("modalCancelarTransferenciaBg");
  if(bg) bg.style.display = "none";
  const motivo = document.getElementById("cancelarTransferenciaMotivo");
  const erro = document.getElementById("cancelarTransferenciaErro");
  const btn = document.getElementById("btnConfirmarCancelamentoTransferencia");
  if(motivo) motivo.value = "";
  if(erro){ erro.style.display = "none"; erro.textContent = ""; }
  if(btn){ btn.disabled = false; btn.textContent = "✖ Cancelar transferência"; }
  atlasPedidoCancelamentoAtual = null;
}

function atlasErroCancelamentoTransferencia(mensagem){
  const erro = document.getElementById("cancelarTransferenciaErro");
  if(!erro) return;
  erro.textContent = String(mensagem || "Não foi possível cancelar a transferência.");
  erro.style.display = "block";
}

async function cancelarTransferenciaAtual(){
  if(!patrimonioSelecionado) return;
  try{
    const pedido = await atlasBuscarTransferenciaAtivaPatrimonio(patrimonioSelecionado.id);
    if(!pedido){
      atlasAvisoPatrimonio("Transferência não encontrada", "Este patrimônio não possui transferência ativa.", "offline");
      return;
    }
    if(String(pedido.status || "").toUpperCase() !== "AGUARDANDO_RETIRADA"){
      atlasAvisoPatrimonio("Cancelamento bloqueado", "A remessa já saiu da origem e deve ser recebida no destino.", "offline");
      return;
    }

    atlasPedidoCancelamentoAtual = pedido;
    const resumo = document.getElementById("cancelarTransferenciaResumo");
    const motivo = document.getElementById("cancelarTransferenciaMotivo");
    const erro = document.getElementById("cancelarTransferenciaErro");
    if(resumo){
      resumo.innerHTML =
        `<strong>${atlasEscapeHtml(pedido.codigo || ("#" + pedido.id))}</strong><br>` +
        `<strong>${atlasEscapeHtml(patrimonioSelecionado.codigo_qr || patrimonioSelecionado.codigo_bem || "Patrimônio")}</strong> — ${atlasEscapeHtml(patrimonioSelecionado.nome_bem || "")}`;
    }
    if(motivo) motivo.value = "";
    if(erro){ erro.style.display = "none"; erro.textContent = ""; }
    const bg = document.getElementById("modalCancelarTransferenciaBg");
    if(bg) bg.style.display = "flex";
    setTimeout(()=>motivo?.focus(), 50);
  }catch(e){
    console.error("Atlas Patrimônio: falha ao preparar cancelamento.", e);
    atlasAvisoPatrimonio("Falha ao abrir cancelamento", e?.message || "Não foi possível consultar a transferência.", "offline");
  }
}

async function confirmarCancelamentoTransferencia(){
  const pedido = atlasPedidoCancelamentoAtual;
  const motivoEl = document.getElementById("cancelarTransferenciaMotivo");
  const btn = document.getElementById("btnConfirmarCancelamentoTransferencia");
  const motivo = String(motivoEl?.value || "").trim();

  if(!pedido){ atlasErroCancelamentoTransferencia("A transferência não está mais disponível. Feche e abra novamente."); return; }
  if(motivo.length < 5){ atlasErroCancelamentoTransferencia("Informe um motivo com pelo menos 5 caracteres."); motivoEl?.focus(); return; }
  if(!window.AtlasWorkflow?.cancelarTransferenciaPatrimonio){ atlasErroCancelamentoTransferencia("O Workflow de cancelamento não foi carregado. Atualize a página."); return; }

  try{
    if(btn){ btn.disabled = true; btn.textContent = "Cancelando..."; }
    const patrimonioId = patrimonioSelecionado?.id;
    await window.AtlasWorkflow.cancelarTransferenciaPatrimonio(pedido.id, motivo);
    const statusAnteriorMov = await db().from("movimentacoes")
      .select("status_novo")
      .eq("patrimonio_id", patrimonioId)
      .eq("tipo", "TRANSFERENCIA_CANCELADA")
      .order("data_movimentacao", {ascending:false}).limit(1).maybeSingle();
    const restaurado = statusAnteriorMov?.data?.status_novo || "EM_USO";
    patrimonios = patrimonios.map(p => Number(p.id) === Number(patrimonioId) ? {...p,status:restaurado} : p);
    fecharModalCancelarTransferencia();
    fecharModal();
    await carregarPatrimonios();
    await atlasCarregarAReceber();
    atlasAvisoPatrimonio("Transferência cancelada", `A remessa ${pedido.codigo || ("#" + pedido.id)} foi cancelada e o patrimônio voltou ao estado anterior.`);
  }catch(e){
    console.error("Atlas Patrimônio: falha ao cancelar transferência.", e);
    atlasErroCancelamentoTransferencia(e?.message || "Não foi possível cancelar a transferência.");
    if(btn){ btn.disabled = false; btn.textContent = "✖ Cancelar transferência"; }
  }
}

async function abrirModal(id){

  const p = patrimonios.find(
    x => String(x.id) === String(id) || Number(x.id) === Number(id)
  );

  if(!p){
    alert("Patrimônio não encontrado.");
    return;
  }

  patrimonioSelecionado = p;

  document.getElementById("modalTitulo").innerText =
    p.nome_bem || "Patrimônio";

  let blocoExclusao = "";
  const inativoSelecionado = p.ativo === false || String(p.status || "").toUpperCase() === "INATIVO";

  if(inativoSelecionado && atlasPodeVerInativos()){
    blocoExclusao = await atlasMontarBlocoExclusao(p);
  }

  document.getElementById("modalInfo").innerHTML = `
    ${blocoExclusao}
    ${bdrLinhaInfo("Código", p.codigo_qr)}
    ${bdrLinhaInfo("Código antigo", p.codigo_antigo)}
    ${bdrLinhaInfo("NCM", p.ncm)}
    ${bdrLinhaInfo("Número da NF-e", p.numero_nfe)}
    ${bdrLinhaInfo("Descrição", p.descricao)}
    ${bdrLinhaInfo("Fornecedor", p.fornecedor)}
    ${bdrLinhaInfo("Data de aquisição", p.data_compra ? new Date(p.data_compra + "T00:00:00").toLocaleDateString("pt-BR") : null)}
    ${bdrLinhaInfo("Responsável", p.responsavel)}
    ${bdrLinhaInfo("Departamento / setor", p.departamento)}
    ${bdrLinhaInfo("Localização detalhada", p.endereco_estoque)}
    ${bdrLinhaInfo("Origem", p.origem_cadastro)}
    ${bdrLinhaInfo("Cadastrado por", p.usuario_cadastro)}
    ${bdrLinhaInfo("Status", p.status)}
    ${bdrLinhaInfo("Obra", p.localizacao)}
    ${bdrLinhaInfo("Tipo", bdrLabelTipo(p.tipo_item, p.tipo_outro))}
    ${bdrLinhasTipoPatrimonio(p)}
    ${bdrLinhaInfo("Valor", formatarMoeda(p.valor_bem))}
    ${bdrLinhaInfo("Estado de conservação", bdrLabelEstado(p.estado_conservacao))}
    ${bdrLinhaInfo("Observação", p.observacao)}
  `;

  document.getElementById("observacaoMov").value = "";
  document.getElementById("novaObraSelect").value = "";

  aplicarPermissoesTela();

  const inativo = p.ativo === false || String(p.status || "").toUpperCase() === "INATIVO";
  const controlesAtivo = document.getElementById("atlasControlesPatrimonioAtivo");
  const botaoReativar = document.getElementById("btnReativarPatrimonio");

  // Patrimônio inativo fica somente para consulta, impressão e reativação.
  if(controlesAtivo){
    controlesAtivo.style.display = inativo ? "none" : "";
  }

  document.querySelectorAll(".acao-movimentar,.acao-editar,.acao-excluir").forEach(btn => {
    if(inativo){
      btn.style.display = "none";
      btn.disabled = true;
    }
  });

  if(botaoReativar){
    botaoReativar.style.display = inativo ? "" : "none";
    botaoReativar.disabled = !inativo;
  }

  try{
    const transferenciaAtiva = inativo ? null : await atlasBuscarTransferenciaAtivaPatrimonio(p.id);
    atlasAplicarBloqueioTransferencia(transferenciaAtiva);
  }catch(e){
    console.error("Atlas Patrimônio: não foi possível validar transferência ativa.", e);
    // Falha fechada: se não conseguimos validar, não liberamos movimentação manual.
    atlasAplicarBloqueioTransferencia({id:"?",codigo:"Validação indisponível",status:"EM_TRANSITO"});
  }

  document.getElementById("modalBg").style.display = "flex";
}

function atlasEscapeHtml(valor){
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atlasFormatarDataHora(valor){
  if(!valor) return "-";

  const texto = String(valor).trim();
  const possuiFuso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(texto);

  // data_movimentacao é gravada no horário local de Cuiabá e não possui fuso.
  // Acrescentar "Z" faria o navegador subtrair quatro horas novamente.
  const textoData = possuiFuso
    ? texto
    : texto.replace(" ", "T") + "-04:00";

  const data = new Date(textoData);
  if(Number.isNaN(data.getTime())) return texto;

  return data.toLocaleString("pt-BR", {
    timeZone:"America/Cuiaba",
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit"
  });
}

async function atlasBuscarMovimentacaoExclusao(patrimonioId){
  if(!db() || !patrimonioId) return null;

  const { data, error } = await db()
    .from("movimentacoes")
    .select("*")
    .eq("patrimonio_id", patrimonioId)
    .eq("status_novo", "INATIVO")
    .order("id", { ascending:false })
    .limit(1)
    .maybeSingle();

  if(error){
    console.warn("Atlas: não foi possível carregar os dados da exclusão:", error.message || error);
    return null;
  }
  return data || null;
}

async function atlasMontarBlocoExclusao(patrimonio){
  const mov = await atlasBuscarMovimentacaoExclusao(patrimonio?.id);
  const obraSetor = patrimonio?.localizacao || patrimonio?.obra_nome || patrimonio?.setor || "-";
  const usuario = mov?.usuario || "-";
  const dataHora = atlasFormatarDataHora(mov?.data_movimentacao || mov?.created_at);
  const motivo = mov?.observacao || "-";

  return `
    <div style="margin:0 0 14px;padding:14px;border:1px solid #fecaca;border-left:5px solid #dc2626;border-radius:12px;background:#fff7f7;color:#7f1d1d;">
      <div style="display:inline-flex;align-items:center;gap:7px;margin-bottom:11px;padding:6px 10px;border-radius:999px;background:#fee2e2;color:#991b1b;font-weight:950;font-size:12px;">🚫 PATRIMÔNIO INATIVO</div>
      <div style="font-weight:950;font-size:14px;margin-bottom:10px;">Informações da exclusão</div>
      <div style="display:grid;gap:7px;font-size:12px;line-height:1.45;">
        <div><strong>Data:</strong> ${atlasEscapeHtml(dataHora)}</div>
        <div><strong>Usuário:</strong> ${atlasEscapeHtml(usuario)}</div>
        <div><strong>Obra / Setor:</strong> ${atlasEscapeHtml(obraSetor)}</div>
        <div><strong>Motivo:</strong> ${atlasEscapeHtml(motivo)}</div>
      </div>
    </div>`;
}

function abrirHistoricoPatrimonioAtual(){
  if(!patrimonioSelecionado?.id){ alert("Patrimônio não selecionado."); return; }
  if(!window.AtlasPatrimonioRemessas?.abrirHistoricoPatrimonio){ alert("Histórico patrimonial não está disponível."); return; }
  window.AtlasPatrimonioRemessas.abrirHistoricoPatrimonio(patrimonioSelecionado.id);
}

function fecharHistoricoPatrimonioAtual(){
  window.AtlasPatrimonioRemessas?.fechar?.("atlasHistoricoPatrimonioModal");
}

function fecharModal(){
  document.getElementById("modalBg").style.display = "none";
  patrimonioSelecionado = null;
}

function aplicarPermissoesTela(){
  const usuario = usuarioAtual();

  if(!usuario) return;

  const podeCadastrar =
    usuarioEhGestao() ||
    usuarioTemPermissao("PATRIMONIO_CRIAR");

  const podeMovimentar =
    usuarioEhGestao() ||
    usuarioTemPermissao("PATRIMONIO_MOVIMENTAR");

  const podeEditar =
    usuarioEhGestao() ||
    usuarioTemPermissao("PATRIMONIO_EDITAR") ||
    usuarioTemPermissao("PATRIMONIO_CRIAR");

  const podeImprimir =
    usuarioEhGestao() ||
    usuarioTemPermissao("PATRIMONIO_IMPRIMIR");

  // Quem já consegue trabalhar/movimentar patrimônio também pode excluí-lo.
  // A exclusão é lógica: o registro é preservado internamente.
  const podeExcluir =
    usuarioEhGestao() ||
    usuarioTemPermissao("PATRIMONIO_MOVIMENTAR") ||
    usuarioTemPermissao("PATRIMONIO_EXCLUIR") ||
    usuarioTemPermissao("PATRIMONIO_EDITAR") ||
    usuarioTemPermissao("PATRIMONIO_CRIAR");

  const cardEntrada = document.getElementById("cardEntradaPatrimonio");
  const cardObra = document.getElementById("cardObraLancamento");

  if(cardEntrada){
    cardEntrada.style.display = podeCadastrar ? "" : "none";
  }

  if(cardObra){
    cardObra.style.display = podeCadastrar ? "" : "none";
  }

  document.querySelectorAll(".acao-movimentar").forEach(btn => {
    btn.style.display = podeMovimentar ? "" : "none";
    btn.disabled = !podeMovimentar;
  });

  document.querySelectorAll(".acao-editar").forEach(btn => {
    btn.style.display = podeEditar ? "" : "none";
    btn.disabled = !podeEditar;
  });

  document.querySelectorAll(".acao-imprimir").forEach(btn => {
    btn.style.display = podeImprimir ? "" : "none";
    btn.disabled = !podeImprimir;
  });

  document.querySelectorAll(".acao-excluir").forEach(btn => {
    btn.style.display = podeExcluir ? "" : "none";
    btn.disabled = !podeExcluir;
  });

  const observacaoMov = document.getElementById("observacaoMov");
  const novaObraSelect = document.getElementById("novaObraSelect");

  if(observacaoMov){
    const podeJustificar = podeMovimentar || podeExcluir;
    observacaoMov.style.display = podeJustificar ? "" : "none";
    observacaoMov.disabled = !podeJustificar;
  }

  if(novaObraSelect){
    novaObraSelect.style.display = podeMovimentar ? "" : "none";
    novaObraSelect.disabled = !podeMovimentar;
  }

  atlasAtualizarBotaoInativos();
}

async function gravarMovimentacao(dados){

  const agoraLocal = new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
const usuarioLogado = JSON.parse(
  localStorage.getItem("usuario_logado")
);

  const payloadMovimentacao = {
    patrimonio_id: dados.patrimonio_id,
    empresa_id: dados.empresa_id,
    obra_origem_id: dados.obra_origem_id,
    obra_destino_id: dados.obra_destino_id,
    tipo: dados.tipo,
    status_anterior: dados.status_anterior,
    status_novo: dados.status_novo,
    observacao: dados.observacao,
    usuario: usuarioLogado?.nome || "Usuário não identificado",
    data_movimentacao: agoraLocal
  };

  const resp = await bdrSalvarPrimeiroNoTablet("movimentacoes", payloadMovimentacao, {
    acao:"MOVIMENTACAO_PATRIMONIO"
  });

  if(resp.error){
    console.error(resp.error);
    alert("Erro ao gravar movimentação: " + resp.error.message);
    return false;
  }

  return true;
}



function diasEntreDatasBDR(inicio, fim){
  if(!inicio) return 0;
  const a = new Date(String(inicio).replace(" ", "T"));
  const b = fim ? new Date(String(fim).replace(" ", "T")) : new Date();
  if(isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 86400000));
}

async function carregarManutencoesPatrimonio(){
  try{
    if(!db()) return;
    const { data, error } = await db()
      .from("manutencoes_patrimonio")
      .select("*")
      .order("id", { ascending:false })
      .limit(500);

    if(error){
      console.warn("Não foi possível carregar manutenções:", error.message);
      manutencoesPatrimonio = [];
      return;
    }

    manutencoesPatrimonio = data || [];
    renderizarAnalyticsManutencao();
  }catch(e){
    console.warn("Analytics manutenção indisponível:", e);
  }
}

function renderizarAnalyticsManutencao(){
  const abertas = manutencoesPatrimonio.filter(m => String(m.status || "ABERTA").toUpperCase() !== "FECHADA");
  const fechadas = manutencoesPatrimonio.filter(m => String(m.status || "").toUpperCase() === "FECHADA");
  const diasLista = manutencoesPatrimonio.map(m => Number(m.dias_parado || diasEntreDatasBDR(m.data_entrada, m.data_saida))).filter(n => n > 0);
  const mediaDias = diasLista.length ? Math.round(diasLista.reduce((s,n)=>s+n,0) / diasLista.length) : 0;
  const custo = manutencoesPatrimonio.reduce((s,m) => s + Number(m.valor_orcamento || 0), 0);

  const set = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; };
  set("kpiManutAbertas", abertas.length);
  set("kpiManutFechadas", fechadas.length);
  set("kpiManutDiasMedios", mediaDias);
  set("kpiManutCusto", formatarMoeda(custo));

  const ranking = {};
  manutencoesPatrimonio.forEach(m => {
    const chave = m.nome_patrimonio || m.codigo_patrimonio || ("ID " + m.patrimonio_id);
    if(!ranking[chave]) ranking[chave] = {qtd:0, dias:0, custo:0};
    ranking[chave].qtd++;
    ranking[chave].dias += Number(m.dias_parado || diasEntreDatasBDR(m.data_entrada, m.data_saida));
    ranking[chave].custo += Number(m.valor_orcamento || 0);
  });

  const top = Object.entries(ranking)
    .sort((a,b) => b[1].qtd - a[1].qtd || b[1].dias - a[1].dias)
    .slice(0,5);

  const box = document.getElementById("listaAnalyticsManutencao");
  if(!box) return;

  if(!manutencoesPatrimonio.length){
    box.innerHTML = `<div class="bdr-manutencao-item">Nenhuma manutenção registrada ainda.</div>`;
    return;
  }

  box.innerHTML = top.map(([nome, r]) => `
    <div class="bdr-manutencao-item">
      <b>${nome}</b><br>
      Ocorrências: <b>${r.qtd}</b> • Dias parado: <b>${r.dias}</b> • Orçamentos: <b>${formatarMoeda(r.custo)}</b>
    </div>
  `).join("");
}

function manutencaoAbertaDoPatrimonio(id){
  return manutencoesPatrimonio.find(m =>
    String(m.patrimonio_id) === String(id) &&
    String(m.status || "ABERTA").toUpperCase() !== "FECHADA"
  );
}

function abrirModalManutencao(){
  if(!patrimonioSelecionado) return;
  const info = document.getElementById("manutInfoAbertura");
  if(info){
    info.innerHTML = `<b>${patrimonioSelecionado.codigo_qr || "-"}</b> • ${patrimonioSelecionado.nome_bem || "-"}<br>Informe o motivo para enviar este patrimônio à manutenção.`;
  }
  document.getElementById("manut_motivo").value = valor("observacaoMov") || "";
  document.getElementById("modalManutencaoBg").style.display = "flex";
}

function fecharModalManutencao(){
  document.getElementById("modalManutencaoBg").style.display = "none";
}

function abrirModalFecharManutencao(novoStatus){
  if(!patrimonioSelecionado) return;
  statusDestinoDepoisManutencao = novoStatus || "ESTOQUE";
  const aberta = manutencaoAbertaDoPatrimonio(patrimonioSelecionado.id);
  const info = document.getElementById("manutInfoFechamento");
  if(info){
    info.innerHTML = `
      <b>${patrimonioSelecionado.codigo_qr || "-"}</b> • ${patrimonioSelecionado.nome_bem || "-"}<br>
      Aberta há <b>${diasEntreDatasBDR(aberta?.data_entrada)} dia(s)</b>. Para sair da manutenção informe orçamento/solução.
    `;
  }
  document.getElementById("manut_fornecedor").value = "";
  document.getElementById("manut_valor_orcamento").value = "";
  document.getElementById("manut_descricao_orcamento").value = "";
  document.getElementById("manut_solucao").value = "";
  document.getElementById("modalFecharManutencaoBg").style.display = "flex";
}

function fecharModalFecharManutencao(){
  document.getElementById("modalFecharManutencaoBg").style.display = "none";
  statusDestinoDepoisManutencao = null;
}

async function registrarEntradaManutencaoBDR(motivo){
  const usuario = usuarioAtual();
  const payload = {
    patrimonio_id: patrimonioSelecionado.id,
    codigo_patrimonio: patrimonioSelecionado.codigo_qr || patrimonioSelecionado.codigo_antigo || null,
    nome_patrimonio: patrimonioSelecionado.nome_bem || null,
    obra_id: patrimonioSelecionado.obra_id || null,
    status: "ABERTA",
    motivo,
    usuario_abertura: usuario?.nome || "Usuário não identificado"
  };

  const { error } = await db().from("manutencoes_patrimonio").insert([payload]);
  if(error) throw error;
}

async function fecharManutencaoBDR(dados){
  const aberta = manutencaoAbertaDoPatrimonio(patrimonioSelecionado.id);
  if(!aberta){
    throw new Error("Não encontrei manutenção aberta para este patrimônio.");
  }

  const usuario = usuarioAtual();
  const dias = diasEntreDatasBDR(aberta.data_entrada, new Date().toISOString());

  const { error } = await db()
    .from("manutencoes_patrimonio")
    .update({
      status: "FECHADA",
      data_saida: new Date().toISOString(),
      dias_parado: dias,
      fornecedor: dados.fornecedor,
      valor_orcamento: dados.valor_orcamento,
      descricao_orcamento: dados.descricao_orcamento,
      solucao: dados.solucao,
      usuario_fechamento: usuario?.nome || "Usuário não identificado"
    })
    .eq("id", aberta.id);

  if(error) throw error;
}

async function confirmarEntradaManutencao(){
  const motivo = valor("manut_motivo");
  if(!motivo || motivo.length < 5){
    alert("Informe o motivo da manutenção com pelo menos 5 caracteres.");
    return;
  }
  document.getElementById("observacaoMov").value = motivo;

  try{
    if(patrimonioOffline()){
      alert("Para registrar manutenção inteligente, é necessário estar online.");
      return;
    }
    await registrarEntradaManutencaoBDR(motivo);
    fecharModalManutencao();
    await alterarStatusBaseBDR("MANUTENCAO", motivo);
    await carregarManutencoesPatrimonio();
  }catch(e){
    console.error(e);
    alert(e.message || "Erro ao abrir manutenção.");
  }
}

async function confirmarFechamentoManutencao(){
  const fornecedor = valor("manut_fornecedor");
  const valorOrcamento = moedaParaNumero(valor("manut_valor_orcamento"));
  const descricao = valor("manut_descricao_orcamento");
  const solucao = valor("manut_solucao");

  if(!fornecedor || fornecedor.length < 2){ alert("Informe o fornecedor/oficina."); return; }
  if(!valorOrcamento || valorOrcamento <= 0){ alert("Informe o valor do orçamento."); return; }
  if(!descricao || descricao.length < 5){ alert("Informe a descrição do orçamento."); return; }
  if(!solucao || solucao.length < 5){ alert("Informe a solução/resultado da manutenção."); return; }

  const obs = `Saída da manutenção | Fornecedor: ${fornecedor} | Orçamento: ${formatarMoeda(valorOrcamento)} | ${descricao} | Solução: ${solucao}`;
  document.getElementById("observacaoMov").value = obs;

  try{
    if(patrimonioOffline()){
      alert("Para fechar manutenção inteligente, é necessário estar online.");
      return;
    }
    await fecharManutencaoBDR({
      fornecedor,
      valor_orcamento: valorOrcamento,
      descricao_orcamento: descricao,
      solucao
    });
    const destino = statusDestinoDepoisManutencao || "ESTOQUE";
    fecharModalFecharManutencao();
    await alterarStatusBaseBDR(destino, obs);
    await carregarManutencoesPatrimonio();
  }catch(e){
    console.error(e);
    alert(e.message || "Erro ao fechar manutenção.");
  }
}


async function alterarStatus(novoStatus){
  if(!usuarioTemPermissao("PATRIMONIO_MOVIMENTAR")){
    alert("Você não tem permissão para movimentar patrimônio.");
    return;
  }

  if(!patrimonioSelecionado){
    alert("Selecione um patrimônio.");
    return;
  }

  const statusAtual = String(patrimonioSelecionado.status || "").toUpperCase();

  const transferenciaAtiva = await atlasBuscarTransferenciaAtivaPatrimonio(patrimonioSelecionado.id);
  if(transferenciaAtiva){
    alert("Este patrimônio está vinculado à remessa " + (transferenciaAtiva.codigo || ("#" + transferenciaAtiva.id)) + ". Status e obra só podem mudar pelo fluxo da transferência.");
    return;
  }

  if(novoStatus === "MANUTENCAO"){
    abrirModalManutencao();
    return;
  }

  if(statusAtual === "MANUTENCAO" && novoStatus !== "MANUTENCAO"){
    abrirModalFecharManutencao(novoStatus);
    return;
  }

  return alterarStatusBaseBDR(novoStatus);
}

async function alterarStatusBaseBDR(novoStatus, observacaoForcada=null){

  if(!usuarioTemPermissao("PATRIMONIO_MOVIMENTAR")){
    alert("Você não tem permissão para movimentar patrimônio.");
    return;
  }


  if(!patrimonioSelecionado){
    alert("Selecione um patrimônio.");
    return;
  }

  const transferenciaAtiva = await atlasBuscarTransferenciaAtivaPatrimonio(patrimonioSelecionado.id);
  if(transferenciaAtiva){
    alert("Alteração manual bloqueada: este patrimônio está vinculado à remessa " + (transferenciaAtiva.codigo || ("#" + transferenciaAtiva.id)) + ".");
    return;
  }

  const obs = observacaoForcada || valor("observacaoMov");

  if(!obs || obs.length < 5){
    alert("Informe uma justificativa da movimentação.");
    return;
  }

  const statusAnterior = patrimonioSelecionado.status || null;

  
  if(patrimonioOffline()){
    await salvarOperacaoPatrimonioOffline("update", "patrimonio", {
      status: novoStatus
    }, {
      filtro:{ id: patrimonioSelecionado.id }
    });

    await salvarOperacaoPatrimonioOffline("insert", "movimentacoes", [{
      patrimonio_id: patrimonioSelecionado.id,
      empresa_id: patrimonioSelecionado.empresa_id,
      obra_origem_id: patrimonioSelecionado.obra_id,
      obra_destino_id: patrimonioSelecionado.obra_id,
      tipo: "ALTERACAO_STATUS",
      status_anterior: statusAnterior,
      status_novo: novoStatus,
      observacao: obs,
      usuario: usuarioAtual()?.nome || "Usuário não identificado",
      data_movimentacao: new Date().toISOString()
    }]);

    patrimonios = patrimonios.map(p =>
      Number(p.id) === Number(patrimonioSelecionado.id)
        ? {...p, status:novoStatus, __offline_pendente:!!respStatus.offlineFirst}
        : p
    );

    alert("📦 Sem internet. Alteração de status salva no aparelho e será sincronizada quando a internet voltar.");

    fecharModal();
    renderizarPatrimonios();
    return;
  }

  const respStatus = await bdrAtualizarPrimeiroNoTablet(
    "patrimonio",
    { id: patrimonioSelecionado.id },
    { status: novoStatus },
    { acao:"ALTERACAO_STATUS_PATRIMONIO" }
  );

  if(respStatus.error){
    console.error(respStatus.error);
    alert(respStatus.error.message || "Erro ao alterar status.");
    return;
  }

  patrimonios = patrimonios.map(p =>
    Number(p.id) === Number(patrimonioSelecionado.id)
      ? {...p, status:novoStatus, __offline_pendente:!!respStatus.offlineFirst}
      : p
  );

  await gravarMovimentacao({
    patrimonio_id: patrimonioSelecionado.id,
    empresa_id: patrimonioSelecionado.empresa_id,
    obra_origem_id: patrimonioSelecionado.obra_id,
    obra_destino_id: patrimonioSelecionado.obra_id,
    tipo: "ALTERACAO_STATUS",
    status_anterior: statusAnterior,
    status_novo: novoStatus,
    observacao: obs
  });

  if(respStatus.offlineFirst){ bdrAvisoSalvoTablet("Status alterado offline. Será sincronizado automaticamente quando a internet voltar."); }

  fecharModal();
  renderizarPatrimonios();
}

async function trocarObra(){
  if(!usuarioTemPermissao("PATRIMONIO_MOVIMENTAR")){
    alert("Você não tem permissão para transferir patrimônio.");
    return;
  }

  if(!patrimonioSelecionado){
    alert("Selecione um patrimônio.");
    return;
  }

  const transferenciaAtiva = await atlasBuscarTransferenciaAtivaPatrimonio(patrimonioSelecionado.id);
  if(transferenciaAtiva){
    alert("Este patrimônio já possui uma transferência ativa (" + (transferenciaAtiva.codigo || ("#" + transferenciaAtiva.id)) + "). Conclua ou cancele a remessa antes de criar outra.");
    return;
  }

  const obs = valor("observacaoMov");
  if(!obs || obs.length < 5){
    alert("Informe uma justificativa da transferência.");
    return;
  }

  const novaObraId = document.getElementById("novaObraSelect")?.value;
  if(!novaObraId){
    alert("Selecione a obra/setor de destino.");
    return;
  }

  const novaObra = obras.find(o => String(o.id) === String(novaObraId));
  if(!novaObra){
    alert("Obra destino não encontrada.");
    return;
  }

  if(String(patrimonioSelecionado.obra_id || "") === String(novaObra.id)){
    alert("Este patrimônio já pertence à obra/setor selecionado.");
    return;
  }

  if(patrimonioOffline()){
    alert("A transferência logística precisa de internet para criar a remessa com segurança. Tente novamente quando a conexão voltar.");
    return;
  }

  if(!window.AtlasWorkflow?.criarTransferenciaDireta){
    alert("O fluxo logístico do Atlas não foi carregado. Atualize a página e tente novamente.");
    return;
  }

  try{
    const resultado = await window.AtlasWorkflow.criarTransferenciaDireta({
      patrimonio:{ ...patrimonioSelecionado },
      obraDestino:{ ...novaObra },
      observacao:obs
    });

    patrimonios = patrimonios.map(p => Number(p.id) === Number(patrimonioSelecionado.id) ? { ...p, status:"EM_TRANSFERENCIA" } : p);
    fecharModal();
    renderizarPatrimonios();
    await atlasCarregarAReceber();

    alert(
      "🚚 Remessa " + (resultado?.codigo || "criada") +
      " criada com sucesso. O patrimônio continua na obra de origem até a saída e só mudará para a obra destino após o recebimento."
    );
  }catch(e){
    console.error("Atlas Patrimônio: erro ao criar transferência direta.", e);
    alert(e?.message || "Não foi possível criar a remessa de transferência.");
  }
}



/* =========================================================
   ATLAS PATRIMÔNIO — DESTINATÁRIOS DAS NOTIFICAÇÕES

   Regra oficial:
   - somente usuário ativo;
   - precisa ter RECEBER_NOTIFICACOES marcado;
   - quem executou a ação não recebe o próprio alerta azul;
   - a confirmação verde local continua aparecendo normalmente.
========================================================= */
async function atlasBuscarDestinatariosNotificacaoPatrimonio(empresaId){
  try{
    const banco = db();
    const autor = usuarioAtual();
    const autorId = autor?.id || autor?.usuario_id || null;

    if(!banco) return [];

    let query = banco
      .from("usuarios_sistema")
      .select("id,nome,usuario,email,empresa_id,ativo,permissoes");

    if(empresaId){
      query = query.eq("empresa_id", empresaId);
    }

    const { data, error } = await query;

    if(error){
      console.warn(
        "Atlas Patrimônio: não foi possível buscar destinatários das notificações.",
        error.message || error
      );
      return [];
    }

    return (data || []).filter(usuario => {
      if(!usuario || usuario.ativo === false) return false;

      if(
        autorId != null &&
        String(usuario.id || "") === String(autorId)
      ){
        return false;
      }

      const permissoes = String(usuario.permissoes || "")
        .split(",")
        .map(item => item.trim().toUpperCase())
        .filter(Boolean);

      return permissoes.includes("RECEBER_NOTIFICACOES");
    });
  }catch(e){
    console.warn(
      "Atlas Patrimônio: falha ao preparar destinatários.",
      e?.message || e
    );
    return [];
  }
}

async function atlasNotificarExclusaoPatrimonio({ patrimonio, motivo, usuarioNome, obraSetor, dataHora }){
  try{
    const gestor = window.AtlasGestorNotificacoes;
    if(!gestor || typeof gestor.criarNotificacao !== "function"){
      console.warn("Atlas: Gestor de Notificações não carregado. A exclusão foi concluída sem notificação.");
      return false;
    }

    const codigo = patrimonio?.codigo_qr || patrimonio?.codigo_bem || "-";
    const descricao = patrimonio?.nome_bem || patrimonio?.descricao || "Patrimônio";
    const mensagem = [
      `Código: ${codigo}`,
      `Descrição: ${descricao}`,
      `Usuário: ${usuarioNome}`,
      `Obra / Setor: ${obraSetor}`,
      `Data: ${dataHora}`,
      `Motivo: ${motivo}`
    ].join(" | ");

    const empresaId =
      patrimonio?.empresa_id ||
      usuarioAtual()?.empresa_id ||
      null;

    const destinatarios =
      await atlasBuscarDestinatariosNotificacaoPatrimonio(empresaId);

    if(!destinatarios.length){
      console.info(
        "Atlas Patrimônio: exclusão concluída sem alerta azul. " +
        "Nenhum outro usuário ativo está marcado para receber notificações."
      );
      return true;
    }

    await gestor.notificarLista(destinatarios, {
      empresa_id:empresaId,
      tipo:"PATRIMONIO_INATIVADO",
      titulo:"🚫 Patrimônio excluído",
      mensagem,
      link:"patrimonio.html?filtro=INATIVO&patrimonio=" +
        encodeURIComponent(patrimonio?.id || ""),
      patrimonio_id:patrimonio?.id || null,
      obra_origem_id:patrimonio?.obra_id || null,
      obra_destino_id:patrimonio?.obra_id || null
    });
    return true;
  }catch(e){
    console.warn("Atlas: falha ao criar notificação da exclusão:", e?.message || e);
    return false;
  }
}

async function inativarPatrimonio(){
  const usuario = usuarioAtual();
  const podeExcluir =
    usuarioEhGestao() ||
    usuarioTemPermissao("PATRIMONIO_MOVIMENTAR") ||
    usuarioTemPermissao("PATRIMONIO_EXCLUIR") ||
    usuarioTemPermissao("PATRIMONIO_EDITAR") ||
    usuarioTemPermissao("PATRIMONIO_CRIAR");

  if(!podeExcluir){
    alert("Você não tem permissão para excluir patrimônio.");
    return;
  }

  if(!patrimonioSelecionado){
    alert("Selecione um patrimônio.");
    return;
  }

  const motivo = valor("observacaoMov");
  if(!motivo || motivo.length < 5){
    alert("Informe o motivo da exclusão com pelo menos 5 caracteres.");
    document.getElementById("observacaoMov")?.focus();
    return;
  }

  const codigo = patrimonioSelecionado.codigo_qr || patrimonioSelecionado.codigo_bem || "-";
  const confirma = await bdrConfirmarAtlas(`Confirma excluir o patrimônio ${codigo}?

Esta ação removerá o patrimônio das consultas do sistema.`);
  if(!confirma) return;

  const statusAnterior = patrimonioSelecionado.status || null;
  const patrimonioExcluido = { ...patrimonioSelecionado };
  const usuarioNome = usuario?.nome || usuario?.usuario || usuario?.email || "Usuário não identificado";
  const obraSetor = patrimonioExcluido.localizacao || patrimonioExcluido.obra_nome || patrimonioExcluido.setor || "-";
  const agoraIso = new Date().toISOString();
  const dataHora = new Date().toLocaleString("pt-BR", {
    timeZone:"America/Cuiaba",
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit"
  });

  const resp = await bdrAtualizarPrimeiroNoTablet(
    "patrimonio",
    { id: patrimonioExcluido.id },
    { ativo:false, status:"INATIVO" },
    { acao:"INATIVACAO_PATRIMONIO", motivo }
  );

  if(resp.error){
    console.error("Atlas: erro técnico ao excluir patrimônio:", resp.error);
    atlasAvisoPatrimonio(
      "Não foi possível excluir",
      "O patrimônio continua ativo. Tente novamente ou entre em contato com o administrador."
    );
    return;
  }

  await gravarMovimentacao({
    patrimonio_id: patrimonioExcluido.id,
    empresa_id: patrimonioExcluido.empresa_id,
    obra_origem_id: patrimonioExcluido.obra_id,
    obra_destino_id: patrimonioExcluido.obra_id,
    tipo:"INATIVACAO",
    status_anterior:statusAnterior,
    status_novo:"INATIVO",
    observacao:motivo
  });

  // A notificação é enviada somente quando houver conexão real.
  if(!resp.offlineFirst){
    await atlasNotificarExclusaoPatrimonio({
      patrimonio:patrimonioExcluido,
      motivo,
      usuarioNome,
      obraSetor,
      dataHora,
      criadoEm:agoraIso
    });
  }

  patrimonios = patrimonios.filter(p => String(p.id) !== String(patrimonioExcluido.id));
  atlasAvisoPatrimonio(
    "✅ Patrimônio excluído",
    "O patrimônio foi removido das consultas do sistema."
  );
  fecharModal();
  renderizarPatrimonios();
}

async function atlasNotificarReativacaoPatrimonio({ patrimonio, usuarioNome, obraSetor, dataHora }){
  try{
    const gestor = window.AtlasGestorNotificacoes;
    if(!gestor || typeof gestor.criarNotificacao !== "function"){
      console.warn("Atlas: Gestor de Notificações não carregado. A reativação foi concluída sem notificação.");
      return false;
    }

    const codigo = patrimonio?.codigo_qr || patrimonio?.codigo_bem || "-";
    const descricao = patrimonio?.nome_bem || patrimonio?.descricao || "Patrimônio";
    const mensagem = [
      `Código: ${codigo}`,
      `Descrição: ${descricao}`,
      `Usuário: ${usuarioNome}`,
      `Obra / Setor: ${obraSetor}`,
      `Data: ${dataHora}`,
      "Novo status: ESTOQUE"
    ].join(" | ");

    const empresaId =
      patrimonio?.empresa_id ||
      usuarioAtual()?.empresa_id ||
      null;

    const destinatarios =
      await atlasBuscarDestinatariosNotificacaoPatrimonio(empresaId);

    if(!destinatarios.length){
      console.info(
        "Atlas Patrimônio: reativação concluída sem alerta azul. " +
        "Nenhum outro usuário ativo está marcado para receber notificações."
      );
      return true;
    }

    await gestor.notificarLista(destinatarios, {
      empresa_id:empresaId,
      tipo:"PATRIMONIO_REATIVADO",
      titulo:"♻️ Patrimônio reativado",
      mensagem,
      link:"patrimonio.html?patrimonio=" +
        encodeURIComponent(patrimonio?.id || ""),
      patrimonio_id:patrimonio?.id || null,
      obra_origem_id:patrimonio?.obra_id || null,
      obra_destino_id:patrimonio?.obra_id || null
    });
    return true;
  }catch(e){
    console.warn("Atlas: falha ao criar notificação da reativação:", e?.message || e);
    return false;
  }
}

async function reativarPatrimonio(){
  const usuario = usuarioAtual();
  const podeReativar =
    usuarioEhGestao() ||
    usuarioTemPermissao("PATRIMONIO_MOVIMENTAR") ||
    usuarioTemPermissao("PATRIMONIO_EXCLUIR") ||
    usuarioTemPermissao("PATRIMONIO_EDITAR") ||
    usuarioTemPermissao("PATRIMONIO_CRIAR");

  if(!podeReativar){
    alert("Você não tem permissão para reativar patrimônio.");
    return;
  }

  if(!patrimonioSelecionado){
    alert("Selecione um patrimônio.");
    return;
  }

  const estaInativo = patrimonioSelecionado.ativo === false ||
    String(patrimonioSelecionado.status || "").toUpperCase() === "INATIVO";

  if(!estaInativo){
    alert("Este patrimônio já está ativo.");
    return;
  }

  const codigo = patrimonioSelecionado.codigo_qr || patrimonioSelecionado.codigo_bem || "-";
  const confirma = await bdrConfirmarAtlas(`Confirma reativar o patrimônio ${codigo}?

Ele voltará ao status ESTOQUE e ficará disponível nas consultas do sistema.`);
  if(!confirma) return;

  const patrimonioReativado = { ...patrimonioSelecionado };
  const usuarioNome = usuario?.nome || usuario?.usuario || usuario?.email || "Usuário não identificado";
  const obraSetor = patrimonioReativado.localizacao || patrimonioReativado.obra_nome || patrimonioReativado.setor || "-";
  const dataHora = new Date().toLocaleString("pt-BR", {
    timeZone:"America/Cuiaba",
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit"
  });

  const resp = await bdrAtualizarPrimeiroNoTablet(
    "patrimonio",
    { id: patrimonioReativado.id },
    { ativo:true, status:"ESTOQUE" },
    { acao:"REATIVACAO_PATRIMONIO" }
  );

  if(resp.error){
    console.error("Atlas: erro técnico ao reativar patrimônio:", resp.error);
    atlasAvisoPatrimonio(
      "Não foi possível reativar",
      "O patrimônio continua inativo. Tente novamente ou entre em contato com o administrador."
    );
    return;
  }

  await gravarMovimentacao({
    patrimonio_id:patrimonioReativado.id,
    empresa_id:patrimonioReativado.empresa_id,
    obra_origem_id:patrimonioReativado.obra_id,
    obra_destino_id:patrimonioReativado.obra_id,
    tipo:"REATIVACAO",
    status_anterior:"INATIVO",
    status_novo:"ESTOQUE",
    observacao:"Patrimônio reativado e devolvido ao estoque."
  });

  if(!resp.offlineFirst){
    await atlasNotificarReativacaoPatrimonio({
      patrimonio:patrimonioReativado,
      usuarioNome,
      obraSetor,
      dataHora
    });
  }

  patrimonios = patrimonios.filter(p => String(p.id) !== String(patrimonioReativado.id));
  atlasAvisoPatrimonio(
    "♻️ Patrimônio reativado",
    "O patrimônio voltou ao estoque e já está disponível nas consultas do sistema."
  );
  fecharModal();
  renderizarPatrimonios();
}

window.reativarPatrimonio = reativarPatrimonio;

// Compatibilidade temporária com chamadas antigas externas.
async function excluirPatrimonio(){
  return inativarPatrimonio();
}

window.inativarPatrimonio = inativarPatrimonio;



let atlasEtiquetaPronta = false;
let atlasEtiquetaToken = 0;
let atlasEtiquetaTimer = null;

function atlasAvisoEtiqueta(mensagem){
  if(typeof window.AtlasDialog?.alert === "function"){
    window.AtlasDialog.alert({ titulo:"Etiqueta", mensagem, tipo:"aviso" });
    return;
  }
  alert(mensagem);
}

function atlasDefinirEstadoImpressao(pronta, texto){
  atlasEtiquetaPronta = Boolean(pronta);
  const botao = document.getElementById("btnImprimirEtiquetaOficial");
  const status = document.getElementById("statusEtiquetaOficial");

  if(botao){
    botao.disabled = !atlasEtiquetaPronta;
    botao.setAttribute("aria-busy", atlasEtiquetaPronta ? "false" : "true");
    botao.innerHTML = atlasEtiquetaPronta
      ? "🖨 Imprimir etiqueta"
      : "⏳ Carregando etiqueta...";
  }

  if(status){
    status.textContent = texto || (atlasEtiquetaPronta ? "Prévia pronta para impressão." : "Carregando configuração e QR Code...");
    status.classList.toggle("pronto", atlasEtiquetaPronta);
  }
}

/* =========================================================
   ATLAS QR LOCAL — CARREGAMENTO E PRÉ-GERAÇÃO
   O patrimônio já aquece o QR depois do cadastro, sem atrasar o salvamento.
========================================================= */
let atlasQRCodeCarregandoPromise=null;
function atlasCarregarScriptLocal(src,id){
  return new Promise((resolve,reject)=>{
    if(id&&document.getElementById(id)){
      const existente=document.getElementById(id);
      if(existente.dataset.carregado==="1")return resolve();
      existente.addEventListener("load",resolve,{once:true});
      existente.addEventListener("error",reject,{once:true});
      return;
    }
    const script=document.createElement("script");
    script.src=src;
    if(id)script.id=id;
    script.onload=()=>{script.dataset.carregado="1";resolve();};
    script.onerror=()=>reject(new Error("Não foi possível carregar "+src));
    document.head.appendChild(script);
  });
}
async function atlasGarantirQRCodeLocal(){
  if(window.AtlasQRCode)return window.AtlasQRCode;
  if(atlasQRCodeCarregandoPromise)return atlasQRCodeCarregandoPromise;
  atlasQRCodeCarregandoPromise=(async()=>{
    if(!window.AtlasQRCodeCore){
      await atlasCarregarScriptLocal("./JS/atlasQRCode/qrcode.min.js?v=1.0.0","atlasQRCodeCoreScript");
    }
    if(!window.AtlasQRCode){
      await atlasCarregarScriptLocal("./JS/atlasQRCode.js?v=1.0.0","atlasQRCodeScript");
    }
    return window.AtlasQRCode;
  })();
  return atlasQRCodeCarregandoPromise;
}
async function atlasPreGerarQRCodePatrimonio(codigo){
  if(!codigo)return null;
  const QR=await atlasGarantirQRCodeLocal();
  return QR.preGerar(codigo,{tamanho:220,nivel:"M"});
}

document.addEventListener("DOMContentLoaded",()=>{
  atlasGarantirQRCodeLocal().catch(error=>console.warn("Atlas QR local não pré-carregado.",error));
});

function imprimirEtiqueta(){
  if(!usuarioTemPermissao("PATRIMONIO_IMPRIMIR")){
    atlasAvisoEtiqueta("Você não tem permissão para imprimir etiqueta.");
    return;
  }

  if(!patrimonioSelecionado){
    atlasAvisoEtiqueta("Selecione um patrimônio.");
    return;
  }

  abrirModalEtiquetaBDR();
}

function bdrCodigoEtiquetaAtual(){
  const p = patrimonioSelecionado || {};
  return p.codigo_qr || p.codigo_antigo || "";
}

function bdrUrlEtiquetaAtual(){
  const p = patrimonioSelecionado || {};
  const codigo = bdrCodigoEtiquetaAtual();
  if(!codigo) return "";

  const params = new URLSearchParams({
    id: codigo,
    local: p.localizacao || p.obra_nome || "SEM OBRA",
    item: p.nome_bem || "ITEM"
  });

  if(p.obra_id) params.set("obra_id", p.obra_id);
  return "etiqueta-impressao.html?" + params.toString();
}

window.addEventListener("message", event => {
  if(event.origin !== location.origin) return;
  if(event.data?.tipo !== "ATLAS_ETIQUETA_PRONTA") return;

  const frame = document.getElementById("bdrEtiquetaFrame");
  if(!frame || event.source !== frame.contentWindow) return;

  clearTimeout(atlasEtiquetaTimer);
  atlasDefinirEstadoImpressao(true, "Prévia pronta. Confira e clique em imprimir.");
});

function abrirModalEtiquetaBDR(){
  const codigo = bdrCodigoEtiquetaAtual();
  if(!codigo){
    atlasAvisoEtiqueta("Esse patrimônio não possui código para imprimir etiqueta.");
    return;
  }

  const modal = document.getElementById("modalEtiquetaBg");
  const frame = document.getElementById("bdrEtiquetaFrame");
  if(!modal || !frame){
    atlasAvisoEtiqueta("A área de impressão não foi carregada corretamente.");
    return;
  }

  atlasEtiquetaToken += 1;
  const tokenAtual = atlasEtiquetaToken;
  clearTimeout(atlasEtiquetaTimer);
  atlasDefinirEstadoImpressao(false, "Carregando configuração oficial da etiqueta...");

  frame.onload = () => {
    if(tokenAtual !== atlasEtiquetaToken) return;
    atlasDefinirEstadoImpressao(false, "Gerando QR Code local...");

    // Fallback seguro: normalmente o postMessage chega em poucos milissegundos.
    atlasEtiquetaTimer = setTimeout(() => {
      if(tokenAtual !== atlasEtiquetaToken) return;
      try{
        const doc = frame.contentDocument;
        const qr = doc?.getElementById("qr");
        const pronto = doc?.body?.classList.contains("ready") &&
          String(qr?.src || "").startsWith("data:image/png");
        if(pronto){
          atlasDefinirEstadoImpressao(true, "Prévia pronta. Confira e clique em imprimir.");
        }else{
          atlasDefinirEstadoImpressao(false, "QR local ainda não ficou pronto. Feche e tente novamente.");
        }
      }catch(e){
        atlasDefinirEstadoImpressao(false, "Não foi possível confirmar a prévia.");
      }
    }, 2000);
  };

  frame.onerror = () => {
    if(tokenAtual !== atlasEtiquetaToken) return;
    atlasDefinirEstadoImpressao(false, "Falha ao carregar a etiqueta.");
    atlasAvisoEtiqueta("Não foi possível carregar a prévia. A impressão foi bloqueada.");
  };

  frame.src = bdrUrlEtiquetaAtual() + "&preview=1&t=" + Date.now();
  modal.classList.add("ativo");
}

function fecharModalEtiqueta(){
  atlasEtiquetaToken += 1;
  clearTimeout(atlasEtiquetaTimer);
  atlasDefinirEstadoImpressao(false, "Prévia encerrada.");
  document.getElementById("modalEtiquetaBg")?.classList.remove("ativo");
}

function imprimirEtiquetaModalBDR(){
  if(!atlasEtiquetaPronta){
    atlasAvisoEtiqueta("A etiqueta ainda está carregando. Aguarde a mensagem “Prévia pronta”.");
    return;
  }

  const frame = document.getElementById("bdrEtiquetaFrame");
  if(!frame || !frame.contentWindow){
    atlasDefinirEstadoImpressao(false, "Prévia indisponível.");
    atlasAvisoEtiqueta("A prévia da etiqueta não está disponível.");
    return;
  }

  try{
    atlasDefinirEstadoImpressao(false, "Enviando etiqueta para a impressora...");
    frame.contentWindow.focus();
    frame.contentWindow.print();

    setTimeout(() => {
      fecharModalEtiqueta();
    }, 700);
  }catch(error){
    console.error("ATLAS: falha ao imprimir etiqueta", error);
    atlasDefinirEstadoImpressao(false, "Falha na impressão.");
    atlasAvisoEtiqueta("Não foi possível imprimir a etiqueta. Tente novamente.");
  }
}

document.addEventListener("keydown", event => {
  const modal = document.getElementById("modalEtiquetaBg");
  if(!modal?.classList.contains("ativo")) return;

  if(event.key === "Escape"){
    event.preventDefault();
    event.stopPropagation();
    fecharModalEtiqueta();
    return;
  }

  if(event.key === "Enter"){
    event.preventDefault();
    event.stopPropagation();
    imprimirEtiquetaModalBDR();
  }
});


// Fecha o modal aberto com ESC.
// A etiqueta/configuração/lote possuem seus próprios controles; aqui cuidamos
// dos modais principais do Patrimônio, do mais interno para o mais externo.
document.addEventListener("keydown", event => {
  if(event.key !== "Escape") return;

  const visivel = id => {
    const el = document.getElementById(id);
    if(!el) return false;
    const estilo = getComputedStyle(el);
    return estilo.display !== "none" && estilo.visibility !== "hidden";
  };

  if(visivel("modalFecharManutencaoBg")){
    event.preventDefault();
    fecharModalFecharManutencao();
    return;
  }

  if(visivel("modalManutencaoBg")){
    event.preventDefault();
    fecharModalManutencao();
    return;
  }

  if(visivel("modalEdicaoBg")){
    event.preventDefault();
    fecharEdicao();
    return;
  }

  if(visivel("modalBg")){
    event.preventDefault();
    fecharModal();
  }
});


function montarCamposEdicaoPorTipo(){
  const tipo = valor("edit_tipo_item") || String(patrimonioSelecionado?.tipo_item || "");
  const box = document.getElementById("editCamposExtras");
  if(!box) return;

  box.innerHTML = "";

  if(
    tipo === "ELETRONICO" ||
    tipo === "FERRAMENTA" ||
    tipo === "ELETRODOMESTICO" ||
    tipo === "INFORMATICA" ||
    tipo === "EQUIPAMENTO"
  ){
    box.innerHTML = `
      <input id="edit_marca" placeholder="Marca">
      <input id="edit_modelo" placeholder="Modelo">
      <input id="edit_numero_serie" placeholder="Número de série">
    `;
  }

  if(tipo === "VEICULO"){
    box.innerHTML = `
      <input id="edit_placa" placeholder="Placa">
      <input id="edit_renavam" placeholder="RENAVAM">
      <input id="edit_chassi" placeholder="Chassi">
      <input id="edit_marca" placeholder="Marca">
      <input id="edit_modelo" placeholder="Modelo">
      <input id="edit_cor" placeholder="Cor">
      <input id="edit_ano_fabricacao" placeholder="Ano fabricação">
      <input id="edit_ano_modelo" placeholder="Ano modelo">
      <input id="edit_combustivel" placeholder="Combustível">
      <input id="edit_horimetro" placeholder="KM / Horímetro">
    `;
  }

  if(tipo === "MAQUINA"){
    box.innerHTML = `
      <input id="edit_marca" placeholder="Marca">
      <input id="edit_modelo" placeholder="Modelo">
      <input id="edit_numero_serie" placeholder="Número de série">
      <input id="edit_potencia" placeholder="Potência">
      <input id="edit_horimetro" placeholder="Horímetro">
      <input id="edit_combustivel" placeholder="Combustível">
      <input id="edit_ano_fabricacao" placeholder="Ano fabricação">
      <input id="edit_ano_modelo" placeholder="Ano modelo">
    `;
  }

  if(tipo === "MOBILIARIO"){
    box.innerHTML = `
      <textarea id="edit_descricao" class="atlas-campo-largo" placeholder="Descrição detalhada do imobilizado"></textarea>
      <input id="edit_marca" placeholder="Marca / fabricante">
      <input id="edit_modelo" placeholder="Modelo">
      <input id="edit_numero_serie" placeholder="Número de série, patrimônio do fabricante ou identificação">
      <input id="edit_fornecedor" placeholder="Fornecedor">
      <input id="edit_data_compra" type="date" title="Data de aquisição">
      <input id="edit_responsavel" placeholder="Responsável pelo bem">
      <input id="edit_departamento" placeholder="Departamento / setor">
      <input id="edit_endereco_estoque" placeholder="Localização detalhada">
    `;
  }

  if(tipo === "MATERIAL_APOIO"){
    box.innerHTML = `
      <input id="edit_marca" placeholder="Marca/Fabricante">
      <input id="edit_modelo" placeholder="Modelo/Descrição">
      <input id="edit_numero_serie" placeholder="Número de série">
    `;
  }

  if(tipo === "OUTRO"){
    box.innerHTML = `
      <input id="edit_tipo_outro" placeholder="Descreva o tipo do ativo">
      <input id="edit_marca" placeholder="Marca/Fabricante">
      <input id="edit_modelo" placeholder="Modelo/Descrição">
      <input id="edit_numero_serie" placeholder="Número de série">
    `;
  }
}

function bdrSetValorCampo(id, valorCampo){
  const el = document.getElementById(id);
  if(el) el.value = valorCampo || "";
}

function bdrEstadoParaSelect(estado){
  const v = String(estado || "").toUpperCase().trim();
  if(["1","NOVO","OTIMO","ÓTIMO"].includes(v)) return "OTIMO";
  if(["3","REGULAR"].includes(v)) return "REGULAR";
  if(["4","5","RUIM","INSERVIVEL","INSERVÍVEL"].includes(v)) return "RUIM";
  return "BOM";
}

function abrirEdicao(){

  if(!usuarioTemPermissao("PATRIMONIO_EDITAR")){
    alert("Você não tem permissão para editar patrimônio.");
    return;
  }

  if(!patrimonioSelecionado){
    alert("Selecione um patrimônio.");
    return;
  }

  bdrSetValorCampo("edit_nome_bem", patrimonioSelecionado.nome_bem || "");
  bdrSetValorCampo("edit_tipo_item", patrimonioSelecionado.tipo_item || "");
  bdrSetValorCampo("edit_estado_conservacao", bdrEstadoParaSelect(patrimonioSelecionado.estado_conservacao));

  bdrSetValorCampo("edit_valor_bem",
    patrimonioSelecionado.valor_bem
      ? Number(patrimonioSelecionado.valor_bem).toLocaleString("pt-BR", {
          minimumFractionDigits:2,
          maximumFractionDigits:2
        })
      : ""
  );

  bdrSetValorCampo("edit_codigo_antigo", patrimonioSelecionado.codigo_antigo || "");
  bdrSetValorCampo("edit_ncm", patrimonioSelecionado.ncm || "");
  bdrSetValorCampo("edit_numero_nfe", patrimonioSelecionado.numero_nfe || "");
  bdrSetValorCampo("edit_observacao", patrimonioSelecionado.observacao || "");
  bdrSetValorCampo("motivo_correcao", "");

  montarCamposEdicaoPorTipo();

  bdrSetValorCampo("edit_tipo_outro", patrimonioSelecionado.tipo_outro || "");
  bdrSetValorCampo("edit_marca", patrimonioSelecionado.marca || "");
  bdrSetValorCampo("edit_modelo", patrimonioSelecionado.modelo || "");
  bdrSetValorCampo("edit_numero_serie", patrimonioSelecionado.numero_serie || "");
  bdrSetValorCampo("edit_descricao", patrimonioSelecionado.descricao || "");
  bdrSetValorCampo("edit_fornecedor", patrimonioSelecionado.fornecedor || "");
  bdrSetValorCampo("edit_data_compra", patrimonioSelecionado.data_compra || "");
  bdrSetValorCampo("edit_responsavel", patrimonioSelecionado.responsavel || "");
  bdrSetValorCampo("edit_departamento", patrimonioSelecionado.departamento || "");
  bdrSetValorCampo("edit_endereco_estoque", patrimonioSelecionado.endereco_estoque || "");
  bdrSetValorCampo("edit_placa", patrimonioSelecionado.placa || "");
  bdrSetValorCampo("edit_renavam", patrimonioSelecionado.renavam || "");
  bdrSetValorCampo("edit_chassi", patrimonioSelecionado.chassi || "");
  bdrSetValorCampo("edit_cor", patrimonioSelecionado.cor || "");
  bdrSetValorCampo("edit_combustivel", patrimonioSelecionado.combustivel || "");
  bdrSetValorCampo("edit_potencia", patrimonioSelecionado.potencia || "");
  bdrSetValorCampo("edit_ano_fabricacao", patrimonioSelecionado.ano_fabricacao || "");
  bdrSetValorCampo("edit_ano_modelo", patrimonioSelecionado.ano_modelo || "");
  bdrSetValorCampo("edit_horimetro", patrimonioSelecionado.horimetro || patrimonioSelecionado.quilometragem || "");

  document.getElementById("modalEdicaoBg").style.display = "flex";
}

function fecharEdicao(){
  document.getElementById("modalEdicaoBg").style.display = "none";
}

async function salvarEdicaoPatrimonio(){

  if(!usuarioTemPermissao("PATRIMONIO_EDITAR")){
    alert("Você não tem permissão para salvar edição de patrimônio.");
    return;
  }

  if(!patrimonioSelecionado){
    alert("Selecione um patrimônio.");
    return;
  }

  const motivo = valor("motivo_correcao");

  if(!motivo || motivo.length < 5){
    alert("Informe o motivo da correção cadastral.");
    return;
  }

  const tipoEditado = valor("edit_tipo_item") || patrimonioSelecionado.tipo_item;

  const dadosAtualizados = {
    nome_bem: valor("edit_nome_bem"),
    tipo_item: tipoEditado || null,
    tipo_outro: valor("edit_tipo_outro") || null,
    valor_bem: moedaParaNumero(valor("edit_valor_bem")),
    estado_conservacao: valor("edit_estado_conservacao") || "BOM",
    marca: valor("edit_marca") || null,
    modelo: valor("edit_modelo") || null,
    numero_serie: valor("edit_numero_serie") || null,
    descricao: valor("edit_descricao") || null,
    fornecedor: valor("edit_fornecedor") || null,
    data_compra: valor("edit_data_compra") || null,
    responsavel: valor("edit_responsavel") || null,
    departamento: valor("edit_departamento") || null,
    endereco_estoque: valor("edit_endereco_estoque") || null,
    placa: valor("edit_placa") || null,
    renavam: valor("edit_renavam") || null,
    chassi: valor("edit_chassi") || null,
    cor: valor("edit_cor") || null,
    combustivel: valor("edit_combustivel") || null,
    potencia: valor("edit_potencia") || null,
    ano_fabricacao: valor("edit_ano_fabricacao") ? parseInt(valor("edit_ano_fabricacao")) : null,
    ano_modelo: valor("edit_ano_modelo") ? parseInt(valor("edit_ano_modelo")) : null,
    horimetro: moedaParaNumero(valor("edit_horimetro")),
    quilometragem: moedaParaNumero(valor("edit_horimetro")),
    codigo_antigo: valor("edit_codigo_antigo") || null,
    ncm: valor("edit_ncm") || null,
    numero_nfe: valor("edit_numero_nfe") || null,
    observacao: valor("edit_observacao") || null
  };

  const podeContinuarDuplicidadeEdicao = await bdrVerificarDuplicidadePatrimonio({
    id: patrimonioSelecionado.id,
    nome_bem: dadosAtualizados.nome_bem,
    tipo_item: dadosAtualizados.tipo_item,
    placa: dadosAtualizados.placa,
    renavam: dadosAtualizados.renavam,
    chassi: dadosAtualizados.chassi,
    codigo_antigo: dadosAtualizados.codigo_antigo,
    marca: dadosAtualizados.marca,
    modelo: dadosAtualizados.modelo,
    obra_id: patrimonioSelecionado.obra_id || null
  }, { confirmar:true });

  if(!podeContinuarDuplicidadeEdicao) return;

  if(patrimonioOffline()){
    await salvarOperacaoPatrimonioOffline("update", "patrimonio", dadosAtualizados, {
      filtro:{ id: patrimonioSelecionado.id }
    });

    await salvarOperacaoPatrimonioOffline("insert", "movimentacoes", [{
      patrimonio_id: patrimonioSelecionado.id,
      empresa_id: patrimonioSelecionado.empresa_id,
      obra_origem_id: patrimonioSelecionado.obra_id,
      obra_destino_id: patrimonioSelecionado.obra_id,
      tipo: "CORRECAO_CADASTRAL",
      status_anterior: patrimonioSelecionado.status,
      status_novo: patrimonioSelecionado.status,
      observacao: motivo,
      usuario: usuarioAtual()?.nome || "Usuário não identificado",
      data_movimentacao: new Date().toISOString()
    }]);

    patrimonios = patrimonios.map(p =>
      Number(p.id) === Number(patrimonioSelecionado.id)
        ? {...p, ...dadosAtualizados, __offline_pendente:true}
        : p
    );

    alert("📦 Sem internet. Correção salva no aparelho e será sincronizada quando a internet voltar.");

    fecharEdicao();
    fecharModal();
    renderizarPatrimonios();
    return;
  }

  const respEdicao = await bdrAtualizarPrimeiroNoTablet(
    "patrimonio",
    { id: patrimonioSelecionado.id },
    dadosAtualizados,
    { acao:"CORRECAO_CADASTRAL_PATRIMONIO", motivo }
  );

  if(respEdicao.error){
    console.error(respEdicao.error);
    alert(respEdicao.error.message || "Erro ao salvar correção.");
    return;
  }

  patrimonios = patrimonios.map(p =>
    Number(p.id) === Number(patrimonioSelecionado.id)
      ? {...p, ...dadosAtualizados, __offline_pendente:!!respEdicao.offlineFirst}
      : p
  );

  await gravarMovimentacao({
    patrimonio_id: patrimonioSelecionado.id,
    empresa_id: patrimonioSelecionado.empresa_id,
    obra_origem_id: patrimonioSelecionado.obra_id,
    obra_destino_id: patrimonioSelecionado.obra_id,
    tipo: "CORRECAO_CADASTRAL",
    status_anterior: patrimonioSelecionado.status,
    status_novo: patrimonioSelecionado.status,
    observacao: motivo
  });

  if(respEdicao.offlineFirst){
    bdrAvisoSalvoTablet("Correção cadastral salva offline. Será sincronizada automaticamente quando a internet voltar.");
  }

  fecharEdicao();
  fecharModal();
  renderizarPatrimonios();
}

async function iniciar(){
  // Antes de aplicar permissões ou montar a lista de obras, atualiza o
  // contexto do usuário autenticado a partir da fonte oficial. Assim,
  // alterações de obras/permissões feitas por um administrador passam a
  // valer no próximo carregamento do módulo sem depender de logout/cache.
  if(window.BDRAcessoObras?.sincronizarUsuarioAtual){
    await window.BDRAcessoObras.sincronizarUsuarioAtual();
  }

  if(!bloquearPatrimonioSemPermissaoBDR()) return;
  aplicarMenuPorPermissaoBDR();

  carregarUsuarioTopo();

  if(!db()){
    console.warn("Supabase não carregado. Tentando cache local.");
  }

  const onlineReal = await patrimonioOnlineReal();

  if(!onlineReal){
    BDR_PATRIMONIO_ONLINE_REAL = false;
    mostrarAvisoModoOffline();
  }

  await carregarObras();

  if(usuarioPodeLancarQualquerObra()){
    const obraSalva = localStorage.getItem("obraAtivaId");
    const travada = localStorage.getItem("obraTravada");

    if(obraSalva && travada === "SIM"){
      const existe = obras.find(
        o => String(o.id) === String(obraSalva)
      );

      if(existe){
        window.obraAtiva = existe;
        window.obraTravada = true;
        document.getElementById("obraSelect").value = obraSalva;
      }
    }
  }else{
    localStorage.removeItem("obraAtivaId");
    localStorage.removeItem("obraTravada");
    aplicarRegraObraLancamentoBDR();
  }

  atualizarVisualTrava();
  aplicarPermissoesTela();
  aplicarMenuPorPermissaoBDR();

  // Quando a notificação for clicada, abre diretamente o patrimônio excluído.
  const parametros = new URLSearchParams(window.location.search);
  const abrirInativoId = parametros.get("patrimonio");
  const filtroUrl = String(parametros.get("filtro") || "").toUpperCase();

  if(filtroUrl === "INATIVO" && atlasPodeVerInativos()){
    atlasMostrarInativos = true;
    const filtroStatus = document.getElementById("filtroStatus");
    if(filtroStatus) filtroStatus.value = "INATIVO";
  }

  await carregarPatrimonios();
  await atlasCarregarCatalogoGlobalPatrimonio();
  await carregarManutencoesPatrimonio();
  aplicarPermissoesTela();

  if(abrirInativoId && atlasMostrarInativos && atlasPodeVerInativos()){
    await abrirModal(abrirInativoId);
  }
}


async function bdrTentarSincronizarPendenciasPatrimonio(){
  const onlineReal = await patrimonioOnlineReal();
  if(!onlineReal) return;

  try{
    if(typeof BDRSyncCenter?.atualizar === "function"){
      await BDRSyncCenter.atualizar();
    }

    if(typeof BDRSync?.sincronizar === "function"){
      await BDRSync.sincronizar();
    }

    if(typeof sincronizarOffline === "function"){
      await sincronizarOffline();
    }

    await carregarPatrimonios();
    await carregarManutencoesPatrimonio();
  }catch(e){
    console.warn("Patrimônio: tentativa de sincronização automática falhou:", e);
  }
}

function bdrPatrimonioOnlineLocalRapido(){
  // Não consulta Supabase aqui. Evita flood offline.
  if(navigator.onLine === false) return false;

  if(typeof window.bdrOnline === "function"){
    try{
      return window.bdrOnline() !== false;
    }catch(e){
      return navigator.onLine !== false;
    }
  }

  return navigator.onLine !== false;
}

window.addEventListener("offline", () => {
  BDR_PATRIMONIO_ONLINE_REAL = false;
  window.BDR_PATRIMONIO_ONLINE_REAL = false;
  mostrarAvisoModoOffline();
});

window.addEventListener("online", () => {
  if(typeof window.bdrResetOnlineReal === "function"){
    try{ window.bdrResetOnlineReal(); }catch(e){}
  }
  setTimeout(bdrTentarSincronizarPendenciasPatrimonio, 1200);
});

setInterval(async () => {
  // Regra limpa: offline não chama bdrOnlineReal nem Supabase.
  if(!bdrPatrimonioOnlineLocalRapido()){
    BDR_PATRIMONIO_ONLINE_REAL = false;
    window.BDR_PATRIMONIO_ONLINE_REAL = false;
    mostrarAvisoModoOffline();
    if(typeof BDRSyncCenter?.atualizar === "function"){
      BDRSyncCenter.atualizar();
    }
    return;
  }

  await bdrTentarSincronizarPendenciasPatrimonio();
}, 30000);

iniciar();

// Interface oficial do módulo Patrimônio para Remessas, Histórico e demais módulos integrados.
// A lista continua sendo a mesma fonte de verdade já carregada pelo Patrimônio.
window.AtlasPatrimonioAPI = Object.freeze({
  listar: () => patrimonios,
  obras: () => obras,
  selecionado: () => patrimonioSelecionado,
  recarregar: () => carregarPatrimonios(),
  renderizar: () => renderizarPatrimonios()
});

/* =========================================================
   COMBOBOX PESQUISÁVEL DOS FILTROS DO PATRIMÔNIO
   Mantém os <select> originais como fonte de verdade.
   Assim não quebramos filtros, permissões ou rotinas existentes.
   ========================================================= */
(function(){
  const IDS = ["filtroObra","filtroStatus","filtroTipo","filtroUsuario"];

  function textoOpcaoSelecionada(select){
    const op = select?.options?.[select.selectedIndex];
    return op ? String(op.textContent || "").trim() : "";
  }

  function opcoesVisiveis(select){
    return [...(select?.options || [])].filter(op => !op.hidden && !op.disabled);
  }

  function fecharTodos(exceto){
    document.querySelectorAll(".atlas-combo.aberto").forEach(c => {
      if(c !== exceto) c.classList.remove("aberto");
    });
  }

  function montarMenu(combo, select, termo=""){
    const menu = combo.querySelector(".atlas-combo-menu");

    // A barra de rolagem faz parte do combo. Clicar/arrastar nela não pode fechar a lista.
    if(menu && !menu.dataset.scrollProtegido){
      menu.dataset.scrollProtegido = "1";

      menu.addEventListener("pointerdown", (e) => {
        combo.dataset.interagindoMenu = "1";
        e.stopPropagation();
      });

      menu.addEventListener("mousedown", (e) => {
        combo.dataset.interagindoMenu = "1";
        e.stopPropagation();
      });

      const liberarInteracaoMenu = () => {
        setTimeout(() => { delete combo.dataset.interagindoMenu; }, 80);
      };
      menu.addEventListener("pointerup", liberarInteracaoMenu);
      menu.addEventListener("mouseup", liberarInteracaoMenu);
      menu.addEventListener("pointercancel", liberarInteracaoMenu);
    }
    if(!menu) return;

    const normaliza = s => String(s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();

    const q = normaliza(termo);
    const ops = opcoesVisiveis(select).filter(op => !q || normaliza(op.textContent).includes(q));

    menu.innerHTML = "";

    if(!ops.length){
      const vazio = document.createElement("div");
      vazio.className = "atlas-combo-vazio";
      vazio.textContent = "Nenhuma opção encontrada";
      menu.appendChild(vazio);
      return;
    }

    ops.forEach(op => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "atlas-combo-opcao" + (String(op.value) === String(select.value) ? " ativo" : "");
      btn.textContent = String(op.textContent || "").trim();
      btn.dataset.value = op.value;

      btn.addEventListener("mousedown", e => {
        e.preventDefault();
        select.value = op.value;
        select.dispatchEvent(new Event("change", {bubbles:true}));

        const input = combo.querySelector(".atlas-combo-input");
        if(input) input.value = String(op.textContent || "").trim();

        combo.classList.remove("aberto");
      });

      menu.appendChild(btn);
    });
  }

  function sincronizarCombo(select){
    const combo = select?._atlasCombo;
    if(!combo) return;
    const input = combo.querySelector(".atlas-combo-input");
    if(!input) return;

    input.value = textoOpcaoSelecionada(select);
    input.disabled = !!select.disabled;
    combo.classList.toggle("desabilitado", !!select.disabled);
  }

  function criarCombo(select){
    if(!select || select._atlasCombo) return;

    select.classList.add("atlas-combo-native");

    const combo = document.createElement("div");
    combo.className = "atlas-combo";
    combo.dataset.select = select.id;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "atlas-combo-input";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", select.options?.[0]?.textContent || select.id);

    const menu = document.createElement("div");
    menu.className = "atlas-combo-menu";

    combo.append(input, menu);
    select.parentNode.insertBefore(combo, select);
    select._atlasCombo = combo;

    sincronizarCombo(select);

    // Mesmo comportamento do seletor "Obra de lançamento":
    // clicar/focar abre a lista completa sem transformar o texto atual em filtro.
    input.addEventListener("focus", () => {
      if(input.disabled) return;
      fecharTodos(combo);
      combo.classList.add("aberto");
      montarMenu(combo, select, "");
    });

    input.addEventListener("click", () => {
      if(input.disabled) return;
      fecharTodos(combo);
      combo.classList.add("aberto");
      montarMenu(combo, select, "");
    });

    // Só filtra quando o usuário realmente digita.
    input.addEventListener("input", () => {
      if(input.disabled) return;
      combo.classList.add("aberto");
      montarMenu(combo, select, input.value);
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        if(combo.dataset.interagindoMenu === "1") return;
        if(!combo.contains(document.activeElement)){
          combo.classList.remove("aberto");
          sincronizarCombo(select);
        }
      }, 140);
    });

    input.addEventListener("keydown", e => {
      if(e.key === "Escape"){
        combo.classList.remove("aberto");
        input.value = textoOpcaoSelecionada(select);
        input.blur();
      }
      if(e.key === "Enter"){
        const primeira = menu.querySelector(".atlas-combo-opcao");
        if(primeira){
          e.preventDefault();
          primeira.dispatchEvent(new MouseEvent("mousedown", {bubbles:true}));
        }
      }
    });

    select.addEventListener("change", () => sincronizarCombo(select));

    new MutationObserver(() => {
      sincronizarCombo(select);
      if(combo.classList.contains("aberto")) montarMenu(combo, select, "");
    }).observe(select, {childList:true, subtree:true, attributes:true});

    // disabled pode ser alterado por regra de permissão/obra.
    const obsDisabled = new MutationObserver(() => sincronizarCombo(select));
    obsDisabled.observe(select, {attributes:true, attributeFilter:["disabled"]});
  }

  function iniciar(){
    IDS.forEach(id => criarCombo(document.getElementById(id)));

    document.addEventListener("mousedown", e => {
      if(!e.target.closest(".atlas-combo")){
        document.querySelectorAll(".atlas-combo").forEach(combo => {
          const id = combo.dataset.select;
          const select = id ? document.getElementById(id) : null;
          if(select) sincronizarCombo(select);
        });
        fecharTodos();
      }
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", iniciar, {once:true});
  }else{
    iniciar();
  }

  window.atlasSincronizarCombosPatrimonio = function(){
    IDS.forEach(id => sincronizarCombo(document.getElementById(id)));
  };
})();



/* Nome do patrimônio: autocomplete interno removido.
   Mantemos somente o outro modelo de sugestão escolhido para o campo. */
(function removerAutocompleteInternoNomePatrimonio(){
  const campo = document.getElementById("nomeBem") ||
    [...document.querySelectorAll("input")].find(el =>
      /nome do patrimônio/i.test(el.getAttribute("placeholder") || "")
    );
  if(!campo) return;

  campo.removeAttribute("list");

  const removerCaixasDoNome = () => {
    const candidatos = document.querySelectorAll(
      ".sugestoes, .sugestoes-nome, .autocomplete-suggestions, .autocomplete-list, [data-autocomplete-nome]"
    );
    candidatos.forEach(el => {
      if(el.closest(".atlas-combo")) return;
      const rCampo = campo.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const proximoDoCampo =
        Math.abs(r.left - rCampo.left) < Math.max(80, rCampo.width) &&
        r.top >= rCampo.top - 10 &&
        r.top <= rCampo.bottom + 260;
      if(proximoDoCampo) el.remove();
    });
  };

  campo.addEventListener("input", removerCaixasDoNome, true);
  campo.addEventListener("focus", removerCaixasDoNome, true);
})();

