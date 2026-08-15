/* =========================================================
   ATLAS / BDR — NÚCLEO DA EXPEDIÇÃO

   Responsabilidade:
   - estado principal da tela;
   - catálogo e carrinho;
   - carregamento progressivo;
   - renderização base;
   - integração com os módulos especializados em /fluxo.

   Regras específicas de aprovação, solicitações, logística,
   fiscal e permissões ficam fora deste arquivo.
========================================================= */
var itensCatalogo = window.itensCatalogo || [];
var carrinho = window.carrinho || [];
window.carrinho = carrinho;
var pedidos = window.pedidos || [];
var obras = window.obras || [];
var filtroAtual = window.filtroAtual || "TODOS";
var pedidoRetiradaAtual = window.pedidoRetiradaAtual || null;

/* Catálogo paginado: somente uma pequena janela fica no navegador. */
var catalogoPagina = 0;
var catalogoTemMais = false;
var catalogoCarregando = false;
var catalogoBuscaTimer = null;
var catalogoKPIs = null;
var pedidosTotalServidor = 0;
var catalogoTotalServidor = 0;
var catalogoTotalPaginas = 1;
var pedidosBackgroundPromise = null;
var catalogoKPIsProntos = false;
var pedidosKPIsProntos = false;

/* =========================================================
   OFFLINE BDR - Expedição
   A tela cria solicitações e muda status mesmo sem internet.
========================================================= */

function ir(p){ window.location.href = p; }
function db(){ return window.client || window.supabaseClient || window.clientSupabase || globalThis.client; }

async function bdrExpOnlineReal(){
  if(navigator.onLine === false) return false;

  // V11.1: a fonte de verdade é o teste real do bdrCore.
  // Não deixe bdrOnline() antigo prender a Expedição em offline fantasma.
  if(typeof window.bdrOnlineReal === "function"){
    try{ return await window.bdrOnlineReal(); }catch(e){ return false; }
  }

  if(typeof window.bdrOnline === "function"){
    try{ return window.bdrOnline() !== false; }catch(e){}
  }

  return navigator.onLine !== false;
}

async function bdrExpOfflineReal(){
  return !(await bdrExpOnlineReal());
}

function bdrExpErroInternet(err){
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("failed to fetch") ||
         msg.includes("internet_disconnected") ||
         msg.includes("networkerror") ||
         msg.includes("err_internet") ||
         msg.includes("err_name_not_resolved");
}

const BDR_EXP_CACHE_KEY = "bdr_expedicao_cache_v1";
const BDR_EXP_STATUS_KEY = "bdr_expedicao_status_offline_v1";

function salvarCacheExpedicao(){
  try{
    localStorage.setItem(BDR_EXP_CACHE_KEY, JSON.stringify({
      itensCatalogo, pedidos, obras, salvo_em:new Date().toISOString()
    }));
  }catch(e){}
}

function carregarCacheExpedicao(){
  try{
    const raw = localStorage.getItem(BDR_EXP_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

function statusExpOffline(){
  try{ return JSON.parse(localStorage.getItem(BDR_EXP_STATUS_KEY) || "{}"); }
  catch(e){ return {}; }
}

function salvarStatusExpOffline(obj){
  try{ localStorage.setItem(BDR_EXP_STATUS_KEY, JSON.stringify(obj || {})); }catch(e){}
}

function marcarExpPendente(chave, texto){
  const s = statusExpOffline();
  s[chave] = {texto:texto || "⏳ Salvo offline • aguardando internet", data:new Date().toISOString()};
  salvarStatusExpOffline(s);
  aplicarStatusExpTela();
}

function aplicarStatusExpTela(){
  const btn = document.querySelector(".btn-submit");
  const s = statusExpOffline();
  const total = Object.keys(s).length;

  if(btn && total > 0){
    btn.innerHTML = "⏳ Solicitação salva offline";
    btn.style.background = "#f59e0b";
    btn.title = "Existe solicitação aguardando sincronização.";
  }
}

window.addEventListener("bdrOfflineSincronizado", e => {
  if(e.detail?.tipo === "nova_solicitacao" || e.detail?.tipo === "acao_pedido"){
    salvarStatusExpOffline({});
    setTimeout(aplicarStatusExpTela, 200);
  }
});
document.addEventListener("DOMContentLoaded", () => setTimeout(aplicarStatusExpTela, 700));
function valor(id){ return String(document.getElementById(id)?.value || "").trim(); }
function esc(v){ return String(v ?? "").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function usuarioAtual(){ try{ const u=localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado"); return u ? JSON.parse(u) : null; }catch(e){ return null; } }

/* =========================================================
   ATLAS CARRINHO PERSISTENTE POR USUÁRIO
   - Mantém carrinho após F5/fechar navegador
   - Salva separado por usuário logado
   - Limpa somente após enviar solicitação com sucesso
========================================================= */
function chaveCarrinhoExpedicao(){
  const u = usuarioAtual() || {};
  const id = u.id || u.usuario_id || u.email || u.usuario || u.nome || "anonimo";
  return "atlas_carrinho_expedicao_" + String(id).replace(/[^a-zA-Z0-9_@.-]/g, "_");
}

function carregarCarrinhoExpedicaoSalvo(){
  try{
    const chave = chaveCarrinhoExpedicao();
    const antigo = "carrinhoExpedicao";
    let raw = localStorage.getItem(chave);

    // Compatibilidade com versões anteriores do Atlas.
    if(!raw){
      raw = localStorage.getItem(antigo);
    }

    const lista = raw ? JSON.parse(raw) : [];
    carrinho = Array.isArray(lista) ? lista : [];
    window.carrinho = carrinho;

    if(carrinho.length){
      localStorage.setItem(chave, JSON.stringify(carrinho));
    }

    return carrinho;
  }catch(e){
    carrinho = [];
    window.carrinho = carrinho;
    return carrinho;
  }
}

function limparCarrinhoExpedicaoSalvo(){
  try{
    localStorage.removeItem(chaveCarrinhoExpedicao());
    localStorage.removeItem("carrinhoExpedicao");
  }catch(e){}
  carrinho = [];
  window.carrinho = carrinho;
}
function perfil(){ return String(usuarioAtual()?.perfil || "").toUpperCase(); }
function perms(){ return String(usuarioAtual()?.permissoes || "").toUpperCase(); }

function tokensPermissoes(){
  return String(usuarioAtual()?.permissoes||"")
    .split(",")
    .map(x=>x.trim())
    .filter(Boolean);
}

function expedicaoObrasLiberadas(){
  const u=usuarioAtual()||{};
  const ids=new Set();

  if(u.obra_id) ids.add(Number(u.obra_id));

  tokensPermissoes().forEach(token=>{
    const m=String(token).toUpperCase().match(/^EXPEDICAO_OBRA_(\d+)$/);
    if(m) ids.add(Number(m[1]));
  });

  return [...ids].filter(Number.isFinite);
}

function podeTudo(){
  return Number(usuarioAtual()?.id||0)===1 ||
         tokensPermissoes().some(p=>String(p).toUpperCase()==="VER_TODAS_OBRAS");
}

function podeVerOutras(){ return podeTudo() || expedicaoObrasLiberadas().length>1; }
function podeSolicitarOutras(){ return podeTudo() || expedicaoObrasLiberadas().length>1; }
function podeAlmoxarife(){ return ["MASTER","ADMIN","ALMOXARIFE","ALMOXARIFADO"].includes(perfil()); }
function dataBR(d){ if(!d) return "-"; const x=new Date(String(d).replace(" ","T")); return isNaN(x.getTime()) ? String(d) : x.toLocaleString("pt-BR"); }
function normalStatus(s){ s = String(s || "").toUpperCase().replaceAll(" ","_"); if(["DISPONIVEL","NO_ESTOQUE"].includes(s)) return "ESTOQUE"; return s; }
function rotStatus(s){ const m={ESTOQUE:"DISPONÍVEL",DISPONIVEL:"DISPONÍVEL",NO_ESTOQUE:"DISPONÍVEL",EM_USO:"EM USO",MANUTENCAO:"MANUTENÇÃO",BAIXADO:"BAIXADO",QUEBRADO:"QUEBRADO",RESERVADO:"RESERVADO",INDISPONIVEL:"INDISPONÍVEL"}; return m[String(s||"").toUpperCase().replaceAll(" ","_")] || s || "-"; }
function statusClass(s){ return "st-" + String(s || "").toUpperCase().replaceAll(" ","_"); }
function nomeObra(id){ const o=obras.find(x=>String(x.id)===String(id)); return o ? `${o.codigo_obra || "-"} - ${o.nome || "-"}` : "Sem obra"; }
function obraCurta(id, fallback){ const txt = fallback || nomeObra(id); return txt.replace(/^\d+\s*-\s*/,'').slice(0,28); }

function preencherFiltroObrasCatalogo(){
  const select=document.getElementById("filtroObraCatalogo");
  if(!select) return;

  const atual=String(select.value||"TODAS");
  const idsPermitidos=podeTudo()?null:new Set(expedicaoObrasLiberadas().map(Number));

  const lista=(Array.isArray(obras)?obras:[])
    .filter(o=>!idsPermitidos||idsPermitidos.has(Number(o.id)))
    .slice()
    .sort((a,b)=>{
      const ca=String(a.codigo_obra||"");
      const cb=String(b.codigo_obra||"");
      return ca.localeCompare(cb,"pt-BR",{numeric:true,sensitivity:"base"});
    });

  select.innerHTML=[
    '<option value="TODAS">Todas as obras</option>',
    ...lista.map(o=>{
      const id=Number(o.id||0);
      const codigo=esc(o.codigo_obra||"");
      const nome=esc(o.nome||"");
      return `<option value="${id}">${codigo}${codigo&&nome?" - ":""}${nome}</option>`;
    })
  ].join("");

  if([...select.options].some(o=>o.value===atual)){
    select.value=atual;
  }else{
    select.value="TODAS";
  }
}

function preencherFiltroCategoriasCatalogo(){
  const select=document.getElementById("filtroCategoriaCatalogo");
  if(!select) return;

  const atual=String(select.value||"TODAS");
  const categorias=[...new Set(
    (Array.isArray(itensCatalogo)?itensCatalogo:[])
      .map(i=>String(i.tipo||i.categoria||i.tipo_item||"").trim().toUpperCase())
      .filter(Boolean)
  )].sort((a,b)=>a.localeCompare(b,"pt-BR",{numeric:true,sensitivity:"base"}));

  select.innerHTML=[
    '<option value="TODAS">Todas</option>',
    ...categorias.map(v=>{
      const rotulo=esc(v.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,l=>l.toUpperCase()));
      return `<option value="${esc(v)}">${rotulo}</option>`;
    })
  ].join("");

  if([...select.options].some(o=>o.value===atual)){
    select.value=atual;
  }else{
    select.value="TODAS";
  }
}

function fotoItem(i){ return i.foto_url || i.imagem_url || ""; }
function placeholderIcon(i){ const t = `${i.nome || i.descricao || ""}`.toLowerCase(); if(t.includes("furadeira")||t.includes("parafusadeira")) return "🔩"; if(t.includes("notebook")||t.includes("computador")) return "💻"; if(t.includes("impressora")) return "🖨️"; if(t.includes("solda")) return "⚡"; if(t.includes("capacete")) return "⛑️"; if(t.includes("cadeira")) return "🪑"; return "📦"; }
function carregarTopo(){ const u=usuarioAtual(); document.getElementById("usuarioNome").innerText = u ? "Olá, " + (u.nome || "usuário") : "Olá, usuário"; document.getElementById("usuarioPerfil").innerText = u ? (u.perfil || "-") : "-"; }
/* =========================================================
   TOPBAR OFICIAL ATLAS
   Controlada exclusivamente por JS/atlasTopbar.js.
========================================================= */

function abrirAba(nome, btn){
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  document.getElementById("tab-"+nome)?.classList.add("active");
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  btn?.classList.add("active");

  if(nome!=="catalogo" && typeof window.AtlasExpedicaoCarregarPedidos==="function"){
    void window.AtlasExpedicaoCarregarPedidos();
  }

  renderizarPedidos();
}
async function filtrarStatus(st, btn){
  filtroAtual = st;
  document.querySelectorAll(".chip-exp").forEach(b=>b.classList.remove("active"));
  btn?.classList.add("active");
  catalogoPagina=0;
  await carregarCatalogo({acumular:false});
}

async function carregarTudo(){
  if(!db()){ alert("Supabase não carregado."); return; }

  carregarTopo();
  carregarCarrinhoExpedicaoSalvo();

  const onlineReal = await bdrExpOnlineReal();

  if(!onlineReal){
    const cache = carregarCacheExpedicao();
    if(cache){
      itensCatalogo = cache.itensCatalogo || [];
      pedidos = cache.pedidos || [];
      obras = cache.obras || [];
      window.itensCatalogo = itensCatalogo;
      window.pedidos = pedidos;
      window.obras = obras;
      renderizarTudo();
      console.warn("📦 ATLAS EXPEDIÇÃO: dados exibidos do CACHE LOCAL (não são uma leitura nova do Supabase).");
      return;
    }

    alert("Sem internet e sem cache da expedição. Abra uma vez com internet.");
    return;
  }

  try{
    const inicioDados=performance.now();

    // 1) O mínimo necessário para o catálogo e identificação das obras.
    const ob = await db().from("obras")
      .select("id,codigo_obra,nome,ativa")
      .eq("ativa",true)
      .order("nome");
    if(ob.error) throw ob.error;
    obras = ob.data || [];
    window.obras = obras;
    preencherFiltroObrasCatalogo();

    catalogoPagina=0;
    catalogoKPIs=null;
    catalogoKPIsProntos=false;
    pedidosKPIsProntos=false;

    // Carrinho e estrutura aparecem antes dos pedidos pesados.
    renderizarCarrinho();
    atualizarKPIs();

    // 2) Catálogo primeiro: é a área principal de interação do funcionário.
    await carregarCatalogo({acumular:false});
    window.itensCatalogo = itensCatalogo;
    renderizarCatalogo();

    console.info(`☁️ ATLAS EXPEDIÇÃO: dados LIVE recebidos do Supabase — ${obras.length} obra(s) ativa(s).`);
    console.info(`⚡ Expedição: catálogo utilizável em ${Math.round(performance.now()-inicioDados)} ms`);

    // 3) A página e o catálogo já estão utilizáveis.
    // Pedidos/movimentações ficam por último e não bloqueiam o funcionário.
    const iniciarPedidosBackground=()=>{
      if(pedidosBackgroundPromise) return pedidosBackgroundPromise;

      pedidosBackgroundPromise=carregarPedidos()
        .then(()=>{
          window.pedidos=pedidos;
          pedidosKPIsProntos=true;
          renderizarPedidos();
          atualizarKPIs();
          salvarCacheExpedicao();
          console.info(`⚡ Expedição: pedidos/movimentações prontos em ${Math.round(performance.now()-inicioDados)} ms`);
          return pedidos;
        })
        .catch(err=>{
          pedidosBackgroundPromise=null;
          console.warn("Expedição: pedidos em segundo plano",err?.message||err);
          return [];
        });

      return pedidosBackgroundPromise;
    };

    window.AtlasExpedicaoCarregarPedidos=iniciarPedidosBackground;

    const idle=window.requestIdleCallback
      ? fn=>window.requestIdleCallback(fn,{timeout:1800})
      : fn=>setTimeout(fn,900);

    idle(()=>void iniciarPedidosBackground());

  }catch(e){
    if(bdrExpErroInternet(e)){
      const cache = carregarCacheExpedicao();
      if(cache){
        itensCatalogo = cache.itensCatalogo || [];
        pedidos = cache.pedidos || [];
        obras = cache.obras || [];
        catalogoKPIsProntos=true;
        pedidosKPIsProntos=true;
        renderizarTudo();
        return;
      }
    }
    throw e;
  }
}


/* =========================================================
   ATLAS SPRINT 2.8.1 - DISPONIBILIDADE REAL DO CATÁLOGO
   Se um patrimônio/item já foi aprovado/reservado em um pedido,
   ele aparece como RESERVADO mesmo que a tabela patrimonio ainda
   esteja com status ESTOQUE.
========================================================= */
async function aplicarReservasNoCatalogoAtlas(lista){
  try{
    if(!Array.isArray(lista) || !lista.length || !db()) return lista;

    const idsPat = lista
      .filter(i => i.patrimonio_id)
      .map(i => Number(i.patrimonio_id))
      .filter(Boolean);

    const idsProd = lista
      .filter(i => i.produto_id && !i.patrimonio_id)
      .map(i => Number(i.produto_id))
      .filter(Boolean);

    if(!idsPat.length && !idsProd.length) return lista;

    const statusBloqueantes = [
      "APROVADO",
      "RESERVADO",
      "EM_SEPARACAO",
      "AGUARDANDO_RETIRADA",
      "AGUARDANDO_CONFIRMACAO",
      "EM_TRANSITO"
    ];

    let reservas = [];

    if(idsPat.length){
      const rPat = await db()
        .from("itens_retirada")
        .select("id,pedido_id,patrimonio_id,produto_id,status,quantidade,obra_destino_id,patrimonio_codigo,patrimonio_nome")
        .in("patrimonio_id", idsPat)
        .in("status", statusBloqueantes);

      if(!rPat.error && Array.isArray(rPat.data)){
        reservas.push(...rPat.data);
      }
    }

    if(idsProd.length){
      const rProd = await db()
        .from("itens_retirada")
        .select("id,pedido_id,patrimonio_id,produto_id,status,quantidade,obra_destino_id,patrimonio_codigo,patrimonio_nome")
        .in("produto_id", idsProd)
        .in("status", statusBloqueantes);

      if(!rProd.error && Array.isArray(rProd.data)){
        reservas.push(...rProd.data);
      }
    }

    const pedidoIds = [...new Set(reservas.map(r => Number(r.pedido_id)).filter(Boolean))];
    const pedidosMap = {};

    if(pedidoIds.length){
      const rp = await db()
        .from("pedidos_retirada")
        .select("id,codigo,status,obra_nome,obra_destino_id,obra_origem_id,solicitante")
        .in("id", pedidoIds);

      if(!rp.error && Array.isArray(rp.data)){
        rp.data.forEach(p => pedidosMap[String(p.id)] = p);
      }
    }

    const reservaPorPat = {};
    const reservadoPorProd = {};

    reservas.forEach(r => {
      const pedido = pedidosMap[String(r.pedido_id)] || {};
      const info = {
        ...r,
        pedido_codigo: pedido.codigo || ("PED-" + r.pedido_id),
        pedido_visual: "PED-" + r.pedido_id,
        pedido_status: pedido.status || r.status,
        solicitante: pedido.solicitante || "-",
        destino_nome: pedido.obra_nome || nomeObra(pedido.obra_destino_id || r.obra_destino_id),
        origem_id: pedido.obra_origem_id || null,
        destino_id: pedido.obra_destino_id || r.obra_destino_id || null
      };

      // Patrimônio é único: uma reserva bloqueia o item inteiro.
      if(r.patrimonio_id && !reservaPorPat[String(r.patrimonio_id)]){
        reservaPorPat[String(r.patrimonio_id)] = info;
      }

      // Estoque comum: soma somente a quantidade comprometida.
      if(r.produto_id){
        const chave = String(r.produto_id);
        const qtdReserva = Math.max(0, Number(r.quantidade || 1));
        reservadoPorProd[chave] = Number(reservadoPorProd[chave] || 0) + qtdReserva;
      }
    });

    return lista.map(i => {
      // PATRIMÔNIO
      if(i.patrimonio_id){
        const res = reservaPorPat[String(i.patrimonio_id)];
        if(!res){
          return {
            ...i,
            qtd_total:1,
            qtd_reservada:0,
            qtd_disponivel:1
          };
        }

        return {
          ...i,
          status:"RESERVADO",
          qtd_total:1,
          qtd_reservada:1,
          qtd_disponivel:0,
          reservado_atlas:true,
          reserva_atlas:res,
          reserva_pedido_id:res.pedido_id,
          reserva_pedido_visual:res.pedido_visual,
          reserva_destino_nome:res.destino_nome,
          reserva_solicitante:res.solicitante
        };
      }

      // ESTOQUE COM QUANTIDADE
      const totalFisico = Math.max(0, Number(i.qtd || i.quantidade || 0));
      const reservado = Math.max(0, Number(reservadoPorProd[String(i.produto_id)] || 0));
      const disponivel = Math.max(0, totalFisico - reservado);

      return {
        ...i,
        status: disponivel > 0 ? "ESTOQUE" : "INDISPONIVEL",
        qtd_total: totalFisico,
        qtd_reservada: reservado,
        qtd_disponivel: disponivel,
        // O campo qtd passa a representar o que ainda pode ser solicitado.
        qtd: disponivel,
        reservado_atlas: reservado > 0,
        indisponivel_atlas: disponivel <= 0
      };
    });

  }catch(e){
    console.warn("Atlas Expedição: falha ao aplicar reservas no catálogo:", e?.message || e);
    return lista;
  }
}

async function carregarCatalogo({acumular=false}={}){
  const u=usuarioAtual();

  // OFFLINE mantém o catálogo salvo localmente, sem tentar consultar o servidor.
  if(!(await bdrExpOnlineReal())){
    renderizarCatalogo();
    return;
  }

  if(catalogoCarregando) return;
  if(!window.AtlasExpedicaoCatalogo?.buscar){
    throw new Error("Módulo de catálogo da Expedição não carregado.");
  }

  catalogoCarregando=true;
  renderizarEstadoCarregandoCatalogo(acumular);

  try{
    const escopoPermitido = podeTudo()
      ? null
      : expedicaoObrasLiberadas();

    const obraSelecionada=String(document.getElementById("filtroObraCatalogo")?.value||"TODAS");
    let obraIds=escopoPermitido;

    if(obraSelecionada!=="TODAS"){
      const idSelecionado=Number(obraSelecionada||0);
      if(idSelecionado){
        if(Array.isArray(escopoPermitido)){
          obraIds=escopoPermitido.includes(idSelecionado) ? [idSelecionado] : [];
        }else{
          obraIds=[idSelecionado];
        }
      }
    }

    const busca=valor("buscaCatalogo");
    const limitePagina=Number(document.getElementById("itensPorPaginaCatalogo")?.value || 30);

    const resposta=await window.AtlasExpedicaoCatalogo.buscar({
      busca,
      status:filtroAtual,
      pagina:catalogoPagina,
      limite:limitePagina,
      obraIds
    });

    catalogoTotalServidor=Number(resposta.total||0);
    catalogoTotalPaginas=Math.max(1,Number(resposta.totalPaginas||1));

    let lista=[];
    lista.push(...(resposta.patrimonios||[]).map(p=>({
      origem_tabela:"patrimonio", id:p.id, codigo:p.codigo_qr, nome:p.nome_bem || "Patrimônio", descricao:p.nome_bem || "Patrimônio", tipo:"PATRIMONIO",
      status:normalStatus(p.status), qtd:1, obra_id:p.obra_id, empresa_id:p.empresa_id, obra_nome:p.localizacao || nomeObra(p.obra_id),
      localizacao:p.localizacao_fisica || p.endereco_codigo || p.localizacao || "-", marca:p.marca, modelo:p.modelo, valor:p.valor_bem, foto_url:p.foto_url,
      estado:p.estado_conservacao || "-", patrimonio_id:p.id, raw:p
    })));
    lista.push(...(resposta.produtos||[]).map(p=>({
      origem_tabela:"estoque_produtos", id:p.id, codigo:p.codigo, nome:p.descricao || p.produto || "Produto", descricao:p.descricao || p.produto || "Produto", tipo:p.tipo_controle || "CONSUMO",
      status:normalStatus(p.status), qtd:Number(p.quantidade || p.qtd || 0), obra_id:p.obra_id, empresa_id:p.empresa_id, obra_nome:nomeObra(p.obra_id),
      localizacao:p.localizacao_fisica || [p.rua,p.prateleira,p.coluna,p.nivel].filter(Boolean).join("-") || "-", marca:p.marca, modelo:p.modelo, valor:p.valor_unitario, foto_url:p.foto_url,
      estado:p.estado_material || p.condicao || "-", produto_id:p.id, patrimonio_id:p.patrimonio_id, raw:p
    })));

    const categoriaSelecionada=String(document.getElementById("filtroCategoriaCatalogo")?.value||"TODAS").toUpperCase();
    if(categoriaSelecionada!=="TODAS"){
      lista=lista.filter(i=>String(i.tipo||i.categoria||i.tipo_item||"").trim().toUpperCase()===categoriaSelecionada);
    }

    const ordenacao=String(document.getElementById("ordenacaoCatalogo")?.value||"RECENTES").toUpperCase();
    if(ordenacao==="NOME_ASC"){
      lista.sort((a,b)=>String(a.nome||a.descricao||"").localeCompare(String(b.nome||b.descricao||""),"pt-BR",{numeric:true,sensitivity:"base"}));
    }else if(ordenacao==="CODIGO_ASC"){
      lista.sort((a,b)=>String(a.codigo||"").localeCompare(String(b.codigo||""),"pt-BR",{numeric:true,sensitivity:"base"}));
    }else if(ordenacao==="OBRA_ASC"){
      lista.sort((a,b)=>String(a.obra_nome||"").localeCompare(String(b.obra_nome||""),"pt-BR",{numeric:true,sensitivity:"base"}));
    }else if(ordenacao==="STATUS_ASC"){
      lista.sort((a,b)=>String(a.status||"").localeCompare(String(b.status||""),"pt-BR",{numeric:true,sensitivity:"base"}));
    }else{
      lista.sort((a,b)=>Number(b.id||0)-Number(a.id||0));
    }

    lista=lista.slice(0,limitePagina);
    lista=await aplicarReservasNoCatalogoAtlas(lista);
    lista=lista.filter(i=>!["BAIXADO","QUEBRADO"].includes(normalStatus(i.status)));

    if(acumular){
      const chaves=new Set(itensCatalogo.map(i=>`${i.origem_tabela}:${i.id}`));
      itensCatalogo.push(...lista.filter(i=>!chaves.has(`${i.origem_tabela}:${i.id}`)));
    }else{
      itensCatalogo=lista;
    }

    catalogoTemMais=Boolean(resposta.temMais);
    window.itensCatalogo=itensCatalogo;
    preencherFiltroCategoriasCatalogo();
    renderizarCatalogo();
    atualizarPaginacaoCatalogoServidor();

    // Os KPIs são contagens leves no banco; não exigem baixar todo o catálogo.
    if(!catalogoKPIs){
      window.AtlasExpedicaoCatalogo.kpis({obraIds})
        .then(k=>{
          catalogoKPIs=k;
          catalogoKPIsProntos=true;
          atualizarKPIs();
        })
        .catch(e=>console.warn("Expedição: KPIs do catálogo",e?.message||e));
    }
  }finally{
    catalogoCarregando=false;
  }
}

function skeletonCatalogoHTML(quantidade){
  const total=Math.max(1,Math.min(90,Number(quantidade)||30));

  const card=()=>`
    <div class="produto-card atlas-skeleton-card" aria-hidden="true">
      <div class="atlas-skeleton-photo"></div>
      <div class="atlas-skeleton-info">
        <div class="atlas-skeleton-line title"></div>
        <div class="atlas-skeleton-line medium"></div>
        <div class="atlas-skeleton-line short"></div>
        <div class="atlas-skeleton-footer">
          <div class="atlas-skeleton-pill"></div>
          <div class="atlas-skeleton-small"></div>
        </div>
      </div>
    </div>`;

  return Array.from({length:total},card).join("");
}

function renderizarEstadoCarregandoCatalogo(acumular){
  const grid=document.getElementById("catalogoGrid");
  if(!grid || acumular) return;

  const quantidade=Number(
    document.getElementById("itensPorPaginaCatalogo")?.value || 30
  );

  grid.innerHTML=skeletonCatalogoHTML(quantidade);

  const resumo=document.getElementById("atlasResumoCatalogo");
  if(resumo) resumo.textContent="Carregando catálogo...";
}

function agendarBuscaCatalogo(){
  clearTimeout(catalogoBuscaTimer);
  catalogoBuscaTimer=setTimeout(async()=>{
    catalogoPagina=0;
    catalogoKPIs=null;
    window.AtlasExpedicaoCatalogo?.limparCachePaginacao?.();
    await carregarCatalogo({acumular:false});
  },260);
}
window.agendarBuscaCatalogo=agendarBuscaCatalogo;


function paginasVisiveisCatalogo(atual,total){
  const paginas=[];
  const add=p=>{
    if(p>=1 && p<=total && !paginas.includes(p)) paginas.push(p);
  };

  add(1);
  add(atual-1);
  add(atual);
  add(atual+1);
  add(total);

  return paginas.sort((a,b)=>a-b);
}

function atualizarPaginacaoCatalogoServidor(){
  const atual=catalogoPagina+1;
  const total=Math.max(1,Number(catalogoTotalPaginas)||1);
  const box=document.getElementById("atlasPaginacaoCatalogo");

  if(!box) return;

  const paginas=paginasVisiveisCatalogo(atual,total);
  let anterior=null;
  const partes=[];

  paginas.forEach(p=>{
    if(anterior!==null && p-anterior>1){
      partes.push('<span class="atlas-page-dots" aria-hidden="true">…</span>');
    }

    partes.push(`
      <button type="button"
        class="atlas-page-btn ${p===atual?"active":""}"
        data-pagina="${p}"
        ${p===atual?'aria-current="page"':""}
        title="Página ${p}">
        ${p}
      </button>`);

    anterior=p;
  });

  box.innerHTML=`
    <button type="button"
      class="atlas-page-btn nav"
      data-pagina="${atual-1}"
      ${atual<=1?"disabled":""}
      aria-label="Página anterior">‹</button>

    ${partes.join("")}

    <button type="button"
      class="atlas-page-btn nav"
      data-pagina="${atual+1}"
      ${atual>=total?"disabled":""}
      aria-label="Próxima página">›</button>
  `;

  box.style.display="flex";

  box.querySelectorAll("[data-pagina]").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      if(btn.disabled) return;
      const pagina=Number(btn.dataset.pagina||1);
      await atlasCarregarPaginaCatalogo(pagina-1);
    });
  });

  const resumo=document.getElementById("atlasResumoCatalogo");
  if(resumo){
    if(!catalogoTotalServidor){
      resumo.textContent="Nenhum item encontrado";
    }else{
      const porPagina=Number(document.getElementById("itensPorPaginaCatalogo")?.value||30);
      const inicio=((atual-1)*porPagina)+1;
      const fim=Math.min(inicio+itensCatalogo.length-1,catalogoTotalServidor);
      resumo.textContent=`Mostrando ${inicio}–${fim} de ${catalogoTotalServidor} itens`;
    }
  }
}

async function atlasCarregarPaginaCatalogo(pagina){
  const destino=Math.min(
    Math.max(0,Number(pagina)||0),
    Math.max(0,catalogoTotalPaginas-1)
  );

  if(destino===catalogoPagina && itensCatalogo.length) return;

  catalogoPagina=destino;

  const topoCatalogo =
    document.getElementById("tab-catalogo") ||
    document.getElementById("buscaCatalogo") ||
    document.getElementById("catalogoGrid");

  if(topoCatalogo){
    const y = topoCatalogo.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({
      top: Math.max(0, y),
      behavior: "smooth"
    });
  }

  // O skeleton já ocupa a grade enquanto a nova página vem do banco.
  renderizarEstadoCarregandoCatalogo(false);
  await carregarCatalogo({acumular:false});
}

window.atlasMudarPaginaCatalogo=async function(delta){
  await atlasCarregarPaginaCatalogo(catalogoPagina+Number(delta||0));
};

window.atlasIrPaginaCatalogo=async function(pagina){
  await atlasCarregarPaginaCatalogo(Number(pagina||1)-1);
};

window.atlasIrUltimaPaginaCatalogo=async function(){
  await atlasCarregarPaginaCatalogo(Math.max(0,catalogoTotalPaginas-1));
};

window.atlasAlterarItensPorPagina=async function(){
  catalogoPagina=0;
  await carregarCatalogo({acumular:false});
};

window.atlasAlterarFiltroCatalogo=async function(){
  catalogoPagina=0;
  await carregarCatalogo({acumular:false});
};

window.atlasLimparFiltrosCatalogo=async function(){
  const ids={
    filtroObraCatalogo:"TODAS",
    filtroCategoriaCatalogo:"TODAS",
    ordenacaoCatalogo:"RECENTES",
    itensPorPaginaCatalogo:"30",
    buscaCatalogo:""
  };
  Object.entries(ids).forEach(([id,valor])=>{
    const el=document.getElementById(id);
    if(el) el.value=valor;
  });

  filtroAtual="TODOS";
  document.querySelectorAll(".chip-exp").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.filtro==="TODOS");
  });

  catalogoPagina=0;
  catalogoKPIs=null;
  window.AtlasExpedicaoCatalogo?.limparCachePaginacao?.();
  await carregarCatalogo({acumular:false});
};


async function carregarPedidos(){
  if(!window.AtlasExpedicaoPedidos?.carregar){
    throw new Error("Módulo de pedidos da Expedição não carregado.");
  }
  const r=await window.AtlasExpedicaoPedidos.carregar();
  pedidos=r.pedidos||[];
  pedidosTotalServidor=Number(r.total||pedidos.length);
  window.pedidos=pedidos;
}

function definirKpi(id,valor,pronto){
  const el=document.getElementById(id);
  if(!el) return;

  if(!pronto){
    el.textContent="";
    el.classList.add("atlas-kpi-loading");
    el.setAttribute("aria-busy","true");
    return;
  }

  el.classList.remove("atlas-kpi-loading");
  el.removeAttribute("aria-busy");
  el.textContent=String(valor ?? 0);
}

function atualizarKPIs(){
  const c=s=>itensCatalogo.filter(i=>normalStatus(i.status)===s).length;
  const k=catalogoKPIs||{};

  definirKpi("kpiTotal",k.TODOS ?? itensCatalogo.length,catalogoKPIsProntos);
  definirKpi("kpiEstoque",k.ESTOQUE ?? c("ESTOQUE"),catalogoKPIsProntos);
  definirKpi("kpiUso",k.EM_USO ?? c("EM_USO"),catalogoKPIsProntos);
  definirKpi("kpiManutencao",k.MANUTENCAO ?? c("MANUTENCAO"),catalogoKPIsProntos);
  definirKpi("kpiReservado",k.RESERVADO ?? c("RESERVADO"),catalogoKPIsProntos);

  definirKpi(
    "kpiPedidos",
    pedidosTotalServidor || pedidos.length,
    pedidosKPIsProntos
  );

  /*
    Os chips continuam utilizáveis durante a abertura.
    Quando as contagens globais chegam, eles recebem os valores reais.
  */
  const chipTodos=document.getElementById("chipTodos");
  const chipEstoque=document.getElementById("chipEstoque");
  const chipUso=document.getElementById("chipUso");
  const chipManutencao=document.getElementById("chipManutencao");
  const chipReservado=document.getElementById("chipReservado");

  if(chipTodos) chipTodos.innerText=catalogoKPIsProntos ? (k.TODOS ?? itensCatalogo.length) : "…";
  if(chipEstoque) chipEstoque.innerText=catalogoKPIsProntos ? (k.ESTOQUE ?? c("ESTOQUE")) : "…";
  if(chipUso) chipUso.innerText=catalogoKPIsProntos ? (k.EM_USO ?? c("EM_USO")) : "…";
  if(chipManutencao) chipManutencao.innerText=catalogoKPIsProntos ? (k.MANUTENCAO ?? c("MANUTENCAO")) : "…";
  if(chipReservado) chipReservado.innerText=catalogoKPIsProntos ? (k.RESERVADO ?? c("RESERVADO")) : "…";
}

function renderizarTudo(){ atualizarKPIs(); renderizarCatalogo(); renderizarCarrinho(); renderizarPedidos(); }
function renderizarCatalogo(){
  const grid = document.getElementById("catalogoGrid");
  if(!grid) return;

  let lista = itensCatalogo;

  // No modo offline o cache pode conter um catálogo maior; filtra localmente.
  if(navigator.onLine===false){
    const busca = valor("buscaCatalogo").toLowerCase();
    lista = itensCatalogo.filter(i=>{
      const texto = `${i.codigo||""} ${i.nome||""} ${i.descricao||""} ${i.marca||""} ${i.modelo||""} ${i.obra_nome||""} ${i.localizacao||""}`.toLowerCase();
      const st = normalStatus(i.status);
      return texto.includes(busca) && (filtroAtual === "TODOS" || st === filtroAtual);
    });
  }

  if(!lista.length){
    grid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1">Nenhum item encontrado.</div>`;
    return;
  }

  grid.innerHTML = lista.map(i => cardItem(i)).join("");
}

/* =========================================================
   ATLAS CARRINHO UX - estilo marketplace
   - adiciona sem abrir o modal
   - marca visualmente o card como adicionado
   - sincroniza window/localStorage
   - atualiza contador do topo
========================================================= */
function itemEstaNoCarrinho(item){
  return carrinho.some(c =>
    c.origem_tabela === item.origem_tabela &&
    Number(c.id) === Number(item.id)
  );
}

function sincronizarCarrinhoExpedicao(){
  window.carrinho = carrinho;
  try{
    const json = JSON.stringify(carrinho || []);
    localStorage.setItem(chaveCarrinhoExpedicao(), json);
    // Mantém compatibilidade com versões antigas; pode ser removido no futuro.
    localStorage.setItem("carrinhoExpedicao", json);
  }catch(e){}
  const topo = document.getElementById("cartQtdTopo");
  if(topo) topo.innerText = carrinho.length;
}

function garantirCssCarrinhoAtlas(){
  if(document.getElementById("atlasCarrinhoUxCss")) return;
  const css = document.createElement("style");
  css.id = "atlasCarrinhoUxCss";
  css.textContent = `
    @keyframes atlasPop{
      0%{transform:scale(.86)}
      55%{transform:scale(1.18)}
      100%{transform:scale(1)}
    }
    @keyframes atlasPulse{
      0%{transform:scale(1)}
      45%{transform:scale(1.22)}
      100%{transform:scale(1)}
    }
    .produto-card.produto-no-carrinho{
      border:2px solid #16a34a!important;
      box-shadow:0 8px 24px rgba(22,163,74,.15)!important;
      background:#fff!important;
    }
    .produto-card.produto-reservado-atlas{
      border:2px solid #7c3aed!important;
      box-shadow:0 8px 24px rgba(124,58,237,.12)!important;
    }
    .produto-saldo-atlas{
      margin:6px 0 7px;
      display:grid;
      gap:3px;
      color:#475569;
      font-size:10px;
      font-weight:900;
      line-height:1.25;
    }
    .produto-saldo-atlas strong{color:#0f172a}
    .produto-saldo-atlas .saldo-ok{color:#15803d}
    .produto-saldo-atlas .saldo-reserva{color:#7c3aed}
    .produto-saldo-atlas .saldo-zero{color:#b91c1c}
    .produto-card.produto-indisponivel-atlas{
      border:2px solid #fca5a5!important;
      background:#fffafa!important;
      box-shadow:0 8px 24px rgba(220,38,38,.10)!important;
    }
    .st-INDISPONIVEL{background:#dc2626!important}
    .produto-reserva-atlas{
      margin:4px 0 7px;
      color:#6d28d9;
      font-size:10px;
      font-weight:900;
      line-height:1.2;
      background:#f5f3ff;
      border:1px solid #ddd6fe;
      border-radius:8px;
      padding:4px 6px;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    .btn-card-action.adicionado{
      background:#16a34a!important;
      color:#fff!important;
    }
    .btn-card-action.atlas-pop{
      animation:atlasPop .28s ease-out;
    }
    #cartQtdTopo.atlas-pulse, .btn-cart-top.atlas-pulse{
      animation:atlasPulse .32s ease-out;
    }

    .atlas-toast{
      position:fixed;
      right:16px;
      bottom:18px;
      z-index:9999999;
      background:#111827;
      color:#fff;
      padding:10px 13px;
      border-radius:12px;
      box-shadow:0 14px 35px rgba(15,23,42,.25);
      font-size:12px;
      font-weight:900;
      opacity:0;
      transform:translateY(8px);
      transition:.22s ease;
      pointer-events:none;
      max-width:290px;
    }
    .atlas-toast.ativo{opacity:1;transform:translateY(0)}

    .atlas-item-voando{
      position:fixed;
      z-index:2147483646;
      width:48px;
      height:48px;
      border-radius:14px;
      display:flex;
      align-items:center;
      justify-content:center;
      background:#fff;
      border:2px solid #16a34a;
      box-shadow:0 14px 34px rgba(15,23,42,.28);
      font-size:25px;
      pointer-events:none;
      transition:left .48s cubic-bezier(.2,.8,.2,1),
                 top .48s cubic-bezier(.2,.8,.2,1),
                 transform .48s ease,
                 opacity .48s ease;
      transform:scale(1);
      opacity:1;
    }

    .atlas-item-voando.chegou{
      transform:scale(.28) rotate(12deg);
      opacity:.18;
    }

    .produto-card.atlas-card-confirmado{
      animation:atlasCardConfirmado .42s ease-out;
    }

    @keyframes atlasCardConfirmado{
      0%{transform:scale(1)}
      45%{transform:scale(1.035)}
      100%{transform:scale(1)}
    }
  `;
  document.head.appendChild(css);
}


function atlasToast(msg){
  try{
    garantirCssCarrinhoAtlas();
    let t = document.getElementById("atlasToastCarrinho");
    if(!t){
      t = document.createElement("div");
      t.id = "atlasToastCarrinho";
      t.className = "atlas-toast";
      document.body.appendChild(t);
    }
    t.innerHTML = msg;
    t.classList.add("ativo");
    clearTimeout(window.__atlasToastTimer);
    window.__atlasToastTimer = setTimeout(()=>t.classList.remove("ativo"), 1700);
  }catch(e){}
}

function atlasMotionPop(el){
  try{
    if(window.AtlasMotion && typeof window.AtlasMotion.pop === "function") return window.AtlasMotion.pop(el);
    if(!el) return;
    el.classList.remove("atlas-pop");
    void el.offsetWidth;
    el.classList.add("atlas-pop");
    setTimeout(()=>el.classList.remove("atlas-pop"), 350);
  }catch(e){}
}

function atlasMotionPulse(el){
  try{
    if(window.AtlasMotion && typeof window.AtlasMotion.pulse === "function") return window.AtlasMotion.pulse(el);
    if(!el) return;
    el.classList.remove("atlas-pulse");
    void el.offsetWidth;
    el.classList.add("atlas-pulse");
    setTimeout(()=>el.classList.remove("atlas-pulse"), 380);
  }catch(e){}
}

function animarCarrinhoTopo(){
  atlasMotionPulse(document.getElementById("cartQtdTopo"));
  atlasMotionPulse(document.querySelector(".btn-cart-top"));
}

function animarBotaoItem(origem,id){
  setTimeout(()=>{
    const sel = `.btn-card-action[data-origem="${String(origem).replace(/"/g,'\\"')}"][data-id="${Number(id)}"]`;
    atlasMotionPop(document.querySelector(sel));
  }, 30);
}


function animarItemAteCarrinho(item){
  try{
    garantirCssCarrinhoAtlas();

    const seletor =
      `.btn-card-action[data-origem="${String(item?.origem_tabela || "").replace(/"/g,'\\"')}"]` +
      `[data-id="${Number(item?.id || 0)}"]`;

    const botaoOrigem = document.querySelector(seletor);
    const cardOrigem = botaoOrigem?.closest(".produto-card");
    const carrinhoTopo = document.querySelector(".btn-cart-top");

    if(!botaoOrigem || !carrinhoTopo){
      animarCarrinhoTopo();
      return;
    }

    const origem = botaoOrigem.getBoundingClientRect();
    const destino = carrinhoTopo.getBoundingClientRect();

    const voador = document.createElement("div");
    voador.className = "atlas-item-voando";
    voador.textContent = placeholderIcon(item || {});
    voador.style.left = (origem.left + origem.width / 2 - 24) + "px";
    voador.style.top = (origem.top + origem.height / 2 - 24) + "px";

    document.body.appendChild(voador);
    cardOrigem?.classList.add("atlas-card-confirmado");

    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        voador.style.left = (destino.left + destino.width / 2 - 24) + "px";
        voador.style.top = (destino.top + destino.height / 2 - 24) + "px";
        voador.classList.add("chegou");
      });
    });

    setTimeout(()=>{
      voador.remove();
      cardOrigem?.classList.remove("atlas-card-confirmado");
      animarCarrinhoTopo();
    }, 520);
  }catch(e){
    animarCarrinhoTopo();
  }
}


/* =========================================================
   ATLAS 3.1.9 - REGRAS DE SOLICITAÇÃO
========================================================= */
function atlasMesmaObraOrigemDestino(item){
  const u = usuarioAtual() || {};
  const origem = String(item?.obra_id || "");
  const destino = String(u?.obra_id || "");
  return !!origem && !!destino && origem === destino;
}

function atlasQtdMaximaItem(item){
  if(!item) return 1;
  if(item.origem_tabela === "patrimonio" || item.patrimonio_id) return 1;
  const qtd = Number(
    item.qtd_disponivel ??
    item.qtd ??
    item.quantidade ??
    0
  );
  return Number.isFinite(qtd) && qtd > 0 ? qtd : 0;
}

function atualizarQtdCarrinho(origem,id,valorNovo){
  const item = carrinho.find(c =>
    c.origem_tabela === origem && Number(c.id) === Number(id)
  );
  if(!item) return;

  const max = atlasQtdMaximaItem(item);
  let qtd = Number(String(valorNovo).replace(",", "."));

  if(!Number.isFinite(qtd) || qtd <= 0) qtd = 1;
  if(qtd > max) qtd = max;

  item.quantidade_solicitada = qtd;
  sincronizarCarrinhoExpedicao();
  renderizarCarrinho();
}
window.atualizarQtdCarrinho = atualizarQtdCarrinho;

function cardItem(i){
  garantirCssCarrinhoAtlas();

  const st = normalStatus(i.status);
  const noCarrinho = itemEstaNoCarrinho(i);
  const ehPatrimonio = !!i.patrimonio_id;
  const total = ehPatrimonio ? 1 : Number(i.qtd_total ?? i.qtd ?? 0);
  const reservado = ehPatrimonio ? Number(i.qtd_reservada || 0) : Number(i.qtd_reservada || 0);
  const disponivel = ehPatrimonio
    ? Number(i.qtd_disponivel ?? (st === "ESTOQUE" ? 1 : 0))
    : Number(i.qtd_disponivel ?? i.qtd ?? 0);

  const semDisponibilidade = disponivel <= 0 || st === "INDISPONIVEL";
  const acao = noCarrinho
    ? "fa-check"
    : semDisponibilidade
      ? "fa-lock"
      : st === "ESTOQUE"
        ? "fa-cart-shopping"
        : st === "EM_USO"
          ? "fa-eye"
          : st === "MANUTENCAO"
            ? "fa-wrench"
            : "fa-lock";

  const cls = noCarrinho
    ? "ok adicionado"
    : semDisponibilidade
      ? "block"
      : st === "ESTOQUE"
        ? "ok"
        : st === "EM_USO"
          ? "info"
          : "block";

  const tituloAcao = noCarrinho
    ? "No carrinho • clique para remover"
    : semDisponibilidade
      ? "Indisponível"
      : st === "ESTOQUE"
        ? "Adicionar ao carrinho"
        : st === "EM_USO"
          ? "Registrar interesse"
          : "Indisponível";

  const foto = fotoItem(i);

  let saldoInfo = "";
  if(ehPatrimonio){
    saldoInfo = i.reservado_atlas
      ? `<div class="produto-reserva-atlas">🔒 ${esc(i.reserva_pedido_visual || 'Reservado')} • ${esc(obraCurta(null, i.reserva_destino_nome || 'Destino'))}</div>`
      : `<div class="produto-saldo-atlas"><span class="saldo-ok">1 disponível</span></div>`;
  }else{
    saldoInfo = `
      <div class="produto-saldo-atlas">
        <span><strong>${total}</strong> em estoque</span>
        ${reservado > 0 ? `<span class="saldo-reserva">${reservado} reservado(s)</span>` : ""}
        <span class="${disponivel > 0 ? "saldo-ok" : "saldo-zero"}">${disponivel} disponível(is)</span>
      </div>`;
  }

  return `<div class="produto-card
      ${noCarrinho ? 'produto-no-carrinho' : ''}
      ${ehPatrimonio && i.reservado_atlas ? 'produto-reservado-atlas' : ''}
      ${semDisponibilidade ? 'produto-indisponivel-atlas' : ''}"
      onclick="abrirDetalhe('${i.origem_tabela}',${i.id})">

    <button
      class="btn-card-action ${cls}"
      data-origem="${esc(i.origem_tabela)}"
      data-id="${Number(i.id)}"
      onclick="event.stopPropagation();acaoItem('${i.origem_tabela}',${i.id})"
      title="${tituloAcao}">
      <i class="fa-solid ${acao}"></i>
    </button>

    <div class="produto-foto">
      ${foto
        ? `<img src="${esc(foto)}" onerror="this.outerHTML='<div class=placeholder>${placeholderIcon(i)}</div>'">`
        : `<div class="placeholder">${placeholderIcon(i)}</div>`
      }
      <div class="hover-detalhe">👁 Ver detalhes</div>
    </div>

    <div class="produto-info">
      <div class="produto-nome">${esc(i.nome)}</div>
      <div class="produto-obra">📍 ${esc(obraCurta(i.obra_id,i.obra_nome))}</div>
      ${saldoInfo}
      <div class="produto-rodape">
        <span class="badge-status ${statusClass(semDisponibilidade ? "INDISPONIVEL" : st)}">
          ${semDisponibilidade ? "INDISPONÍVEL" : rotStatus(st)}
        </span>
        <span class="produto-qtd">${ehPatrimonio ? "1 unid" : disponivel + " disp."}</span>
      </div>
    </div>
  </div>`;
}

function buscarItem(origem,id){ return itensCatalogo.find(i=>i.origem_tabela===origem && Number(i.id)===Number(id)); }
function acaoItem(origem,id){
  const item = buscarItem(origem,id);
  if(!item) return;
  const st=normalStatus(item.status);

  // Marketplace Atlas: clicou no check, remove do carrinho.
  if(itemEstaNoCarrinho(item)){
    removerCarrinho(origem,id);
    animarCarrinhoTopo();
    return;
  }

  if(atlasMesmaObraOrigemDestino(item)){
    atlasToast("ℹ Este item já pertence à sua obra/setor.");
    return;
  }

  const disponivel = Number(item.qtd_disponivel ?? item.qtd ?? 0);

  if(st === "INDISPONIVEL" || disponivel <= 0){
    atlasToast("🔒 Indisponível<br><small>Não há quantidade disponível para solicitar.</small>");
    return;
  }

  if(st === "ESTOQUE") addCarrinho(item);
  else if(st === "EM_USO") addInteresse(item);
  else atlasToast("ℹ Item indisponível para solicitação no momento.");
}
function addCarrinho(item){
  if(itemEstaNoCarrinho(item)) return;

  animarItemAteCarrinho(item);

  carrinho.push({...item, tipo_solicitacao:"RETIRADA", quantidade_solicitada:1});
  sincronizarCarrinhoExpedicao();
  renderizarCarrinho();
  renderizarCatalogo();
  animarBotaoItem(item.origem_tabela,item.id);
}
function addInteresse(item){
  if(itemEstaNoCarrinho(item)) return;

  animarItemAteCarrinho(item);

  carrinho.push({...item, tipo_solicitacao:"INTERESSE", quantidade_solicitada:1});
  sincronizarCarrinhoExpedicao();
  renderizarCarrinho();
  renderizarCatalogo();
  animarBotaoItem(item.origem_tabela,item.id);
}
function removerCarrinho(origem,id){
  carrinho = carrinho.filter(c=>!(
    c.origem_tabela===origem && Number(c.id)===Number(id)
  ));

  sincronizarCarrinhoExpedicao();
  renderizarCarrinho();
  renderizarCatalogo();
  animarCarrinhoTopo();
}
function renderizarCarrinho(){
  sincronizarCarrinhoExpedicao();
  const box=document.getElementById("cartItens");
  const q1=document.getElementById("cartQtd"); if(q1) q1.innerText=carrinho.length;
  const q2=document.getElementById("cartResumoItens"); if(q2) q2.innerText=carrinho.length;
  const q3=document.getElementById("cartResumoObras"); if(q3) q3.innerText=new Set(carrinho.map(c=>String(c.obra_id||""))).size;
  if(!carrinho.length){ box.innerHTML=`<div class="cart-empty">Carrinho vazio.</div>`; return; }
  box.innerHTML = carrinho.map(i=>{
    const max = atlasQtdMaximaItem(i);
    const permiteQtd = i.origem_tabela === "estoque_produtos" && !i.patrimonio_id;
    const qtdAtual = Number(i.quantidade_solicitada || 1);

    return `<div class="cart-item">
      <div class="cart-img">${fotoItem(i)?`<img src="${esc(fotoItem(i))}">`:placeholderIcon(i)}</div>
      <div class="cart-info">
        <strong>${esc(i.nome)}</strong>
        <span>${esc(obraCurta(i.obra_id,i.obra_nome))} • ${i.tipo_solicitacao==='INTERESSE'?'Interesse':'Retirada'}</span>
        ${permiteQtd ? `
          <label style="display:flex;align-items:center;gap:7px;margin-top:7px;font-size:11px;font-weight:900;color:#334155">
            Quantidade:
            <input
              type="number"
              min="1"
              max="${max}"
              step="1"
              value="${qtdAtual}"
              style="width:86px;height:34px;border:1px solid #cbd5e1;border-radius:9px;padding:0 8px;font-size:16px;font-weight:900"
              onchange="atualizarQtdCarrinho('${i.origem_tabela}',${i.id},this.value)"
            >
            <small>de ${max}</small>
          </label>` :
          `<div style="margin-top:6px;font-size:11px;font-weight:900;color:#334155">Quantidade: 1</div>`
        }
      </div>
      <button class="cart-remove" onclick="removerCarrinho('${i.origem_tabela}',${i.id})"><i class="fa-solid fa-trash"></i></button>
    </div>`;
  }).join("");
}


/* =========================================================
   ATLAS SPRINT 2.4 - MODAL DO CARRINHO
   Corrige botão superior do carrinho e mantém UX Marketplace.
========================================================= */
function abrirModalCarrinho(){
  try{
    sincronizarCarrinhoExpedicao?.();
    renderizarCarrinho?.();
  }catch(e){}

  const modal = document.getElementById("modalCarrinho");
  if(!modal){
    console.warn("Atlas Expedição: modalCarrinho não encontrado.");
    return;
  }
  modal.classList.add("ativo");

  try{
    const painel = modal.querySelector(".modal") || modal;
    atlasMotionPop?.(painel);
  }catch(e){}
}

function fecharModalCarrinho(){
  document.getElementById("modalCarrinho")?.classList.remove("ativo");
}

window.abrirModalCarrinho = abrirModalCarrinho;
window.fecharModalCarrinho = fecharModalCarrinho;


async function validarDisponibilidadeAtualCarrinhoAtlas(){
  const statusBloqueantes = [
    "APROVADO",
    "RESERVADO",
    "EM_SEPARACAO",
    "AGUARDANDO_RETIRADA",
    "AGUARDANDO_CONFIRMACAO",
    "EM_TRANSITO"
  ];

  for(const item of carrinho){
    // Patrimônio: exclusivo
    if(item.patrimonio_id){
      const { data, error } = await db()
        .from("itens_retirada")
        .select("id")
        .eq("patrimonio_id", item.patrimonio_id)
        .in("status", statusBloqueantes)
        .limit(1);

      if(error) throw error;

      if(Array.isArray(data) && data.length){
        return {
          ok:false,
          item,
          mensagem:"Este patrimônio acabou de ser reservado por outro pedido."
        };
      }

      continue;
    }

    // Estoque: saldo físico menos todas as reservas ativas
    if(item.produto_id){
      const produto = await db()
        .from("estoque_produtos")
        .select("id,quantidade")
        .eq("id", item.produto_id)
        .maybeSingle();

      if(produto.error) throw produto.error;

      const totalFisico = Math.max(
        0,
        Number(produto.data?.quantidade ?? item.qtd_total ?? item.quantidade ?? 0)
      );

      const reservas = await db()
        .from("itens_retirada")
        .select("quantidade")
        .eq("produto_id", item.produto_id)
        .in("status", statusBloqueantes);

      if(reservas.error) throw reservas.error;

      const reservado = (reservas.data || []).reduce(
        (soma, r) => soma + Math.max(0, Number(r.quantidade || 1)),
        0
      );

      const disponivel = Math.max(0, totalFisico - reservado);
      const solicitado = Math.max(0, Number(item.quantidade_solicitada || 1));

      if(solicitado > disponivel){
        return {
          ok:false,
          item,
          solicitado,
          disponivel,
          mensagem:
            "Quantidade indisponível para " + (item.nome || "o item") + ". " +
            "Solicitado: " + solicitado + ". Disponível agora: " + disponivel + "."
        };
      }
    }
  }

  return {ok:true};
}

async function enviarSolicitacao(){
  if(!carrinho.length){
    atlasToast("ℹ Adicione itens ao carrinho.");
    return;
  }

  const u = usuarioAtual();
  const obraDestinoIdUsuario = Number(u?.obra_id || 0);

  if(!obraDestinoIdUsuario){
    atlasToast("⚠ Seu usuário não possui obra/setor de destino.");
    return;
  }

  const itemMesmaObra = carrinho.find(i => atlasMesmaObraOrigemDestino(i));
  if(itemMesmaObra){
    atlasToast("ℹ " + esc(itemMesmaObra.nome || "Item") + " já pertence à sua obra.");
    return;
  }

  const qtdInvalida = carrinho.find(i => {
    const qtd = Number(i.quantidade_solicitada || 1);
    return !Number.isFinite(qtd) || qtd <= 0 || qtd > atlasQtdMaximaItem(i);
  });
  if(qtdInvalida){
    atlasToast("⚠ Confira a quantidade solicitada de " + esc(qtdInvalida.nome || "item") + ".");
    return;
  }

  try{
    const validacaoAtual = await validarDisponibilidadeAtualCarrinhoAtlas();

    if(!validacaoAtual.ok){
      atlasToast("🔒 " + esc(validacaoAtual.mensagem || "Item indisponível."));
      await carregarTudo();
      return;
    }
  }catch(e){
    console.warn("Atlas: falha ao validar saldo atual:", e?.message || e);
    atlasToast("⚠ Não foi possível confirmar o saldo agora. Tente novamente.");
    return;
  }

  const grupos = {};
  carrinho.forEach(i => {
    const k = String(i.obra_id || "SEM_ORIGEM");
    if(!grupos[k]) grupos[k] = [];
    grupos[k].push(i);
  });

  /* =========================================================
     OFFLINE: guarda solicitação inteira
  ========================================================= */
  if(!(await bdrExpOnlineReal())){
    if(typeof salvarOffline !== "function") throw new Error("offlineQueue.js não carregado. Não foi possível salvar solicitação offline.");
    await salvarOffline("nova_solicitacao", "pedidos_retirada", {
      grupos,
      solicitante:u?.nome || "Usuário",
      obraDestinoId:obraDestinoIdUsuario,
      obraNome:nomeObra(obraDestinoIdUsuario),
      observacao:valor("obsSolicitacao") || "Solicitação criada offline."
    });

    limparCarrinhoExpedicaoSalvo();
    if(document.getElementById("obsSolicitacao")) document.getElementById("obsSolicitacao").value = "";
    renderizarCarrinho();

    marcarExpPendente("nova_solicitacao_" + Date.now(), "⏳ Solicitação salva offline • aguardando internet");
    alert("📦 Sem internet. Solicitação salva no aparelho e será enviada quando a internet voltar.");
    return;
  }

  for(const origemId of Object.keys(grupos)){
    const itens=grupos[origemId];
    const codigo="EXP-"+new Date().getFullYear()+"-"+String(Date.now()).slice(-6)+"-"+Math.floor(Math.random()*99);
    const obraDestinoId = obraDestinoIdUsuario;

    const pedido = {
      codigo,
      status:"SOLICITADO",
      solicitante:u?.nome||"Usuário",
      usuario_criacao:u?.nome||"Usuário",
      obra_id:obraDestinoId,
      obra_destino_id:obraDestinoId,
      obra_nome:nomeObra(obraDestinoId),
      obra_origem_id:origemId==="SEM_ORIGEM"?null:Number(origemId),
      observacao:valor("obsSolicitacao") || "Solicitação criada pelo catálogo interno."
    };

    const r=await db().from("pedidos_retirada").insert([pedido]).select().single();
    if(r.error){ alert("Erro ao criar solicitação: "+r.error.message); return; }

    const itensPayload=itens.map(i=>({
      pedido_id:r.data.id,
      patrimonio_id:i.patrimonio_id || (i.origem_tabela==="patrimonio"?i.id:null),
      produto_id:i.produto_id || (i.origem_tabela==="estoque_produtos"?i.id:null),
      patrimonio_codigo:i.codigo,
      patrimonio_nome:i.nome,
      endereco_codigo:i.localizacao,
      obra_origem_id:i.obra_id || null,
      obra_destino_id:obraDestinoId,
      status:i.tipo_solicitacao==="INTERESSE"?"INTERESSE":"PENDENTE",
      quantidade:Number(i.quantidade_solicitada || 1)
    }));

    const ri=await db().from("itens_retirada").insert(itensPayload);
    if(ri.error){ alert("Pedido criado, mas erro nos itens: "+ri.error.message); return; }

    // ATLAS SPRINT 2.3: a tela cria o pedido, mas quem registra histórico,
    // movimentação e notificação oficial é o AtlasWorkflow.
    if(window.AtlasWorkflow && typeof AtlasWorkflow.notificarOrigemPedidoCriado === "function"){
      try{
        await AtlasWorkflow.notificarOrigemPedidoCriado(r.data.id);
      }catch(e){
        console.warn("AtlasWorkflow: falha ao notificar origem:", e?.message || e);
      }
    }else{
      await hist(r.data.id,null,"SOLICITADO",`Solicitação criada por ${u?.nome||"Usuário"}.`);
      await notificarGestao("Nova solicitação de expedição", `${u?.nome||"Usuário"} solicitou ${itens.length} item(ns) de ${nomeObra(origemId)}.`, "expedicao.html?aba=solicitacoes");
    }
  }

  limparCarrinhoExpedicaoSalvo();
  sincronizarCarrinhoExpedicao();
  if(document.getElementById("obsSolicitacao")) document.getElementById("obsSolicitacao").value="";
  renderizarCarrinho();
  renderizarCatalogo();
  fecharModalCarrinho();
  atlasToast("✅ Solicitação enviada com sucesso.");
  await carregarTudo();
}
async function hist(pedidoId, anterior, novo, obs){ try{ const u=usuarioAtual(); await db().from("historico_pedidos_retirada").insert([{pedido_id:pedidoId,status_anterior:anterior,status_novo:novo,usuario:u?.nome||"Sistema",observacao:obs}]); }catch(e){} }
async function notificarGestao(titulo,mensagem,link){
  try{
    const us=await db().from("usuarios_sistema").select("usuario,nome,permissoes").ilike("permissoes","%RECEBER_NOTIFICACOES_GESTAO%");
    const rows=(us.data||[]).map(u=>({titulo,mensagem,modulo:"EXPEDICAO",usuario_destino:u.usuario,link,lida:false,criado_em:new Date().toISOString()}));
    if(rows.length) await db().from("bdr_notificacoes").insert(rows);
  }catch(e){ console.warn("Notificação gestão não enviada:",e.message); }
}
function renderizarPedidos(){
  const por = s => pedidos.filter(p=>p.status===s);
  lista("listaSolicitacoes", por("AGUARDANDO_AUTORIZACAO")); lista("listaSeparacao", por("EM_SEPARACAO")); lista("listaRetirada", por("AGUARDANDO_RETIRADA")); lista("listaTransito", por("EM_TRANSITO")); lista("listaHistorico", pedidos.filter(p=>["ENTREGUE","NEGADO","RECEBIDO_COM_DIVERGENCIA"].includes(p.status)));
}
function lista(id, arr){ const el=document.getElementById(id); if(!el) return; if(!arr.length){ el.innerHTML=`<div class="cart-empty">Nenhum registro encontrado.</div>`; return; } el.innerHTML=arr.map(p=>pedidoHTML(p)).join(""); }
function pedidoHTML(p){ const itens=p.itens_retirada||[]; return `<div class="pedido-card"><div class="pedido-top"><div class="pedido-cod">${esc(p.codigo||"PED-"+p.id)}</div><div><b>${esc(p.obra_nome||"-")}</b><div class="pedido-small">Solicitante: ${esc(p.solicitante||"-")} • Origem: ${esc(nomeObra(p.obra_origem_id))}</div></div><div><span class="badge-status ${statusClass(p.status)}">${esc(p.status)}</span><div class="pedido-small">${itens.length} item(ns)</div></div><div class="pedido-actions">${acoesPedido(p)}</div></div></div>`; }
function acoesPedido(p){ if(p.status==="AGUARDANDO_AUTORIZACAO"&&podeAlmoxarife()) return `<button class="btn-mini btn-ok" onclick="autorizar(${p.id})">Aprovar</button><button class="btn-mini btn-red" onclick="negar(${p.id})">Negar</button>`; if(p.status==="EM_SEPARACAO"&&podeAlmoxarife()) return `<button class="btn-mini btn-ok" onclick="reservar(${p.id})">Reservar</button>`; if(p.status==="AGUARDANDO_RETIRADA"&&podeAlmoxarife()) return `<button class="btn-mini btn-ok" onclick="abrirRetirada(${p.id})">Retirada</button>`; return `<button class="btn-mini btn-blue" onclick="alert('Detalhes em evolução')">Detalhes</button>`; }
async function autorizar(id){
  const payload = {status:"EM_SEPARACAO"};

  if(!(await bdrExpOnlineReal())){
    await salvarOffline("acao_pedido", "pedidos_retirada", {
      id,
      payload,
      historico:{
        pedido_id:id,
        status_anterior:"AGUARDANDO_AUTORIZACAO",
        status_novo:"EM_SEPARACAO",
        usuario:usuarioAtual()?.nome || "Sistema",
        observacao:"Solicitação aprovada offline."
      }
    });
    alert("📦 Aprovação salva offline.");
    return;
  }

  await db().from("pedidos_retirada").update(payload).eq("id",id);
  await hist(id,"AGUARDANDO_AUTORIZACAO","EM_SEPARACAO","Solicitação aprovada.");
  await carregarTudo();
}
async function negar(id){
  const motivo=prompt("Motivo da negativa:")||"Negado";
  const payload = {status:"NEGADO", motivo_recusa:motivo};

  if(!(await bdrExpOnlineReal())){
    await salvarOffline("acao_pedido", "pedidos_retirada", {
      id,
      payload,
      historico:{
        pedido_id:id,
        status_anterior:"AGUARDANDO_AUTORIZACAO",
        status_novo:"NEGADO",
        usuario:usuarioAtual()?.nome || "Sistema",
        observacao:motivo
      }
    });
    alert("📦 Negativa salva offline.");
    return;
  }

  await db().from("pedidos_retirada").update(payload).eq("id",id);
  await hist(id,"AGUARDANDO_AUTORIZACAO","NEGADO",motivo);
  await carregarTudo();
}

async function iniciarSeparacaoAtlas(id){
  try{
    document.querySelectorAll(`button[onclick*="${id}"]`).forEach(btn => { btn.disabled = true; btn.innerText = "Iniciando..."; });
    if(window.AtlasWorkflow?.iniciarSeparacao){
      await window.AtlasWorkflow.iniciarSeparacao(id);
    }else{
      await db().from("pedidos_retirada").update({status:"EM_SEPARACAO"}).eq("id",id);
      await hist(id,"RESERVADO","EM_SEPARACAO","Separação iniciada pelo almoxarifado.");
    }
    fecharModalDetalhe?.();
    await carregarTudo();
    if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
  }catch(e){
    alert("Erro ao iniciar separação: " + (e?.message || e));
  }
}
window.iniciarSeparacaoAtlas = iniciarSeparacaoAtlas;

async function reservar(id){
  if(!(await bdrExpOnlineReal())){
    await salvarOffline("acao_pedido", "pedidos_retirada", {
      id,
      payload:{status:"AGUARDANDO_RETIRADA"},
      itensPayload:{status:"RESERVADO"},
      historico:{
        pedido_id:id,
        status_anterior:"EM_SEPARACAO",
        status_novo:"AGUARDANDO_RETIRADA",
        usuario:usuarioAtual()?.nome || "Sistema",
        observacao:"Itens reservados offline e aguardando retirada."
      }
    });
    alert("📦 Reserva salva offline.");
    return;
  }

  await db().from("pedidos_retirada").update({status:"AGUARDANDO_RETIRADA"}).eq("id",id);
  await db().from("itens_retirada").update({status:"RESERVADO"}).eq("pedido_id",id);
  await hist(id,"EM_SEPARACAO","AGUARDANDO_RETIRADA","Itens separados e aguardando retirada/transporte.");
  await carregarTudo();
}
function abrirRetirada(id){ pedidoRetiradaAtual=id; document.getElementById("modalRetirada").classList.add("ativo"); }
function fecharModalRetirada(){ document.getElementById("modalRetirada").classList.remove("ativo"); pedidoRetiradaAtual=null; }
async function confirmarRetiradaModal(){
  const id=pedidoRetiradaAtual;
  if(!id) return;

  if(!valor("retMotorista")){
    alert("Informe o motorista/responsável.");
    return;
  }

  const payload = {
    status:"EM_TRANSITO",
    motorista_nome:valor("retMotorista"),
    veiculo_placa:valor("retPlaca"),
    transportadora:valor("retVeiculo"),
    data_saida_cd:new Date().toISOString(),
    usuario_saida_cd:usuarioAtual()?.nome||"Usuário"
  };

  const obs = `Retirado por ${valor("retMotorista")} • ${valor("retPlaca")}`;

  if(!(await bdrExpOnlineReal())){
    await salvarOffline("acao_pedido", "pedidos_retirada", {
      id,
      payload,
      historico:{
        pedido_id:id,
        status_anterior:"AGUARDANDO_RETIRADA",
        status_novo:"EM_TRANSITO",
        usuario:usuarioAtual()?.nome || "Sistema",
        observacao:obs
      }
    });
    fecharModalRetirada();
    alert("📦 Retirada salva offline.");
    return;
  }

  await db().from("pedidos_retirada").update(payload).eq("id",id);
  await hist(id,"AGUARDANDO_RETIRADA","EM_TRANSITO",obs);
  fecharModalRetirada();
  await carregarTudo();
}

/* =========================================================
   ATLAS 3.1.12 - SELETOR DE QUANTIDADE ANTES DO CARRINHO
========================================================= */
function normalizarQtdEscolhidaAtlas(item, valor){
  const max = atlasQtdMaximaItem(item);
  let qtd = Number(String(valor ?? 1).replace(",", "."));

  if(!Number.isFinite(qtd) || qtd < 1) qtd = 1;
  if(qtd > max) qtd = max;

  return qtd;
}

function ajustarQtdDetalheAtlas(delta){
  const input = document.getElementById("atlasQtdDetalhe");
  if(!input) return;

  const origem = input.dataset.origem;
  const id = Number(input.dataset.id);
  const item = buscarItem(origem, id);
  if(!item) return;

  const atual = Number(input.value || 1);
  input.value = normalizarQtdEscolhidaAtlas(item, atual + Number(delta || 0));
}

function adicionarDetalheAoCarrinhoAtlas(origem,id){
  const item = buscarItem(origem,id);
  if(!item) return;

  if(itemEstaNoCarrinho(item)){
    fecharModalDetalhe();
    abrirModalCarrinho();
    return;
  }

  if(atlasMesmaObraOrigemDestino(item)){
    atlasToast("ℹ Este item já pertence à sua obra/setor.");
    return;
  }

  const disponivel = atlasQtdMaximaItem(item);
  if(disponivel <= 0 || normalStatus(item.status) === "INDISPONIVEL"){
    atlasToast("🔒 Indisponível<br><small>Não há quantidade disponível para solicitar.</small>");
    return;
  }

  let qtd = 1;
  if(item.origem_tabela === "estoque_produtos" && !item.patrimonio_id){
    const input = document.getElementById("atlasQtdDetalhe");
    qtd = normalizarQtdEscolhidaAtlas(item, input?.value || 1);
  }

  carrinho.push({
    ...item,
    tipo_solicitacao:"RETIRADA",
    quantidade_solicitada:qtd
  });

  sincronizarCarrinhoExpedicao();
  renderizarCarrinho();
  renderizarCatalogo();
  animarBotaoItem(item.origem_tabela,item.id);
  animarCarrinhoTopo();
  fecharModalDetalhe();

  atlasToast(
    "✔ Adicionado ao carrinho<br><small>" +
    esc(item.nome || item.descricao || "Item") +
    " • Qtd: " + qtd + "</small>"
  );
}

window.normalizarQtdEscolhidaAtlas = normalizarQtdEscolhidaAtlas;
window.ajustarQtdDetalheAtlas = ajustarQtdDetalheAtlas;
window.adicionarDetalheAoCarrinhoAtlas = adicionarDetalheAoCarrinhoAtlas;

function abrirDetalhe(origem,id){
  const i = buscarItem(origem,id);
  if(!i) return;

  const ehPatrimonio = !!i.patrimonio_id || i.origem_tabela === "patrimonio";
  const total = ehPatrimonio ? 1 : Number(i.qtd_total ?? i.quantidade ?? i.qtd ?? 0);
  const reservado = ehPatrimonio ? Number(i.qtd_reservada || 0) : Number(i.qtd_reservada || 0);
  const disponivel = ehPatrimonio
    ? Number(i.qtd_disponivel ?? (normalStatus(i.status) === "ESTOQUE" ? 1 : 0))
    : Number(i.qtd_disponivel ?? i.qtd ?? 0);

  const semDisponibilidade = disponivel <= 0 || normalStatus(i.status) === "INDISPONIVEL";
  const jaNoCarrinho = itemEstaNoCarrinho(i);

  const seletorQtd = (!ehPatrimonio && !semDisponibilidade)
    ? `
      <div style="margin-top:14px;padding:13px;border:1px solid #dbeafe;background:#eff6ff;border-radius:14px">
        <div style="font-size:12px;font-weight:950;color:#1e3a8a;margin-bottom:8px">
          Escolha a quantidade
        </div>

        <div style="display:flex;align-items:center;gap:9px">
          <button
            type="button"
            onclick="ajustarQtdDetalheAtlas(-1)"
            style="width:40px;height:40px;border:1px solid #bfdbfe;border-radius:11px;background:#fff;color:#1d4ed8;font-size:21px;font-weight:950;cursor:pointer"
          >−</button>

          <input
            id="atlasQtdDetalhe"
            data-origem="${esc(i.origem_tabela)}"
            data-id="${Number(i.id)}"
            type="number"
            min="1"
            max="${disponivel}"
            step="1"
            value="1"
            oninput="this.value=normalizarQtdEscolhidaAtlas(buscarItem(this.dataset.origem,Number(this.dataset.id)),this.value)"
            style="width:90px;height:42px;border:1px solid #93c5fd;border-radius:11px;padding:0 10px;text-align:center;font-size:18px;font-weight:950;color:#0f172a"
          >

          <button
            type="button"
            onclick="ajustarQtdDetalheAtlas(1)"
            style="width:40px;height:40px;border:1px solid #bfdbfe;border-radius:11px;background:#fff;color:#1d4ed8;font-size:21px;font-weight:950;cursor:pointer"
          >+</button>

          <span style="font-size:11px;font-weight:900;color:#475569">
            de ${disponivel} disponíveis
          </span>
        </div>
      </div>`
    : "";

  const resumoSaldo = ehPatrimonio
    ? `<div class="det-line"><b>Disponibilidade:</b> ${disponivel > 0 ? "1 disponível" : "Indisponível"}</div>`
    : `
      <div class="det-line"><b>Quantidade total:</b> ${total}</div>
      <div class="det-line"><b>Reservado:</b> ${reservado}</div>
      <div class="det-line"><b>Disponível:</b> ${disponivel}</div>`;

  let acaoHtml = "";
  if(jaNoCarrinho){
    acaoHtml = `<button class="btn-ok" onclick="fecharModalDetalhe();abrirModalCarrinho()">Ver no carrinho</button>`;
  }else if(semDisponibilidade){
    acaoHtml = `<button class="btn-ok" style="background:#94a3b8;cursor:not-allowed" disabled>Indisponível</button>`;
  }else if(normalStatus(i.status) === "ESTOQUE"){
    acaoHtml = `<button class="btn-ok" onclick="adicionarDetalheAoCarrinhoAtlas('${i.origem_tabela}',${i.id})">Adicionar ao carrinho</button>`;
  }else if(normalStatus(i.status) === "EM_USO"){
    acaoHtml = `<button class="btn-ok" onclick="acaoItem('${i.origem_tabela}',${i.id});fecharModalDetalhe()">Registrar interesse</button>`;
  }

  document.getElementById("modalTitulo").innerText = i.nome;
  document.getElementById("modalConteudo").innerHTML = `
    <div class="modal-grid">
      <div class="modal-img">
        ${fotoItem(i)
          ? `<img src="${esc(fotoItem(i))}">`
          : `<div style="font-size:70px">${placeholderIcon(i)}</div>`
        }
      </div>

      <div>
        <div class="det-line"><b>Código:</b> ${esc(i.codigo||"-")}</div>
        <div class="det-line"><b>Obra atual:</b> ${esc(nomeObra(i.obra_id))}</div>
        <div class="det-line"><b>Status:</b> <span class="badge-status ${statusClass(normalStatus(i.status))}">${rotStatus(i.status)}</span></div>
        ${resumoSaldo}
        <div class="det-line"><b>Localização:</b> ${esc(i.localizacao||"-")}</div>
        <div class="det-line"><b>Marca/Modelo:</b> ${esc(i.marca||"-")} / ${esc(i.modelo||"-")}</div>
        <div class="det-line"><b>Estado:</b> ${esc(i.estado||"-")}</div>

        ${seletorQtd}

        <br>
        ${acaoHtml}
      </div>
    </div>`;

  document.getElementById("modalDetalhe").classList.add("ativo");
}
function fecharModalDetalhe(){ document.getElementById("modalDetalhe").classList.remove("ativo"); }


window.carregarTudo = carregarTudo;
window.BDRExpedicao = {
  carregarTudo,
  iniciar: bdrExpedicaoIniciarSeguro,
  get itensCatalogo(){ return itensCatalogo; },
  get pedidos(){ return pedidos; },
  get obras(){ return obras; },
  get carrinho(){ return carrinho; }
};

function bdrExpedicaoIniciarSeguro(){
  // Entrega o primeiro frame ao navegador e inicia os dados logo em seguida.
  requestAnimationFrame(() => {
    carregarTudo().catch(e => console.warn("BDR Expedição: falha ao carregar:", e?.message || e));
  });
}

/*
  A inicialização dos dados é coordenada por expedicaoBoot.js.
  Isso garante que aprovação, solicitações, logística, fiscal e
  permissões já estejam registrados antes da primeira consulta.
*/

window.addEventListener("online", async () => {
  try{ window.bdrResetOnlineReal?.(); }catch(e){}
  await carregarTudo();
});



/* =========================================================
   BDR ESC GLOBAL
   ESC fecha modal, usuário e notificações.
========================================================= */
document.addEventListener("keydown", function(e){
  if(e.key !== "Escape") return;

  document.querySelectorAll(
    ".modal-bg.ativo, .modal.ativo, .dropdown-user.ativo, .notif-dropdown.ativo"
  ).forEach(function(el){
    el.classList.remove("ativo");
  });
});



/* =========================================================
   ATLAS 3.1.10.1 - QUANTIDADE GLOBAL ENTRE MÓDULOS
   Corrige badgeQuantidadeAtlas indisponível no modal Separação.
========================================================= */
function quantidadeItemAtlasGlobal(i){
  const qtd = Number(i?.quantidade || i?.quantidade_solicitada || 1);
  return Number.isFinite(qtd) && qtd > 0 ? qtd : 1;
}

function badgeQuantidadeAtlasGlobal(i){
  return `<span style="
    display:inline-flex;
    align-items:center;
    gap:5px;
    margin-top:6px;
    padding:5px 9px;
    border-radius:999px;
    background:#dbeafe;
    color:#1d4ed8;
    font-size:11px;
    font-weight:950;
    white-space:nowrap;
  ">📦 Qtd solicitada: ${quantidadeItemAtlasGlobal(i)}</span>`;
}

window.quantidadeItemAtlasGlobal = quantidadeItemAtlasGlobal;
window.badgeQuantidadeAtlasGlobal = badgeQuantidadeAtlasGlobal;

window.badgeQuantidadeAtlas = window.badgeQuantidadeAtlas || badgeQuantidadeAtlasGlobal;
window.quantidadeItemAtlas = window.quantidadeItemAtlas || quantidadeItemAtlasGlobal;


/* =========================================================
   CATÁLOGO — FILTROS E PAGINAÇÃO
   A fonte oficial é a paginação real do Supabase implementada
   no fluxo principal e em expedicaoCatalogo.js.
========================================================= */
