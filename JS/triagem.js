/* =========================================================
   ATUALIZADO: TRIAGEM COM OFFLINE BDR
========================================================= */
let entradas = [];
let itens = [];
let obras = [];
let enderecos = [];
let visaoAtual = "CALENDARIO";

/* =========================================================
   OFFLINE BDR - Triagem
   Confirmação de item pode ser salva no aparelho sem internet.
========================================================= */

// Mantém NF/dia aberto mesmo depois de confirmar item ou recarregar a triagem.
const nfsAbertas = new Set();
let itemPatrimonioModalId = null;
let patrimonioModalConfirmando = false;
const extrasPatrimonioTriagem = {};
const diasAbertos = new Set();

window.onload = async () => {
  const usuario = usuarioAtual();

  const dataAtual = document.getElementById("dataAtual");
  if(dataAtual){
    dataAtual.innerText = new Date().toLocaleDateString("pt-BR");
  }

  const usuarioInfo = document.getElementById("usuarioInfo");
  if(usuarioInfo){
    usuarioInfo.innerText = usuario ? "👤 " + (usuario.nome || "") : "";
  }

  await carregarTriagem();
};

window.addEventListener("online", async () => {
  console.log("BDR: internet voltou, atualizando triagem e sincronizando pendências.");
  if(window.BDROfflineSync?.sincronizarPendentes){
    await window.BDROfflineSync.sincronizarPendentes();
  }
  await carregarTriagem();
});

window.addEventListener("offline", () => {
  console.log("BDR: triagem entrou em modo offline.");
  if(window.BDROfflineSync?.ativarOfflineAuto){
    window.BDROfflineSync.ativarOfflineAuto("evento_offline_triagem");
  }
  if(window.BDROfflineSync?.atualizarStatusTela){
    window.BDROfflineSync.atualizarStatusTela();
  }
});

window.addEventListener("bdrOnlineRealVoltou", async () => {
  console.log("BDR: online real voltou, atualizando triagem.");
  await carregarTriagem();
});

function ir(pagina){ window.location.href = pagina; }
function db(){
  return window.client || window.supabaseClient || window.clientSupabase || globalThis.client;
}

function bdrOfflineReal(){
  return localStorage.getItem("BDR_MODO_OFFLINE") === "SIM" ||
         navigator.onLine === false ||
         (typeof estaOnline === "function" && !estaOnline());
}

async function bdrOnlineRealTriagem(opcoes = {}){
  try{
    if(window.BDROfflineSync?.estaOnlineReal){
      return await window.BDROfflineSync.estaOnlineReal(opcoes);
    }
    if(window.estaOnlineReal){
      return await window.estaOnlineReal(opcoes);
    }
  }catch(e){
    return false;
  }
  return !bdrOfflineReal();
}

async function bdrOfflineRealAsync(opcoes = {}){
  return !(await bdrOnlineRealTriagem({ forcar:true, ...opcoes }));
}

function bdrErroDeInternet(err){
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("failed to fetch") ||
         msg.includes("internet_disconnected") ||
         msg.includes("networkerror") ||
         msg.includes("err_internet") ||
         msg.includes("err_name_not_resolved");
}
function usuarioAtual(){ const u = localStorage.getItem("usuario_logado"); return u ? JSON.parse(u) : null; }

/* =========================================================
   CACHE LOCAL DA TRIAGEM
   Funciona como memória no navegador/celular.
========================================================= */
const BDR_TRIAGEM_CACHE_KEY = "bdr_triagem_cache_v1";

function salvarCacheTriagemLocal(){
  try{
    localStorage.setItem(BDR_TRIAGEM_CACHE_KEY, JSON.stringify({
      entradas,
      itens,
      obras,
      enderecos,
      salvo_em:new Date().toISOString()
    }));
  }catch(e){
    console.warn("Não foi possível salvar cache da triagem:", e);
  }
}

function carregarCacheTriagemLocal(){
  try{
    const raw = localStorage.getItem(BDR_TRIAGEM_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return null;
  }
}


/* =========================================================
   COMPATIBILIDADE OFFLINE
   Se offlineQueue.js não existir, usa IndexedDB/fila do offlineDB.
========================================================= */
if(typeof window.salvarOffline !== "function"){
  window.salvarOffline = async function(tipo, tabela, dados){
    if(window.BDROfflineDB?.adicionarPendente){
      return await window.BDROfflineDB.adicionarPendente({
        tabela: tabela || "triagem_materiais",
        acao: "custom",
        tipo,
        payload: dados || {},
        criado_em: new Date().toISOString()
      });
    }
    const key = "bdr_fila_offline_simples_v1";
    const fila = JSON.parse(localStorage.getItem(key) || "[]");
    const item = { id: Date.now() + "-" + Math.random().toString(16).slice(2), tipo, tabela, dados, criado_em:new Date().toISOString() };
    fila.push(item);
    localStorage.setItem(key, JSON.stringify(fila));
    return item;
  };
}

/* =========================================================
   STATUS VISUAL OFFLINE DA TRIAGEM
   Mostra no botão/card quando um item foi salvo na fila.
========================================================= */
const BDR_TRIAGEM_STATUS_KEY = "bdr_triagem_status_offline_v1";

function carregarStatusTriagemOffline(){
  try{
    return JSON.parse(localStorage.getItem(BDR_TRIAGEM_STATUS_KEY) || "{}");
  }catch(e){
    return {};
  }
}

function salvarStatusTriagemOffline(obj){
  try{
    localStorage.setItem(BDR_TRIAGEM_STATUS_KEY, JSON.stringify(obj || {}));
  }catch(e){}
}

function marcarItemTriagemPendente(itemId, info={}){
  const status = carregarStatusTriagemOffline();
  status[String(itemId)] = {
    status:"PENDENTE",
    texto:"⏳ Salvo offline • aguardando internet",
    data:new Date().toISOString(),
    ...info
  };
  salvarStatusTriagemOffline(status);
  aplicarStatusTriagemNaTela(itemId);
}

function limparItemTriagemPendente(itemId){
  const status = carregarStatusTriagemOffline();
  delete status[String(itemId)];
  salvarStatusTriagemOffline(status);
}

function aplicarStatusTriagemNaTela(itemId){
  const status = carregarStatusTriagemOffline();
  const info = status[String(itemId)];
  if(!info) return;

  const btn = document.querySelector(`button[data-confirmar-triagem="${itemId}"]`)
    || document.querySelector(`button[onclick="confirmarItem(${itemId})"]`);

  if(btn){
    btn.disabled = true;
    btn.innerHTML = info.texto || "⏳ Pendente";
    btn.style.background = "#f59e0b";
    btn.style.cursor = "not-allowed";
    btn.title = "Este item já foi salvo no aparelho e está aguardando sincronização.";
  }

  const itemBox = btn?.closest(".item");
  if(itemBox && !itemBox.querySelector(".bdr-sync-status-item")){
    const aviso = document.createElement("div");
    aviso.className = "bdr-sync-status-item";
    aviso.style.cssText = `
      margin-top:8px;
      padding:9px 10px;
      border-radius:10px;
      background:#fffbeb;
      border-left:4px solid #f59e0b;
      color:#92400e;
      font-size:12px;
      font-weight:900;
    `;
    aviso.innerHTML = "⏳ Este item foi salvo offline e está aguardando a internet voltar. Não precisa clicar novamente.";
    itemBox.appendChild(aviso);
  }
}

function aplicarTodosStatusTriagemOffline(){
  const status = carregarStatusTriagemOffline();
  Object.keys(status).forEach(id => aplicarStatusTriagemNaTela(id));
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(aplicarTodosStatusTriagemOffline, 700);
});

window.addEventListener("bdrOfflineSincronizado", (e) => {
  const item = e.detail;
  if(item?.tipo === "triagem_confirmar_item"){
    const itemId = item?.dados?.item?.id;
    if(itemId) limparItemTriagemPendente(itemId);
  }
});

function valor(id){ const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
function moeda(v){ return Number(v || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }

function dataBR(data){
  if(!data) return "-";
  const p=String(data).slice(0,10).split("-");
  return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : data;
}

function mesAnoBR(data){
  if(!data) return "Sem data";
  const meses=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const [ano,mes]=String(data).slice(0,10).split("-");
  return `${meses[Number(mes)-1]}/${ano}`;
}

function chaveMes(data){ return String(data || "").slice(0,7); }

function normalizar(txt){
  return String(txt || "").trim().toUpperCase();
}

async function carregarTriagemDoCacheRapido(){
  if(!window.BDROfflineDB?.lerTabela) return false;

  try{
    const [entradasCache, itensCache, obrasCache, enderecosCache] = await Promise.all([
      window.BDROfflineDB.lerTabela("entradas_materiais"),
      window.BDROfflineDB.lerTabela("entradas_materiais_itens"),
      window.BDROfflineDB.lerTabela("obras"),
      window.BDROfflineDB.lerTabela("enderecamento_estoque")
    ]);

    const temCache = (entradasCache && entradasCache.length) || (itensCache && itensCache.length);
    if(!temCache) return false;

    entradas = entradasCache || [];
    itens = itensCache || [];
    obras = obrasCache || [];
    enderecos = enderecosCache || [];

    salvarCacheTriagemLocal();
    carregarFiltroMes();
    renderizarTudo();

    console.log(`BDR cache rápido: triagem carregada do IndexedDB (${entradas.length} NF / ${itens.length} itens)`);
    return true;
  }catch(e){
    console.warn("BDR triagem: falha ao carregar cache rápido:", e?.message || e);
    return false;
  }
}

async function carregarTriagem(){
  const banco = db();
  const offline = window.BDROfflineSync;

  if(!banco && !offline && !window.BDROfflineDB){
    alert("Supabase/offline não foi carregado. Confira ./JS/supabaseClient.js, ./JS/offlineDB.js e ./JS/offlineSync.js");
    return;
  }

  const usarCacheLocalStorage = () => {
    const cache = carregarCacheTriagemLocal();
    if(cache){
      entradas = cache.entradas || [];
      itens = cache.itens || [];
      obras = cache.obras || [];
      enderecos = cache.enderecos || [];
      carregarFiltroMes();
      renderizarTudo();
      console.log("📦 Triagem carregada do cache local antigo.");
      return true;
    }
    return false;
  };

  const cacheOk = await carregarTriagemDoCacheRapido();

  let onlineReal = await bdrOnlineRealTriagem({forcar:true});

  if(!onlineReal){
    if(window.BDROfflineSync?.atualizarStatusTela){
      window.BDROfflineSync.atualizarStatusTela();
    }

    if(cacheOk){
      console.log("BDR triagem: offline real, mantendo dados do cache.");
      return;
    }

    if(!usarCacheLocalStorage()){
      alert("Sem internet e sem cache local da triagem. Abra esta tela uma vez com internet para salvar os dados no aparelho.");
    }
    return;
  }

  if(!banco){
    if(cacheOk) return;
    alert("Supabase não carregado e ainda não existe cache local da triagem.");
    return;
  }

  try{
    const carregarTabela = async (nomeTabela, buscarOnline, opcoes = {}) => {
      if(offline && typeof offline.carregarTabela === "function"){
        return await offline.carregarTabela(nomeTabela, buscarOnline, { timeout: opcoes.timeout || 1200 });
      }

      const resp = await buscarOnline();
      if(resp.error) throw resp.error;
      return resp.data || [];
    };

    const entradasOnline = await carregarTabela("entradas_materiais", async () => {
      return await banco
        .from("entradas_materiais")
        .select("*")
        .eq("status","ENVIADO_TRIAGEM")
        .order("id",{ascending:false});
    }, { timeout: 1200 });

    const itensOnline = await carregarTabela("entradas_materiais_itens", async () => {
      return await banco
        .from("entradas_materiais_itens")
        .select("*")
        .eq("status_triagem","PENDENTE")
        .order("id",{ascending:false});
    }, { timeout: 1200 });

    const obrasOnline = await carregarTabela("obras", async () => {
      return await banco
        .from("obras")
        .select("*")
        .eq("ativa",true)
        .order("nome");
    }, { timeout: 1200 });

    const enderecosOnline = await carregarTabela("enderecamento_estoque", async () => {
      return await banco
        .from("enderecamento_estoque")
        .select("*")
        .eq("status","LIVRE")
        .order("codigo_curto");
    }, { timeout: 1200 });

    entradas = entradasOnline || [];
    itens = itensOnline || [];
    obras = obrasOnline || [];
    enderecos = enderecosOnline || [];

    salvarCacheTriagemLocal();
    carregarFiltroMes();
    renderizarTudo();

    if(window.BDROfflineSync?.atualizarStatusTela){
      window.BDROfflineSync.atualizarStatusTela();
    }
  }catch(e){
    console.warn("Triagem: falhou online; mantendo cache quando existir.", e?.message || e);

    if(cacheOk){
      carregarFiltroMes();
      renderizarTudo();
      return;
    }

    if(!usarCacheLocalStorage()){
      alert("Erro ao carregar triagem. Abra uma vez com internet para salvar o cache offline.");
    }
  }
}

async function recarregarEnderecosLivres(){
  /* =========================================================
     BDR OFFLINE ROBUSTO
     Se a internet caiu, não tenta buscar endereços no Supabase.
     Se o navegador ainda achar que está online mas o fetch falhar,
     também não trava o fluxo.
  ========================================================= */
  if(await bdrOfflineRealAsync()){
    console.log("📴 Triagem offline: usando endereços já carregados na tela.");
    return;
  }

  try{
    const { data, error } = await db()
      .from("enderecamento_estoque")
      .select("*")
      .eq("status","LIVRE")
      .order("codigo_curto");

    if(error){
      console.warn("Triagem: erro ao recarregar endereços:", error.message);
      return;
    }

    enderecos = data || [];
  }catch(e){
    if(bdrErroDeInternet(e)){
      console.log("📴 Triagem sem rede: mantendo endereços já carregados.");
      return;
    }

    throw e;
  }
}

function carregarFiltroMes(){
  const select = document.getElementById("filtroMes");
  if(!select) return;
  const atual = select.value;
  const meses = [...new Set(entradas.map(e => chaveMes(e.data_recebimento)).filter(Boolean))].sort().reverse();

  select.innerHTML = `<option value="">Todos os meses</option>`;

  meses.forEach(m => {
    const e = entradas.find(x => chaveMes(x.data_recebimento) === m);
    select.innerHTML += `<option value="${m}">${mesAnoBR(e.data_recebimento)}</option>`;
  });

  select.value = atual;
}

function mudarVisao(visao){
  visaoAtual = visao;
  document.getElementById("abaCalendario").classList.toggle("ativa", visao === "CALENDARIO");
  document.getElementById("abaNFs").classList.toggle("ativa", visao === "NFS");
  renderizarTudo();
}

function entradasFiltradas(){
  const busca = valor("busca").toLowerCase();
  const filtroMes = valor("filtroMes");

  return entradas.filter(e => {
    const itensEntrada = itens.filter(i => String(i.entrada_id) === String(e.id));
    if(itensEntrada.length === 0) return false;

    const textoItens = itensEntrada.map(i => i.descricao_xml || "").join(" ");
    const texto = `${e.id} ${e.numero_nf||""} ${e.fornecedor||""} ${e.responsavel||""} ${textoItens}`.toLowerCase();

    return texto.includes(busca) && (!filtroMes || chaveMes(e.data_recebimento) === filtroMes);
  });
}

function renderizarTudo(){
  atualizarResumo();

  if(visaoAtual === "CALENDARIO"){
    renderizarCalendario();
  }else{
    renderizarNFs(entradasFiltradas());
  }

  setTimeout(aplicarTodosStatusTriagemOffline, 80);
}

function atualizarResumo(){
  const ents = entradasFiltradas();
  const ids = ents.map(e => String(e.id));
  const itensPendentes = itens.filter(i => ids.includes(String(i.entrada_id)));
  const valorTotal = itensPendentes.reduce((s,i) => s + Number(i.valor_total || 0), 0);
  const sugestoes = itensPendentes.filter(i => ["PATRIMONIO","ANALISAR_PATRIMONIO"].includes(sugerirDestino(i))).length;

  const resumoNFs = document.getElementById("resumoNFs");
  const resumoItens = document.getElementById("resumoItens");
  const resumoValor = document.getElementById("resumoValor");
  const resumoPatrimonio = document.getElementById("resumoPatrimonio");

  if(resumoNFs) resumoNFs.innerText = ents.length;
  if(resumoItens) resumoItens.innerText = itensPendentes.length;
  if(resumoValor) resumoValor.innerText = moeda(valorTotal);
  if(resumoPatrimonio) resumoPatrimonio.innerText = sugestoes;
}

function renderizarCalendario(){
  const lista = document.getElementById("listaTriagem");
  lista.innerHTML = "";
  const ents = entradasFiltradas();

  if(ents.length === 0){
    lista.innerHTML = `<div class="card">Nenhuma entrada aguardando triagem.</div>`;
    return;
  }

  const gruposMes = {};

  ents.forEach(e => {
    const mes = mesAnoBR(e.data_recebimento);
    const dia = dataBR(e.data_recebimento);

    if(!gruposMes[mes]) gruposMes[mes] = {};
    if(!gruposMes[mes][dia]) gruposMes[mes][dia] = [];

    gruposMes[mes][dia].push(e);
  });

  Object.keys(gruposMes).forEach(mes => {
    let htmlDias = "";

    Object.keys(gruposMes[mes]).forEach(dia => {
      const entradasDia = gruposMes[mes][dia];
      const ids = entradasDia.map(e => String(e.id));
      const qtdItens = itens.filter(i => ids.includes(String(i.entrada_id))).length;

      htmlDias += `
        <div class="dia-linha" onclick="abrirDia('${dia}')">
          <strong>${dia}</strong>
          <span>${entradasDia.length} NF(s) • ${qtdItens} item(ns) pendente(s)</span>
          <span class="badge badge-info">Abrir</span>
        </div>

        <div id="dia-${dia.replaceAll('/','-')}" style="display:${diasAbertos.has(dia) ? "block" : "none"};margin-bottom:12px;">
          ${montarNFsHTML(entradasDia)}
        </div>
      `;
    });

    lista.innerHTML += `<div class="mes-card"><h3>${mes}</h3>${htmlDias}</div>`;
  });
}

function abrirDia(dia){
  const div = document.getElementById("dia-" + dia.replaceAll("/","-"));
  if(div){
    const aberto = div.style.display === "block";
    div.style.display = aberto ? "none" : "block";
    if(aberto) diasAbertos.delete(dia);
    else diasAbertos.add(dia);
  }
}

function renderizarNFs(ents){
  const lista = document.getElementById("listaTriagem");
  lista.innerHTML = ents.length ? montarNFsHTML(ents) : `<div class="card">Nenhuma NF aguardando triagem.</div>`;
}

function montarNFsHTML(ents){
  let html = "";

  ents.forEach(e => {
    const itensEntrada = itens.filter(i => String(i.entrada_id) === String(e.id));
    const valorTotal = itensEntrada.reduce((s,i) => s + Number(i.valor_total || 0), 0);

    html += `
      <div class="nf-card ${nfsAbertas.has(String(e.id)) ? "aberta" : ""}">
        <div class="nf-header" onclick="abrirNF(${e.id})">
          <strong>NF ${e.numero_nf || e.id}</strong>
          <span>${e.fornecedor || "-"}</span>
          <span>${dataBR(e.data_recebimento)}</span>
          <span class="badge badge-pendente">${itensEntrada.length} item(ns)</span>
        </div>

        <div style="font-size:12px;color:#6b7280;margin-top:6px;">
          Responsável: ${e.responsavel || "-"} • Total pendente: ${moeda(valorTotal)}
        </div>

        <div class="nf-itens" id="nf-${e.id}" style="display:${nfsAbertas.has(String(e.id)) ? "block" : "none"};">
          ${montarItensHTML(itensEntrada)}
        </div>
      </div>
    `;
  });

  return html;
}

function abrirNF(id){
  const div = document.getElementById("nf-" + id);
  const card = div?.closest(".nf-card");

  if(div){
    const aberto = div.style.display === "block";
    div.style.display = aberto ? "none" : "block";

    if(card){
      card.classList.toggle("aberta", !aberto);
    }

    if(aberto) nfsAbertas.delete(String(id));
    else nfsAbertas.add(String(id));
  }
}

/* =========================================================
   TRIAGEM INTELIGENTE BDR 2.0
   Motor local profissional: regras + pontuação + aprendizado.
   Não depende de API paga.

   COMO MEXER DEPOIS:
   - VALOR_PATRIMONIO_FORTE: valor que já pesa muito para patrimônio.
   - PALAVRAS_CHAVE_DURAVEIS: itens que normalmente viram patrimônio.
   - PALAVRAS_CHAVE_CONSUMO: materiais comuns de estoque/consumo.
   - PESOS_TRIAGEM: aumenta/diminui a força de cada indício.
========================================================= */

const VALOR_PATRIMONIO_FORTE = 1200;
const VALOR_PATRIMONIO_ANALISE = 700;

const PESOS_TRIAGEM = {
  APRENDIDO: 100,
  VALOR_FORTE: 34,
  VALOR_ANALISE: 16,
  DURAVEL: 32,
  SERIE: 36,
  QUANTIDADE_BAIXA: 10,
  CATEGORIA_FORTE: 18,
  CONSUMO: -42,
  QUANTIDADE_ALTA: -18,
  DESCRICAO_FRACA: -8
};

const PALAVRAS_IGNORADAS_TRIAGEM = [
  "DE","DA","DO","DAS","DOS","PARA","COM","SEM","EM","NO","NA","NOS","NAS",
  "UN","UND","PC","PÇ","PCA","PECA","PEÇA","KIT","JOGO","CJ","CONJUNTO",
  "MATERIAL","PRODUTO","EQUIPAMENTO","APARELHO","MAQUINA","MÁQUINA","DIVERSOS",
  "REF","REFERENCIA","COD","CODIGO","MODELO","MARCA","TIPO","USO","GERAL"
];

const PALAVRAS_CHAVE_DURAVEIS = [
  // Ferramentas e máquinas
  "ROMPEDOR","MARTELETE","FURADEIRA","PARAFUSADEIRA","ESMERILHADEIRA","LIXADEIRA",
  "SERRA","SERRATICO","SERRACIRCULAR","INVERSORA","SOLDA","MAQUINA SOLDA","COMPRESSOR",
  "GERADOR","MOTOR","BOMBA","MOTOBOMBA","BETONEIRA","COMPACTADOR","VIBRADOR",
  "MOTOSSERRA","ROCADEIRA","ROÇADEIRA","CORTADORA","POLICORTE","LAVADORA","JATEADORA",
  "TALHA","GUINCHO","MACACO","MOTOESMERIL","FURADEIRADEBANCADA","FURADEIRA BANCADA",

  // Informática e eletrônicos
  "NOTEBOOK","COMPUTADOR","DESKTOP","CPU","MONITOR","IMPRESSORA","SCANNER",
  "SMARTPHONE","CELULAR","TABLET","ROTEADOR","SWITCH","NOBREAK","ESTABILIZADOR",
  "CAMERA","CÂMERA","DVR","NVR","PROJETOR","TV","TELEVISOR","TELA",

  // Eletros e apoio
  "GELADEIRA","FREEZER","BEBEDOURO","AR CONDICIONADO","CONDICIONADOR","MICROONDAS",
  "MICRO-ONDAS","FOGAO","FOGÃO","BALANCA","BALANÇA","CADEIRA","MESA","ARMARIO","ARMÁRIO",

  // Veículos e agro
  "VEICULO","VEÍCULO","MOTOCICLETA","CARRETA","REBOQUE","TRATOR","PULVERIZADOR",
  "PLANTADEIRA","COLHEITADEIRA"
];

const PALAVRAS_CHAVE_CONSUMO = [
  // EPI e consumo comum
  "LUVA","UNIFORME","CAMISETA","CALCA","CALÇA","BOTA","CAPACETE","OCULOS","ÓCULOS",
  "PROTETOR","MASCARA","MÁSCARA","EPI","COLETE",

  // Insumos e fixadores
  "DISCO","PARAFUSO","PORCA","ARRUELA","CABO","FIO","TINTA","CIMENTO","AREIA","BRITA",
  "COLA","FITA","PAPEL","CANETA","TONER","CARTUCHO","BROCA","BUCHA","PREGO","REBITE",
  "ABRACADEIRA","ABRAÇADEIRA","LIXA","OLEO","ÓLEO","GRAXA","REFIL","SACO","SACOLA",
  "MASSA","ARGAMASSA","REJUNTE","SOLVENTE","TUBO","CANO","CONEXAO","CONEXÃO",
  "LAMPADA","LÂMPADA","DISJUNTOR","TOMADA","PLUG","PILHA","BATERIA 9V",

  // Escritório / limpeza
  "DETERGENTE","DESINFETANTE","SABAO","SABÃO","PANO","VASSOURA","RODO","BALDE",
  "CLIPS","GRAMPO","PASTA","ENVELOPE"
];

const PALAVRAS_CHAVE_AVARIADO = [
  "QUEBRADO","DANIFICADO","AMASSADO","TRINCADO","FALTANDO","INCOMPLETO",
  "DEFEITO","DEFEITUOSO","AVARIA","AVARIADO","VAZANDO"
];

const CATEGORIAS_PATRIMONIO_FORTE = [
  "FERRAMENTA","MAQUINA","MÁQUINA","INFORMATICA","INFORMÁTICA","ELETRONICO","ELETRÔNICO",
  "ELETRODOMESTICO","ELETRODOMÉSTICO","VEICULO","VEÍCULO","MOBILIARIO","MOBILIÁRIO"
];

function limparDescricaoTriagem(txt){
  return String(txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function palavrasDescricaoTriagem(txt){
  return limparDescricaoTriagem(txt)
    .split(" ")
    .map(p => p.trim())
    .filter(p => p.length >= 3)
    .filter(p => !PALAVRAS_IGNORADAS_TRIAGEM.includes(p));
}

function textoItemTriagem(item){
  return limparDescricaoTriagem(`
    ${item.descricao_xml || ""}
    ${item.descricao || ""}
    ${item.categoria || ""}
    ${item.ncm || ""}
    ${item.codigo || ""}
    ${item.observacao || ""}
    ${item.estado_material || ""}
  `);
}

function contemExpressao(texto, lista){
  const t = limparDescricaoTriagem(texto);
  return lista.some(p => {
    const chave = limparDescricaoTriagem(p);
    return chave && (t.includes(chave) || t.split(" ").includes(chave));
  });
}

function palavraChaveTriagem(item){
  const desc = item.descricao_xml || item.descricao || "";
  const texto = textoItemTriagem(item);
  const palavras = palavrasDescricaoTriagem(desc);

  const duravel = PALAVRAS_CHAVE_DURAVEIS.find(p => texto.includes(limparDescricaoTriagem(p)));
  if(duravel) return limparDescricaoTriagem(duravel);

  const consumo = PALAVRAS_CHAVE_CONSUMO.find(p => texto.includes(limparDescricaoTriagem(p)));
  if(consumo) return limparDescricaoTriagem(consumo);

  return palavras[0] || texto.slice(0, 40);
}

function itemTemNumeroSerie(item){
  const texto = textoItemTriagem(item);
  return Boolean(
    item.numero_serie ||
    item.serie ||
    item.serial ||
    item.chassi ||
    item.imei ||
    item.patrimonio_fornecedor ||
    texto.includes("NUMERO SERIE") ||
    texto.includes("N SERIE") ||
    texto.includes("SERIAL") ||
    texto.includes("CHASSI") ||
    texto.includes("IMEI")
  );
}

function descricaoConsumo(desc){ return contemExpressao(desc, PALAVRAS_CHAVE_CONSUMO); }
function descricaoDuravel(desc){ return contemExpressao(desc, PALAVRAS_CHAVE_DURAVEIS); }
function descricaoAvariado(desc){ return contemExpressao(desc, PALAVRAS_CHAVE_AVARIADO); }
function categoriaForte(item){ return contemExpressao(item.categoria || item.tipo_item || item.descricao_xml || "", CATEGORIAS_PATRIMONIO_FORTE); }

function valorUnitarioEstimado(item){
  const valorUnit = Number(item.valor_unitario || 0);
  const valorTotal = Number(item.valor_total || 0);
  const quantidade = Number(item.quantidade || 0);
  return valorUnit || (quantidade ? valorTotal / quantidade : valorTotal);
}

async function buscarAprendizadoTriagem(item){
  /* OFFLINE: não consulta aprendizado no Supabase */
  if(await bdrOfflineRealAsync({forcar:true})){
    return null;
  }

  const banco = db();
  if(!banco) return null;

  const descricao = textoItemTriagem(item);
  const chave = palavraChaveTriagem(item);

  if(!descricao && !chave) return null;

  try{
    const { data, error } = await banco
      .from("triagem_aprendizado")
      .select("*")
      .order("vezes_usado", { ascending:false });

    if(error){
      console.warn("Erro ao buscar aprendizado:", error.message);
      return null;
    }

    return (data || []).find(a => {
      const base = limparDescricaoTriagem(a.descricao_base || "");
      const palavra = limparDescricaoTriagem(a.palavra_chave || "");

      return (
        (palavra && (descricao.includes(palavra) || chave === palavra)) ||
        (base && base.length >= 6 && (descricao.includes(base) || base.includes(descricao)))
      );
    }) || null;
  }catch(e){
    if(bdrErroDeInternet(e)){
      console.log("📴 Triagem offline: aprendizado ignorado até a internet voltar.");
      return null;
    }
    console.warn("Erro ao buscar aprendizado:", e?.message || e);
    return null;
  }
}

async function salvarAprendizadoTriagem(item, destino){
  /* OFFLINE: não salva aprendizado agora. A ação principal vai para a fila. */
  if(await bdrOfflineRealAsync({forcar:true})){
    return;
  }

  const banco = db();
  if(!banco) return;

  const descricaoBase = textoItemTriagem(item);
  const palavra = palavraChaveTriagem(item);

  if(!descricaoBase && !palavra) return;

  try{
    const aprendido = await buscarAprendizadoTriagem(item);

    if(aprendido){
      await banco
        .from("triagem_aprendizado")
        .update({
          tipo_destino: destino,
          categoria: destino,
          palavra_chave: palavra || aprendido.palavra_chave,
          vezes_usado: Number(aprendido.vezes_usado || 1) + 1,
          confianca: Math.min(99, Number(aprendido.confianca || 80) + 1),
          ultima_decisao: new Date().toISOString()
        })
        .eq("id", aprendido.id);
      return;
    }

    await banco
      .from("triagem_aprendizado")
      .insert([{
        descricao_base: descricaoBase,
        palavra_chave: palavra,
        tipo_destino: destino,
        categoria: destino,
        confianca: 90,
        origem: "USUARIO",
        vezes_usado: 1,
        ultima_decisao: new Date().toISOString()
      }]);
  }catch(e){
    if(bdrErroDeInternet(e)){
      console.log("📴 Triagem offline: aprendizado será ignorado nesta confirmação.");
      return;
    }
    console.warn("Erro ao salvar aprendizado:", e?.message || e);
  }
}

function pontuarItemTriagem(item){
  const texto = textoItemTriagem(item);
  const valorBase = valorUnitarioEstimado(item);
  const quantidade = Number(item.quantidade || 0);

  const valorForte = valorBase >= VALOR_PATRIMONIO_FORTE;
  const valorAnalise = valorBase >= VALOR_PATRIMONIO_ANALISE;
  const duravel = descricaoDuravel(texto);
  const consumo = descricaoConsumo(texto);
  const avariado = descricaoAvariado(texto) || limparDescricaoTriagem(item.estado_material).includes("AVARIADO");
  const temSerie = itemTemNumeroSerie(item);
  const quantidadeBaixa = quantidade > 0 && quantidade <= 2;
  const quantidadeAlta = quantidade >= 10;
  const catForte = categoriaForte(item);

  let score = 0;
  const motivos = [];

  if(valorForte){ score += PESOS_TRIAGEM.VALOR_FORTE; motivos.push(`valor unitário alto (${moeda(valorBase)})`); }
  else if(valorAnalise){ score += PESOS_TRIAGEM.VALOR_ANALISE; motivos.push(`valor unitário relevante (${moeda(valorBase)})`); }

  if(duravel){ score += PESOS_TRIAGEM.DURAVEL; motivos.push("descrição indica bem durável"); }
  if(temSerie){ score += PESOS_TRIAGEM.SERIE; motivos.push("possui indício de número de série/chassi/IMEI"); }
  if(quantidadeBaixa){ score += PESOS_TRIAGEM.QUANTIDADE_BAIXA; motivos.push("baixa quantidade, típico de bem individual"); }
  if(catForte){ score += PESOS_TRIAGEM.CATEGORIA_FORTE; motivos.push("categoria forte para patrimônio"); }
  if(consumo){ score += PESOS_TRIAGEM.CONSUMO; motivos.push("descrição indica material de consumo"); }
  if(quantidadeAlta){ score += PESOS_TRIAGEM.QUANTIDADE_ALTA; motivos.push("quantidade alta, típico de consumo/estoque"); }
  if(!texto || texto.length < 5){ score += PESOS_TRIAGEM.DESCRICAO_FRACA; motivos.push("descrição fraca/incompleta"); }
  if(avariado){ motivos.push("indício de avaria/defeito"); }

  return {
    score,
    motivos,
    valorBase,
    valorForte,
    valorAnalise,
    duravel,
    consumo,
    avariado,
    temSerie,
    quantidadeBaixa,
    quantidadeAlta,
    catForte
  };
}

async function analisarItemTriagem(item){
  const aprendido = await buscarAprendizadoTriagem(item);

  if(aprendido){
    return {
      destino: aprendido.tipo_destino,
      titulo: `Baseado no histórico do sistema`,
      confianca: Math.min(99, Number(aprendido.confianca || 98)),
      score: PESOS_TRIAGEM.APRENDIDO,
      motivos: [
        `aprendido pela palavra-chave: ${aprendido.palavra_chave || aprendido.descricao_base}`,
        `usado ${aprendido.vezes_usado || 1} vez(es)`
      ],
      aprendido:true,
      nivel:"APRENDIDO"
    };
  }

  const p = pontuarItemTriagem(item);

  let destino = "ESTOQUE";
  let titulo = "Enviar para estoque comum";
  let confianca = 65;
  let nivel = "BAIXO";

  if(p.avariado){
    destino = "AVARIADO";
    titulo = "Separar como avariado/quarentena";
    confianca = 90;
    nivel = "AVARIADO";
  }else if(p.score >= 70){
    destino = "PATRIMONIO";
    titulo = "Cadastrar como patrimônio + estoque";
    confianca = Math.min(96, 70 + Math.round(p.score / 4));
    nivel = "FORTE";
  }else if(p.score >= 38){
    destino = "ANALISAR_PATRIMONIO";
    titulo = "Analisar como possível patrimônio";
    confianca = Math.min(88, 58 + Math.round(p.score / 5));
    nivel = "MEDIO";
  }else{
    destino = "ESTOQUE";
    titulo = "Enviar para estoque comum";
    confianca = p.consumo ? 90 : 70;
    nivel = p.consumo ? "CONSUMO" : "BAIXO";
  }

  return {
    destino,
    titulo,
    confianca,
    score:p.score,
    motivos:p.motivos.length ? p.motivos : ["sem indícios suficientes para patrimônio"],
    valorBase:p.valorBase,
    valorAlto:p.valorForte,
    duravel:p.duravel,
    consumo:p.consumo,
    avariado:p.avariado,
    temSerie:p.temSerie,
    aprendido:false,
    nivel
  };
}

async function sugerirDestinoAsync(item){
  const analise = await analisarItemTriagem(item);
  return analise.destino;
}

/* Compatibilidade com funções antigas: usa regra rápida por pontuação */
function sugerirDestino(item){
  const p = pontuarItemTriagem(item);
  if(p.avariado) return "AVARIADO";
  if(p.score >= 70) return "PATRIMONIO";
  if(p.score >= 38) return "ANALISAR_PATRIMONIO";
  return "ESTOQUE";
}

function tipoAreaPorDestino(destino, item){
  if(destino === "PATRIMONIO") return "PATRIMONIO";
  if(destino === "AVARIADO") return "QUARENTENA";

  const desc = String(item.descricao_xml || "").toLowerCase();

  if(desc.includes("luva") || desc.includes("capacete") || desc.includes("bota") || desc.includes("epi")) return "EPI";
  if(desc.includes("fio") || desc.includes("cabo") || desc.includes("disjuntor")) return "ELETRICA";
  if(desc.includes("cano") || desc.includes("tubo") || desc.includes("conex")) return "HIDRAULICA";
  if(desc.includes("furadeira") || desc.includes("parafusadeira") || desc.includes("serra")) return "FERRAMENTAS";

  return "GERAL";
}

/*
  Regra corrigida:
  1. Tenta área específica: PATRIMONIO/EPI/GERAL etc.
  2. Se não achar, usa GERAL.
  3. Se não achar, usa QUALQUER endereço LIVRE.
*/
function sugerirEndereco(destino, item){
  const tipo = normalizar(tipoAreaPorDestino(destino, item));

  let encontrado = enderecos.find(e =>
    normalizar(e.tipo_area) === tipo &&
    normalizar(e.status) === "LIVRE"
  );

  if(!encontrado && tipo !== "GERAL"){
    encontrado = enderecos.find(e =>
      normalizar(e.tipo_area) === "GERAL" &&
      normalizar(e.status) === "LIVRE"
    );
  }

  if(!encontrado){
    encontrado = enderecos.find(e =>
      normalizar(e.status) === "LIVRE"
    );
  }

  return encontrado || null;
}

function montarOptionsObras(){
  let html = '<option value="">Selecione a obra</option>';

  obras.forEach(o => {
    html += `<option value="${o.id}">${o.codigo_obra || "-"} - ${o.nome || "-"}</option>`;
  });

  return html;
}


function obraPorId(obraId){
  return obras.find(o => String(o.id) === String(obraId)) || null;
}

function atualizarEmpresaObraItem(itemId){
  const obraId = valor("obraDestino-" + itemId);
  const obra = obraPorId(obraId);
  const box = document.getElementById("empresaTexto-" + itemId);
  if(box){
    box.innerText = obra
      ? `Empresa automática: ${obra.empresa_id || "-"} • Obra/Setor: ${obra.codigo_obra || "-"} - ${obra.nome || "-"}`
      : "Selecione a obra/setor para identificar empresa automaticamente.";
  }
}

function atualizarModoPatrimonioItem(itemId){
  const modo = valor("patrimonioModo-" + itemId);
  const input = document.getElementById("codigoPatExistente-" + itemId);
  if(input){
    input.style.display = modo === "EXISTENTE" ? "block" : "none";
  }
}


/* =========================================================
   MODAL/CARD DE PATRIMÔNIO PELA TRIAGEM
   Corrige erro: abrirModalPatrimonioTriagem is not defined
   Fluxo:
   - Patrimônio existente: informa PAT e segue para estoque.
   - Patrimônio novo: preenche cadastro rápido e gera próximo PAT da obra.
========================================================= */
function moedaTriagemParaNumero(valorTexto){
  if(!valorTexto) return null;
  const limpo = String(valorTexto)
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  return Number(limpo) || null;
}
window.moedaTriagemParaNumero = moedaTriagemParaNumero;

function mascaraMoedaTriagem(input){
  let v = String(input.value || "").replace(/\D/g, "");
  if(!v){ input.value = ""; return; }
  v = (Number(v) / 100).toFixed(2);
  input.value = Number(v).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
}
window.mascaraMoedaTriagem = mascaraMoedaTriagem;

function tipoSugeridoPatrimonioTriagem(item){
  const desc = limparDescricaoTriagem(item?.descricao_xml || item?.descricao || "");
  if(desc.includes("NOTEBOOK") || desc.includes("COMPUTADOR") || desc.includes("IMPRESSORA") || desc.includes("MONITOR")) return "INFORMATICA";
  if(desc.includes("FURADEIRA") || desc.includes("ESMERILHADEIRA") || desc.includes("SERRA") || desc.includes("PARAFUSADEIRA")) return "FERRAMENTA";
  if(desc.includes("TV") || desc.includes("TELEVISOR") || desc.includes("CAMERA") || desc.includes("CÂMERA")) return "ELETRONICO";
  if(desc.includes("TENDA") || desc.includes("MESA") || desc.includes("CADEIRA") || desc.includes("ARMARIO") || desc.includes("ARMÁRIO")) return "MOBILIARIO";
  if(desc.includes("MAQUINA") || desc.includes("MÁQUINA") || desc.includes("MOTOR") || desc.includes("BOMBA")) return "MAQUINA";
  return "EQUIPAMENTO";
}

function obraModalPatrimonioTriagem(){
  const obraId = valor("modalPatObra");
  return obraPorId(obraId);
}

function atualizarEmpresaModalPatrimonio(){
  const obra = obraModalPatrimonioTriagem();
  const el = document.getElementById("modalPatEmpresaTexto");
  if(!el) return;
  el.innerText = obra
    ? `Empresa ID: ${obra.empresa_id || "-"} • ${obra.codigo_obra || "-"} - ${obra.nome || "-"}`
    : "Selecione a obra.";
}
window.atualizarEmpresaModalPatrimonio = atualizarEmpresaModalPatrimonio;

function recalcularEnderecoModalPatrimonio(){
  const item = itens.find(i => Number(i.id) === Number(itemPatrimonioModalId));
  const endereco = item ? sugerirEndereco("PATRIMONIO", item) : null;
  const texto = document.getElementById("modalPatEnderecoTexto");
  const input = document.getElementById("modalPatEnderecoId");
  if(texto) texto.innerText = endereco ? endereco.codigo_curto : "SEM ENDEREÇO LIVRE";
  if(input) input.value = endereco ? endereco.id : "";
}
window.recalcularEnderecoModalPatrimonio = recalcularEnderecoModalPatrimonio;

function atualizarModalPatrimonioTriagem(){
  const modo = document.querySelector('input[name="patTriagemModo"]:checked')?.value || "NOVO";
  const boxExistente = document.getElementById("boxPatExistenteModal");
  const camposNovo = ["modalPatNome","modalPatTipo","modalPatMarca","modalPatModelo","modalPatSerie","modalPatValor","modalPatEstado"];
  if(boxExistente) boxExistente.style.display = modo === "EXISTENTE" ? "block" : "none";
  camposNovo.forEach(id => {
    const el = document.getElementById(id);
    const wrap = el?.closest("div");
    if(wrap) wrap.style.display = modo === "EXISTENTE" ? "none" : "block";
  });
}
window.atualizarModalPatrimonioTriagem = atualizarModalPatrimonioTriagem;

function abrirModalPatrimonioTriagem(itemId){
  const item = itens.find(i => Number(i.id) === Number(itemId));
  if(!item){ alert("Item não encontrado."); return; }

  itemPatrimonioModalId = itemId;

  const info = document.getElementById("patTriagemInfoItem");
  if(info){
    info.innerHTML = `
      <b>Produto:</b> ${item.descricao_xml || item.descricao || "Item sem descrição"}<br>
      <b>Quantidade:</b> ${item.quantidade || 0} • <b>Valor unitário:</b> ${moeda(item.valor_unitario)} • <b>Total:</b> ${moeda(item.valor_total)}<br>
      <b>Regra:</b> patrimônio precisa de obra/setor para gerar código e rastreabilidade.
    `;
  }

  const obraSelect = document.getElementById("modalPatObra");
  if(obraSelect){
    obraSelect.innerHTML = montarOptionsObras();
    const obraInline = valor("obraDestino-" + itemId);
    if(obraInline) obraSelect.value = obraInline;
  }

  document.querySelector('input[name="patTriagemModo"][value="NOVO"]')?.click();
  const nome = document.getElementById("modalPatNome");
  const tipo = document.getElementById("modalPatTipo");
  const valorEl = document.getElementById("modalPatValor");
  const estado = document.getElementById("modalPatEstado");
  const obs = document.getElementById("modalPatObs");
  const codigoExistente = document.getElementById("modalPatCodigoExistente");

  if(nome) nome.value = item.descricao_xml || item.descricao || "";
  if(tipo) tipo.value = tipoSugeridoPatrimonioTriagem(item);
  if(valorEl) valorEl.value = Number(item.valor_unitario || item.valor_total || 0).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
  if(estado) estado.value = item.estado_material === "AVARIADO" ? "REGULAR" : (item.estado_material || "NOVO");
  if(obs) obs.value = valor("obs-" + itemId) || "Cadastro/vínculo realizado pela triagem.";
  if(codigoExistente) codigoExistente.value = valor("codigoPatExistente-" + itemId) || "";

  atualizarEmpresaModalPatrimonio();
  recalcularEnderecoModalPatrimonio();
  atualizarModalPatrimonioTriagem();

  document.getElementById("modalPatrimonioTriagemBg")?.classList.add("ativo");
}
window.abrirModalPatrimonioTriagem = abrirModalPatrimonioTriagem;

function fecharModalPatrimonioTriagem(){
  document.getElementById("modalPatrimonioTriagemBg")?.classList.remove("ativo");
  itemPatrimonioModalId = null;
  patrimonioModalConfirmando = false;
}
window.fecharModalPatrimonioTriagem = fecharModalPatrimonioTriagem;

async function confirmarModalPatrimonioTriagem(){
  const itemId = itemPatrimonioModalId;
  const item = itens.find(i => Number(i.id) === Number(itemId));
  if(!item){ alert("Item não encontrado."); return; }

  const modo = document.querySelector('input[name="patTriagemModo"]:checked')?.value || "NOVO";
  const obraId = valor("modalPatObra");
  const enderecoId = valor("modalPatEnderecoId");
  const obs = valor("modalPatObs");

  if(!obraId){ alert("Selecione a obra/setor para vincular o patrimônio."); return; }
  if(!enderecoId){ alert("Nenhum endereço livre encontrado para enviar o patrimônio ao estoque."); return; }

  const destinoEl = document.getElementById("destino-" + itemId);
  const obraInline = document.getElementById("obraDestino-" + itemId);
  const modoInline = document.getElementById("patrimonioModo-" + itemId);
  const codigoInline = document.getElementById("codigoPatExistente-" + itemId);
  const enderecoInline = document.getElementById("enderecoId-" + itemId);
  const enderecoTexto = document.getElementById("enderecoTexto-" + itemId);
  const obsInline = document.getElementById("obs-" + itemId);

  if(destinoEl) destinoEl.value = "PATRIMONIO";
  if(obraInline) obraInline.value = obraId;
  if(modoInline) modoInline.value = modo;
  if(enderecoInline) enderecoInline.value = enderecoId;
  if(obsInline) obsInline.value = obs || obsInline.value || "Cadastro/vínculo realizado pela triagem.";

  const endereco = enderecos.find(e => String(e.id) === String(enderecoId));
  if(enderecoTexto) enderecoTexto.innerText = endereco ? endereco.codigo_curto : "AUTO";

  if(modo === "EXISTENTE"){
    const codigo = valor("modalPatCodigoExistente");
    if(!codigo){ alert("Informe o código PAT existente."); return; }
    if(codigoInline) codigoInline.value = codigo;
  }else{
    extrasPatrimonioTriagem[itemId] = {
      nome_bem: valor("modalPatNome") || item.descricao_xml || item.descricao || "Item triado como patrimônio",
      tipo_item: valor("modalPatTipo") || "EQUIPAMENTO",
      marca: valor("modalPatMarca") || null,
      modelo: valor("modalPatModelo") || null,
      numero_serie: valor("modalPatSerie") || null,
      valor_bem: moedaTriagemParaNumero(valor("modalPatValor")) || Number(item.valor_unitario || item.valor_total || 0),
      estado_conservacao: valor("modalPatEstado") || "NOVO",
      observacao: obs || "Cadastro rápido pela triagem"
    };
  }

  try{
    patrimonioModalConfirmando = true;
    document.getElementById("modalPatrimonioTriagemBg")?.classList.remove("ativo");
    await confirmarItem(itemId);
  }finally{
    patrimonioModalConfirmando = false;
    itemPatrimonioModalId = null;
  }
}
window.confirmarModalPatrimonioTriagem = confirmarModalPatrimonioTriagem;

async function buscarPatrimonioExistente(codigo){
  if(!codigo) return null;

  if(await bdrOfflineRealAsync()){
    console.log("📴 Offline: não foi possível validar patrimônio existente agora.");
    return null;
  }

  try{
    const { data, error } = await db()
      .from("patrimonio")
      .select("*")
      .eq("codigo_qr", codigo)
      .maybeSingle();

    if(error) throw error;
    return data || null;
  }catch(e){
    if(bdrErroDeInternet(e)) return null;
    throw e;
  }
}

async function gerarCodigoPatrimonioTriagem(obra){
  const prefixoCodigo = "PAT-" + (obra.codigo_obra || "");

  const { data, error } = await db()
    .from("patrimonio")
    .select("codigo_qr")
    .like("codigo_qr", prefixoCodigo + "%")
    .order("codigo_qr", { ascending:false })
    .limit(1);

  if(error) throw error;

  let sequencial = 1;
  if(data && data.length && data[0].codigo_qr){
    const ultimoCodigo = String(data[0].codigo_qr || "");
    const numeroFinal = ultimoCodigo.replace(prefixoCodigo, "");
    sequencial = (Number(numeroFinal) || 0) + 1;
  }

  return {
    sequencial,
    codigo_qr: prefixoCodigo + String(sequencial).padStart(4, "0")
  };
}


async function gravarMovimentacaoPatrimonioTriagem(patrimonio, tipo, statusAnterior, statusNovo, observacao){
  try{
    if(!patrimonio || !patrimonio.id) return;

    const usuario = usuarioAtual();
    const agoraLocal = new Date(Date.now() - 4 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);

    const payloadMov = {
      patrimonio_id: patrimonio.id,
      empresa_id: patrimonio.empresa_id || null,
      obra_origem_id: patrimonio.obra_id || null,
      obra_destino_id: patrimonio.obra_id || null,
      tipo: tipo || "TRIAGEM_PATRIMONIO",
      status_anterior: statusAnterior || null,
      status_novo: statusNovo || patrimonio.status || "ESTOQUE",
      observacao: observacao || "Movimentação criada pela triagem",
      usuario: usuario?.nome || "Usuário não identificado",
      data_movimentacao: agoraLocal
    };

    const { error } = await db().from("movimentacoes").insert([payloadMov]);
    if(error){
      console.warn("Triagem: não gravou movimentação do patrimônio:", error.message);
    }

    // Analytics é opcional. Se a tabela não existir ou tiver outra estrutura, não trava a triagem.
    try{
      await db().from("analytics_patrimonio").insert([{
        patrimonio_id: patrimonio.id,
        empresa_id: patrimonio.empresa_id || null,
        tipo_evento: tipo || "TRIAGEM_PATRIMONIO",
        status_anterior: statusAnterior || null,
        status_novo: statusNovo || patrimonio.status || "ESTOQUE",
        local_anterior: patrimonio.localizacao || null,
        local_novo: patrimonio.localizacao || null,
        criticidade: statusNovo === "MANUTENCAO" ? 3 : 1,
        observacao: observacao || "Movimentação criada pela triagem"
      }]);
    }catch(e){}

  }catch(e){
    console.warn("Triagem: erro ao gravar movimentação/analytics do patrimônio:", e);
  }
}
window.gravarMovimentacaoPatrimonioTriagem = gravarMovimentacaoPatrimonioTriagem;

async function criarPatrimonioPelaTriagem(item, obra, obs, extra={}){
  const usuario = usuarioAtual();
  const gerado = await gerarCodigoPatrimonioTriagem(obra);

  const valorInformado = extra.valor_bem !== undefined && extra.valor_bem !== null
    ? extra.valor_bem
    : Number(item.valor_unitario || item.valor_total || 0);

  const { data, error } = await db()
    .from("patrimonio")
    .insert([{
      nome_bem: extra.nome_bem || item.descricao_xml || item.descricao || "Item triado como patrimônio",
      tipo_item: extra.tipo_item || "EQUIPAMENTO",
      empresa_id: obra.empresa_id ? Number(obra.empresa_id) : null,
      obra_id: obra.id ? Number(obra.id) : null,
      localizacao: obra.nome || null,
      sequencial: Number(gerado.sequencial),
      codigo_qr: gerado.codigo_qr,
      status: "ESTOQUE",
      marca: extra.marca || null,
      modelo: extra.modelo || null,
      numero_serie: extra.numero_serie || null,
      valor_bem: valorInformado,
      estado_conservacao: extra.estado_conservacao || item.estado_material || "NOVO",
      observacao: obs || extra.observacao || "Criado automaticamente pela triagem",
      origem_cadastro: "TRIAGEM",
      usuario_cadastro: usuario?.nome || "Usuário não identificado"
    }])
    .select()
    .single();

  if(error) throw error;

  await gravarMovimentacaoPatrimonioTriagem(data, "CADASTRO_TRIAGEM", null, "ESTOQUE", obs || "Cadastro rápido pela triagem");

  return data;
}

function montarItensHTML(listaItens){
  let html = "";

  listaItens.forEach(i => {
    const sugestao = sugerirDestino(i);
    const destinoPadrao = ["PATRIMONIO","ANALISAR_PATRIMONIO"].includes(sugestao) ? "PATRIMONIO" : "ESTOQUE";
    const endereco = sugerirEndereco(destinoPadrao, i);

    const alerta = `
      <div class="info" id="analise-${i.id}">
        🤖 Analisando histórico e regras inteligentes...
      </div>
    `;

    setTimeout(() => aplicarAnaliseInteligenteItem(i.id), 80);

    html += `
      <div class="item">
        <strong>${i.descricao_xml || "Item sem descrição"}</strong>

        <div class="grid" style="margin-top:8px;">
          <div><b>Qtd:</b> ${i.quantidade || 0}</div>
          <div><b>Vlr:</b> ${moeda(i.valor_unitario)}</div>
          <div><b>Total:</b> ${moeda(i.valor_total)}</div>
          <div><b>Estado:</b> ${i.estado_material || "-"}</div>
        </div>

        ${alerta}

        <div class="grid" style="margin-top:10px;">
          <div>
            <label>Destino</label>
            <select id="destino-${i.id}" onchange="this.dataset.usuarioAlterou='1'; atualizarEnderecoItem(${i.id})">
              <option value="ESTOQUE" ${destinoPadrao === "ESTOQUE" ? "selected" : ""}>Estoque CD</option>
              <option value="PATRIMONIO" ${destinoPadrao === "PATRIMONIO" ? "selected" : ""}>Patrimônio + Estoque</option>
              <option value="OBRA">Direto para Obra</option>
              <option value="AVARIADO">Avariado</option>
            </select>
          </div>

          <div id="boxObra-${i.id}" style="display:${destinoPadrao === "PATRIMONIO" ? "block" : "none"};">
            <label>Obra/Setor vínculo</label>
            <select id="obraDestino-${i.id}" onchange="atualizarEmpresaObraItem(${i.id})">
              ${montarOptionsObras()}
            </select>
          </div>

          <div id="boxPatrimonio-${i.id}" style="display:${destinoPadrao === "PATRIMONIO" ? "block" : "none"};">
            <label>Patrimônio</label>
            <select id="patrimonioModo-${i.id}" onchange="atualizarModoPatrimonioItem(${i.id})">
              <option value="NOVO">Não tem patrimônio - gerar novo</option>
              <option value="EXISTENTE">Já tem patrimônio - usar código</option>
            </select>
            <input id="codigoPatExistente-${i.id}" placeholder="Código PAT existente. Ex: PAT-1030001" style="display:none;margin-top:6px;">
            <div class="alerta" id="empresaTexto-${i.id}" style="font-size:11px;margin-top:6px;">
              Selecione a obra/setor para identificar empresa automaticamente.
            </div>
          </div>

          <div>
            <label>Endereço sugerido</label>
            <div class="codigo-end" id="enderecoTexto-${i.id}">
              ${endereco ? endereco.codigo_curto : "SEM ENDEREÇO LIVRE"}
            </div>
            <input type="hidden" id="enderecoId-${i.id}" value="${endereco ? endereco.id : ""}">
          </div>

          <div>
            <label>Observação</label>
            <input id="obs-${i.id}" placeholder="Observação">
          </div>
        </div>

        <div class="linha-acoes">
          <button class="btn btn-blue" onclick="atualizarEnderecoItem(${i.id})">🔄 Recalcular endereço</button>
          <button class="btn btn-ok" data-confirmar-triagem="${i.id}" onclick="confirmarItem(${i.id})">✅ Confirmar triagem</button>
        </div>
      </div>
    `;
  });

  return html;
}

async function aplicarAnaliseInteligenteItem(itemId){
  const item = itens.find(i => Number(i.id) === Number(itemId));
  if(!item) return;

  if(await bdrOfflineRealAsync({forcar:true})){
    const box = document.getElementById("analise-" + itemId);
    if(box){
      box.className = "info";
      box.innerHTML = "📴 Offline: usando regras locais de triagem. O histórico será consultado quando a internet voltar.";
    }
    await atualizarEnderecoItem(itemId);
    return;
  }

  const analise = await analisarItemTriagem(item);
  const destinoPadrao = ["PATRIMONIO","ANALISAR_PATRIMONIO"].includes(analise.destino) ? "PATRIMONIO" : "ESTOQUE";

  const selectDestino = document.getElementById("destino-" + itemId);
  if(selectDestino && !selectDestino.dataset.usuarioAlterou){
    selectDestino.value = destinoPadrao;
  }

  const box = document.getElementById("analise-" + itemId);
  if(box){
    box.className = destinoPadrao === "PATRIMONIO" ? "alerta" : "info";
    box.innerHTML = `
      <b>🤖 Recomendação:</b> ${analise.titulo}
      <br><b>Destino sugerido:</b> ${destinoPadrao === "PATRIMONIO" ? "Patrimônio + Estoque" : "Estoque comum"}
      <br><b>Confiança:</b> ${analise.confianca}%
      <br><b>Motivos:</b> ${analise.motivos.join(", ")}
    `;
  }

  await atualizarEnderecoItem(itemId);
}

async function atualizarEnderecoItem(itemId){
  try{
    await recarregarEnderecosLivres();
  }catch(e){
    if(!bdrErroDeInternet(e)) throw e;
  }

  const item = itens.find(i => Number(i.id) === Number(itemId));
  if(!item) return;

  const destino = valor("destino-" + itemId);
  const boxObra = document.getElementById("boxObra-" + itemId);
  const boxPatrimonio = document.getElementById("boxPatrimonio-" + itemId);

  if(boxObra){
    boxObra.style.display = (destino === "OBRA" || destino === "PATRIMONIO") ? "block" : "none";
  }

  if(boxPatrimonio){
    boxPatrimonio.style.display = destino === "PATRIMONIO" ? "block" : "none";
  }

  atualizarModoPatrimonioItem(itemId);
  atualizarEmpresaObraItem(itemId);

  const endereco = sugerirEndereco(destino, item);

  const enderecoTexto = document.getElementById("enderecoTexto-" + itemId);
  const enderecoInput = document.getElementById("enderecoId-" + itemId);

  if(enderecoTexto){
    enderecoTexto.innerText = endereco ? endereco.codigo_curto : "SEM ENDEREÇO LIVRE";
  }

  if(enderecoInput){
    enderecoInput.value = endereco ? endereco.id : "";
  }
}

async function confirmarItem(itemId){
  try{
    await recarregarEnderecosLivres();
  }catch(e){
    if(!bdrErroDeInternet(e)) throw e;
    console.log("📴 Triagem: prosseguindo com cache local de endereços.");
  }

  const item = itens.find(i => Number(i.id) === Number(itemId));

  if(item?.entrada_id){
    nfsAbertas.add(String(item.entrada_id));
  }

  if(!item){
    alert("Item não encontrado.");
    return;
  }

  const destino = valor("destino-" + itemId);
  const obraDestino = valor("obraDestino-" + itemId) || null;
  let enderecoId = valor("enderecoId-" + itemId) || null;
  const obs = valor("obs-" + itemId);

  if((destino === "OBRA" || destino === "PATRIMONIO") && !obraDestino){
    alert(destino === "PATRIMONIO"
      ? "Patrimônio precisa estar vinculado a uma obra/setor. Selecione a obra antes de confirmar."
      : "Selecione a obra destino.");
    return;
  }

  if(destino === "PATRIMONIO" && !patrimonioModalConfirmando){
    abrirModalPatrimonioTriagem(itemId);
    return;
  }

  if(destino === "PATRIMONIO"){
    const modoPat = valor("patrimonioModo-" + itemId) || "NOVO";
    const codigoExistente = valor("codigoPatExistente-" + itemId);
    if(modoPat === "EXISTENTE" && !codigoExistente){
      alert("Informe o código do patrimônio existente ou selecione gerar novo patrimônio.");
      return;
    }
  }

  if((destino === "ESTOQUE" || destino === "PATRIMONIO") && !enderecoId){
    const enderecoAuto = sugerirEndereco(destino, item);

    if(enderecoAuto){
      enderecoId = enderecoAuto.id;
      document.getElementById("enderecoTexto-" + itemId).innerText = enderecoAuto.codigo_curto;
      document.getElementById("enderecoId-" + itemId).value = enderecoAuto.id;
    }
  }

  if((destino === "ESTOQUE" || destino === "PATRIMONIO") && !enderecoId){
    alert("Nenhum endereço livre encontrado. Cadastre ou libere posições no Endereçamento.");
    return;
  }

  const endereco = enderecos.find(e => String(e.id) === String(enderecoId)) || null;

  /* =========================================================
     OFFLINE: salva confirmação completa da triagem
     A sincronização simplificada acontece no offlineQueue.js.
  ========================================================= */
  if(await bdrOfflineRealAsync({forcar:true})){
    console.log("📦 Triagem: salvando confirmação offline...");
    await salvarOffline("triagem_confirmar_item", "triagem_materiais", {
      item,
      destino,
      obraDestino,
      endereco,
      obs,
      usuario:usuarioAtual()?.nome || "Usuário não identificado",
      empresa_id:(obraDestino ? (obraPorId(obraDestino)?.empresa_id || null) : null),
      obraNome:(obraDestino ? (obraPorId(obraDestino)?.nome || null) : null),
      patrimonio_modo: valor("patrimonioModo-" + itemId) || "NOVO",
      patrimonio_codigo_existente: valor("codigoPatExistente-" + itemId) || null,
      patrimonio_extra: extrasPatrimonioTriagem[itemId] || null,
      endereco_id: enderecoId || null,
      criado_offline_em:new Date().toISOString()
    });

    alert("📦 Sem internet. Triagem salva no aparelho e será sincronizada quando a internet voltar.");

    nfsAbertas.add(String(item.entrada_id || ""));

    // Não remove da tela agora: mostra status pendente no botão/card,
    // igual app de mensagem aguardando rede.
    marcarItemTriagemPendente(item.id, {
      destino,
      descricao:item.descricao_xml || item.descricao || "Item"
    });
    aplicarStatusTriagemNaTela(item.id);

    return;
  }

  try{
    if(destino === "ESTOQUE" || destino === "OBRA" || destino === "PATRIMONIO"){
      await salvarNoEstoque(item, destino, obraDestino, endereco, obs);
    }

    if(destino === "AVARIADO"){
      await registrarTriagem(item, "AVARIADO", obraDestino, obs, endereco);

      if(endereco){
        await ocuparEndereco(endereco.id);
      }
    }

    await salvarAprendizadoTriagem(item, destino);

    await marcarItemTriado(item.id);
    await verificarEntradaFinalizada(item.entrada_id);

    delete extrasPatrimonioTriagem[item.id];
    alert("Triagem confirmada com sucesso!");
    await carregarTriagem();

  }catch(err){
    console.error(err);
    alert("Erro na triagem: " + err.message);
  }
}

async function salvarNoEstoque(item, destino, obraDestino, endereco, obs){
  const usuario = usuarioAtual();
  let codigo = "EST-" + Date.now() + "-" + item.id;
  const tipoControle = destino === "PATRIMONIO" ? "PATRIMONIO" : "CONSUMO";

  const obra = obraDestino ? obraPorId(obraDestino) : null;
  let patrimonioCriadoOuEncontrado = null;

  if(destino === "PATRIMONIO"){
    if(!obra){
      throw new Error("Selecione uma obra/setor para vincular o patrimônio.");
    }

    const modoPat = valor("patrimonioModo-" + item.id) || "NOVO";

    if(modoPat === "EXISTENTE"){
      const codigoExistente = valor("codigoPatExistente-" + item.id);
      patrimonioCriadoOuEncontrado = await buscarPatrimonioExistente(codigoExistente);
      if(!patrimonioCriadoOuEncontrado){
        throw new Error("Patrimônio existente não encontrado pelo código informado.");
      }

      await db().from("patrimonio").update({
        obra_id: obra.id,
        empresa_id: obra.empresa_id || patrimonioCriadoOuEncontrado.empresa_id || null,
        localizacao: obra.nome || patrimonioCriadoOuEncontrado.localizacao || null,
        status: "ESTOQUE"
      }).eq("id", patrimonioCriadoOuEncontrado.id);

      await gravarMovimentacaoPatrimonioTriagem(patrimonioCriadoOuEncontrado, "VINCULO_TRIAGEM", patrimonioCriadoOuEncontrado.status || null, "ESTOQUE", obs || "Vinculado pela triagem");

      patrimonioCriadoOuEncontrado = {
        ...patrimonioCriadoOuEncontrado,
        obra_id: obra.id,
        empresa_id: obra.empresa_id || patrimonioCriadoOuEncontrado.empresa_id || null,
        localizacao: obra.nome || patrimonioCriadoOuEncontrado.localizacao || null,
        status: "ESTOQUE"
      };
      codigo = patrimonioCriadoOuEncontrado.codigo_qr || codigoExistente;
    }else{
      patrimonioCriadoOuEncontrado = await criarPatrimonioPelaTriagem(item, obra, obs, extrasPatrimonioTriagem[item.id] || {});
      codigo = patrimonioCriadoOuEncontrado.codigo_qr || codigo;
    }
  }

  const empresaId = destino === "PATRIMONIO"
    ? (patrimonioCriadoOuEncontrado?.empresa_id || obra?.empresa_id || null)
    : (obra?.empresa_id || null);

  const obraIdFinal = destino === "PATRIMONIO"
    ? (patrimonioCriadoOuEncontrado?.obra_id || obra?.id || null)
    : (obraDestino || null);

  const { data: produto, error } = await db()
    .from("estoque_produtos")
    .insert([{
      codigo,
      descricao: item.descricao_xml || "Item sem descrição",
      unidade: "UN",
      tipo_controle: tipoControle,
      estado_material: item.estado_material || "NOVO",
      quantidade: Number(item.quantidade || 0),
      valor_unitario: Number(item.valor_unitario || 0),
      patrimonio_id: patrimonioCriadoOuEncontrado?.id || null,
      empresa_id: empresaId,
      obra_id: obraIdFinal,
      status: destino === "OBRA" ? "EM_USO" : "DISPONIVEL",
      usuario_cadastro: usuario?.nome || "Usuário não identificado",
      rua: endereco?.rua || null,
      prateleira: endereco?.prateleira || null,
      coluna: endereco?.coluna || null,
      nivel: endereco?.nivel || null,
      caixa: endereco?.caixa || null,
      localizacao_fisica: endereco?.codigo_curto || null,
      observacao: destino === "PATRIMONIO"
        ? `Patrimônio ${codigo} vinculado pela triagem. ${obs || ""}`
        : (obs || null)
    }])
    .select()
    .single();

  if(error) throw error;

  await db()
    .from("estoque_movimentacoes")
    .insert([{
      produto_id: produto.id,
      tipo_movimentacao: destino === "OBRA" ? "SAIDA_DIRETA_OBRA" : "ENTRADA",
      quantidade: Number(item.quantidade || 0),
      origem: "TRIAGEM",
      destino: destino === "OBRA" ? "OBRA " + obraDestino : (endereco?.codigo_curto || "CD"),
      usuario: usuario?.nome || "Usuário não identificado",
      observacao: destino === "PATRIMONIO"
        ? `Patrimônio ${codigo} ${patrimonioCriadoOuEncontrado ? "vinculado" : ""}. ${obs || ""}`
        : obs
    }]);

  await registrarTriagem(item, destino, obraDestino, obs, endereco);

  if(endereco && destino !== "OBRA"){
    await ocuparEndereco(endereco.id);
  }
}

async function ocuparEndereco(enderecoId){
  const { error } = await db()
    .from("enderecamento_estoque")
    .update({ status:"OCUPADO" })
    .eq("id", enderecoId);

  if(error) throw error;
}

async function registrarTriagem(item, destino, obraDestino, obs, endereco){
  const usuario = usuarioAtual();
  const sugestao = sugerirDestino(item);

  const { error } = await db()
    .from("triagem_materiais")
    .insert([{
      descricao: item.descricao_xml || "Item sem descrição",
      quantidade: Number(item.quantidade || 0),
      valor_unitario: Number(item.valor_unitario || 0),
      categoria: null,
      bem_duravel: destino === "PATRIMONIO" || sugestao === "PATRIMONIO" || sugestao === "ANALISAR_PATRIMONIO",
      sugestao_patrimonio: destino === "PATRIMONIO" || sugestao === "PATRIMONIO" || sugestao === "ANALISAR_PATRIMONIO",
      destino,
      obra_destino_id: obraDestino || null,
      status: "CONCLUIDO",
      usuario_triagem: usuario?.nome || "Usuário não identificado",
      observacao: obs || (endereco ? "Endereço: " + endereco.codigo_curto : null)
    }]);

  if(error) throw error;
}

async function marcarItemTriado(itemId){
  const { error } = await db()
    .from("entradas_materiais_itens")
    .update({ status_triagem:"TRIADO" })
    .eq("id", itemId);

  if(error) throw error;
}

async function verificarEntradaFinalizada(entradaId){
  const { data, error } = await db()
    .from("entradas_materiais_itens")
    .select("id")
    .eq("entrada_id", entradaId)
    .eq("status_triagem", "PENDENTE");

  if(error){
    console.error(error);
    return;
  }

  if(!data || data.length === 0){
    await db()
      .from("entradas_materiais")
      .update({ status:"TRIADO" })
      .eq("id", entradaId);
  }
}
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

console.log('✔ BDR TRIAGEM OFFLINE AUTO V4 carregado');

console.log("✔ BDR TRIAGEM OFFLINE AUTO V5 SAFE carregado");
