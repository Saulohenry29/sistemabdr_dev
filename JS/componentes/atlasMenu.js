(function(){
  'use strict';

  const itens = [
    ['dashboard', 'dashboard.html', 'DASHBOARD_VER', 'Dashboard', 'fa-solid fa-chart-simple'],
    ['entrada', 'entrada.html', 'ENTRADA_VER', 'Entrada', 'fa-solid fa-arrow-down-wide-short'],
    ['triagem', 'triagem.html', 'TRIAGEM_VER', 'Triagem', 'fa-solid fa-vials'],
    ['estoque', 'estoque.html', 'ESTOQUE_VER', 'Estoque', 'fa-solid fa-boxes-stacked'],
    ['patrimonio', 'patrimonio.html', 'PATRIMONIO_VER', 'Patrimônio', 'fa-solid fa-tags'],
    ['manutencao', 'manutencao.html', 'MANUTENCAO_VER', 'Manutenção', 'fa-solid fa-screwdriver-wrench'],
    ['expedicao', 'expedicao.html', 'EXPEDICAO_VER', 'Expedição', 'fa-solid fa-truck-fast'],
    ['movimentacoes', 'movimentacoes.html', 'MOVIMENTACOES_VER', 'Movimentações', 'fa-solid fa-right-left'],
    ['relatorios', 'relatorios.html', 'RELATORIOS_VER', 'Relatórios', 'fa-regular fa-file-lines'],
    ['empresa', 'empresa.html', 'EMPRESAS_VER', 'Empresas', 'fa-solid fa-building'],
    ['usuarios', 'usuarios.html', 'USUARIOS_VER', 'Usuários', 'fa-solid fa-users']
  ];

  function escapar(valor){
    return String(valor ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('"','&quot;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;');
  }

  class AtlasMenu extends HTMLElement {
    connectedCallback(){
      if(this.dataset.renderizado === '1') return;
      this.dataset.renderizado = '1';
      this.classList.add('bdr-sidebar');
      this.innerHTML = `
        <div class="bdr-brand">
          <div class="bdr-brand-icon bdr-logo-menu">
            <img src="./imagens/logo.png" alt="BDR">
          </div>
        </div>
        <nav class="bdr-menu" aria-label="Menu principal">
          ${itens.map(([modulo,pagina,permissao,tip,icone]) => `
            <button
              type="button"
              class="bdr-menu-btn"
              data-shell-module="${escapar(modulo)}"
              data-shell-page="${escapar(pagina)}"
              data-permissao="${escapar(permissao)}"
              data-tip="${escapar(tip)}"
              aria-label="${escapar(tip)}">
              <span class="bdr-menu-icon"><i class="${escapar(icone)}"></i></span>
            </button>`).join('')}
        </nav>`;
    }
  }

  if(!customElements.get('atlas-menu')){
    customElements.define('atlas-menu', AtlasMenu);
  }
})();