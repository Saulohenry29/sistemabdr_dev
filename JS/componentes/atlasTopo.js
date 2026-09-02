(function(){
  'use strict';

  class AtlasTopo extends HTMLElement {
    connectedCallback(){
      if(this.dataset.renderizado === '1') return;
      this.dataset.renderizado = '1';
      this.classList.add('bdr-topbar');
      this.innerHTML = `
        <div class="atlas-topo-identificacao">
          <div id="atlasShellTitulo" class="bdr-topbar-title">Atlas</div>
          <div id="atlasShellSubtitulo" class="bdr-topbar-sub">Carregando módulo...</div>
        </div>

        <div class="bdr-top-actions">
          <div class="notif-wrap">
            <button class="notif-btn" type="button" title="Notificações"
              data-atlas-toggle="notifications" aria-label="Abrir notificações">
              <i class="fa-regular fa-bell"></i>
              <span id="notifBadge" class="notif-badge">0</span>
            </button>

            <div id="notifDropdown" class="notif-dropdown">
              <div class="notif-head">🔔 Central de notificações</div>
              <div id="notifLista" class="notif-list">
                <div class="notif-item">Nenhuma notificação no momento.</div>
              </div>
            </div>
          </div>

          <div class="user-menu" id="userMenuTop" data-atlas-toggle="user" aria-label="Abrir menu do usuário">
            <div class="user-mini">
              <b id="usuarioNome" tabindex="-1">Olá, -</b>
              <small id="usuarioPerfil" tabindex="-1">-</small>
            </div>
            <div class="avatar"><i class="fa-solid fa-user"></i></div>

            <div id="dropdownUser" class="dropdown-user">
              <button type="button" onclick="location.href='MinhaConta/minha-conta.html';event.stopPropagation()">
                <i class="fa-solid fa-circle-user"></i> Minha conta
              </button>
              <button type="button" class="logout-btn" onclick="logout();event.stopPropagation()">
                <i class="fa-solid fa-right-from-bracket"></i> Sair do sistema
              </button>
            </div>
          </div>
        </div>`;
    }
  }

  if(!customElements.get('atlas-topo')){
    customElements.define('atlas-topo', AtlasTopo);
  }
})();