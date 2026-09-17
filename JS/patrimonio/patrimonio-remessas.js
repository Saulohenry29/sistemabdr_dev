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
      aviso('Este patrimônio não está disponível para uma nova transferência.');
      document.querySelectorAll(`.atlas-remessa-check[data-pat-id="${CSS.escape(String(id))}"]`).forEach(c=>c.checked=false);
      return;
    }
    if(checked){
      if(state.obraOrigemSelecao && String(state.obraOrigemSelecao)!==String(p.obra_id)){
        aviso(`Uma transferência precisa sair de uma única obra. Os itens já selecionados são de ${obraNome(state.obraOrigemSelecao)}.`);
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
    if(origens.length!==1) return aviso('Todos os patrimônios da transferência precisam sair da mesma obra.');
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

  function permissoesDoUsuarioRemessa(u){
    return texto(u?.permissoes).split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
  }

  async function buscarDestinatariosRemessa(remessa, gestor){
    const log=usuario();
    const destinoId=String(remessa.obra_destino_id||'');
    const filtrar=(lista)=>{
      const base=(lista||[])
        .filter(u=>u?.ativo!==false)
        .filter(u=>String(u.id)!==String(log.id))
        .filter(u=>gestor.usuarioTemAcessoObra?.(u,remessa.obra_destino_id));
      const operadores=base.filter(u=>{
        const p=permissoesDoUsuarioRemessa(u);
        return Number(u.id)===1 || p.includes('PATRIMONIO_MOVIMENTAR') || p.includes('PATRIMONIO_VER');
      });
      return operadores.length?operadores:base;
    };

    let users=await gestor.buscarUsuariosEmpresa(remessa.empresa_id||empresaId());
    let destinos=filtrar(users);

    // Se a empresa_id estiver antiga/inconsistente no cadastro do usuário,
    // não deixa uma remessa real chegar sem avisar a obra de destino.
    if(!destinos.length){
      const {data,error}=await db().from('usuarios_sistema')
        .select('id,nome,usuario,email,empresa_id,obra_id,perfil,cargo,ativo,permissoes,obras_liberadas')
        .eq('ativo',true);
      if(error) throw error;
      destinos=filtrar(data||[]);
    }

    return destinos;
  }

  async function notificarDestino(remessa){
    const gestor=window.AtlasGestorNotificacoes;
    if(!gestor?.buscarUsuariosEmpresa || !gestor?.notificarLista) return 0;
    try{
      const destinos=await buscarDestinatariosRemessa(remessa,gestor);
      if(!destinos.length){
        console.warn('Atlas Remessas: nenhuma pessoa da obra de destino foi encontrada para receber o aviso.', remessa.obra_destino_id);
        return 0;
      }

      const payload={
        empresa_id:remessa.empresa_id||empresaId(),tipo:'PATRIMONIO_TRANSFERENCIA_EM_TRANSITO',titulo:'🚚 Patrimônios em trânsito',
        mensagem:`Remessa ${remessa.codigo}: ${remessa.total_itens} patrimônio(s) estão a caminho de ${remessa.obra_destino_nome||obraNome(remessa.obra_destino_id)}. Enviado por ${remessa.enviado_por_nome||'responsável'}.`,
        link:'atlas.html?m=patrimonio&remessas=transito',obra_origem_id:remessa.obra_origem_id,obra_destino_id:remessa.obra_destino_id
      };

      let total=await gestor.notificarLista(destinos,payload);

      /*
       * Remessa em trânsito é aviso operacional de recebimento.
       * Se a configuração antiga do usuário não tiver RECEBER_NOTIFICACOES,
       * o Gestor pode devolver zero. Nesse caso registramos o aviso somente
       * para pessoas da própria obra de destino que podem ver/movimentar
       * Patrimônio. Não vira aviso global e não notifica o remetente.
       */
      if(!total){
        const elegiveis=destinos.filter(u=>{
          const p=permissoesDoUsuarioRemessa(u);
          return Number(u.id)===1 || p.includes('PATRIMONIO_MOVIMENTAR') || p.includes('PATRIMONIO_VER');
        });
        if(elegiveis.length){
          const agora=new Date().toISOString();
          const rows=elegiveis.map(u=>({
            empresa_id:u.empresa_id||payload.empresa_id,
            usuario_destino_id:u.id,
            tipo:payload.tipo,
            titulo:payload.titulo,
            mensagem:payload.mensagem,
            link:payload.link,
            lida:false,status:'NAO_LIDA',
            pedido_id:null,
            obra_origem_id:payload.obra_origem_id||null,
            obra_destino_id:payload.obra_destino_id||null,
            patrimonio_id:null,produto_id:null,created_at:agora
          }));
          const {error}=await db().from('notificacoes').insert(rows);
          if(error) throw error;
          total=rows.length;
          document.dispatchEvent(new CustomEvent('atlas:notificacoes:atualizar'));
        }
      }

      console.info(`Atlas Remessas: ${total||0} destinatário(s) avisado(s) na obra de destino.`);
      return total||0;
    }catch(e){ console.warn('Atlas Remessas: notificação de destino não enviada',e.message||e); return 0; }
  }

  async function notificarOrigemRecebida(remessa){
    const gestor=window.AtlasGestorNotificacoes;
    if(!gestor?.criarNotificacao || !remessa.enviado_por_id) return;
    try{
      await gestor.criarNotificacao({
        usuario_destino_id:remessa.enviado_por_id,empresa_id:remessa.empresa_id||empresaId(),tipo:'PATRIMONIO_TRANSFERENCIA_RECEBIDA',titulo:'✅ Transferência patrimonial recebida',
        mensagem:`A remessa ${remessa.codigo} chegou em ${remessa.obra_destino_nome||obraNome(remessa.obra_destino_id)} e foi recebida por ${remessa.recebido_por_nome||'responsável'}.`,
        link:'atlas.html?m=patrimonio&remessas=historico',obra_origem_id:remessa.obra_origem_id,obra_destino_id:remessa.obra_destino_id
      });
    }catch(e){ console.warn('Atlas Remessas: notificação de origem não enviada',e.message||e); }
  }


  async function notificarExpedicao(remessa){
    try{
      const cli=db(); if(!cli)return 0;
      const {data:usuarios,error}=await cli.from('usuarios').select('id,nome,obra_id,obras_liberadas,permissoes,ativo,empresa_id').eq('ativo',true);
      if(error) throw error;
      const origem=String(remessa.obra_origem_id||'');
      const destinos=(usuarios||[]).filter(x=>{
        if(Number(x.id)===Number(remessa.enviado_por_id)) return false;
        const obras=[x.obra_id,...String(x.obras_liberadas||'').split(',')].map(v=>String(v||'').trim()).filter(Boolean);
        const perms=Array.isArray(x.permissoes)?x.permissoes:String(x.permissoes||'').split(',').map(v=>v.trim());
        return obras.includes(origem) && (perms.includes('EXPEDICAO_VER')||perms.includes('EXPEDICAO_ENTREGAR')||perms.includes('MASTER'));
      });
      if(!destinos.length)return 0;
      const rows=destinos.map(x=>({usuario_destino_id:x.id,empresa_id:remessa.empresa_id||empresaId(),tipo:'TRANSFERENCIA_AGUARDANDO_EXPEDICAO',titulo:'↔ Transferência aguardando expedição',mensagem:`${remessa.codigo}: ${remessa.total_itens||0} patrimônio(s) de ${remessa.obra_origem_nome||'origem'} para ${remessa.obra_destino_nome||'destino'}.`,link:'atlas.html?m=expedicao&aba=transferencias',lida:false}));
      const {error:err}=await cli.from('notificacoes').insert(rows); if(err)throw err;
      document.dispatchEvent(new CustomEvent('atlas:notificacoes:atualizar'));
      return rows.length;
    }catch(e){console.warn('Atlas Transferência: notificação da Expedição não enviada',e?.message||e);return 0;}
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
      const remessa={id:data,codigo,empresa_id:payload.p_empresa_id,obra_origem_id:Number(origem),obra_destino_id:Number(destino),obra_origem_nome:payload.p_obra_origem_nome,obra_destino_nome:payload.p_obra_destino_nome,enviado_por_id:payload.p_enviado_por_id,enviado_por_nome:payload.p_enviado_por_nome,total_itens:itens.length,status:'AGUARDANDO_EXPEDICAO'};
      await notificarExpedicao(remessa);
      modal('atlasNovaRemessaModal',false);
      await api().recarregar?.();
      await carregarRemessas();
      cancelarSelecao();
      aviso(`Transferência ${codigo} encaminhada para a Expedição com ${itens.length} patrimônio(s).`);
    }catch(e){ console.error(e); alert('Não foi possível criar a remessa: '+(e.message||e)); }
    finally{ if(btn){btn.disabled=false;btn.textContent='↔ Enviar para Expedição';} }
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
    const p=patrimonios().find(x=>String(x.id)===String(id));
    if(!p)return alert('Patrimônio não encontrado.');

    document.getElementById('atlasHistoricoPatrimonioTitulo').textContent=`🕘 Histórico • ${p.codigo_qr||p.nome_bem||'Patrimônio'}`;
    const box=document.getElementById('atlasHistoricoPatrimonioConteudo');
    box.innerHTML='<div class="atlas-remessa-empty">Carregando vida funcional do patrimônio...</div>';
    modal('atlasHistoricoPatrimonioModal',true);

    const add=(lista,data,titulo,detalhes=[],ordem=0)=>{
      const textoDetalhe=(detalhes||[]).filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='').join(' • ');
      lista.push({data:data||null,titulo,detalhe:textoDetalhe,ordem});
    };
    const campo=(rotulo,valor)=>valor!==null&&valor!==undefined&&String(valor).trim()!==''?`${rotulo}: ${valor}`:'';
    const moeda=v=>Number(v||0)>0?Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'';

    try{
      const remPromise=schemaOk().then(ok=>ok
        ? db().from('atlas_patrimonio_remessa_itens').select('*, atlas_patrimonio_remessas(*)').eq('patrimonio_id',id).order('created_at',{ascending:false}).limit(100)
        : Promise.resolve({data:[],error:null}));

      const [movRes,remRes,manRes]=await Promise.all([
        db().from('movimentacoes').select('*').eq('patrimonio_id',id).order('data_movimentacao',{ascending:false}).limit(500),
        remPromise,
        db().from('manutencoes_patrimonio').select('*').eq('patrimonio_id',id).order('id',{ascending:false}).limit(300)
      ]);

      if(movRes.error)throw movRes.error;
      if(manRes.error)throw manRes.error;

      const eventos=[];

      // O cadastro faz parte da vida funcional mesmo quando já existem movimentações posteriores.
      add(eventos,p.created_at||p.data_cadastro,'📦 Patrimônio cadastrado',[
        campo('Por',p.usuario_cadastro),campo('Obra',p.localizacao),campo('Origem',p.origem_cadastro),campo('Status inicial',p.status)
      ],10);

      (movRes.data||[]).forEach(m=>add(eventos,m.data_movimentacao||m.created_at,labelMov(m.tipo,m.status_novo),[
        m.observacao,
        campo('Por',m.usuario||m.usuario_nome||m.responsavel),
        (m.obra_origem_id||m.obra_destino_id)?`${obraNome(m.obra_origem_id)} → ${obraNome(m.obra_destino_id)}`:'',
        campo('Status',m.status_novo)
      ],20));

      // Transferências/remessas eram consultadas anteriormente, mas não eram exibidas na timeline.
      (remRes.data||[]).forEach(i=>{
        const r=i.atlas_patrimonio_remessas||{};
        add(eventos,r.enviado_em||i.created_at,'🚚 Transferência patrimonial enviada',[
          campo('Remessa',r.codigo),`${r.obra_origem_nome||obraNome(r.obra_origem_id)} → ${r.obra_destino_nome||obraNome(r.obra_destino_id)}`,
          campo('Motorista',r.motorista),campo('Placa',r.placa),campo('Enviado por',r.enviado_por_nome)
        ],30);
        if(i.recebido||r.recebido_em){
          add(eventos,r.recebido_em||i.recebido_em||i.atualizado_em,'✅ Transferência recebida',[
            campo('Remessa',r.codigo),campo('Recebido por',r.recebido_por_nome||i.recebido_por_nome),campo('Destino',r.obra_destino_nome||obraNome(r.obra_destino_id)),campo('Localização',i.localizacao_destino)
          ],31);
        }
      });

      (manRes.data||[]).forEach(m=>{
        const codigo=m.codigo||`MAN-${m.id}`;
        add(eventos,m.data_criacao||m.data_entrada||m.created_at,`🔧 ${codigo} • Manutenção aberta`,[
          campo('Lote',m.lote_codigo),campo('Motivo/defeito',m.motivo),campo('Tipo',m.tipo_manutencao),campo('Destino',m.tipo_execucao),
          campo('Fornecedor',m.fornecedor_nome||m.fornecedor),campo('Responsável/técnico',m.responsavel_servico),campo('Motorista',m.motorista_saida),campo('Placa',m.placa_saida)
        ],40);
        if(m.data_saida_manutencao) add(eventos,m.data_saida_manutencao,`🚚 ${codigo} • Encaminhado para manutenção`,[
          campo('Lote',m.lote_codigo),campo('Fornecedor',m.fornecedor_nome||m.fornecedor),campo('Motorista',m.motorista_saida),campo('Placa',m.placa_saida)
        ],41);
        if(m.diagnostico_interno||m.servico_executado||m.materiais_utilizados||m.data_execucao_servico){
          add(eventos,m.data_execucao_servico||m.updated_at,`🛠 ${codigo} • Serviço executado`,[
            campo('Lote',m.lote_codigo),campo('Diagnóstico',m.diagnostico_interno),campo('Serviço',m.servico_executado),campo('Materiais/peças',m.materiais_utilizados),
            campo('Executor',m.responsavel_servico),campo('Peças',moeda(m.custo_pecas_interno)),campo('Mão de obra',moeda(m.custo_mao_obra_interno)),campo('Custo total',moeda(m.custo_total_interno||m.valor_orcamento))
          ],42);
        }
        const encerrada=['CONCLUIDA','CONCLUIDO','FINALIZADA','FINALIZADO','RECEBIDO','ENCERRADA','ENCERRADO'].includes(String(m.status||'').toUpperCase());
        if(m.data_saida||m.data_retorno||m.recebido_em||encerrada){
          add(eventos,m.recebido_em||m.data_retorno||m.data_saida||m.updated_at,`✅ ${codigo} • Retorno / conclusão`,[
            campo('Lote',m.lote_codigo),campo('Status',m.status),campo('Recebido por',m.recebido_por_nome||m.recebido_por),
            campo('Resultado',m.resultado_conferencia||m.resultado_recebimento),campo('Divergência',m.divergencia||m.observacao_divergencia),campo('Motivo sem conserto',m.motivo_sem_conserto),campo('Custo',moeda(m.custo_total_interno||m.valor_orcamento))
          ],43);
        }
      });

      const vistos=new Set();
      const ordenados=eventos.filter(e=>{
        const chave=[e.data,e.titulo,e.detalhe].join('|');
        if(vistos.has(chave))return false; vistos.add(chave); return true;
      }).sort((a,b)=>{
        const da=a.data?new Date(a.data).getTime():0, dbb=b.data?new Date(b.data).getTime():0;
        return (dbb-da)||(b.ordem-a.ordem);
      });

      const mans=manRes.data||[];
      const lotes=new Set(mans.map(m=>m.lote_codigo).filter(Boolean));
      const custoTotal=mans.reduce((s,m)=>s+Number(m.custo_total_interno||m.valor_orcamento||0),0);
      box.innerHTML=`
        <div class="atlas-historico-resumo">
          <div><label>Status atual</label><strong>${esc(p.status||'-')}</strong></div>
          <div><label>Obra / localização</label><strong>${esc(p.endereco_estoque||p.localizacao||'-')}</strong></div>
          <div><label>Manutenções</label><strong>${mans.length}${lotes.size?` • ${lotes.size} lote(s)`:''}</strong></div>
          <div><label>Custo de manutenção registrado</label><strong>${esc(moeda(custoTotal)||'R$ 0,00')}</strong></div>
        </div>
        ${ordenados.length?`<div class="atlas-historico-timeline">${ordenados.map(e=>`<div class="atlas-historico-evento"><div class="atlas-historico-data">${esc(e.data?fmtData(e.data):'Data não registrada')}</div><div class="atlas-historico-eixo"></div><div class="atlas-historico-box"><strong>${esc(e.titulo)}</strong><span>${esc(e.detalhe||'Sem detalhes adicionais registrados.')}</span></div></div>`).join('')}</div>`:'<div class="atlas-remessa-empty">Ainda não há eventos registrados para este patrimônio.</div>'}`;
    }catch(e){
      console.error('Falha ao carregar histórico patrimonial',e);
      box.innerHTML=`<div class="atlas-remessa-empty">Falha ao carregar histórico: ${esc(e.message||e)}</div>`;
    }
  }

  function labelMov(tipo,status){
    const t=texto(tipo).toUpperCase();
    if(t.includes('REMESSA_PATRIMONIAL_ENVIO')) return '↔ Enviado em transferência patrimonial';
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
