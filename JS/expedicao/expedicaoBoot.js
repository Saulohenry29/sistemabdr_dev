/* =========================================================
   ATLAS EXPEDIÇÃO NOVA — CARREGADOR DE MÓDULOS V1.2
========================================================= */
(function(global){
  'use strict';

  if(global.AtlasExpedicaoLoader?.__loaded) return;

  const carregados = new Map();

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
      './JS/AtlasLogistica.js',
      './JS/AtlasFiscal.js',
      './JS/AtlasRomaneio.js?v=20261113-romaneio-cadastro-03'
    ],
    scanner:[
      'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
      './JS/AtlasModal.js',
      './JS/atlasWorkflow.js',
      './JS/AtlasLogistica.js',
      './JS/AtlasFiscal.js',
      './JS/AtlasRomaneio.js?v=20261113-romaneio-cadastro-03',
      './JS/AtlasSeparacaoQR.js'
    ],
    visual:[
      './JS/bdrUppercase.js',
      './JS/AtlasMotion.js',
      './JS/bdrMenuMobileAtivo.js',
      './JS/atlasTopbar.js'
    ],
    pwa:['./JS/pwa-update.js']
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
    if(nome==='retirada'||nome==='transito'||nome==='receber') await modulo('logistica');
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
      finalizarSeparacaoAtlas:'fiscal',
      enviarPedidoAtlas:'logistica',
      receberPedidoAtlas:'logistica',
      confirmarRecebimentoAtlas:'logistica',
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

  // Avisa sobre NF-e antes de o operador preencher o transporte.
  // Não modifica a exigência fiscal nem substitui a validação do AtlasLogistica.
  function instalarAvisoFiscalAntesDoEnvio(){
    const original=global.abrirRetirada;
    if(typeof original!=='function'||original.__atlasFiscalEnvioAviso)return;
    const consultarBanco=()=>global.client||global.supabaseClient||global.clientSupabase||globalThis.client;
    const wrapper=async function(pedidoId,...args){
      const resultado=await original.apply(this,[pedidoId,...args]);
      const id=Number(pedidoId);
      if(!Number.isSafeInteger(id)||id<=0)return resultado;
      const modal=document.getElementById('modalRetirada');
      if(!modal?.classList.contains('ativo'))return resultado;
      const btn=modal.querySelector('button[onclick*="confirmarRetiradaModal"]');
      const resumo=document.getElementById('retResumoTransporte');
      try{
        const {data,error}=await consultarBanco().from('pedidos_retirada')
          .select('id,exige_nfe,status_fiscal').eq('id',id).single();
        if(error)throw error;
        if(!modal.classList.contains('ativo')||Number(global.pedidoRetiradaAtual)!==id)return resultado;
        const bloqueado=data.exige_nfe===true&&String(data.status_fiscal||'').toUpperCase()!=='NFE_EMITIDA';
        if(btn){btn.disabled=bloqueado;btn.title=bloqueado?'Aguardando registro fiscal da NF-e':'';}
        if(bloqueado && resumo){
          resumo.style.display='block';
          resumo.style.background='#fff7ed';resumo.style.borderColor='#fdba74';resumo.style.color='#9a3412';
          resumo.innerHTML='<b>🧾 Falta registrar a NF-e</b><p style="margin:6px 0 10px">A emissão foi marcada como obrigatória. Regularize com o responsável Fiscal antes de confirmar a saída.</p>'+
            '<button type="button" id="atlasIrFiscalDoEnvio" style="cursor:pointer;background:#fff;color:#9a3412;border:1px solid #fdba74;border-radius:8px;padding:8px 11px;font-weight:900">Abrir registro de NF-e</button>';
          resumo.querySelector('#atlasIrFiscalDoEnvio')?.addEventListener('click',async()=>{
            try{
              await modulo('fiscal');
              if(typeof global.abrirRegistroNfeAtlas!=='function')throw new Error('Registro fiscal indisponível.');
              // Somente a função Fiscal existente decide se o usuário está autorizado.
              modal.classList.remove('ativo');
              global.abrirRegistroNfeAtlas(id);
            }catch(e){global.AtlasModal?.erro?.(e.message||String(e))||global.alert(e.message||String(e));}
          });
        }
      }catch(e){
        if(resumo){resumo.style.display='block';resumo.textContent='Não foi possível verificar o status fiscal agora. Confirme a liberação no setor Fiscal antes de enviar.';}
        // Falha de consulta NÃO libera nada: o envio permanece sujeito à validação no backend.
        console.warn('Atlas: pré-validação fiscal indisponível',e);
      }
      return resultado;
    };
    wrapper.__atlasFiscalEnvioAviso=true;
    global.abrirRetirada=wrapper;
  }

  async function iniciar(){
    try{
      if(typeof global.verificarLogin==='function') global.verificarLogin();

      await carregarScript('./JS/expedicao/expedicaoImagens.js');
      await carregarScript('./JS/expedicao/expedicaoCore.js?v=20261112-romaneio-botao-estavel-01');

      instalarAbaLazy();
      instalarAcoesLazy();
      instalarAvisoFiscalAntesDoEnvio();
      esconderLoading();

      const aba=new URLSearchParams(location.search).get('aba');

      if(aba){
        const btn=[...document.querySelectorAll('.tab-btn')]
          .find(b=>(b.getAttribute('onclick')||'').includes("'"+aba+"'"));

        await global.abrirAba?.(aba,btn||null);
      }

      // Tarefa fiscal da RP: abrir o romaneio da própria remessa,
      // sem confundir o id patrimonial com o id de pedido PED.
      const paramsRP=new URLSearchParams(location.search);
      const remessaDireta=Number(paramsRP.get('remessa'));
      if(paramsRP.get('acao')==='romaneio-rp' && Number.isSafeInteger(remessaDireta) && remessaDireta>0){
        try{
          await modulo('fiscal');
          await global.AtlasRomaneio?.abrirRemessa?.(remessaDireta);
        }catch(e){
          console.error('Atlas: não foi possível abrir romaneio RP da notificação',e);
          global.AtlasModal?.erro?.(e?.message||String(e));
        }
      }

      /* Deep-link: abre diretamente o pedido indicado, em qualquer etapa da Expedição. */
      const pedidoDireto=Number(new URLSearchParams(location.search).get('pedido'));
      if(Number.isFinite(pedidoDireto) && pedidoDireto > 0){
        try{ if(typeof global.carregarTudo==='function') await global.carregarTudo(); }catch(_){ }
        let tentativas=0;
        const abrirPedido=()=>{
          tentativas++;
          const existe=(global.pedidos||[]).some(p=>Number(p.id)===pedidoDireto);
          const acaoDireta=new URLSearchParams(location.search).get('acao');
          if(acaoDireta==='romaneio'){
            modulo('fiscal').then(()=>global.AtlasRomaneio?.abrir?.(pedidoDireto));
            return;
          }
          if(existe && typeof global.abrirDetalhePedidoAtlas==='function'){
            global.abrirDetalhePedidoAtlas(pedidoDireto);
            return;
          }
          if(tentativas<20) setTimeout(abrirPedido,150);
        };
        setTimeout(abrirPedido,80);
      }

      const idle=global.requestIdleCallback||((fn)=>setTimeout(fn,800));
      idle(()=>modulo('visual').catch(console.warn));
      idle(()=>modulo('pwa').catch(console.warn));

      void 0;
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
    versao:'1.2-fiscal-workflow-lazy',
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
