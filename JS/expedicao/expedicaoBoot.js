/* =========================================================
   ATLAS EXPEDIÇÃO — CARREGADOR DE MÓDULOS
========================================================= */
(function(global){
  'use strict';

  if(global.AtlasExpedicaoLoader?.__loaded) return;

  const carregados = new Map();

  const inicioBoot = performance.now();

  const base = {
    modal:['./JS/AtlasModal.js'],
    workflow:['./JS/atlasWorkflow.js'],
    reservas:['./JS/AtlasGestorReservas.js'],
    logistica:[
      './JS/AtlasModal.js',
      './JS/atlasWorkflow.js',
      './JS/AtlasLogistica.js'
    ],
    fiscal:[
      './JS/AtlasModal.js',
      './JS/atlasWorkflow.js',
      './JS/AtlasFiscal.js'
    ],
    scanner:[
      'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
      './JS/AtlasModal.js',
      './JS/atlasWorkflow.js',
      './JS/AtlasLogistica.js',
      './JS/AtlasFiscal.js',
      './JS/AtlasSeparacaoQR.js'
    ],
    visual:[
      './JS/bdrUppercase.js',
      './JS/AtlasMotion.js',
      './JS/bdrMenuMobileAtivo.js'
    ],
    pwa:['./JS/pwa-update.js'],
    infraBase:[
      './JS/offlineDB.js',
      './JS/offlineQueue.js',
      './JS/atlasEvents.js'
    ],
    infraSync:[
      './JS/bdrSyncEngine.js',
      './JS/bdrSyncCenter.js'
    ],
    infraNotif:[
      './JS/atlasEventStore.js',
      './JS/atlasGestorNotificacoes.js',
      './JS/atlasAudio/atlasAudio.js'
    ]
  };

  function carregarScript(src){
    if(carregados.has(src)) return carregados.get(src);

    const urlCompleta = new URL(src,location.href).href;
    const existente = [...document.scripts].find(s=>s.src===urlCompleta);

    if(existente){
      const p = Promise.resolve(src);
      carregados.set(src,p);
      return p;
    }

    const p = new Promise((resolve,reject)=>{
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = ()=>resolve(src);
      s.onerror = ()=>{
        carregados.delete(src);
        reject(new Error('Falha ao carregar '+src));
      };
      document.head.appendChild(s);
    });

    carregados.set(src,p);
    return p;
  }

  async function modulo(nome){
    const lista = base[nome] || [];
    for(const src of lista) await carregarScript(src);
    return true;
  }

  function esconderLoading(){
    const el=document.getElementById('atlasExpedicaoLoading');
    if(el){
      el.classList.add('oculto');
      setTimeout(()=>el.remove(),250);
    }
  }

  async function prepararAba(nome){
    if(nome==='solicitacoes') await modulo('fiscal');
    if(nome==='separacao') await modulo('scanner');
    if(nome==='retirada'||nome==='transito') await modulo('logistica');
    return true;
  }

  function instalarAbaLazy(){
    const original=global.abrirAba;
    if(typeof original!=='function') return;

    global.abrirAba=async function(nome,btn){
      try{
        await prepararAba(nome);
      }catch(e){
        console.error(e);
        try{
          await modulo('modal');
          global.AtlasModal?.erro?.(
            'Não foi possível carregar esta etapa: '+(e?.message||e)
          );
        }catch(_){}
        return false;
      }

      return original(nome,btn);
    };
  }

  function instalarAcoesLazy(){
    const mapa={
      iniciarSeparacaoAtlas:'scanner',
      abrirSeparacaoQR:'scanner',
      finalizarSeparacaoAtlas:'logistica',
      enviarPedidoAtlas:'logistica',
      receberPedidoAtlas:'logistica',
      abrirDadosFiscais:'fiscal',
      autorizarTodosAtlas:'fiscal',
      confirmarAprovacaoParcialAtlas:'fiscal',
      recusarTodosAtlas:'workflow'
    };

    Object.entries(mapa).forEach(([nome,mod])=>{
      let tentativas=0;

      const t=setInterval(()=>{
        tentativas++;

        const original=global[nome];

        if(typeof original==='function'&&!original.__lazy){
          const fn=async function(...args){
            try{
              await modulo(mod);
              return await original.apply(this,args);
            }catch(e){
              console.error('Falha na ação '+nome,e);
              try{
                await modulo('modal');
                global.AtlasModal?.erro?.(e?.message||String(e));
              }catch(_){}
              return false;
            }
          };

          fn.__lazy=true;
          fn.__original=original;
          global[nome]=fn;
          clearInterval(t);
        }else if(tentativas>60){
          clearInterval(t);
        }
      },100);
    });
  }

  async function carregarInfraBackground(){
    // Infraestrutura importante, mas não bloqueia a primeira pintura da Expedição.
    // A ordem é preservada para respeitar dependências entre offline/sync/eventos.
    try{
      await modulo('infraBase');
      await Promise.allSettled([modulo('infraSync'),modulo('infraNotif')]);
      console.info(`⚡ ATLAS EXPEDIÇÃO infraestrutura pronta em ${Math.round(performance.now()-inicioBoot)} ms`);
    }catch(e){
      console.warn('Expedição: infraestrutura em segundo plano',e?.message||e);
    }
  }

  async function iniciar(){
    try{
      if(typeof global.verificarLogin==='function') global.verificarLogin();

      await carregarScript('./JS/expedicao/expedicaoCatalogo.js');
      await carregarScript('./JS/expedicao/expedicaoPedidos.js');
      await carregarScript('./JS/expedicao/expedicaoCore.js');

      // Fluxos especializados: substituem as antigas camadas empilhadas no Core.
      await carregarScript('./JS/expedicao/fluxo/expedicaoAprovacao.js');
      await carregarScript('./JS/expedicao/fluxo/expedicaoSolicitacoes.js');
      await carregarScript('./JS/expedicao/fluxo/expedicaoLogistica.js');
      await carregarScript('./JS/expedicao/fluxo/expedicaoFiscal.js');
      await carregarScript('./JS/expedicao/fluxo/expedicaoPermissoes.js');

      // Só agora a primeira consulta de dados é iniciada.
      global.BDRExpedicao?.iniciar?.();

      instalarAbaLazy();
      instalarAcoesLazy();
      esconderLoading();

      // A interface já está utilizável. O restante da infraestrutura entra sem bloquear.
      void carregarInfraBackground();

      const aba=new URLSearchParams(location.search).get('aba');

      if(aba){
        const btn=[...document.querySelectorAll('.tab-btn')]
          .find(b=>(b.getAttribute('onclick')||'').includes("'"+aba+"'"));

        await global.abrirAba?.(aba,btn||null);
      }

      const idle=global.requestIdleCallback||((fn)=>setTimeout(fn,800));
      idle(()=>modulo('visual').catch(console.warn));
      idle(()=>modulo('pwa').catch(console.warn));

      console.log(
        `✅ ATLAS EXPEDIÇÃO interface pronta em ${Math.round(performance.now()-inicioBoot)} ms — dados progressivos`
      );
    }catch(e){
      esconderLoading();
      console.error('Atlas Expedição Nova: falha na inicialização',e);

      try{
        await modulo('modal');
        global.AtlasModal?.erro?.(
          'Não foi possível abrir a Expedição: '+(e?.message||e)
        );
      }catch(_){}
    }
  }

  global.AtlasExpedicaoLoader={
    __loaded:true,
    modulo,
    prepararAba,
    iniciar
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',iniciar,{once:true});
  }else{
    iniciar();
  }
})(window);
