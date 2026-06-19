/* =========================================================
   BDR ERP - EXPEDIÇÃO MARKETPLACE INTERNO
   Catálogo compacto + carrinho + aprovação + reserva + retirada
========================================================= */
let itensCatalogo = [];
let carrinho = [];
let pedidos = [];
let obras = [];
let filtroAtual = "TODOS";
let pedidoRetiradaAtual = null;

function ir(p){ window.location.href = p; }
function db(){ return window.client || window.supabaseClient || window.clientSupabase || globalThis.client; }
function valor(id){ return String(document.getElementById(id)?.value || "").trim(); }
function esc(v){ return String(v ?? "").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function usuarioAtual(){ try{ const u=localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado"); return u ? JSON.parse(u) : null; }catch(e){ return null; } }
function perfil(){ return String(usuarioAtual()?.perfil || "").toUpperCase(); }
function perms(){ return String(usuarioAtual()?.permissoes || "").toUpperCase(); }
function podeTudo(){ return ["MASTER","ADMIN"].includes(perfil()) || perms().includes("VER_TODAS_OBRAS"); }
function podeVerOutras(){ return podeTudo() || perms().includes("VER_ESTOQUE_OUTRAS_OBRAS"); }
function podeSolicitarOutras(){ return podeTudo() || perms().includes("SOLICITAR_OUTRAS_OBRAS"); }
function podeAlmoxarife(){ return ["MASTER","ADMIN","ALMOXARIFE","ALMOXARIFADO"].includes(perfil()); }
function dataBR(d){ if(!d) return "-"; const x=new Date(String(d).replace(" ","T")); return isNaN(x.getTime()) ? String(d) : x.toLocaleString("pt-BR"); }
function normalStatus(s){ s = String(s || "").toUpperCase().replaceAll(" ","_"); if(["DISPONIVEL","NO_ESTOQUE"].includes(s)) return "ESTOQUE"; return s; }
function rotStatus(s){ const m={ESTOQUE:"ESTOQUE",DISPONIVEL:"ESTOQUE",NO_ESTOQUE:"ESTOQUE",EM_USO:"EM USO",MANUTENCAO:"MANUTENÇÃO",BAIXADO:"BAIXADO",QUEBRADO:"QUEBRADO",RESERVADO:"RESERVADO"}; return m[String(s||"").toUpperCase().replaceAll(" ","_")] || s || "-"; }
function statusClass(s){ return "st-" + String(s || "").toUpperCase().replaceAll(" ","_"); }
function nomeObra(id){ const o=obras.find(x=>String(x.id)===String(id)); return o ? `${o.codigo_obra || "-"} - ${o.nome || "-"}` : "Sem obra"; }
function obraCurta(id, fallback){ const txt = fallback || nomeObra(id); return txt.replace(/^\d+\s*-\s*/,'').slice(0,28); }
function fotoItem(i){ return i.foto_url || i.imagem_url || ""; }
function placeholderIcon(i){ const t = `${i.nome || i.descricao || ""}`.toLowerCase(); if(t.includes("furadeira")||t.includes("parafusadeira")) return "🔩"; if(t.includes("notebook")||t.includes("computador")) return "💻"; if(t.includes("impressora")) return "🖨️"; if(t.includes("solda")) return "⚡"; if(t.includes("capacete")) return "⛑️"; if(t.includes("cadeira")) return "🪑"; return "📦"; }
function carregarTopo(){ const u=usuarioAtual(); document.getElementById("usuarioNome").innerText = u ? "Olá, " + (u.nome || "usuário") : "Olá, usuário"; document.getElementById("usuarioPerfil").innerText = u ? (u.perfil || "-") : "-"; }
function toggleMenuUsuario(e){ e?.stopPropagation(); document.getElementById("dropdownUser")?.classList.toggle("ativo"); document.getElementById("notifDropdown")?.classList.remove("ativo"); }
function toggleNotificacoes(e){ e?.stopPropagation(); document.getElementById("notifDropdown")?.classList.toggle("ativo"); document.getElementById("dropdownUser")?.classList.remove("ativo"); }
document.addEventListener("click",()=>{document.getElementById("dropdownUser")?.classList.remove("ativo");document.getElementById("notifDropdown")?.classList.remove("ativo");});

function abrirAba(nome, btn){ document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active")); document.getElementById("tab-"+nome)?.classList.add("active"); document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active")); btn?.classList.add("active"); renderizarPedidos(); }
function filtrarStatus(st, btn){ filtroAtual = st; document.querySelectorAll(".chip-exp").forEach(b=>b.classList.remove("active")); btn?.classList.add("active"); renderizarCatalogo(); }

async function carregarTudo(){
  if(!db()){ alert("Supabase não carregado."); return; }
  carregarTopo();
  const ob = await db().from("obras").select("*").eq("ativa",true).order("nome");
  obras = ob.data || [];
  await Promise.all([carregarCatalogo(), carregarPedidos()]);
  renderizarTudo();
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
function cardItem(i){
  const st = normalStatus(i.status);
  const podePedir = st === "ESTOQUE" && (podeSolicitarOutras() || String(i.obra_id||"") === String(usuarioAtual()?.obra_id||""));
  const acao = st === "ESTOQUE" ? "fa-cart-shopping" : st === "EM_USO" ? "fa-eye" : st === "MANUTENCAO" ? "fa-wrench" : "fa-lock";
  const cls = st === "ESTOQUE" ? "ok" : st === "EM_USO" ? "info" : "block";
  const foto = fotoItem(i);
  return `<div class="produto-card" onclick="abrirDetalhe('${i.origem_tabela}',${i.id})">
    <button class="btn-card-action ${cls}" onclick="event.stopPropagation();acaoItem('${i.origem_tabela}',${i.id})" title="${st==='ESTOQUE'?'Adicionar ao carrinho':st==='EM_USO'?'Registrar interesse':'Indisponível'}"><i class="fa-solid ${acao}"></i></button>
    <div class="produto-foto">${foto ? `<img src="${esc(foto)}" onerror="this.outerHTML='<div class=placeholder>${placeholderIcon(i)}</div>'">` : `<div class="placeholder">${placeholderIcon(i)}</div>`}<div class="hover-detalhe">👁 Ver detalhes</div></div>
    <div class="produto-info"><div class="produto-nome">${esc(i.nome)}</div><div class="produto-obra">📍 ${esc(obraCurta(i.obra_id,i.obra_nome))}</div><div class="produto-rodape"><span class="badge-status ${statusClass(st)}">${rotStatus(st)}</span><span class="produto-qtd">${Number(i.qtd||1)} unid</span></div></div>
  </div>`;
}
function buscarItem(origem,id){ return itensCatalogo.find(i=>i.origem_tabela===origem && Number(i.id)===Number(id)); }
function acaoItem(origem,id){ const item = buscarItem(origem,id); if(!item) return; const st=normalStatus(item.status); if(st === "ESTOQUE") addCarrinho(item); else if(st === "EM_USO") addInteresse(item); else alert("Item indisponível para solicitação no momento."); }
function addCarrinho(item){ if(carrinho.some(c=>c.origem_tabela===item.origem_tabela && Number(c.id)===Number(item.id))) return; carrinho.push({...item, tipo_solicitacao:"RETIRADA"}); renderizarCarrinho(); }
function addInteresse(item){ if(carrinho.some(c=>c.origem_tabela===item.origem_tabela && Number(c.id)===Number(item.id))) return; carrinho.push({...item, tipo_solicitacao:"INTERESSE"}); renderizarCarrinho(); }
function removerCarrinho(origem,id){ carrinho = carrinho.filter(c=>!(c.origem_tabela===origem && Number(c.id)===Number(id))); renderizarCarrinho(); }
function renderizarCarrinho(){
  const box=document.getElementById("cartItens"); document.getElementById("cartQtd").innerText=carrinho.length; document.getElementById("cartResumoItens").innerText=carrinho.length; document.getElementById("cartResumoObras").innerText=new Set(carrinho.map(c=>String(c.obra_id||""))).size;
  if(!carrinho.length){ box.innerHTML=`<div class="cart-empty">Carrinho vazio.</div>`; return; }
  box.innerHTML = carrinho.map(i=>`<div class="cart-item"><div class="cart-img">${fotoItem(i)?`<img src="${esc(fotoItem(i))}">`:placeholderIcon(i)}</div><div class="cart-info"><strong>${esc(i.nome)}</strong><span>${esc(obraCurta(i.obra_id,i.obra_nome))} • ${i.tipo_solicitacao==='INTERESSE'?'Interesse':'Retirada'}</span></div><button class="cart-remove" onclick="removerCarrinho('${i.origem_tabela}',${i.id})"><i class="fa-solid fa-trash"></i></button></div>`).join("");
}

async function enviarSolicitacao(){
  if(!carrinho.length){ alert("Adicione itens ao carrinho."); return; }
  const u=usuarioAtual();
  const grupos = {};
  carrinho.forEach(i=>{ const k=String(i.obra_id||"SEM_ORIGEM"); if(!grupos[k]) grupos[k]=[]; grupos[k].push(i); });
  for(const origemId of Object.keys(grupos)){
    const itens=grupos[origemId];
    const codigo="EXP-"+new Date().getFullYear()+"-"+String(Date.now()).slice(-6)+"-"+Math.floor(Math.random()*99);
    const obraDestinoId = u?.obra_id || null;
    const pedido = {
      codigo, status:"AGUARDANDO_AUTORIZACAO", solicitante:u?.nome||"Usuário", usuario_criacao:u?.nome||"Usuário",
      obra_id:obraDestinoId, obra_destino_id:obraDestinoId, obra_nome:nomeObra(obraDestinoId), obra_origem_id:origemId==="SEM_ORIGEM"?null:Number(origemId),
      observacao:valor("obsSolicitacao") || "Solicitação criada pelo catálogo interno."
    };
    const r=await db().from("pedidos_retirada").insert([pedido]).select().single();
    if(r.error){ alert("Erro ao criar solicitação: "+r.error.message); return; }
    const itensPayload=itens.map(i=>({
      pedido_id:r.data.id, patrimonio_id:i.patrimonio_id || (i.origem_tabela==="patrimonio"?i.id:null), produto_id:i.produto_id || (i.origem_tabela==="estoque_produtos"?i.id:null),
      patrimonio_codigo:i.codigo, patrimonio_nome:i.nome, endereco_codigo:i.localizacao, obra_origem_id:i.obra_id || null, obra_destino_id:obraDestinoId,
      status:i.tipo_solicitacao==="INTERESSE"?"INTERESSE":"PENDENTE", quantidade:1
    }));
    const ri=await db().from("itens_retirada").insert(itensPayload);
    if(ri.error){ alert("Pedido criado, mas erro nos itens: "+ri.error.message); return; }
    await hist(r.data.id,null,"AGUARDANDO_AUTORIZACAO",`Solicitação criada por ${u?.nome||"Usuário"}.`);
    await notificarGestao("Nova solicitação de expedição", `${u?.nome||"Usuário"} solicitou ${itens.length} item(ns) de ${nomeObra(origemId)}.`, "expedicao.html");
  }
  carrinho=[]; document.getElementById("obsSolicitacao").value=""; alert("Solicitação enviada com sucesso!"); await carregarTudo();
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
  lista("listaSolicitacoes", por("AGUARDANDO_AUTORIZACAO")); lista("listaSeparacao", por("EM_SEPARACAO")); lista("listaReservados", por("AGUARDANDO_RETIRADA")); lista("listaRetirada", por("AGUARDANDO_RETIRADA")); lista("listaTransito", por("EM_TRANSITO")); lista("listaHistorico", pedidos.filter(p=>["ENTREGUE","NEGADO","RECEBIDO_COM_DIVERGENCIA"].includes(p.status)));
}
function lista(id, arr){ const el=document.getElementById(id); if(!el) return; if(!arr.length){ el.innerHTML=`<div class="cart-empty">Nenhum registro encontrado.</div>`; return; } el.innerHTML=arr.map(p=>pedidoHTML(p)).join(""); }
function pedidoHTML(p){ const itens=p.itens_retirada||[]; return `<div class="pedido-card"><div class="pedido-top"><div class="pedido-cod">${esc(p.codigo||"PED-"+p.id)}</div><div><b>${esc(p.obra_nome||"-")}</b><div class="pedido-small">Solicitante: ${esc(p.solicitante||"-")} • Origem: ${esc(nomeObra(p.obra_origem_id))}</div></div><div><span class="badge-status ${statusClass(p.status)}">${esc(p.status)}</span><div class="pedido-small">${itens.length} item(ns)</div></div><div class="pedido-actions">${acoesPedido(p)}</div></div></div>`; }
function acoesPedido(p){ if(p.status==="AGUARDANDO_AUTORIZACAO"&&podeAlmoxarife()) return `<button class="btn-mini btn-ok" onclick="autorizar(${p.id})">Aprovar</button><button class="btn-mini btn-red" onclick="negar(${p.id})">Negar</button>`; if(p.status==="EM_SEPARACAO"&&podeAlmoxarife()) return `<button class="btn-mini btn-ok" onclick="reservar(${p.id})">Reservar</button>`; if(p.status==="AGUARDANDO_RETIRADA"&&podeAlmoxarife()) return `<button class="btn-mini btn-ok" onclick="abrirRetirada(${p.id})">Retirada</button>`; return `<button class="btn-mini btn-blue" onclick="alert('Detalhes em evolução')">Detalhes</button>`; }
async function autorizar(id){ await db().from("pedidos_retirada").update({status:"EM_SEPARACAO"}).eq("id",id); await hist(id,"AGUARDANDO_AUTORIZACAO","EM_SEPARACAO","Solicitação aprovada."); await carregarTudo(); }
async function negar(id){ const motivo=prompt("Motivo da negativa:")||"Negado"; await db().from("pedidos_retirada").update({status:"NEGADO",motivo_recusa:motivo}).eq("id",id); await hist(id,"AGUARDANDO_AUTORIZACAO","NEGADO",motivo); await carregarTudo(); }
async function reservar(id){ await db().from("pedidos_retirada").update({status:"AGUARDANDO_RETIRADA"}).eq("id",id); await db().from("itens_retirada").update({status:"RESERVADO"}).eq("pedido_id",id); await hist(id,"EM_SEPARACAO","AGUARDANDO_RETIRADA","Itens reservados e aguardando retirada."); await carregarTudo(); }
function abrirRetirada(id){ pedidoRetiradaAtual=id; document.getElementById("modalRetirada").classList.add("ativo"); }
function fecharModalRetirada(){ document.getElementById("modalRetirada").classList.remove("ativo"); pedidoRetiradaAtual=null; }
async function confirmarRetiradaModal(){ const id=pedidoRetiradaAtual; if(!id) return; if(!valor("retMotorista")){alert("Informe o motorista/responsável.");return;} await db().from("pedidos_retirada").update({status:"EM_TRANSITO",motorista_nome:valor("retMotorista"),veiculo_placa:valor("retPlaca"),transportadora:valor("retVeiculo"),data_saida_cd:new Date().toISOString(),usuario_saida_cd:usuarioAtual()?.nome||"Usuário"}).eq("id",id); await hist(id,"AGUARDANDO_RETIRADA","EM_TRANSITO",`Retirado por ${valor("retMotorista")} • ${valor("retPlaca")}`); fecharModalRetirada(); await carregarTudo(); }
function abrirDetalhe(origem,id){ const i=buscarItem(origem,id); if(!i) return; document.getElementById("modalTitulo").innerText=i.nome; document.getElementById("modalConteudo").innerHTML=`<div class="modal-grid"><div class="modal-img">${fotoItem(i)?`<img src="${esc(fotoItem(i))}">`:`<div style="font-size:70px">${placeholderIcon(i)}</div>`}</div><div><div class="det-line"><b>Código:</b> ${esc(i.codigo||"-")}</div><div class="det-line"><b>Obra atual:</b> ${esc(nomeObra(i.obra_id))}</div><div class="det-line"><b>Status:</b> <span class="badge-status ${statusClass(normalStatus(i.status))}">${rotStatus(i.status)}</span></div><div class="det-line"><b>Quantidade:</b> ${esc(i.qtd||1)}</div><div class="det-line"><b>Localização:</b> ${esc(i.localizacao||"-")}</div><div class="det-line"><b>Marca/Modelo:</b> ${esc(i.marca||"-")} / ${esc(i.modelo||"-")}</div><div class="det-line"><b>Estado:</b> ${esc(i.estado||"-")}</div><br><button class="btn-ok" onclick="acaoItem('${i.origem_tabela}',${i.id});fecharModalDetalhe()">${normalStatus(i.status)==='ESTOQUE'?'Adicionar ao carrinho':'Registrar interesse'}</button></div></div>`; document.getElementById("modalDetalhe").classList.add("ativo"); }
function fecharModalDetalhe(){ document.getElementById("modalDetalhe").classList.remove("ativo"); }

document.addEventListener("DOMContentLoaded", carregarTudo);


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
