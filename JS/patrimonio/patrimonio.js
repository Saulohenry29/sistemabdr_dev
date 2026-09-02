/*
  ATLAS / BDR — PATRIMÔNIO V2 OFICIAL
  Regra de negócio preservada da versão atual.
  Fluxo de etiqueta consolidado e protegido contra impressão antecipada.
*/
let patrimonioObras = [];
let patrimonioItens = [];
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

function patrimonioIr(pagina){
  window.location.href = pagina;
}

function patrimonioDb(){
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

  if(navigator.onLine === false || !patrimonioDb()){
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
         !patrimonioDb();
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

  if(onlineReal && patrimonioDb()){
    const { data, error } = await patrimonioDb()
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

  if(onlineReal && patrimonioDb()){
    let query = patrimonioDb().from(tabela).update(payload);

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
    (tipo === "offline" ? " offline" : "");

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

function patrimonioUsuarioAtual(){
  const u = localStorage.getItem("usuario_logado");
  return u ? JSON.parse(u) : null;
}

function carregarUsuarioTopo(){
  const usuario = patrimonioUsuarioAtual();
  const nome = document.getElementById("usuarioNome");
  const perfil = document.getElementById("usuarioPerfil");
  if(nome) nome.innerText = usuario ? "Olá, " + (usuario.nome || "usuário") : "Olá, usuário";
  if(perfil) perfil.innerText = usuario ? (usuario.perfil || "-") : "-";
}

function fecharMenusTopo(){
  document.getElementById("dropdownUser")?.classList.remove("ativo");
}
document.addEventListener("click", fecharMenusTopo);

function patrimonioPermissoesUsuarioBDR(usuario = patrimonioUsuarioAtual()){
  if(!usuario) return [];
  if(Array.isArray(usuario.permissoes)){
    return usuario.permissoes.map(p => String(p).trim().toUpperCase()).filter(Boolean);
  }
  return String(usuario.permissoes || "")
    .split(",")
    .map(p => p.trim().toUpperCase())
    .filter(Boolean);
}

function patrimonioUsuarioOwnerBDR(usuario = patrimonioUsuarioAtual()){
  return Number(usuario?.id) === 1;
}

function usuarioTemPermissao(permissao){
  const u = patrimonioUsuarioAtual();
  if(!u) return false;

  if(window.BDRMenuPermissoes && typeof window.BDRMenuPermissoes.temPermissao === "function"){
    return window.BDRMenuPermissoes.temPermissao(permissao, u);
  }

  if(patrimonioUsuarioOwnerBDR(u)) return true;

  const p = String(permissao || "").toUpperCase();
  const ps = patrimonioPermissoesUsuarioBDR(u);

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

function usuarioPodeCriarPatrimonioBDR(){
  const u = patrimonioUsuarioAtual();
  if(!u) return false;

  if(patrimonioUsuarioOwnerBDR(u)) return true;

  /*
   * A fonte central continua sendo prioritária, mas fazemos fallback para
   * as permissões gravadas na própria sessão. Isso evita o caso em que o
   * usuário acabou de ter a permissão atualizada e o menu central ainda
   * está com uma fotografia antiga da sessão.
   */
  if(usuarioTemPermissao("PATRIMONIO_CRIAR")) return true;

  const ps = patrimonioPermissoesUsuarioBDR(u);
  return ps.includes("PATRIMONIO_CRIAR") ||
         ps.includes("CADASTRAR_PATRIMONIO");
}

function usuarioQuerSomCriacaoPatrimonioBDR(){
  const u = patrimonioUsuarioAtual();
  if(!u) return false;

  const ps = patrimonioPermissoesUsuarioBDR(u);

  /*
   * O som de confirmação do cadastro respeita as preferências do usuário.
   * - Silencioso: nunca toca.
   * - Visual: nunca toca.
   * - Som: só toca se "Criação de patrimônio" estiver habilitada.
   */
  if(ps.includes("NOTIF_MODO_SILENCIOSO")) return false;
  if(ps.includes("NOTIF_MODO_VISUAL")) return false;

  return ps.includes("NOTIF_PATRIMONIO_CRIACAO");
}

function usuarioEhGestao(){
  /*
    Compatibilidade com chamadas antigas do Patrimônio.
    Perfil/cargo, USUARIOS_VER ou EMPRESAS_VER não concedem ações.
    Somente o usuário ID 1 é absoluto.
  */
  return patrimonioUsuarioOwnerBDR();
}

function usuarioPodeVerTodasObras(){
  /*
    Escopo amplo também é explícito.
    Perfil ADMIN/MASTER não libera obras automaticamente.
  */
  const u = patrimonioUsuarioAtual();
  if(!u) return false;

  if(patrimonioUsuarioOwnerBDR(u)) return true;

  const ps = patrimonioPermissoesUsuarioBDR(u);
  return ps.includes("PATRIMONIO_VER_TODAS_OBRAS") ||
         ps.includes("PATRIMONIO_TODAS_OBRAS") ||
         ps.includes("TODAS_OBRAS_VER");
}

function normalizarIdsObrasLiberadasPatrimonioBDR(valor){
  let lista = valor;

  if(typeof lista === "string"){
    const texto = lista.trim();

    if(!texto) return [];

    try{
      const parsed = JSON.parse(texto);
      lista = Array.isArray(parsed) ? parsed : [parsed];
    }catch(_){
      lista = texto.split(/[,;|]/);
    }
  }

  if(!Array.isArray(lista)){
    lista = lista === null || lista === undefined ? [] : [lista];
  }

  return [...new Set(
    lista
      .flatMap(item => {
        if(item && typeof item === "object"){
          return [item.id, item.obra_id, item.value];
        }
        return [item];
      })
      .map(v => Number(String(v ?? "").trim()))
      .filter(id => Number.isFinite(id) && id > 0)
  )];
}

function obrasPermitidasPatrimonioBDR(usuario = patrimonioUsuarioAtual()){
  if(!usuario) return [];

  if(usuarioPodeVerTodasObras()){
    return (patrimonioObras || []).map(o => Number(o.id)).filter(Number.isFinite);
  }

  /*
   * REGRA CENTRAL DO PATRIMÔNIO:
   * obras_liberadas do cadastro de Usuários é a fonte autoritativa.
   *
   * Se houver obras marcadas na aba "Obras", o usuário vê SOMENTE elas.
   * A obra principal entra apenas como fallback para cadastros antigos em que
   * nenhuma obra liberada foi configurada.
   *
   * Isso faz:
   * - Thayanne com ATLAS + SATH -> enxergar somente ATLAS + SATH.
   * - Samuel sem obra principal + várias obras liberadas -> escolher qualquer
   *   uma das obras realmente marcadas para ele.
   */
  const liberadas =
    normalizarIdsObrasLiberadasPatrimonioBDR(usuario.obras_liberadas);

  if(liberadas.length){
    return liberadas;
  }

  const principal = Number(usuario.obra_id);
  if(Number.isFinite(principal) && principal > 0){
    return [principal];
  }

  return [];
}

function usuarioPodeVerObraPatrimonioBDR(obraId, usuario = patrimonioUsuarioAtual()){
  if(!usuario) return false;
  if(usuarioPodeVerTodasObras()) return true;

  const permitidas = new Set(
    obrasPermitidasPatrimonioBDR(usuario).map(String)
  );

  return permitidas.has(String(obraId));
}


function usuarioPodeLancarQualquerObra(){
  const u = patrimonioUsuarioAtual();
  if(!u) return false;

  if(patrimonioUsuarioOwnerBDR(u)) return true;

  const ps = patrimonioPermissoesUsuarioBDR(u);
  return ps.includes("PATRIMONIO_LANCAR_QUALQUER_OBRA") ||
         ps.includes("PATRIMONIO_VER_TODAS_OBRAS") ||
         ps.includes("PATRIMONIO_TODAS_OBRAS") ||
         ps.includes("TODAS_OBRAS_VER");
}

function usuarioPodeEscolherObraLancamentoBDR(usuario = patrimonioUsuarioAtual()){
  if(!usuario) return false;
  if(usuarioPodeLancarQualquerObra()) return true;

  // Se o administrador marcou ao menos uma obra em Usuários, o funcionário
  // pode escolher/travar dentro DESSE escopo, mesmo sem obra principal.
  return normalizarIdsObrasLiberadasPatrimonioBDR(
    usuario.obras_liberadas
  ).length > 0;
}

function obraVinculadaUsuarioBDR(){
  const u = patrimonioUsuarioAtual();
  if(!u || !u.obra_id) return null;

  return (patrimonioObras || []).find(o =>
    String(o.id) === String(u.obra_id)
  ) || null;
}

function aplicarRegraObraLancamentoBDR(){
  const select = document.getElementById("obraSelect");
  const btn = document.getElementById("btnTravarObra");
  const u = patrimonioUsuarioAtual();

  if(!select || !u) return;

  const permitidas = obrasPermitidasPatrimonioBDR(u);

  if(usuarioPodeEscolherObraLancamentoBDR(u)){
    // Pode escolher, mas o autocomplete será filtrado somente para "permitidas".
    select.disabled = false;

    if(btn){
      btn.disabled = false;
      if(!window.obraTravada){
        btn.className = "lock-btn lock-off";
        btn.innerText = "✅ Confirmar obra";
      }
    }

    atlasSincronizarCampoObra();
    return;
  }

  // Cadastro antigo: sem obras_liberadas, mas com uma obra principal.
  const obraUsuario = obraVinculadaUsuarioBDR();

  if(!obraUsuario || !permitidas.includes(Number(obraUsuario.id))){
    select.value = "";
    select.disabled = true;

    if(btn){
      btn.disabled = true;
      btn.className = "lock-btn lock-off";
      btn.innerText = "⚠️ Sem obra liberada";
    }

    window.obraAtiva = null;
    window.obraTravada = false;
    atlasSincronizarCampoObra();
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

  const usuario = patrimonioUsuarioAtual();
  const destino =
    window.BDRMenuPermissoes?.primeiraPaginaPermitida?.(usuario) ||
    "login.html";

  window.location.replace(destino);
  return false;
}

function patrimonioAplicarMenuPorPermissaoBDR(){
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

function patrimonioValor(id){
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
    const { data, error } = await patrimonioDb()
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
    const locais = patrimonioItens || [];
    const todos = [...cachePat, ...locais];

    todos.forEach(p => {
      const seq = bdrExtrairSequencialPatrimonio(p.codigo_qr, codigoObra);
      if(seq > maior) maior = seq;
    });
  }

  return maior + 1;
}


function bdrValorPatrimonioValido(){
  const valorNumero = moedaParaNumero(patrimonioValor("valor_bem"));
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
  const filtro = document.getElementById("patrimonioFiltroObra");
  if(!filtro) return;

  const valorAtual = filtro.value;
  filtro.innerHTML = `<option value="">Todas as obras/setores</option>`;

  (patrimonioObras || []).forEach(o => {
    const texto = `${o.codigo_obra || "-"} - ${o.nome || "-"}`;
    filtro.innerHTML += `<option value="${o.id}">${texto}</option>`;
  });

  const usuario = patrimonioUsuarioAtual();

  if(usuario && !usuarioPodeVerTodasObras()){
    const permitidas = new Set(
      obrasPermitidasPatrimonioBDR(usuario).map(String)
    );

    [...filtro.options].forEach(opcao => {
      if(!opcao.value) return;
      opcao.hidden = !permitidas.has(String(opcao.value));
    });

    if(permitidas.size === 1){
      filtro.value = [...permitidas][0];
      filtro.disabled = true;
      return;
    }

    filtro.disabled = false;

    if(valorAtual && permitidas.has(String(valorAtual))){
      filtro.value = valorAtual;
    }else{
      filtro.value = "";
    }
    return;
  }

  filtro.disabled = false;

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

function formatarCampoMoedaBRL(input){
  if(!input) return;

  const numero = moedaParaNumero(String(input.value || "").trim());
  if(numero === null || !Number.isFinite(numero)){
    input.value = "";
    return;
  }

  input.value = numero.toLocaleString("pt-BR", {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });
}

function mascaraMoeda(input){
  if(!input) return;

  /*
    Máscara monetária com centavos automáticos e cursor preservado.
    Ex.: 1550 -> 15,50 | 160000 -> 1.600,00.
    Ao editar no meio do número, o cursor permanece junto ao mesmo dígito
    em vez de saltar para o final do campo.
  */
  const bruto = String(input.value || "");
  const cursorAntes = Number.isFinite(input.selectionStart) ? input.selectionStart : bruto.length;
  const digitosDireita = (bruto.slice(cursorAntes).match(/\d/g) || []).length;
  const digitos = bruto.replace(/\D/g, "");

  if(!digitos){
    input.value = "";
    return;
  }

  const normalizado = digitos.padStart(3, "0");
  const centavos = normalizado.slice(-2);
  let inteiro = normalizado.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
  inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const formatado = `${inteiro},${centavos}`;

  input.value = formatado;

  if(document.activeElement === input && typeof input.setSelectionRange === "function"){
    let novaPosicao = formatado.length;
    for(let pos = formatado.length; pos >= 0; pos--){
      const qtdDireita = (formatado.slice(pos).match(/\d/g) || []).length;
      if(qtdDireita === digitosDireita){
        novaPosicao = pos;
        continue;
      }
      if(qtdDireita > digitosDireita) break;
    }
    requestAnimationFrame(() => {
      try{ input.setSelectionRange(novaPosicao, novaPosicao); }catch(_e){}
    });
  }

  if(input.dataset.moedaBlurLigado !== "1"){
    input.dataset.moedaBlurLigado = "1";
    input.addEventListener("blur", () => formatarCampoMoedaBRL(input));
  }
}



let atlasObraIndice = -1;
let atlasObraResultados = [];
let atlasObraComboIniciado = false;
let atlasObraInteragindoLista = false;
let atlasObraInteracaoTimer = null;

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
  return (patrimonioObras || []).find(o => String(o.id) === String(select.value)) || null;
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
  const u = patrimonioUsuarioAtual();
  const permitidas = new Set(
    obrasPermitidasPatrimonioBDR(u).map(String)
  );

  const base = usuarioPodeVerTodasObras()
    ? (patrimonioObras || [])
    : (patrimonioObras || []).filter(obra => permitidas.has(String(obra.id)));

  atlasObraResultados = base.filter(obra => {
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

  // A seleção é tratada por delegação no pointerdown da lista.
  // Isso ocorre antes do blur do campo e torna toda a linha clicável.
}

async function atlasSelecionarObraCombo(obraId, confirmarAutomaticamente = false){
  const select = document.getElementById("obraSelect");
  const input = document.getElementById("obraBusca");
  if(!select || !input) return false;

  const obra = (patrimonioObras || []).find(o => String(o.id) === String(obraId));
  if(!obra) return false;

  if(!usuarioPodeVerObraPatrimonioBDR(obra.id)){
    console.warn("Atlas Patrimônio: tentativa de selecionar obra não liberada.", obra.id);
    return false;
  }

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

  const permitidas = new Set(
    obrasPermitidasPatrimonioBDR(patrimonioUsuarioAtual()).map(String)
  );

  const basePermitida = usuarioPodeVerTodasObras()
    ? (patrimonioObras || [])
    : (patrimonioObras || []).filter(obra => permitidas.has(String(obra.id)));

  const exata = basePermitida.find(obra =>
    atlasNormalizarBuscaObra(obra.codigo_obra) === termo ||
    atlasNormalizarBuscaObra(atlasTextoObra(obra)) === termo
  );

  const candidatas = exata
    ? [exata]
    : (atlasObraResultados.length
        ? atlasObraResultados
        : basePermitida.filter(obra =>
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

  lista.addEventListener("pointerdown", async evento => {
    /*
     * Clicar/arrastar a barra de rolagem tira o foco do campo.
     * Registramos a interação antes do blur para a lista não fechar durante a rolagem.
     */
    atlasObraInteragindoLista = true;
    clearTimeout(atlasObraInteracaoTimer);

    const opcao = evento.target.closest?.(".atlas-obra-opcao");
    if(!opcao || !lista.contains(opcao)) return;

    evento.preventDefault();
    evento.stopPropagation();
    await atlasSelecionarObraCombo(opcao.dataset.obraId, false);
    atlasObraInteragindoLista = false;
  });

  const encerrarInteracaoLista = () => {
    clearTimeout(atlasObraInteracaoTimer);
    atlasObraInteracaoTimer = setTimeout(() => {
      atlasObraInteragindoLista = false;
    }, 180);
  };

  lista.addEventListener("pointerup", encerrarInteracaoLista);
  lista.addEventListener("pointercancel", encerrarInteracaoLista);

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

    if(evento.key === "Enter" || evento.key === "Tab"){
      const resultado = atlasObraResultados[atlasObraIndice >= 0 ? atlasObraIndice : 0];

      if(resultado && lista.classList.contains("ativo")){
        if(evento.key === "Enter") evento.preventDefault();
        await atlasSelecionarObraCombo(resultado.id, false);
      }else{
        if(evento.key === "Enter") evento.preventDefault();
        await atlasConfirmarObraDigitada();
      }
      return;
    }

    if(evento.key === "Escape"){
      atlasFecharSugestoesObra();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      if(atlasObraInteragindoLista) return;

      atlasFecharSugestoesObra();
      const selecionada = atlasObraSelecionadaAtual();
      if(selecionada){
        input.value = atlasTextoObra(selecionada);
      }
    }, 160);
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

  const preencherSelectObras = () => {
    const select = document.getElementById("obraSelect");
    const novaSelect = document.getElementById("novaObraSelect");

    if(!select || !novaSelect) return;

    select.innerHTML = `<option value="">Selecione a obra/setor</option>`;
    novaSelect.innerHTML = `<option value="">Selecione nova obra/setor</option>`;

    patrimonioObras.forEach(o => {
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
      patrimonioObras = await BDROfflineDB.lerTabela("obras") || [];
      preencherSelectObras();
      mostrarAvisoModoOffline();
      return;
    }

    const { data, error } = await patrimonioDb()
      .from("obras")
      .select("*")
      .eq("ativa", true)
      .order("nome");

    if(error) throw error;

    patrimonioObras = data || [];

    if(window.BDROfflineDB?.salvarTabela){
      await BDROfflineDB.salvarTabela("obras", patrimonioObras);
    }

    preencherSelectObras();

  }catch(e){
    console.warn("Patrimônio: falha ao carregar obras online, usando cache:", e.message || e);
    patrimonioObras = await BDROfflineDB.lerTabela("obras") || [];
    preencherSelectObras();
    BDR_PATRIMONIO_ONLINE_REAL = false;
    mostrarAvisoModoOffline();
  }
}

async function alternarTravaObra(){

  if(!usuarioPodeCriarPatrimonioBDR()){
    alert("Você não tem permissão para alterar obra de lançamento.");
    return;
  }

  if(!usuarioPodeEscolherObraLancamentoBDR()){
    aplicarRegraObraLancamentoBDR();
    alert("Este usuário não possui obras liberadas para escolher no lançamento.");
    return;
  }

  if(window.obraTravada){
    const temDados =
      patrimonioValor("nome_bem") ||
      patrimonioValor("valor_bem") ||
      patrimonioValor("patrimonioObservacao") ||
      patrimonioValor("tipo_item");

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

  let obraSelecionada = atlasObraSelecionadaAtual();

  /*
   * O campo visível de obras é um autocomplete e o select real fica oculto.
   * Em alguns navegadores/sessões o texto podia estar correto, porém o select
   * ainda não tinha sido confirmado. Antes de desistir, sincronizamos os dois.
   */
  if(!obraSelecionada && document.getElementById("obraBusca")?.value){
    const selecionouDigitacao = await atlasConfirmarObraDigitada();

    if(selecionouDigitacao){
      obraSelecionada = atlasObraSelecionadaAtual();
    }
  }

  if(!obraSelecionada){
    alert("Selecione uma obra/setor da lista antes de confirmar.");
    document.getElementById("obraBusca")?.focus();
    return;
  }

  /*
   * MASTER sem obra principal pode escolher qualquer uma das obras que
   * realmente estiverem liberadas para ele. Assim não precisamos prender
   * o usuário a uma obra só para conseguir cadastrar.
   */
  if(
    !patrimonioUsuarioOwnerBDR() &&
    !usuarioPodeVerObraPatrimonioBDR(obraSelecionada.id)
  ){
    alert("Esta obra não está liberada para este usuário.");
    return;
  }

  window.obraAtiva = obraSelecionada;
  window.obraTravada = true;

  localStorage.setItem("obraAtivaId", obraSelecionada.id);
  localStorage.setItem("obraTravada", "SIM");

  atualizarVisualTrava();
}

function destravarObra(){
  if(!usuarioPodeEscolherObraLancamentoBDR()){
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

  const obraSelecionada = patrimonioObras.find(
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

function atlasRegistroCatalogoPatrimonio(item){
  if(!item) return null;
  return {
    id:item.id ?? null,
    created_at:item.created_at ?? null,
    nome_bem:String(item.nome_bem||'').trim().toUpperCase(),
    tipo_item:String(item.tipo_item||'').trim().toUpperCase(),
    tipo_outro:String(item.tipo_outro||'').trim().toUpperCase(),
    marca:String(item.marca||'').trim().toUpperCase(),
    modelo:String(item.modelo||'').trim().toUpperCase(),
    valor_bem:item.valor_bem ?? null,
    estado_conservacao:String(item.estado_conservacao||'').trim().toUpperCase(),
    ncm:String(item.ncm||'').trim(),
    cor:String(item.cor||'').trim().toUpperCase(),
    combustivel:String(item.combustivel||'').trim().toUpperCase(),
    potencia:String(item.potencia||'').trim().toUpperCase(),
    ano_fabricacao:item.ano_fabricacao ?? null,
    ano_modelo:item.ano_modelo ?? null,
    vezes_utilizado:Number(item.vezes_utilizado||1)
  };
}

async function atlasCarregarCatalogoGlobalPatrimonio(){
  try{
    if(!patrimonioDb()) return;
    const {data,error}=await patrimonioDb()
      .from('patrimonio')
      .select('id,created_at,nome_bem,tipo_item,tipo_outro,marca,modelo,valor_bem,estado_conservacao,ncm,cor,combustivel,potencia,ano_fabricacao,ano_modelo')
      .neq('ativo',false)
      .order('created_at',{ascending:false})
      .order('id',{ascending:false})
      .limit(5000);

    if(error) throw error;

    const mapa=new Map();
    (data||[]).forEach(item=>{
      const registro=atlasRegistroCatalogoPatrimonio(item);
      if(!registro?.nome_bem) return;
      const chave=atlasChaveCatalogoPatrimonio(registro);
      if(!chave) return;

      if(!mapa.has(chave)){
        mapa.set(chave,{...registro,vezes_utilizado:1});
      }else{
        mapa.get(chave).vezes_utilizado++;
      }
    });

    atlasCatalogoGlobalPatrimonio=[...mapa.values()]
      .sort((a,b)=>
        (Number(b.vezes_utilizado||0)-Number(a.vezes_utilizado||0)) ||
        a.nome_bem.localeCompare(b.nome_bem,'pt-BR')
      );
  }catch(e){
    console.warn('Atlas Patrimônio: catálogo global indisponível; usando dados locais.',e?.message||e);
    atlasCatalogoGlobalPatrimonio=[];
  }
}

function atlasCatalogoNomesPatrimonio(){
  const locais=(window.patrimonios||patrimonioItens||[])
    .map(atlasRegistroCatalogoPatrimonio)
    .filter(p=>p?.nome_bem);

  const padrao=ATLAS_NOMES_PATRIMONIO_PADRAO.map(nome=>({
    nome_bem:nome,marca:'',modelo:'',vezes_utilizado:0
  }));

  const mapa=new Map();
  // Registros reais têm prioridade sobre nomes genéricos do catálogo padrão.
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

  const sugestoes=atlasCatalogoNomesPatrimonio()
    .filter(item=>[item.nome_bem,item.marca,item.modelo]
      .some(v=>atlasNormalizarTextoSugestao(v).includes(termo)))
    .sort((a,b)=>{
      const aNome=atlasNormalizarTextoSugestao(a.nome_bem);
      const bNome=atlasNormalizarTextoSugestao(b.nome_bem);
      const aComeca=aNome.startsWith(termo)?1:0;
      const bComeca=bNome.startsWith(termo)?1:0;
      if(aComeca!==bComeca) return bComeca-aComeca;
      const aCompleto=(a.marca||a.modelo)?1:0;
      const bCompleto=(b.marca||b.modelo)?1:0;
      if(aCompleto!==bCompleto) return bCompleto-aCompleto;
      return Number(b.vezes_utilizado||0)-Number(a.vezes_utilizado||0);
    })
    .slice(0,10);

  if(!sugestoes.length){atlasFecharSugestoesPatrimonio();return;}

  lista.innerHTML=sugestoes.map((item,indice)=>{
    const dados=encodeURIComponent(JSON.stringify(item));
    const detalhe=[item.marca,item.modelo].filter(Boolean).join(' • ');
    const usado=Number(item.vezes_utilizado||0)>1 ? ` • usado ${Number(item.vezes_utilizado)}x` : '';
    return `<button type="button" class="atlas-sugestao" data-indice="${indice}" data-dados="${dados}"
      onmousedown="event.preventDefault(); atlasEscolherSugestaoPatrimonioDados('${dados}')">
      ${item.nome_bem}
      <small>${detalhe||'Nome padronizado do catálogo'}${usado}</small>
    </button>`;
  }).join('');
  lista.classList.add('ativo');
}

function atlasEscolherSugestaoPatrimonioDados(dadosCodificados){
  let item=null;
  try{item=JSON.parse(decodeURIComponent(dadosCodificados));}catch(e){}
  if(!item) return;

  if(window.AtlasPatrimonioAssistente?.preencher?.(item)){
    atlasFecharSugestoesPatrimonio();
    return;
  }

  // Fallback seguro caso o módulo assistente ainda não tenha carregado.
  const input=document.getElementById('nome_bem');
  if(input) input.value=String(item.nome_bem||'').toUpperCase();
  const marca=document.getElementById('marca');
  const modelo=document.getElementById('modelo');
  if(marca && item.marca) marca.value=String(item.marca).toUpperCase();
  if(modelo && item.modelo) modelo.value=String(item.modelo).toUpperCase();
  atlasFecharSugestoesPatrimonio();
  input?.focus();
  window.AtlasPatrimonioLote?.resetar?.();
}

function atlasEscolherSugestaoPatrimonio(nome){
  atlasEscolherSugestaoPatrimonioDados(encodeURIComponent(JSON.stringify({nome_bem:nome,marca:'',modelo:''})));
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
    atlasIndiceSugestaoPatrimonio =
      Math.min(atlasIndiceSugestaoPatrimonio + 1, botoes.length - 1);
  }else if(event.key === "ArrowUp"){
    event.preventDefault();
    atlasIndiceSugestaoPatrimonio =
      Math.max(atlasIndiceSugestaoPatrimonio - 1, 0);
  }else if(event.key === "Enter" || event.key === "Tab"){
    const indice = atlasIndiceSugestaoPatrimonio >= 0
      ? atlasIndiceSugestaoPatrimonio
      : 0;

    const dados = botoes[indice]?.dataset?.dados;
    if(dados){
      if(event.key === "Enter") event.preventDefault();
      atlasEscolherSugestaoPatrimonioDados(dados);
    }
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
  const u = patrimonioUsuarioAtual();

  if(!card || !select || !u) return;

  const idsLiberados = String(u.obras_liberadas || "")
    .split(/[;,|]/)
    .map(x=>x.trim())
    .filter(Boolean);

  const ids = new Set(idsLiberados);
  if(u.obra_id) ids.add(String(u.obra_id));

  // MASTER/OWNER continuam vendo o seletor porque possuem acesso amplo.
  const perfil = String(u.perfil || "").toUpperCase();
  const acessoAmplo =
    ["MASTER","OWNER"].includes(perfil) ||
    usuarioTemPermissao("PATRIMONIO_LANCAR_QUALQUER_OBRA") ||
    usuarioTemPermissao("TODAS_OBRAS_VER");

  if(!acessoAmplo && ids.size === 1){
    const obraId = Array.from(ids)[0];
    const obra = (window.obras || patrimonioObras || []).find(o=>String(o.id)===String(obraId));

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
    return atlasListaUnica((patrimonioItens || []).map(item => item?.marca));
  }

  const marca = atlasTextoMaiusculo(document.getElementById("marca")?.value);
  return atlasListaUnica(
    (patrimonioItens || [])
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
  }else if(evento.key === "Enter" && lista?.classList.contains("ativo")){
    const selecionado = itens[estado.indice >= 0 ? estado.indice : 0];
    if(selecionado){
      evento.preventDefault();
      atlasSelecionarAutocomplete(tipo, selecionado);
    }else{
      atlasFecharAutocomplete(tipo);
    }
    return;
  }else if(evento.key === "Tab"){
    // TAB preserva exatamente o texto digitado em Marca/Modelo.
    atlasFecharAutocomplete(tipo);
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
    `<input id="numero_serie" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${placeholder}">`;
}

function mostrarCampos(){
  const tipo = patrimonioValor("tipo_item");
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
  const campos = "id,codigo_qr,nome_bem,tipo_item,marca,modelo,numero_serie,placa,renavam,chassi,codigo_antigo,obra_id,localizacao,ativo";

  try{
    const onlineReal = await patrimonioOnlineReal();

    if(onlineReal && patrimonioDb()){
      const { data, error } = await patrimonioDb()
        .from("patrimonio")
        .select(campos)
        .or("ativo.eq.true,ativo.is.null")
        .limit(5000);

      if(!error && Array.isArray(data)) return data;
      console.warn("Anti-duplicidade: usando lista local porque o banco retornou erro:", error?.message || error);
    }
  }catch(e){
    console.warn("Anti-duplicidade: falha ao consultar banco, usando lista local.", e);
  }

  try{
    const cache = window.BDROfflineDB?.lerTabela
      ? await BDROfflineDB.lerTabela("patrimonio")
      : [];

    return [ ...(patrimonioItens || []), ...(cache || []) ];
  }catch(e){
    return patrimonioItens || [];
  }
}

async function bdrVerificarDuplicidadePatrimonio(dados,opcoes={}){
  const lista=await bdrBaseDuplicidadePatrimonio();
  const bloqueios=[];
  const alertas=[];
  const tipo=String(dados.tipo_item||'').toUpperCase();

  const igual=(a,b)=>bdrMesmoValor(a,b);
  const camposIguais=(p)=>
    igual(dados.nome_bem,p.nome_bem) &&
    igual(dados.marca,p.marca) &&
    igual(dados.modelo,p.modelo) &&
    igual(dados.numero_serie,p.numero_serie);

  (lista||[]).forEach(p=>{
    if(!p||p.ativo===false) return;
    if(dados.id && String(p.id)===String(dados.id)) return;

    if(tipo==='VEICULO'){
      if(igual(dados.placa,p.placa)) bloqueios.push({motivo:'PLACA já cadastrada',patrimonio:p});
      if(igual(dados.renavam,p.renavam)) bloqueios.push({motivo:'RENAVAM já cadastrado',patrimonio:p});
      if(igual(dados.chassi,p.chassi)) bloqueios.push({motivo:'CHASSI já cadastrado',patrimonio:p});
      return;
    }

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
    alert('Cadastro bloqueado porque todos os identificadores coincidem.\n\n'+msg);
    return false;
  }

  if(a.length && opcoes.confirmar!==false){
    const msg=a.slice(0,5).map(item=>`⚠️ ${item.motivo}\n${bdrResumoPatrimonioDuplicado(item.patrimonio)}\nSérie: ${item.patrimonio?.numero_serie||'-'}\nCódigo antigo: ${item.patrimonio?.codigo_antigo||'-'}`).join('\n\n');
    return await bdrConfirmarAtlas('Possível duplicidade encontrada:\n\n'+msg+'\n\nOs dados não são suficientes para bloquear. Deseja cadastrar mesmo assim?');
  }
  return true;
}

async function validarDuplicidadeCampoPatrimonio(campo){
  const v = patrimonioValor(campo);

  if(bdrCampoVazioOuGenerico(v)){
    return true;
  }

  const tipoItem = String(patrimonioValor("tipo_item") || "").toUpperCase();
  const lista = await bdrBaseDuplicidadePatrimonio();

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

  const identificadorUnicoVeiculo =
    tipoItem === "VEICULO" &&
    ["placa", "renavam", "chassi"].includes(campo);

  if(identificadorUnicoVeiculo){
    alert(
      `🚫 ${campo.toUpperCase()} já cadastrado.\n\n` +
      msg +
      "\n\nEste identificador não pode se repetir em veículos."
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

  if(!usuarioPodeCriarPatrimonioBDR()){
    alert("Você não tem permissão para cadastrar patrimônio.");
    return;
  }


  const obra = obterObraParaLancamento();

  if(!obra){
    alert("Selecione uma obra/setor para lançamento.");
    return;
  }

  const nome_bem = patrimonioValor("nome_bem");
  const tipo_item = patrimonioValor("tipo_item");
  const status_inicial = patrimonioValor("status_inicial") || "ESTOQUE";

  if(!nome_bem || !tipo_item){
    alert("Preencha nome do bem e tipo.");
    return;
  }

  if(tipo_item === "OUTRO" && !patrimonioValor("tipo_outro")){
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
    placa: patrimonioValor("placa") || null,
    renavam: patrimonioValor("renavam") || null,
    chassi: patrimonioValor("chassi") || null,
    codigo_antigo: patrimonioValor("codigo_antigo") || null,
    marca: patrimonioValor("marca") || null,
    modelo: patrimonioValor("modelo") || null,
    numero_serie: patrimonioValor("numero_serie") || null,
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
    tipo_outro: patrimonioValor("tipo_outro") || null,

    empresa_id: obra.empresa_id ? Number(obra.empresa_id) : 17,
    obra_id: obra.id ? Number(obra.id) : null,
    localizacao: obra.nome || null,

    sequencial: Number(sequencial),
    codigo_qr,
    status: status_inicial,

    marca: patrimonioValor("marca") || null,
    modelo: patrimonioValor("modelo") || null,
    numero_serie: patrimonioValor("numero_serie") || null,
    descricao: patrimonioValor("descricao") || null,
    fornecedor: patrimonioValor("fornecedor") || null,
    data_compra: patrimonioValor("data_compra") || null,
    responsavel: patrimonioValor("responsavel") || null,
    departamento: patrimonioValor("departamento") || null,
    endereco_estoque: patrimonioValor("endereco_estoque") || null,

    placa: patrimonioValor("placa") || null,
    renavam: patrimonioValor("renavam") || null,
    cor: patrimonioValor("cor") || null,
    combustivel: patrimonioValor("combustivel") || null,
    potencia: patrimonioValor("potencia") || null,
    chassi: patrimonioValor("chassi") || null,

horimetro: moedaParaNumero(patrimonioValor("horimetro")),
quilometragem: moedaParaNumero(patrimonioValor("quilometragem")),

ano_fabricacao: patrimonioValor("ano_fabricacao")
  ? parseInt(patrimonioValor("ano_fabricacao"))
  : null,

ano_modelo: patrimonioValor("ano_modelo")
  ? parseInt(patrimonioValor("ano_modelo"))
  : null,

    valor_bem: moedaParaNumero(patrimonioValor("valor_bem")),
    codigo_antigo: patrimonioValor("codigo_antigo") || null,
    ncm: patrimonioValor("ncm") || null,
    numero_nfe: patrimonioValor("numero_nfe") || null,
    estado_conservacao: patrimonioValor("estado_conservacao") || "BOM",
    observacao: [
      patrimonioValor("patrimonioObservacao"),
      patrimonioValor("especificacoes") ? "Especificações: " + patrimonioValor("especificacoes") : ""
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

  patrimonioItens.unshift({
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
    if(usuarioQuerSomCriacaoPatrimonioBDR()){
      window.AtlasAudio?.concluido?.();
    }
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
  document.getElementById("status_inicial").value = "ESTOQUE";
  document.getElementById("valor_bem").value = "";
  document.getElementById("tipo_outro").value = "";
  document.getElementById("campoOutroTipo").style.display = "none";
  document.getElementById("patrimonioObservacao").value = "";
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
  const usuario = patrimonioUsuarioAtual();
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

async function carregarPatrimonios(){
  const visualizarInativos = atlasMostrarInativos && atlasPodeVerInativos();

  try{
    const onlineReal = await patrimonioOnlineReal();

    if(!onlineReal){
      let dadosCache = await BDROfflineDB.lerTabela("patrimonio") || [];
      const usuario = patrimonioUsuarioAtual();

      dadosCache = dadosCache.filter(p =>
        visualizarInativos ? p.ativo === false : p.ativo !== false
      );

      if(usuario && !usuarioPodeVerTodasObras()){
        const permitidas = new Set(
          obrasPermitidasPatrimonioBDR(usuario).map(String)
        );

        dadosCache = permitidas.size
          ? dadosCache.filter(p => permitidas.has(String(p.obra_id)))
          : [];
      }

      patrimonioItens = dadosCache;
      renderizarPatrimonios();
      mostrarAvisoModoOffline();
      atlasAtualizarBotaoInativos();
      return;
    }

    const usuario = patrimonioUsuarioAtual();
    const permitidasUsuario = usuario && !usuarioPodeVerTodasObras()
      ? obrasPermitidasPatrimonioBDR(usuario)
      : null;

    if(Array.isArray(permitidasUsuario) && permitidasUsuario.length === 0){
      patrimonioItens = [];
      renderizarPatrimonios();
      mostrarAvisoModoOffline();
      atlasAtualizarBotaoInativos();
      return;
    }

    /*
     * O PostgREST/Supabase normalmente devolve no máximo cerca de 1000 linhas
     * por resposta. Como o Atlas já ultrapassou isso, uma leitura única fazia
     * os registros mais antigos sumirem da tela Patrimônio e da pesquisa.
     */
    const TAMANHO_PAGINA_BANCO = 1000;
    let dados = [];

    for(let inicio = 0; ; inicio += TAMANHO_PAGINA_BANCO){
      let query = patrimonioDb().from("patrimonio").select("*");

      query = visualizarInativos
        ? query.eq("ativo", false)
        : query.or("ativo.eq.true,ativo.is.null");

      if(Array.isArray(permitidasUsuario)){
        if(permitidasUsuario.length === 1){
          query = query.eq("obra_id", permitidasUsuario[0]);
        }else{
          query = query.in("obra_id", permitidasUsuario);
        }
      }

      const { data: pagina, error } = await query
        .order("id", { ascending:false })
        .range(inicio, inicio + TAMANHO_PAGINA_BANCO - 1);

      if(error) throw error;

      const lote = pagina || [];
      dados.push(...lote);
      if(lote.length < TAMANHO_PAGINA_BANCO) break;
    }

    console.log("✅ ATLAS PATRIMÔNIO: carga completa", {
      total: dados.length,
      inativos: visualizarInativos,
      obras_restritas: Array.isArray(permitidasUsuario) ? permitidasUsuario.length : "todas"
    });

    if(Array.isArray(permitidasUsuario)){
      const permitidas = new Set(permitidasUsuario.map(String));
      dados = dados.filter(p => permitidas.has(String(p.obra_id)));
    }

    patrimonioItens = dados;

    // O cache mantém apenas o conjunto carregado nesta visualização.
    if(window.BDROfflineDB?.salvarTabela && !visualizarInativos){
      await BDROfflineDB.salvarTabela("patrimonio", patrimonioItens);
    }

    renderizarPatrimonios();
    atlasAtualizarBotaoInativos();

  }catch(e){
    console.warn("Patrimônio: falha ao carregar patrimônios online, usando cache:", e.message || e);
    let dadosCache = await BDROfflineDB.lerTabela("patrimonio") || [];
    const usuario = patrimonioUsuarioAtual();

    dadosCache = dadosCache.filter(p =>
      visualizarInativos ? p.ativo === false : p.ativo !== false
    );

    if(usuario && !usuarioPodeVerTodasObras()){
      const permitidas = new Set(
        obrasPermitidasPatrimonioBDR(usuario).map(String)
      );

      dadosCache = permitidas.size
        ? dadosCache.filter(p => permitidas.has(String(p.obra_id)))
        : [];
    }

    patrimonioItens = dadosCache;
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
    ${p.numero_nfe || ""}
    ${p.ncm || ""}
    ${p.fornecedor || ""}
    ${p.departamento || ""}
    ${p.endereco_estoque || ""}
    ${p.valor_bem || ""}
  `;
}



function bdrResetPaginaPatrimonio(){
  bdrPatrimonioPaginaAtual = 1;
}

function bdrPatrimonioFiltroChave(){
  return [
    patrimonioValor("patrimonioBusca"),
    patrimonioValor("patrimonioFiltroObra"),
    patrimonioValor("filtroStatus"),
    patrimonioValor("patrimonioFiltroTipo"),
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

  const buscaOriginal = patrimonioValor("patrimonioBusca");
  const busca = normalizarBuscaPatrimonio(buscaOriginal);
  const filtroStatus = patrimonioValor("filtroStatus");
  const filtroTipo = patrimonioValor("patrimonioFiltroTipo");
  const filtroObra = patrimonioValor("patrimonioFiltroObra");

  const chaveFiltro = bdrPatrimonioFiltroChave();
  if(chaveFiltro !== bdrPatrimonioUltimaChaveFiltro){
    bdrPatrimonioPaginaAtual = 1;
    bdrPatrimonioUltimaChaveFiltro = chaveFiltro;
  }

  const lista = document.getElementById("lista");
  lista.innerHTML = "";

  const filtrados = patrimonioItens.filter(p => {
    const textoBusca = normalizarBuscaPatrimonio(textoBuscaPatrimonio(p));
    const estadoAtivoCorreto = atlasMostrarInativos ? p.ativo === false : p.ativo !== false;

    return estadoAtivoCorreto &&
      (!busca || textoBusca.includes(busca)) &&
      (!filtroObra || String(p.obra_id || "") === String(filtroObra)) &&
      (!filtroStatus || p.status === filtroStatus) &&
      (!filtroTipo || p.tipo_item === filtroTipo);
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
    <div class="bdr-lista-tools">
      <div>
        <strong>Exibindo ${inicio + 1}–${fim} de ${total}</strong><br>
        <span>${buscaOriginal ? "Resultado filtrado" : "Últimos patrimônios carregados"} • ${porPagina} por página</span>
      </div>
      <span>Use a pesquisa para localizar PAT, NF, placa, série, nome ou obra.</span>
    </div>

    <div class="lista-header">
      <div class="bdr-check-etiqueta">
        <input type="checkbox" class="bdr-etiqueta-pagina-check" aria-label="Selecionar etiquetas desta página" title="Selecionar etiquetas desta página" onchange="bdrSelecionarPaginaEtiquetas(this.checked)">
        <input type="checkbox" class="atlas-remessa-pagina-check" aria-label="Selecionar patrimônios desta página para remessa" title="Selecionar patrimônios desta página para remessa" onchange="AtlasPatrimonioRemessas.selecionarPagina(this.checked)">
      </div>
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
      <div class="linha-patrimonio" onclick="window.AtlasPatrimonioRemessas?.modoSelecaoAtivo?.() ? AtlasPatrimonioRemessas.alternarPorLinha('${p.id}') : (bdrModoSelecaoEtiquetas ? bdrAlternarEtiquetaPorLinha('${p.codigo_qr || ''}') : abrirModal('${p.id}'))">

        <div class="bdr-check-etiqueta" onclick="event.stopPropagation()">
          <input type="checkbox" class="bdr-etiqueta-check" data-codigo="${p.codigo_qr || ''}" ${bdrEtiquetasSelecionadas.has(String(p.codigo_qr || '')) ? 'checked' : ''} onchange="bdrAlternarSelecaoEtiqueta(this.dataset.codigo,this.checked)" aria-label="Selecionar etiqueta ${p.codigo_qr || ''}">
          <input type="checkbox" class="atlas-remessa-check" data-pat-id="${p.id}" ${window.AtlasPatrimonioRemessas?.estaSelecionado?.(p.id) ? 'checked' : ''} onchange="AtlasPatrimonioRemessas.selecionarItem(this.dataset.patId,this.checked)" aria-label="Selecionar patrimônio ${p.codigo_qr || ''} para remessa">
        </div>

        <div class="pat-codigo" title="${p.codigo_qr || "-"}">
          ${p.codigo_qr || "-"} ${p.__offline_pendente ? '<span class="bdr-pendente-offline">OFFLINE</span>' : ''}
        </div>

        <div class="pat-nome" title="${p.nome_bem || "-"} ${infoExtra}">
          ${p.nome_bem || "-"}
          ${infoExtra ? `<br><small style="color:#6b7280;font-weight:700;">${infoExtra}</small>` : ""}
        </div>

        <div class="pat-local" title="${p.localizacao || "SEM OBRA"}">
          ${p.localizacao || "SEM OBRA"}
        </div>

        <div class="pat-tipo">
          ${p.tipo_item || "-"}
        </div>

        <div class="pat-valor">
          ${formatarMoeda(p.valor_bem)}
        </div>

        <div class="pat-status status-${statusClasse}">
          ${p.status || "SEM STATUS"}
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

function bdrAlternarEtiquetaPorLinha(codigo){
  codigo = String(codigo || "").trim();
  if(!codigo || !bdrModoSelecaoEtiquetas) return;
  const marcado = !bdrEtiquetasSelecionadas.has(codigo);
  bdrAlternarSelecaoEtiqueta(codigo, marcado);
  document.querySelectorAll('.bdr-etiqueta-check').forEach(check => {
    if(String(check.dataset.codigo || '').trim() === codigo) check.checked = marcado;
  });
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
  const botao = document.getElementById("bdrBotaoAcaoEtiquetas");
  const ajuda = document.getElementById("bdrLoteAjuda");

  if(el) el.textContent = `${quantidade} etiqueta(s) selecionada(s)`;

  if(botao){
    if(bdrModoSelecaoEtiquetas){
      botao.className = "bdr-lote-imprimir";
      botao.textContent = quantidade ? `🖨 Imprimir ${quantidade} etiqueta(s)` : "🖨 Imprimir selecionadas";
      botao.disabled = quantidade === 0;
    }else{
      botao.className = "bdr-lote-selecionar";
      botao.textContent = "☑ Selecionar etiquetas";
      botao.disabled = false;
    }
  }

  if(ajuda){
    ajuda.textContent = bdrModoSelecaoEtiquetas
      ? "Marque os patrimônios desejados na lista."
      : "Imprima uma ou várias etiquetas sem poluir a lista.";
  }
}

function bdrEntrarModoSelecaoEtiquetas(){
  if(!usuarioTemPermissao("PATRIMONIO_IMPRIMIR")){
    alert("Você não tem permissão para imprimir etiquetas.");
    return;
  }
  bdrModoSelecaoEtiquetas = true;
  document.body.classList.add("bdr-modo-selecao-etiquetas");
  document.querySelector('.atlas-shell-module[data-module="patrimonio"]')?.classList.add("bdr-modo-selecao-etiquetas");
  bdrAtualizarContadorEtiquetas();
}

function bdrCancelarSelecaoEtiquetas(){
  bdrEtiquetasSelecionadas.clear();
  document.querySelectorAll(".bdr-etiqueta-check").forEach(c => c.checked=false);
  const checkPagina = document.querySelector('.lista-header .bdr-check-etiqueta input');
  if(checkPagina) checkPagina.checked = false;
  bdrModoSelecaoEtiquetas = false;
  document.body.classList.remove("bdr-modo-selecao-etiquetas");
  document.querySelector('.atlas-shell-module[data-module="patrimonio"]')?.classList.remove("bdr-modo-selecao-etiquetas");
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

async function abrirModal(id){

  const p = patrimonioItens.find(
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
    const podeReativar = usuarioTemPermissao("PATRIMONIO_EXCLUIR");
    botaoReativar.style.display = inativo && podeReativar ? "" : "none";
    botaoReativar.disabled = !inativo || !podeReativar;
  }

  document.getElementById("modalBg").style.display = "flex";
  document.body.classList.add("atlas-patrimonio-modal-ativo");
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
  if(!patrimonioDb() || !patrimonioId) return null;

  const { data, error } = await patrimonioDb()
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

function fecharModal(){
  document.getElementById("modalBg").style.display = "none";
  document.body.classList.remove("atlas-patrimonio-modal-ativo");
  patrimonioSelecionado = null;
}

function aplicarPermissoesTela(){
  const usuario = patrimonioUsuarioAtual();

  if(!usuario) return;

  /*
    Cada ação do Patrimônio é independente.
    Perfil ADMIN/MASTER e permissões de outros módulos não liberam ações.
  */
  const podeCadastrar = usuarioPodeCriarPatrimonioBDR();
  const podeMovimentar = usuarioTemPermissao("PATRIMONIO_MOVIMENTAR");
  const podeEditar = usuarioTemPermissao("PATRIMONIO_EDITAR");
  const podeImprimir = usuarioTemPermissao("PATRIMONIO_IMPRIMIR");
  const podeExcluir = usuarioTemPermissao("PATRIMONIO_EXCLUIR");

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

  const botaoEtiquetas = document.getElementById("bdrBotaoAcaoEtiquetas");
  if(botaoEtiquetas){
    botaoEtiquetas.style.display = podeImprimir ? "" : "none";
    botaoEtiquetas.disabled = !podeImprimir;
  }

  const botaoNovaRemessa = document.querySelector('#atlasRemessaCard [data-permissao="PATRIMONIO_MOVIMENTAR"]');
  if(botaoNovaRemessa){
    botaoNovaRemessa.style.display = podeMovimentar ? "" : "none";
    botaoNovaRemessa.disabled = !podeMovimentar;
  }

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
    if(!patrimonioDb()) return;
    const { data, error } = await patrimonioDb()
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
  const statusEncerradosAtlas = ["FECHADA","FINALIZADA","CANCELADA","ORCAMENTO_RECUSADO"];
  const abertas = manutencoesPatrimonio.filter(m => !statusEncerradosAtlas.includes(String(m.status || "ABERTA").toUpperCase()));
  const fechadas = manutencoesPatrimonio.filter(m => statusEncerradosAtlas.includes(String(m.status || "").toUpperCase()));
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
  const encerrados = ["FECHADA","FINALIZADA","CANCELADA","ORCAMENTO_RECUSADO"];
  return manutencoesPatrimonio.find(m =>
    String(m.patrimonio_id) === String(id) &&
    !encerrados.includes(String(m.status || "ABERTA").toUpperCase())
  );
}

function abrirModalManutencao(){
  if(!patrimonioSelecionado) return;
  const info = document.getElementById("manutInfoAbertura");
  if(info){
    info.innerHTML = `<b>${patrimonioSelecionado.codigo_qr || "-"}</b> • ${patrimonioSelecionado.nome_bem || "-"}<br>Informe o motivo para enviar este patrimônio à manutenção.`;
  }
  document.getElementById("manut_motivo").value = patrimonioValor("observacaoMov") || "";
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
  const usuario = patrimonioUsuarioAtual();
  const payload = {
    patrimonio_id: patrimonioSelecionado.id,
    codigo_patrimonio: patrimonioSelecionado.codigo_qr || patrimonioSelecionado.codigo_antigo || null,
    nome_patrimonio: patrimonioSelecionado.nome_bem || null,
    obra_id: patrimonioSelecionado.obra_id || null,
    status: "ABERTA",
    motivo,
    usuario_abertura: usuario?.nome || "Usuário não identificado"
  };

  const { error } = await patrimonioDb().from("manutencoes_patrimonio").insert([payload]);
  if(error) throw error;
}

async function fecharManutencaoBDR(dados){
  const aberta = manutencaoAbertaDoPatrimonio(patrimonioSelecionado.id);
  if(!aberta){
    throw new Error("Não encontrei manutenção aberta para este patrimônio.");
  }

  const usuario = patrimonioUsuarioAtual();
  const dias = diasEntreDatasBDR(aberta.data_entrada, new Date().toISOString());

  const { error } = await patrimonioDb()
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
  const motivo = patrimonioValor("manut_motivo");
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
  const fornecedor = patrimonioValor("manut_fornecedor");
  const valorOrcamento = moedaParaNumero(patrimonioValor("manut_valor_orcamento"));
  const descricao = patrimonioValor("manut_descricao_orcamento");
  const solucao = patrimonioValor("manut_solucao");

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

  if(novoStatus === "MANUTENCAO"){
    abrirModalManutencao();
    return;
  }

  if(statusAtual === "MANUTENCAO" && novoStatus !== "MANUTENCAO"){
    // Novo fluxo Atlas: se existir ordem estruturada aberta, a saída da
    // manutenção precisa ser feita pela Central para preservar orçamento,
    // aprovação, histórico, recebimento e garantia.
    if(window.AtlasWorkflowManutencao?.abertaPorPatrimonio){
      try{
        const ordemAtlas = await window.AtlasWorkflowManutencao.abertaPorPatrimonio(patrimonioSelecionado.id);
        if(ordemAtlas && String(ordemAtlas.status || "").toUpperCase() !== "ABERTA"){
          if(confirm(`Existe a ordem ${ordemAtlas.codigo || "#" + ordemAtlas.id} em andamento.\n\nDeseja abrir a Central de Manutenção?`)){
            location.href = `manutencao.html?id=${ordemAtlas.id}`;
          }
          return;
        }
      }catch(e){
        console.warn("Atlas Patrimônio: não foi possível validar a ordem de manutenção.", e);
      }
    }

    // Compatibilidade com manutenções antigas já existentes.
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

  const obs = observacaoForcada || patrimonioValor("observacaoMov");

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
      usuario: patrimonioUsuarioAtual()?.nome || "Usuário não identificado",
      data_movimentacao: new Date().toISOString()
    }]);

    patrimonioItens = patrimonioItens.map(p =>
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

  patrimonioItens = patrimonioItens.map(p =>
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
    alert("Você não tem permissão para trocar obra/setor.");
    return;
  }


  if(!patrimonioSelecionado){
    alert("Selecione um patrimônio.");
    return;
  }

  const obs = patrimonioValor("observacaoMov");

  if(!obs || obs.length < 5){
    alert("Informe uma justificativa da troca de setor/obra.");
    return;
  }

  const novaObraId = document.getElementById("novaObraSelect").value;

  if(!novaObraId){
    alert("Selecione a nova obra/setor.");
    return;
  }

  const novaObra = patrimonioObras.find(
    o => String(o.id) === String(novaObraId)
  );

  if(!novaObra){
    alert("Obra não encontrada.");
    return;
  }

  const statusAnterior = patrimonioSelecionado.status || null;
  const obraOrigemId = patrimonioSelecionado.obra_id || null;

  const payload = {
    obra_id: novaObra.id,
    empresa_id: novaObra.empresa_id,
    localizacao: novaObra.nome,
    status: "EM_USO"
  };

  
  if(patrimonioOffline()){
    await salvarOperacaoPatrimonioOffline("update", "patrimonio", payload, {
      filtro:{ id: patrimonioSelecionado.id }
    });

    await salvarOperacaoPatrimonioOffline("insert", "movimentacoes", [{
      patrimonio_id: patrimonioSelecionado.id,
      empresa_id: novaObra.empresa_id,
      obra_origem_id: obraOrigemId,
      obra_destino_id: novaObra.id,
      tipo: "TROCA_SETOR",
      status_anterior: statusAnterior,
      status_novo: "EM_USO",
      observacao: obs,
      usuario: patrimonioUsuarioAtual()?.nome || "Usuário não identificado",
      data_movimentacao: new Date().toISOString()
    }]);

    patrimonioItens = patrimonioItens.map(p =>
      Number(p.id) === Number(patrimonioSelecionado.id)
        ? {...p, ...payload, __offline_pendente:!!respTroca.offlineFirst}
        : p
    );

    alert("📦 Sem internet. Troca de setor salva no aparelho e será sincronizada quando a internet voltar.");

    fecharModal();
    renderizarPatrimonios();
    return;
  }

  const respTroca = await bdrAtualizarPrimeiroNoTablet(
    "patrimonio",
    { id: patrimonioSelecionado.id },
    payload,
    { acao:"TROCA_SETOR_PATRIMONIO" }
  );

  if(respTroca.error){
    console.error(respTroca.error);
    alert(respTroca.error.message || "Erro ao transferir patrimônio.");
    return;
  }

  patrimonioItens = patrimonioItens.map(p =>
    Number(p.id) === Number(patrimonioSelecionado.id)
      ? {...p, ...payload, __offline_pendente:!!respTroca.offlineFirst}
      : p
  );

  await gravarMovimentacao({
    patrimonio_id: patrimonioSelecionado.id,
    empresa_id: novaObra.empresa_id,
    obra_origem_id: obraOrigemId,
    obra_destino_id: novaObra.id,
    tipo: "TROCA_SETOR",
    status_anterior: statusAnterior,
    status_novo: "EM_USO",
    observacao: obs
  });

  if(respTroca.offlineFirst){ bdrAvisoSalvoTablet("Transferência salva offline. Será sincronizada automaticamente quando a internet voltar."); }

  fecharModal();
  renderizarPatrimonios();
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
    const banco = patrimonioDb();
    const autor = patrimonioUsuarioAtual();
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
      patrimonioUsuarioAtual()?.empresa_id ||
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
  const usuario = patrimonioUsuarioAtual();
  const podeExcluir =
    usuarioTemPermissao("PATRIMONIO_EXCLUIR");

  if(!podeExcluir){
    alert("Você não tem permissão para excluir patrimônio.");
    return;
  }

  if(!patrimonioSelecionado){
    alert("Selecione um patrimônio.");
    return;
  }

  const motivo = patrimonioValor("observacaoMov");
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

  patrimonioItens = patrimonioItens.filter(p => String(p.id) !== String(patrimonioExcluido.id));
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
      patrimonioUsuarioAtual()?.empresa_id ||
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
  const usuario = patrimonioUsuarioAtual();
  const podeReativar =
    usuarioTemPermissao("PATRIMONIO_EXCLUIR");

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

  patrimonioItens = patrimonioItens.filter(p => String(p.id) !== String(patrimonioReativado.id));
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


function montarCamposEdicaoPorTipo(){
  const tipo = patrimonioValor("edit_tipo_item") || String(patrimonioSelecionado?.tipo_item || "");
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
  bdrSetValorCampo("patrimonioEditObservacao", patrimonioSelecionado.observacao || "");
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

  const motivo = patrimonioValor("motivo_correcao");

  if(!motivo || motivo.length < 5){
    alert("Informe o motivo da correção cadastral.");
    return;
  }

  const tipoEditado = patrimonioValor("edit_tipo_item") || patrimonioSelecionado.tipo_item;

  const dadosAtualizados = {
    nome_bem: patrimonioValor("edit_nome_bem"),
    tipo_item: tipoEditado || null,
    tipo_outro: patrimonioValor("edit_tipo_outro") || null,
    valor_bem: moedaParaNumero(patrimonioValor("edit_valor_bem")),
    estado_conservacao: patrimonioValor("edit_estado_conservacao") || "BOM",
    marca: patrimonioValor("edit_marca") || null,
    modelo: patrimonioValor("edit_modelo") || null,
    numero_serie: patrimonioValor("edit_numero_serie") || null,
    descricao: patrimonioValor("edit_descricao") || null,
    fornecedor: patrimonioValor("edit_fornecedor") || null,
    data_compra: patrimonioValor("edit_data_compra") || null,
    responsavel: patrimonioValor("edit_responsavel") || null,
    departamento: patrimonioValor("edit_departamento") || null,
    endereco_estoque: patrimonioValor("edit_endereco_estoque") || null,
    placa: patrimonioValor("edit_placa") || null,
    renavam: patrimonioValor("edit_renavam") || null,
    chassi: patrimonioValor("edit_chassi") || null,
    cor: patrimonioValor("edit_cor") || null,
    combustivel: patrimonioValor("edit_combustivel") || null,
    potencia: patrimonioValor("edit_potencia") || null,
    ano_fabricacao: patrimonioValor("edit_ano_fabricacao") ? parseInt(patrimonioValor("edit_ano_fabricacao")) : null,
    ano_modelo: patrimonioValor("edit_ano_modelo") ? parseInt(patrimonioValor("edit_ano_modelo")) : null,
    horimetro: moedaParaNumero(patrimonioValor("edit_horimetro")),
    quilometragem: moedaParaNumero(patrimonioValor("edit_horimetro")),
    codigo_antigo: patrimonioValor("edit_codigo_antigo") || null,
    ncm: patrimonioValor("edit_ncm") || null,
    numero_nfe: patrimonioValor("edit_numero_nfe") || null,
    observacao: patrimonioValor("patrimonioEditObservacao") || null
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
      usuario: patrimonioUsuarioAtual()?.nome || "Usuário não identificado",
      data_movimentacao: new Date().toISOString()
    }]);

    patrimonioItens = patrimonioItens.map(p =>
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

  patrimonioItens = patrimonioItens.map(p =>
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
  if(!bloquearPatrimonioSemPermissaoBDR()) return;
  patrimonioAplicarMenuPorPermissaoBDR();

  carregarUsuarioTopo();

  if(!patrimonioDb()){
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
      const existe = patrimonioObras.find(
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
  patrimonioAplicarMenuPorPermissaoBDR();

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
window.AtlasPatrimonioAPI = Object.freeze({
  listar: () => patrimonioItens,
  obras: () => patrimonioObras,
  selecionado: () => patrimonioSelecionado,
  recarregar: () => carregarPatrimonios(),
  renderizar: () => renderizarPatrimonios()
});

console.log("✅ ATLAS PATRIMÔNIO V4.0 carregado - carga paginada completa + combo de obras com rolagem segura");
