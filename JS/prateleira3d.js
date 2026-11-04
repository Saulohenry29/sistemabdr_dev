/* =========================================================
   BDR PRATELEIRAS 3D REAL FINAL
   - 3D real com Three.js / OrbitControls
   - mapa/lista 2D
   - etiquetas com Owner
   - sem bipagem nesta página
========================================================= */

let scene, camera, renderer, controls, raycaster, mouse;
let objetosClicaveis = [];
let grupoLayout = null;
let gridHelper = null;
let enderecoSelecionado = null;
let visao2DAtiva = false;
let gradesAtivas = true;
let todosEnderecos = [];
let loteEtiquetas = [];
let bdrEtiquetasJaInicializadas = false;
let bdr3DAtivo = false;

function ir(pagina){ window.location.href = pagina; }
function voltarEstoquePrateleira(){ window.location.href = 'estoque.html'; }
function db(){ return window.client || window.supabaseClient || window.clientSupabase || globalThis.client; }
function el(id){ return document.getElementById(id); }
function v(id){ return String(el(id)?.value || '').trim(); }
function n(id){ return Number(v(id) || 0); }
function pad(num){ return String(num).padStart(2,'0'); }
function setTexto(id, valor){ const x = el(id); if(x) x.innerText = valor; }

function normalizarEndereco(codigo){
  let c = String(codigo || '').trim().replace(/^END-/i,'').replace(/\s+/g,'').toUpperCase();
  const m = c.match(/R(\d+)-F(\d+)-P(\d+)-C(\d+)-N(\d+)(?:-CX(\d+))?/i);
  if(!m) return c;
  let final = `R${m[1]}-F${m[2]}-P${pad(m[3])}-C${pad(m[4])}-N${pad(m[5])}`;
  if(m[6]) final += `-CX${pad(m[6])}`;
  return final;
}

function codigoEndereco(rua, face, prateleira, coluna, nivel, caixa){
  let codigo = `${rua}-F${face}-P${pad(prateleira)}-C${pad(coluna)}-N${pad(nivel)}`;
  if(Number(caixa) > 1) codigo += `-CX${pad(caixa)}`;
  return normalizarEndereco(codigo);
}

function toast(msg){
  const t = el('toast3d');
  if(!t) return;
  t.innerText = msg;
  t.classList.add('ativo');
  setTimeout(()=>t.classList.remove('ativo'),1800);
}

function lerConfig(){
  return {
    rua:(v('rua') || 'R1').toUpperCase(),
    faces:Math.max(1,n('faces') || 1),
    prateleiras:Math.max(1,n('prateleiras') || 1),
    colunas:Math.max(1,n('colunas') || 1),
    niveis:Math.max(1,n('niveis') || 1),
    caixas:Math.max(1,n('caixas') || 1),
    tipoArea:v('tipoArea') || 'GERAL'
  };
}

function gerarListaCodigos(){
  const cfg = lerConfig();
  const lista = [];
  for(let face=1; face<=cfg.faces; face++){
    for(let prateleira=1; prateleira<=cfg.prateleiras; prateleira++){
      for(let coluna=1; coluna<=cfg.colunas; coluna++){
        for(let nivel=1; nivel<=cfg.niveis; nivel++){
          for(let caixa=1; caixa<=cfg.caixas; caixa++){
            lista.push({
              rua:cfg.rua,
              face:`F${face}`,
              prateleira:`P${pad(prateleira)}`,
              coluna:`C${pad(coluna)}`,
              nivel:`N${pad(nivel)}`,
              caixa:cfg.caixas > 1 ? `CX${pad(caixa)}` : '',
              tipo_area:cfg.tipoArea,
              status:'LIVRE',
              codigo_curto:codigoEndereco(cfg.rua,face,prateleira,coluna,nivel,caixa)
            });
          }
        }
      }
    }
  }
  todosEnderecos = lista;
  return lista;
}


function renderMapa2DStage(){
  const area = el('mapa2DStage');
  if(!area) return;
  const cfg = lerConfig();
  const lista = gerarListaCodigos();
  const porFace = {};
  lista.forEach(item=>{
    const key = item.face;
    if(!porFace[key]) porFace[key] = [];
    porFace[key].push(item);
  });
  area.innerHTML = Object.keys(porFace).map(face=>{
    const porPrat = {};
    porFace[face].forEach(item=>{
      if(!porPrat[item.prateleira]) porPrat[item.prateleira] = [];
      porPrat[item.prateleira].push(item);
    });
    return `<div class="bdr-mapa2d-face"><h4>${cfg.rua} / ${face}</h4><div class="bdr-mapa2d-racks">${Object.keys(porPrat).map(prat=>{
      const itens = porPrat[prat];
      let rows = '';
      for(let nvl=cfg.niveis; nvl>=1; nvl--){
        const nivelCod = 'N'+pad(nvl);
        const cols = itens.filter(i=>i.nivel===nivelCod);
        rows += `<div class="bdr-mapa2d-row" style="--cols:${cfg.colunas}">${cols.map(i=>`<button type="button" class="bdr-mapa2d-slot" data-cod="${i.codigo_curto}" onclick="selecionarEndereco2D('${i.codigo_curto}')" title="${i.codigo_curto}">${i.coluna.replace('C','')}</button>`).join('')}</div>`;
      }
      return `<div class="bdr-mapa2d-rack"><b>${prat}</b><div class="bdr-mapa2d-niveis">${rows}</div></div>`;
    }).join('')}</div></div>`;
  }).join('');
}

function selecionarEndereco2D(codigo){
  const cod = normalizarEndereco(codigo);
  document.querySelectorAll('.bdr-mapa2d-slot').forEach(b=>b.classList.toggle('sel', normalizarEndereco(b.dataset.cod)===cod));
  atualizarQrPreview(cod);
  const partes = cod.match(/R(\d+)-F(\d+)-P(\d+)-C(\d+)-N(\d+)/);
  const info = el('codigoSelecionado');
  if(info){
    info.innerHTML = `<b>Código:</b> ${cod}<br><b>QR:</b> END-${cod}<br><b>Rua:</b> R${partes?.[1]||'-'}<br><b>Face:</b> F${partes?.[2]||'-'}<br><b>Prateleira:</b> P${partes?.[3]||'-'}<br><b>Coluna:</b> C${partes?.[4]||'-'}<br><b>Nível:</b> N${partes?.[5]||'-'}<br><b>Status:</b> <span style="color:#22c55e;font-weight:900;">LIVRE</span>`;
  }
  if(bdr3DAtivo){
    const obj = objetosClicaveis.find(o => normalizarEndereco(o.userData.codigo) === cod);
    if(obj) selecionarEndereco(obj,true);
  }
}

/* ===================== THREE ===================== */
function iniciarThree(){
  if(renderer && scene && camera){ return; }
  if(!window.THREE){ alert('Three.js não carregou. Verifique a internet/CDN.'); return; }
  const canvas = el('threeCanvas');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f6fb);
  camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, .1, 2000);
  camera.position.set(18,16,22);
  renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .08;
  controls.screenSpacePanning = false;
  controls.maxPolarAngle = Math.PI / 2.15;
  controls.minPolarAngle = Math.PI / 6;
  controls.minDistance = 8;
  controls.maxDistance = 70;
  controls.rotateSpeed = .8;
  controls.zoomSpeed = .9;
  controls.panSpeed = .8;
  controls.target.set(0,2,0);
  controls.update();
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  adicionarLuzes(); adicionarPiso(); adicionarParedes(); adicionarGrades();
  renderer.domElement.addEventListener('click', selecionarObjeto3D);
  window.addEventListener('resize', redimensionarThree);
  animar();
}

function adicionarLuzes(){
  scene.add(new THREE.AmbientLight(0xffffff,.72));
  const luz = new THREE.DirectionalLight(0xffffff,1.35);
  luz.position.set(18,24,12); luz.castShadow = true;
  luz.shadow.mapSize.width = 2048; luz.shadow.mapSize.height = 2048;
  scene.add(luz);
  const ponto = new THREE.PointLight(0xffffff,.55,80);
  ponto.position.set(-15,16,-12); scene.add(ponto);
}
function criarTexturaPiso(){
  const canvas = document.createElement('canvas'); canvas.width=512; canvas.height=512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle='#b7bcc5'; ctx.fillRect(0,0,512,512);
  ctx.strokeStyle='rgba(255,255,255,.20)'; ctx.lineWidth=2;
  for(let i=0;i<=512;i+=64){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,512); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(512,i); ctx.stroke(); }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(8,6);
  return texture;
}
function adicionarPiso(){
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(80,60), new THREE.MeshStandardMaterial({map:criarTexturaPiso(),roughness:.9,metalness:.05}));
  piso.rotation.x = -Math.PI/2; piso.receiveShadow = true; piso.name='PISO'; scene.add(piso);
}
function adicionarParedes(){
  const mat = new THREE.MeshStandardMaterial({color:0xa6adb8,roughness:.85});
  const fundo = new THREE.Mesh(new THREE.BoxGeometry(80,12,.5),mat); fundo.position.set(0,6,-30); fundo.receiveShadow=true; scene.add(fundo);
  const esq = new THREE.Mesh(new THREE.BoxGeometry(.5,12,60),mat); esq.position.set(-40,6,0); esq.receiveShadow=true; scene.add(esq);
}
function adicionarGrades(){ gridHelper = new THREE.GridHelper(80,40,0xffcc00,0xd1d5db); gridHelper.position.y=.02; scene.add(gridHelper); }
function redimensionarThree(){ if(!renderer||!camera) return; const canvas = renderer.domElement; camera.aspect = canvas.clientWidth / canvas.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); }
function animar(){ requestAnimationFrame(animar); if(controls){ if(controls.target.y<0) controls.target.y=0; if(camera.position.y<1.2) camera.position.y=1.2; controls.update(); } renderer.render(scene,camera); }

function limparObjeto(obj){ obj.traverse(child=>{ if(child.geometry) child.geometry.dispose(); if(child.material){ Array.isArray(child.material) ? child.material.forEach(m=>m.dispose()) : child.material.dispose(); } }); }
function limparLayout3D(){ if(grupoLayout){ scene.remove(grupoLayout); limparObjeto(grupoLayout); } grupoLayout=null; objetosClicaveis=[]; enderecoSelecionado=null; }

function simularLayout(){
  const cfg = lerConfig();
  gerarListaCodigos();

  // Se o 3D ainda não foi ativado, gera só mapa 2D/lista/etiquetas.
  if(!bdr3DAtivo || !scene || !window.THREE){
    atualizarResumo();
    preencherTabela();
    renderMapa2DStage();
    gerarEtiquetas(false);
    atualizarQrPreview('');
    toast('Mapa 2D atualizado. Clique em Ativar 3D para abrir 360°.');
    return;
  }

  limparLayout3D();
  grupoLayout = new THREE.Group(); grupoLayout.name = 'LAYOUT_BDR'; scene.add(grupoLayout);
  objetosClicaveis = [];
  const espacamentoFace = 7.2, espacamentoPrateleira = 4.2;
  for(let face=1; face<=cfg.faces; face++){
    const z = (face-1)*espacamentoFace - ((cfg.faces-1)*espacamentoFace/2);
    for(let prat=1; prat<=cfg.prateleiras; prat++){
      const x = (prat-1)*espacamentoPrateleira - ((cfg.prateleiras-1)*espacamentoPrateleira/2);
      const rack = criarRack(cfg,face,prat); rack.position.set(x,0,z); grupoLayout.add(rack);
      criarTexto3D(`P${pad(prat)}`,x,4.3,z+1.65,grupoLayout);
    }
    criarTexto3D(`FACE ${face}`,-((cfg.prateleiras)*espacamentoPrateleira/2),5.1,z,grupoLayout);
  }
  criarMarcacoesRua(cfg);
  atualizarResumo(); preencherTabela(); renderMapa2DStage(); gerarEtiquetas(false); resetCamera(); atualizarQrPreview('');
  toast('Layout 3D gerado.');
}

function criarRack(cfg,face,prateleira){
  const grupo = new THREE.Group();
  const largura = cfg.colunas*.62, altura = cfg.niveis*.72, profundidade = 1.45;
  criarEstruturaRack(grupo,largura,altura,profundidade);
  criarPosicoesRack(grupo,cfg,face,prateleira,largura);
  return grupo;
}
function criarEstruturaRack(grupo,largura,altura,profundidade){
  const azul = new THREE.MeshStandardMaterial({color:0x0b4f93,roughness:.45,metalness:.45});
  const laranja = new THREE.MeshStandardMaterial({color:0xff7a00,roughness:.45,metalness:.35});
  const posteGeo = new THREE.BoxGeometry(.08,altura+.45,.08);
  const vigaGeo = new THREE.BoxGeometry(largura+.35,.08,.10);
  const profGeo = new THREE.BoxGeometry(.08,.08,profundidade+.20);
  const xs=[-largura/2,largura/2], zs=[-profundidade/2,profundidade/2];
  xs.forEach(x=>zs.forEach(z=>{ const poste=new THREE.Mesh(posteGeo,azul); poste.position.set(x,(altura+.45)/2,z); poste.castShadow=true; grupo.add(poste); }));
  for(let nivel=0;nivel<=Math.ceil(altura/.72);nivel++){
    const y=.32+nivel*.72;
    zs.forEach(z=>{ const viga=new THREE.Mesh(vigaGeo,laranja); viga.position.set(0,y,z); viga.castShadow=true; grupo.add(viga); });
    xs.forEach(x=>{ const vp=new THREE.Mesh(profGeo,laranja); vp.position.set(x,y,0); vp.castShadow=true; grupo.add(vp); });
  }
}
function criarPosicoesRack(grupo,cfg,face,prateleira,largura){
  const livre = new THREE.MeshStandardMaterial({color:0x1f8f4a,roughness:.62,metalness:.05});
  const papel = new THREE.MeshStandardMaterial({color:0xb9854f,roughness:.78});
  const palletMat = new THREE.MeshStandardMaterial({color:0xd6d9de,roughness:.7});
  const boxGeo = new THREE.BoxGeometry(.48,.34,.88), palletGeo = new THREE.BoxGeometry(.54,.05,.94);
  for(let nivel=1;nivel<=cfg.niveis;nivel++){
    for(let coluna=1;coluna<=cfg.colunas;coluna++){
      const x=-largura/2+.31+(coluna-1)*.62, y=.34+(nivel-1)*.72, z=0;
      const codigo = codigoEndereco(cfg.rua,face,prateleira,coluna,nivel,1);
      const pallet = new THREE.Mesh(palletGeo,palletMat); pallet.position.set(x,y-.19,z); pallet.castShadow=true; pallet.receiveShadow=true; grupo.add(pallet);
      const box = new THREE.Mesh(boxGeo,(coluna+nivel+prateleira)%3===0?papel:livre);
      box.position.set(x,y,z); box.castShadow=true; box.receiveShadow=true;
      box.userData = {clicavel:true,codigo,rua:cfg.rua,face:`F${face}`,faceNum:face,prateleira:`P${pad(prateleira)}`,prateleiraNum:prateleira,coluna:`C${pad(coluna)}`,colunaNum:coluna,nivel:`N${pad(nivel)}`,nivelNum:nivel,caixa:'',tipoArea:cfg.tipoArea,status:'LIVRE'};
      grupo.add(box); objetosClicaveis.push(box);
    }
  }
}
function criarMarcacoesRua(cfg){ if(!grupoLayout) return; for(let face=1;face<=cfg.faces;face++){ const z=(face-1)*7.2-(((cfg.faces-1)*7.2)/2); criarTexto3D(`${cfg.rua} / F${face}`,0,.05,z-2.3,grupoLayout,.32); } }
function criarTexto3D(texto,x,y,z,grupo,tamanho=.42){
  const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=128; const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(255,255,255,.92)'; ctx.fillRect(0,0,512,128); ctx.strokeStyle='rgba(17,24,39,.25)'; ctx.lineWidth=6; ctx.strokeRect(0,0,512,128);
  ctx.fillStyle='#111827'; ctx.font='bold 54px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(texto,256,66);
  const texture=new THREE.CanvasTexture(canvas), material=new THREE.SpriteMaterial({map:texture}), sprite=new THREE.Sprite(material);
  sprite.position.set(x,y,z); sprite.scale.set(tamanho*4,tamanho,1); grupo.add(sprite);
}
function selecionarObjeto3D(event){
  const rect=renderer.domElement.getBoundingClientRect();
  mouse.x=((event.clientX-rect.left)/rect.width)*2-1;
  mouse.y=-((event.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObjects(objetosClicaveis,false);
  if(hits.length===0) return;
  selecionarEndereco(hits[0].object, true);
}
function selecionarEndereco(obj, moverCamera=false){
  if(obj.userData?.atlasRascunho){
    objetosClicaveis.forEach(item=>item.scale.set(1,1,1));obj.scale.set(1.15,1.15,1.15);
    const d=obj.userData;el('codigoSelecionado').textContent=d.codigo+' · Estrutura '+d.estrutura+' · '+d.coluna+' · '+d.nivel+' · '+(d.nivel01Chao?'N01 no chão':'N01 elevado')+' · RASCUNHO LOCAL (sem saldo)';
    toast(d.codigo+' — posição de planejamento');if(moverCamera)centralizarObjeto(obj);return;
  }
  objetosClicaveis.forEach(item=>item.scale.set(1,1,1));
  obj.scale.set(1.18,1.18,1.18);
  enderecoSelecionado = obj.userData;
  atualizarQrPreview(enderecoSelecionado.codigo);
  const info = el('codigoSelecionado');
  if(info){
    info.innerHTML = `<b>Código:</b> ${enderecoSelecionado.codigo}<br><b>QR:</b> END-${enderecoSelecionado.codigo}<br><b>Rua:</b> ${enderecoSelecionado.rua}<br><b>Face:</b> ${enderecoSelecionado.face}<br><b>Prateleira:</b> ${enderecoSelecionado.prateleira}<br><b>Coluna:</b> ${enderecoSelecionado.coluna}<br><b>Nível:</b> ${enderecoSelecionado.nivel}<br><b>Status:</b> <span style="color:#22c55e;font-weight:900;">${enderecoSelecionado.status}</span>`;
  }
  if(moverCamera) centralizarObjeto(obj);
  toast(enderecoSelecionado.codigo+' selecionado');
}
function centralizarObjeto(obj){
  if(!obj || !controls) return;
  const pos = new THREE.Vector3(); obj.getWorldPosition(pos);
  controls.target.copy(pos);
  camera.position.set(pos.x+6, pos.y+5, pos.z+7);
  controls.update();
}
function localizarEndereco3D(){
  if(!bdr3DAtivo){ ativarModo3D(); setTimeout(localizarEndereco3D,350); return; }
  const cod = normalizarEndereco(v('buscarEndereco3D') || v('buscarEnderecoLista'));
  if(!cod) return;
  const obj = objetosClicaveis.find(o => normalizarEndereco(o.userData.codigo) === cod);
  if(!obj){ toast('Endereço não encontrado no layout atual.'); return; }
  selecionarEndereco(obj,true);
}
function ativarModo3D(){
  atlasCDAtivo=false;document.body.classList.remove('atlas-cd-ativo');
  bdr3DAtivo = true;
  document.body.classList.remove('bdr-3d-inativo');
  if(!scene || !renderer || !camera){
    iniciarThree();
  }
  setTimeout(()=>{
    redimensionarThree();
    simularLayout();
  },60);
}

function resetCamera(){ if(!bdr3DAtivo){ ativarModo3D(); return; } if(!camera||!controls) return; const zoom=Number(el('zoomRange')?.value||90)/100; camera.position.set(20/zoom,16/zoom,24/zoom); controls.target.set(0,2.2,0); controls.update(); }
function ajustarZoomRange(){ const valor=Number(el('zoomRange')?.value||90); setTexto('zoomTxt',valor+'%'); resetCamera(); }
function modoOrbitar(){ if(!bdr3DAtivo){ ativarModo3D(); return; } toast('Modo 360° ativo: arraste para girar, scroll aproxima.'); }
function alternarVisao2D(){ if(!bdr3DAtivo){ ativarModo3D(); return; } visao2DAtiva=!visao2DAtiva; if(visao2DAtiva){ camera.position.set(0,42,.01); controls.target.set(0,0,0); } else resetCamera(); controls.update(); }
function alternarGrades(){ if(!bdr3DAtivo){ ativarModo3D(); return; } gradesAtivas=!gradesAtivas; if(gridHelper) gridHelper.visible=gradesAtivas; }
function marcarExemplos3D(){
  if(!bdr3DAtivo){ ativarModo3D(); return; }
  objetosClicaveis.forEach((obj,index)=>{
    obj.userData.status='LIVRE';
    if(index%17===0){ obj.material=new THREE.MeshStandardMaterial({color:0xf97316,roughness:.62}); obj.userData.status='OCUPADO'; }
    if(index%31===0){ obj.material=new THREE.MeshStandardMaterial({color:0x7c3aed,roughness:.62}); obj.userData.status='RESERVADO'; }
    if(index%47===0){ obj.material=new THREE.MeshStandardMaterial({color:0xdc2626,roughness:.62}); obj.userData.status='BLOQUEADO'; }
  });
  toast('Exemplos aplicados.');
}

/* ===================== LISTA / MAPA 2D ===================== */
function atualizarResumo(){ const cfg=lerConfig(), total=gerarListaCodigos().length; setTexto('infoFaces',cfg.faces); setTexto('infoPrateleiras',cfg.faces*cfg.prateleiras); setTexto('infoColunas',cfg.colunas); setTexto('infoNiveis',cfg.niveis); setTexto('infoEnderecos',total); }
function preencherTabela(){
  const tabela = el('tabelaCodigos'); if(!tabela) return;
  const listaTotal = gerarListaCodigos();
  const lista = listaTotal.slice(0,80);
  tabela.innerHTML = `<div style="font-size:12px;color:#64748b;margin-bottom:8px;font-weight:900;">Total gerado: ${listaTotal.length} endereço(s). Mostrando ${lista.length}. Clique em uma linha para localizar no 3D.</div><table class="table-codes"><thead><tr><th>Código</th><th>Rua</th><th>Face</th><th>Prat.</th><th>Col.</th><th>Nível</th><th>Status</th></tr></thead><tbody>${lista.map(item=>`<tr onclick="selecionarEndereco2D('${item.codigo_curto}')"><td><b>${item.codigo_curto}</b></td><td>${item.rua}</td><td>${item.face}</td><td>${item.prateleira}</td><td>${item.coluna}</td><td>${item.nivel}</td><td><span style="color:#16a34a;font-weight:900;">${item.status}</span></td></tr>`).join('')}</tbody></table>`;
}
function filtrarListaEnderecos(){
  const busca = normalizarEndereco(v('buscarEnderecoLista'));
  if(!busca){ preencherTabela(); return; }
  const tabela = el('tabelaCodigos'); if(!tabela) return;
  const lista = gerarListaCodigos().filter(i => normalizarEndereco(i.codigo_curto).includes(busca)).slice(0,80);
  tabela.innerHTML = `<div style="font-size:12px;color:#64748b;margin-bottom:8px;font-weight:900;">Resultado: ${lista.length} endereço(s).</div><table class="table-codes"><thead><tr><th>Código</th><th>Rua</th><th>Face</th><th>Prat.</th><th>Col.</th><th>Nível</th><th>Status</th></tr></thead><tbody>${lista.map(item=>`<tr onclick="selecionarEndereco2D('${item.codigo_curto}')"><td><b>${item.codigo_curto}</b></td><td>${item.rua}</td><td>${item.face}</td><td>${item.prateleira}</td><td>${item.coluna}</td><td>${item.nivel}</td><td><span style="color:#16a34a;font-weight:900;">${item.status}</span></td></tr>`).join('')}</tbody></table>`;
}
function selecionarEnderecoPorCodigo(codigo){
  const cod = normalizarEndereco(codigo);
  const obj = objetosClicaveis.find(o => normalizarEndereco(o.userData.codigo) === cod);
  if(obj) selecionarEndereco(obj,true);
}
function atualizarQrPreview(codigo){
  const txt=el('qrCodePreview'), box=el('qrCodePreviewBox');
  if(txt) txt.innerText = codigo ? 'END-'+normalizarEndereco(codigo) : 'END-';
  if(!box) return;
  box.innerHTML='';
  if(window.QRCode && codigo){ new QRCode(box,{text:'END-'+normalizarEndereco(codigo),width:128,height:128,correctLevel:QRCode.CorrectLevel.M}); }
  else box.innerHTML='<div style="width:128px;height:128px;border:2px solid #111;display:flex;align-items:center;justify-content:center;font-weight:900;">QR</div>';
}

/* ===================== ETIQUETAS OWNER ===================== */
function cfgEtiqueta(){
  const padrao = {
    largura:5.5,
    altura:3.5,
    fonte:12,
    qr:1.25,
    logoSize:35,
    subSize:8,
    padding:5,
    gap:5,
    logo:true,
    titulo:true,
    detalhe:false,
    borda:true
  };
  try{
    return {...padrao, ...JSON.parse(localStorage.getItem('bdrEtiquetaPrateleiraOwner')||'{}')};
  }catch(e){
    return padrao;
  }
}

function aplicarConfigEtiqueta(){
  const c = cfgEtiqueta();
  document.documentElement.style.setProperty('--etq-largura',c.largura+'cm');
  document.documentElement.style.setProperty('--etq-altura',c.altura+'cm');
  document.documentElement.style.setProperty('--etq-fonte',c.fonte+'px');
  document.documentElement.style.setProperty('--etq-qr',c.qr+'cm');
  document.documentElement.style.setProperty('--etq-logo-size',c.logoSize+'px');
  document.documentElement.style.setProperty('--etq-sub-size',c.subSize+'px');
  document.documentElement.style.setProperty('--etq-padding',c.padding+'px');
  document.documentElement.style.setProperty('--etq-gap',c.gap+'px');

  [
    ['etqLargura',c.largura],['etqAltura',c.altura],['etqFonte',c.fonte],['etqQr',c.qr],
    ['etqLogoSize',c.logoSize],['etqSubSize',c.subSize],['etqPadding',c.padding],['etqGap',c.gap]
  ].forEach(([id,val])=>{ if(el(id)) el(id).value=val; });

  [['etqLogo',c.logo],['etqTitulo',c.titulo],['etqDetalhe',c.detalhe],['etqBorda',c.borda]].forEach(([id,val])=>{
    if(el(id)) el(id).checked=!!val;
  });

  document.body.classList.toggle('sem-logo',!c.logo);
  document.body.classList.toggle('sem-titulo',!c.titulo);
  document.body.classList.toggle('sem-detalhe',!c.detalhe);
  document.body.classList.toggle('sem-borda',!c.borda);
}

function lerConfigEtiquetaDoOwner(){
  return {
    largura:Number(v('etqLargura')||5.5),
    altura:Number(v('etqAltura')||3.5),
    fonte:Number(v('etqFonte')||12),
    qr:Number(v('etqQr')||1.25),
    logoSize:Number(v('etqLogoSize')||35),
    subSize:Number(v('etqSubSize')||8),
    padding:Number(v('etqPadding')||5),
    gap:Number(v('etqGap')||5),
    logo:!!el('etqLogo')?.checked,
    titulo:!!el('etqTitulo')?.checked,
    detalhe:!!el('etqDetalhe')?.checked,
    borda:!!el('etqBorda')?.checked
  };
}
function salvarConfigEtiqueta(){
  const c = lerConfigEtiquetaDoOwner();
  localStorage.setItem('bdrEtiquetaPrateleiraOwner',JSON.stringify(c));
  aplicarConfigEtiqueta();
  gerarPreviaEtiquetasSelecionadas();
  toast('Padrão da etiqueta salvo.');
}

function fecharModalEtiquetas(){ el('modalEtiquetas')?.classList.remove('ativo'); }

function abrirModalEtiquetas(){
  aplicarConfigEtiqueta();
  const codigos = gerarListaCodigos().map(i=>i.codigo_curto);
  if(!bdrEtiquetasJaInicializadas){
    loteEtiquetas = codigos.slice(0,1);
    bdrEtiquetasJaInicializadas = true;
  }
  renderListaEtiquetas();
  gerarPreviaEtiquetasSelecionadas();
  el('modalEtiquetas')?.classList.add('ativo');
}



function codigosSelecionados(){
  return [...document.querySelectorAll('#listaEtiquetas input[type="checkbox"]:checked')].map(i=>i.value);
}

function renderListaEtiquetas(){
  const lista = el('listaEtiquetas');
  if(!lista) return;
  const codigos = gerarListaCodigos().map(i=>i.codigo_curto);
  lista.innerHTML = codigos.map(c=>`<label class="etq-item"><input type="checkbox" value="${c}" ${loteEtiquetas.includes(c)?'checked':''} onchange="toggleEtiqueta(this)"><span>${c}</span><button class="btn btn-light" type="button" onclick="event.preventDefault();event.stopPropagation();imprimirUmaEtiqueta('${c}')"><i class="fa-solid fa-print"></i></button></label>`).join('') || '<div style="color:#64748b;font-weight:900;">Gere o layout primeiro.</div>';
}

function etiquetaHtml(codigo, idx){
  const cod = normalizarEndereco(codigo);
  const partes = cod.split('-');
  return `<div class="etiqueta">
    <div class="etq-top">
      <div class="etq-logo"><div class="etq-logo-bdr">BDR</div><div class="etq-logo-sub">Construart</div></div>
      <div class="etq-qr" id="qrEtiqueta${idx}" data-qr="END-${cod}"></div>
    </div>
    <div class="etq-meio"><span class="etq-titulo">Local: Prateleira / posição física<br></span><span class="etq-detalhe">${partes.join(' • ')}</span></div>
    <div class="etq-codigo">${cod}</div>
  </div>`;
}

function toggleEtiqueta(chk){ const c=chk.value; if(chk.checked){ if(!loteEtiquetas.includes(c)) loteEtiquetas.push(c); } else loteEtiquetas = loteEtiquetas.filter(x=>x!==c); }
function marcarTodasEtiquetas(sim){
  const codigos = gerarListaCodigos().map(i=>i.codigo_curto);
  loteEtiquetas = sim ? [...codigos] : [];
  bdrEtiquetasJaInicializadas = true;
  renderListaEtiquetas();
  document.querySelectorAll('#listaEtiquetas input[type="checkbox"]').forEach(chk=>{ chk.checked = !!sim; });
  gerarPreviaEtiquetasSelecionadas();
}

function desenharQrs(containerSel){
  document.querySelectorAll(`${containerSel} .etq-qr`).forEach(box=>{
    const txt = box.getAttribute('data-qr'); box.innerHTML='';
    if(window.QRCode) new QRCode(box,{text:txt,width:110,height:110,correctLevel:QRCode.CorrectLevel.M});
    else box.innerText='QR';
  });
}
function gerarPreviaEtiquetasSelecionadas(){
  salvarConfigSemAlertar();
  const selecionados = codigosSelecionados().slice(0,24);
  const preview = el('modalPreviewEtiquetas'); if(!preview) return;
  preview.innerHTML = selecionados.map((c,i)=>etiquetaHtml(c,'prev'+i)).join('') || '<div style="font-weight:900;color:#64748b">Selecione pelo menos uma etiqueta.</div>';
  setTimeout(()=>desenharQrs('#modalPreviewEtiquetas'),50);
}
function salvarConfigSemAlertar(){
  const c = lerConfigEtiquetaDoOwner();
  localStorage.setItem('bdrEtiquetaPrateleiraOwner',JSON.stringify(c));
  aplicarConfigEtiqueta();
}

function gerarEtiquetas(mostrarAlerta=true){
  aplicarConfigEtiqueta();
  const grid=el('etiquetasGrid'); if(!grid) return;
  const lista = gerarListaCodigos().map(i=>i.codigo_curto);
  grid.innerHTML = lista.map((c,i)=>etiquetaHtml(c,i)).join('');
  setTimeout(()=>desenharQrs('#etiquetasGrid'),50);
  if(mostrarAlerta) alert(`${lista.length} etiquetas geradas.`);
}
function imprimirUmaEtiqueta(codigo){
  aplicarConfigEtiqueta();
  const grid=el('etiquetasGrid'); if(!grid) return;
  grid.innerHTML = etiquetaHtml(codigo,0);
  document.body.classList.add('bdr-print-etiquetas');
  setTimeout(()=>{ desenharQrs('#etiquetasGrid'); setTimeout(()=>window.print(),250); },80);
}
function imprimirEtiquetasSelecionadas(){
  salvarConfigSemAlertar();
  const selecionados = codigosSelecionados();
  if(!selecionados.length){ alert('Selecione pelo menos uma etiqueta.'); return; }
  loteEtiquetas = [...selecionados];
  const grid=el('etiquetasGrid'); if(!grid) return;
  grid.innerHTML = selecionados.map((c,i)=>etiquetaHtml(c,i)).join('');
  fecharModalEtiquetas();
  document.body.classList.add('bdr-print-etiquetas');
  setTimeout(()=>{
    desenharQrs('#etiquetasGrid');
    setTimeout(()=>window.print(),280);
  },100);
}

function imprimirEtiquetas(){ abrirModalEtiquetas(); }

/* ===================== BANCO ===================== */
async function cadastrarEnderecos(){
  const lista = gerarListaCodigos();
  if(!lista.length) return;
  if(!confirm(`Cadastrar ${lista.length} endereço(s) no sistema?`)) return;
  const banco = db();
  if(!banco){ alert('Banco não carregado. Confira supabaseClient.js.'); return; }
  const payload = lista.map(item=>({rua:item.rua,face:item.face,prateleira:item.prateleira,coluna:item.coluna,nivel:item.nivel,caixa:item.caixa,tipo_area:item.tipo_area,status:item.status,codigo_curto:item.codigo_curto}));
  const {error} = await banco.from('enderecamento_estoque').insert(payload);
  if(error){ alert('Erro ao cadastrar endereços: '+error.message); return; }
  alert('Endereços cadastrados com sucesso.');
}
function limparLayout(){
  if(!confirm('Limpar layout 3D da tela?')) return;
  limparLayout3D(); todosEnderecos=[]; loteEtiquetas=[];
  if(el('tabelaCodigos')) el('tabelaCodigos').innerHTML='';
  if(el('etiquetasGrid')) el('etiquetasGrid').innerHTML='';
  atualizarQrPreview('');
  if(el('codigoSelecionado')) el('codigoSelecionado').innerHTML='Clique em uma posição da prateleira.';
}

document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ fecharModalEtiquetas(); document.body.classList.remove('bdr-print-etiquetas'); } });
document.addEventListener('click', e=>{ if(e.target && e.target.id === 'modalEtiquetas') fecharModalEtiquetas(); });

/* ATLAS — prévia 3D de estruturas locais PP / PA / MZ.
   Exclusivamente visual: nenhuma escrita no banco, nem geração de etiquetas reais. */
let atlasCDAtivo=false;
function atlasLerEstruturas(){
  try{
    const dados=JSON.parse(localStorage.getItem('ATLAS_ESTRUTURAS_RASCUNHO_LOCAL')||'[]');
    return Array.isArray(dados)?dados.filter(x=>x&&/^(PP|PA|MZ)\d{2,}$/.test(x.codigo)&&Number.isInteger(x.colunas)&&x.colunas>0&&x.colunas<=100&&Number.isInteger(x.niveis)&&x.niveis>0&&x.niveis<=30):[];
  }catch{return []}
}
function atlasCaixa(g,x,y,z,w,h,d,cor){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:cor,roughness:.67}));
  mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
}
function atlasDesenharEstrutura(g,e,cx,cz){
  const cols=e.colunas,levels=e.niveis,larg=cols*.68,prof=e.tipo==='PP'?1.65:1.12,alt=levels*.76;
  const lado=String(e.posicao||'').toLowerCase();
  const espelho=!!e.espelhado, inativas=new Set(e.posicoesInativas||[]);
  const base=new THREE.Group();base.position.set(cx,0,cz);
  // As colunas avançam ao longo da parede (eixo Z), não atravessando o corredor (eixo X).
  base.rotation.y=Math.PI/2;
  g.add(base);
  const colPoste=e.tipo==='PP'?0x22549a:e.tipo==='PA'?0x64748b:0x7c3aed;
  for(let c=0;c<=cols;c++)for(const z of [-prof/2,prof/2])atlasCaixa(base,-larg/2+c*.68,.1+alt/2,z,.055,alt+.2,.055,colPoste);
  for(let n=0;n<=levels;n++)for(const z of [-prof/2,prof/2])atlasCaixa(base,0,.08+n*.76,z,larg+.06,.055,.065,0xf59e0b);
  for(let c=1;c<=cols;c++)for(let n=1;n<=levels;n++){
    const pos='C'+String(c).padStart(2,'0')+'-N'+String(n).padStart(2,'0');
    const indice=espelho?cols-c:c-1;
    const x=-larg/2+.34+indice*.68,y=.22+(n-1)*.76;
    if(inativas.has(pos)){
      atlasCaixa(base,x,y,0,.48,.035,.55,0x94a3b8);
      continue;
    }
    const box=atlasCaixa(base,x,y,0,.52,.30,prof*.67,0x3b82f6);
    box.userData={clicavel:true,atlasRascunho:true,codigo:e.codigo+'-'+pos,estrutura:e.codigo,coluna:'C'+String(c).padStart(2,'0'),nivel:'N'+String(n).padStart(2,'0'),nivel01Chao:e.nivel01Chao!==false,espelhado:espelho};
    objetosClicaveis.push(box);
  }
  criarTexto3D(e.codigo,cx,alt+1.0,cz,g,.42);
  if(lado.includes('direita'))criarTexto3D('DIREITA',cx,alt+.5,cz,g,.23);
  else if(lado.includes('esquerda'))criarTexto3D('ESQUERDA',cx,alt+.5,cz,g,.23);
}
function abrirEstruturasCD3D(){
  const estruturas=atlasLerEstruturas();
  if(!estruturas.length){alert('Nenhuma estrutura no rascunho deste navegador. Cadastre PP01 ou PA01 em Estoque → Gerenciar estruturas.');return}
  if(!window.THREE){alert('Three.js não carregou. Verifique sua conexão.');return}
  atlasCDAtivo=true;bdr3DAtivo=true;visao2DAtiva=false;
  document.body.classList.remove('bdr-3d-inativo');document.body.classList.add('atlas-cd-ativo');
  iniciarThree();
  setTimeout(()=>{
    redimensionarThree();limparLayout3D();
    grupoLayout=new THREE.Group();grupoLayout.name='ATLAS_CD_RASCUNHO';scene.add(grupoLayout);objetosClicaveis=[];
    // Planta demonstrativa do CD: entrada em +Z, fundo em -Z.
    // PP01 à direita. PA01, quando ainda não tem posição física, junto à parede esquerda.
    // Demais estruturas sem posição definida ficam no centro para não presumir localização.
    const direita=[],esquerda=[],centro=[],fundo=[];
    estruturas.forEach(e=>{
      const p=String(e.posicao||'').toLowerCase();
      if(p.includes('direita'))direita.push(e);
      else if(p.includes('esquerda') || (e.tipo==='PA' && e.codigo==='PA01' && !p.trim()))esquerda.push(e);
      else if(p.includes('fundo'))fundo.push(e);
      else centro.push(e);
    });
    const maiorComprimento=Math.max(12,...estruturas.map(e=>e.colunas*.68+2));
    const comprimento=Math.max(22,maiorComprimento+10);
    const largura=22, entrada=comprimento/2, paredeFundo=-comprimento/2;
    // Marcação de perímetro: guia visual, sem representar medidas reais do CD.
    atlasCaixa(grupoLayout,-largura/2,.035,0,.10,.07,comprimento,0x94a3b8);
    atlasCaixa(grupoLayout, largura/2,.035,0,.10,.07,comprimento,0x94a3b8);
    atlasCaixa(grupoLayout,0,.035,paredeFundo,largura,.07,.10,0x94a3b8);
    const colocarLateral=(lista,lado)=>{
      let cursor=entrada-2;
      lista.forEach(e=>{
        const prof=e.tipo==='PP'?1.65:1.12, comp=e.colunas*.68;
        const x=lado*(largura/2-prof/2-.45);
        const z=cursor-comp/2;
        atlasDesenharEstrutura(grupoLayout,e,x,z);
        cursor-=comp+1.4;
      });
    };
    colocarLateral(direita,1);colocarLateral(esquerda,-1);
    centro.forEach((e,i)=>{
      const x=(i%2===0?-3:3),z=entrada-3-e.colunas*.34-Math.floor(i/2)*7;
      atlasDesenharEstrutura(grupoLayout,e,x,z);
    });
    fundo.forEach((e,i)=>{
      const x=-largura/2+3+i*4,z=paredeFundo+2.3;
      atlasDesenharEstrutura(grupoLayout,e,x,z);
    });
    criarTexto3D('ENTRADA',0,.10,entrada-1,grupoLayout,.65);
    criarTexto3D('FUNDO',0,.10,paredeFundo+1,grupoLayout,.65);
    camera.position.set(21,23,entrada+14);controls.target.set(0,1,0);
    controls.maxDistance=220;controls.update();
    el('codigoSelecionado').textContent=estruturas.length+' estrutura(s) do rascunho local. Clique numa posição azul para consultar seu código. Posições cinzas não existem.';
    toast('Estruturas locais carregadas em 3D. Nenhum dado foi alterado.');
  },80);
}

document.addEventListener('DOMContentLoaded',()=>{
  aplicarConfigEtiqueta();
  // Carrega leve primeiro: mapa 2D/lista/etiquetas. O 3D abre só ao clicar em Ativar 3D.
  simularLayout();
  ['rua','faces','prateleiras','colunas','niveis','caixas','tipoArea'].forEach(id=>{
    const campo=el(id); if(!campo) return;
    campo.addEventListener('change',()=>simularLayout());
  });
});

window.addEventListener('afterprint',()=>{ document.body.classList.remove('bdr-print-etiquetas'); });
