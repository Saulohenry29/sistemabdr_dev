/* =========================================================
   BDR ERP - AUDITORIA DE PATRIMÔNIO
   Leitura QR + comparação automática com obra/setor.
========================================================= */
let scanner = null;
let scannerAtivo = false;
let travarLeitura = false;
let patrimonioBase = [];
let obras = [];
let auditados = [];
let esperados = [];
let filtroLista = "TODOS";
let audioCtx = null;
let ultimoCodigoLido = "";
let ultimoCodigoLidoEm = 0;

function ir(pagina){ window.location.href = pagina; }
function db(){ return window.client || window.supabaseClient || window.clientSupabase || globalThis.client; }
function valor(id){ return String(document.getElementById(id)?.value || "").trim(); }
function usuarioAtual(){
  try{
    const u = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
    return u ? JSON.parse(u) : null;
  }catch(e){ return null; }
}
function normalizar(v){ return String(v || "").trim().toUpperCase(); }
function dataISO(){ return new Date().toISOString(); }
function dataBR(d){ if(!d) return "-"; const x = new Date(String(d).replace(" ","T")); return isNaN(x.getTime()) ? String(d) : x.toLocaleString("pt-BR"); }
function esc(v){ return String(v ?? "").replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function carregarUsuarioTopo(){
  const u = usuarioAtual();
  const nome = document.getElementById("usuarioNome");
  const perfil = document.getElementById("usuarioPerfil");
  if(nome) nome.innerText = u ? "Olá, " + (u.nome || "usuário") : "Olá, usuário";
  if(perfil) perfil.innerText = u ? (u.perfil || "-") : "-";
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
window.toggleMenuUsuario = toggleMenuUsuario;
window.toggleNotificacoes = toggleNotificacoes;
document.addEventListener("click",()=>{
  document.getElementById("dropdownUser")?.classList.remove("ativo");
  document.getElementById("notifDropdown")?.classList.remove("ativo");
});
document.addEventListener("keydown", async e=>{
  if(e.key === "Escape"){
    await pararScanner();
    fecharModalNovaAuditoria();
    document.getElementById("dropdownUser")?.classList.remove("ativo");
    document.getElementById("notifDropdown")?.classList.remove("ativo");
  }
});

function prepararSom(){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!audioCtx) audioCtx = new Ctx();
    if(audioCtx.state === "suspended") audioCtx.resume();
  }catch(e){}
}
document.addEventListener("pointerdown", prepararSom, { once:false });
function beep(tipo="ok"){
  try{
    prepararSom();
    if(!audioCtx) return;
    const seq = tipo === "erro" ? [180,120] : tipo === "warn" ? [520,390] : [760];
    seq.forEach((freq,i)=>{
      const t = audioCtx.currentTime + i * .15;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = tipo === "erro" ? "square" : "sine";
      o.frequency.setValueAtTime(freq,t);
      g.gain.setValueAtTime(.0001,t);
      g.gain.linearRampToValueAtTime(tipo === "erro" ? .20 : .18,t+.02);
      g.gain.linearRampToValueAtTime(.0001,t+.13);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t+.15);
    });
    if(navigator.vibrate) navigator.vibrate(tipo === "erro" ? [120,60,120] : [60]);
  }catch(e){}
}
function toast(titulo,texto){
  const el = document.getElementById("toast");
  if(!el) return;
  el.querySelector("strong").innerText = titulo;
  el.querySelector("span").innerText = texto;
  el.style.display = "block";
  setTimeout(()=>el.style.display = "none", 3600);
}

function temPermissaoAuditoria(){
  const u = usuarioAtual();
  const perfil = normalizar(u?.perfil);
  const perms = normalizar(u?.permissoes);
  return perfil === "MASTER" || perfil === "ADMIN" || perms.includes("AUDITORIA_PATRIMONIO") || perms.includes("ALTERAR_STATUS") || perms.includes("CADASTRAR_PATRIMONIO");
}

async function carregarDados(){
  if(!db()){ alert("Supabase não carregado."); return; }
  if(!temPermissaoAuditoria()){
    alert("Acesso restrito para auditoria de patrimônio.");
    location.href = "dashboard.html";
    return;
  }
  carregarUsuarioTopo();

  const [patResp, obrasResp] = await Promise.all([
    db().from("patrimonio").select("*").order("codigo_qr"),
    db().from("obras").select("*").eq("ativa",true).order("nome")
  ]);
  if(patResp.error){ alert("Erro ao carregar patrimônios: " + patResp.error.message); return; }
  if(obrasResp.error){ console.warn(obrasResp.error.message); }

  patrimonioBase = patResp.data || [];
  obras = obrasResp.data || [];

  const sel = document.getElementById("filtroObra");
  const selModal = document.getElementById("modalObraAuditoria");
  const options = `<option value="">Selecione a obra/setor</option>` + obras.map(o=>`<option value="${o.id}">${esc(o.codigo_obra || "-")} - ${esc(o.nome || "-")}</option>`).join("");
  if(sel) sel.innerHTML = options;
  if(selModal) selModal.innerHTML = options;

  carregarLocal();
  recalcularEsperados();
  renderizar();
}

function trocarObraAuditoria(){
  carregarLocal();
  recalcularEsperados();
  atualizarResumoAuditoriaAtual();
  renderizar();
}
window.trocarObraAuditoria = trocarObraAuditoria;

function abrirModalNovaAuditoria(){
  document.getElementById("modalNovaAuditoria")?.classList.add("ativo");
  const obraAtual = valor("filtroObra");
  const modalObra = document.getElementById("modalObraAuditoria");
  if(modalObra && obraAtual) modalObra.value = obraAtual;
  setTimeout(()=>document.getElementById("modalNomeAuditoria")?.focus(),100);
}
window.abrirModalNovaAuditoria = abrirModalNovaAuditoria;

function fecharModalNovaAuditoria(){
  document.getElementById("modalNovaAuditoria")?.classList.remove("ativo");
}
window.fecharModalNovaAuditoria = fecharModalNovaAuditoria;

async function confirmarNovaAuditoria(iniciarCamera=false){
  const obra = valor("modalObraAuditoria");
  if(!obra){ alert("Selecione a obra/setor da auditoria."); return; }
  document.getElementById("filtroObra").value = obra;
  document.getElementById("nomeAuditoria").value = valor("modalNomeAuditoria") || `Auditoria ${obraNome(obra)}`;
  document.getElementById("observacaoAuditoria").value = valor("modalObsAuditoria");
  fecharModalNovaAuditoria();
  trocarObraAuditoria();
  if(iniciarCamera) await iniciarScanner();
}
window.confirmarNovaAuditoria = confirmarNovaAuditoria;

function atualizarResumoAuditoriaAtual(){
  const obraId = valor("filtroObra");
  const box = document.getElementById("auditoriaAtualBox");
  if(!box) return;
  if(!obraId){
    box.innerHTML = `Nenhuma auditoria iniciada. Clique em <b>Nova auditoria</b>.`;
    return;
  }
  box.innerHTML = `<b>${esc(valor("nomeAuditoria") || "Auditoria")}</b><br><span>${esc(obraNome(obraId))}</span><br><small>${esc(valor("observacaoAuditoria") || "Sem observação")}</small>`;
}

function recalcularEsperados(){
  const obraId = valor("filtroObra");
  if(!obraId){ esperados = []; return; }
  esperados = patrimonioBase.filter(p => String(p.obra_id || "") === String(obraId) && !["BAIXADO"].includes(normalizar(p.status)));
}

function extrairCodigo(texto){
  if(!texto) return "";
  let t = String(texto).trim();
  try{
    const url = new URL(t);
    t = url.searchParams.get("id") || url.searchParams.get("codigo") || t;
  }catch(e){
    if(t.includes("id=")){
      const m = t.match(/[?&]id=([^&]+)/i);
      if(m) t = decodeURIComponent(m[1]);
    }
  }
  return String(t).replace("http://","").replace("https://","").trim();
}

async function iniciarScanner(){
  if(scannerAtivo) return;
  document.getElementById("scannerCard")?.classList.add("ativo");
  document.getElementById("readerStatus").innerHTML = `Aponte para o QR Code do patrimônio.`;
  try{
    scanner = new Html5Qrcode("reader");
    await scanner.start(
      { facingMode:"environment" },
      { fps:10, qrbox:{ width:250, height:250 } },
      onScanSucesso,
      ()=>{}
    );
    scannerAtivo = true;
  }catch(err){
    console.error(err);
    alert("Não foi possível abrir a câmera: " + (err.message || err));
  }
}
window.iniciarScanner = iniciarScanner;

async function pararScanner(){
  try{
    if(scanner){ await scanner.stop().catch(()=>{}); await scanner.clear().catch(()=>{}); scanner = null; }
  }catch(e){}
  scannerAtivo = false;
  travarLeitura = false;
  document.getElementById("scannerCard")?.classList.remove("ativo");
}
window.pararScanner = pararScanner;

function onScanSucesso(texto){
  const codigo = extrairCodigo(texto);
  const agora = Date.now();

  // Anti-duplicidade do leitor: alguns celulares leem o mesmo QR várias vezes em sequência.
  // Se for o mesmo código em menos de 2,5 segundos, o sistema ignora a repetição.
  if(normalizar(codigo) === normalizar(ultimoCodigoLido) && (agora - ultimoCodigoLidoEm) < 2500){
    return;
  }

  if(travarLeitura) return;
  travarLeitura = true;
  ultimoCodigoLido = codigo;
  ultimoCodigoLidoEm = agora;
  adicionarCodigo(codigo);
  setTimeout(()=>{ travarLeitura = false; }, 900);
}

function adicionarManual(){
  const codigo = prompt("Digite ou cole o código do patrimônio:");
  if(codigo) adicionarCodigo(extrairCodigo(codigo));
}
window.adicionarManual = adicionarManual;

function acharPatrimonio(codigo){
  const c = normalizar(codigo);
  return patrimonioBase.find(p => normalizar(p.codigo_qr) === c || normalizar(p.codigo) === c || normalizar(p.codigo_antigo) === c) || null;
}
function obraNome(id){
  const o = obras.find(x => String(x.id) === String(id));
  return o ? `${o.codigo_obra || "-"} - ${o.nome || "-"}` : "-";
}
function adicionarCodigo(codigo){
  codigo = String(codigo || "").trim();
  if(!codigo) return;

  const obraAuditadaId = valor("filtroObra");
  if(!obraAuditadaId){ alert("Selecione a obra/setor antes de bipar."); return; }

  const ja = auditados.find(a => normalizar(a.codigo) === normalizar(codigo));
  const pat = acharPatrimonio(codigo);

  let situacao = "OK";
  if(!pat) situacao = "NAO_ENCONTRADO";
  else if(String(pat.obra_id || "") !== String(obraAuditadaId)) situacao = "FORA_DO_SETOR";
  if(ja) situacao = "DUPLICADO";

  // Duplicado verdadeiro: só entra como DUPLICADO quando o usuário bipar de novo depois da trava anti-repetição.
  const item = {
    codigo,
    situacao,
    encontrado:!!pat,
    duplicado:!!ja,
    patrimonio_id: pat?.id || null,
    nome: pat?.nome_bem || "-",
    status: pat?.status || "-",
    obra_id: pat?.obra_id || null,
    obra_esperada_id: obraAuditadaId,
    obra_atual: pat?.obra_id ? obraNome(pat.obra_id) : "-",
    obra_auditada: obraNome(obraAuditadaId),
    localizacao: pat?.localizacao || "-",
    data: new Date().toLocaleString("pt-BR"),
    criado_em: dataISO()
  };

  auditados.unshift(item);
  salvarLocal();
  renderizar();

  if(situacao === "OK"){ beep("ok"); toast("Patrimônio correto", codigo); }
  else { beep("warn"); toast("Atenção na auditoria", `${codigo} - ${rotuloSituacao(situacao)}`); }
}

function getFaltantes(){
  const lidosOkOuFora = new Set(auditados.filter(a => a.patrimonio_id).map(a => String(a.patrimonio_id)));
  return esperados.filter(p => !lidosOkOuFora.has(String(p.id)));
}
function getSobras(){
  const obraId = valor("filtroObra");
  return auditados.filter(a => a.situacao === "FORA_DO_SETOR" || a.situacao === "NAO_ENCONTRADO" || (a.obra_id && String(a.obra_id) !== String(obraId)));
}

function renderizar(){
  renderizarLista();
  atualizarKPIs();
  gerarAnalise();
}
function setFiltroLista(filtro, btn){
  filtroLista = filtro;
  document.querySelectorAll(".audit-tab").forEach(b=>b.classList.remove("ativa"));
  if(btn) btn.classList.add("ativa");
  renderizarLista();
}
window.setFiltroLista = setFiltroLista;

function rotuloSituacao(s){
  const m = {OK:"CORRETO", FORA_DO_SETOR:"FORA DO SETOR", NAO_ENCONTRADO:"NÃO ENCONTRADO", DUPLICADO:"DUPLICADO", FALTA:"FALTOU", SOBRA:"SOBROU"};
  return m[s] || s || "-";
}
function badge(s){
  if(s === "OK") return `<span class="badge-audit badge-ok">CORRETO</span>`;
  if(s === "FORA_DO_SETOR") return `<span class="badge-audit badge-fora">FORA</span>`;
  if(s === "NAO_ENCONTRADO") return `<span class="badge-audit badge-nao">NÃO ENCONTRADO</span>`;
  if(s === "DUPLICADO") return `<span class="badge-audit badge-dup">DUPLICADO</span>`;
  if(s === "FALTA") return `<span class="badge-audit badge-falta">FALTOU</span>`;
  return `<span class="badge-audit badge-info">${esc(s)}</span>`;
}
function linhaAuditado(a){
  const classe = a.situacao === "OK" ? "ok" : a.situacao === "FORA_DO_SETOR" ? "fora" : a.situacao === "DUPLICADO" ? "dup" : "nao";
  return `<div class="audit-line ${classe}">
    <strong>${esc(a.codigo)}</strong>
    <span title="${esc(a.nome)}">${esc(a.nome)}</span>
    <span title="${esc(a.obra_atual)}">${esc(a.obra_atual)}</span>
    <span>${esc(a.status)}</span>
    ${badge(a.situacao)}
  </div>`;
}
function linhaFaltante(p){
  return `<div class="audit-line falta">
    <strong>${esc(p.codigo_qr || p.codigo || "-")}</strong>
    <span title="${esc(p.nome_bem)}">${esc(p.nome_bem || "-")}</span>
    <span title="${esc(p.localizacao)}">${esc(p.localizacao || obraNome(p.obra_id))}</span>
    <span>${esc(p.status || "-")}</span>
    ${badge("FALTA")}
  </div>`;
}

function renderizarLista(){
  const box = document.getElementById("listaAuditoria");
  if(!box) return;
  const faltantes = getFaltantes();
  let lista = [];

  if(filtroLista === "TODOS"){
    lista = [...auditados.map(a=>({tipo:"AUD", item:a})), ...faltantes.map(p=>({tipo:"FALTA", item:p}))];
  }else if(filtroLista === "FALTA"){
    lista = faltantes.map(p=>({tipo:"FALTA", item:p}));
  }else if(filtroLista === "SOBRA"){
    lista = getSobras().map(a=>({tipo:"AUD", item:a}));
  }else{
    lista = auditados.filter(a => a.situacao === filtroLista).map(a=>({tipo:"AUD", item:a}));
  }

  if(!valor("filtroObra")){
    box.innerHTML = `<div class="empty-state">Selecione uma obra/setor para começar.</div>`;
    return;
  }
  if(!lista.length){
    box.innerHTML = `<div class="empty-state">Nenhum item neste filtro.</div>`;
    return;
  }
  box.innerHTML = lista.map(x => x.tipo === "FALTA" ? linhaFaltante(x.item) : linhaAuditado(x.item)).join("");
}

function atualizarKPIs(){
  const faltantes = getFaltantes();
  document.getElementById("kpiEsperados").innerText = esperados.length;
  document.getElementById("kpiOk").innerText = auditados.filter(a=>a.situacao === "OK").length;
  document.getElementById("kpiFora").innerText = auditados.filter(a=>a.situacao === "FORA_DO_SETOR").length;
  document.getElementById("kpiFaltou").innerText = faltantes.length;
  document.getElementById("kpiSobrou").innerText = getSobras().length;
  document.getElementById("kpiDup").innerText = auditados.filter(a=>a.situacao === "DUPLICADO").length;
}
function gerarAnalise(){
  const box = document.getElementById("analiseAuditoria");
  if(!box) return;
  if(!valor("filtroObra")){
    box.innerHTML = `Selecione uma obra/setor e comece a bipar.`;
    return;
  }
  const ok = auditados.filter(a=>a.situacao === "OK").length;
  const fora = auditados.filter(a=>a.situacao === "FORA_DO_SETOR").length;
  const nao = auditados.filter(a=>a.situacao === "NAO_ENCONTRADO").length;
  const dup = auditados.filter(a=>a.situacao === "DUPLICADO").length;
  const faltou = getFaltantes().length;
  const sobrou = getSobras().length;
  const classeFinal = (fora || nao || dup || faltou || sobrou) ? "warn" : "ok";

  box.innerHTML = `
    <div class="ia-box ${classeFinal}"><b>Obra auditada:</b> ${esc(obraNome(valor("filtroObra")))}</div>
    <div class="ia-box ok"><b>Corretos:</b> ${ok} patrimônio(s) estão no setor certo.</div>
    <div class="ia-box warn"><b>Fora do setor:</b> ${fora} patrimônio(s).</div>
    <div class="ia-box err"><b>Faltou:</b> ${faltou} patrimônio(s) esperados não foram bipados.</div>
    <div class="ia-box warn"><b>Sobrou:</b> ${sobrou} item(ns) bipados que não pertencem a este setor.</div>
    <div class="ia-box"><b>Duplicados:</b> ${dup} leitura(s). <b>Não encontrados:</b> ${nao}.</div>
  `;
}

function salvarLocal(){
  const chave = `auditoria_patrimonio_${valor("filtroObra") || "geral"}`;
  localStorage.setItem(chave, JSON.stringify(auditados));
}
function carregarLocal(){
  const chave = `auditoria_patrimonio_${valor("filtroObra") || "geral"}`;
  try{ auditados = JSON.parse(localStorage.getItem(chave) || "[]"); }catch(e){ auditados = []; }
}

async function gerarNotificacaoGestao(titulo, mensagem){
  try{
    const { data: users } = await db().from("usuarios_sistema").select("usuario,nome,permissoes,ativo").eq("ativo",true);
    const destinos = (users || []).filter(u => normalizar(u.permissoes).includes("RECEBER_NOTIFICACOES_GESTAO"));
    if(!destinos.length) return;
    await db().from("bdr_notificacoes").insert(destinos.map(u=>({
      titulo,
      mensagem,
      modulo:"AUDITORIA",
      usuario_destino:u.usuario,
      link:"auditoria.html",
      lida:false,
      criado_em:dataISO()
    })));
  }catch(e){ console.warn("Notificação gestão não gravada:", e.message || e); }
}

async function finalizarAuditoria(){
  const obraId = valor("filtroObra");
  if(!obraId){ alert("Selecione uma obra/setor."); return; }
  if(!auditados.length && !esperados.length){ alert("Nada para salvar."); return; }

  const u = usuarioAtual();
  const faltantes = getFaltantes();
  const sobras = getSobras();
  const nome = valor("nomeAuditoria") || `Auditoria ${obraNome(obraId)}`;

  const resumo = {
    esperados: esperados.length,
    lidos: auditados.length,
    corretos: auditados.filter(a=>a.situacao === "OK").length,
    fora_setor: auditados.filter(a=>a.situacao === "FORA_DO_SETOR").length,
    nao_encontrados: auditados.filter(a=>a.situacao === "NAO_ENCONTRADO").length,
    duplicados: auditados.filter(a=>a.situacao === "DUPLICADO").length,
    faltantes: faltantes.length,
    sobras: sobras.length
  };

  const { data: aud, error } = await db().from("auditorias_patrimonio").insert([{
    nome,
    obra_id:Number(obraId),
    obra_nome:obraNome(obraId),
    observacao:valor("observacaoAuditoria") || null,
    usuario:u?.nome || "Usuário",
    status:"FINALIZADA",
    resumo,
    criado_em:dataISO(),
    finalizado_em:dataISO()
  }]).select().single();
  if(error){ alert("Erro ao salvar auditoria: " + error.message); return; }

  const itensAuditados = auditados.map(a=>({
    auditoria_id:aud.id,
    patrimonio_id:a.patrimonio_id,
    codigo:a.codigo,
    nome:a.nome,
    situacao:a.situacao,
    obra_esperada_id:Number(obraId),
    obra_atual_id:a.obra_id || null,
    status_patrimonio:a.status,
    localizacao:a.localizacao,
    criado_em:dataISO()
  }));
  const itensFaltantes = faltantes.map(p=>({
    auditoria_id:aud.id,
    patrimonio_id:p.id,
    codigo:p.codigo_qr || p.codigo || "-",
    nome:p.nome_bem || "-",
    situacao:"FALTA",
    obra_esperada_id:Number(obraId),
    obra_atual_id:p.obra_id || null,
    status_patrimonio:p.status || null,
    localizacao:p.localizacao || null,
    criado_em:dataISO()
  }));

  const { error: errItens } = await db().from("auditoria_patrimonio_itens").insert([...itensAuditados, ...itensFaltantes]);
  if(errItens){ alert("Auditoria salva, mas houve erro nos itens: " + errItens.message); return; }

  if(resumo.fora_setor || resumo.faltantes || resumo.sobras || resumo.nao_encontrados){
    await gerarNotificacaoGestao(
      "⚠ Auditoria com divergência",
      `${nome}: ${resumo.faltantes} falta(s), ${resumo.sobras} sobra(s), ${resumo.fora_setor} fora do setor.`
    );
  }else{
    await gerarNotificacaoGestao("✅ Auditoria finalizada sem divergência", `${nome}: ${resumo.corretos} patrimônio(s) conferidos.`);
  }

  alert("Auditoria salva com sucesso!");
  baixarCSV(false);
}
window.finalizarAuditoria = finalizarAuditoria;

function baixarCSV(mostrarAlerta=true){
  const faltantes = getFaltantes();
  const linhas = [["codigo","nome","status","obra_atual","obra_auditada","localizacao","situacao","data"]];
  auditados.forEach(a=>linhas.push([a.codigo,a.nome,a.status,a.obra_atual,a.obra_auditada,a.localizacao,a.situacao,a.data]));
  faltantes.forEach(p=>linhas.push([p.codigo_qr || p.codigo || "-",p.nome_bem || "-",p.status || "-",obraNome(p.obra_id),obraNome(valor("filtroObra")),p.localizacao || "-","FALTA",new Date().toLocaleString("pt-BR")]));
  if(linhas.length === 1){ if(mostrarAlerta) alert("Nenhum item para exportar."); return; }
  const csv = linhas.map(l=>l.map(c=>`"${String(c ?? "").replaceAll('"','""')}"`).join(";")).join("\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `auditoria_patrimonio_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
window.baixarCSV = baixarCSV;

async function limparAuditoria(){
  if(!confirm("Limpar a auditoria atual?")) return;
  await pararScanner();
  auditados = [];
  localStorage.removeItem(`auditoria_patrimonio_${valor("filtroObra") || "geral"}`);
  renderizar();
}
window.limparAuditoria = limparAuditoria;

window.addEventListener("DOMContentLoaded", async()=>{
  await carregarDados();
  atualizarResumoAuditoriaAtual();
});
