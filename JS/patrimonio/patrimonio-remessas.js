(function(){
  'use strict';

  if(window.AtlasPatrimonioRemessas?.__loaded) return;

  const state = {
    remessas:[],
    itensSelecionados:new Set(),
    schemaDisponivel:null,
    carregando:false,
    modoSelecao:false,
    obraOrigemSelecao:null
  };

  function db(){ return window.client || window.supabaseClient || window.clientSupabase || globalThis.client; }
  function api(){ return window.AtlasPatrimonioAPI || {}; }
  function usuario(){ try{return JSON.parse(localStorage.getItem('usuario_logado')||'null')||{};}catch(e){return {};} }
  function texto(v){ return String(v ?? '').trim(); }
  function esc(v){ return texto(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
  function fmtData(v){ if(!v)return '-'; const d=new Date(v); return isNaN(d)?texto(v):d.toLocaleString('pt-BR',{timeZone:'America/Cuiaba',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  function obras(){ return Array.isArray(api().obras?.()) ? api().obras() : []; }
  function patrimonios(){ return Array.isArray(api().listar?.()) ? api().listar() : []; }
  function obra(id){ return obras().find(o=>String(o.id)===String(id)); }
  function obraNome(id){ const o=obra(id); return o?.nome || o?.setor_obra || o?.descricao || `Obra ${id||'-'}`; }
  function empresaId(){ const u=usuario(); return Number(u.empresa_id || 17); }
  function podeMovimentar(){ return typeof window.usuarioTemPermissao==='function' ? window.usuarioTemPermissao('PATRIMONIO_MOVIMENTAR') : true; }
  function modal(id,aberto){ const el=document.getElementById(id); if(!el)return; el.classList.toggle('aberto',!!aberto); el.setAttribute('aria-hidden',aberto?'false':'true'); }
  function aviso(msg){ if(typeof window.atlasAvisoPatrimonio==='function') window.atlasAvisoPatrimonio('Atlas Patrimônio',msg); else alert(msg); }

  async function schemaOk(){
    if(state.schemaDisponivel !== null) return state.schemaDisponivel;
    try{
      const {error}=await db().from('atlas_patrimonio_remessas').select('id').limit(1);
      state.schemaDisponivel=!error;
      return state.schemaDisponivel;
    }catch(e){ state.schemaDisponivel=false; return false; }
  }

  function mensagemSchema(){
    alert('O módulo de Remessas Patrimoniais está pronto, mas falta executar o SQL supabase/atlas_remessas_patrimonio.sql no Supabase. O Patrimônio normal continua funcionando.');
  }

  function opcoesObra(selected){
    return obras().map(o=>`<option value="${esc(o.id)}" ${String(o.id)===String(selected||'')?'selected':''}>${esc((o.codigo_obra?o.codigo_obra+' - ':'')+(o.nome||o.setor_obra||'Obra'))}</option>`).join('');
  }

  function gerarCodigo(){
    const d=new Date();
    const data=d.toISOString().slice(0,10).replaceAll('-','');
    const hora=String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+String(d.getSeconds()).padStart(2,'0');
    return `RP-${data}-${hora}`;
  }

  async function carregarRemessas(){
    if(state.carregando || !(await schemaOk())){ atualizarResumo(); return; }
    state.carregando=true;
    try{
      const {data,error}=await db().from('atlas_patrimonio_remessas').select('*').order('enviado_em',{ascending:false}).limit(200);
      if(error) throw error;
      state.remessas=data||[];
      atualizarResumo();
    }catch(e){ console.warn('Atlas Remessas: falha ao carregar',e.message||e); }
    finally{ state.carregando=false; }
  }

  function atualizarResumo(){
    const transito=state.remessas.filter(r=>r.status==='EM_TRANSITO');
    const recebidas=state.remessas.filter(r=>r.status==='RECEBIDA'||r.status==='RECEBIDA_DIVERGENCIA');
    const a=document.getElementById('atlasRemessaKpiTransito');
    const b=document.getElementById('atlasRemessaKpiItens');
    const c=document.getElementById('atlasRemessaKpiRecebidas');
    if(a)a.textContent=transito.length;
    if(b)b.textContent=transito.reduce((s,r)=>s+Number(r.total_itens||0),0);
    if(c)c.textContent=recebidas.length;
  }

  function moduloPatrimonio(){ return document.querySelector('.atlas-shell-module[data-module="patrimonio"]'); }

  function modoSelecaoAtivo(){ return !!state.modoSelecao; }
  function estaSelecionado(id){ return state.itensSelecionados.has(String(id)); }

  function patrimonioPorId(id){ return patrimonios().find(p=>String(p.id)===String(id)); }

  function atualizarSelecionados(){
    const qtd=state.itensSelecionados.size;
    const e=document.getElementById('atlasRemessaSelecionados');
    if(e)e.textContent=`${qtd} patrimônio(s) selecionado(s)`;
    const qtdTela=document.getElementById('atlasRemessaSelecaoQtd');
    if(qtdTela)qtdTela.textContent=`${qtd} selecionado${qtd===1?'':'s'}`;
    const btn=document.getElementById('atlasRemessaContinuarBtn');
    if(btn)btn.disabled=qtd===0;
    const ajuda=document.getElementById('atlasRemessaSelecaoAjuda');
    if(ajuda){
      ajuda.textContent=state.obraOrigemSelecao
        ? `Origem: ${obraNome(state.obraOrigemSelecao)}. Continue pesquisando e marcando itens desta mesma obra.`
        : 'Pesquise ou filtre normalmente e marque os patrimônios que serão enviados.';
    }
    document.querySelectorAll('.atlas-remessa-check').forEach(c=>{ c.checked=estaSelecionado(c.dataset.patId); });
  }

  function renderItensNova(){
    const box=document.getElementById('atlasRemessaListaItens');
    if(!box)return;
    const lista=patrimonios().filter(p=>estaSelecionado(p.id));
    if(!lista.length){
      box.innerHTML='<div class="atlas-remessa-empty">Nenhum patrimônio selecionado.</div>';
      atualizarSelecionados();
      return;
    }
    box.innerHTML=lista.map(p=>`<div class="atlas-remessa-item atlas-remessa-item-revisao">
      <span>✓</span>
      <strong>${esc(p.codigo_qr||'-')}</strong>
      <span>${esc(p.nome_bem||'-')}</span>
      <span class="atlas-remessa-item-local">${esc(p.localizacao||obraNome(p.obra_id))}</span>
      <span class="atlas-remessa-item-status">${esc(p.status||'-')}</span>
    </div>`).join('');
    atualizarSelecionados();
  }

  function limparSelecaoVisual(){
    state.itensSelecionados.clear();
    state.obraOrigemSelecao=null;
    document.querySelectorAll('.atlas-remessa-check,.atlas-remessa-pagina-check').forEach(c=>c.checked=false);
    atualizarSelecionados();
  }

  async function iniciarSelecao(){
    if(!podeMovimentar()){ alert('Você não tem permissão para movimentar patrimônios.'); return; }
    if(!(await schemaOk())) return mensagemSchema();
    limparSelecaoVisual();
    state.modoSelecao=true;
    moduloPatrimonio()?.classList.add('bdr-modo-selecao-remessa');
    document.body.classList.add('bdr-modo-selecao-remessa');
    const bar=document.getElementById('atlasRemessaSelecaoBar');
    if(bar)bar.hidden=false;
    api().renderizar?.();
    atualizarSelecionados();
    const busca=document.getElementById('patrimonioBusca');
    setTimeout(()=>{
      busca?.scrollIntoView({behavior:'smooth',block:'center'});
      busca?.focus({preventScroll:true});
    },80);
  }

  function selecionarItem(id,checked){
    const p=patrimonioPorId(id);
    if(!p)return;
    const status=texto(p.status).toUpperCase();
    if(checked && (p.ativo===false || status==='EM_TRANSITO')){
      aviso('Este patrimônio não está disponível para uma nova remessa.');
      document.querySelectorAll(`.atlas-remessa-check[data-pat-id="${CSS.escape(String(id))}"]`).forEach(c=>c.checked=false);
      return;
    }
    if(checked){
      if(state.obraOrigemSelecao && String(state.obraOrigemSelecao)!==String(p.obra_id)){
        aviso(`Uma remessa precisa sair de uma única obra. Os itens já selecionados são de ${obraNome(state.obraOrigemSelecao)}.`);
        document.querySelectorAll(`.atlas-remessa-check[data-pat-id="${CSS.escape(String(id))}"]`).forEach(c=>c.checked=false);
        return;
      }
      state.obraOrigemSelecao=p.obra_id;
      state.itensSelecionados.add(String(id));
    }else{
      state.itensSelecionados.delete(String(id));
      if(!state.itensSelecionados.size) state.obraOrigemSelecao=null;
    }
    atualizarSelecionados();
  }

  function alternarPorLinha(id){
    const novo=!estaSelecionado(id);
    selecionarItem(id,novo);
    document.querySelectorAll(`.atlas-remessa-check[data-pat-id="${CSS.escape(String(id))}"]`).forEach(c=>c.checked=estaSelecionado(id));
  }

  function selecionarPagina(marcado){
    const checks=[...document.querySelectorAll('.atlas-remessa-check')];
    if(!marcado){
      checks.forEach(c=>selecionarItem(c.dataset.patId,false));
      return;
    }
    checks.forEach(c=>selecionarItem(c.dataset.patId,true));
    const header=document.querySelector('.atlas-remessa-pagina-check');
    if(header) header.checked=checks.length>0 && checks.every(c=>c.checked);
  }

  function cancelarSelecao(){
    limparSelecaoVisual();
    state.modoSelecao=false;
    moduloPatrimonio()?.classList.remove('bdr-modo-selecao-remessa');
    document.body.classList.remove('bdr-modo-selecao-remessa');
    const bar=document.getElementById('atlasRemessaSelecaoBar');
    if(bar)bar.hidden=true;
    modal('atlasNovaRemessaModal',false);
    api().renderizar?.();
  }

  function prepararModal(){
    const origem=state.obraOrigemSelecao;
    document.getElementById('atlasRemessaCodigo').value=gerarCodigo();
    document.getElementById('atlasRemessaOrigem').innerHTML='<option value="">Origem definida pelos itens selecionados</option>'+opcoesObra(origem);
    document.getElementById('atlasRemessaOrigem').value=origem||'';
    document.getElementById('atlasRemessaDestino').innerHTML='<option value="">Selecione o destino</option>'+opcoesObra();
    document.getElementById('atlasRemessaMotorista').value='';
    document.getElementById('atlasRemessaVeiculo').value='';
    document.getElementById('atlasRemessaPlaca').value='';
    document.getElementById('atlasRemessaObs').value='';
    document.getElementById('atlasRemessaStatusDestino').value='MANTER';
    const destino=document.getElementById('atlasRemessaDestino');
    if(destino && origem){
      [...destino.options].forEach(opt=>{ if(String(opt.value)===String(origem)) opt.disabled=true; });
    }
    renderItensNova();
  }

  function continuarSelecao(){
    if(!state.itensSelecionados.size) return aviso('Selecione pelo menos um patrimônio para continuar.');
    const selecionados=patrimonios().filter(p=>estaSelecionado(p.id));
    const origens=[...new Set(selecionados.map(p=>String(p.obra_id||'')))].filter(Boolean);
    if(origens.length!==1) return aviso('Todos os patrimônios da remessa precisam sair da mesma obra.');
    state.obraOrigemSelecao=origens[0];
    prepararModal();
    modal('atlasNovaRemessaModal',true);
  }

  function voltarSelecao(){
    modal('atlasNovaRemessaModal',false);
    const busca=document.getElementById('patrimonioBusca');
    setTimeout(()=>busca?.focus(),40);
  }

  async function abrirNova(){ return iniciarSelecao(); }
  function origemMudou(){ /* compatibilidade: a origem agora é definida pela seleção na lista principal */ }

  async function notificarDestino(remessa){
    const gestor=window.AtlasGestorNotificacoes;
    if(!gestor?.buscarUsuariosEmpresa || !gestor?.notificarLista) return;
    try{
      const users=await gestor.buscarUsuariosEmpresa(remessa.empresa_id||empresaId());
      const log=usuario();
      const destinos=users.filter(u=>u?.ativo!==false && gestor.usuarioTemAcessoObra?.(u,remessa.obra_destino_id)).filter(u=>String(u.id)!==String(log.id));
      await gestor.notificarLista(destinos,{
        empresa_id:remessa.empresa_id||empresaId(),tipo:'PATRIMONIO_TRANSFERENCIA_EM_TRANSITO',titulo:'🚚 Patrimônios em trânsito',
        mensagem:`Remessa ${remessa.codigo}: ${remessa.total_itens} patrimônio(s) estão a caminho de ${remessa.obra_destino_nome||obraNome(remessa.obra_destino_id)}. Enviado por ${remessa.enviado_por_nome||'responsável'}.`,
        link:'atlas.html?m=patrimonio&remessas=transito',obra_origem_id:remessa.obra_origem_id,obra_destino_id:remessa.obra_destino_id
      });
    }catch(e){ console.warn('Atlas Remessas: notificação de destino não enviada',e.message||e); }
  }

  async function notificarOrigemRecebida(remessa){
    const gestor=window.AtlasGestorNotificacoes;
    if(!gestor?.criarNotificacao || !remessa.enviado_por_id) return;
    try{
      await gestor.criarNotificacao({
        usuario_destino_id:remessa.enviado_por_id,empresa_id:remessa.empresa_id||empresaId(),tipo:'PATRIMONIO_TRANSFERENCIA_RECEBIDA',titulo:'✅ Remessa patrimonial recebida',
        mensagem:`A remessa ${remessa.codigo} chegou em ${remessa.obra_destino_nome||obraNome(remessa.obra_destino_id)} e foi recebida por ${remessa.recebido_por_nome||'responsável'}.`,
        link:'atlas.html?m=patrimonio&remessas=historico',obra_origem_id:remessa.obra_origem_id,obra_destino_id:remessa.obra_destino_id
      });
    }catch(e){ console.warn('Atlas Remessas: notificação de origem não enviada',e.message||e); }
  }

  async function enviar(){
    if(!podeMovimentar()) return alert('Você não tem permissão para movimentar patrimônios.');
    const origem=texto(document.getElementById('atlasRemessaOrigem').value);
    const destino=texto(document.getElementById('atlasRemessaDestino').value);
    if(!origem||!destino) return alert('Selecione origem e destino.');
    if(origem===destino) return alert('Origem e destino precisam ser diferentes.');
    if(!state.itensSelecionados.size) return alert('Selecione pelo menos um patrimônio.');
    const itens=patrimonios().filter(p=>state.itensSelecionados.has(String(p.id))).map(p=>({patrimonio_id:Number(p.id)}));
    const u=usuario();
    const origemObj=obra(origem), destinoObj=obra(destino);
    const codigo=texto(document.getElementById('atlasRemessaCodigo').value)||gerarCodigo();
    const statusEscolhido=texto(document.getElementById('atlasRemessaStatusDestino').value);
    const statusDestino=statusEscolhido==='MANTER'?'':statusEscolhido;
    const payload={
      p_codigo:codigo,p_empresa_id:Number(origemObj?.empresa_id||u.empresa_id||17),p_obra_origem_id:Number(origem),p_obra_destino_id:Number(destino),
      p_obra_origem_nome:origemObj?.nome||origemObj?.setor_obra||obraNome(origem),p_obra_destino_nome:destinoObj?.nome||destinoObj?.setor_obra||obraNome(destino),
      p_status_destino:statusDestino,p_enviado_por_id:Number(u.id||u.usuario_id||0)||null,p_enviado_por_nome:u.nome||u.usuario||'Usuário não identificado',
      p_motorista:texto(document.getElementById('atlasRemessaMotorista').value),p_veiculo:texto(document.getElementById('atlasRemessaVeiculo').value),
      p_placa:texto(document.getElementById('atlasRemessaPlaca').value),p_observacao:texto(document.getElementById('atlasRemessaObs').value),p_itens:itens
    };
    const btn=document.getElementById('atlasBtnEnviarRemessa'); if(btn){btn.disabled=true;btn.textContent='Enviando...';}
    try{
      const {data,error}=await db().rpc('atlas_criar_remessa_patrimonial',payload);
      if(error)throw error;
      const remessa={id:data,codigo,empresa_id:payload.p_empresa_id,obra_origem_id:Number(origem),obra_destino_id:Number(destino),obra_origem_nome:payload.p_obra_origem_nome,obra_destino_nome:payload.p_obra_destino_nome,enviado_por_id:payload.p_enviado_por_id,enviado_por_nome:payload.p_enviado_por_nome,total_itens:itens.length,status:'EM_TRANSITO'};
      await notificarDestino(remessa);
      modal('atlasNovaRemessaModal',false);
      await api().recarregar?.();
      await carregarRemessas();
      cancelarSelecao();
      aviso(`Remessa ${codigo} criada. ${itens.length} patrimônio(s) agora estão em trânsito.`);
    }catch(e){ console.error(e); alert('Não foi possível criar a remessa: '+(e.message||e)); }
    finally{ if(btn){btn.disabled=false;btn.textContent='🚚 Colocar em trânsito';} }
  }

  async function abrirCentral(aba){
    if(!(await schemaOk())) return mensagemSchema();
    await carregarRemessas();
    renderCentral(aba||'transito');
    modal('atlasRemessasCentralModal',true);
  }

  function renderCentral(aba){
    const titulo=document.getElementById('atlasRemessasCentralTitulo');
    const box=document.getElementById('atlasRemessasCentralConteudo');
    const lista=state.remessas.filter(r=>aba==='transito'?r.status==='EM_TRANSITO':r.status!=='EM_TRANSITO');
    if(titulo) titulo.textContent=aba==='transito'?'🚚 Patrimônios em trânsito':'🕘 Histórico de remessas';
    if(!box)return;
    if(!lista.length){ box.innerHTML='<div class="atlas-remessa-empty">Nenhuma remessa encontrada nesta visão.</div>'; return; }
    box.innerHTML=`<table class="atlas-remessa-tabela"><thead><tr><th>Remessa</th><th>Origem → Destino</th><th>Itens</th><th>Enviado</th><th>Status</th><th></th></tr></thead><tbody>${lista.map(r=>`<tr>
      <td><span class="atlas-remessa-codigo">${esc(r.codigo)}</span><br><small>${esc(r.enviado_por_nome||'-')}</small></td>
      <td>${esc(r.obra_origem_nome||obraNome(r.obra_origem_id))} → ${esc(r.obra_destino_nome||obraNome(r.obra_destino_id))}</td>
      <td>${Number(r.total_itens||0)}</td><td>${esc(fmtData(r.enviado_em))}</td>
      <td><span class="atlas-remessa-status ${r.status==='RECEBIDA'?'recebida':''}">${esc(r.status)}</span></td>
      <td><button class="atlas-remessa-btn" onclick="AtlasPatrimonioRemessas.abrirDetalhe(${Number(r.id)})">Abrir</button></td>
    </tr>`).join('')}</tbody></table>`;
  }

  async function abrirDetalhe(id){
    const rem=state.remessas.find(r=>Number(r.id)===Number(id)); if(!rem)return;
    const {data:itens,error}=await db().from('atlas_patrimonio_remessa_itens').select('*').eq('remessa_id',id).order('id');
    if(error)return alert(error.message);
    document.getElementById('atlasRemessaDetalheTitulo').textContent=`${rem.codigo} • ${rem.status}`;
    const podeReceber=rem.status==='EM_TRANSITO' && podeMovimentar();
    document.getElementById('atlasRemessaDetalheConteudo').innerHTML=`
      <div class="atlas-remessa-grid"><div><label>Origem</label><strong>${esc(rem.obra_origem_nome||obraNome(rem.obra_origem_id))}</strong></div><div><label>Destino</label><strong>${esc(rem.obra_destino_nome||obraNome(rem.obra_destino_id))}</strong></div>
      <div><label>Enviado por</label><span>${esc(rem.enviado_por_nome||'-')} • ${esc(fmtData(rem.enviado_em))}</span></div><div><label>Transporte</label><span>${esc([rem.motorista,rem.veiculo,rem.placa].filter(Boolean).join(' • ')||'-')}</span></div></div>
      <div class="atlas-remessa-itens"><div class="atlas-remessa-lista-itens">${(itens||[]).map(i=>`<div class="atlas-remessa-item"><span>${i.recebido?'✅':'🚚'}</span><strong>${esc(i.codigo_qr||'-')}</strong><span>${esc(i.nome_bem||'-')}</span><span class="atlas-remessa-item-local">${esc(i.localizacao_destino||rem.obra_destino_nome||'-')}</span><span class="atlas-remessa-item-status">${esc(i.recebido?'RECEBIDO':'EM TRÂNSITO')}</span></div>`).join('')}</div></div>
      ${podeReceber?`<div class="atlas-remessa-localizacao"><input id="atlasRecebimentoLocalizacao" placeholder="Localização final opcional. Ex.: Alojamento > Bloco B > Quarto 204"><button class="atlas-remessa-btn success" onclick="AtlasPatrimonioRemessas.receber(${Number(rem.id)})">✅ Confirmar recebimento</button></div>`:''}`;
    modal('atlasRemessaDetalheModal',true);
  }

  async function receber(id){
    if(!confirm('Confirmar o recebimento desta remessa e transferir os patrimônios para a obra de destino?'))return;
    const u=usuario(); const local=texto(document.getElementById('atlasRecebimentoLocalizacao')?.value);
    try{
      const {data,error}=await db().rpc('atlas_receber_remessa_patrimonial',{p_remessa_id:Number(id),p_recebido_por_id:Number(u.id||u.usuario_id||0)||null,p_recebido_por_nome:u.nome||u.usuario||'Usuário não identificado',p_localizacao_destino:local||null});
      if(error)throw error;
      await carregarRemessas();
      const rem=state.remessas.find(r=>Number(r.id)===Number(id));
      if(rem){ rem.recebido_por_nome=u.nome||u.usuario; await notificarOrigemRecebida(rem); }
      modal('atlasRemessaDetalheModal',false); modal('atlasRemessasCentralModal',false);
      await api().recarregar?.();
      aviso(`Recebimento confirmado. ${Number(data||0)} patrimônio(s) transferido(s) para o destino.`);
    }catch(e){ console.error(e); alert('Não foi possível receber a remessa: '+(e.message||e)); }
  }

  async function abrirHistoricoPatrimonio(id){
    const p=patrimonios().find(x=>String(x.id)===String(id)); if(!p)return alert('Patrimônio não encontrado.');
    document.getElementById('atlasHistoricoPatrimonioTitulo').textContent=`🕘 Histórico • ${p.codigo_qr||p.nome_bem||'Patrimônio'}`;
    const box=document.getElementById('atlasHistoricoPatrimonioConteudo'); box.innerHTML='<div class="atlas-remessa-empty">Carregando histórico...</div>'; modal('atlasHistoricoPatrimonioModal',true);
    try{
      const [movRes,remRes]=await Promise.all([
        db().from('movimentacoes').select('*').eq('patrimonio_id',id).order('data_movimentacao',{ascending:false}).limit(300),
        schemaOk().then(ok=>ok?db().from('atlas_patrimonio_remessa_itens').select('*, atlas_patrimonio_remessas(*)').eq('patrimonio_id',id).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[]}))
      ]);
      if(movRes.error)throw movRes.error;
      const eventos=(movRes.data||[]).map(m=>({data:m.data_movimentacao||m.created_at,titulo:labelMov(m.tipo,m.status_novo),detalhe:[m.observacao,m.usuario?`Por: ${m.usuario}`:'',m.obra_origem_id||m.obra_destino_id?`${obraNome(m.obra_origem_id)} → ${obraNome(m.obra_destino_id)}`:''].filter(Boolean).join(' • ')}));
      if(!eventos.length && p.usuario_cadastro) eventos.push({data:p.created_at,titulo:'Patrimônio cadastrado',detalhe:`Cadastrado por ${p.usuario_cadastro}${p.localizacao?' • '+p.localizacao:''}`});
      box.innerHTML=`<div class="atlas-remessa-grid"><div><label>Status atual</label><strong>${esc(p.status||'-')}</strong></div><div><label>Localização atual</label><strong>${esc(p.endereco_estoque||p.localizacao||'-')}</strong></div></div>${eventos.length?`<div class="atlas-historico-timeline">${eventos.map(e=>`<div class="atlas-historico-evento"><div class="atlas-historico-data">${esc(fmtData(e.data))}</div><div class="atlas-historico-eixo"></div><div class="atlas-historico-box"><strong>${esc(e.titulo)}</strong><span>${esc(e.detalhe||'-')}</span></div></div>`).join('')}</div>`:'<div class="atlas-remessa-empty">Ainda não há movimentações registradas para este patrimônio.</div>'}`;
    }catch(e){ box.innerHTML=`<div class="atlas-remessa-empty">Falha ao carregar histórico: ${esc(e.message||e)}</div>`; }
  }

  function labelMov(tipo,status){
    const t=texto(tipo).toUpperCase();
    if(t.includes('REMESSA_PATRIMONIAL_ENVIO')) return '🚚 Enviado em remessa patrimonial';
    if(t.includes('REMESSA_PATRIMONIAL_RECEBIMENTO')) return '✅ Recebido em outra obra';
    if(t.includes('TROCA_SETOR')) return '🔁 Transferência de obra/setor';
    if(t.includes('MANUT')) return '🛠 Movimentação de manutenção';
    if(t.includes('CADAST')) return '📦 Cadastro';
    return `Movimentação${status?' → '+status:''}`;
  }

  function fechar(id){ modal(id,false); }
  function init(){ carregarRemessas(); const params=new URLSearchParams(location.search); if(params.get('remessas')) setTimeout(()=>abrirCentral(params.get('remessas')),250); }

  window.AtlasPatrimonioRemessas={__loaded:true,abrirNova,iniciarSelecao,cancelarSelecao,continuarSelecao,voltarSelecao,modoSelecaoAtivo,estaSelecionado,alternarPorLinha,selecionarPagina,fechar,renderItensNova,origemMudou,selecionarItem,enviar,abrirCentral,abrirDetalhe,receber,abrirHistoricoPatrimonio,carregar:carregarRemessas};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
  console.log('✅ ATLAS REMESSAS PATRIMONIAIS carregado - seleção direta na lista, trânsito, recebimento e histórico');
})();
