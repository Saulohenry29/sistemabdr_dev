/* =========================================================
   ATLAS PREFERÊNCIAS DE NOTIFICAÇÃO V1.0
   Usa a coluna existente usuarios_sistema.permissoes.
   Não exige alteração no banco de dados.
========================================================= */
(function(){
  'use strict';
  if(window.AtlasPreferenciasNotificacoes?.__loaded) return;

  const MODULOS = [
    { id:'PATRIMONIO', titulo:'📦 Patrimônio', itens:[
      ['NOTIF_PATRIMONIO_CRIACAO','Criação de patrimônio'],
      ['NOTIF_PATRIMONIO_ETIQUETA','Impressão de etiqueta'],
      ['NOTIF_PATRIMONIO_MOVIMENTACAO','Movimentação'],
      ['NOTIF_PATRIMONIO_STATUS','Excluir, inativar e reativar']
    ]},
    { id:'EXPEDICAO', titulo:'🚚 Expedição', itens:[
      ['NOTIF_EXPEDICAO_PEDIDOS','Novo pedido'],
      ['NOTIF_EXPEDICAO_APROVACAO','Aprovação ou recusa'],
      ['NOTIF_EXPEDICAO_SEPARACAO','Separação'],
      ['NOTIF_EXPEDICAO_TRANSPORTE','Retirada e em trânsito'],
      ['NOTIF_EXPEDICAO_RECEBIMENTO','Recebimento e divergência']
    ]},
    { id:'ESTOQUE', titulo:'📚 Estoque', itens:[
      ['NOTIF_ESTOQUE_MOVIMENTACAO','Entradas e saídas'],
      ['NOTIF_ESTOQUE_BAIXO','Estoque baixo']
    ]},
    { id:'INVENTARIO', titulo:'📋 Inventário', itens:[
      ['NOTIF_INVENTARIO_ANDAMENTO','Andamento e divergências'],
      ['NOTIF_INVENTARIO_FINALIZADO','Inventário finalizado']
    ]}
  ];

  const q = (s,ctx=document)=>ctx.querySelector(s);
  const qa = (s,ctx=document)=>[...ctx.querySelectorAll(s)];

  function htmlModulo(m){
    return `<section class="atlas-notif-modulo" data-modulo="${m.id}">
      <div class="atlas-notif-modulo-top">
        <strong>${m.titulo}</strong>
        <label class="switch" title="Ativar todas as notificações deste módulo">
          <input type="checkbox" class="perm atlas-notif-master" value="NOTIF_${m.id}">
          <span class="slider"></span>
        </label>
      </div>
      <div class="atlas-notif-filhos">
        ${m.itens.map(([valor,rotulo])=>`<label class="atlas-notif-opcao"><input type="checkbox" class="perm atlas-notif-filho" value="${valor}"><span>${rotulo}</span></label>`).join('')}
      </div>
    </section>`;
  }

  function montar(){
    if(q('#atlasPreferenciasNotificacoes')) return;
    const geral=q('.perm[value="RECEBER_NOTIFICACOES"]');
    if(!geral) return;
    const painel=geral.closest('.panel');
    const corpo=painel?.querySelector('.panel-body');
    if(!corpo) return;

    const card=document.createElement('div');
    card.id='atlasPreferenciasNotificacoes';
    card.className='atlas-notif-pref-card';
    card.innerHTML=`
      <div class="atlas-notif-pref-head"><div><b>🔔 Preferências de notificações</b><span>Escolha exatamente o que este usuário deve receber.</span></div></div>
      <div class="atlas-notif-pref-body">
        ${MODULOS.map(htmlModulo).join('')}
        <section class="atlas-notif-modulo">
          <div class="atlas-notif-modulo-top"><strong>🔊 Modo de aviso</strong></div>
          <div class="atlas-notif-filhos atlas-notif-modo">
            <label><input type="radio" class="perm" name="atlasModoNotif" value="NOTIF_MODO_SOM"> Som + notificação</label>
            <label><input type="radio" class="perm" name="atlasModoNotif" value="NOTIF_MODO_VISUAL"> Apenas notificação</label>
            <label><input type="radio" class="perm" name="atlasModoNotif" value="NOTIF_MODO_SILENCIOSO"> Silencioso</label>
          </div>
        </section>
      </div>`;
    corpo.appendChild(card);

    geral.addEventListener('change',sincronizarEstado);
    card.addEventListener('change',e=>{
      const modulo=e.target.closest('[data-modulo]');
      if(e.target.classList.contains('atlas-notif-master') && modulo){
        qa('.atlas-notif-filho',modulo).forEach(c=>c.checked=e.target.checked);
      }
      if(e.target.classList.contains('atlas-notif-filho') && modulo){
        const filhos=qa('.atlas-notif-filho',modulo);
        q('.atlas-notif-master',modulo).checked=filhos.length>0 && filhos.every(c=>c.checked);
      }
      if(typeof window.atualizarResumo==='function') window.atualizarResumo();
    });

    const obs=new MutationObserver(()=>setTimeout(sincronizarDaSelecao,0));
    obs.observe(card,{subtree:true,attributes:true,attributeFilter:['checked']});
    document.addEventListener('click',e=>{
      if(e.target.closest('[onclick*="selecionarUsuario"], .tr')) setTimeout(sincronizarDaSelecao,50);
    });
    sincronizarDaSelecao();
  }

  function sincronizarDaSelecao(){
    const geral=q('.perm[value="RECEBER_NOTIFICACOES"]');
    if(!geral) return;
    MODULOS.forEach(m=>{
      const box=q(`[data-modulo="${m.id}"]`);
      if(!box) return;
      const filhos=qa('.atlas-notif-filho',box);
      const master=q('.atlas-notif-master',box);
      // Compatibilidade: permissão antiga sem detalhes = módulo inteiro habilitado.
      if(geral.checked && !master.checked && filhos.every(c=>!c.checked)){
        // Não marca visualmente automaticamente para não alterar permissões sem salvar.
      }else if(filhos.length){
        master.checked=master.checked || filhos.every(c=>c.checked);
      }
    });
    const modos=qa('input[name="atlasModoNotif"]');
    if(geral.checked && !modos.some(r=>r.checked)){
      q('input[value="NOTIF_MODO_SOM"]')?.setAttribute('data-legado','1');
    }
    sincronizarEstado();
  }

  function sincronizarEstado(){
    const ligado=!!q('.perm[value="RECEBER_NOTIFICACOES"]')?.checked;
    q('#atlasPreferenciasNotificacoes')?.classList.toggle('atlas-notif-desabilitado',!ligado);
  }

  window.AtlasPreferenciasNotificacoes={__loaded:true,versao:'1.0',montar,sincronizar:sincronizarDaSelecao};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(montar,100));
  void 0;
})();
