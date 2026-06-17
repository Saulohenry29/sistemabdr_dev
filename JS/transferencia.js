let pedidos=[],obras=[];
const STATUS=["AGUARDANDO_RETIRADA","EM_TRANSITO","AGUARDANDO_CONFERENCIA","ENTREGUE","RECEBIDO_COM_DIVERGENCIA","EM_ANALISE_DIVERGENCIA"];

function ir(p){location.href=p}
function db(){return window.client||window.supabaseClient||window.clientSupabase}
function valor(id){return String(document.getElementById(id)?.value||"").trim()}
function usuarioAtual(){try{const u=localStorage.getItem("usuario_logado")||localStorage.getItem("usuarioLogado");return u?JSON.parse(u):null}catch(e){return null}}
function dataBR(d){if(!d)return "-";const x=new Date(String(d).replace(" ","T"));return isNaN(x.getTime())?d:x.toLocaleString("pt-BR")}
function cls(s){return String(s||"").replaceAll(" ","_").replaceAll("-","_")}
function perfil(){return String(usuarioAtual()?.perfil||"").toUpperCase()}
function ehMasterAdmin(){return ["MASTER","ADMIN"].includes(perfil())}
function ehAlmoxarifado(){return ["MASTER","ADMIN","ALMOXARIFE","ALMOXARIFADO"].includes(perfil())}
function obraUsuario(){return String(usuarioAtual()?.obra_id||"")}
function origemPedido(p){return String(p?.obra_origem_id||p?.origem_obra_id||p?.obra_saida_id||"")}
function destinoPedido(p){return String(p?.obra_destino_id||p?.obra_id||"")}

function podeVerPedido(p){
  if(ehMasterAdmin()) return true;
  const obra=obraUsuario();
  if(!obra) return false;
  return origemPedido(p)===obra || destinoPedido(p)===obra;
}

function podeDarSaida(p){
  if(ehMasterAdmin()) return true;
  const obra=obraUsuario();
  if(!obra) return false;
  return ehAlmoxarifado() && origemPedido(p)===obra;
}

function podeReceber(p){
  if(ehMasterAdmin()) return true;
  const obra=obraUsuario();
  if(!obra) return false;
  return destinoPedido(p)===obra;
}

function podeConferir(p){
  return podeReceber(p);
}

function carregarUsuarioTopo(){
  const u=usuarioAtual();
  const nome=document.getElementById("usuarioNome");
  const perf=document.getElementById("usuarioPerfil");
  if(nome) nome.innerText=u?"Olá, "+(u.nome||"usuário"):"Olá, usuário";
  if(perf) perf.innerText=u?(u.perfil||"-"):"-";
}

function toggleMenuUsuario(e){
  e?.stopPropagation();
  document.getElementById("dropdownUser")?.classList.toggle("ativo");
  document.getElementById("notifDropdown")?.classList.remove("ativo");
}

function toggleNotificacoes(e){
  e?.stopPropagation();
  document.getElementById("notifDropdown")?.classList.toggle("ativo");
  document.getElementById("dropdownUser")?.classList.remove("ativo");
}

document.addEventListener("click",()=>{
  document.getElementById("dropdownUser")?.classList.remove("ativo");
  document.getElementById("notifDropdown")?.classList.remove("ativo");
});

async function hist(id,ant,novo,obs){
  const u=usuarioAtual();
  const payload={pedido_id:id,status_anterior:ant,status_novo:novo,usuario:u?.nome||"Usuário",observacao:obs};
  let r=await db().from("historico_pedidos_retirada").insert([{...payload,created_at:new Date().toISOString()}]);
  if(r.error && String(r.error.message||"").includes("created_at")){
    r=await db().from("historico_pedidos_retirada").insert([payload]);
  }
  if(r.error) console.warn("Histórico não gravado:",r.error.message);
}

async function updatePedido(id,payload){
  let r=await db().from("pedidos_retirada").update(payload).eq("id",id);
  if(!r.error) return r;
  const msg=String(r.error.message||"");
  if(msg.includes("column")||msg.includes("does not exist")){
    console.warn("Coluna não existe, atualizando apenas status:",msg);
    return await db().from("pedidos_retirada").update({status:payload.status}).eq("id",id);
  }
  return r;
}

async function carregarDados(){
  if(!db()){alert("Supabase não carregado.");return}
  carregarUsuarioTopo();

  const ob=await db().from("obras").select("*").order("nome");
  obras=ob.data||[];

  const fo=document.getElementById("filtroObra");
  if(fo){
    const at=fo.value;
    fo.innerHTML='<option value="">Todas as obras</option>'+obras.map(o=>`<option value="${o.id}">${o.codigo_obra||"-"} - ${o.nome||"-"}</option>`).join("");
    fo.value=at;
  }

  const r=await db().from("pedidos_retirada").select("*, itens_retirada(*)").in("status",STATUS).order("id",{ascending:false});
  if(r.error){alert("Erro ao carregar transferências: "+r.error.message);return}

  pedidos=(r.data||[]).filter(podeVerPedido);
  renderizarPedidos();
}

function renderizarPedidos(){
  const kpiRet=document.getElementById("kpiRet"),kpiTrans=document.getElementById("kpiTrans"),kpiConf=document.getElementById("kpiConf"),kpiDiv=document.getElementById("kpiDiv");
  if(kpiRet) kpiRet.innerText=pedidos.filter(p=>p.status==="AGUARDANDO_RETIRADA").length;
  if(kpiTrans) kpiTrans.innerText=pedidos.filter(p=>p.status==="EM_TRANSITO").length;
  if(kpiConf) kpiConf.innerText=pedidos.filter(p=>p.status==="AGUARDANDO_CONFERENCIA").length;
  if(kpiDiv) kpiDiv.innerText=pedidos.filter(p=>["RECEBIDO_COM_DIVERGENCIA","EM_ANALISE_DIVERGENCIA"].includes(p.status)).length;

  const b=valor("busca").toLowerCase(),fs=valor("filtroStatus"),fo=valor("filtroObra");
  const lista=pedidos.filter(p=>{
    const itens=(p.itens_retirada||[]).map(i=>`${i.patrimonio_codigo||""} ${i.patrimonio_nome||""}`).join(" ");
    const txt=`${p.codigo||""} ${p.obra_nome||""} ${p.solicitante||""} ${p.status||""} ${p.motorista_nome||""} ${p.veiculo_placa||""} ${p.transportadora||""} ${itens}`.toLowerCase();
    const obra=destinoPedido(p);
    return txt.includes(b)&&(!fs||p.status===fs)&&(!fo||obra===String(fo));
  });
  const el=document.getElementById("listaPedidos");
  if(el) el.innerHTML=lista.length?lista.map(card).join(""):"<div class='card'>Nenhuma transferência encontrada.</div>";
}

function card(p){
  const itens=p.itens_retirada||[];
  return `<div class="pedido" id="ped-${p.id}">
    <div class="pedido-top" onclick="abrirPedido(${p.id})">
      <div class="cod">${p.codigo||"PED-"+p.id}</div>
      <div><b>${p.obra_nome||"-"}</b><div class="sub">Solicitante: ${p.solicitante||"-"}</div></div>
      <div><span class="status st-${cls(p.status)}">${p.status}</span><div class="sub">${itens.length} item(ns)</div></div>
      <div class="acoes-pedido" onclick="event.stopPropagation()">${acoes(p)}</div>
    </div>
    <div class="det">
      ${timeline(p.status)}
      ${rastro(p)}
      ${avisoPermissao(p)}
      <h4>Itens</h4>
      <div class="itens">${itens.map(i=>`<div class="item"><strong>${i.patrimonio_codigo||"-"}</strong><br>${i.patrimonio_nome||"-"}<br>Status: ${i.status||"-"}</div>`).join("")}</div>
    </div>
  </div>`;
}

function avisoPermissao(p){
  if(ehMasterAdmin()) return "";
  if(p.status==="AGUARDANDO_RETIRADA" && !podeDarSaida(p)) return `<div class="alerta">🔒 Somente a obra/setor de origem pode dar saída neste pedido.</div>`;
  if((p.status==="EM_TRANSITO"||p.status==="AGUARDANDO_CONFERENCIA") && !podeReceber(p)) return `<div class="alerta">🔒 Somente a obra/setor destino pode receber e conferir este pedido.</div>`;
  return "";
}

function acoes(p){
  if(p.status==="AGUARDANDO_RETIRADA"){
    return podeDarSaida(p)
      ? `<button class="btn green" onclick="abrirSaida(${p.id})">🚛 Dar saída</button>`
      : `<button class="btn gray" onclick="abrirPedido(${p.id})">🔒 Sem acesso</button>`;
  }
  if(p.status==="EM_TRANSITO"){
    return podeReceber(p)
      ? `<button class="btn orange" onclick="abrirRecebimento(${p.id})">📍 Receber na obra</button>`
      : `<button class="btn blue" onclick="abrirPedido(${p.id})">Detalhes</button>`;
  }
  if(p.status==="AGUARDANDO_CONFERENCIA"){
    return podeConferir(p)
      ? `<button class="btn green" onclick="abrirConferencia(${p.id})">🔎 Conferir</button>`
      : `<button class="btn blue" onclick="abrirPedido(${p.id})">Detalhes</button>`;
  }
  return `<button class="btn blue" onclick="abrirPedido(${p.id})">Detalhes</button>`;
}

function abrirPedido(id){document.getElementById("ped-"+id)?.classList.toggle("aberto")}

function timeline(s){
  const et=[["AGUARDANDO_RETIRADA","Retirada"],["EM_TRANSITO","Trânsito"],["AGUARDANDO_CONFERENCIA","Conferência"],["ENTREGUE","Recebido"]];
  if(["RECEBIDO_COM_DIVERGENCIA","EM_ANALISE_DIVERGENCIA"].includes(s))return `<div class="timeline">${et.slice(0,3).map(x=>`<div class="step done">${x[1]}</div>`).join("")}<div class="step err">Divergência</div></div>`;
  const idx=et.findIndex(x=>x[0]===s);
  return `<div class="timeline">${et.map((x,i)=>`<div class="step ${idx>i?"done":idx===i?"on":""}">${x[1]}</div>`).join("")}</div>`;
}

function rastro(p){
  return `<div class="rastro">
    <div><b>Origem</b><br>${nomeObra(origemPedido(p))||"CD / origem"}</div>
    <div><b>Destino</b><br>${p.obra_nome||nomeObra(destinoPedido(p))||"-"}</div>
    <div><b>Saída</b><br>${p.usuario_saida_cd||"-"}<br>${dataBR(p.data_saida_cd)}</div>
    <div><b>Transporte</b><br>${p.motorista_nome||"-"} • ${p.veiculo_placa||"-"}<br>${p.transportadora||"-"}</div>
    <div><b>Recebimento</b><br>${p.usuario_recebimento||"-"}<br>${dataBR(p.data_recebimento)}</div>
    <div><b>Conferência</b><br>${p.usuario_conferencia||"-"}<br>${dataBR(p.data_conferencia)}</div>
  </div>`;
}

function nomeObra(id){const o=obras.find(x=>String(x.id)===String(id));return o?`${o.codigo_obra||"-"} - ${o.nome||"-"}`:""}
function fecharModal(id){document.getElementById(id)?.classList.remove("ativo")}

function abrirSaida(id){
  const p=pedidos.find(x=>String(x.id)===String(id));
  if(!podeDarSaida(p)){alert("Sem permissão. Só a origem desta transferência pode dar saída.");return}
  document.getElementById("pedidoSaidaId").value=id;
  document.getElementById("motorista_nome").value=p?.motorista_nome||"";
  document.getElementById("veiculo_placa").value=p?.veiculo_placa||"";
  document.getElementById("transportadora").value=p?.transportadora||"";
  document.getElementById("observacao_transporte").value=p?.observacao_transporte||"";
  const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  document.getElementById("data_saida").value=d.toISOString().slice(0,16);
  document.getElementById("modalSaida").classList.add("ativo");
}

async function confirmarSaida(){
  const id=valor("pedidoSaidaId"),p=pedidos.find(x=>String(x.id)===String(id)),u=usuarioAtual();
  if(!podeDarSaida(p)){alert("Sem permissão. Só a origem desta transferência pode dar saída.");return}
  if(!valor("motorista_nome")||!valor("veiculo_placa")){alert("Informe motorista e placa.");return}
  const payload={status:"EM_TRANSITO",motorista_nome:valor("motorista_nome"),veiculo_placa:valor("veiculo_placa"),transportadora:valor("transportadora"),observacao_transporte:valor("observacao_transporte"),data_saida_cd:valor("data_saida")?new Date(valor("data_saida")).toISOString():new Date().toISOString(),usuario_saida_cd:u?.nome||"Usuário"};
  const r=await updatePedido(id,payload);if(r.error){alert(r.error.message);return}
  await db().from("itens_retirada").update({status:"RETIRADO",usuario_retirada:u?.nome||"Usuário",data_retirada:new Date().toISOString()}).eq("pedido_id",id).neq("status","NEGADO");
  await hist(id,p?.status,"EM_TRANSITO",`Saída CD. Motorista: ${payload.motorista_nome} | Placa: ${payload.veiculo_placa} | Transportadora: ${payload.transportadora||"-"}`);
  fecharModal("modalSaida");
  await carregarDados();
}

function abrirRecebimento(id){
  const p=pedidos.find(x=>String(x.id)===String(id));
  if(!podeReceber(p)){alert("Sem permissão. Só a obra/setor destino pode receber.");return}
  document.getElementById("pedidoReceberId").value=id;
  document.getElementById("recebimentoInfo").innerHTML=`Pedido <b>${p?.codigo||id}</b><br>Destino: <b>${p?.obra_nome||"-"}</b><br>Motorista: ${p?.motorista_nome||"-"} • Placa: ${p?.veiculo_placa||"-"}`;
  document.getElementById("modalRecebimento").classList.add("ativo");
}

async function confirmarRecebimento(){
  const id=valor("pedidoReceberId"),p=pedidos.find(x=>String(x.id)===String(id)),u=usuarioAtual();
  if(!podeReceber(p)){alert("Sem permissão. Só a obra/setor destino pode receber.");return}
  const r=await updatePedido(id,{status:"AGUARDANDO_CONFERENCIA",usuario_recebimento:u?.nome||"Usuário",data_recebimento:new Date().toISOString(),observacao_recebimento:valor("observacao_recebimento")});
  if(r.error){alert(r.error.message);return}
  await hist(id,p?.status,"AGUARDANDO_CONFERENCIA","Recebido na obra. Aguardando conferência.");
  fecharModal("modalRecebimento");
  await carregarDados();
}

function abrirConferencia(id){
  const p=pedidos.find(x=>String(x.id)===String(id));
  if(!podeConferir(p)){alert("Sem permissão. Só a obra/setor destino pode conferir.");return}
  document.getElementById("pedidoConferenciaId").value=id;
  document.getElementById("observacao_conferencia").value="";
  document.getElementById("modalConferencia").classList.add("ativo");
}

async function conferirOk(){
  const id=valor("pedidoConferenciaId"),p=pedidos.find(x=>String(x.id)===String(id)),u=usuarioAtual();
  if(!podeConferir(p)){alert("Sem permissão. Só a obra/setor destino pode conferir.");return}
  await updatePedido(id,{status:"ENTREGUE",usuario_conferencia:u?.nome||"Usuário",data_conferencia:new Date().toISOString(),observacao_conferencia:valor("observacao_conferencia")});
  await db().from("itens_retirada").update({status:"ENTREGUE",usuario_conferencia:u?.nome||"Usuário",data_conferencia:new Date().toISOString()}).eq("pedido_id",id).neq("status","NEGADO");
  for(const i of (p?.itens_retirada||[])){
    if(i.patrimonio_id) await db().from("patrimonio").update({status:"ESTOQUE",obra_id:p.obra_id||p.obra_destino_id,localizacao:p.obra_nome||null}).eq("id",i.patrimonio_id);
  }
  await gravarMovimentacoes(p,"TRANSFERENCIA_RECEBIDA","Transferência recebida e conferida sem divergência.");
  await hist(id,p?.status,"ENTREGUE","Conferido sem divergência. Patrimônios entraram no estoque da obra.");
  fecharModal("modalConferencia");
  await carregarDados();
}

function abrirDivergenciaDireto(){
  const id=valor("pedidoConferenciaId");
  const p=pedidos.find(x=>String(x.id)===String(id));
  if(!podeConferir(p)){alert("Sem permissão. Só a obra/setor destino pode registrar divergência.");return}
  document.getElementById("pedidoDivergenciaId").value=id;
  fecharModal("modalConferencia");
  document.getElementById("modalDivergencia").classList.add("ativo");
}

async function salvarDivergencia(){
  const id=valor("pedidoDivergenciaId"),p=pedidos.find(x=>String(x.id)===String(id)),u=usuarioAtual();
  if(!podeConferir(p)){alert("Sem permissão. Só a obra/setor destino pode registrar divergência.");return}
  const tipos=[...document.querySelectorAll(".checkDiv:checked")].map(c=>c.value).join(", ");
  const obs=valor("observacao_divergencia");
  if(!obs){alert("Descreva a divergência.");return}
  await updatePedido(id,{status:"EM_ANALISE_DIVERGENCIA",divergencia:true,tipo_divergencia:tipos,observacao_divergencia:obs,usuario_conferencia:u?.nome||"Usuário",data_conferencia:new Date().toISOString()});
  await db().from("itens_retirada").update({status:"DIVERGENCIA",usuario_conferencia:u?.nome||"Usuário",data_conferencia:new Date().toISOString()}).eq("pedido_id",id).neq("status","NEGADO");
  await hist(id,p?.status,"EM_ANALISE_DIVERGENCIA","Divergência registrada: "+tipos+" | "+obs);
  fecharModal("modalDivergencia");
  await carregarDados();
}

async function gravarMovimentacoes(p,tipo,obs){
  const u=usuarioAtual();
  for(const i of (p?.itens_retirada||[])){
    if(!i.patrimonio_id) continue;
    await db().from("movimentacoes").insert([{
      patrimonio_id:i.patrimonio_id,
      empresa_id:p.empresa_id||null,
      obra_origem_id:p.obra_origem_id||null,
      obra_destino_id:p.obra_id||p.obra_destino_id||null,
      tipo,
      status_anterior:"EM_TRANSITO",
      status_novo:"ESTOQUE",
      observacao:obs,
      usuario:u?.nome||"Usuário",
      data_movimentacao:new Date().toISOString()
    }]).then(r=>{if(r.error)console.warn("Movimentação não gravada:",r.error.message)});
  }
}

carregarDados();
