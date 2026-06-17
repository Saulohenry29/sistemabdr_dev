let pedidos=[],obras=[],audioCtx=null,scanner=null,scanCtx=null,ultimoErro="",ultimoErroEm=0;
const STATUS_RETIRADA=["AGUARDANDO_AUTORIZACAO","EM_SEPARACAO","AGUARDANDO_RETIRADA"];
function ir(p){location.href=p}function db(){return window.client||window.supabaseClient||window.clientSupabase}function valor(id){return String(document.getElementById(id)?.value||"").trim()}
function usuarioAtual(){try{const u=localStorage.getItem("usuario_logado")||localStorage.getItem("usuarioLogado");return u?JSON.parse(u):null}catch(e){return null}}
function perfil(){return String(usuarioAtual()?.perfil||"").toUpperCase()}function podeGestao(){return ["MASTER","ADMIN","ALMOXARIFE","ALMOXARIFADO"].includes(perfil())}
function dataBR(d){if(!d)return"-";const x=new Date(String(d).replace(" ","T"));return isNaN(x.getTime())?d:x.toLocaleString("pt-BR")}function cls(s){return String(s||"").replaceAll(" ","_").replaceAll("-","_")}
function carregarUsuarioTopo(){const u=usuarioAtual();document.getElementById("usuarioNome").innerText=u?"Olá, "+(u.nome||"usuário"):"Olá, usuário";document.getElementById("usuarioPerfil").innerText=u?(u.perfil||"-"):"-"}
function toggleMenuUsuario(e){e?.stopPropagation();document.getElementById("dropdownUser")?.classList.toggle("ativo");document.getElementById("notifDropdown")?.classList.remove("ativo")}
function toggleNotificacoes(e){e?.stopPropagation();document.getElementById("notifDropdown")?.classList.toggle("ativo");document.getElementById("dropdownUser")?.classList.remove("ativo")}
document.addEventListener("click",()=>{document.getElementById("dropdownUser")?.classList.remove("ativo");document.getElementById("notifDropdown")?.classList.remove("ativo")});
function prepararSom(){try{const C=window.AudioContext||window.webkitAudioContext;if(!audioCtx)audioCtx=new C();if(audioCtx.state==="suspended")audioCtx.resume()}catch(e){}}
document.addEventListener("pointerdown",prepararSom,{once:false});
function beep(tipo="ok"){try{prepararSom();if(!audioCtx)return;const seq=tipo==="erro"?[180,120]:[760];seq.forEach((f,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain(),t=audioCtx.currentTime+i*.16;o.type=tipo==="erro"?"square":"sine";o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(tipo==="erro"?.2:.22,t+.02);g.gain.linearRampToValueAtTime(.0001,t+.13);o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+.15)});if(navigator.vibrate)navigator.vibrate(tipo==="erro"?[100,60,100]:[60])}catch(e){}}
function toast(t,x){const el=document.getElementById("toast");if(!el)return;el.querySelector("strong").innerText=t;el.querySelector("span").innerText=x;el.style.display="block";setTimeout(()=>el.style.display="none",3600)}
function abrirAba(n,btn){document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));document.getElementById('tab-'+n)?.classList.add('active');document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));btn?.classList.add('active');renderizarTudo()}
function validados(pedidoId){try{return JSON.parse(localStorage.getItem('bdr_sep_validado_'+pedidoId)||'[]').map(String)}catch(e){return[]}}
function marcarValidado(pedidoId,itemId){const v=new Set(validados(pedidoId));v.add(String(itemId));localStorage.setItem('bdr_sep_validado_'+pedidoId,JSON.stringify([...v]))}
function itemValidado(pedidoId,item){return validados(pedidoId).includes(String(item.id))}
function todosValidados(p){const itens=(p.itens_retirada||[]).filter(i=>i.status!=="NEGADO");return itens.length>0&&itens.every(i=>itemValidado(p.id,i))}
async function carregarDados(){if(!db()){alert('Supabase não carregado.');return}carregarUsuarioTopo();const ob=await db().from('obras').select('*').order('nome');obras=ob.data||[];const f=document.getElementById('filtroObra');const atual=f.value;f.innerHTML='<option value="">Todas as obras</option>'+obras.map(o=>`<option value="${o.id}">${o.codigo_obra||'-'} - ${o.nome||'-'}</option>`).join('');f.value=atual;
const r=await db().from('pedidos_retirada').select('*, itens_retirada(*)').in('status',STATUS_RETIRADA).order('id',{ascending:false});if(r.error){alert('Erro ao carregar pedidos: '+r.error.message);return}pedidos=r.data||[];const u=usuarioAtual();if(!podeGestao()&&u?.obra_id){pedidos=pedidos.filter(p=>String(p.obra_id||p.obra_destino_id||'')===String(u.obra_id))}renderizarTudo()}
function filtrar(lista){const b=valor('busca').toLowerCase(),fo=valor('filtroObra');return lista.filter(p=>{const itens=(p.itens_retirada||[]).map(i=>`${i.patrimonio_codigo||''} ${i.patrimonio_nome||''}`).join(' ');const txt=`${p.codigo||''} ${p.obra_nome||''} ${p.solicitante||''} ${p.status||''} ${itens}`.toLowerCase();const obra=String(p.obra_id||p.obra_destino_id||'');return txt.includes(b)&&(!fo||obra===String(fo))})}
function renderizarTudo(){document.getElementById('kpiAut').innerText=pedidos.filter(p=>p.status==='AGUARDANDO_AUTORIZACAO').length;document.getElementById('kpiSep').innerText=pedidos.filter(p=>p.status==='EM_SEPARACAO').length;document.getElementById('kpiPronto').innerText=pedidos.filter(p=>p.status==='AGUARDANDO_RETIRADA').length;renderLista('listaSeparar',filtrar(pedidos.filter(p=>p.status==='EM_SEPARACAO')),'separar');renderLista('listaAutorizar',filtrar(pedidos.filter(p=>p.status==='AGUARDANDO_AUTORIZACAO')),'autorizar');renderLista('listaProntos',filtrar(pedidos.filter(p=>p.status==='AGUARDANDO_RETIRADA')),'pronto');renderLista('listaTodos',filtrar(pedidos),'todos')}
function renderLista(id,lista,modo){const el=document.getElementById(id);if(!lista.length){el.innerHTML='<div class="card">Nenhum pedido encontrado.</div>';return}el.innerHTML=lista.map(p=>cardPedido(p,modo)).join('')}
function cardPedido(p,modo){const itens=p.itens_retirada||[];const sep=itens.filter(i=>i.status==='SEPARADO'||itemValidado(p.id,i)).length;return `<div class="pedido" id="ped-${modo}-${p.id}"><div class="pedido-top" onclick="togglePedido('${modo}',${p.id})"><div class="cod">${p.codigo||'PED-'+p.id}</div><div><b>${p.obra_nome||'-'}</b><div class="sub">Solicitante: ${p.solicitante||'-'}</div></div><div><span class="status st-${cls(p.status)}">${p.status}</span><div class="sub">${sep}/${itens.length} item(ns)</div></div><div onclick="event.stopPropagation()">${acoes(p,modo)}</div></div><div class="det">${modo==='separar'?mobileSeparacao(p):''}<h4>Itens</h4><div class="itens">${itens.map(i=>itemHtml(p,i)).join('')}</div></div></div>`}
function acoes(p,modo){if(modo==='autorizar'&&p.status==='AGUARDANDO_AUTORIZACAO'&&podeGestao())return `<button class="btn green" onclick="autorizar(${p.id})">Autorizar</button> <button class="btn red" onclick="negar(${p.id})">Negar</button>`;if(modo==='separar')return `<button class="btn blue" onclick="togglePedido('${modo}',${p.id})">Separar</button>`;if(modo==='pronto')return `<button class="btn green" onclick="ir('transferencia.html')">Transferência</button>`;return `<button class="btn blue" onclick="togglePedido('${modo}',${p.id})">Detalhes</button>`}
function togglePedido(m,id){document.getElementById(`ped-${m}-${id}`)?.classList.toggle('aberto')}
function proximoItem(p){return (p.itens_retirada||[]).find(i=>i.status!=='NEGADO'&&!itemValidado(p.id,i))||null}
function mobileSeparacao(p){const itens=(p.itens_retirada||[]).filter(i=>i.status!=='NEGADO');const ok=itens.filter(i=>itemValidado(p.id,i)).length;const pct=itens.length?Math.round(ok*100/itens.length):0;const atual=proximoItem(p);if(!atual)return `<div class="mobile-sep"><div class="progress-text">${ok} de ${itens.length} validados</div><div class="progress"><span style="width:${pct}%"></span></div><div class="item-atual ok"><h2>✅ Todos os itens foram bipados</h2><p>Confira e finalize para liberar na Transferência.</p><button class="bigbtn green" onclick="finalizarSeparacao(${p.id})">✅ Finalizar separação</button></div></div>`;return `<div class="mobile-sep"><div class="progress-text">${ok} de ${itens.length} validados</div><div class="progress"><span style="width:${pct}%"></span></div><div class="item-atual"><div class="sub">Item atual</div><h2>${atual.patrimonio_nome||'-'}</h2><div class="pat">${atual.patrimonio_codigo||'-'}</div><div class="sub">Prateleira / Endereço</div><div class="end">${atual.endereco_codigo||'SEM ENDEREÇO'}</div><button class="bigbtn" onclick="iniciarBip(${p.id},${atual.id})">📷 Iniciar leitura</button><div class="sub" style="margin-top:8px">Primeiro endereço, depois patrimônio. Errado = 2 bips. Certo = 1 bip.</div></div></div>`}
function itemHtml(p,i){const ok=itemValidado(p.id,i);return `<div class="item ${ok?'ok':''}"><strong>${i.patrimonio_codigo||'-'}</strong><br>${i.patrimonio_nome||'-'}<br>Endereço: ${i.endereco_codigo||'-'}<br>Status: <span class="status st-${cls(i.status)}">${ok?'BIPADO':(i.status||'-')}</span>${i.usuario_separacao?`<br><small>Separado por ${i.usuario_separacao} • ${dataBR(i.data_separacao)}</small>`:''}</div>`}
function norm(c){try{const u=new URL(c);return String(u.searchParams.get('id')||c).trim().toUpperCase()}catch(e){return String(c||'').trim().toUpperCase()}}
function itemPorId(pedidoId,itemId){const p=pedidos.find(x=>String(x.id)===String(pedidoId));return {p,item:(p?.itens_retirada||[]).find(i=>String(i.id)===String(itemId))}}
async function iniciarBip(pedidoId,itemId){const {p,item}=itemPorId(pedidoId,itemId);if(!item)return;abrirScanner({tipo:'ENDERECO',pedidoId,itemId,esperado:item.endereco_codigo||'',proximo:item.patrimonio_codigo||''})}
async function abrirScanner(ctx){scanCtx=ctx;document.getElementById('scannerTitulo').innerText=ctx.tipo==='ENDERECO'?'📍 Bipar prateleira/endereço':'🏷 Bipar patrimônio';document.getElementById('scanStatus').innerHTML=`Esperado:<b>${ctx.esperado||'-'}</b>`;document.getElementById('modalScanner').classList.add('ativo');try{if(scanner)await fecharScanner(false);document.getElementById('reader').innerHTML='';scanner=new Html5Qrcode('reader');await scanner.start({facingMode:'environment'},{fps:10,qrbox:250},processarLeitura,()=>{})}catch(e){alert('Erro ao abrir câmera: '+(e.message||e))}}
async function processarLeitura(codigo){if(!scanCtx)return;const lido=norm(codigo),esp=norm(scanCtx.esperado);if(lido===esp){beep('ok');toast('Bip correto',lido);const old={...scanCtx};await fecharScanner(false);if(old.tipo==='ENDERECO'){setTimeout(()=>abrirScanner({tipo:'PATRIMONIO',pedidoId:old.pedidoId,itemId:old.itemId,esperado:old.proximo}),650)}else{await confirmarItem(old.pedidoId,old.itemId)}}else{const agora=Date.now(),ch=lido+'|'+esp;if(ch!==ultimoErro||agora-ultimoErroEm>1300){ultimoErro=ch;ultimoErroEm=agora;beep('erro');toast('Código errado',`Lido: ${lido} | Esperado: ${esp}`)}document.getElementById('scanStatus').innerHTML=`❌ Código errado<br>Lido: <b>${lido}</b>Esperado:<b>${esp}</b>`}}
async function fecharScanner(clear=true){try{if(scanner){await scanner.stop().catch(()=>{});await scanner.clear().catch(()=>{});scanner=null}}catch(e){}document.getElementById('modalScanner')?.classList.remove('ativo');if(clear)scanCtx=null}
async function hist(pedido,ant,novo,obs,item=null){const u=usuarioAtual();await db().from('historico_pedidos_retirada').insert([{pedido_id:pedido,item_id:item,status_anterior:ant,status_novo:novo,usuario:u?.nome||'Usuário',observacao:obs}]).then(r=>{if(r.error)console.warn(r.error.message)})}
async function confirmarItem(pedidoId,itemId){const u=usuarioAtual();marcarValidado(pedidoId,itemId);await db().from('itens_retirada').update({status:'SEPARADO',usuario_separacao:u?.nome||'Usuário',data_separacao:new Date().toISOString()}).eq('id',itemId);await hist(pedidoId,'PENDENTE','SEPARADO','Item separado com bip de endereço e patrimônio.',itemId);beep('ok');await carregarDados();const p=pedidos.find(x=>String(x.id)===String(pedidoId));if(p&&!todosValidados(p)){setTimeout(()=>{const prox=proximoItem(p);if(prox)iniciarBip(pedidoId,prox.id)},700)}}
async function finalizarSeparacao(id){const p=pedidos.find(x=>String(x.id)===String(id));if(!p||!todosValidados(p)){beep('erro');alert('Ainda falta bipar item.');return}if(!confirm('Finalizar separação e liberar para Transferência?'))return;await db().from('pedidos_retirada').update({status:'AGUARDANDO_RETIRADA'}).eq('id',id);await hist(id,'EM_SEPARACAO','AGUARDANDO_RETIRADA','Separação finalizada. Pedido aguardando retirada/transferência.');beep('ok');await carregarDados()}
async function autorizar(id){if(!podeGestao())return;const p=pedidos.find(x=>String(x.id)===String(id));if(!confirm('Autorizar pedido?'))return;await db().from('pedidos_retirada').update({status:'EM_SEPARACAO'}).eq('id',id);await hist(id,p?.status,'EM_SEPARACAO','Pedido autorizado.');beep('ok');await carregarDados()}
async function negar(id){if(!podeGestao())return;const m=prompt('Motivo da negativa:');if(!m)return;const p=pedidos.find(x=>String(x.id)===String(id));await db().from('pedidos_retirada').update({status:'NEGADO',motivo_recusa:m}).eq('id',id);await db().from('itens_retirada').update({status:'NEGADO'}).eq('pedido_id',id);await hist(id,p?.status,'NEGADO','Pedido negado: '+m);beep('erro');await carregarDados()}
carregarDados();


/* =========================================================
   BDR CORREÇÃO RETIRADA 100.1
   - Ordem correta: Autorizar → Separar → Prontos → Todos
   - Solicitante acompanha, não separa
   - Origem separa/autoriza; Master/Admin veem tudo
========================================================= */
function bdrPermissoesRet(){
  return String(usuarioAtual()?.permissoes || "")
    .split(",")
    .map(p => p.trim().toUpperCase())
    .filter(Boolean);
}
function bdrTemPermRet(p){ return bdrPermissoesRet().includes(String(p || "").toUpperCase()); }
function bdrEhMasterAdminRet(){ return ["MASTER","ADMIN"].includes(perfil()); }
function bdrObraUsuarioRet(){ return String(usuarioAtual()?.obra_id || ""); }
function bdrOrigemPedidoRet(p){ return String(p.obra_origem_id || ""); }
function bdrDestinoPedidoRet(p){ return String(p.obra_destino_id || p.obra_id || ""); }
function bdrPodeVerPedidoRet(p){
  if(bdrEhMasterAdminRet()) return true;
  const u = usuarioAtual();
  const obra = bdrObraUsuarioRet();
  if(String(p.solicitante || "") === String(u?.nome || "")) return true;
  if(String(p.usuario_criacao || "") === String(u?.nome || "")) return true;
  return obra && (bdrOrigemPedidoRet(p) === obra || bdrDestinoPedidoRet(p) === obra);
}
function bdrPodeAtuarOrigemRet(p){
  if(bdrEhMasterAdminRet()) return true;
  const obra = bdrObraUsuarioRet();
  if(!obra || bdrOrigemPedidoRet(p) !== obra) return false;
  return podeGestao() || bdrTemPermRet("APROVAR_PEDIDO_ORIGEM") || bdrTemPermRet("SEPARAR_PEDIDO");
}
function bdrPodeSepararRet(p){
  if(bdrEhMasterAdminRet()) return true;

  const u = usuarioAtual();
  const obra = bdrObraUsuarioRet();
  const origem = bdrOrigemPedidoRet(p);
  const destino = bdrDestinoPedidoRet(p);

  // Quem pediu ou quem está recebendo acompanha, mas não separa.
  if(String(p.solicitante || "") === String(u?.nome || "")) return false;
  if(destino && destino === obra) return false;

  // Almoxarife/almoxarifado separa somente quando a obra dele é a ORIGEM.
  if(!obra || origem !== obra) return false;

  return podeGestao() || bdrTemPermRet("SEPARAR_PEDIDO");
}
function bdrPedidoFocoRet(){ return localStorage.getItem("bdr_pedido_foco") || ""; }

async function carregarDados(){
  if(!db()){alert('Supabase não carregado.');return}
  carregarUsuarioTopo();
  const ob=await db().from('obras').select('*').order('nome');
  obras=ob.data||[];
  const f=document.getElementById('filtroObra');
  if(f){
    const atual=f.value;
    f.innerHTML='<option value="">Todas as obras</option>'+obras.map(o=>`<option value="${o.id}">${o.codigo_obra||'-'} - ${o.nome||'-'}</option>`).join('');
    f.value=atual;
  }
  const r=await db().from('pedidos_retirada').select('*, itens_retirada(*)').in('status',STATUS_RETIRADA).order('id',{ascending:false});
  if(r.error){alert('Erro ao carregar pedidos: '+r.error.message);return}
  pedidos=(r.data||[]).filter(bdrPodeVerPedidoRet);
  renderizarTudo();
  aplicarAbaUrlRetirada();
}

function renderizarTudo(){
  const visiveis = pedidos;
  document.getElementById('kpiAut').innerText=visiveis.filter(p=>p.status==='AGUARDANDO_AUTORIZACAO').length;
  document.getElementById('kpiSep').innerText=visiveis.filter(p=>p.status==='EM_SEPARACAO').length;
  document.getElementById('kpiPronto').innerText=visiveis.filter(p=>p.status==='AGUARDANDO_RETIRADA').length;
  renderLista('listaAutorizar',filtrar(visiveis.filter(p=>p.status==='AGUARDANDO_AUTORIZACAO')),'autorizar');
  renderLista('listaSeparar',filtrar(visiveis.filter(p=>p.status==='EM_SEPARACAO')),'separar');
  renderLista('listaProntos',filtrar(visiveis.filter(p=>p.status==='AGUARDANDO_RETIRADA')),'pronto');
  renderLista('listaTodos',filtrar(visiveis),'todos');
}

function acoes(p,modo){
  if(modo==='autorizar' && p.status==='AGUARDANDO_AUTORIZACAO'){
    if(bdrPodeAtuarOrigemRet(p)) return `<button class="btn green" onclick="autorizar(${p.id})">Autorizar</button> <button class="btn red" onclick="negar(${p.id})">Negar</button>`;
    return `<div class="acao-bloqueada">Acompanhamento</div>`;
  }
  if(modo==='separar' && p.status==='EM_SEPARACAO'){
    if(bdrPodeSepararRet(p)) return `<button class="btn blue" onclick="togglePedido('${modo}',${p.id})">Separar</button>`;
    return `<button class="btn gray" onclick="togglePedido('${modo}',${p.id})">Acompanhar</button>`;
  }
  if(modo==='pronto'){
    if(bdrPodeSepararRet(p)) return `<button class="btn green" onclick="ir('transferencia.html')">Transferência</button>`;
    return `<button class="btn blue" onclick="togglePedido('${modo}',${p.id})">Detalhes</button>`;
  }
  return `<button class="btn blue" onclick="togglePedido('${modo}',${p.id})">Detalhes</button>`;
}

function cardPedido(p,modo){
  const itens=p.itens_retirada||[];
  const sep=itens.filter(i=>i.status==='SEPARADO'||itemValidado(p.id,i)).length;
  const detalheSeparacao = (modo==='separar' && bdrPodeSepararRet(p)) ? mobileSeparacao(p) : (modo==='separar' ? `<div class="mobile-sep"><b>👀 Acompanhamento</b><br><span class="sub">Este pedido está em separação pela origem. O solicitante/destino não pode bipar nem finalizar.</span></div>` : '');
  return `<div class="pedido" id="ped-${modo}-${p.id}"><div class="pedido-top" onclick="togglePedido('${modo}',${p.id})"><div class="cod">${p.codigo||'PED-'+p.id}</div><div><b>${p.obra_nome||'-'}</b><div class="sub">Solicitante: ${p.solicitante||'-'}<br>Origem: ${nomeObraRet(p.obra_origem_id)} • Destino: ${nomeObraRet(p.obra_destino_id||p.obra_id)}</div></div><div><span class="status st-${cls(p.status)}">${p.status}</span><div class="sub">${sep}/${itens.length} item(ns)</div></div><div onclick="event.stopPropagation()">${acoes(p,modo)}</div></div><div class="det">${detalheSeparacao}<h4>Itens</h4><div class="itens">${itens.map(i=>itemHtml(p,i)).join('')}</div></div></div>`;
}
function nomeObraRet(id){
  const o = obras.find(x => String(x.id) === String(id));
  return o ? `${o.codigo_obra || '-'} - ${o.nome || '-'}` : '-';
}

function mobileSeparacao(p){
  if(!bdrPodeSepararRet(p)) return `<div class="mobile-sep"><b>Apenas acompanhamento.</b></div>`;
  const itens=(p.itens_retirada||[]).filter(i=>i.status!=="NEGADO");
  const ok=itens.filter(i=>itemValidado(p.id,i)).length;
  const pct=itens.length?Math.round(ok*100/itens.length):0;
  const atual=proximoItem(p);
  if(!atual)return `<div class="mobile-sep"><div class="progress-text">${ok} de ${itens.length} validados</div><div class="progress"><span style="width:${pct}%"></span></div><div class="item-atual ok"><h2>✅ Todos os itens foram bipados</h2><p>Confira e finalize para liberar na Transferência.</p><button class="bigbtn green" onclick="finalizarSeparacao(${p.id})">✅ Finalizar separação</button></div></div>`;
  return `<div class="mobile-sep"><div class="progress-text">${ok} de ${itens.length} validados</div><div class="progress"><span style="width:${pct}%"></span></div><div class="item-atual"><div class="sub">Item atual</div><h2>${atual.patrimonio_nome||'-'}</h2><div class="pat">${atual.patrimonio_codigo||'-'}</div><div class="sub">Prateleira / Endereço</div><div class="end">${atual.endereco_codigo||'SEM ENDEREÇO'}</div><button class="bigbtn" onclick="iniciarBip(${p.id},${atual.id})">📷 Iniciar leitura</button><div class="sub" style="margin-top:8px">Primeiro endereço, depois patrimônio. Errado = 2 bips. Certo = 1 bip.</div></div></div>`;
}

async function autorizar(id){
  const p=pedidos.find(x=>String(x.id)===String(id));
  if(!p || !bdrPodeAtuarOrigemRet(p)){beep('erro');alert('Você não tem permissão para autorizar este pedido.');return;}
  if(!confirm('Autorizar pedido?'))return;
  await db().from('pedidos_retirada').update({status:'EM_SEPARACAO'}).eq('id',id);
  await hist(id,p?.status,'EM_SEPARACAO','Pedido autorizado pela origem.');
  beep('ok');await carregarDados();
}
async function negar(id){
  const p=pedidos.find(x=>String(x.id)===String(id));
  if(!p || !bdrPodeAtuarOrigemRet(p)){beep('erro');alert('Você não tem permissão para negar este pedido.');return;}
  const m=prompt('Motivo da negativa:');if(!m)return;
  await db().from('pedidos_retirada').update({status:'NEGADO',motivo_recusa:m}).eq('id',id);
  await db().from('itens_retirada').update({status:'NEGADO'}).eq('pedido_id',id);
  await hist(id,p?.status,'NEGADO','Pedido negado: '+m);beep('erro');await carregarDados();
}
async function iniciarBip(pedidoId,itemId){
  const {p,item}=itemPorId(pedidoId,itemId);
  if(!p || !bdrPodeSepararRet(p)){beep('erro');alert('Você não tem permissão para separar este pedido.');return;}
  if(!item)return;abrirScanner({tipo:'ENDERECO',pedidoId,itemId,esperado:item.endereco_codigo||'',proximo:item.patrimonio_codigo||''});
}
async function confirmarItem(pedidoId,itemId){
  const {p}=itemPorId(pedidoId,itemId);
  if(!p || !bdrPodeSepararRet(p)){beep('erro');alert('Você não tem permissão para confirmar este item.');return;}
  const u=usuarioAtual();marcarValidado(pedidoId,itemId);
  await db().from('itens_retirada').update({status:'SEPARADO',usuario_separacao:u?.nome||'Usuário',data_separacao:new Date().toISOString()}).eq('id',itemId);
  await hist(pedidoId,'PENDENTE','SEPARADO','Item separado com bip de endereço e patrimônio.',itemId);
  beep('ok');await carregarDados();
  const novo=pedidos.find(x=>String(x.id)===String(pedidoId));
  if(novo&&!todosValidados(novo)){setTimeout(()=>{const prox=proximoItem(novo);if(prox)iniciarBip(pedidoId,prox.id)},700)}
}
async function finalizarSeparacao(id){
  const p=pedidos.find(x=>String(x.id)===String(id));
  if(!p || !bdrPodeSepararRet(p)){beep('erro');alert('Você não tem permissão para finalizar a separação.');return;}
  if(!todosValidados(p)){beep('erro');alert('Ainda falta bipar item.');return}
  if(!confirm('Finalizar separação e liberar para Transferência?'))return;
  await db().from('pedidos_retirada').update({status:'AGUARDANDO_RETIRADA'}).eq('id',id);
  await hist(id,'EM_SEPARACAO','AGUARDANDO_RETIRADA','Separação finalizada. Pedido aguardando retirada/transferência.');
  beep('ok');await carregarDados();
}
function aplicarAbaUrlRetirada(){
  try{
    const aba = new URLSearchParams(location.search).get('aba') || 'autorizar';
    const btn = [...document.querySelectorAll('.tab-btn')].find(b => String(b.getAttribute('onclick')||'').includes(`'${aba}'`));
    if(btn && !btn.classList.contains('active')) abrirAba(aba, btn);
    const foco = bdrPedidoFocoRet();
    if(foco){
      setTimeout(()=>{
        const el = document.querySelector(`[id$="-${foco}"]`);
        if(el){ el.scrollIntoView({behavior:'smooth',block:'center'}); el.classList.add('aberto'); }
        localStorage.removeItem('bdr_pedido_foco');
      },300);
    }
  }catch(e){}
}


carregarDados();