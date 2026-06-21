/* =========================================================
   BDR ERP - OFFLINE QUEUE V4
   Arquivo: JS/offlineQueue.js

   MARCAÇÕES:
   [01] Banco local IndexedDB
   [02] Salvar operações offline
   [03] Helpers gerais insert/update/delete
   [04] Sincronização automática
   [05] Especiais: entrada, patrimônio, expedição, triagem
   [06] Aviso visual
========================================================= */

const BDR_OFFLINE_DB = "bdr_offline_db";
const BDR_OFFLINE_VERSION = 4;
const BDR_OFFLINE_STORE = "fila";

function dbOfflineSupabase(){
  return window.client || window.supabaseClient || window.clientSupabase || globalThis.client;
}

/* =========================================================
   [01] BANCO LOCAL
========================================================= */
function abrirOfflineDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BDR_OFFLINE_DB, BDR_OFFLINE_VERSION);

    req.onupgradeneeded = event => {
      const banco = event.target.result;

      if(!banco.objectStoreNames.contains(BDR_OFFLINE_STORE)){
        const store = banco.createObjectStore(BDR_OFFLINE_STORE, {
          keyPath:"id",
          autoIncrement:true
        });

        store.createIndex("tipo", "tipo", { unique:false });
        store.createIndex("tabela", "tabela", { unique:false });
        store.createIndex("data", "data", { unique:false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function estaOnline(){
  return navigator.onLine === true;
}

/* =========================================================
   [02] SALVAR NA FILA
========================================================= */
async function salvarOffline(tipo, tabela, dados, opcoes = {}){
  const bancoLocal = await abrirOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = bancoLocal.transaction(BDR_OFFLINE_STORE, "readwrite");
    const store = tx.objectStore(BDR_OFFLINE_STORE);

    const item = {
      tipo,
      tabela,
      dados,
      filtro: opcoes.filtro || null,
      origem: opcoes.origem || location.pathname,
      data: new Date().toISOString(),
      sincronizado:false,
      tentativas:0,
      ultimo_erro:null
    };

    const req = store.add(item);

    req.onsuccess = () => {
      console.log("📦 BDR OFFLINE: salvo na fila", item);
      bdrMostrarAvisoOffline("📦 Salvo offline. Será sincronizado quando a internet voltar.");
      if(typeof bdrAtualizarStatusGlobal === "function") setTimeout(bdrAtualizarStatusGlobal, 100);
      resolve({ offline:true, data:item, error:null });
    };

    req.onerror = () => reject(req.error);
  });
}

/* =========================================================
   [03] HELPERS GERAIS
========================================================= */
async function bdrSalvarInsert(tabela, dados){
  if(!estaOnline()) return salvarOffline("insert", tabela, dados);

  try{
    const { data, error } = await dbOfflineSupabase().from(tabela).insert(dados).select();
    if(error) return salvarOffline("insert", tabela, dados, { origem:"fallback_insert" });
    return { offline:false, data, error:null };
  }catch(e){
    return salvarOffline("insert", tabela, dados, { origem:"catch_insert" });
  }
}

async function bdrSalvarUpdate(tabela, dados, filtro){
  if(!estaOnline()) return salvarOffline("update", tabela, dados, { filtro });

  try{
    let query = dbOfflineSupabase().from(tabela).update(dados);
    Object.entries(filtro || {}).forEach(([campo, valor]) => query = query.eq(campo, valor));
    const { data, error } = await query.select();
    if(error) return salvarOffline("update", tabela, dados, { filtro, origem:"fallback_update" });
    return { offline:false, data, error:null };
  }catch(e){
    return salvarOffline("update", tabela, dados, { filtro, origem:"catch_update" });
  }
}

async function bdrSalvarDelete(tabela, filtro){
  if(!estaOnline()) return salvarOffline("delete", tabela, null, { filtro });

  try{
    let query = dbOfflineSupabase().from(tabela).delete();
    Object.entries(filtro || {}).forEach(([campo, valor]) => query = query.eq(campo, valor));
    const { data, error } = await query.select();
    if(error) return salvarOffline("delete", tabela, null, { filtro, origem:"fallback_delete" });
    return { offline:false, data, error:null };
  }catch(e){
    return salvarOffline("delete", tabela, null, { filtro, origem:"catch_delete" });
  }
}

/* =========================================================
   [04] SINCRONIZAÇÃO
========================================================= */
async function listarFilaOffline(){
  const bancoLocal = await abrirOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = bancoLocal.transaction(BDR_OFFLINE_STORE, "readonly");
    const store = tx.objectStore(BDR_OFFLINE_STORE);
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function sincronizarOffline(){
  if(!estaOnline()) return;

  const itens = await listarFilaOffline();

  if(!itens.length){
    console.log("✅ BDR OFFLINE: fila vazia.");
    return;
  }

  console.log(`🔄 BDR OFFLINE: sincronizando ${itens.length} item(ns).`);

  for(const item of itens){
    try{
      let ok = false;

      if(item.tipo === "entrada_completa") ok = await sincronizarEntradaCompleta(item);
      if(item.tipo === "mover_patrimonio") ok = await sincronizarMoverPatrimonio(item);
      if(item.tipo === "nova_solicitacao") ok = await sincronizarNovaSolicitacao(item);
      if(item.tipo === "acao_pedido") ok = await sincronizarAcaoPedido(item);
      if(item.tipo === "triagem_confirmar_item") ok = await sincronizarTriagemConfirmarItem(item);

      if(item.tipo === "insert"){
        const { error } = await dbOfflineSupabase().from(item.tabela).insert(item.dados);
        if(error) throw error;
        ok = true;
      }

      if(item.tipo === "update"){
        let query = dbOfflineSupabase().from(item.tabela).update(item.dados);
        Object.entries(item.filtro || {}).forEach(([campo, valor]) => query = query.eq(campo, valor));
        const { error } = await query;
        if(error) throw error;
        ok = true;
      }

      if(item.tipo === "delete"){
        let query = dbOfflineSupabase().from(item.tabela).delete();
        Object.entries(item.filtro || {}).forEach(([campo, valor]) => query = query.eq(campo, valor));
        const { error } = await query;
        if(error) throw error;
        ok = true;
      }

      if(ok){
        window.dispatchEvent(new CustomEvent("bdrOfflineSincronizado", { detail:item }));
        await removerItemOffline(item.id);
        console.log("✅ BDR OFFLINE: sincronizado", item.id);
      }

    }catch(e){
      await atualizarErroOffline(item.id, e.message || String(e));
      console.warn("⚠️ BDR OFFLINE: erro ao sincronizar", item.id, e.message || e);
    }
  }

  bdrMostrarAvisoOffline("✅ Sincronização concluída.");
  if(typeof bdrAtualizarStatusGlobal === "function") setTimeout(bdrAtualizarStatusGlobal, 100);
}

/* =========================================================
   [05.1] ESPECIAL: ENTRADA COMPLETA
========================================================= */
async function sincronizarEntradaCompleta(item){
  const payload = item.dados || {};
  const entrada = payload.entrada;
  const itens = payload.itens || [];
  if(!entrada || !itens.length) throw new Error("Entrada offline incompleta.");

  const { data: entradaSalva, error } = await dbOfflineSupabase()
    .from("entradas_materiais")
    .insert([entrada])
    .select()
    .single();

  if(error) throw error;

  const itensComEntrada = itens.map(i => ({ ...i, entrada_id: entradaSalva.id }));

  const { error: erroItens } = await dbOfflineSupabase()
    .from("entradas_materiais_itens")
    .insert(itensComEntrada);

  if(erroItens) throw erroItens;
  return true;
}

/* =========================================================
   [05.2] ESPECIAL: MOVER PATRIMÔNIO
========================================================= */
async function sincronizarMoverPatrimonio(item){
  const p = item.dados || {};
  if(!p.codigo_qr || !p.novoStatus) throw new Error("Movimentação de patrimônio offline incompleta.");

  const atual = await dbOfflineSupabase()
    .from("patrimonio")
    .select("*")
    .eq("codigo_qr", p.codigo_qr)
    .single();

  if(atual.error || !atual.data) throw new Error("Patrimônio não encontrado ao sincronizar.");

  const { error: erroUpdate } = await dbOfflineSupabase()
    .from("patrimonio")
    .update({ status:p.novoStatus, localizacao:p.novaLocal })
    .eq("codigo_qr", p.codigo_qr);

  if(erroUpdate) throw erroUpdate;

  const { error: erroMov } = await dbOfflineSupabase()
    .from("movimentacoes")
    .insert([{
      patrimonio_id: atual.data.id,
      status_anterior: atual.data.status,
      status_novo: p.novoStatus,
      local_anterior: atual.data.localizacao,
      local_novo: p.novaLocal,
      responsavel: p.responsavel || "SISTEMA OFFLINE",
      observacao: p.observacao || "movimentação sincronizada offline",
      created_at: p.criado_offline_em || new Date().toISOString()
    }]);

  if(erroMov) throw erroMov;

  try{
    await dbOfflineSupabase().from("analytics_patrimonio").insert([{
      patrimonio_id: atual.data.id,
      empresa_id: p.empresa_id || atual.data.empresa_id || null,
      tipo_evento: "MOVIMENTACAO",
      status_anterior: atual.data.status,
      status_novo: p.novoStatus,
      local_anterior: atual.data.localizacao,
      local_novo: p.novaLocal,
      criticidade: p.novoStatus === "MANUTENCAO" ? 3 : 1,
      observacao: p.observacao || "movimentação sincronizada offline",
      created_at: p.criado_offline_em || new Date().toISOString()
    }]);
  }catch(e){}

  return true;
}

/* =========================================================
   [05.3] ESPECIAL: EXPEDIÇÃO - NOVA SOLICITAÇÃO
========================================================= */
async function sincronizarNovaSolicitacao(item){
  const payload = item.dados || {};
  const grupos = payload.grupos || {};
  const solicitante = payload.solicitante || "Usuário";
  const obraDestinoId = payload.obraDestinoId || null;

  for(const origemId of Object.keys(grupos)){
    const itens = grupos[origemId] || [];
    if(!itens.length) continue;

    const codigo = "EXP-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-6) + "-" + Math.floor(Math.random() * 99);

    const pedido = {
      codigo,
      status:"AGUARDANDO_AUTORIZACAO",
      solicitante,
      usuario_criacao:solicitante,
      obra_id:obraDestinoId,
      obra_destino_id:obraDestinoId,
      obra_nome:payload.obraNome || null,
      obra_origem_id:origemId === "SEM_ORIGEM" ? null : Number(origemId),
      observacao:payload.observacao || "Solicitação criada offline e sincronizada."
    };

    const r = await dbOfflineSupabase().from("pedidos_retirada").insert([pedido]).select().single();
    if(r.error) throw r.error;

    const itensPayload = itens.map(i => ({
      pedido_id:r.data.id,
      patrimonio_id:i.patrimonio_id || (i.origem_tabela === "patrimonio" ? i.id : null),
      produto_id:i.produto_id || (i.origem_tabela === "estoque_produtos" ? i.id : null),
      patrimonio_codigo:i.codigo,
      patrimonio_nome:i.nome,
      endereco_codigo:i.localizacao,
      obra_origem_id:i.obra_id || null,
      obra_destino_id:obraDestinoId,
      status:i.tipo_solicitacao === "INTERESSE" ? "INTERESSE" : "PENDENTE",
      quantidade:1
    }));

    const ri = await dbOfflineSupabase().from("itens_retirada").insert(itensPayload);
    if(ri.error) throw ri.error;

    await dbOfflineSupabase().from("historico_pedidos_retirada").insert([{
      pedido_id:r.data.id,
      status_anterior:null,
      status_novo:"AGUARDANDO_AUTORIZACAO",
      usuario:solicitante,
      observacao:"Solicitação criada offline e sincronizada."
    }]);
  }

  return true;
}

/* =========================================================
   [05.4] ESPECIAL: EXPEDIÇÃO - AÇÕES DO PEDIDO
========================================================= */
async function sincronizarAcaoPedido(item){
  const p = item.dados || {};
  if(!p.id || !p.payload) throw new Error("Ação de pedido offline incompleta.");

  let query = dbOfflineSupabase().from("pedidos_retirada").update(p.payload).eq("id", p.id);
  const { error } = await query;
  if(error) throw error;

  if(p.itensPayload){
    let qi = dbOfflineSupabase().from("itens_retirada").update(p.itensPayload).eq("pedido_id", p.id);
    const ri = await qi;
    if(ri.error) throw ri.error;
  }

  if(p.historico){
    await dbOfflineSupabase().from("historico_pedidos_retirada").insert([p.historico]);
  }

  return true;
}

/* =========================================================
   [05.5] ESPECIAL: TRIAGEM CONFIRMAR ITEM
   Observação: é uma sincronização segura/simplificada.
========================================================= */
async function sincronizarTriagemConfirmarItem(itemFila){
  const p = itemFila.dados || {};
  const item = p.item;
  if(!item || !item.id) throw new Error("Item de triagem offline incompleto.");

  const usuario = p.usuario || "Usuário não identificado";
  const destino = p.destino || "ESTOQUE";
  const obraDestino = p.obraDestino || null;
  const endereco = p.endereco || null;
  const obs = p.obs || null;

  if(destino === "ESTOQUE" || destino === "OBRA" || destino === "PATRIMONIO"){
    let codigo = "EST-OFF-" + Date.now() + "-" + item.id;
    let patrimonioCriado = null;

    if(destino === "PATRIMONIO"){
      const codPat = "PAT-OFF-" + Date.now() + "-" + item.id;

      const { data: pat, error: ePat } = await dbOfflineSupabase().from("patrimonio").insert([{
        codigo_qr: codPat,
        nome_bem: item.descricao_xml || "Item sem descrição",
        descricao: item.descricao_xml || "Item sem descrição",
        valor_bem: Number(item.valor_unitario || item.valor_total || 0),
        status:"ESTOQUE",
        obra_id: obraDestino ? Number(obraDestino) : null,
        empresa_id: p.empresa_id || null,
        localizacao: p.obraNome || null,
        observacao: obs || "Criado pela triagem offline"
      }]).select().single();

      if(ePat) throw ePat;
      patrimonioCriado = pat;
      codigo = codPat;
    }

    const { error: eEst } = await dbOfflineSupabase().from("estoque_produtos").insert([{
      codigo,
      descricao:item.descricao_xml || "Item sem descrição",
      unidade:"UN",
      tipo_controle: destino === "PATRIMONIO" ? "PATRIMONIO" : "CONSUMO",
      quantidade:Number(item.quantidade || 0),
      valor_unitario:Number(item.valor_unitario || 0),
      valor_total:Number(item.valor_total || 0),
      empresa_id:p.empresa_id || null,
      obra_id:obraDestino ? Number(obraDestino) : null,
      patrimonio_id:patrimonioCriado?.id || null,
      localizacao_fisica:endereco?.codigo_curto || null,
      status:"DISPONIVEL",
      observacao:obs || "Gerado pela triagem offline"
    }]);

    if(eEst) throw eEst;
  }

  await dbOfflineSupabase().from("triagem_materiais").insert([{
    descricao:item.descricao_xml || "Item sem descrição",
    quantidade:Number(item.quantidade || 0),
    valor_unitario:Number(item.valor_unitario || 0),
    destino,
    obra_destino_id:obraDestino || null,
    status:"CONCLUIDO",
    usuario_triagem:usuario,
    observacao:obs || (endereco ? "Endereço: " + endereco.codigo_curto : null)
  }]);

  if(endereco?.id){
    await dbOfflineSupabase().from("enderecamento_estoque").update({status:"OCUPADO"}).eq("id", endereco.id);
  }

  await dbOfflineSupabase().from("entradas_materiais_itens").update({status_triagem:"TRIADO"}).eq("id", item.id);

  if(item.entrada_id){
    const pend = await dbOfflineSupabase()
      .from("entradas_materiais_itens")
      .select("id")
      .eq("entrada_id", item.entrada_id)
      .eq("status_triagem", "PENDENTE");

    if(!pend.error && (!pend.data || pend.data.length === 0)){
      await dbOfflineSupabase().from("entradas_materiais").update({status:"TRIADO"}).eq("id", item.entrada_id);
    }
  }

  return true;
}

/* =========================================================
   [05.6] REMOVER / MARCAR ERRO
========================================================= */
async function removerItemOffline(id){
  const bancoLocal = await abrirOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = bancoLocal.transaction(BDR_OFFLINE_STORE, "readwrite");
    const store = tx.objectStore(BDR_OFFLINE_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function atualizarErroOffline(id, erro){
  const bancoLocal = await abrirOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = bancoLocal.transaction(BDR_OFFLINE_STORE, "readwrite");
    const store = tx.objectStore(BDR_OFFLINE_STORE);
    const req = store.get(id);

    req.onsuccess = () => {
      const item = req.result;
      if(!item){ resolve(false); return; }
      item.tentativas = Number(item.tentativas || 0) + 1;
      item.ultimo_erro = erro;
      store.put(item);
      resolve(true);
    };

    req.onerror = () => reject(req.error);
  });
}

async function contarFilaOffline(){
  const bancoLocal = await abrirOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = bancoLocal.transaction(BDR_OFFLINE_STORE, "readonly");
    const store = tx.objectStore(BDR_OFFLINE_STORE);
    const req = store.count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

/* =========================================================
   [06] EVENTOS / AVISO
========================================================= */
window.addEventListener("online", () => {
  console.log("🌐 BDR OFFLINE: internet voltou.");
  bdrMostrarAvisoOffline("🌐 Internet voltou. Sincronizando...");
  sincronizarOffline();
});

window.addEventListener("offline", () => {
  console.log("📴 BDR OFFLINE: sistema offline.");
  bdrMostrarAvisoOffline("📴 Sem internet. As operações serão salvas no aparelho.");
});

document.addEventListener("DOMContentLoaded", () => {
  if(estaOnline()) setTimeout(sincronizarOffline, 1200);
});

function bdrMostrarAvisoOffline(msg){
  let aviso = document.getElementById("bdrOfflineAviso");

  if(!aviso){
    aviso = document.createElement("div");
    aviso.id = "bdrOfflineAviso";
    aviso.style.cssText = `
      position:fixed;
      right:18px;
      bottom:18px;
      z-index:999999;
      background:#111827;
      color:#fff;
      padding:12px 14px;
      border-radius:14px;
      box-shadow:0 14px 35px rgba(0,0,0,.28);
      font-family:Arial,sans-serif;
      font-size:13px;
      font-weight:900;
      max-width:360px;
      display:none;
    `;
    document.body.appendChild(aviso);
  }

  aviso.innerText = msg;
  aviso.style.display = "block";

  clearTimeout(window.__bdrOfflineAvisoTimer);
  window.__bdrOfflineAvisoTimer = setTimeout(() => {
    aviso.style.display = "none";
  }, 4200);
}

window.abrirOfflineDB = abrirOfflineDB;
window.estaOnline = estaOnline;
window.salvarOffline = salvarOffline;
window.sincronizarOffline = sincronizarOffline;
window.contarFilaOffline = contarFilaOffline;
window.bdrSalvarInsert = bdrSalvarInsert;
window.bdrSalvarUpdate = bdrSalvarUpdate;
window.bdrSalvarDelete = bdrSalvarDelete;


/* =========================================================
   BDR STATUS GLOBAL DE INTERNET / FILA
   Barra pequena igual app: online, offline, pendente.
========================================================= */
async function bdrAtualizarStatusGlobal(){
  let el = document.getElementById("bdrStatusGlobal");

  if(!el){
    el = document.createElement("div");
    el.id = "bdrStatusGlobal";
    el.style.cssText = `
      position:fixed;
      left:50%;
      bottom:16px;
      transform:translateX(-50%);
      z-index:999998;
      padding:9px 13px;
      border-radius:999px;
      font-family:Arial,sans-serif;
      font-size:12px;
      font-weight:900;
      box-shadow:0 12px 28px rgba(0,0,0,.22);
      display:none;
      align-items:center;
      gap:7px;
    `;
    document.body.appendChild(el);
  }

  let total = 0;
  try{ total = await contarFilaOffline(); }catch(e){ total = 0; }

  if(!estaOnline()){
    el.innerHTML = total > 0
      ? `🔴 Offline • ${total} pendente(s)`
      : `🔴 Offline`;
    el.style.background = "#dc2626";
    el.style.color = "#fff";
    el.style.display = "flex";
    return;
  }

  if(total > 0){
    el.innerHTML = `🟡 Online • ${total} aguardando sincronização`;
    el.style.background = "#f59e0b";
    el.style.color = "#111827";
    el.style.display = "flex";
    return;
  }

  el.innerHTML = "🟢 Tudo sincronizado";
  el.style.background = "#16a34a";
  el.style.color = "#fff";
  el.style.display = "flex";

  clearTimeout(window.__bdrStatusGlobalTimer);
  window.__bdrStatusGlobalTimer = setTimeout(() => {
    if(estaOnline()) el.style.display = "none";
  }, 2600);
}

window.addEventListener("online", () => setTimeout(bdrAtualizarStatusGlobal, 400));
window.addEventListener("offline", () => setTimeout(bdrAtualizarStatusGlobal, 400));
document.addEventListener("DOMContentLoaded", () => setTimeout(bdrAtualizarStatusGlobal, 900));
window.bdrAtualizarStatusGlobal = bdrAtualizarStatusGlobal;

console.log("✅ BDR offlineQueue.js V4 carregado.");
