let enderecos = [];
window.onload = async () => {
  const usuario = usuarioAtual();
  document.getElementById("dataAtual").innerText = new Date().toLocaleDateString("pt-BR");
  document.getElementById("usuarioInfo").innerText = usuario ? "👤 " + usuario.nome : "";
  atualizarPreview();
  await carregarEnderecos();
};
function ir(pagina){ window.location.href = pagina; }
function db(){ return window.client || window.supabaseClient || client; }
function usuarioAtual(){ const u = localStorage.getItem("usuario_logado"); return u ? JSON.parse(u) : null; }
function campo(id){ const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
function num(id){ return Number(campo(id) || 0); }
function pad2(n){ return String(n).padStart(2, "0"); }
function montarCodigo(r,f,p,c,n,cx){ let codigo = `R${r}-F${f}-P${pad2(p)}-C${c}-N${n}`; if(cx && Number(cx)>0) codigo += `-CX${pad2(cx)}`; return codigo; }
function atualizarPreview(){ const el=document.getElementById("codigoPreview"); if(el) el.innerText = montarCodigo(num("rua_num")||1,num("face_num")||1,num("prateleira_num")||1,num("coluna_num")||1,num("nivel_num")||1,num("caixa_num")||0); }
async function carregarEnderecos(){
  const { data, error } = await db().from("enderecamento_estoque").select("*").order("codigo_curto");
  if(error){ alert(error.message); return; }
  enderecos = data || [];
  atualizarResumo(); renderizarEnderecos();
}
function atualizarResumo(){
  document.getElementById("totalEnderecos").innerText = enderecos.length;
  document.getElementById("totalLivres").innerText = enderecos.filter(e=>e.status==="LIVRE").length;
  document.getElementById("totalOcupados").innerText = enderecos.filter(e=>e.status==="OCUPADO").length;
  document.getElementById("totalReservados").innerText = enderecos.filter(e=>e.status==="RESERVADO").length;
}
async function salvarEndereco(){
  const id = campo("endereco_id");
  const r=num("rua_num")||1, f=num("face_num")||1, p=num("prateleira_num")||1, c=num("coluna_num")||1, n=num("nivel_num")||1, cx=num("caixa_num")||0;
  const codigo = montarCodigo(r,f,p,c,n,cx);
  const payload = {rua:"R"+r,face:"F"+f,prateleira:"P"+pad2(p),coluna:"C"+c,nivel:"N"+n,caixa:cx>0?"CX"+pad2(cx):null,codigo_curto:codigo,tipo_area:campo("tipo_area")||"GERAL",status:campo("status")||"LIVRE",observacao:campo("observacao")||null};
  const q = id ? db().from("enderecamento_estoque").update(payload).eq("id", id) : db().from("enderecamento_estoque").insert([payload]);
  const { error } = await q;
  if(error){ alert(error.message); return; }
  alert(id ? "Endereço atualizado!" : "Endereço criado!");
  limparFormulario(); await carregarEnderecos();
}
function editarEndereco(id){
  const e = enderecos.find(x=>String(x.id)===String(id)); if(!e) return;
  document.getElementById("endereco_id").value=e.id;
  document.getElementById("rua_num").value=Number(String(e.rua||"R1").replace("R",""))||1;
  document.getElementById("face_num").value=Number(String(e.face||"F1").replace("F",""))||1;
  document.getElementById("prateleira_num").value=Number(String(e.prateleira||"P01").replace("P",""))||1;
  document.getElementById("coluna_num").value=Number(String(e.coluna||"C1").replace("C",""))||1;
  document.getElementById("nivel_num").value=Number(String(e.nivel||"N1").replace("N",""))||1;
  document.getElementById("caixa_num").value=Number(String(e.caixa||"CX0").replace("CX",""))||0;
  document.getElementById("tipo_area").value=e.tipo_area||"GERAL";
  document.getElementById("status").value=e.status||"LIVRE";
  document.getElementById("observacao").value=e.observacao||"";
  document.getElementById("tituloForm").innerText="✏️ Editar endereço";
  atualizarPreview(); window.scrollTo({top:0,behavior:"smooth"});
}
async function alterarStatusEndereco(id,status){
  const { error } = await db().from("enderecamento_estoque").update({status}).eq("id", id);
  if(error){ alert(error.message); return; }
  await carregarEnderecos();
}
function limparFormulario(){
  document.getElementById("endereco_id").value=""; document.getElementById("rua_num").value=1; document.getElementById("face_num").value=1; document.getElementById("prateleira_num").value=1; document.getElementById("coluna_num").value=1; document.getElementById("nivel_num").value=1; document.getElementById("caixa_num").value=0; document.getElementById("tipo_area").value="GERAL"; document.getElementById("status").value="LIVRE"; document.getElementById("observacao").value=""; document.getElementById("tituloForm").innerText="➕ Cadastrar endereço"; atualizarPreview();
}
function renderizarEnderecos(){
  const lista=document.getElementById("listaEnderecos"); lista.innerHTML="";
  const busca=campo("busca").toLowerCase(), filtroStatus=campo("filtroStatus"), filtroTipo=campo("filtroTipo");
  const filtrados=enderecos.filter(e=>`${e.codigo_curto||""} ${e.rua||""} ${e.face||""} ${e.prateleira||""} ${e.coluna||""} ${e.nivel||""} ${e.caixa||""} ${e.tipo_area||""} ${e.status||""} ${e.observacao||""}`.toLowerCase().includes(busca) && (!filtroStatus||e.status===filtroStatus) && (!filtroTipo||e.tipo_area===filtroTipo));
  if(filtrados.length===0){ lista.innerHTML="<p>Nenhum endereço encontrado.</p>"; return; }
  filtrados.forEach(e=>{ lista.innerHTML += `<div class="item"><strong>${e.codigo_curto||"-"}</strong><br><br><span class="badge ${e.status||"LIVRE"}">${e.status||"LIVRE"}</span> <span class="tag">${e.tipo_area||"GERAL"}</span><br><br><b>Rua:</b> ${e.rua||"-"}<br><b>Face:</b> ${e.face||"-"}<br><b>Prateleira:</b> ${e.prateleira||"-"}<br><b>Coluna:</b> ${e.coluna||"-"}<br><b>Nível:</b> ${e.nivel||"-"}<br><b>Caixa:</b> ${e.caixa||"-"}<br><b>QR:</b> END-${e.codigo_curto||"-"}<br><b>Obs:</b> ${e.observacao||"-"}<br><br><button class="btn btn-blue" onclick="editarEndereco(${e.id})">✏️ Editar</button> <button class="btn btn-ok" onclick="alterarStatusEndereco(${e.id}, 'LIVRE')">Livre</button> <button class="btn btn-red" onclick="alterarStatusEndereco(${e.id}, 'OCUPADO')">Ocupado</button> <button class="btn btn-gray" onclick="alterarStatusEndereco(${e.id}, 'RESERVADO')">Reservado</button></div>`; });
}
async function gerarEnderecosRapido(){
  const qtdRuas=num("lote_ruas")||1, qtdFaces=num("lote_faces")||1, qtdPrat=num("lote_prateleiras")||1, qtdCol=num("lote_colunas")||1, qtdNivel=num("lote_niveis")||1, qtdCaixa=num("lote_caixas")||0, tipoArea=campo("lote_tipo_area")||"GERAL";
  const registros=[];
  for(let r=1;r<=qtdRuas;r++) for(let f=1;f<=qtdFaces;f++) for(let p=1;p<=qtdPrat;p++) for(let c=1;c<=qtdCol;c++) for(let n=1;n<=qtdNivel;n++){
    if(qtdCaixa>0){ for(let cx=1;cx<=qtdCaixa;cx++){ const codigo=montarCodigo(r,f,p,c,n,cx); registros.push({rua:"R"+r,face:"F"+f,prateleira:"P"+pad2(p),coluna:"C"+c,nivel:"N"+n,caixa:"CX"+pad2(cx),codigo_curto:codigo,tipo_area:tipoArea,status:"LIVRE"}); } }
    else{ const codigo=montarCodigo(r,f,p,c,n,0); registros.push({rua:"R"+r,face:"F"+f,prateleira:"P"+pad2(p),coluna:"C"+c,nivel:"N"+n,caixa:null,codigo_curto:codigo,tipo_area:tipoArea,status:"LIVRE"}); }
  }
  const ok=confirm("Serão criadas "+registros.length+" posições. Deseja continuar?"); if(!ok) return;
  const { error } = await db().from("enderecamento_estoque").insert(registros);
  if(error){ alert(error.message); return; }
  alert(registros.length+" posições criadas com sucesso!"); await carregarEnderecos();
}