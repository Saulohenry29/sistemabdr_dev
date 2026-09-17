/* =========================================================
   ATLAS - ESTOQUE
   Recursos consolidados do módulo: bipagem e permissões.
   Funções permanecem globais porque os botões do módulo usam onclick.
========================================================= */

/* =========================================================
   BDR ESTOQUE V7 - MOTOR GUARDAR POR BIPAGEM
   Produto + endereço real + usuário + registro em armazenagens e estoque_movimentacoes.
========================================================= */
const BDR_BIP = {
  produto:null,
  enderecoSugerido:null,
  enderecoReal:null,
  outraPosicao:false,
  cameraStream:null,
  cameraTimer:null
};
function bdrDb(){ return window.client || window.supabaseClient || window.clientSupabase || globalThis.client; }
function bdrUsuarioBipagem(){
  try{return JSON.parse(localStorage.getItem('usuario_logado') || localStorage.getItem('usuarioLogado') || '{}')}catch(e){return {}}
}
function bdrNormalizarCodigoBip(v){
  let codigo = String(v || '')
    .trim()
    .replace(/^https?:\/\/[^?]+\?id=/i,'')
    .replace(/^https?:\/\/[^?]+\?codigo=/i,'')
    .replace(/^https?:\/\/[^#]+#/i,'')
    .replace(/^END-/i,'')
    .replace(/\s+/g,'')
    .toUpperCase();

  const partes = codigo.match(/R(\d+)-F(\d+)-P(\d+)-C(\d+)-N(\d+)/i);

  if(!partes) return codigo;

  return [
    `R${partes[1]}`,
    `F${partes[2]}`,
    `P${String(partes[3]).padStart(2,'0')}`,
    `C${String(partes[4]).padStart(2,'0')}`,
    `N${String(partes[5]).padStart(2,'0')}`
  ].join('-');
}

function bdrFormatarEndereco(valor){
  return bdrNormalizarCodigoBip(valor || '');
}

function bdrEnderecoPartes(valor){
  const codigo = bdrFormatarEndereco(valor);
  const p = codigo.match(/^(R\d+)-(F\d+)-(P\d+)-(C\d+)-(N\d+)$/i);
  return p ? {codigo, rua:p[1], face:p[2], prateleira:p[3], coluna:p[4], nivel:p[5]} : {codigo};
}

function bdrSom(tipo){
  try{
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();

    function bip(freq, inicio, duracao, tipoOsc){
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tipoOsc || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + inicio);
      gain.gain.exponentialRampToValueAtTime(0.24, ctx.currentTime + inicio + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracao);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + duracao + 0.03);
    }

    if(tipo === 'ok'){
      bip(880, 0, 0.18, 'sine');
      setTimeout(()=>ctx.close(), 320);
    }else{
      bip(260, 0, 0.16, 'square');
      bip(180, 0.22, 0.16, 'square');
      setTimeout(()=>ctx.close(), 620);
    }
  }catch(e){console.warn('Som indisponível:', e);}
}

function bdrSomCerto(){ bdrSom('ok'); }
function bdrSomErrado(){ bdrSom('erro'); }

function abrirModalGuardarBipagem(){
  document.getElementById('modalGuardarBipagem')?.classList.add('ativo');
  setTimeout(()=>document.getElementById('bipCodigoProduto')?.focus(),150);
}
function fecharModalGuardarBipagem(){
  pararCameraBipagem();
  document.getElementById('modalGuardarBipagem')?.classList.remove('ativo');
}
function fecharModalGuardarBipagemFora(e){ if(e.target?.id==='modalGuardarBipagem') fecharModalGuardarBipagem(); }
document.addEventListener('keydown',e=>{ if(e.key==='Escape') fecharModalGuardarBipagem(); });
function focarBipProduto(){document.getElementById('bipCodigoProduto')?.focus();}
function focarBipEndereco(){document.getElementById('bipCodigoEndereco')?.focus();}
function limparBipagem(){
  BDR_BIP.produto=null; BDR_BIP.enderecoSugerido=null; BDR_BIP.enderecoReal=null; BDR_BIP.outraPosicao=false;
  ['bipCodigoProduto','bipCodigoEndereco'].forEach(id=>{const el=document.getElementById(id); if(el)el.value='';});
  document.getElementById('bipProdutoInfo').className='bdr-bip-card-item';
  document.getElementById('bipProdutoInfo').innerHTML='';
  document.getElementById('bipEnderecoInfo').className='bdr-bip-endereco';
  document.getElementById('bipEnderecoInfo').innerHTML='';
  const sug=document.getElementById('bipEnderecoSugerido'); if(sug){sug.className='bdr-bip-sugerido';sug.innerHTML='Bipe o produto para receber uma sugestão.';}
  const ps=document.getElementById('bipProdutoStatus'); if(ps){ps.className='bdr-bip-scanbox';ps.innerHTML='<div><i class="fa-solid fa-qrcode"></i>Toque para ler o QR do produto<br><small>Abrir câmera</small></div>';}
  const es=document.getElementById('bipEnderecoStatus'); if(es){es.className='bdr-bip-scanbox';es.innerHTML='<div><i class="fa-solid fa-qrcode"></i>Toque para ler o QR do endereço<br><small>Abrir câmera</small></div>';}
  document.getElementById('btnConfirmarBipagem').disabled=true;
  pararCameraBipagem();
  setTimeout(focarBipProduto,100);
}
async function buscarProdutoBipado(){
  const codigo=bdrNormalizarCodigoBip(document.getElementById('bipCodigoProduto')?.value);
  if(!codigo){focarBipProduto();return;}
  const ps=document.getElementById('bipProdutoStatus');
  ps.className='bdr-bip-scanbox'; ps.innerHTML='<div><i class="fa-solid fa-spinner fa-spin"></i>Buscando produto...</div>';
  let produto=null;
  try{ produto=await bdrBuscarProdutoOuPatrimonio(codigo); }catch(e){console.warn(e);}
  if(!produto){
    ps.className='bdr-bip-scanbox errado'; ps.innerHTML='<div><i class="fa-solid fa-xmark"></i>Produto não encontrado<br><small>Confira o código bipado</small></div>'; bdrSom('erro'); return;
  }
  BDR_BIP.produto=produto;
  ps.className='bdr-bip-scanbox certo'; ps.innerHTML='<div><i class="fa-solid fa-check"></i>Produto encontrado</div>'; bdrSom('ok');
  const info=document.getElementById('bipProdutoInfo'); info.className='bdr-bip-card-item ativo';
  info.innerHTML=`<strong>${produto.nome || '-'}</strong><span>Código: ${produto.codigo || codigo} • Tipo: ${produto.tipo || '-'} • Estoque: ${produto.quantidade ?? 1}</span>`;
  await sugerirEnderecoParaProdutoBip(produto);
  setTimeout(focarBipEndereco,150);
}
async function bdrBuscarProdutoOuPatrimonio(codigo){
  const banco=bdrDb();
  const cod=bdrNormalizarCodigoBip(codigo);
  if(!banco) return {codigo:cod,nome:'Produto bipado',tipo:'CONSUMO',quantidade:1};
  const tabelas=[
    {nome:'estoque_produtos',tipo:'CONSUMO'},
    {nome:'produtos',tipo:'CONSUMO'},
    {nome:'patrimonio',tipo:'PATRIMONIO'}
  ];
  for(const t of tabelas){
    try{
      const {data,error}=await banco.from(t.nome).select('*').limit(5000);
      if(error) continue;
      const achado=(data||[]).find(p=>{
        const campos=[p.codigo,p.codigo_produto,p.codigo_barras,p.codigo_qr,p.id,p.nome,p.nome_bem];
        return campos.some(c=>bdrNormalizarCodigoBip(c)===cod);
      });
      if(achado){
        return {
          id:achado.id,
          tabela:t.nome,
          tipo:t.tipo,
          codigo:achado.codigo || achado.codigo_produto || achado.codigo_barras || achado.codigo_qr || String(achado.id),
          nome:achado.nome || achado.nome_bem || achado.descricao || 'Produto',
          quantidade:achado.quantidade ?? achado.qtd ?? 1,
          local_atual:achado.local || achado.endereco || achado.localizacao || achado.local_destino || ''
        };
      }
    }catch(e){console.warn('Falha buscando em '+t.nome,e);}
  }
  return null;
}
async function sugerirEnderecoParaProdutoBip(produto){
  const banco=bdrDb();
  let endereco=null;
  try{
    if(banco){
      const {data}=await banco.from('enderecamento_estoque').select('*').eq('status','LIVRE').limit(1);
      endereco=(data||[])[0]||null;
    }
  }catch(e){console.warn(e);}
  if(!endereco){ endereco={id:null,codigo_curto:'R1-F1-P01-C03-N01',rua:'R1',face:'F1',prateleira:'P01',coluna:'C03',nivel:'N01'}; }
  const enderecoFmt = bdrEnderecoPartes(endereco.codigo_curto || endereco.codigo || endereco.endereco || '');
  endereco.codigo_curto = enderecoFmt.codigo || bdrFormatarEndereco(endereco.codigo_curto || '');
  endereco.rua = enderecoFmt.rua || endereco.rua || '-';
  endereco.face = enderecoFmt.face || endereco.face || '-';
  endereco.prateleira = enderecoFmt.prateleira || endereco.prateleira || '-';
  endereco.coluna = enderecoFmt.coluna || endereco.coluna || '-';
  endereco.nivel = enderecoFmt.nivel || endereco.nivel || '-';
  BDR_BIP.enderecoSugerido=endereco;
  const sug=document.getElementById('bipEnderecoSugerido');
  sug.className='bdr-bip-sugerido ativo';
  sug.innerHTML=`<div><i class="fa-solid fa-location-dot"></i> <b>${endereco.codigo_curto || '-'}</b> <small style="float:right;background:#dbeafe;color:#1d4ed8;border-radius:999px;padding:3px 7px;">SUGERIDO</small></div><div style="font-size:12px;margin-top:6px;color:#1e40af;">Rua: ${endereco.rua||'-'} • Face: ${endereco.face||'-'} • Prateleira: ${endereco.prateleira||'-'} • Coluna: ${endereco.coluna||'-'} • Nível: ${endereco.nivel||'-'}</div>`;
}
function permitirOutraPosicaoBipagem(){
  BDR_BIP.outraPosicao=true;
  bdrSom('ok');
  alert('Liberado. Agora você pode bipar um endereço diferente do sugerido.');
  focarBipEndereco();
}
async function validarEnderecoBipado(){
  const raw=document.getElementById('bipCodigoEndereco')?.value;
  const codigo=bdrNormalizarCodigoBip(raw);
  if(!codigo){focarBipEndereco();return;}
  const es=document.getElementById('bipEnderecoStatus');
  let endereco=null;
  try{ endereco=await bdrBuscarEnderecoBipado(codigo); }catch(e){console.warn(e);}
  if(!endereco){
    es.className='bdr-bip-scanbox errado'; es.innerHTML='<div><i class="fa-solid fa-xmark"></i>Endereço não encontrado<br><small>Bipe uma etiqueta END- válida</small></div>'; bdrSom('erro'); return;
  }
  const sugerido=bdrNormalizarCodigoBip(BDR_BIP.enderecoSugerido?.codigo_curto);
  const real=bdrNormalizarCodigoBip(endereco.codigo_curto);
  if(sugerido && real!==sugerido && !BDR_BIP.outraPosicao){
    es.className='bdr-bip-scanbox errado'; es.innerHTML='<div><i class="fa-solid fa-triangle-exclamation"></i>Prateleira diferente da sugerida<br><small>Clique em Guardar em outro local para liberar</small></div>'; bdrSom('erro'); return;
  }
  const enderecoFmt = bdrEnderecoPartes(endereco.codigo_curto || codigo);
  endereco.codigo_curto = enderecoFmt.codigo || bdrFormatarEndereco(endereco.codigo_curto || codigo);
  endereco.rua = enderecoFmt.rua || endereco.rua || '-';
  endereco.face = enderecoFmt.face || endereco.face || '-';
  endereco.prateleira = enderecoFmt.prateleira || endereco.prateleira || '-';
  endereco.coluna = enderecoFmt.coluna || endereco.coluna || '-';
  endereco.nivel = enderecoFmt.nivel || endereco.nivel || '-';
  BDR_BIP.enderecoReal=endereco;
  es.className='bdr-bip-scanbox certo'; es.innerHTML='<div><i class="fa-solid fa-check"></i>Endereço confirmado</div>'; bdrSom('ok');
  const info=document.getElementById('bipEnderecoInfo'); info.className='bdr-bip-endereco ativo';
  info.innerHTML=`<strong>${endereco.codigo_curto}</strong><span>Rua: ${endereco.rua||'-'} • Face: ${endereco.face||'-'} • Prateleira: ${endereco.prateleira||'-'} • Coluna: ${endereco.coluna||'-'} • Nível: ${endereco.nivel||'-'}</span>`;
  atualizarBotaoConfirmarBipagem();
}
async function bdrBuscarEnderecoBipado(codigo){
  const banco=bdrDb();
  const cod=bdrNormalizarCodigoBip(codigo);
  if(!banco){return {id:null,codigo_curto:cod,rua:'-',face:'-',prateleira:'-',coluna:'-',nivel:'-'};}
  const tabelas=['enderecamento_estoque','enderecos_estoque'];
  for(const t of tabelas){
    try{
      const {data,error}=await banco.from(t).select('*').limit(5000);
      if(error) continue;
      const achado=(data||[]).find(e=>bdrNormalizarCodigoBip(e.codigo_curto||e.codigo||e.endereco)===cod);
      if(achado){ achado.codigo_curto = bdrFormatarEndereco(achado.codigo_curto || achado.codigo || achado.endereco); return achado; }
    }catch(e){console.warn(e);}
  }
  return null;
}
function atualizarBotaoConfirmarBipagem(){
  document.getElementById('btnConfirmarBipagem').disabled=!(BDR_BIP.produto && BDR_BIP.enderecoReal);
}
async function confirmarGuardarBipagem(){
  if(!BDR_BIP.produto || !BDR_BIP.enderecoReal){alert('Bipe o produto e o endereço antes de confirmar.');return;}
  const banco=bdrDb();
  const u=bdrUsuarioBipagem();
  const usuarioNome=u?.nome || u?.usuario || 'Usuário não identificado';
  const enderecoRealFmt = bdrFormatarEndereco(BDR_BIP.enderecoReal?.codigo_curto);
  const enderecoSugeridoFmt = bdrFormatarEndereco(BDR_BIP.enderecoSugerido?.codigo_curto || '');
  if(BDR_BIP.enderecoReal) BDR_BIP.enderecoReal.codigo_curto = enderecoRealFmt;
  if(BDR_BIP.enderecoSugerido) BDR_BIP.enderecoSugerido.codigo_curto = enderecoSugeridoFmt;

  const payloadArm={
    produto:BDR_BIP.produto.nome,
    quantidade:Number(BDR_BIP.produto.quantidade||1),
    endereco_sugerido_id:BDR_BIP.enderecoSugerido?.id || null,
    endereco_real_id:BDR_BIP.enderecoReal?.id || null,
    usuario:usuarioNome,
    status:'CONFIRMADO',
    confirmado_em:new Date().toISOString()
  };
  const payloadMov={
    produto:BDR_BIP.produto.nome,
    produto_id:BDR_BIP.produto.id || null,
    quantidade:Number(BDR_BIP.produto.quantidade||1),
    tipo:'GUARDA',
    tipo_movimentacao: BDR_BIP.outraPosicao ? 'GUARDADO_EM_OUTRA_POSICAO' : 'GUARDADO_POR_BIPAGEM',
    origem:BDR_BIP.produto.local_atual || 'ESTOQUE',
    destino:enderecoRealFmt,
    local_origem:BDR_BIP.produto.local_atual || null,
    local_destino:enderecoRealFmt,
    usuario:usuarioNome,
    observacao:`Guardado por bipagem. Sugerido: ${enderecoSugeridoFmt || '-'} | Real: ${enderecoRealFmt || '-'}`
  };
  try{
    if(banco){
      await banco.from('armazenagens').insert([payloadArm]);
      await banco.from('estoque_movimentacoes').insert([payloadMov]);
    }
    bdrSom('ok');
    alert(`✅ Produto guardado com sucesso.

Guardado por: ${usuarioNome}
Endereço: ${enderecoRealFmt}`);
    limparBipagem();
    if(typeof renderizarProdutos==='function') renderizarProdutos();
  }catch(e){
    console.error(e); bdrSom('erro'); alert('Erro ao registrar guarda: '+(e.message||e));
  }
}
let leitorQR = null;

/* =========================================================
   BDR QR CODE CAMERA - SOMENTE QR CODE
   - Produto: lê QR do produto/patrimônio
   - Endereço: lê QR da prateleira
   - Fecha a câmera automaticamente após leitura
========================================================= */
async function abrirCameraBipagem(tipo){
  const alvo = tipo === "produto" ? "cameraProdutoBip" : "cameraEnderecoBip";
  const area = document.getElementById(alvo);

  if(!area) return;

  if(typeof Html5Qrcode === "undefined"){
    alert("Leitor QR não carregou. Verifique a internet ou use o leitor USB/Bluetooth.");
    return;
  }

  await pararCameraBipagem();

  area.classList.add("ativo");
  area.innerHTML = `
    <div id="reader-${tipo}" style="width:100%;min-height:260px;background:#111827;border-radius:14px;overflow:hidden;"></div>
    <div style="padding:8px;text-align:center;background:#111827;color:#fff;font-size:12px;font-weight:900;">
      Aponte a câmera para o QR Code
    </div>
  `;

  leitorQR = new Html5Qrcode(`reader-${tipo}`);

  const configQR = {
    fps: 10,
    qrbox: function(viewfinderWidth, viewfinderHeight){
      const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
      const box = Math.floor(minEdge * 0.72);
      return { width: box, height: box };
    }
  };

  if(window.Html5QrcodeSupportedFormats){
    configQR.formatsToSupport = [Html5QrcodeSupportedFormats.QR_CODE];
  }

  try{
    await leitorQR.start(
      { facingMode: "environment" },
      configQR,
      async (decodedText) => {
        const codigoLido = String(decodedText || "").trim();
        if(!codigoLido) return;

        await pararCameraBipagem();

        if(tipo === "produto"){
          const input = document.getElementById("bipCodigoProduto");
          if(input) input.value = codigoLido;
          await buscarProdutoBipado();
        }else{
          const input = document.getElementById("bipCodigoEndereco");
          if(input) input.value = codigoLido;
          await validarEnderecoBipado();
        }
      },
      () => {}
    );
  }catch(err){
    console.error("Erro câmera QR:", err);
    await pararCameraBipagem();
    alert("Não foi possível abrir a câmera. No celular/tablet use HTTPS ou o site publicado. No computador, permita o acesso à câmera.");
  }
}

async function pararCameraBipagem(){
  try{
    if(leitorQR){
      try{ await leitorQR.stop(); }catch(e){}
      try{ await leitorQR.clear(); }catch(e){}
      leitorQR = null;
    }
  }catch(e){}

  if(BDR_BIP.cameraTimer){
    clearInterval(BDR_BIP.cameraTimer);
    BDR_BIP.cameraTimer = null;
  }

  if(BDR_BIP.cameraStream){
    try{ BDR_BIP.cameraStream.getTracks().forEach(t => t.stop()); }catch(e){}
    BDR_BIP.cameraStream = null;
  }

  ["cameraProdutoBip","cameraEnderecoBip"].forEach(id => {
    const el = document.getElementById(id);
    if(el){
      el.classList.remove("ativo");
      el.innerHTML = "";
    }
  });
}

/* =========================================================
   BDR ESTOQUE - PERMISSÕES NOVAS POR AÇÃO
   Tela: estoque.html
   Permissões usadas:
   ESTOQUE_VER, ESTOQUE_ENTRADA, ESTOQUE_SAIDA,
   ESTOQUE_TRANSFERIR, ESTOQUE_EXPORTAR, VALORES_VER
========================================================= */
function bdrUsuarioEstoqueAtual(){
  try{
    const raw = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return null;
  }
}

function bdrPermissoesEstoque(){
  const u = bdrUsuarioEstoqueAtual();
  return String(u?.permissoes || "")
    .split(",")
    .map(p => String(p || "").trim().toUpperCase())
    .filter(Boolean);
}

function bdrEhOwnerEstoque(){
  return Number(bdrUsuarioEstoqueAtual()?.id) === 1;
}

function bdrPodeEstoque(perm){
  if(bdrEhOwnerEstoque()) return true;
  return bdrPermissoesEstoque().includes(String(perm || "").toUpperCase());
}

function bdrPodeAcaoEstoque(perm, acao){
  if(bdrPodeEstoque(perm)) return true;
  alert("Você não tem permissão para " + (acao || "executar esta ação") + ".");
  return false;
}

function bdrAplicarPermissoesEstoque(){
  if(!bdrPodeEstoque("ESTOQUE_VER")){
    alert("Você não tem permissão para acessar esta tela.");
    if(window.atlasShellAbrir) window.atlasShellAbrir("dashboard");
    else location.href = "dashboard.html";
    return;
  }

  document.querySelectorAll("[data-acao-permissao]").forEach(el => {
    const p = el.getAttribute("data-acao-permissao");
    el.style.display = bdrPodeEstoque(p) ? "" : "none";
  });

  if(!bdrPodeEstoque("VALORES_VER")){
    document.getElementById("estoqueResumoValor")?.closest(".resumo-card")?.style.setProperty("display","none");
  }
}

function iniciarPermissoesEstoque(){
  bdrAplicarPermissoesEstoque();
  setTimeout(bdrAplicarPermissoesEstoque, 500);
  setTimeout(bdrAplicarPermissoesEstoque, 1200);
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciarPermissoesEstoque, {once:true});
else iniciarPermissoesEstoque();
