(function(){
  'use strict';

  const MODULOS = {
    dashboard: {
      alias: 'dash',
      pagina: 'dashboard.html',
      titulo: '📊 Torre de Controle BDR',
      subtitulo: 'Visão geral, indicadores, análise inteligente e monitoramento patrimonial.'
    },
    triagem: {
      alias: 'tri',
      pagina: 'triagem.html',
      titulo: '🧪 BDR ERP - Triagem',
      subtitulo: 'Conferência de entradas, sugestão de endereço e separação para estoque/patrimônio.'
    },
    empresa: {
      alias: 'emp',
      pagina: 'empresa.html',
      titulo: '🏢 BDR Empresas',
      subtitulo: 'Cadastro de empresas, obras e setores vinculados ao patrimônio.'
    },
    patrimonio: {
      alias: 'pat',
      pagina: 'patrimonio.html',
      titulo: '📦 BDR Patrimônio',
      subtitulo: 'Cadastro, consulta e controle de patrimônios com performance otimizada.'
    }
  };

  const ALIASES = Object.fromEntries(
    Object.entries(MODULOS).flatMap(([nome,cfg]) => [[nome,nome],[cfg.alias,nome]])
  );

  function normalizarModulo(valor){
    valor = String(valor || '').toLowerCase().trim();
    return ALIASES[valor] || 'dashboard';
  }

  function moduloDaUrl(){
    const params = new URLSearchParams(location.search);
    return normalizarModulo(params.get('m') || params.get('modulo'));
  }

  function moduloPorPagina(pagina){
    const alvo = String(pagina || '').split('?')[0].split('/').pop().toLowerCase();
    for(const [nome,cfg] of Object.entries(MODULOS)){
      if(cfg.pagina.toLowerCase() === alvo) return nome;
    }
    return null;
  }

  function atualizarTopo(modulo){
    const cfg = MODULOS[modulo];
    const titulo = document.getElementById('atlasShellTitulo');
    const subtitulo = document.getElementById('atlasShellSubtitulo');
    if(titulo) titulo.textContent = cfg.titulo;
    if(subtitulo) subtitulo.textContent = cfg.subtitulo;
    document.title = cfg.titulo.replace(/^[^A-Za-zÀ-ÿ0-9]+\s*/, '') + ' | Atlas';
  }

  function atualizarMenu(modulo){
    document.querySelectorAll('.bdr-menu-btn[data-shell-module]').forEach(btn => {
      const ativo = btn.dataset.shellModule === modulo;
      btn.classList.toggle('active', ativo);
      if(ativo) btn.setAttribute('aria-current','page');
      else btn.removeAttribute('aria-current');
    });
  }

  function atualizarModulos(modulo){
    document.documentElement.dataset.shellModulo = modulo;
    document.querySelectorAll('.atlas-shell-module').forEach(sec => {
      const ativo = sec.dataset.module === modulo;
      sec.classList.toggle('is-active', ativo);
      sec.setAttribute('aria-hidden', ativo ? 'false' : 'true');
    });
  }

  function gravarUrl(modulo, substituir){
    const cfg = MODULOS[modulo];
    const url = new URL(location.href);
    url.searchParams.delete('modulo');
    url.searchParams.set('m', modulo);
    const estado = { ...(history.state || {}), modulo };
    if(substituir) history.replaceState(estado, '', url);
    else history.pushState(estado, '', url);
  }

  const MODULOS_CARREGADOS = new Set(['dashboard','triagem','empresa']);
  let patrimonioCarregando = null;

  function carregarScriptUnico(src){
    return new Promise((resolve,reject) => {
      const base = String(src).split('?')[0];
      const existente = [...document.scripts].find(s => {
        const atual = String(s.getAttribute('src') || '').split('?')[0];
        return atual === base || (s.src && s.src.split('?')[0].endsWith(base.replace(/^\.\//,'')));
      });
      if(existente){
        if(existente.dataset.atlasCarregado === '1' || !existente.dataset.atlasDinamico) return resolve();
        existente.addEventListener('load', resolve, {once:true});
        existente.addEventListener('error', reject, {once:true});
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.atlasDinamico = '1';
      script.onload = () => { script.dataset.atlasCarregado = '1'; resolve(); };
      script.onerror = () => reject(new Error('Falha ao carregar ' + src));
      document.body.appendChild(script);
    });
  }

  async function carregarPatrimonio(){
    if(MODULOS_CARREGADOS.has('patrimonio')) return;
    if(patrimonioCarregando) return patrimonioCarregando;

    patrimonioCarregando = (async () => {
      const scripts = [
        './JS/atlasDialog.js?v=20260724-padrao-profissional-v1',
        './JS/atlasAudio/atlasAudio.js',
        'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',
        './JS/patrimonio/patrimonio-boot.js?v=20260725-v1',
        './JS/patrimonio/patrimonio-lote.js?v=20260831-atlas',
        './JS/patrimonio/patrimonio-etiquetas-lote.js?v=20260831-atlas',
        './JS/atlasGestorNotificacoes.js?v=20260728-patrimonio',
        './JS/atlasWorkflowManutencao.js?v=20260807-fluxo-simplificado',
        './JS/atlasManutencao.js?v=20260807-fluxo-simplificado',
        './JS/patrimonio/atlasPatrimonioAssistente.js?v=20260831-atlas',
        './JS/patrimonio/patrimonio.js?v=20260902-moeda-cursor',
        './JS/patrimonio/patrimonio-etiqueta-individual.js?v=20260804-v1',
        './JS/patrimonio/patrimonio-permissoes.js?v=20260831-atlas',
        './JS/patrimonio/patrimonio-config-etiqueta.js?v=20260831-atlas',
        './JS/patrimonio/patrimonio-remessas.js?v=20260902',
        './JS/atlasOwnerMode.js?v=20260831-atlas'
      ];

      for(const src of scripts) await carregarScriptUnico(src);
      MODULOS_CARREGADOS.add('patrimonio');
      document.dispatchEvent(new CustomEvent('atlas:patrimonio-ready'));
    })().catch(err => {
      patrimonioCarregando = null;
      console.error('ATLAS: falha ao carregar Patrimônio.', err);
      throw err;
    });

    return patrimonioCarregando;
  }

  function carregarModuloSeNecessario(modulo){
    if(modulo === 'patrimonio') return carregarPatrimonio();
    return Promise.resolve();
  }

  function mostrarModulo(modulo, atualizarHistorico){
    modulo = normalizarModulo(modulo);
    atualizarModulos(modulo);
    atualizarTopo(modulo);
    atualizarMenu(modulo);

    carregarModuloSeNecessario(modulo).catch(() => {});

    if(atualizarHistorico) gravarUrl(modulo, false);

    window.dispatchEvent(new CustomEvent('atlas:modulechange', {
      detail: { modulo }
    }));

    // Gráficos do Dashboard podem ter sido inicializados enquanto o módulo estava oculto.
    // Força apenas o recálculo de layout quando ele passa a ficar visível.
    if(modulo === 'dashboard'){
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
  }

  function abrirPaginaLegada(pagina){
    window.location.href = pagina;
  }

  window.atlasShellAbrir = function(modulo){
    const normalizado = ALIASES[String(modulo || '').toLowerCase()];
    if(normalizado && MODULOS[normalizado]){
      mostrarModulo(normalizado, true);
      return;
    }
    abrirPaginaLegada(modulo);
  };

  // Compatibilidade com páginas/scripts antigos.
  window.ir = function(pagina){
    const modulo = moduloPorPagina(pagina);
    if(modulo) return mostrarModulo(modulo, true);
    abrirPaginaLegada(pagina);
  };

  // Um único controlador para o menu.
  document.addEventListener('click', function(event){
    const botao = event.target.closest('.bdr-menu-btn[data-shell-module]');
    if(!botao) return;

    const modulo = botao.dataset.shellModule;
    const pagina = botao.dataset.shellPage;

    event.preventDefault();
    event.stopPropagation();
    if(typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

    if(MODULOS[modulo]){
      const atual = normalizarModulo(document.documentElement.dataset.shellModulo);
      if(modulo !== atual) mostrarModulo(modulo, true);
      return;
    }

    if(pagina) abrirPaginaLegada(pagina);
  }, true);

  window.addEventListener('popstate', function(event){
    mostrarModulo(normalizarModulo(event.state?.modulo || moduloDaUrl()), false);
  });

  function iniciar(){
    const inicial = moduloDaUrl();
    mostrarModulo(inicial, false);
    gravarUrl(inicial, true);
    document.documentElement.classList.add('atlas-shell-ready');
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', iniciar, { once:true });
  } else {
    iniciar();
  }
})();