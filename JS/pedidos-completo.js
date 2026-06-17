let obras = [];
let itensPedido = [];
let catalogoAtual = [];
let pedidos = [];
let audioCtx = null;
let scanner = null;
let scanCtx = null;
let leituras = {};
let usuarioInteragiu = false;
let canalPedidos = null;

const STATUS_ABERTOS = [
  "AGUARDANDO_AUTORIZACAO",
  "EM_SEPARACAO",
  "AGUARDANDO_RETIRADA",
  "EM_TRANSITO",
  "AGUARDANDO_CONFERENCIA"
];

const FLUXO_PEDIDO = [
  ["AGUARDANDO_AUTORIZACAO", "Autorização"],
  ["EM_SEPARACAO", "Separação"],
  ["AGUARDANDO_RETIRADA", "Retirada"],
  ["EM_TRANSITO", "Trânsito"],
  ["AGUARDANDO_CONFERENCIA", "Conferência"],
  ["ENTREGUE", "Recebido"]
];

const ROTULO_STATUS = {
  AGUARDANDO_AUTORIZACAO: "Aguardando autorização",
  EM_SEPARACAO: "Em separação",
  AGUARDANDO_RETIRADA: "Aguardando retirada",
  EM_TRANSITO: "Em trânsito",
  AGUARDANDO_CONFERENCIA: "Aguardando conferência",
  ENTREGUE: "Recebido",
  RECEBIDO_COM_DIVERGENCIA: "Recebido com divergência",
  NEGADO: "Negado",
  SEPARADO: "Separado",
  RETIRADO: "Retirado",
  DIVERGENCIA: "Divergência",
  PENDENTE: "Pendente"
};

function ir(pagina){ window.location.href = pagina; }
function db(){ return window.client || window.supabaseClient || window.clientSupabase; }
function valor(id){ return String(document.getElementById(id)?.value || "").trim(); }
function usuarioAtual(){
  try{
    const u = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
    return u ? JSON.parse(u) : null;
  }catch(e){ return null; }
}
function perfil(){ return String(usuarioAtual()?.perfil || "").toUpperCase(); }
function podeTudo(){ const p = perfil(); return p === "MASTER" || p === "ADMIN"; }
function podeAlmoxarifado(){ const p = perfil(); return p === "MASTER" || p === "ADMIN" || p === "ALMOXARIFE" || p === "ALMOXARIFADO"; }
function rotulo(status){ return ROTULO_STATUS[status] || status || "-"; }
function cls(status){ return String(status || "").replaceAll(" ", "_").replaceAll("-", "_"); }
function dataBR(data){
  if(!data) return "-";
  const d = new Date(String(data).replace(" ", "T"));
  return isNaN(d.getTime()) ? String(data) : d.toLocaleString("pt-BR");
}

function carregarUsuarioTopo(){
  const u = usuarioAtual();
  const nome = document.getElementById("usuarioNome");
  const perfilEl = document.getElementById("usuarioPerfil");
  if(nome) nome.innerText = u ? "Olá, " + (u.nome || "usuário") : "Olá, usuário";
  if(perfilEl) perfilEl.innerText = u ? (u.perfil || "-") : "-";
}
function toggleMenuUsuario(event){
  if(event) event.stopPropagation();
  document.getElementById("dropdownUser")?.classList.toggle("ativo");
  document.getElementById("notifDropdown")?.classList.remove("ativo");
}
function toggleNotificacoes(event){
  if(event) event.stopPropagation();
  document.getElementById("notifDropdown")?.classList.toggle("ativo");
  document.getElementById("dropdownUser")?.classList.remove("ativo");
}
function fecharMenusTopo(){
  document.getElementById("dropdownUser")?.classList.remove("ativo");
  document.getElementById("notifDropdown")?.classList.remove("ativo");
}
document.addEventListener("click", fecharMenusTopo);
document.addEventListener("keydown", e => { if(e.key === "Escape") fecharMenusTopo(); });

function prepararSom(){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!audioCtx) audioCtx = new Ctx();
    if(audioCtx.state === "suspended") audioCtx.resume();
  }catch(e){}
}
document.addEventListener("pointerdown", () => { usuarioInteragiu = true; prepararSom(); }, { once:false });

function som(tipo="ok"){
  try{
    prepararSom();
    if(!audioCtx) return;
    const ctx = audioCtx;
    const seq = tipo === "erro" ? [180, 140, 110] : tipo === "notif" ? [880, 1175] : [660, 880];
    seq.forEach((freq, i) => {
      const delay = i * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tipo === "erro" ? "square" : "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(tipo === "erro" ? 0.18 : 0.22, ctx.currentTime + delay + 0.02);
      gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.12);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.15);
    });
    if(usuarioInteragiu && navigator.vibrate){
      navigator.vibrate(tipo === "erro" ? [160,60,160] : [70]);
    }
  }catch(e){}
}
function toast(titulo, texto){
  const el = document.getElementById("toast");
  if(!el) return;
  el.querySelector("strong").innerText = titulo;
  el.querySelector("span").innerText = texto;
  el.style.display = "block";
  setTimeout(() => el.style.display = "none", 4500);
}

function abrirAba(nome, btn){
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById("tab-" + nome)?.classList.add("active");
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  if(btn) btn.classList.add("active");
  renderizarTudo();
}

function salvarCarrinhoLocal(){ localStorage.setItem("bdr_carrinho_pedidos", JSON.stringify(itensPedido)); }
function carregarCarrinhoLocal(){
  try{ itensPedido = JSON.parse(localStorage.getItem("bdr_carrinho_pedidos") || "[]"); }
  catch(e){ itensPedido = []; }
}
function limparCarrinhoLocal(){ localStorage.removeItem("bdr_carrinho_pedidos"); }

async function carregarTudo(){
  if(!db()){
    alert("Supabase não carregado. Verifique JS/supabaseClient.js");
    return;
  }
  await carregarDadosBase();
  await carregarPedidos();
  renderizarTudo();
}

async function carregarDadosBase(){
  const u = usuarioAtual();
  carregarUsuarioTopo();
  const sol = document.getElementById("solicitante");
  if(sol) sol.value = u?.nome || "Usuário não identificado";

  const resp = await db().from("obras").select("*").eq("ativa", true).order("nome");
  if(resp.error){ alert("Erro ao carregar obras: " + resp.error.message); return; }
  obras = resp.data || [];

  const dest = document.getElementById("obraDestino");
  const ori = document.getElementById("obraOrigem");
  if(!dest || !ori) return;
  dest.innerHTML = "";
  ori.innerHTML = "";

  let obrasDestino = [...obras];
  if(!podeTudo() && u?.obra_id){
    obrasDestino = obrasDestino.filter(o => String(o.id) === String(u.obra_id));
  }

  obrasDestino.forEach(o => {
    dest.innerHTML += `<option value="${o.id}" data-nome="${o.nome || ""}">${o.codigo_obra || "-"} - ${o.nome || "-"}</option>`;
  });

  const est = await db().from("patrimonio").select("obra_id").eq("status", "ESTOQUE");
  const ids = new Set((est.data || []).map(x => String(x.obra_id)));
  obras.filter(o => ids.has(String(o.id))).forEach(o => {
    ori.innerHTML += `<option value="${o.id}">${o.codigo_obra || "-"} - ${o.nome || "-"}</option>`;
  });

  if(ori.options.length && catalogoAtual.length === 0){
    await carregarCatalogo();
  }
}

async function carregarPedidos(){
  const ped = await db().from("pedidos_retirada").select("*").order("id", { ascending:false });
  if(ped.error){ alert("Erro ao carregar pedidos: " + ped.error.message); return; }

  let base = ped.data || [];
  const ids = base.map(p => p.id);
  let itens = [];
  let historicos = [];

  if(ids.length){
    const it = await db().from("itens_retirada").select("*").in("pedido_id", ids).order("id", { ascending:true });
    if(it.error){ console.warn("Erro ao carregar itens:", it.error.message); }
    itens = it.data || [];

    // IMPORTANTE: usa created_at porque sua tabela deu erro com criado_em.
    let histResp = await db()
      .from("historico_pedidos_retirada")
      .select("pedido_id,item_id,status_anterior,status_novo,usuario,observacao,created_at")
      .in("pedido_id", ids)
      .order("id", { ascending:false });

    if(histResp.error){
      console.warn("Histórico sem created_at, tentando select básico:", histResp.error.message);
      histResp = await db()
        .from("historico_pedidos_retirada")
        .select("*")
        .in("pedido_id", ids)
        .order("id", { ascending:false });
    }

    if(histResp.error){
      console.warn("Histórico não carregado:", histResp.error.message);
    }
    historicos = histResp.data || [];
  }

  const u = usuarioAtual();
  if(!podeAlmoxarifado() && !podeTudo()){
    base = base.filter(p =>
      String(p.solicitante || "") === String(u?.nome || "") ||
      String(p.usuario_criacao || "") === String(u?.nome || "") ||
      String(p.obra_id || "") === String(u?.obra_id || "") ||
      String(p.obra_destino_id || "") === String(u?.obra_id || "")
    );
  }

  pedidos = base.map(p => ({
    ...p,
    itens_retirada: itens.filter(i => String(i.pedido_id) === String(p.id)),
    historico: historicos.filter(h => String(h.pedido_id) === String(p.id))
  }));
}

async function carregarCatalogo(){
  const origem = valor("obraOrigem");
  const div = document.getElementById("resultadoBusca");
  const res = document.getElementById("resumoCatalogo");
  if(!origem){ if(div) div.innerHTML = ""; return; }
  if(res) res.innerHTML = "Carregando catálogo...";

  const pat = await db().from("patrimonio").select("*").eq("status", "ESTOQUE").eq("obra_id", origem).order("nome_bem", { ascending:true }).limit(500);
  if(pat.error){ alert(pat.error.message); return; }

  const ped = await db().from("pedidos_retirada").select("id,status").in("status", STATUS_ABERTOS);
  const idsPed = (ped.data || []).map(p => p.id);
  let reservados = new Set();

  if(idsPed.length){
    const it = await db().from("itens_retirada").select("patrimonio_id,status,pedido_id").in("pedido_id", idsPed).neq("status", "NEGADO");
    reservados = new Set((it.data || []).map(i => Number(i.patrimonio_id)).filter(Boolean));
  }

  catalogoAtual = (pat.data || []).filter(p => !reservados.has(Number(p.id)));
  if(res) res.innerHTML = `Exibindo <b>${catalogoAtual.length}</b> item(ns) disponíveis.`;
  renderizarCatalogo(catalogoAtual);
}
function filtrarCatalogo(){
  const t = valor("buscaPatrimonio").toLowerCase();
  const lista = !t ? catalogoAtual : catalogoAtual.filter(p => `${p.codigo_qr || ""} ${p.nome_bem || ""} ${p.marca || ""} ${p.modelo || ""}`.toLowerCase().includes(t));
  renderizarCatalogo(lista);
}
function renderizarCatalogo(lista){
  const div = document.getElementById("resultadoBusca");
  if(!div) return;
  if(!lista.length){ div.innerHTML = '<div class="vazio">Nenhum item disponível.</div>'; return; }
  div.innerHTML = `<div class="catalogo">${lista.map(p => {
    const ja = itensPedido.some(i => Number(i.id) === Number(p.id));
    const json = JSON.stringify(p).replaceAll("'", "&apos;");
    return `<div class="produto"><div class="foto">📦</div><div class="codigo">${p.codigo_qr || "-"}</div><h4>${p.nome_bem || "-"}</h4><div class="meta"><b>Marca:</b> ${p.marca || "-"}<br><b>Modelo:</b> ${p.modelo || "-"}<br><b>Tipo:</b> ${p.tipo_item || "-"}</div><button class="btn ${ja ? "gray" : "blue"}" ${ja ? "disabled" : ""} onclick='addItem(${json})'>${ja ? "✅ No carrinho" : "➕ Adicionar"}</button></div>`;
  }).join("")}</div>`;
}
function addItem(p){ if(itensPedido.some(i => Number(i.id) === Number(p.id))) return; itensPedido.push(p); salvarCarrinhoLocal(); renderizarCarrinho(); filtrarCatalogo(); }
function removerItem(id){ itensPedido = itensPedido.filter(i => Number(i.id) !== Number(id)); salvarCarrinhoLocal(); renderizarCarrinho(); filtrarCatalogo(); }
function limparCarrinho(){ itensPedido = []; limparCarrinhoLocal(); renderizarCarrinho(); filtrarCatalogo(); }
function renderizarCarrinho(){
  const el = document.getElementById("listaItensPedido");
  if(!el) return;
  if(!itensPedido.length){ el.innerHTML = '<div class="info">Carrinho vazio.</div>'; return; }
  el.innerHTML = `<div class="info"><b>${itensPedido.length}</b> item(ns) no carrinho. <button class="btn gray" onclick="limparCarrinho()">Limpar</button></div>` + itensPedido.map(p => `
    <div class="cart-item"><div><strong>${p.codigo_qr || "-"}</strong></div><div>${p.nome_bem || "-"}<br><small>${p.marca || "-"} | ${p.modelo || "-"}</small></div><button class="btn gray" onclick="removerItem(${p.id})">Remover</button></div>
  `).join("");
}

async function criarPedido(){
  if(!itensPedido.length){ alert("Adicione itens ao pedido."); return; }
  const dest = document.getElementById("obraDestino");
  const obraId = dest.value;
  const obraNome = dest.options[dest.selectedIndex]?.dataset.nome || dest.options[dest.selectedIndex]?.text || "-";
  const u = usuarioAtual();
  const codigo = "PED-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-6);

  const ids = itensPedido.map(p => p.id);
  const abertos = await db().from("pedidos_retirada").select("id,status").in("status", STATUS_ABERTOS);
  const idsPed = (abertos.data || []).map(p => p.id);

  if(idsPed.length){
    const it = await db().from("itens_retirada").select("patrimonio_id").in("pedido_id", idsPed).in("patrimonio_id", ids).neq("status", "NEGADO");
    if((it.data || []).length){ alert("Alguns itens já foram reservados por outro pedido."); await carregarCatalogo(); return; }
  }

  const payload = {
    codigo,
    obra_id: obraId,
    obra_nome: obraNome,
    solicitante: u?.nome || "Usuário",
    usuario_criacao: u?.nome || "Usuário",
    status: "AGUARDANDO_AUTORIZACAO",
    obra_origem_id: valor("obraOrigem"),
    obra_destino_id: obraId,
    observacao: valor("observacaoPedido")
  };

  const r = await db().from("pedidos_retirada").insert([payload]).select().single();
  if(r.error){ alert(r.error.message); return; }

  const itens = itensPedido.map(p => ({
    pedido_id: r.data.id,
    patrimonio_id: p.id,
    patrimonio_codigo: p.codigo_qr,
    patrimonio_nome: p.nome_bem,
    endereco_codigo: p.endereco_codigo || p.localizacao_fisica || "SEM ENDEREÇO",
    obra_origem_id: p.obra_id,
    obra_destino_id: obraId,
    status: "PENDENTE"
  }));

  const ri = await db().from("itens_retirada").insert(itens);
  if(ri.error){ alert(ri.error.message); return; }

  await hist(r.data.id, null, "AGUARDANDO_AUTORIZACAO", `Pedido criado por ${u?.nome || "Usuário"} e enviado para autorização.`);
  som("ok");
  toast("Pedido criado", "Enviado para autorização.");
  limparCarrinho();
  document.getElementById("observacaoPedido").value = "";
  await carregarTudo();
}

function progresso(status){
  const idx = FLUXO_PEDIDO.findIndex(x => x[0] === status);
  if(status === "NEGADO") return `<div class="progresso"><div class="prog-step err">Negado</div></div>`;
  if(status === "RECEBIDO_COM_DIVERGENCIA"){
    return `<div class="progresso">${FLUXO_PEDIDO.map((x,k) => `<div class="prog-step ${k < 5 ? "done" : "err"}">${x[1]}</div>`).join("")}<div class="prog-step err">Divergência</div></div>`;
  }
  return `<div class="progresso">${FLUXO_PEDIDO.map((x,k) => {
    const classe = idx > k ? "done" : idx === k ? "on" : "";
    return `<div class="prog-step ${classe}">${x[1]}</div>`;
  }).join("")}</div>`;
}

function cardPedido(p, modo){
  const itens = p.itens_retirada || [];
  return `<div class="pedido-card" id="pedido-${modo}-${p.id}">
    <div class="pedido-top" onclick="togglePedido('${modo}',${p.id})">
      <div class="pedido-cod">${p.codigo || "PED-" + p.id}</div>
      <div class="pedido-info"><b>${p.obra_nome || "-"}</b><br><small>Solicitante: ${p.solicitante || "-"}</small></div>
      <div><span class="status st-${cls(p.status)}">${rotulo(p.status)}</span><br><small>${itens.length} item(ns)</small></div>
      <div>${dataBR(p.created_at || p.data_criacao || p.data_pedido)}</div>
      <div onclick="event.stopPropagation()">${acoesPedido(p, modo)}</div>
    </div>
    <div class="pedido-det">
      ${progresso(p.status)}
      ${painelRastreio(p)}
      ${podeTudo() ? painelMaster(p) : ""}
      <b>Observação:</b> ${p.observacao || "-"}<br>
      <b>Transporte:</b> ${p.motorista_nome || "-"} • ${p.veiculo_placa || "-"} • ${p.transportadora || "-"}<br>
      <b>Saída:</b> ${dataBR(p.data_saida_cd)}
      <h4>Itens do pedido</h4>
      <div class="item-list">${itens.map(i => itemHTML(p, i, modo)).join("")}</div>
      <h4>Histórico</h4>
      ${historicoPedidoHTML(p.historico || [])}
    </div>
  </div>`;
}

function painelRastreio(p){
  const h = Array.isArray(p.historico) ? p.historico : [];
  const porStatus = s => h.find(x => x.status_novo === s);
  const criado = porStatus("AGUARDANDO_AUTORIZACAO") || {};
  const autorizado = porStatus("EM_SEPARACAO") || {};
  const separado = porStatus("AGUARDANDO_RETIRADA") || {};
  const transito = porStatus("EM_TRANSITO") || {};
  const recebido = porStatus("AGUARDANDO_CONFERENCIA") || {};
  const conferido = porStatus("ENTREGUE") || porStatus("RECEBIDO_COM_DIVERGENCIA") || {};
  const negado = porStatus("NEGADO") || {};
  const blocos = [
    ["📝 Quem pediu", p.solicitante || p.usuario_criacao || criado.usuario || "-", criado.created_at || p.created_at || p.data_criacao || "", criado.observacao || "Pedido enviado"],
    ["✅ Quem autorizou", autorizado.usuario || "-", autorizado.created_at || "", autorizado.observacao || "-"],
    ["📦 Quem separou", separado.usuario || "-", separado.created_at || "", separado.observacao || "-"],
    ["🚚 Saída / transporte", p.usuario_saida_cd || transito.usuario || "-", p.data_saida_cd || transito.created_at || "", `${p.motorista_nome || "-"} • ${p.veiculo_placa || "-"} • ${p.transportadora || "-"}`],
    ["📥 Quem recebeu", p.usuario_recebimento || recebido.usuario || "-", p.data_recebimento || recebido.created_at || "", recebido.observacao || "-"],
    ["🔎 Quem conferiu", p.usuario_conferencia || conferido.usuario || "-", p.data_conferencia || conferido.created_at || "", p.divergencia ? (p.observacao_divergencia || "Com divergência") : (conferido.observacao || "-")]
  ];
  if(p.status === "NEGADO") blocos.push(["🚫 Negado por", p.usuario_recusa || negado.usuario || "-", p.data_recusa || negado.created_at || "", p.motivo_recusa || negado.observacao || "-"]);
  return `<div class="rastro-grid">${blocos.map(b => `<div class="rastro-card"><b>${b[0]}</b><br>${b[1]}<br><small>${dataBR(b[2])}</small><br>${b[3]}</div>`).join("")}</div>`;
}

function historicoPedidoHTML(hist){
  if(!hist.length) return `<div class="historico-pedido"><div class="hist-linha">Sem histórico registrado ainda.</div></div>`;
  return `<div class="historico-pedido">${hist.slice().sort((a,b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).map(h => `
    <div class="hist-linha"><b>${rotulo(h.status_anterior)} → ${rotulo(h.status_novo)}</b><br><small>${h.usuario || "-"} • ${dataBR(h.created_at)}</small><br>${h.observacao || "-"}</div>
  `).join("")}</div>`;
}

function painelMaster(p){
  const idx = FLUXO_PEDIDO.findIndex(x => x[0] === p.status);
  return `<div class="master-box" onclick="event.stopPropagation()">
    <div class="master-title">👑 Ações MASTER</div>
    <div class="master-actions">
      ${p.status === "AGUARDANDO_AUTORIZACAO" ? `<button class="btn green" onclick="autorizar(${p.id})">✅ Autorizar</button>` : ""}
      ${p.status === "EM_SEPARACAO" ? `<button class="btn purple" onclick="forcarSeparacaoPedido(${p.id})">📦 Finalizar separação</button>` : ""}
      ${p.status === "AGUARDANDO_RETIRADA" ? `<button class="btn green" onclick="abrirSaida(${p.id})">🚚 Dar saída</button>` : ""}
      ${p.status === "EM_TRANSITO" ? `<button class="btn orange" onclick="receberPedido(${p.id})">📥 Receber obra</button>` : ""}
      ${p.status === "AGUARDANDO_CONFERENCIA" ? `<button class="btn green" onclick="abrirConferencia(${p.id})">✅ Conferir</button>` : ""}
      ${(idx >= 0 && idx < FLUXO_PEDIDO.length - 1) ? `<button class="btn blue" onclick="avancarPedidoMaster(${p.id})">⏭ Avançar</button>` : ""}
      ${(idx > 0 && !["ENTREGUE","NEGADO"].includes(p.status)) ? `<button class="btn gray" onclick="voltarPedidoMaster(${p.id})">↩ Voltar</button>` : ""}
      ${p.status !== "NEGADO" ? `<button class="btn red" onclick="negarPedido(${p.id})">🚫 Negar</button>` : ""}
      ${["NEGADO","ENTREGUE","RECEBIDO_COM_DIVERGENCIA"].includes(p.status) ? `<button class="btn dark" onclick="reabrirPedidoMaster(${p.id})">🔄 Reabrir</button>` : ""}
      <button class="btn dark" onclick="alterarStatusManual(${p.id})">🛠 Corrigir status</button>
    </div>
  </div>`;
}

function itemHTML(p, i, modo){
  const jaEnd = leituras[i.id]?.endereco;
  const jaPat = leituras[i.id]?.patrimonio;
  return `<div class="item"><strong>${i.patrimonio_codigo || "-"}</strong><br>${i.patrimonio_nome || "-"}<br>Status: <span class="status st-${cls(i.status)}">${rotulo(i.status)}</span><br>Endereço: ${i.endereco_codigo || "-"}
    ${i.usuario_separacao ? `<div class="rastreio"><b>Separado por:</b> ${i.usuario_separacao}<br>${dataBR(i.data_separacao)}</div>` : ""}
    ${modo === "separar" && p.status === "EM_SEPARACAO" ? `<div class="scan-actions">
      <button class="btn dark" onclick="abrirScanner('ENDERECO',${p.id},${i.id},'${escapeAttr(i.endereco_codigo || "")}', '${escapeAttr(i.patrimonio_codigo || "")}')">📍 Bip prateleira ${jaEnd ? "✅" : ""}</button>
      <button class="btn blue" onclick="abrirScanner('PATRIMONIO',${p.id},${i.id},'${escapeAttr(i.patrimonio_codigo || "")}', '')">🏷 Bip patrimônio ${jaPat ? "✅" : ""}</button>
      <button class="btn green" onclick="confirmarSeparacao(${p.id},${i.id})">Confirmar</button>
    </div>` : ""}
  </div>`;
}
function escapeAttr(v){ return String(v || "").replaceAll("'", "&#39;").replaceAll("\"", "&quot;"); }

function acoesPedido(p, modo){
  if(modo === "autorizar" && p.status === "AGUARDANDO_AUTORIZACAO" && podeAlmoxarifado()) return `<button class="btn green" onclick="autorizar(${p.id})">Autorizar</button> <button class="btn red" onclick="negarPedido(${p.id})">Negar</button>`;
  if(modo === "separar" && p.status === "EM_SEPARACAO" && podeAlmoxarifado()) return `<button class="btn purple" onclick="togglePedido('${modo}',${p.id})">Separar</button>`;
  if(modo === "saida" && p.status === "AGUARDANDO_RETIRADA" && podeAlmoxarifado()) return `<button class="btn green" onclick="abrirSaida(${p.id})">Dar saída</button>`;
  if(modo === "receber" && p.status === "EM_TRANSITO") return `<button class="btn orange" onclick="receberPedido(${p.id})">Receber obra</button>`;
  if(modo === "receber" && p.status === "AGUARDANDO_CONFERENCIA") return `<button class="btn green" onclick="abrirConferencia(${p.id})">Conferir</button>`;
  return `<button class="btn blue" onclick="togglePedido('${modo}',${p.id})">Detalhes</button>`;
}
function togglePedido(modo, id){ document.getElementById(`pedido-${modo}-${id}`)?.classList.toggle("aberto"); }

function renderizarTudo(){
  renderizarCarrinho();
  renderizarResumo();
  renderizarLista("TODOS");
  renderizarLista("AUTORIZAR");
  renderizarLista("SEPARAR");
  renderizarLista("SAIDA");
  renderizarLista("RECEBER");
}
function renderizarResumo(){
  const box = document.getElementById("resumoPedidos");
  if(!box) return;
  const count = s => pedidos.filter(p => p.status === s).length;
  const cards = [
    ["Total", pedidos.length],
    ["Autorização", count("AGUARDANDO_AUTORIZACAO")],
    ["Separação", count("EM_SEPARACAO")],
    ["Retirada", count("AGUARDANDO_RETIRADA")],
    ["Trânsito", count("EM_TRANSITO")],
    ["Conferência", count("AGUARDANDO_CONFERENCIA")]
  ];
  box.innerHTML = cards.map(c => `<div class="resumo-card"><strong>${c[1]}</strong><span>${c[0]}</span></div>`).join("");
}
function renderizarLista(tipo){
  let lista = [], el, modo = "todos";
  if(tipo === "TODOS"){ lista = pedidos; el = document.getElementById("listaTodos"); modo = "todos"; }
  if(tipo === "AUTORIZAR"){ lista = pedidos.filter(p => p.status === "AGUARDANDO_AUTORIZACAO"); el = document.getElementById("listaAutorizar"); modo = "autorizar"; }
  if(tipo === "SEPARAR"){ lista = pedidos.filter(p => p.status === "EM_SEPARACAO"); el = document.getElementById("listaSeparar"); modo = "separar"; }
  if(tipo === "SAIDA"){ lista = pedidos.filter(p => ["AGUARDANDO_RETIRADA","EM_TRANSITO"].includes(p.status)); el = document.getElementById("listaSaida"); modo = "saida"; }
  if(tipo === "RECEBER"){ lista = pedidos.filter(p => ["EM_TRANSITO","AGUARDANDO_CONFERENCIA","ENTREGUE","RECEBIDO_COM_DIVERGENCIA"].includes(p.status)); el = document.getElementById("listaReceber"); modo = "receber"; }
  if(!el) return;
  const busca = tipo === "TODOS" ? valor("buscaTodos").toLowerCase() : "";
  if(busca){
    lista = lista.filter(p => `${p.codigo || ""} ${p.obra_nome || ""} ${p.solicitante || ""} ${p.status || ""} ${(p.itens_retirada || []).map(i => (i.patrimonio_codigo || "") + " " + (i.patrimonio_nome || "")).join(" ")}`.toLowerCase().includes(busca));
  }
  el.innerHTML = lista.length ? lista.map(p => cardPedido(p, modo)).join("") : '<div class="vazio">Nenhum pedido encontrado.</div>';
}

async function hist(pedidoId, ant, novo, obs, itemId=null){
  const u = usuarioAtual();
  const base = { pedido_id: pedidoId, item_id: itemId, status_anterior: ant, status_novo: novo, usuario: u?.nome || "Usuário", observacao: obs, created_at: new Date().toISOString() };
  let resp = await db().from("historico_pedidos_retirada").insert([base]);
  if(resp.error && String(resp.error.message || "").includes("created_at")){
    const { created_at, ...semData } = base;
    resp = await db().from("historico_pedidos_retirada").insert([semData]);
  }
  if(resp.error) console.warn("Histórico não gravado:", resp.error.message);
}
async function updatePedido(id, payload){
  let resp = await db().from("pedidos_retirada").update(payload).eq("id", id);
  if(!resp.error) return resp;
  const msg = String(resp.error.message || "");
  if(msg.includes("column") || msg.includes("does not exist")){
    resp = await db().from("pedidos_retirada").update({ status: payload.status }).eq("id", id);
  }
  return resp;
}
async function autorizar(id){
  if(!podeAlmoxarifado()){ alert("Sem permissão."); return; }
  const p = pedidos.find(x => String(x.id) === String(id));
  if(!confirm("Autorizar solicitação?")) return;
  const u = usuarioAtual();
  const r = await updatePedido(id, { status:"EM_SEPARACAO", usuario_autorizacao:u?.nome || "Usuário", data_autorizacao:new Date().toISOString() });
  if(r.error){ alert(r.error.message); return; }
  await hist(id, p?.status, "EM_SEPARACAO", `Pedido autorizado por ${u?.nome || "Usuário"}.`);
  som("ok"); await carregarTudo();
}
async function negarPedido(id){
  if(!podeAlmoxarifado()){ alert("Sem permissão."); return; }
  const motivo = prompt("Motivo da negativa:");
  if(!motivo) return;
  const p = pedidos.find(x => String(x.id) === String(id));
  const u = usuarioAtual();
  await updatePedido(id, { status:"NEGADO", motivo_recusa:motivo, usuario_recusa:u?.nome || "Usuário", data_recusa:new Date().toISOString() });
  await db().from("itens_retirada").update({ status:"NEGADO" }).eq("pedido_id", id);
  await hist(id, p?.status, "NEGADO", "Pedido negado: " + motivo);
  som("erro"); await carregarTudo();
}

async function abrirScanner(tipo, pedidoId, itemId, esperado, proximo=""){
  scanCtx = { tipo, pedidoId, itemId, esperado:String(esperado || ""), proximo:String(proximo || "") };
  const titulo = tipo === "ENDERECO" ? "📍 Bipar prateleira/endereço" : "🏷 Bipar patrimônio";
  document.getElementById("scannerTitulo").innerText = titulo;
  document.getElementById("scanStatus").innerText = `Esperado: ${scanCtx.esperado || "-"}`;
  document.getElementById("modalScanner").classList.add("ativo");
  try{
    if(scanner){ await fecharScanner(false); }
    scanner = new Html5Qrcode("reader");
    await scanner.start({ facingMode:"environment" }, { fps:10, qrbox:250 }, codigo => processarLeitura(codigo), () => {});
  }catch(e){
    alert("Erro ao abrir câmera: " + (e.message || e));
  }
}
function extrairCodigo(codigo){
  try{ const u = new URL(codigo); return u.searchParams.get("id") || codigo; }
  catch(e){ return codigo; }
}
async function processarLeitura(codigo){
  if(!scanCtx) return;
  const lido = extrairCodigo(String(codigo || "").trim());
  const esperado = String(scanCtx.esperado || "").trim();
  if(lido === esperado){
    som("ok");
    toast("Bip correto", lido);
    leituras[scanCtx.itemId] = leituras[scanCtx.itemId] || {};
    if(scanCtx.tipo === "ENDERECO") leituras[scanCtx.itemId].endereco = true;
    if(scanCtx.tipo === "PATRIMONIO") leituras[scanCtx.itemId].patrimonio = true;
    const ctxAnterior = {...scanCtx};
    await fecharScanner(false);
    if(ctxAnterior.tipo === "ENDERECO" && ctxAnterior.proximo){
      setTimeout(() => abrirScanner("PATRIMONIO", ctxAnterior.pedidoId, ctxAnterior.itemId, ctxAnterior.proximo, ""), 700);
    }
  }else{
    som("erro");
    document.getElementById("scanStatus").innerText = `❌ Código errado. Lido: ${lido} | Esperado: ${esperado}`;
    toast("Código não confere", `Lido: ${lido} | Esperado: ${esperado}`);
  }
}
async function fecharScanner(limparCtx=true){
  try{
    if(scanner){ await scanner.stop().catch(() => {}); await scanner.clear().catch(() => {}); scanner = null; }
  }catch(e){}
  document.getElementById("modalScanner")?.classList.remove("ativo");
  if(limparCtx) scanCtx = null;
}
async function confirmarSeparacao(pedidoId, itemId){
  const l = leituras[itemId] || {};
  if(!l.endereco || !l.patrimonio){
    som("erro"); alert("Bipe a prateleira/endereço e o patrimônio antes de confirmar."); return;
  }
  const u = usuarioAtual();
  await db().from("itens_retirada").update({ status:"SEPARADO", usuario_separacao:u?.nome || "Usuário", data_separacao:new Date().toISOString() }).eq("id", itemId);
  await hist(pedidoId, "PENDENTE", "SEPARADO", "Item separado com bip de endereço e patrimônio.", itemId);
  const p = pedidos.find(x => String(x.id) === String(pedidoId));
  const itens = (p?.itens_retirada || []).filter(i => i.status !== "NEGADO");
  const ja = itens.filter(i => String(i.id) === String(itemId) || i.status === "SEPARADO").length;
  if(ja >= itens.length){
    await updatePedido(pedidoId, { status:"AGUARDANDO_RETIRADA" });
    await hist(pedidoId, "EM_SEPARACAO", "AGUARDANDO_RETIRADA", "Separação finalizada. Aguardando retirada/saída.");
  }
  som("ok"); await carregarTudo();
}
async function forcarSeparacaoPedido(id){
  if(!podeAlmoxarifado()) return;
  if(!confirm("Finalizar separação do pedido?")) return;
  const p = pedidos.find(x => String(x.id) === String(id));
  const u = usuarioAtual();
  await db().from("itens_retirada").update({ status:"SEPARADO", usuario_separacao:u?.nome || "Usuário", data_separacao:new Date().toISOString() }).eq("pedido_id", id).neq("status", "NEGADO");
  await updatePedido(id, { status:"AGUARDANDO_RETIRADA" });
  await hist(id, p?.status, "AGUARDANDO_RETIRADA", `Separação finalizada por ${u?.nome || "Usuário"}.`);
  som("ok"); await carregarTudo();
}

function abrirSaida(id){
  document.getElementById("saidaPedidoId").value = id;
  const a = new Date(); a.setMinutes(a.getMinutes() - a.getTimezoneOffset());
  document.getElementById("data_saida_cd").value = a.toISOString().slice(0,16);
  document.getElementById("modalSaida").classList.add("ativo");
}
function fecharModal(id){ document.getElementById(id)?.classList.remove("ativo"); }
async function confirmarSaida(){
  const id = valor("saidaPedidoId");
  const p = pedidos.find(x => String(x.id) === String(id));
  const motorista = valor("motorista_nome");
  const placa = valor("veiculo_placa");
  if(!motorista || !placa){ alert("Informe motorista/responsável e placa."); return; }
  const u = usuarioAtual();
  const dataSaida = valor("data_saida_cd") ? new Date(valor("data_saida_cd")).toISOString() : new Date().toISOString();
  const r = await updatePedido(id, { status:"EM_TRANSITO", motorista_nome:motorista, veiculo_placa:placa, transportadora:valor("transportadora"), observacao_transporte:valor("observacao_transporte"), data_saida_cd:dataSaida, usuario_saida_cd:u?.nome || "Usuário" });
  if(r.error){ alert(r.error.message); return; }
  await db().from("itens_retirada").update({ status:"RETIRADO", usuario_retirada:u?.nome || "Usuário", data_retirada:new Date().toISOString() }).eq("pedido_id", id).neq("status", "NEGADO");
  await hist(id, p?.status, "EM_TRANSITO", `Saída registrada por ${u?.nome || "Usuário"}: ${motorista} | Placa: ${placa}`);
  som("ok"); fecharModal("modalSaida"); await carregarTudo();
}
async function receberPedido(id){
  const p = pedidos.find(x => String(x.id) === String(id));
  const u = usuarioAtual();
  if(!podeTudo() && u?.obra_id && String(u.obra_id) !== String(p?.obra_id || p?.obra_destino_id)){
    alert("Você só pode receber pedidos da sua obra/setor."); return;
  }
  if(!confirm("Confirmar recebimento na obra?")) return;
  await updatePedido(id, { status:"AGUARDANDO_CONFERENCIA", usuario_recebimento:u?.nome || "Usuário", data_recebimento:new Date().toISOString() });
  await db().from("itens_retirada").update({ usuario_recebimento:u?.nome || "Usuário", data_recebimento:new Date().toISOString() }).eq("pedido_id", id).neq("status", "NEGADO");
  await hist(id, p?.status, "AGUARDANDO_CONFERENCIA", `Pedido recebido na obra por ${u?.nome || "Usuário"}. Aguardando conferência.`);
  som("ok"); await carregarTudo();
}
function abrirConferencia(id){
  document.getElementById("confPedidoId").value = id;
  document.getElementById("observacao_divergencia").value = "";
  document.getElementById("modalConferencia").classList.add("ativo");
}
async function conferirPedido(divergencia){
  const id = valor("confPedidoId");
  const p = pedidos.find(x => String(x.id) === String(id));
  const u = usuarioAtual();
  const obs = valor("observacao_divergencia");
  if(divergencia && !obs){ alert("Informe a divergência."); return; }
  const novo = divergencia ? "RECEBIDO_COM_DIVERGENCIA" : "ENTREGUE";
  await updatePedido(id, { status:novo, divergencia, observacao_divergencia:obs, usuario_conferencia:u?.nome || "Usuário", data_conferencia:new Date().toISOString() });
  await db().from("itens_retirada").update({ status: divergencia ? "DIVERGENCIA" : "ENTREGUE", usuario_conferencia:u?.nome || "Usuário", data_conferencia:new Date().toISOString() }).eq("pedido_id", id).neq("status", "NEGADO");
  if(!divergencia){
    for(const item of (p?.itens_retirada || [])){
      if(item.patrimonio_id){
        await db().from("patrimonio").update({ status:"EM_USO", obra_id:p.obra_id || p.obra_destino_id, localizacao:p.obra_nome || "" }).eq("id", item.patrimonio_id);
      }
    }
  }
  await hist(id, p?.status, novo, divergencia ? "Conferido com divergência: " + obs : `Conferido sem divergência por ${u?.nome || "Usuário"}. Pedido recebido.`);
  som(divergencia ? "erro" : "ok"); fecharModal("modalConferencia"); await carregarTudo();
}

async function avancarPedidoMaster(id){
  if(!podeTudo()) return;
  const p = pedidos.find(x => String(x.id) === String(id));
  const idx = FLUXO_PEDIDO.findIndex(x => x[0] === p?.status);
  if(idx < 0 || idx >= FLUXO_PEDIDO.length - 1) return;
  const novo = FLUXO_PEDIDO[idx + 1][0];
  if(!confirm(`Avançar pedido para ${rotulo(novo)}?`)) return;
  await updatePedido(id, { status:novo });
  await hist(id, p.status, novo, "Status avançado manualmente pelo MASTER.");
  som("ok"); await carregarTudo();
}
async function voltarPedidoMaster(id){
  if(!podeTudo()) return;
  const p = pedidos.find(x => String(x.id) === String(id));
  const idx = FLUXO_PEDIDO.findIndex(x => x[0] === p?.status);
  if(idx <= 0) return;
  const novo = FLUXO_PEDIDO[idx - 1][0];
  if(!confirm(`Voltar pedido para ${rotulo(novo)}?`)) return;
  await updatePedido(id, { status:novo });
  await hist(id, p.status, novo, "Status voltou manualmente pelo MASTER.");
  som("ok"); await carregarTudo();
}
async function reabrirPedidoMaster(id){
  if(!podeTudo()) return;
  const p = pedidos.find(x => String(x.id) === String(id));
  if(!confirm("Reabrir pedido para EM SEPARAÇÃO?")) return;
  await updatePedido(id, { status:"EM_SEPARACAO" });
  await hist(id, p?.status, "EM_SEPARACAO", "Pedido reaberto pelo MASTER.");
  som("ok"); await carregarTudo();
}
async function alterarStatusManual(id){
  if(!podeTudo()) return;
  const p = pedidos.find(x => String(x.id) === String(id));
  const novo = prompt("Digite o novo status:", p?.status || "");
  if(!novo) return;
  await updatePedido(id, { status:novo.trim().toUpperCase() });
  await hist(id, p?.status, novo.trim().toUpperCase(), "Status corrigido manualmente pelo MASTER.");
  som("ok"); await carregarTudo();
}

function iniciarRealtimePedidos(){
  try{
    const banco = db();
    if(!banco || !banco.channel) return;
    if(canalPedidos){ banco.removeChannel(canalPedidos); }
    canalPedidos = banco.channel("bdr-pedidos-tela-lista")
      .on("postgres_changes", {event:"*", schema:"public", table:"pedidos_retirada"}, () => carregarTudo())
      .on("postgres_changes", {event:"*", schema:"public", table:"itens_retirada"}, () => carregarTudo())
      .subscribe();
  }catch(e){ console.warn("Realtime indisponível:", e); }
}

/* =========================================================
   BDR PATCH MOBILE / TABLET - SEPARAÇÃO COM BIP
   - Tela simples para estoque
   - 1 bip correto / 2 bips erro
   - Bipa endereço e abre automaticamente patrimônio
   - Produto correto marca item como separado automaticamente
   - Pedido só vai para AGUARDANDO_RETIRADA ao clicar Finalizar separação
========================================================= */
let modoSeparacaoAtual = null;

function itemEstaSeparado(i){
  return String(i?.status || '').toUpperCase() === 'SEPARADO' ||
         String(i?.status || '').toUpperCase() === 'RETIRADO' ||
         String(i?.status || '').toUpperCase() === 'ENTREGUE';
}

function itensValidosSeparacao(p){
  return (p?.itens_retirada || []).filter(i => String(i.status || '').toUpperCase() !== 'NEGADO');
}

function totalSeparadoPedido(p){
  return itensValidosSeparacao(p).filter(itemEstaSeparado).length;
}

function pedidoSeparacaoCompleta(p){
  const itens = itensValidosSeparacao(p);
  return itens.length > 0 && itens.every(itemEstaSeparado);
}

function proximoItemSeparacao(p){
  return itensValidosSeparacao(p).find(i => !itemEstaSeparado(i)) || null;
}

function abrirAbaSeparacao(){
  const btn = document.querySelector('[data-tab-separar]') || Array.from(document.querySelectorAll('.tab-btn')).find(b => (b.textContent || '').includes('Separar'));
  abrirAba('separar', btn);
}

function renderizarLista(tipo){
  let lista = [], el, modo = 'todos';
  if(tipo === 'TODOS'){ lista = pedidos; el = document.getElementById('listaTodos'); modo = 'todos'; }
  if(tipo === 'AUTORIZAR'){ lista = pedidos.filter(p => p.status === 'AGUARDANDO_AUTORIZACAO'); el = document.getElementById('listaAutorizar'); modo = 'autorizar'; }
  if(tipo === 'SEPARAR'){ lista = pedidos.filter(p => p.status === 'EM_SEPARACAO'); el = document.getElementById('listaSeparar'); modo = 'separar'; }
  if(tipo === 'SAIDA'){ lista = pedidos.filter(p => ['AGUARDANDO_RETIRADA','EM_TRANSITO'].includes(p.status)); el = document.getElementById('listaSaida'); modo = 'saida'; }
  if(tipo === 'RECEBER'){ lista = pedidos.filter(p => ['EM_TRANSITO','AGUARDANDO_CONFERENCIA','ENTREGUE','RECEBIDO_COM_DIVERGENCIA'].includes(p.status)); el = document.getElementById('listaReceber'); modo = 'receber'; }
  if(!el) return;

  const busca = tipo === 'TODOS' ? valor('buscaTodos').toLowerCase() : '';
  if(busca){
    lista = lista.filter(p => `${p.codigo || ''} ${p.obra_nome || ''} ${p.solicitante || ''} ${p.status || ''} ${(p.itens_retirada || []).map(i => (i.patrimonio_codigo || '') + ' ' + (i.patrimonio_nome || '')).join(' ')}`.toLowerCase().includes(busca));
  }

  if(tipo === 'SEPARAR'){
    el.innerHTML = lista.length ? lista.map(p => cardSeparacaoMobile(p)).join('') : '<div class="vazio">Nenhum pedido em separação.</div>';
    return;
  }

  el.innerHTML = lista.length ? lista.map(p => cardPedido(p, modo)).join('') : '<div class="vazio">Nenhum pedido encontrado.</div>';
}

function cardSeparacaoMobile(p){
  const itens = itensValidosSeparacao(p);
  const separados = totalSeparadoPedido(p);
  const atual = proximoItemSeparacao(p);
  const pct = itens.length ? Math.round((separados / itens.length) * 100) : 0;
  const completo = pedidoSeparacaoCompleta(p);
  const codigo = p.codigo || ('PED-' + p.id);

  return `
    <div class="sep-mobile-card" id="sep-pedido-${p.id}">
      <div class="sep-mobile-head">
        <div>
          <div class="sep-label">Pedido</div>
          <div class="sep-codigo">${codigo}</div>
          <div class="sep-sub">${p.obra_nome || '-'} • ${p.solicitante || '-'}</div>
        </div>
        <span class="status st-${cls(p.status)}">${rotulo(p.status)}</span>
      </div>

      <div class="sep-progress-wrap">
        <div class="sep-progress-info"><b>${separados}/${itens.length}</b> item(ns) separado(s)</div>
        <div class="sep-progress"><span style="width:${pct}%"></span></div>
      </div>

      ${completo ? `
        <div class="sep-done-box">
          <div class="sep-big-icon">✅</div>
          <h3>Todos os itens foram separados</h3>
          <p>Confira rapidamente e finalize para liberar o pedido para retirada.</p>
          <button class="sep-primary green" onclick="finalizarSeparacaoPedido(${p.id})">✅ Finalizar separação</button>
        </div>
      ` : `
        <div class="sep-atual">
          <div class="sep-label">Item atual</div>
          <h2>${atual?.patrimonio_nome || '-'}</h2>
          <div class="sep-pat">${atual?.patrimonio_codigo || '-'}</div>
          <div class="sep-endereco">📍 ${atual?.endereco_codigo || 'SEM ENDEREÇO'}</div>
          <button class="sep-primary" onclick="iniciarSeparacaoMobile(${p.id})">📷 Iniciar leitura</button>
          <div class="sep-help">Bipe primeiro a prateleira. Se estiver certo, o sistema abre automaticamente o bip do produto.</div>
        </div>
      `}

      <details class="sep-lista">
        <summary>Ver lista completa dos itens</summary>
        ${itens.map(i => itemSeparacaoMobileHTML(p, i)).join('')}
      </details>
    </div>
  `;
}

function itemSeparacaoMobileHTML(p, i){
  const ok = itemEstaSeparado(i);
  return `
    <div class="sep-item ${ok ? 'ok' : ''}">
      <div><b>${i.patrimonio_codigo || '-'}</b><br>${i.patrimonio_nome || '-'}</div>
      <div class="sep-item-status">${ok ? '✅ Separado' : '⏳ Pendente'}</div>
      <small>📍 ${i.endereco_codigo || 'SEM ENDEREÇO'}</small>
      ${i.usuario_separacao ? `<small>Separado por ${i.usuario_separacao} • ${dataBR(i.data_separacao)}</small>` : ''}
    </div>
  `;
}

async function iniciarSeparacaoMobile(pedidoId){
  const p = pedidos.find(x => String(x.id) === String(pedidoId));
  if(!p){ alert('Pedido não encontrado.'); return; }
  const item = proximoItemSeparacao(p);
  if(!item){
    som('ok');
    toast('Separação concluída', 'Clique em Finalizar separação para liberar a retirada.');
    return;
  }
  modoSeparacaoAtual = { pedidoId, itemId:item.id };
  await abrirScannerMobile('ENDERECO', pedidoId, item.id, item.endereco_codigo || '', item.patrimonio_codigo || '');
}

async function abrirScannerMobile(tipo, pedidoId, itemId, esperado, proximo=''){
  scanCtx = {
    tipo,
    pedidoId,
    itemId,
    esperado:String(esperado || '').trim(),
    proximo:String(proximo || '').trim(),
    autoConfirmarProduto:true,
    mobile:true
  };

  const titulo = tipo === 'ENDERECO' ? '📍 Bipe a prateleira' : '🏷 Bipe o patrimônio';
  const ajuda = tipo === 'ENDERECO' ? 'Aponte para o QR da prateleira/endereço.' : 'Aponte para a etiqueta do patrimônio.';
  const tituloEl = document.getElementById('scannerTitulo');
  const statusEl = document.getElementById('scanStatus');
  if(tituloEl) tituloEl.innerText = titulo;
  if(statusEl) statusEl.innerHTML = `<div>${ajuda}</div><b>Esperado: ${scanCtx.esperado || '-'}</b>`;
  document.getElementById('modalScanner')?.classList.add('ativo');

  try{
    if(scanner){ await fecharScanner(false); }
    scanner = new Html5Qrcode('reader');
    await scanner.start(
      { facingMode:'environment' },
      { fps:10, qrbox: Math.min(280, Math.floor(window.innerWidth * 0.72)) },
      codigo => processarLeitura(codigo),
      () => {}
    );
  }catch(e){
    alert('Erro ao abrir câmera: ' + (e.message || e));
  }
}

async function processarLeitura(codigo){
  if(!scanCtx) return;
  const lido = extrairCodigo(String(codigo || '').trim());
  const esperado = String(scanCtx.esperado || '').trim();

  if(lido === esperado){
    som('ok');
    toast('Bip correto', lido);

    leituras[scanCtx.itemId] = leituras[scanCtx.itemId] || {};
    if(scanCtx.tipo === 'ENDERECO') leituras[scanCtx.itemId].endereco = true;
    if(scanCtx.tipo === 'PATRIMONIO') leituras[scanCtx.itemId].patrimonio = true;

    const ctxAnterior = {...scanCtx};
    await fecharScanner(false);

    if(ctxAnterior.tipo === 'ENDERECO' && ctxAnterior.proximo){
      setTimeout(() => abrirScannerMobile('PATRIMONIO', ctxAnterior.pedidoId, ctxAnterior.itemId, ctxAnterior.proximo, ''), 650);
      return;
    }

    if(ctxAnterior.tipo === 'PATRIMONIO' && ctxAnterior.autoConfirmarProduto){
      await confirmarSeparacao(ctxAnterior.pedidoId, ctxAnterior.itemId, true);
    }
    return;
  }

  som('erro');
  const statusEl = document.getElementById('scanStatus');
  if(statusEl){
    statusEl.innerHTML = `<div class="scan-erro">❌ Código errado</div><b>Esperado: ${esperado || '-'}</b><br><small>Lido: ${lido || '-'}</small>`;
  }
  toast('Código não confere', `Lido: ${lido || '-'} | Esperado: ${esperado || '-'}`);
}

async function confirmarSeparacao(pedidoId, itemId, automatico=false){
  const l = leituras[itemId] || {};
  if(!l.endereco || !l.patrimonio){
    som('erro');
    alert('Bipe a prateleira/endereço e o patrimônio antes de confirmar.');
    return;
  }

  const u = usuarioAtual();
  const resp = await db().from('itens_retirada').update({
    status:'SEPARADO',
    usuario_separacao:u?.nome || 'Usuário',
    data_separacao:new Date().toISOString()
  }).eq('id', itemId);

  if(resp.error){ alert('Erro ao separar item: ' + resp.error.message); return; }

  await hist(pedidoId, 'PENDENTE', 'SEPARADO', `Item separado com bip por ${u?.nome || 'Usuário'}.`, itemId);
  som('ok');
  toast('Item separado', 'O item foi validado por prateleira e patrimônio.');
  await carregarTudo();

  const pAtual = pedidos.find(x => String(x.id) === String(pedidoId));
  if(pAtual && pedidoSeparacaoCompleta(pAtual)){
    toast('Todos separados', 'Clique em Finalizar separação para liberar a retirada.');
  }
}

async function finalizarSeparacaoPedido(id){
  if(!podeAlmoxarifado()){ alert('Sem permissão para finalizar separação.'); return; }
  const p = pedidos.find(x => String(x.id) === String(id));
  if(!p){ alert('Pedido não encontrado.'); return; }
  if(!pedidoSeparacaoCompleta(p)){
    som('erro');
    alert('Ainda existe item pendente. Separe todos os itens antes de finalizar.');
    return;
  }
  if(!confirm('Finalizar separação e liberar para AGUARDANDO RETIRADA?')) return;
  const u = usuarioAtual();
  const r = await updatePedido(id, {
    status:'AGUARDANDO_RETIRADA',
    usuario_finalizacao_separacao:u?.nome || 'Usuário',
    data_finalizacao_separacao:new Date().toISOString()
  });
  if(r.error){ alert(r.error.message); return; }
  await hist(id, p.status, 'AGUARDANDO_RETIRADA', `Separação finalizada por ${u?.nome || 'Usuário'}. Pedido aguardando retirada.`);
  som('ok');
  toast('Separação finalizada', 'Pedido liberado para retirada.');
  await carregarTudo();
}

async function forcarSeparacaoPedido(id){
  if(!podeAlmoxarifado()) return;
  const p = pedidos.find(x => String(x.id) === String(id));
  if(!p){ alert('Pedido não encontrado.'); return; }
  if(!pedidoSeparacaoCompleta(p)){
    alert('Use o scanner para separar todos os itens. O botão Finalizar só libera quando tudo estiver separado.');
    return;
  }
  await finalizarSeparacaoPedido(id);
}



/* =========================================================
   PATCH BDR MOBILE - REVALIDAÇÃO OBRIGATÓRIA COM BIP
   Motivo: alguns pedidos antigos já estavam com item SEPARADO.
   Agora, no modo tablet, o item só conta como pronto quando foi
   bipada a prateleira + patrimônio neste fluxo/tablet.
========================================================= */
function chaveValidacaoBip(pedidoId, itemId){
  return `bdr_sep_bip_ok_${pedidoId}_${itemId}`;
}

function marcarValidacaoBip(pedidoId, itemId){
  try{ localStorage.setItem(chaveValidacaoBip(pedidoId, itemId), 'SIM'); }catch(e){}
}

function itemValidadoComBip(pedidoId, item){
  try{ return localStorage.getItem(chaveValidacaoBip(pedidoId, item?.id)) === 'SIM'; }
  catch(e){ return false; }
}

function totalSeparadoPedido(p){
  return itensValidosSeparacao(p).filter(i => itemValidadoComBip(p.id, i)).length;
}

function pedidoSeparacaoCompleta(p){
  const itens = itensValidosSeparacao(p);
  return itens.length > 0 && itens.every(i => itemValidadoComBip(p.id, i));
}

function proximoItemSeparacao(p){
  return itensValidosSeparacao(p).find(i => !itemValidadoComBip(p.id, i)) || null;
}

function cardSeparacaoMobile(p){
  const itens = itensValidosSeparacao(p);
  const separados = totalSeparadoPedido(p);
  const atual = proximoItemSeparacao(p);
  const pct = itens.length ? Math.round((separados / itens.length) * 100) : 0;
  const completo = pedidoSeparacaoCompleta(p);
  const codigo = p.codigo || ('PED-' + p.id);
  const avisoRevalidacao = itens.some(i => String(i.status || '').toUpperCase() === 'SEPARADO' && !itemValidadoComBip(p.id, i));

  return `
    <div class="sep-mobile-card" id="sep-pedido-${p.id}">
      <div class="sep-mobile-head">
        <div>
          <div class="sep-label">Pedido</div>
          <div class="sep-codigo">${codigo}</div>
          <div class="sep-sub">${p.obra_nome || '-'} • ${p.solicitante || '-'}</div>
        </div>
        <span class="status st-${cls(p.status)}">${rotulo(p.status)}</span>
      </div>

      <div class="sep-progress-wrap">
        <div class="sep-progress-info"><b>${separados}/${itens.length}</b> item(ns) validado(s) com bip</div>
        <div class="sep-progress"><span style="width:${pct}%"></span></div>
      </div>

      ${avisoRevalidacao ? `
        <div class="info dangerbox">
          <b>Atenção:</b> existem itens marcados como separados no banco, mas sem validação de bip neste tablet. Revalide com o scanner antes de finalizar.
        </div>
      ` : ''}

      ${completo ? `
        <div class="sep-done-box">
          <div class="sep-big-icon">✅</div>
          <h3>Todos os itens foram bipados</h3>
          <p>Agora sim: confira rapidamente e finalize para liberar o pedido para retirada.</p>
          <button class="sep-primary green" onclick="finalizarSeparacaoPedido(${p.id})">✅ Finalizar separação</button>
        </div>
      ` : `
        <div class="sep-atual">
          <div class="sep-label">Item atual para bipar</div>
          <h2>${atual?.patrimonio_nome || '-'}</h2>
          <div class="sep-pat">${atual?.patrimonio_codigo || '-'}</div>
          <div class="sep-endereco">📍 ${atual?.endereco_codigo || 'SEM ENDEREÇO'}</div>
          <button class="sep-primary" onclick="iniciarSeparacaoMobile(${p.id})">📷 Iniciar leitura</button>
          <div class="sep-help">Bipe primeiro a prateleira. Se estiver certo, o sistema abre automaticamente o bip do produto.</div>
        </div>
      `}

      <details class="sep-lista" open>
        <summary>Ver lista completa dos itens</summary>
        ${itens.map(i => itemSeparacaoMobileHTML(p, i)).join('')}
      </details>
    </div>
  `;
}

function itemSeparacaoMobileHTML(p, i){
  const ok = itemValidadoComBip(p.id, i);
  const marcadoBanco = String(i.status || '').toUpperCase() === 'SEPARADO';
  return `
    <div class="sep-item ${ok ? 'ok' : ''}">
      <div><b>${i.patrimonio_codigo || '-'}</b><br>${i.patrimonio_nome || '-'}</div>
      <div class="sep-item-status">${ok ? '✅ Bipado' : (marcadoBanco ? '🔁 Revalidar com bip' : '⏳ Pendente')}</div>
      <small>📍 ${i.endereco_codigo || 'SEM ENDEREÇO'}</small>
      ${i.usuario_separacao ? `<small>Último registro: ${i.usuario_separacao} • ${dataBR(i.data_separacao)}</small>` : ''}
      ${!ok ? `<button class="btn blue" style="margin-top:8px;width:100%;" onclick="abrirScannerMobile('ENDERECO', ${p.id}, ${i.id}, '${escapeAttr(i.endereco_codigo || '')}', '${escapeAttr(i.patrimonio_codigo || '')}')">📷 Bipar este item</button>` : ''}
    </div>
  `;
}

async function confirmarSeparacao(pedidoId, itemId, automatico=false){
  const l = leituras[itemId] || {};
  if(!l.endereco || !l.patrimonio){
    som('erro');
    alert('Bipe a prateleira/endereço e o patrimônio antes de confirmar.');
    return;
  }

  const u = usuarioAtual();
  const resp = await db().from('itens_retirada').update({
    status:'SEPARADO',
    usuario_separacao:u?.nome || 'Usuário',
    data_separacao:new Date().toISOString()
  }).eq('id', itemId);

  if(resp.error){ alert('Erro ao separar item: ' + resp.error.message); return; }

  marcarValidacaoBip(pedidoId, itemId);
  await hist(pedidoId, 'PENDENTE', 'SEPARADO', `Item validado com bip de prateleira e patrimônio por ${u?.nome || 'Usuário'}.`, itemId);
  som('ok');
  toast('Item bipado', 'Prateleira e patrimônio conferidos.');
  await carregarTudo();

  const pAtual = pedidos.find(x => String(x.id) === String(pedidoId));
  if(pAtual && pedidoSeparacaoCompleta(pAtual)){
    toast('Todos bipados', 'Clique em Finalizar separação para liberar a retirada.');
  }
}

async function finalizarSeparacaoPedido(id){
  if(!podeAlmoxarifado()){ alert('Sem permissão para finalizar separação.'); return; }
  const p = pedidos.find(x => String(x.id) === String(id));
  if(!p){ alert('Pedido não encontrado.'); return; }
  if(!pedidoSeparacaoCompleta(p)){
    som('erro');
    alert('Ainda existe item sem bipar neste tablet. Bipe prateleira e patrimônio de todos os itens antes de finalizar.');
    return;
  }
  if(!confirm('Finalizar separação e liberar para AGUARDANDO RETIRADA?')) return;
  const u = usuarioAtual();
  const r = await updatePedido(id, {
    status:'AGUARDANDO_RETIRADA',
    usuario_finalizacao_separacao:u?.nome || 'Usuário',
    data_finalizacao_separacao:new Date().toISOString()
  });
  if(r.error){ alert(r.error.message); return; }
  await hist(id, p.status, 'AGUARDANDO_RETIRADA', `Separação finalizada por ${u?.nome || 'Usuário'} após validação por bip. Pedido aguardando retirada.`);
  som('ok');
  toast('Separação finalizada', 'Pedido liberado para retirada.');
  await carregarTudo();
}

async function forcarSeparacaoPedido(id){
  if(!podeAlmoxarifado()) return;
  const p = pedidos.find(x => String(x.id) === String(id));
  if(!p){ alert('Pedido não encontrado.'); return; }
  if(!pedidoSeparacaoCompleta(p)){
    alert('Use o scanner para bipar todos os itens. O botão Finalizar só libera quando tudo estiver validado.');
    return;
  }
  await finalizarSeparacaoPedido(id);
}


/* =========================================================
   PATCH FINAL SCANNER MOBILE/TABLET
   - Erro = exatamente 2 bips
   - Evita leitura duplicada do mesmo QR travando o fluxo
   - Fecha câmera corretamente antes de abrir a próxima etapa
   - Recria a área #reader para não ficar tela preta/travada
========================================================= */
let bdrScannerProcessando = false;
let bdrUltimoErroScanner = "";
let bdrUltimoErroScannerTs = 0;

function som(tipo="ok"){
  try{
    prepararSom();
    if(!audioCtx) return;
    const ctx = audioCtx;
    const seq = tipo === "erro" ? [190, 120] : tipo === "notif" ? [880, 1175] : [760];

    seq.forEach((freq, i) => {
      const delay = i * 0.17;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tipo === "erro" ? "square" : "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(tipo === "erro" ? 0.20 : 0.22, ctx.currentTime + delay + 0.02);
      gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.15);
    });

    if(usuarioInteragiu && navigator.vibrate){
      navigator.vibrate(tipo === "erro" ? [140,70,140] : [60]);
    }
  }catch(e){}
}

function prepararAreaScanner(){
  const modal = document.getElementById("modalScanner");
  const body = modal?.querySelector(".modal-body");
  if(!body) return;

  let status = document.getElementById("scanStatus");
  if(!status){
    status = document.createElement("div");
    status.id = "scanStatus";
    status.className = "scan-status";
    body.prepend(status);
  }

  let reader = document.getElementById("reader");
  if(!reader){
    reader = document.createElement("div");
    reader.id = "reader";
    const actions = body.querySelector(".modal-actions");
    body.insertBefore(reader, actions || null);
  }

  reader.innerHTML = "";
  reader.style.display = "block";
  reader.style.minHeight = "280px";
  reader.style.width = "100%";
  reader.style.maxWidth = "420px";
  reader.style.margin = "auto";
}

async function pararScannerAtual(){
  try{
    if(scanner){
      try{ await scanner.stop(); }catch(e){}
      try{ await scanner.clear(); }catch(e){}
      scanner = null;
    }
  }catch(e){
    scanner = null;
  }
}

async function abrirScannerMobile(tipo, pedidoId, itemId, esperado, proximo=""){
  bdrScannerProcessando = false;
  bdrUltimoErroScanner = "";
  bdrUltimoErroScannerTs = 0;

  scanCtx = {
    tipo,
    pedidoId,
    itemId,
    esperado:String(esperado || "").trim(),
    proximo:String(proximo || "").trim(),
    autoConfirmarProduto:true,
    mobile:true
  };

  await pararScannerAtual();
  prepararAreaScanner();

  const titulo = tipo === "ENDERECO" ? "📍 Bipe a prateleira" : "🏷 Bipe o patrimônio";
  const ajuda = tipo === "ENDERECO" ? "Aponte para o QR da prateleira/endereço." : "Aponte para a etiqueta do patrimônio.";

  const tituloEl = document.getElementById("scannerTitulo");
  const statusEl = document.getElementById("scanStatus");
  if(tituloEl) tituloEl.innerText = titulo;
  if(statusEl) statusEl.innerHTML = `<div>${ajuda}</div><b>Esperado: ${scanCtx.esperado || "-"}</b>`;

  document.getElementById("modalScanner")?.classList.add("ativo");

  try{
    scanner = new Html5Qrcode("reader");
    await scanner.start(
      { facingMode:"environment" },
      { fps:8, qrbox: Math.min(280, Math.floor(window.innerWidth * 0.72)) },
      codigo => processarLeitura(codigo),
      () => {}
    );
  }catch(e){
    bdrScannerProcessando = false;
    alert("Erro ao abrir câmera: " + (e.message || e));
  }
}

async function abrirScanner(tipo, pedidoId, itemId, esperado, proximo=""){
  return abrirScannerMobile(tipo, pedidoId, itemId, esperado, proximo);
}

async function processarLeitura(codigo){
  if(!scanCtx || bdrScannerProcessando) return;

  const lido = extrairCodigo(String(codigo || "").trim());
  const esperado = String(scanCtx.esperado || "").trim();

  if(lido !== esperado){
    const agora = Date.now();
    const chaveErro = `${scanCtx.tipo}|${scanCtx.itemId}|${lido}|${esperado}`;

    if(chaveErro !== bdrUltimoErroScanner || (agora - bdrUltimoErroScannerTs) > 1300){
      bdrUltimoErroScanner = chaveErro;
      bdrUltimoErroScannerTs = agora;
      som("erro");
      const statusEl = document.getElementById("scanStatus");
      if(statusEl){
        statusEl.innerHTML = `<div class="scan-erro">❌ Código errado</div><b>Esperado: ${esperado || "-"}</b><br><small>Lido: ${lido || "-"}</small>`;
      }
      toast("Código não confere", `Lido: ${lido || "-"} | Esperado: ${esperado || "-"}`);
    }
    return;
  }

  bdrScannerProcessando = true;
  som("ok");
  toast("Bip correto", lido);

  leituras[scanCtx.itemId] = leituras[scanCtx.itemId] || {};
  if(scanCtx.tipo === "ENDERECO") leituras[scanCtx.itemId].endereco = true;
  if(scanCtx.tipo === "PATRIMONIO") leituras[scanCtx.itemId].patrimonio = true;

  const ctxAnterior = {...scanCtx};
  await fecharScanner(false);

  if(ctxAnterior.tipo === "ENDERECO" && ctxAnterior.proximo){
    const statusEl = document.getElementById("scanStatus");
    if(statusEl) statusEl.innerHTML = "✅ Prateleira correta. Abrindo leitura do patrimônio...";
    setTimeout(() => {
      bdrScannerProcessando = false;
      abrirScannerMobile("PATRIMONIO", ctxAnterior.pedidoId, ctxAnterior.itemId, ctxAnterior.proximo, "");
    }, 900);
    return;
  }

  if(ctxAnterior.tipo === "PATRIMONIO" && ctxAnterior.autoConfirmarProduto){
    bdrScannerProcessando = false;
    await confirmarSeparacao(ctxAnterior.pedidoId, ctxAnterior.itemId, true);
    return;
  }

  bdrScannerProcessando = false;
}

async function fecharScanner(limparCtx=true){
  await pararScannerAtual();
  document.getElementById("modalScanner")?.classList.remove("ativo");
  prepararAreaScanner();
  bdrScannerProcessando = false;
  if(limparCtx) scanCtx = null;
}

/* Inicialização controlada */
carregarCarrinhoLocal();
renderizarCarrinho();
carregarUsuarioTopo();
carregarTudo();
setInterval(carregarTudo, 30000);
iniciarRealtimePedidos();


/* =========================================================
   BDR CORREÇÃO FLUXO PEDIDOS 100.1
   - Usuário vê estoque conforme permissões
   - Só adiciona ao carrinho item em ESTOQUE
   - Pedido nasce com origem e destino
   - Outras obras só podem ser solicitadas com permissão
========================================================= */
function bdrPermissoes(){
  return String(usuarioAtual()?.permissoes || "")
    .split(",")
    .map(p => p.trim().toUpperCase())
    .filter(Boolean);
}
function bdrTemPermissao(p){ return bdrPermissoes().includes(String(p || "").toUpperCase()); }
function bdrObraUsuario(){ return String(usuarioAtual()?.obra_id || ""); }
function bdrEhMasterAdmin(){ return ["MASTER","ADMIN"].includes(perfil()); }
function bdrEhCDObra(o){
  const txt = `${o?.codigo_obra || ""} ${o?.nome || ""}`.toUpperCase();
  return txt.includes("CD") || txt.includes("CENTRO DISTRIB") || txt.includes("DISTRIBUIÇÃO") || txt.includes("DISTRIBUICAO");
}
function bdrObraPorId(id){ return obras.find(o => String(o.id) === String(id)); }
function bdrPodeVerObraEstoque(obraId){
  const uObra = bdrObraUsuario();
  const o = bdrObraPorId(obraId);
  if(bdrEhMasterAdmin()) return true;
  if(bdrTemPermissao("VER_TODAS_OBRAS")) return true;
  if(String(obraId) === uObra && bdrTemPermissao("VER_ESTOQUE_PROPRIA_OBRA")) return true;
  if(bdrEhCDObra(o) && bdrTemPermissao("VER_ESTOQUE_CD")) return true;
  if(bdrTemPermissao("VER_OBRA_" + obraId)) return true;
  if(bdrTemPermissao("VER_ESTOQUE_OUTRAS_OBRAS")) return true;
  return false;
}
function bdrPodeSolicitarDaOrigem(obraId){
  if(!bdrTemPermissao("SOLICITAR_MATERIAL") && !bdrEhMasterAdmin()) return false;
  const uObra = bdrObraUsuario();
  const o = bdrObraPorId(obraId);
  if(bdrEhMasterAdmin()) return true;
  if(String(obraId) === uObra) return true;
  if(bdrEhCDObra(o)) return true;
  return bdrTemPermissao("SOLICITAR_OUTRAS_OBRAS");
}
function bdrNomeObraId(id){
  const o = bdrObraPorId(id);
  return o ? `${o.codigo_obra || "-"} - ${o.nome || "-"}` : "-";
}

async function carregarDadosBase(){
  const u = usuarioAtual();
  carregarUsuarioTopo();
  const sol = document.getElementById("solicitante");
  if(sol) sol.value = u?.nome || "Usuário não identificado";

  const resp = await db().from("obras").select("*").eq("ativa", true).order("nome");
  if(resp.error){ alert("Erro ao carregar obras: " + resp.error.message); return; }
  obras = resp.data || [];

  const dest = document.getElementById("obraDestino");
  const ori = document.getElementById("obraOrigem");
  if(!dest || !ori) return;
  dest.innerHTML = "";
  ori.innerHTML = "";

  let obrasDestino = [...obras];
  if(!bdrEhMasterAdmin() && u?.obra_id){
    obrasDestino = obrasDestino.filter(o => String(o.id) === String(u.obra_id));
  }
  obrasDestino.forEach(o => {
    dest.innerHTML += `<option value="${o.id}" data-nome="${o.nome || ""}">${o.codigo_obra || "-"} - ${o.nome || "-"}</option>`;
  });

  const est = await db().from("patrimonio").select("obra_id").eq("status", "ESTOQUE");
  const idsComEstoque = new Set((est.data || []).map(x => String(x.obra_id)).filter(Boolean));
  obras
    .filter(o => idsComEstoque.has(String(o.id)))
    .filter(o => bdrPodeVerObraEstoque(o.id))
    .forEach(o => {
      const tipo = bdrEhCDObra(o) ? "CD" : (String(o.id) === bdrObraUsuario() ? "Sua obra" : "Outra obra");
      ori.innerHTML += `<option value="${o.id}">${o.codigo_obra || "-"} - ${o.nome || "-"} • ${tipo}</option>`;
    });

  if(!ori.options.length){
    const div = document.getElementById("resultadoBusca");
    if(div) div.innerHTML = `<div class="vazio">Nenhuma origem de estoque liberada para este usuário.</div>`;
  }else if(catalogoAtual.length === 0){
    await carregarCatalogo();
  }
}

async function carregarCatalogo(){
  const origem = valor("obraOrigem");
  const div = document.getElementById("resultadoBusca");
  const res = document.getElementById("resumoCatalogo");
  if(!origem){ if(div) div.innerHTML = ""; return; }
  if(!bdrPodeVerObraEstoque(origem)){
    catalogoAtual = [];
    if(res) res.innerHTML = "Origem bloqueada para este usuário.";
    if(div) div.innerHTML = `<div class="dangerbox info">Você não tem permissão para ver o estoque desta origem.</div>`;
    return;
  }
  if(res) res.innerHTML = "Carregando catálogo...";

  const pat = await db()
    .from("patrimonio")
    .select("*")
    .eq("status", "ESTOQUE")
    .eq("obra_id", origem)
    .order("nome_bem", { ascending:true })
    .limit(500);
  if(pat.error){ alert(pat.error.message); return; }

  const ped = await db().from("pedidos_retirada").select("id,status").in("status", STATUS_ABERTOS);
  const idsPed = (ped.data || []).map(p => p.id);
  let reservados = new Set();
  if(idsPed.length){
    const it = await db().from("itens_retirada").select("patrimonio_id,status,pedido_id").in("pedido_id", idsPed).neq("status", "NEGADO");
    reservados = new Set((it.data || []).map(i => Number(i.patrimonio_id)).filter(Boolean));
  }

  catalogoAtual = (pat.data || []).filter(p => !reservados.has(Number(p.id)) && String(p.status || "") === "ESTOQUE");
  if(res) res.innerHTML = `Exibindo <b>${catalogoAtual.length}</b> item(ns) em estoque disponível. Origem: <b>${bdrNomeObraId(origem)}</b>`;
  renderizarCatalogo(catalogoAtual);
}

function renderizarCatalogo(lista){
  const div = document.getElementById("resultadoBusca");
  if(!div) return;
  if(!lista.length){ div.innerHTML = '<div class="vazio">Nenhum item em estoque disponível.</div>'; return; }
  const origemAtual = valor("obraOrigem");
  const podeSolicitarOrigem = bdrPodeSolicitarDaOrigem(origemAtual);
  div.innerHTML = `<div class="catalogo">${lista.map(p => {
    const ja = itensPedido.some(i => Number(i.id) === Number(p.id));
    const json = JSON.stringify(p).replaceAll("'", "&apos;");
    const bloqueado = !podeSolicitarOrigem || String(p.status || "") !== "ESTOQUE";
    const textoBotao = ja ? "✅ No carrinho" : (bloqueado ? "🔒 Apenas consulta" : "➕ Adicionar");
    const classeBotao = ja || bloqueado ? "gray" : "blue";
    return `<div class="produto ${bloqueado ? "bloqueado" : ""}">
      <div class="foto">📦</div>
      <div class="codigo">${p.codigo_qr || "-"}</div>
      <h4>${p.nome_bem || "-"}</h4>
      <div class="meta">
        <b>Status:</b> ${p.status || "-"}<br>
        <b>Origem:</b> ${bdrNomeObraId(p.obra_id || origemAtual)}<br>
        <b>Marca:</b> ${p.marca || "-"}<br>
        <b>Modelo:</b> ${p.modelo || "-"}<br>
        <b>Tipo:</b> ${p.tipo_item || "-"}
      </div>
      <button class="btn ${classeBotao}" ${ja || bloqueado ? "disabled" : ""} onclick='addItem(${json})'>${textoBotao}</button>
    </div>`;
  }).join("")}</div>`;
}

async function criarPedido(){
  if(!itensPedido.length){ alert("Adicione itens ao pedido."); return; }
  const origem = valor("obraOrigem");
  if(!bdrPodeSolicitarDaOrigem(origem)){
    alert("Você pode visualizar esta origem, mas não tem permissão para solicitar dela.");
    return;
  }
  const dest = document.getElementById("obraDestino");
  const obraId = dest.value;
  const obraNome = dest.options[dest.selectedIndex]?.dataset.nome || dest.options[dest.selectedIndex]?.text || "-";
  const u = usuarioAtual();
  const codigo = "PED-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-6);

  const ids = itensPedido.map(p => p.id);
  const checkEstoque = await db().from("patrimonio").select("id,status,obra_id").in("id", ids);
  const invalidos = (checkEstoque.data || []).filter(p => String(p.status) !== "ESTOQUE" || String(p.obra_id) !== String(origem));
  if(invalidos.length){
    alert("Alguns itens não estão mais em estoque nessa origem. Atualize o catálogo.");
    await carregarCatalogo();
    return;
  }

  const abertos = await db().from("pedidos_retirada").select("id,status").in("status", STATUS_ABERTOS);
  const idsPed = (abertos.data || []).map(p => p.id);
  if(idsPed.length){
    const it = await db().from("itens_retirada").select("patrimonio_id").in("pedido_id", idsPed).in("patrimonio_id", ids).neq("status", "NEGADO");
    if((it.data || []).length){ alert("Alguns itens já foram reservados por outro pedido."); await carregarCatalogo(); return; }
  }

  const payload = {
    codigo,
    obra_id: obraId,
    obra_nome: obraNome,
    solicitante: u?.nome || "Usuário",
    usuario_criacao: u?.nome || "Usuário",
    status: "AGUARDANDO_AUTORIZACAO",
    obra_origem_id: origem,
    obra_destino_id: obraId,
    observacao: valor("observacaoPedido")
  };

  const r = await db().from("pedidos_retirada").insert([payload]).select().single();
  if(r.error){ alert(r.error.message); return; }

  const itens = itensPedido.map(p => ({
    pedido_id: r.data.id,
    patrimonio_id: p.id,
    patrimonio_codigo: p.codigo_qr,
    patrimonio_nome: p.nome_bem,
    endereco_codigo: p.endereco_codigo || p.localizacao_fisica || "SEM ENDEREÇO",
    obra_origem_id: p.obra_id || origem,
    obra_destino_id: obraId,
    status: "PENDENTE"
  }));

  const ri = await db().from("itens_retirada").insert(itens);
  if(ri.error){ alert(ri.error.message); return; }
  await hist(r.data.id, null, "AGUARDANDO_AUTORIZACAO", `Pedido criado por ${u?.nome || "Usuário"}. Origem: ${bdrNomeObraId(origem)}. Destino: ${obraNome}.`);
  som("ok");
  toast("Pedido criado", "Enviado para autorização da origem.");
  limparCarrinho();
  const obs = document.getElementById("observacaoPedido");
  if(obs) obs.value = "";
  await carregarTudo();
}

function bdrPodeAtuarOrigemPedido(p){
  if(bdrEhMasterAdmin()) return true;
  const uObra = bdrObraUsuario();
  if(!uObra || String(uObra) !== String(p.obra_origem_id || "")) return false;
  return podeAlmoxarifado() || bdrTemPermissao("APROVAR_PEDIDO_ORIGEM") || bdrTemPermissao("SEPARAR_PEDIDO");
}
function bdrPodeSepararPedido(p){
  if(bdrEhMasterAdmin()) return true;
  const uObra = bdrObraUsuario();
  if(!uObra || String(uObra) !== String(p.obra_origem_id || "")) return false;
  return podeAlmoxarifado() || bdrTemPermissao("SEPARAR_PEDIDO");
}
function acoesPedido(p, modo){
  if(modo === "autorizar" && p.status === "AGUARDANDO_AUTORIZACAO" && bdrPodeAtuarOrigemPedido(p)) return `<button class="btn green" onclick="autorizar(${p.id})">Autorizar</button> <button class="btn red" onclick="negarPedido(${p.id})">Negar</button>`;
  if(modo === "separar" && p.status === "EM_SEPARACAO" && bdrPodeSepararPedido(p)) return `<button class="btn purple" onclick="togglePedido('${modo}',${p.id})">Separar</button>`;
  if(modo === "saida" && p.status === "AGUARDANDO_RETIRADA" && bdrPodeSepararPedido(p)) return `<button class="btn green" onclick="abrirSaida(${p.id})">Dar saída</button>`;
  if(modo === "receber" && p.status === "EM_TRANSITO" && String(p.obra_destino_id || p.obra_id || "") === bdrObraUsuario()) return `<button class="btn orange" onclick="receberPedido(${p.id})">Receber obra</button>`;
  if(modo === "receber" && p.status === "AGUARDANDO_CONFERENCIA" && String(p.obra_destino_id || p.obra_id || "") === bdrObraUsuario()) return `<button class="btn green" onclick="abrirConferencia(${p.id})">Conferir</button>`;
  return `<button class="btn blue" onclick="togglePedido('${modo}',${p.id})">Detalhes</button>`;
}

function itemHTML(p, i, modo){
  const jaEnd = leituras[i.id]?.endereco;
  const jaPat = leituras[i.id]?.patrimonio;
  const podeSeparar = modo === "separar" && p.status === "EM_SEPARACAO" && bdrPodeSepararPedido(p);
  return `<div class="item"><strong>${i.patrimonio_codigo || "-"}</strong><br>${i.patrimonio_nome || "-"}<br>Status: <span class="status st-${cls(i.status)}">${rotulo(i.status)}</span><br>Endereço: ${i.endereco_codigo || "-"}
    ${i.usuario_separacao ? `<div class="rastreio"><b>Separado por:</b> ${i.usuario_separacao}<br>${dataBR(i.data_separacao)}</div>` : ""}
    ${podeSeparar ? `<div class="scan-actions">
      <button class="btn dark" onclick="abrirScanner('ENDERECO',${p.id},${i.id},'${escapeAttr(i.endereco_codigo || "")}', '${escapeAttr(i.patrimonio_codigo || "")}')">📍 Bip prateleira ${jaEnd ? "✅" : ""}</button>
      <button class="btn blue" onclick="abrirScanner('PATRIMONIO',${p.id},${i.id},'${escapeAttr(i.patrimonio_codigo || "")}', '')">🏷 Bip patrimônio ${jaPat ? "✅" : ""}</button>
      <button class="btn green" onclick="confirmarSeparacao(${p.id},${i.id})">Confirmar</button>
    </div>` : ""}
  </div>`;
}

function aplicarAbaUrlPedidos(){
  try{
    const aba = new URLSearchParams(location.search).get("aba");
    if(!aba) return;
    const btn = [...document.querySelectorAll(".tab-btn")].find(b => String(b.getAttribute("onclick") || "").includes(`'${aba}'`));
    if(btn) abrirAba(aba, btn);
  }catch(e){}
}
setTimeout(aplicarAbaUrlPedidos, 900);

/* =========================================================
   BDR CORREÇÃO 100.2 - PEDIDOS NÃO FAZ SEPARAÇÃO
   Pedidos = solicitar e acompanhar.
   Separação oficial = retirada.html.
   Isso evita solicitante/destino ou almoxarifado cair na tela errada.
========================================================= */
(function(){
  const _abrirAbaOriginal = window.abrirAba || abrirAba;
  window.abrirAba = function(nome, btn){
    if(String(nome) === "separar"){
      window.location.href = "retirada.html?aba=separar";
      return;
    }
    return _abrirAbaOriginal(nome, btn);
  };

  // Reforço: se alguém abrir pedidos.html?aba=separar pelo sininho antigo,
  // manda para a tela certa.
  try{
    const aba = new URLSearchParams(location.search).get("aba");
    if(aba === "separar"){
      window.location.replace("retirada.html?aba=separar");
    }
  }catch(e){}

  // Remove visualmente a aba separação, caso ainda exista no HTML antigo.
  function bdrRemoverSeparacaoDoPedido(){
    document.querySelector('[data-tab-separar]')?.remove();
    const sec = document.getElementById("tab-separar");
    if(sec){ sec.style.display = "none"; }
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bdrRemoverSeparacaoDoPedido);
  else bdrRemoverSeparacaoDoPedido();

  // Em pedidos, nunca libera bip/scan de separação.
  const _acoesPedidoOriginal = window.acoesPedido || acoesPedido;
  window.acoesPedido = function(p, modo){
    if(String(modo) === "separar"){
      return `<button class="btn gray" onclick="window.location.href='retirada.html?aba=separar'">Abrir retirada</button>`;
    }
    return _acoesPedidoOriginal(p, modo);
  };

  const _itemHTMLOriginal = window.itemHTML || itemHTML;
  window.itemHTML = function(p, i, modo){
    const html = _itemHTMLOriginal(p, i, String(modo) === "separar" ? "acompanhar" : modo);
    return html.replace(/<div class="scan-actions">[\s\S]*?<\/div>/g, "");
  };
})();