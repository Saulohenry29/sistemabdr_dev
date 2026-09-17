/* ATLAS Patrimônio — inicialização de sessão */
verificarLogin();


/* =========================================================
   ATLAS PATRIMÔNIO — BLOQUEIO DE CARET FORA DOS CAMPOS
   O navegador não deve exibir cursor de digitação em textos,
   títulos, cards ou áreas vazias. Inputs e textareas permanecem
   editáveis e com cursor normal.
========================================================= */
(function configurarCursorPatrimonio(){
  const seletorEditavel = 'input, textarea, [contenteditable="true"]';

  document.addEventListener('selectstart', function(evento){
    const alvo = evento.target;
    if(!(alvo instanceof Element) || !alvo.closest(seletorEditavel)){
      evento.preventDefault();
    }
  }, true);

  document.addEventListener('mousedown', function(evento){
    const alvo = evento.target;
    if(alvo instanceof Element && alvo.closest(seletorEditavel)) return;

    const ativo = document.activeElement;
    if(ativo && ativo.matches && ativo.matches(seletorEditavel)){
      ativo.blur();
    }
  }, true);
})();

/* =========================================================
   ATLAS PATRIMÔNIO — SELECTS CONTROLADOS DOS FILTROS
   Popup limitado à área útil do sistema, como aplicação desktop.
========================================================= */
(function configurarSelectsControladosPatrimonio(){
  const ids = [
    'patrimonioFiltroObra',
    'filtroStatus',
    'patrimonioFiltroTipo',
    'patrimonioFiltroUsuario',
    'patrimonioFiltroAntigo',
    'novaObraSelect'
  ];

  let aberto = null;

  const iconesFiltro = {
    patrimonioFiltroObra: '🏗️',
    filtroStatus: '●',
    patrimonioFiltroTipo: '🏷️',
    patrimonioFiltroUsuario: '👤',
    patrimonioFiltroAntigo: '🕘',
    novaObraSelect: '🏗️'
  };

  function iconeOpcao(select, texto){
    const t = String(texto || '').toLowerCase();
    if(select.id === 'filtroStatus'){
      if(t.includes('trânsito') || t.includes('transito')) return '🚚';
      if(t.includes('estoque')) return '📦';
      if(t.includes('uso')) return '🔵';
      if(t.includes('manuten')) return '🛠️';
      if(t.includes('baix') || t.includes('inativ')) return '⚫';
      if(t.includes('todos')) return '●';
      return '●';
    }
    return iconesFiltro[select.id] || '';
  }

  function textoVisual(select, texto){
    const original = String(texto || '').trim();
    // As opções do cadastro (ex.: Tipo do patrimônio) já trazem seu próprio ícone.
    // Quando já houver um pictograma no início, preserva exatamente um e não duplica.
    if(/^\p{Extended_Pictographic}/u.test(original)) return original;
    const icone = iconeOpcao(select, original);
    return icone ? `${icone} ${original}` : original;
  }

  function fechar(){
    if(!aberto) return;
    aberto.popup.classList.remove('ativo');
    aberto.botao.setAttribute('aria-expanded','false');
    aberto = null;
  }

  function atualizarRotulo(select, botao){
    const opcao = select.options[select.selectedIndex] || select.options[0];
    const label = botao.querySelector('.atlas-select-label');
    if(label) label.textContent = opcao ? textoVisual(select, opcao.textContent) : '';
  }

  function renderizarOpcoes(select, popup, botao){
    popup.innerHTML = '';
    Array.from(select.options).forEach((opcao, indice) => {
      if(opcao.hidden) return;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'atlas-select-option' + (indice === select.selectedIndex ? ' selecionado' : '');
      item.textContent = textoVisual(select, opcao.textContent);
      item.disabled = !!opcao.disabled;
      item.dataset.value = opcao.value;
      item.addEventListener('click', () => {
        if(select.value !== opcao.value){
          select.value = opcao.value;
          select.dispatchEvent(new Event('change', {bubbles:true}));
        }
        atualizarRotulo(select, botao);
        fechar();
        botao.focus({preventScroll:true});
      });
      popup.appendChild(item);
    });
  }

  function posicionar(botao, popup){
    const r = botao.getBoundingClientRect();
    const margem = 8;
    const topoAtlas = Math.max(0,
      document.querySelector('.atlas-topbar')?.getBoundingClientRect().bottom ||
      document.querySelector('.atlas-shell-topbar')?.getBoundingClientRect().bottom || 0
    );
    const limiteSuperior = Math.max(margem, topoAtlas + margem);
    // No tablet/celular o menu oficial fica fixo no rodapé. O popup do
    // filtro deve terminar ANTES dele, nunca passar por cima dos botões.
    const menu = document.querySelector('.bdr-sidebar');
    const menuRect = menu?.getBoundingClientRect();
    const menuNoRodape = menuRect && menuRect.top > (window.innerHeight * .45);
    const limiteInferior = menuNoRodape
      ? Math.max(limiteSuperior + 72, menuRect.top - margem)
      : window.innerHeight - margem;
    const abaixo = Math.max(0, limiteInferior - r.bottom - 4);
    const acima = Math.max(0, r.top - limiteSuperior - 4);
    const alturaDesejada = Math.min(320, Math.max(90, popup.scrollHeight + 8));
    const abrirParaBaixo = abaixo >= Math.min(alturaDesejada, 150) || abaixo >= acima;
    const alturaDisponivel = Math.max(72, abrirParaBaixo ? abaixo : acima);
    const altura = Math.min(alturaDesejada, alturaDisponivel);

    const largura = Math.max(r.width, Math.min(310, window.innerWidth - (margem * 2)));
    let esquerda = r.left;
    if(esquerda + largura > window.innerWidth - margem) esquerda = window.innerWidth - margem - largura;
    esquerda = Math.max(margem, esquerda);

    popup.style.width = largura + 'px';
    popup.style.maxHeight = altura + 'px';
    popup.style.left = esquerda + 'px';
    popup.style.top = abrirParaBaixo ? (r.bottom + 4) + 'px' : Math.max(limiteSuperior, r.top - altura - 4) + 'px';
  }

  function preparar(select){
    if(!select || select.dataset.atlasSelectControlado === '1') return;
    select.dataset.atlasSelectControlado = '1';
    select.classList.add('atlas-select-native');

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'atlas-select-control';
    botao.setAttribute('aria-haspopup','listbox');
    botao.setAttribute('aria-expanded','false');
    botao.innerHTML = '<span class="atlas-select-label"></span><span class="atlas-select-chevron" aria-hidden="true">▼</span>';
    select.insertAdjacentElement('afterend', botao);

    const popup = document.createElement('div');
    popup.className = 'atlas-select-popup';
    popup.setAttribute('role','listbox');
    document.body.appendChild(popup);

    atualizarRotulo(select, botao);

    const observer = new MutationObserver(() => {
      atualizarRotulo(select, botao);
      if(aberto && aberto.select === select){
        renderizarOpcoes(select, popup, botao);
        posicionar(botao, popup);
      }
    });
    observer.observe(select, {childList:true, subtree:true, attributes:true});

    select.addEventListener('change', () => atualizarRotulo(select, botao));
    botao.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if(aberto && aberto.select === select){ fechar(); return; }
      fechar();
      renderizarOpcoes(select, popup, botao);
      popup.classList.add('ativo');
      botao.setAttribute('aria-expanded','true');
      aberto = {select, botao, popup};
      requestAnimationFrame(() => posicionar(botao, popup));
    });
  }

  function iniciar(){ ids.forEach(id => preparar(document.getElementById(id))); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, {once:true});
  else iniciar();

  document.addEventListener('click', (e) => {
    if(!aberto) return;
    const alvo = e.target;
    if(alvo instanceof Node && (aberto.botao.contains(alvo) || aberto.popup.contains(alvo))) return;
    fechar();
  }, true);
  document.addEventListener('keydown', e => { if(e.key === 'Escape') fechar(); }, true);
  window.addEventListener('resize', () => { if(aberto) posicionar(aberto.botao, aberto.popup); });
  window.addEventListener('scroll', () => { if(aberto) posicionar(aberto.botao, aberto.popup); }, true);
})();
