/* ATLAS EXPEDIÇÃO 3.6.0 - NOTIFICAÇÃO SEGURA + ATLAS AUDIO V3 */
/* =========================================================
   ATUALIZADO: EXPEDIÇÃO COM OFFLINE BDR
========================================================= */
/* =========================================================
   BDR ERP - EXPEDIÇÃO MARKETPLACE INTERNO
   Catálogo compacto + carrinho + aprovação + reserva + retirada
========================================================= */
var itensCatalogo = window.itensCatalogo || [];
var carrinho = window.carrinho || [];
window.carrinho = carrinho;
var pedidos = window.pedidos || [];
var obras = window.obras || [];
var filtroAtual = window.filtroAtual || "TODOS";
var pedidoRetiradaAtual = window.pedidoRetiradaAtual || null;

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
   ATLAS AUDIO V3 — MÉTODOS OFICIAIS DA EXPEDIÇÃO
========================================================= */
function atlasAudioScannerOK(){
  try{ return window.AtlasAudio?.scannerOK?.() || false; }catch(e){ return false; }
}
function atlasAudioScannerErro(){
  try{ return window.AtlasAudio?.scannerErro?.() || false; }catch(e){ return false; }
}
function atlasAudioConcluido(){
  try{ return window.AtlasAudio?.concluido?.() || false; }catch(e){ return false; }
}

window.atlasAudioScannerOK = atlasAudioScannerOK;
window.atlasAudioScannerErro = atlasAudioScannerErro;
window.atlasAudioConcluido = atlasAudioConcluido;

/* =========================================================
   NOTIFICAÇÃO SEGURA DE PEDIDO CRIADO
   - Prioriza o AtlasWorkflow.
   - Se o Workflow não estiver disponível ou retornar 0, usa o
     AtlasGestorNotificacoes diretamente.
   - Nunca deixa o pedido ser criado sem tentar notificar.
========================================================= */
async function atlasNotificarPedidoCriadoSeguro(pedido, itens){
  const pedidoId = pedido?.id;
  if(!pedidoId) return {ok:false, notificacoes:0, motivo:"Pedido sem ID."};

  let resultado = null;

  if(window.AtlasWorkflow && typeof window.AtlasWorkflow.notificarOrigemPedidoCriado === "function"){
    try{
      resultado = await window.AtlasWorkflow.notificarOrigemPedidoCriado(pedidoId);
      if(Number(resultado?.notificacoes || 0) > 0) return resultado;
    }catch(e){
      console.warn("Atlas Expedição: Workflow não notificou o pedido.", e?.message || e);
    }
  }

  if(window.AtlasGestorNotificacoes && typeof window.AtlasGestorNotificacoes.notificarPedidoCriado === "function"){
    try{
      const direto = await window.AtlasGestorNotificacoes.notificarPedidoCriado(pedido, itens || []);
      if(Number(direto?.notificacoes || 0) > 0) return direto;
      resultado = direto || resultado;
    }catch(e){
      console.warn("Atlas Expedição: Gestor não notificou o pedido.", e?.message || e);
    }
  }

  console.warn("Atlas Expedição: pedido criado sem destinatário de notificação.", {
    pedido_id:pedidoId,
    codigo:pedido?.codigo,
    resultado
  });

  return resultado || {ok:false, notificacoes:0, motivo:"Nenhum destinatário encontrado."};
}

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
function podeTudo(){ return ["MASTER","ADMIN"].includes(perfil()) || perms().includes("VER_TODAS_OBRAS"); }
function podeVerOutras(){ return podeTudo() || perms().includes("VER_ESTOQUE_OUTRAS_OBRAS"); }
function podeSolicitarOutras(){ return podeTudo() || perms().includes("SOLICITAR_OUTRAS_OBRAS"); }
function podeAlmoxarife(){ return ["MASTER","ADMIN","ALMOXARIFE","ALMOXARIFADO"].includes(perfil()); }
function dataBR(d){ if(!d) return "-"; const x=new Date(String(d).replace(" ","T")); return isNaN(x.getTime()) ? String(d) : x.toLocaleString("pt-BR"); }
function normalStatus(s){ s = String(s || "").toUpperCase().replaceAll(" ","_"); if(["DISPONIVEL","NO_ESTOQUE"].includes(s)) return "ESTOQUE"; return s; }
function rotStatus(s){ const m={ESTOQUE:"DISPONÍVEL",DISPONIVEL:"DISPONÍVEL",NO_ESTOQUE:"DISPONÍVEL",EM_USO:"EM USO",MANUTENCAO:"MANUTENÇÃO",BAIXADO:"BAIXADO",QUEBRADO:"QUEBRADO",RESERVADO:"RESERVADO",INDISPONIVEL:"INDISPONÍVEL"}; return m[String(s||"").toUpperCase().replaceAll(" ","_")] || s || "-"; }
function statusClass(s){ return "st-" + String(s || "").toUpperCase().replaceAll(" ","_"); }
function nomeObra(id){ const o=obras.find(x=>String(x.id)===String(id)); return o ? `${o.codigo_obra || "-"} - ${o.nome || "-"}` : "Sem obra"; }
function obraCurta(id, fallback){ const txt = fallback || nomeObra(id); return txt.replace(/^\d+\s*-\s*/,'').slice(0,28); }
function fotoItem(i){ return i.foto_url || i.imagem_url || ""; }
function placeholderIcon(i){ const t = `${i.nome || i.descricao || ""}`.toLowerCase(); if(t.includes("furadeira")||t.includes("parafusadeira")) return "🔩"; if(t.includes("notebook")||t.includes("computador")) return "💻"; if(t.includes("impressora")) return "🖨️"; if(t.includes("solda")) return "⚡"; if(t.includes("capacete")) return "⛑️"; if(t.includes("cadeira")) return "🪑"; return "📦"; }
function carregarTopo(){ const u=usuarioAtual(); document.getElementById("usuarioNome").innerText = u ? "Olá, " + (u.nome || "usuário") : "Olá, usuário"; document.getElementById("usuarioPerfil").innerText = u ? (u.perfil || "-") : "-"; }
/* =========================================================
   TOPBAR OFICIAL ATLAS
   Controlada exclusivamente por JS/atlasTopbar.js.
========================================================= */

function abrirAba(nome, btn){ document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active")); document.getElementById("tab-"+nome)?.classList.add("active"); document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active")); btn?.classList.add("active"); renderizarPedidos(); }
function filtrarStatus(st, btn){ filtroAtual = st; document.querySelectorAll(".chip-exp").forEach(b=>b.classList.remove("active")); btn?.classList.add("active"); renderizarCatalogo(); }

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
      void 0;
      return;
    }

    alert("Sem internet e sem cache da expedição. Abra uma vez com internet.");
    return;
  }

  try{
    const ob = await db().from("obras").select("*").eq("ativa",true).order("nome");
    obras = ob.data || [];
    await Promise.all([carregarCatalogo(), carregarPedidos()]);
    salvarCacheExpedicao();
    window.itensCatalogo = itensCatalogo;
    window.pedidos = pedidos;
    window.obras = obras;
    renderizarTudo();
  }catch(e){
    if(bdrExpErroInternet(e)){
      const cache = carregarCacheExpedicao();
      if(cache){
        itensCatalogo = cache.itensCatalogo || [];
        pedidos = cache.pedidos || [];
        obras = cache.obras || [];
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

async function carregarCatalogo(){
  const u = usuarioAtual();
  let lista = [];

  const pat = await db().from("patrimonio").select("*").in("status",["ESTOQUE","NO ESTOQUE","DISPONIVEL","EM_USO","MANUTENCAO","RESERVADO"]).order("id",{ascending:false}).limit(1000);
  if(!pat.error){
    lista.push(...(pat.data || []).map(p=>({
      origem_tabela:"patrimonio", id:p.id, codigo:p.codigo_qr, nome:p.nome_bem || "Patrimônio", descricao:p.nome_bem || "Patrimônio", tipo:"PATRIMONIO",
      status:normalStatus(p.status), qtd:1, obra_id:p.obra_id, empresa_id:p.empresa_id, obra_nome:p.localizacao || nomeObra(p.obra_id),
      localizacao:p.localizacao_fisica || p.endereco_codigo || p.localizacao || "-", marca:p.marca, modelo:p.modelo, valor:p.valor_bem, foto_url:p.foto_url,
      estado:p.estado_conservacao || "-", patrimonio_id:p.id, raw:p
    })));
  }

  const est = await db().from("estoque_produtos").select("*").in("status",["DISPONIVEL","ESTOQUE","NO ESTOQUE","EM_USO","MANUTENCAO","RESERVADO"]).order("id",{ascending:false}).limit(1000);
  if(!est.error){
    lista.push(...(est.data || []).map(p=>({
      origem_tabela:"estoque_produtos", id:p.id, codigo:p.codigo, nome:p.descricao || p.produto || "Produto", descricao:p.descricao || p.produto || "Produto", tipo:p.tipo_controle || "CONSUMO",
      status:normalStatus(p.status), qtd:Number(p.quantidade || p.qtd || 0), obra_id:p.obra_id, empresa_id:p.empresa_id, obra_nome:nomeObra(p.obra_id),
      localizacao:p.localizacao_fisica || [p.rua,p.prateleira,p.coluna,p.nivel].filter(Boolean).join("-") || "-", marca:p.marca, modelo:p.modelo, valor:p.valor_unitario, foto_url:p.foto_url,
      estado:p.estado_material || p.condicao || "-", produto_id:p.id, patrimonio_id:p.patrimonio_id, raw:p
    })));
  }

  if(!podeVerOutras()){
    const minhaObra = String(u?.obra_id || "");
    lista = lista.filter(i => ["", minhaObra].includes(String(i.obra_id || "")) || String(i.obra_id || "") === "1" || String(i.obra_nome||"").toUpperCase().includes("CD"));
  }

  // Atlas 2.8.1: antes de renderizar, recalcula disponibilidade real.
  lista = await aplicarReservasNoCatalogoAtlas(lista);

  itensCatalogo = lista.filter(i => !["BAIXADO","QUEBRADO"].includes(normalStatus(i.status)));
  atualizarKPIs();
}

async function carregarPedidos(){
  const r = await db().from("pedidos_retirada").select("*").order("id",{ascending:false}).limit(300);
  if(r.error){ console.warn("Erro pedidos:", r.error.message); pedidos=[]; return; }
  pedidos = r.data || [];
  const ids = pedidos.map(p=>p.id);
  if(ids.length){
    const it = await db().from("itens_retirada").select("*").in("pedido_id", ids);
    const itens = it.data || [];
    pedidos = pedidos.map(p=>({...p, itens_retirada: itens.filter(i=>String(i.pedido_id)===String(p.id))}));
  }
}

function atualizarKPIs(){
  const c = s => itensCatalogo.filter(i=>normalStatus(i.status)===s).length;
  document.getElementById("kpiTotal").innerText = itensCatalogo.length;
  document.getElementById("kpiEstoque").innerText = c("ESTOQUE");
  document.getElementById("kpiUso").innerText = c("EM_USO");
  document.getElementById("kpiManutencao").innerText = c("MANUTENCAO");
  document.getElementById("kpiReservado").innerText = c("RESERVADO");
  document.getElementById("kpiPedidos").innerText = pedidos.length;
  document.getElementById("chipTodos").innerText = itensCatalogo.length;
  document.getElementById("chipEstoque").innerText = c("ESTOQUE");
  document.getElementById("chipUso").innerText = c("EM_USO");
  document.getElementById("chipManutencao").innerText = c("MANUTENCAO");
  document.getElementById("chipReservado").innerText = c("RESERVADO");
}

function renderizarTudo(){ atualizarKPIs(); renderizarCatalogo(); renderizarCarrinho(); renderizarPedidos(); }
function renderizarCatalogo(){
  const grid = document.getElementById("catalogoGrid");
  const busca = valor("buscaCatalogo").toLowerCase();
  let lista = itensCatalogo.filter(i=>{
    const texto = `${i.codigo||""} ${i.nome||""} ${i.descricao||""} ${i.marca||""} ${i.modelo||""} ${i.obra_nome||""} ${i.localizacao||""}`.toLowerCase();
    const st = normalStatus(i.status);
    return texto.includes(busca) && (filtroAtual === "TODOS" || st === filtroAtual);
  });
  if(!lista.length){ grid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1">Nenhum item encontrado.</div>`; return; }
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
  `;
  document.head.appendChild(css);
}


function atlasToast(msg){
  try{
    const texto=String(msg||"")
      .replace(/<br\s*\/?>/gi," ")
      .replace(/<[^>]+>/g,"")
      .replace(/\s+/g," ")
      .trim();
    const host=(window.parent && window.parent!==window) ? window.parent : window;
    const feedback=host.AtlasFeedback || window.AtlasFeedback;
    if(feedback){
      if(/erro|indisponível|bloque/i.test(texto)) return feedback.erro(texto,2200);
      if(/⚠|confira|não foi possível/i.test(texto)) return feedback.aviso(texto,2200);
      if(/✔|✅|sucesso|adicionado|removido/i.test(texto)) return feedback.sucesso(texto,2200);
      return feedback.info(texto,2200);
    }
    alert(texto);
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
  carrinho.push({...item, tipo_solicitacao:"RETIRADA", quantidade_solicitada:1});
  sincronizarCarrinhoExpedicao();
  renderizarCarrinho();
  renderizarCatalogo();
  animarBotaoItem(item.origem_tabela,item.id);
  animarCarrinhoTopo();
  atlasToast("✔ Adicionado ao carrinho<br><small>" + esc(item.nome || item.descricao || "Item") + "</small>");
}
function addInteresse(item){
  if(itemEstaNoCarrinho(item)) return;
  carrinho.push({...item, tipo_solicitacao:"INTERESSE", quantidade_solicitada:1});
  sincronizarCarrinhoExpedicao();
  renderizarCarrinho();
  renderizarCatalogo();
  animarBotaoItem(item.origem_tabela,item.id);
  animarCarrinhoTopo();
  atlasToast("✔ Adicionado ao carrinho<br><small>" + esc(item.nome || item.descricao || "Item") + "</small>");
}
function removerCarrinho(origem,id){
  carrinho = carrinho.filter(c=>!(c.origem_tabela===origem && Number(c.id)===Number(id)));
  sincronizarCarrinhoExpedicao();
  renderizarCarrinho();
  renderizarCatalogo();
  animarCarrinhoTopo();
  atlasToast("↩ Removido do carrinho");
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

    // A notificação oficial é obrigatória após gravar pedido e itens.
    // O helper tenta Workflow e, se necessário, o Gestor diretamente.
    const resultadoNotificacao = await atlasNotificarPedidoCriadoSeguro(r.data, itensPayload);

    if(Number(resultadoNotificacao?.notificacoes || 0) === 0){
      await hist(
        r.data.id,
        null,
        "SOLICITADO",
        "Pedido criado, porém nenhum aprovador habilitado recebeu notificação. " +
        (resultadoNotificacao?.motivo || "Verifique permissões e obra de origem.")
      );
    }
  }

  limparCarrinhoExpedicaoSalvo();
  sincronizarCarrinhoExpedicao();
  if(document.getElementById("obsSolicitacao")) document.getElementById("obsSolicitacao").value="";
  renderizarCarrinho();
  renderizarCatalogo();
  fecharModalCarrinho();
  atlasToast("✅ Solicitação enviada com sucesso.");
  atlasAudioConcluido();
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
  get itensCatalogo(){ return itensCatalogo; },
  get pedidos(){ return pedidos; },
  get obras(){ return obras; },
  get carrinho(){ return carrinho; }
};

function bdrExpedicaoIniciarSeguro(){
  setTimeout(() => {
    carregarTudo().catch(e => console.warn("BDR Expedição: falha ao carregar:", e?.message || e));
  }, 100);
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", bdrExpedicaoIniciarSeguro);
}else{
  bdrExpedicaoIniciarSeguro();
}

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
   ATLAS SPRINT 2.3 - APROVAÇÃO PARCIAL POR ITEM
   - Recusar todos
   - Autorizar parcial
   - Autorizar todos
   - Notificação oficial via AtlasWorkflow
========================================================= */
(function(){
  "use strict";

  function isSolicitado(p){
    return ["SOLICITADO","AGUARDANDO_AUTORIZACAO"].includes(String(p?.status || "").toUpperCase());
  }

  function pedidoLocal(id){
    return (window.pedidos || pedidos || []).find(p => Number(p.id) === Number(id));
  }

  function itensDoPedidoLocal(p){
    return Array.isArray(p?.itens_retirada) ? p.itens_retirada : [];
  }

  function quantidadeItemAtlas(i){
    const qtd = Number(i?.quantidade || i?.quantidade_solicitada || 1);
    return Number.isFinite(qtd) && qtd > 0 ? qtd : 1;
  }

  function badgeQuantidadeAtlas(i){
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
    ">📦 Qtd solicitada: ${quantidadeItemAtlas(i)}</span>`;
  }

  function itemTituloAtlas(i){
    return esc(
      i.patrimonio_codigo ||
      i.codigo ||
      i.produto_codigo ||
      (i.produto_id ? "EST-" + i.produto_id : "") ||
      ("ITEM-" + i.id)
    );
  }

  renderizarPedidos = function(){
    const todos = window.pedidos || pedidos || [];
    const solicitados = todos.filter(p => isSolicitado(p));
    lista("listaSolicitacoes", solicitados);
    lista("listaSeparacao", todos.filter(p => ["EM_SEPARACAO"].includes(String(p.status||"").toUpperCase())));
        lista("listaRetirada", todos.filter(p => String(p.status||"").toUpperCase()==="AGUARDANDO_RETIRADA"));
    lista("listaTransito", todos.filter(p => String(p.status||"").toUpperCase()==="EM_TRANSITO"));
    lista("listaHistorico", todos.filter(p => ["RECEBIDO","RECEBIDO_PARCIAL","RECUSADO","CANCELADO","ENTREGUE","NEGADO","RECEBIDO_COM_DIVERGENCIA"].includes(String(p.status||"").toUpperCase())));
  };

  acoesPedido = function(p){
    const st = String(p.status || "").toUpperCase();

    if(isSolicitado(p) && podeAlmoxarife()){
      return `
        <button class="btn-mini btn-red" onclick="recusarTodosAtlas(${p.id})">Recusar todos</button>
        <button class="btn-mini btn-blue" onclick="abrirAprovacaoParcialAtlas(${p.id})">Autorizar parcial</button>
        <button class="btn-mini btn-ok" onclick="autorizarTodosAtlas(${p.id})">Autorizar todos</button>`;
    }


    if(st === "EM_SEPARACAO" && podeAlmoxarife()){
      return `<button class="btn-mini btn-ok" onclick="reservar(${p.id})">Concluir separação</button>`;
    }

    if(st==="AGUARDANDO_RETIRADA" && podeAlmoxarife()){
      return `<button class="btn-mini btn-ok" onclick="abrirRetirada(${p.id})">Retirada</button>`;
    }

    if(st==="EM_TRANSITO"){
      return `<button class="btn-mini btn-blue" onclick="alert('Recebimento pelo destino será a próxima etapa da Sprint.')">Acompanhar</button>`;
    }

    return `<button class="btn-mini btn-blue" onclick="abrirDetalhePedidoAtlas(${p.id})">Detalhes</button>`;
  };

  pedidoHTML = function(p){
    const itens = itensDoPedidoLocal(p);
    const resumoItens = itens.map(i => `${esc(i.patrimonio_codigo || i.patrimonio_nome || 'Item')} • Qtd solicitada: ${quantidadeItemAtlas(i)} • ${esc(i.status || '-')}`).join('<br>');
    return `<div class="pedido-card">
      <div class="pedido-top">
        <div class="pedido-cod">${esc(p.codigo||"PED-"+p.id)}</div>
        <div>
          <b>${esc(p.obra_nome||"-")}</b>
          <div class="pedido-small">Solicitante: ${esc(p.solicitante||"-")} • Origem: ${esc(nomeObra(p.obra_origem_id))}</div>
          <div class="pedido-small" style="margin-top:4px">${resumoItens || 'Sem itens carregados'}</div>
        </div>
        <div><span class="badge-status ${statusClass(p.status)}">${esc(p.status)}</span><div class="pedido-small">${itens.length} item(ns)</div></div>
        <div class="pedido-actions">${acoesPedido(p)}</div>
      </div>
    </div>`;
  };

  function atlasBtnProcessando(pedidoId, texto="Processando..."){
    document.querySelectorAll(`button[onclick*="${pedidoId}"]`).forEach(btn => {
      btn.dataset.txtOriginal = btn.dataset.txtOriginal || btn.innerText;
      btn.innerText = texto;
      btn.disabled = true;
      btn.style.opacity = "0.65";
      btn.style.cursor = "not-allowed";
    });
  }

  function atlasBtnRestaurar(pedidoId){
    document.querySelectorAll(`button[onclick*="${pedidoId}"]`).forEach(btn => {
      btn.innerText = btn.dataset.txtOriginal || btn.innerText;
      btn.disabled = false;
      btn.style.opacity = "";
      btn.style.cursor = "";
    });
  }

  function atlasAtualizarPedidoLocal(pedidoId, status){
    const p = pedidoLocal(pedidoId);
    if(p){ p.status = status; }
    try{ renderizarPedidos(); atualizarKPIs?.(); }catch(e){}
  }

  window.autorizarTodosAtlas = async function(pedidoId){
    if(!window.AtlasWorkflow?.aprovarTodosItensPedido){ alert("AtlasWorkflow Sprint 2.3 não carregado."); return; }
    atlasBtnProcessando(pedidoId, "Processando...");
    atlasAtualizarPedidoLocal(pedidoId, "EM_SEPARACAO");
    try{
      const r = await AtlasWorkflow.aprovarTodosItensPedido(pedidoId);
      atlasAtualizarPedidoLocal(pedidoId, r?.statusPedido || "EM_SEPARACAO");
      fecharModalDetalhe?.();
      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      atlasBtnRestaurar(pedidoId);
      alert("Erro ao autorizar: " + (e?.message || e));
    }
  };

  window.recusarTodosAtlas = async function(pedidoId){
    const motivo = prompt("Motivo para recusar todos os itens:") || "Recusado pela origem.";
    if(!window.AtlasWorkflow?.recusarTodosItensPedido){ alert("AtlasWorkflow Sprint 2.3 não carregado."); return; }
    try{
      await AtlasWorkflow.recusarTodosItensPedido(pedidoId, motivo);
      alert("Pedido recusado. Notificação enviada ao solicitante.");
      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      alert("Erro ao recusar: " + (e?.message || e));
    }
  };


  window.atlasAlternarMotivoRecusa = function(selectEl, itemId){
    const campo = document.getElementById("motivoItem_" + itemId);
    if(!campo) return;

    const recusando = String(selectEl?.value || "").toUpperCase() === "RECUSAR";
    campo.style.display = recusando ? "block" : "none";
    campo.required = recusando;
    if(recusando){
      setTimeout(() => campo.focus(), 30);
    }else{
      campo.value = "";
    }
  };

  window.abrirAprovacaoParcialAtlas = function(pedidoId){
    const p = pedidoLocal(pedidoId);
    if(!p){ alert("Pedido não encontrado na tela. Atualize a página."); return; }
    const itens = itensDoPedidoLocal(p);
    if(!itens.length){ alert("Pedido sem itens carregados."); return; }

    document.getElementById("modalTitulo").innerText = "Autorizar parcial - " + (p.codigo || ("PED-" + p.id));
    document.getElementById("modalConteudo").innerHTML = `
      <div class="info-box" style="margin-top:0">Escolha item por item. O Atlas vai definir o status geral automaticamente: APROVADO, RECUSADO ou APROVADO_PARCIAL.</div>
      <div style="display:grid;gap:10px;margin-top:12px">
        ${itens.map(i => `
          <div style="
            display:grid;
            grid-template-columns:1fr;
            gap:10px;
            padding:13px;
            border:1px solid #e2e8f0;
            border-radius:14px;
            background:#fff;
          ">
            <div style="min-width:0">
              <div style="
                color:#0f172a;
                font-size:14px;
                font-weight:950;
                line-height:1.35;
                white-space:normal;
                overflow-wrap:anywhere;
              ">${esc(i.patrimonio_nome || i.produto_nome || i.descricao || itemTituloAtlas(i))}</div>

              <div style="
                margin-top:5px;
                color:#64748b;
                font-size:11px;
                font-weight:850;
                line-height:1.35;
                overflow-wrap:anywhere;
              ">Código: ${itemTituloAtlas(i)}</div>

              ${badgeQuantidadeAtlasGlobal(i)}
            </div>

            <select
              id="decisaoItem_${i.id}"
              onchange="atlasAlternarMotivoRecusa(this,${i.id})"
              style="
                width:100%;
                height:42px;
                border:1px solid #cbd5e1;
                border-radius:11px;
                padding:0 10px;
                background:#fff;
                color:#0f172a;
                font-weight:950;
                font-size:14px;
              ">
              <option value="APROVAR">✅ Autorizar item</option>
              <option value="RECUSAR">❌ Recusar item</option>
            </select>

            <input
              id="motivoItem_${i.id}"
              placeholder="Informe o motivo da recusa"
              style="
                display:none;
                width:100%;
                min-height:42px;
                border:1px solid #fca5a5;
                border-radius:11px;
                padding:0 10px;
                background:#fff7f7;
                color:#7f1d1d;
                font-size:14px;
                font-weight:750;
              ">
          </div>`).join('')}
      </div>
      <br>
      <button class="btn-ok" onclick="confirmarAprovacaoParcialAtlas(${p.id})">Confirmar seleção</button>
    `;
    document.getElementById("modalDetalhe").classList.add("ativo");
  };

  window.confirmarAprovacaoParcialAtlas = async function(pedidoId){
    const p = pedidoLocal(pedidoId);
    const itens = itensDoPedidoLocal(p);
    const decisoes = itens.map(i => ({
      item_id: i.id,
      acao: document.getElementById("decisaoItem_" + i.id)?.value || "APROVAR",
      motivo: document.getElementById("motivoItem_" + i.id)?.value || ""
    }));

    const recusaSemMotivo = decisoes.find(d =>
      String(d.acao).toUpperCase() === "RECUSAR" &&
      !String(d.motivo || "").trim()
    );

    if(recusaSemMotivo){
      atlasToast("⚠ Informe o motivo do item recusado.");
      document.getElementById("motivoItem_" + recusaSemMotivo.item_id)?.focus();
      return;
    }

    if(!window.AtlasWorkflow?.aprovarItensPedido){ alert("AtlasWorkflow Sprint 2.3 não carregado."); return; }

    try{
      atlasBtnProcessando(pedidoId, "Processando...");
      const r = await AtlasWorkflow.aprovarItensPedido(pedidoId, decisoes);
      atlasAtualizarPedidoLocal(pedidoId, r?.statusPedido || "EM_SEPARACAO");
      fecharModalDetalhe();
      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      alert("Erro ao salvar aprovação parcial: " + (e?.message || e));
    }
  };

  window.abrirDetalhePedidoAtlas = function(pedidoId){
    const p = pedidoLocal(pedidoId);
    if(!p) return;
    const itens = itensDoPedidoLocal(p);
    document.getElementById("modalTitulo").innerText = "Detalhes - " + (p.codigo || ("PED-" + p.id));
    document.getElementById("modalConteudo").innerHTML = `
      <div class="det-line"><b>Status:</b> ${esc(p.status || '-')}</div>
      <div class="det-line"><b>Solicitante:</b> ${esc(p.solicitante || '-')}</div>
      <div class="det-line"><b>Origem:</b> ${esc(nomeObra(p.obra_origem_id))}</div>
      <div class="det-line"><b>Destino:</b> ${esc(nomeObra(p.obra_destino_id || p.obra_id))}</div>
      <br>
      ${itens.map(i => `<div class="cart-item"><div class="cart-info"><strong>${itemTituloAtlas(i)}</strong>${badgeQuantidadeAtlasGlobal(i)}<span style="display:block;margin-top:5px">Status: ${esc(i.status || '-')} ${i.motivo_recusa ? '• Motivo: '+esc(i.motivo_recusa) : ''}</span></div></div>`).join('')}
    `;
    document.getElementById("modalDetalhe").classList.add("ativo");
  };

  // Compatibilidade com botões antigos, caso algum HTML cacheado ainda chame autorizar/negar.
  window.autorizar = window.autorizarTodosAtlas;
  window.negar = window.recusarTodosAtlas;

  void 0;
})();


/* =========================================================
   ATLAS SPRINT 2.7 - SOLICITAÇÕES COMPACTAS
   - Lista estilo caixa de entrada
   - Pedido visual PED-ID
   - Modal/Drawer de detalhes com itens completos
   - Mantém aprovação total/parcial/recusa pelo Workflow
========================================================= */
(function(){
  "use strict";

  function atlasEnsureSolicitacoesCss(){
    if(document.getElementById("atlasSolicitacoesCompactasCss")) return;
    const css = document.createElement("style");
    css.id = "atlasSolicitacoesCompactasCss";
    css.textContent = `
      .atlas-pedido-compacto{
        padding:0!important;
        overflow:hidden;
      }
      .atlas-pedido-row{
        display:grid;
        grid-template-columns:110px minmax(0,1fr) 130px 96px;
        gap:12px;
        align-items:center;
        padding:12px 14px;
      }
      .atlas-pedido-numero{
        font-size:16px;
        font-weight:950;
        color:var(--bdr-red,#b91c1c);
        line-height:1.1;
      }
      .atlas-pedido-codigo{
        display:block;
        font-size:10px;
        color:#94a3b8;
        font-weight:800;
        margin-top:4px;
        word-break:break-word;
      }
      .atlas-pedido-main{min-width:0;}
      .atlas-pedido-destino{
        font-size:13px;
        font-weight:950;
        color:#0f172a;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .atlas-pedido-meta,
      .atlas-pedido-itens-resumo{
        font-size:11px;
        color:#64748b;
        font-weight:800;
        margin-top:4px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .atlas-pedido-itens-resumo{color:#334155;}
      .atlas-pedido-status{text-align:right;}
      .atlas-pedido-status .pedido-small{margin-top:4px;}
      .atlas-pedido-actions{display:flex;justify-content:flex-end;}
      .atlas-btn-abrir{
        background:#2563eb!important;
        color:#fff!important;
        border:0!important;
        border-radius:10px!important;
        padding:9px 13px!important;
        font-size:12px!important;
        font-weight:950!important;
        cursor:pointer;
      }
      .atlas-modal-pedido-head{
        display:grid;
        grid-template-columns:1fr auto;
        gap:12px;
        align-items:start;
        margin-bottom:12px;
      }
      .atlas-modal-pedido-num{
        font-size:22px;
        font-weight:950;
        color:#0f172a;
      }
      .atlas-modal-pedido-codigo{
        font-size:11px;
        color:#64748b;
        font-weight:800;
        margin-top:2px;
      }
      .atlas-modal-grid-info{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:8px;
        margin:12px 0;
      }
      .atlas-info-mini{
        background:#f8fafc;
        border:1px solid #e5e7eb;
        border-radius:12px;
        padding:9px 10px;
      }
      .atlas-info-mini small{
        display:block;
        color:#64748b;
        font-size:10px;
        font-weight:950;
        text-transform:uppercase;
        margin-bottom:3px;
      }
      .atlas-info-mini b{
        color:#0f172a;
        font-size:12px;
        line-height:1.25;
      }
      .atlas-itens-lista{
        display:grid;
        gap:8px;
        max-height:340px;
        overflow:auto;
        padding-right:4px;
      }
      .atlas-item-pedido{
        display:grid;
        grid-template-columns:36px 1fr auto;
        gap:10px;
        align-items:center;
        border:1px solid #e5e7eb;
        border-radius:13px;
        padding:10px;
        background:#fff;
      }
      .atlas-item-ordem{
        width:30px;
        height:30px;
        border-radius:10px;
        background:#eff6ff;
        color:#2563eb;
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight:950;
        font-size:12px;
      }
      .atlas-item-codigo{
        font-size:12px;
        font-weight:950;
        color:#0f172a;
      }
      .atlas-item-nome{
        font-size:11px;
        color:#64748b;
        font-weight:800;
        margin-top:3px;
      }
      .atlas-modal-acoes{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-top:14px;
        padding-top:12px;
        border-top:1px solid #e5e7eb;
      }
      .atlas-modal-acoes button{
        border:0;
        border-radius:10px;
        padding:10px 12px;
        font-size:12px;
        font-weight:950;
        cursor:pointer;
      }
      @media(max-width:760px){
        .atlas-pedido-row{grid-template-columns:1fr;gap:8px;}
        .atlas-pedido-status{text-align:left;}
        .atlas-pedido-actions{justify-content:flex-start;}
        .atlas-modal-grid-info{grid-template-columns:1fr;}
        .atlas-item-pedido{grid-template-columns:30px 1fr;}
        .atlas-item-pedido .badge-status{grid-column:2;justify-self:start;}
      }
    `;
    document.head.appendChild(css);
  }

  function pedidoCurtoAtlas(p){
    return "PED-" + (p?.id || "-");
  }

  function obraLabelCurtaAtlas(id, fallback){
    const txt = fallback || nomeObra(id) || "-";
    return String(txt).replace(/^\d+\s*-\s*/, "").replace(/^999\s*-\s*/, "");
  }

  function codigoItemAtlas(i){
    const cod = i?.patrimonio_codigo || i?.codigo || i?.codigo_bem;
    if(cod) return String(cod);
    if(i?.patrimonio_id) return "PAT-" + String(i.patrimonio_id).padStart(6,"0");
    if(i?.produto_id) return "EST-" + String(i.produto_id).padStart(6,"0");
    return "ITEM-" + String(i?.id || "-").padStart(6,"0");
  }

  function nomeItemAtlas(i){
    return i?.patrimonio_nome || i?.produto_nome || i?.descricao || i?.nome || "Item solicitado";
  }

  function resumoItensAtlas(itens){
    if(!itens || !itens.length) return "Sem itens carregados";
    const primeiros = itens.slice(0,2).map(i => codigoItemAtlas(i) + " — " + nomeItemAtlas(i));
    const resto = itens.length > 2 ? ` +${itens.length - 2} item(ns)` : "";
    return primeiros.join(" • ") + resto;
  }

  function statusPedidoAtlas(p){
    return String(p?.status || "-").toUpperCase();
  }

  const antigoRenderizarPedidos = window.renderizarPedidos || renderizarPedidos;

  pedidoHTML = function(p){
    atlasEnsureSolicitacoesCss();
    const itens = Array.isArray(p?.itens_retirada) ? p.itens_retirada : [];
    const destino = obraLabelCurtaAtlas(p?.obra_destino_id || p?.obra_id, p?.obra_nome);
    const origem = obraLabelCurtaAtlas(p?.obra_origem_id);
    const st = statusPedidoAtlas(p);
    return `<div class="pedido-card atlas-pedido-compacto">
      <div class="atlas-pedido-row">
        <div>
          <div class="atlas-pedido-numero">${esc(pedidoCurtoAtlas(p))}</div>
          <span class="atlas-pedido-codigo">${esc(p.codigo || "")}</span>
        </div>
        <div class="atlas-pedido-main">
          <div class="atlas-pedido-destino">${esc(destino)}</div>
          <div class="atlas-pedido-meta">${esc(p.solicitante || "-")} • ${esc(origem)} → ${esc(destino)}</div>
          <div class="atlas-pedido-itens-resumo">${esc(resumoItensAtlas(itens))}</div>
        </div>
        <div class="atlas-pedido-status">
          <span class="badge-status ${statusClass(st)}">${esc(st)}</span>
          <div class="pedido-small">${itens.length} item(ns)</div>
        </div>
        <div class="atlas-pedido-actions">
          <button class="atlas-btn-abrir" onclick="abrirDetalhePedidoAtlas(${Number(p.id)})">Abrir</button>
        </div>
      </div>
    </div>`;
  };

  acoesPedido = function(p){
    return `<button class="atlas-btn-abrir" onclick="abrirDetalhePedidoAtlas(${Number(p.id)})">Abrir</button>`;
  };

  window.abrirDetalhePedidoAtlas = function(pedidoId){
    atlasEnsureSolicitacoesCss();
    const p = (window.pedidos || pedidos || []).find(x => Number(x.id) === Number(pedidoId));
    if(!p){ alert("Pedido não encontrado na tela. Atualize a página."); return; }
    const itens = Array.isArray(p.itens_retirada) ? p.itens_retirada : [];
    const st = statusPedidoAtlas(p);
    const destino = obraLabelCurtaAtlas(p.obra_destino_id || p.obra_id, p.obra_nome);
    const origem = obraLabelCurtaAtlas(p.obra_origem_id);
    const podeDecidir = ["SOLICITADO","AGUARDANDO_AUTORIZACAO"].includes(st) && podeAlmoxarife();
    const podeConcluirSeparacao = st === "EM_SEPARACAO" && podeAlmoxarife();
    const podeRetirar = st === "AGUARDANDO_RETIRADA" && podeAlmoxarife();

    let botoes = `<button style="background:#2563eb;color:#fff" onclick="fecharModalDetalhe()">Fechar</button>`;
    if(podeDecidir){
      botoes = `
        <button style="background:#16a34a;color:#fff" onclick="autorizarTodosAtlas(${Number(p.id)})">Autorizar todos</button>
        <button style="background:#2563eb;color:#fff" onclick="abrirAprovacaoParcialAtlas(${Number(p.id)})">Autorizar parcial</button>
        <button style="background:#b91c1c;color:#fff" onclick="recusarTodosAtlas(${Number(p.id)})">Recusar todos</button>
        <button style="background:#e5e7eb;color:#0f172a" onclick="fecharModalDetalhe()">Fechar</button>`;
    }else if(podeConcluirSeparacao){
      botoes = `
        <button style="background:#2563eb;color:#fff" onclick="AtlasSeparacaoQR.abrir(${Number(p.id)});fecharModalDetalhe()">📷 Iniciar separação guiada</button>
        <button style="background:#e5e7eb;color:#0f172a" onclick="fecharModalDetalhe()">Fechar</button>`;
    }else if(podeRetirar){
      botoes = `
        <button style="background:#16a34a;color:#fff" onclick="abrirRetirada(${Number(p.id)});fecharModalDetalhe()">Confirmar retirada</button>
        <button style="background:#e5e7eb;color:#0f172a" onclick="fecharModalDetalhe()">Fechar</button>`;
    }

    document.getElementById("modalTitulo").innerText = "Detalhes do pedido";
    document.getElementById("modalConteudo").innerHTML = `
      <div class="atlas-modal-pedido-head">
        <div>
          <div class="atlas-modal-pedido-num">${esc(pedidoCurtoAtlas(p))}</div>
          <div class="atlas-modal-pedido-codigo">Código completo: ${esc(p.codigo || "-")}</div>
        </div>
        <span class="badge-status ${statusClass(st)}">${esc(st)}</span>
      </div>

      <div class="atlas-modal-grid-info">
        <div class="atlas-info-mini"><small>Solicitante</small><b>${esc(p.solicitante || "-")}</b></div>
        <div class="atlas-info-mini"><small>Fluxo</small><b>${esc(origem)} → ${esc(destino)}</b></div>
        <div class="atlas-info-mini"><small>Origem</small><b>${esc(nomeObra(p.obra_origem_id))}</b></div>
        <div class="atlas-info-mini"><small>Destino</small><b>${esc(nomeObra(p.obra_destino_id || p.obra_id))}</b></div>
      </div>

      <h3 style="margin:12px 0 8px;color:#0f172a">Itens do pedido (${itens.length})</h3>
      <div class="atlas-itens-lista">
        ${itens.length ? itens.map((i,idx) => `
          <div class="atlas-item-pedido">
            <div class="atlas-item-ordem">${idx+1}</div>
            <div>
              <div class="atlas-item-codigo">${esc(codigoItemAtlas(i))}</div>
              <div class="atlas-item-nome">${esc(nomeItemAtlas(i))}${i.motivo_recusa ? " • Motivo: " + esc(i.motivo_recusa) : ""}</div>
              ${badgeQuantidadeAtlasGlobal(i)}
            </div>
            <span class="badge-status ${statusClass(i.status || 'PENDENTE')}">${esc(i.status || 'PENDENTE')}</span>
          </div>`).join("") : `<div class="cart-empty">Nenhum item carregado.</div>`}
      </div>
      <div class="atlas-modal-acoes">${botoes}</div>
    `;
    document.getElementById("modalDetalhe").classList.add("ativo");
  };

  void 0;
})();

/* =========================================================
   ATLAS SPRINT 2.9 - LOGÍSTICA ORIGEM → DESTINO
   - Separação finalizada via AtlasLogistica
   - Saída com motorista / veículo / placa
   - Recebimento pelo destino
   - Patrimônio só muda para destino no recebimento OK
========================================================= */
(function(){
  "use strict";

  function usuarioAtualAtlasLog(){
    try{return JSON.parse(localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado") || "null");}
    catch(e){return null;}
  }

  function pedidoLocalLogistica(id){
    return (window.pedidos || pedidos || []).find(p => Number(p.id) === Number(id));
  }

  function stLog(p){ return String(p?.status || "").toUpperCase(); }
  function escLog(v){ return typeof esc === "function" ? esc(v) : String(v ?? "").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function nomeObraLog(id){ return typeof nomeObra === "function" ? nomeObra(id) : String(id || "-"); }
  function dataHoraBRLog(v){
    if(!v) return "-";
    try{ return new Date(v).toLocaleString("pt-BR", {dateStyle:"short", timeStyle:"short"}); }
    catch(e){ return String(v); }
  }
  function pedidoCurtoLog(p){ return "PED-" + (p?.id || "-"); }

  window.reservar = async function(id){
    if(window.AtlasSeparacaoQR?.abrir){
      window.AtlasSeparacaoQR.abrir(id);
      return;
    }
    try{
      document.querySelectorAll(`button[onclick*="${id}"]`).forEach(btn => { btn.disabled = true; btn.innerText = "Concluindo..."; });
      if(window.AtlasLogistica?.finalizarSeparacao){
        void 0;
        await window.AtlasLogistica.finalizarSeparacao(id);
      }else if(window.AtlasWorkflow?.finalizarSeparacao){
        await window.AtlasWorkflow.finalizarSeparacao(id);
      }else{
        throw new Error("AtlasLogistica/AtlasWorkflow não carregado.");
      }

      fecharModalDetalhe?.();
      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      alert("Erro ao finalizar separação: " + (e?.message || e));
      console.error(e);
    }
  };

  window.confirmarRetiradaModal = async function(){
    const id = window.pedidoRetiradaAtual || pedidoRetiradaAtual;
    if(!id) return;

    if(!valor("retMotorista")){
      alert("Informe o motorista/responsável.");
      return;
    }

    const dados = {
      motorista_nome: valor("retMotorista"),
      transportadora: valor("retVeiculo"),
      veiculo_placa: valor("retPlaca"),
      observacao_transporte: valor("retObs")
    };

    try{
      if(window.AtlasLogistica?.enviarPedido){
        void 0;
        await window.AtlasLogistica.enviarPedido(id, dados);
      }else if(window.AtlasWorkflow?.enviarPedido){
        await window.AtlasWorkflow.enviarPedido(id, dados);
      }else{
        throw new Error("AtlasLogistica/AtlasWorkflow não carregado.");
      }

      fecharModalRetirada();
      alert("Pedido colocado em trânsito.");
      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      alert("Erro ao enviar pedido: " + (e?.message || e));
      console.error(e);
    }
  };

  window.confirmarRecebimentoAtlas = async function(pedidoId){
    try{
      const p = pedidoLocalLogistica(pedidoId) || pedidoLocal(pedidoId) || { id:pedidoId };
      let dadosRecebimento = null;

      if(window.AtlasModal && typeof window.AtlasModal.recebimento === "function"){
        dadosRecebimento = await window.AtlasModal.recebimento(p);
        if(!dadosRecebimento) return;
      }else{
        const ok = confirm("Confirmar recebimento sem divergência?");
        if(!ok) return;
        dadosRecebimento = { divergencia:false, observacao:"Recebido sem divergência." };
      }

      if(!window.AtlasLogistica?.receberPedido){
        throw new Error("AtlasLogistica.receberPedido não carregado.");
      }

      void 0;
      await window.AtlasLogistica.receberPedido(pedidoId, dadosRecebimento);

      if(window.AtlasModal?.sucesso){
        window.AtlasModal.sucesso(
          dadosRecebimento.divergencia ? "⚠ Divergência registrada" : "✔ Recebimento confirmado",
          dadosRecebimento.divergencia
            ? "A origem foi notificada e o pedido ficou aguardando conferência."
            : "Patrimônio transferido para o destino e timeline registrada."
        );
      }else{
        alert(dadosRecebimento.divergencia ? "Recebimento registrado com divergência." : "Recebimento confirmado.");
      }

      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      if(window.AtlasModal?.erro) window.AtlasModal.erro("Erro ao confirmar recebimento: " + (e?.message || e));
      else alert("Erro ao confirmar recebimento: " + (e?.message || e));
      console.error(e);
    }
  };

  const abrirDetalheAnterior = window.abrirDetalhePedidoAtlas;
  window.abrirDetalhePedidoAtlas = function(pedidoId){
    if(typeof abrirDetalheAnterior === "function") abrirDetalheAnterior(pedidoId);

    setTimeout(() => {
      const p = pedidoLocalLogistica(pedidoId);
      const box = document.getElementById("modalConteudo");
      if(!p || !box) return;

      const st = stLog(p);
      const destinoId = p.obra_destino_id || p.obra_id;
      const u = usuarioAtualAtlasLog() || {};
      const usuarioDestino = String(u.obra_id || "") === String(destinoId || "");
      const podeReceber = st === "EM_TRANSITO" && (usuarioDestino || ["MASTER","ADMIN"].includes(String(u.perfil || "").toUpperCase()));

      let extra = "";
      if(st === "EM_TRANSITO"){
        extra += `
          <div class="info-box" style="margin-top:12px">
            <b>🚚 Em trânsito</b><br>
            Saiu em: ${escLog(dataHoraBRLog(p.data_saida_cd))}<br>
            Motorista: ${escLog(p.motorista_nome || "-")}<br>
            Veículo/Transportadora: ${escLog(p.transportadora || "-")}<br>
            Placa: ${escLog(p.veiculo_placa || "-")}<br>
            Origem: ${escLog(nomeObraLog(p.obra_origem_id))}<br>
            Destino: ${escLog(nomeObraLog(destinoId))}
          </div>`;
      }

      if(p.observacao){
        extra += `<div class="info-box" style="margin-top:12px"><b>📝 Observação do solicitante</b><br>${escLog(p.observacao)}</div>`;
      }

      if(podeReceber){
        extra += `
          <div class="atlas-modal-acoes" style="margin-top:12px">
            <button class="atlas-btn success" style="background:#15803d!important;color:#fff!important" onclick="confirmarRecebimentoAtlas(${Number(p.id)});fecharModalDetalhe()">Confirmar recebimento</button>
          </div>`;
      }

      if(extra){
        box.insertAdjacentHTML("beforeend", extra);
      }
    }, 60);
  };

  void 0;
})();


/* =========================================================
   ATLAS EXPEDIÇÃO SPRINT 3.3.0
   • Pergunta se o pedido exige NF-e após a aprovação
   • Registra NF-e emitida no portal externo
   • Exibe AGUARDANDO_NFE junto ao fluxo operacional
========================================================= */
(function(){
  "use strict";

  /*
   * Modal simples e interno do Atlas.
   * Retorna:
   * true  = exige NF-e
   * false = não exige
   * null  = usuário cancelou
   */
  function perguntarExigeNfeAtlas(){
    return new Promise(resolve=>{
      const fundo = document.createElement("div");
      fundo.className = "modal-bg ativo";
      fundo.style.zIndex = "10000001";

      fundo.innerHTML = `
        <div class="modal" style="max-width:520px">
          <div class="modal-head">
            <span>📄 Controle fiscal do pedido</span>
            <button class="fechar-modal" id="atlasNfeCancelarX">X</button>
          </div>
          <div class="modal-body">
            <div class="info-box" style="margin-top:0">
              O almoxarifado pode iniciar a separação enquanto o administrativo prepara a nota.
            </div>

            <h3 style="margin:16px 0 8px;color:#0f172a">
              Este pedido precisa de NF-e?
            </h3>

            <div style="display:grid;gap:10px">
              <button class="btn-ok" id="atlasNfeSim" style="height:48px">
                Sim, precisa de NF-e
              </button>

              <button class="btn-blue" id="atlasNfeNao" style="height:48px">
                Não precisa de NF-e
              </button>

              <button class="btn-gray" id="atlasNfeCancelar">
                Cancelar aprovação
              </button>
            </div>
          </div>
        </div>`;

      document.body.appendChild(fundo);

      function fechar(valor){
        fundo.remove();
        resolve(valor);
      }

      fundo.querySelector("#atlasNfeSim").onclick = ()=>fechar(true);
      fundo.querySelector("#atlasNfeNao").onclick = ()=>fechar(false);
      fundo.querySelector("#atlasNfeCancelar").onclick = ()=>fechar(null);
      fundo.querySelector("#atlasNfeCancelarX").onclick = ()=>fechar(null);
    });
  }

  async function salvarEscolhaNfeAtlas(pedidoId, exigeNfe){
    if(!window.AtlasFiscal?.definirExigenciaNfe){
      throw new Error("AtlasFiscal não carregado.");
    }

    let motivo = "";
    if(exigeNfe === false){
      motivo = "NF-e não exigida conforme decisão do responsável pela aprovação.";
    }

    return await window.AtlasFiscal.definirExigenciaNfe(
      pedidoId,
      exigeNfe,
      motivo
    );
  }

  /*
   * Envolve a aprovação total já existente.
   * Primeiro pergunta, depois aprova e registra a decisão fiscal.
   */
  const autorizarTodosAnterior330 = window.autorizarTodosAtlas;
  if(typeof autorizarTodosAnterior330 === "function"){
    window.autorizarTodosAtlas = async function(pedidoId){
      const exigeNfe = await perguntarExigeNfeAtlas();
      if(exigeNfe === null) return;

      await autorizarTodosAnterior330(pedidoId);
      await salvarEscolhaNfeAtlas(pedidoId,exigeNfe);
      await window.carregarTudo?.();
    };
  }

  /*
   * Envolve a confirmação da aprovação parcial.
   */
  const confirmarParcialAnterior330 = window.confirmarAprovacaoParcialAtlas;
  if(typeof confirmarParcialAnterior330 === "function"){
    window.confirmarAprovacaoParcialAtlas = async function(pedidoId){
      const exigeNfe = await perguntarExigeNfeAtlas();
      if(exigeNfe === null) return;

      await confirmarParcialAnterior330(pedidoId);
      await salvarEscolhaNfeAtlas(pedidoId,exigeNfe);
      await window.carregarTudo?.();
    };
  }

  /*
   * Abre o formulário para registrar a nota feita no portal externo.
   */
  window.abrirRegistroNfeAtlas = function(pedidoId){
    const p = (window.pedidos || []).find(x=>Number(x.id)===Number(pedidoId));
    if(!p) return;

    document.getElementById("modalTitulo").innerText =
      "Registrar NF-e - " + (p.codigo || ("PED-" + p.id));

    document.getElementById("modalConteudo").innerHTML = `
      <div class="info-box" style="margin-top:0">
        Emita a NF-e no portal utilizado pela empresa e registre os dados abaixo.
      </div>

      <div style="display:grid;gap:10px;margin-top:14px">
        <label style="font-weight:900">
          Número da NF-e
          <input id="atlasNumeroNfe" value="${esc(p.numero_nfe || "")}" placeholder="Ex.: 12345">
        </label>

        <label style="font-weight:900">
          Série
          <input id="atlasSerieNfe" value="${esc(p.serie_nfe || "")}" placeholder="Ex.: 1">
        </label>

        <label style="font-weight:900">
          Chave de acesso
          <input id="atlasChaveNfe" value="${esc(p.chave_nfe || "")}" inputmode="numeric" maxlength="44" placeholder="44 números">
        </label>

        <button class="btn-ok" onclick="salvarRegistroNfeAtlas(${Number(p.id)})">
          Salvar NF-e e liberar quando separado
        </button>
      </div>`;

    document.getElementById("modalDetalhe").classList.add("ativo");
  };

  window.salvarRegistroNfeAtlas = async function(pedidoId){
    try{
      await window.AtlasFiscal.registrarNfe(pedidoId,{
        numero_nfe:document.getElementById("atlasNumeroNfe")?.value,
        serie_nfe:document.getElementById("atlasSerieNfe")?.value,
        chave_nfe:document.getElementById("atlasChaveNfe")?.value
      });

      fecharModalDetalhe?.();
      atlasToast("✅ NF-e registrada com sucesso.");
      await window.carregarTudo?.();
    }catch(e){
      if(window.AtlasModal?.erro){
        window.AtlasModal.erro(e?.message || String(e));
      }else{
        alert(e?.message || e);
      }
    }
  };

  /*
   * Acrescenta AGUARDANDO_NFE à lista operacional.
   */
  const renderizarPedidosAnterior330 = window.renderizarPedidos || renderizarPedidos;
  window.renderizarPedidos = renderizarPedidos = function(){
    renderizarPedidosAnterior330();

    const todos = window.pedidos || pedidos || [];
    const fiscais = todos.filter(p =>
      String(p.status || "").toUpperCase() === "AGUARDANDO_NFE"
    );

    const listaRetirada = document.getElementById("listaRetirada");
    if(listaRetirada && fiscais.length){
      const htmlFiscal = fiscais.map(p=>pedidoHTML(p)).join("");
      listaRetirada.insertAdjacentHTML("afterbegin",htmlFiscal);
    }
  };

  /*
   * Troca a ação do pedido enquanto a nota estiver pendente.
   */
  const acoesPedidoAnterior330 = window.acoesPedido || acoesPedido;
  window.acoesPedido = acoesPedido = function(p){
    const st = String(p?.status || "").toUpperCase();

    if(st === "AGUARDANDO_NFE"){
      return `
        <button class="btn-mini btn-blue" onclick="abrirRegistroNfeAtlas(${Number(p.id)})">
          📄 Registrar NF-e
        </button>`;
    }

    return acoesPedidoAnterior330(p);
  };

  void 0;
})();


/* =========================================================
   ATLAS EXPEDIÇÃO 3.5.0 — ESCOPO POR OBRA + PERFIL

   REGRA CENTRAL:
   - OWNER id=1: visão e operação global.
   - Demais usuários: veem apenas pedidos relacionados à sua obra
     ou solicitações criadas por eles.
   - MASTER/ADMIN da obra de origem: autoriza, recusa e acompanha
     as etapas operacionais.
   - ALMOXARIFE da obra de origem: atua da separação em diante.
   - Usuário comum: solicita, acompanha e recebe no destino.

   IMPORTANTE:
   - O filtro visual NÃO é a única proteção.
   - As funções de ação também são bloqueadas por obra e perfil.
========================================================= */
(function(){
  "use strict";

  if(window.__ATLAS_EXP_ESCOPO_PERFIL_350__) return;
  window.__ATLAS_EXP_ESCOPO_PERFIL_350__ = true;

  function atlasNorm(v){
    return String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  }

  function atlasUsuario(){
    try{
      if(typeof window.usuarioAtual === "function") return window.usuarioAtual() || {};
    }catch(e){}
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        "{}"
      );
    }catch(e){ return {}; }
  }

  function atlasPerfil(){ return atlasNorm(atlasUsuario()?.perfil); }
  function atlasObraUsuario(){ return Number(atlasUsuario()?.obra_id || 0); }
  function atlasOwnerGlobal(){ return Number(atlasUsuario()?.id) === 1; }
  function atlasEhGestor(){ return ["MASTER","ADMIN"].includes(atlasPerfil()); }
  function atlasEhAlmoxarife(){ return ["ALMOXARIFE","ALMOXARIFADO"].includes(atlasPerfil()); }
  function atlasEquipeOperacional(){ return atlasEhGestor() || atlasEhAlmoxarife(); }

  function atlasPedidoPorId(id){
    const lista = window.pedidos || (typeof pedidos !== "undefined" ? pedidos : []) || [];
    return lista.find(p => Number(p?.id) === Number(id));
  }

  function atlasObraOrigem(p){ return Number(p?.obra_origem_id || 0); }
  function atlasObraDestino(p){ return Number(p?.obra_destino_id || p?.obra_id || 0); }
  function atlasMesmaObraOrigem(p){
    return atlasOwnerGlobal() || (!!atlasObraUsuario() && atlasObraUsuario() === atlasObraOrigem(p));
  }
  function atlasMesmaObraDestino(p){
    return atlasOwnerGlobal() || (!!atlasObraUsuario() && atlasObraUsuario() === atlasObraDestino(p));
  }

  function atlasPedidoDoUsuario(p){
    if(atlasOwnerGlobal()) return true;
    const u = atlasUsuario() || {};
    const uid = Number(u.id || u.usuario_id || 0);
    const ids = [
      p?.solicitante_id,
      p?.solicitado_por,
      p?.usuario_criacao_id,
      p?.criado_por_id,
      p?.usuario_id
    ].map(Number).filter(Boolean);
    if(uid && ids.includes(uid)) return true;

    const nome = atlasNorm(u.nome || u.usuario || u.email);
    if(!nome) return false;
    return [p?.solicitante, p?.usuario_criacao, p?.solicitado_por_nome]
      .some(v => atlasNorm(v) === nome);
  }

  function atlasPodeAutorizar(p){
    return atlasOwnerGlobal() || (atlasEhGestor() && atlasMesmaObraOrigem(p));
  }

  function atlasPodeSeparar(p){
    return atlasOwnerGlobal() || (atlasEquipeOperacional() && atlasMesmaObraOrigem(p));
  }

  function atlasPodeRetirada(p){ return atlasPodeSeparar(p); }
  function atlasPodeNfe(p){ return atlasPodeAutorizar(p); }
  function atlasPodeReceber(p){ return atlasOwnerGlobal() || atlasMesmaObraDestino(p); }

  function atlasPodeAcompanhar(p){
    if(atlasOwnerGlobal()) return true;
    return atlasPedidoDoUsuario(p) || atlasMesmaObraOrigem(p) || atlasMesmaObraDestino(p);
  }

  window.AtlasExpedicaoPermissoes = Object.freeze({
    ownerGlobal: atlasOwnerGlobal,
    podeAutorizar: atlasPodeAutorizar,
    podeSeparar: atlasPodeSeparar,
    podeRetirada: atlasPodeRetirada,
    podeReceber: atlasPodeReceber,
    podeAcompanhar: atlasPodeAcompanhar,
    pedidoDoUsuario: atlasPedidoDoUsuario,
    mesmaObraOrigem: atlasMesmaObraOrigem,
    mesmaObraDestino: atlasMesmaObraDestino
  });

  function atlasStatus(p){ return atlasNorm(p?.status).replaceAll(" ", "_"); }

  function atlasListaEscopo(id, arr, vazio){
    const el = document.getElementById(id);
    if(!el) return;
    if(!arr.length){
      el.innerHTML = `<div class="cart-empty">${typeof esc === "function" ? esc(vazio) : vazio}</div>`;
      return;
    }
    el.innerHTML = arr.map(p => typeof pedidoHTML === "function" ? pedidoHTML(p) : "").join("");
  }

  /* Cada aba recebe somente os pedidos que cabem ao usuário atual. */
  window.renderizarPedidos = renderizarPedidos = function(){
    const todos = (window.pedidos || (typeof pedidos !== "undefined" ? pedidos : []) || [])
      .filter(atlasPodeAcompanhar);

    const solicitacoes = todos.filter(p => {
      const st = atlasStatus(p);
      if(!["SOLICITADO","AGUARDANDO_AUTORIZACAO"].includes(st)) return false;
      if(atlasOwnerGlobal()) return true;
      if(atlasPodeAutorizar(p)) return true;
      return atlasPedidoDoUsuario(p);
    });

    const separacao = todos.filter(p =>
      atlasStatus(p) === "EM_SEPARACAO" && atlasPodeSeparar(p)
    );

    const retirada = todos.filter(p =>
      atlasStatus(p) === "AGUARDANDO_RETIRADA" && atlasPodeRetirada(p)
    );

    const transito = todos.filter(p => {
      if(atlasStatus(p) !== "EM_TRANSITO") return false;
      if(atlasOwnerGlobal()) return true;
      return atlasPodeRetirada(p) || atlasPodeReceber(p) || atlasPedidoDoUsuario(p);
    });

    const historico = todos.filter(p => [
      "RECEBIDO","RECEBIDO_PARCIAL","RECUSADO","CANCELADO","ENTREGUE",
      "NEGADO","RECEBIDO_COM_DIVERGENCIA"
    ].includes(atlasStatus(p)));

    atlasListaEscopo("listaSolicitacoes", solicitacoes,
      atlasEhGestor() ? "Nenhuma solicitação da sua obra aguardando autorização." : "Nenhuma solicitação sua aguardando andamento.");
    atlasListaEscopo("listaSeparacao", separacao,
      "Nenhum pedido da sua obra aguardando separação.");
    atlasListaEscopo("listaRetirada", retirada,
      "Nenhum pedido da sua obra aguardando retirada.");
    atlasListaEscopo("listaTransito", transito,
      "Nenhum pedido relacionado à sua obra está em trânsito.");
    atlasListaEscopo("listaHistorico", historico,
      "Nenhum histórico relacionado à sua obra ou às suas solicitações.");
  };

  function atlasNegarAcao(msg){
    const texto = msg || "Esta etapa pertence à equipe da obra de origem do pedido.";
    if(typeof window.atlasToast === "function") window.atlasToast("🔒 " + texto);
    else alert(texto);
    return false;
  }

  function atlasProtegerFuncao(nome, regra, mensagem){
    const original = window[nome];
    if(typeof original !== "function" || original.__atlasProtegida350) return;
    const protegida = async function(pedidoId, ...args){
      const p = atlasPedidoPorId(pedidoId);
      if(!p || !regra(p)) return atlasNegarAcao(mensagem);
      return await original.call(this, pedidoId, ...args);
    };
    protegida.__atlasProtegida350 = true;
    window[nome] = protegida;
    try{ eval(`${nome}=window[nome]`); }catch(e){}
  }

  function atlasInstalarProtecoes(){
    atlasProtegerFuncao("autorizar", atlasPodeAutorizar, "Somente MASTER/ADMIN da obra de origem pode autorizar.");
    atlasProtegerFuncao("negar", atlasPodeAutorizar, "Somente MASTER/ADMIN da obra de origem pode recusar.");
    atlasProtegerFuncao("autorizarTodosAtlas", atlasPodeAutorizar, "Somente MASTER/ADMIN da obra de origem pode autorizar.");
    atlasProtegerFuncao("recusarTodosAtlas", atlasPodeAutorizar, "Somente MASTER/ADMIN da obra de origem pode recusar.");
    atlasProtegerFuncao("abrirAprovacaoParcialAtlas", atlasPodeAutorizar, "Somente MASTER/ADMIN da obra de origem pode decidir os itens.");
    atlasProtegerFuncao("confirmarAprovacaoParcialAtlas", atlasPodeAutorizar, "Somente MASTER/ADMIN da obra de origem pode decidir os itens.");
    atlasProtegerFuncao("reservar", atlasPodeSeparar, "Somente a equipe da obra de origem pode concluir a separação.");
    atlasProtegerFuncao("abrirRetirada", atlasPodeRetirada, "Somente a equipe da obra de origem pode liberar a retirada.");
    atlasProtegerFuncao("abrirRegistroNfeAtlas", atlasPodeNfe, "Somente MASTER/ADMIN da obra de origem pode registrar a NF-e.");
    atlasProtegerFuncao("confirmarRecebimentoAtlas", atlasPodeReceber, "Somente a obra de destino pode confirmar o recebimento.");

    if(window.AtlasSeparacaoQR && typeof window.AtlasSeparacaoQR.abrir === "function" && !window.AtlasSeparacaoQR.abrir.__atlasProtegida350){
      const abrirQr = window.AtlasSeparacaoQR.abrir;
      window.AtlasSeparacaoQR.abrir = function(pedidoId, ...args){
        const p = atlasPedidoPorId(pedidoId);
        if(!p || !atlasPodeSeparar(p)) return atlasNegarAcao("Somente a equipe da obra de origem pode iniciar a separação.");
        return abrirQr.call(this, pedidoId, ...args);
      };
      window.AtlasSeparacaoQR.abrir.__atlasProtegida350 = true;
    }
  }

  function atlasClassificarBotao(btn){
    const txt = atlasNorm((btn.innerText || "") + " " + (btn.getAttribute("onclick") || ""));
    if(txt.includes("AUTORIZ") || txt.includes("APROVACAO") || txt.includes("RECUSAR") || txt.includes("NEGAR")) return "AUTORIZAR";
    if(txt.includes("SEPAR") || txt.includes("RESERV")) return "SEPARAR";
    if(txt.includes("RETIRADA") || txt.includes("TRANSITO") || txt.includes("ENVIAR")) return "RETIRADA";
    if(txt.includes("NF-E") || txt.includes("NFE")) return "NFE";
    if(txt.includes("RECEBIMENTO") || txt.includes("RECEBER")) return "RECEBER";
    return "OUTRO";
  }

  function atlasLimparBotoesModal(pedidoId){
    const p = atlasPedidoPorId(pedidoId);
    if(!p) return;
    const raiz = document.getElementById("modalDetalhe") || document;
    raiz.querySelectorAll("button").forEach(btn => {
      const tipo = atlasClassificarBotao(btn);
      let pode = true;
      if(tipo === "AUTORIZAR") pode = atlasPodeAutorizar(p);
      if(tipo === "SEPARAR") pode = atlasPodeSeparar(p);
      if(tipo === "RETIRADA") pode = atlasPodeRetirada(p);
      if(tipo === "NFE") pode = atlasPodeNfe(p);
      if(tipo === "RECEBER") pode = atlasPodeReceber(p);
      if(!pode) btn.remove();
    });
  }

  function atlasProtegerModal(){
    const original = window.abrirDetalhePedidoAtlas;
    if(typeof original !== "function" || original.__atlasEscopo350) return;
    const nova = function(pedidoId, ...args){
      const p = atlasPedidoPorId(pedidoId);
      if(!p || !atlasPodeAcompanhar(p)) return atlasNegarAcao("Este pedido não pertence à sua obra nem foi solicitado por você.");
      const r = original.call(this, pedidoId, ...args);
      [0,70,180,350].forEach(t => setTimeout(() => atlasLimparBotoesModal(pedidoId), t));
      return r;
    };
    nova.__atlasEscopo350 = true;
    window.abrirDetalhePedidoAtlas = nova;
    try{ abrirDetalhePedidoAtlas = nova; }catch(e){}
  }

  function atlasAplicarTudo(){
    atlasInstalarProtecoes();
    atlasProtegerModal();
    try{ window.renderizarPedidos(); }catch(e){ console.warn("Atlas escopo: renderização pendente.", e); }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(atlasAplicarTudo, 50);
      setTimeout(atlasAplicarTudo, 500);
      setTimeout(atlasAplicarTudo, 1400);
    });
  }else{
    setTimeout(atlasAplicarTudo, 0);
    setTimeout(atlasAplicarTudo, 500);
  }

  window.addEventListener("load", () => setTimeout(atlasAplicarTudo, 300));
  window.addEventListener("atlas:owner-mode-changed", () => setTimeout(atlasAplicarTudo, 80));

  void 0;
})();



/* =========================================================
   ATLAS EXPEDIÇÃO 3.6
   CATÁLOGO COM FILTROS HORIZONTAIS E PAGINAÇÃO
   Observação: nesta primeira versão, a paginação é visual.
   Os dados já carregados em itensCatalogo são filtrados e
   exibidos em blocos de 30, 50 ou 100 registros.
========================================================= */
(function(){
  const estado = window.AtlasCatalogoPaginado = window.AtlasCatalogoPaginado || {
    pagina: 1,
    porPagina: 30,
    totalPaginas: 1
  };

  function textoSeguro(v){
    return String(v ?? "").trim();
  }

  function valorElemento(id, padrao){
    const el = document.getElementById(id);
    return el ? el.value : padrao;
  }

  function obraDoItem(item){
    return textoSeguro(
      item.obra_id ??
      item.localizacao_obra_id ??
      item.obra_origem_id ??
      item.empresa_obra_id ??
      item.obra_nome ??
      item.obra ??
      item.localizacao
    );
  }

  function obraNomeDoItem(item){
    return textoSeguro(
      item.obra_nome ??
      item.nome_obra ??
      item.obra ??
      item.localizacao ??
      item.setor ??
      obraDoItem(item)
    );
  }

  function categoriaDoItem(item){
    return textoSeguro(
      item.tipo_item ??
      item.categoria ??
      item.tipo ??
      item.grupo ??
      item.classificacao ??
      "OUTRO"
    ).toUpperCase();
  }

  function dataDoItem(item){
    const bruto = item.created_at ?? item.data_cadastro ?? item.updated_at ?? item.id ?? 0;
    const data = new Date(bruto);
    return Number.isNaN(data.getTime()) ? Number(item.id || 0) : data.getTime();
  }

  function compararTexto(a,b){
    return textoSeguro(a).localeCompare(textoSeguro(b), "pt-BR", {numeric:true, sensitivity:"base"});
  }

  function preencherSelect(id, valores, textoTodos){
    const select = document.getElementById(id);
    if(!select) return;
    const atual = select.value;
    const opcoes = [`<option value="TODAS">${textoTodos}</option>`]
      .concat(valores.map(v => `<option value="${String(v.valor).replace(/"/g,"&quot;")}">${v.rotulo}</option>`));
    select.innerHTML = opcoes.join("");
    if(Array.from(select.options).some(o => o.value === atual)) select.value = atual;
  }

  function atlasAtualizarOpcoesFiltros(){
    const lista = Array.isArray(window.itensCatalogo) ? window.itensCatalogo : [];

    const mapaObras = new Map();
    lista.forEach(item => {
      const valor = obraDoItem(item);
      const rotulo = obraNomeDoItem(item);
      if(valor && !mapaObras.has(valor)) mapaObras.set(valor, rotulo || valor);
    });
    const obrasOrdenadas = Array.from(mapaObras.entries())
      .map(([valor,rotulo]) => ({valor,rotulo}))
      .sort((a,b)=>compararTexto(a.rotulo,b.rotulo));
    preencherSelect("filtroObraCatalogo", obrasOrdenadas, "Todas as obras");

    const categorias = Array.from(new Set(lista.map(categoriaDoItem).filter(Boolean)))
      .sort(compararTexto)
      .map(valor => ({
        valor,
        rotulo: valor.replaceAll("_"," ").toLowerCase().replace(/\b\w/g, l=>l.toUpperCase())
      }));
    preencherSelect("filtroCategoriaCatalogo", categorias, "Todas");
  }

  function obterListaFiltrada(){
    const buscaEl = document.getElementById("buscaCatalogo");
    const busca = textoSeguro(buscaEl?.value).toLowerCase();
    const obra = valorElemento("filtroObraCatalogo","TODAS");
    const categoria = valorElemento("filtroCategoriaCatalogo","TODAS");
    const ordenacao = valorElemento("ordenacaoCatalogo","RECENTES");

    let lista = (Array.isArray(window.itensCatalogo) ? window.itensCatalogo : []).filter(item => {
      const texto = [
        item.codigo, item.codigo_bem, item.etiqueta, item.codigo_qr,
        item.nome, item.nome_bem, item.descricao, item.marca, item.modelo,
        obraNomeDoItem(item), item.localizacao, item.numero_serie
      ].map(textoSeguro).join(" ").toLowerCase();

      const status = typeof normalStatus === "function"
        ? normalStatus(item.status)
        : textoSeguro(item.status).toUpperCase();

      const passaBusca = !busca || texto.includes(busca);
      const passaStatus = window.filtroAtual === "TODOS" || status === window.filtroAtual;
      const passaObra = obra === "TODAS" || obraDoItem(item) === obra;
      const passaCategoria = categoria === "TODAS" || categoriaDoItem(item) === categoria;

      return passaBusca && passaStatus && passaObra && passaCategoria;
    });

    lista.sort((a,b)=>{
      if(ordenacao === "NOME_ASC") return compararTexto(a.nome ?? a.nome_bem, b.nome ?? b.nome_bem);
      if(ordenacao === "CODIGO_ASC") return compararTexto(a.codigo ?? a.codigo_bem ?? a.etiqueta, b.codigo ?? b.codigo_bem ?? b.etiqueta);
      if(ordenacao === "OBRA_ASC") return compararTexto(obraNomeDoItem(a), obraNomeDoItem(b));
      if(ordenacao === "STATUS_ASC") return compararTexto(a.status, b.status);
      return dataDoItem(b) - dataDoItem(a);
    });

    return lista;
  }

  function atualizarResumo(total, inicio, fim){
    const resumo = document.getElementById("atlasResumoCatalogo");
    if(resumo){
      resumo.textContent = total
        ? `Mostrando ${inicio + 1}–${fim} de ${total} itens`
        : "Nenhum item encontrado";
    }

    const ativos = [];
    const obra = valorElemento("filtroObraCatalogo","TODAS");
    const categoria = valorElemento("filtroCategoriaCatalogo","TODAS");
    const obraEl = document.getElementById("filtroObraCatalogo");
    if(obra !== "TODAS") ativos.push(`Obra: ${obraEl?.selectedOptions?.[0]?.text || obra}`);
    if(categoria !== "TODAS") ativos.push(`Categoria: ${categoria.replaceAll("_"," ")}`);
    if(window.filtroAtual && window.filtroAtual !== "TODOS") ativos.push(`Status: ${window.filtroAtual.replaceAll("_"," ")}`);

    const filtros = document.getElementById("atlasFiltrosAtivosCatalogo");
    if(filtros) filtros.textContent = ativos.length ? `Filtros ativos — ${ativos.join(" • ")}` : "";
  }

  function atualizarPaginacao(){
    const totalPaginas = Math.max(1, estado.totalPaginas);
    const pagina = Math.min(Math.max(1, estado.pagina), totalPaginas);
    estado.pagina = pagina;

    const label = document.getElementById("atlasPaginaAtual");
    if(label) label.textContent = `Página ${pagina} de ${totalPaginas}`;

    const primeira = pagina <= 1;
    const ultima = pagina >= totalPaginas;
    ["atlasPrimeiraPagina","atlasPaginaAnterior"].forEach(id=>{
      const el=document.getElementById(id); if(el) el.disabled=primeira;
    });
    ["atlasProximaPagina","atlasUltimaPagina"].forEach(id=>{
      const el=document.getElementById(id); if(el) el.disabled=ultima;
    });

    const paginacao = document.getElementById("atlasPaginacaoCatalogo");
    if(paginacao) paginacao.style.display = estado.totalPaginas <= 1 ? "none" : "flex";
  }

  window.renderizarCatalogo = function(){
    const grid = document.getElementById("catalogoGrid");
    if(!grid) return;

    atlasAtualizarOpcoesFiltros();

    estado.porPagina = Number(valorElemento("itensPorPaginaCatalogo", estado.porPagina || 30)) || 30;
    const lista = obterListaFiltrada();
    estado.totalPaginas = Math.max(1, Math.ceil(lista.length / estado.porPagina));
    if(estado.pagina > estado.totalPaginas) estado.pagina = estado.totalPaginas;

    const inicio = (estado.pagina - 1) * estado.porPagina;
    const fim = Math.min(inicio + estado.porPagina, lista.length);
    const pagina = lista.slice(inicio, fim);

    if(!pagina.length){
      grid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1">Nenhum item encontrado com os filtros selecionados.</div>`;
    }else{
      grid.innerHTML = pagina.map(item => typeof cardItem === "function" ? cardItem(item) : "").join("");
    }

    atualizarResumo(lista.length, inicio, fim);
    atualizarPaginacao();
  };

  window.atlasAlterarFiltroCatalogo = function(){
    estado.pagina = 1;
    window.renderizarCatalogo();
  };

  window.atlasAlterarItensPorPagina = function(){
    estado.porPagina = Number(valorElemento("itensPorPaginaCatalogo",30)) || 30;
    estado.pagina = 1;
    window.renderizarCatalogo();
  };

  window.atlasMudarPaginaCatalogo = function(delta){
    estado.pagina = Math.min(Math.max(1, estado.pagina + Number(delta || 0)), estado.totalPaginas);
    window.renderizarCatalogo();
    document.getElementById("catalogoGrid")?.scrollIntoView({behavior:"smooth",block:"start"});
  };

  window.atlasIrPaginaCatalogo = function(pagina){
    estado.pagina = Math.min(Math.max(1, Number(pagina || 1)), estado.totalPaginas);
    window.renderizarCatalogo();
    document.getElementById("catalogoGrid")?.scrollIntoView({behavior:"smooth",block:"start"});
  };

  window.atlasIrUltimaPaginaCatalogo = function(){
    window.atlasIrPaginaCatalogo(estado.totalPaginas);
  };

  window.atlasLimparFiltrosCatalogo = function(){
    const ids = {
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
    window.filtroAtual = "TODOS";
    document.querySelectorAll(".chip-exp").forEach(btn=>{
      btn.classList.toggle("active", btn.dataset.filtro === "TODOS");
    });
    estado.pagina = 1;
    estado.porPagina = 30;
    window.renderizarCatalogo();
  };

  // Busca digitada sempre retorna à primeira página.
  document.addEventListener("DOMContentLoaded", function(){
    const busca = document.getElementById("buscaCatalogo");
    if(busca){
      busca.removeAttribute("oninput");
      let timer;
      busca.addEventListener("input", ()=>{
        clearTimeout(timer);
        timer=setTimeout(()=>{
          estado.pagina=1;
          window.renderizarCatalogo();
        },180);
      });
    }

    // Mantém paginação correta quando os chips de status forem usados.
    document.querySelectorAll(".chip-exp").forEach(btn=>{
      btn.addEventListener("click", ()=>{ estado.pagina=1; });
    });

    setTimeout(()=>{
      atlasAtualizarOpcoesFiltros();
      window.renderizarCatalogo();
    },350);
  });

  // Exporta para possíveis integrações futuras.
  window.atlasAtualizarOpcoesFiltrosCatalogo = atlasAtualizarOpcoesFiltros;
})();
