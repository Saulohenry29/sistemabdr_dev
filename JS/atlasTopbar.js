/* =========================================================
   ATLAS SaaS - CONTROLADOR OFICIAL DE TOPBAR
   Arquivo: JS/atlasTopbar.js

   CORREÇÃO V1.3
   - Compensa automaticamente o zoom aplicado no BODY.
   - Alinha os dropdowns pela borda direita do botão.
   - Elimina ajustes manuais como -88, +30 ou +50.
   - Mantém os menus acima de cards, tabelas e conteúdos.
========================================================= */
(function AtlasTopbarModule(){
  "use strict";

  /* =========================================================
     1. SELETORES COMPATÍVEIS
  ========================================================= */
  const SELECTORS = {
    notifButton: ".notif-btn, [data-atlas-toggle='notifications']",
    notifDropdown: "#notifDropdown, .notif-dropdown",
    userButton: ".user-menu, .user-menu-top, [data-atlas-toggle='user']",
    userDropdown: "#dropdownUser, #userDropdown, .dropdown-user, .user-dropdown"
  };

  /* =========================================================
     2. CONFIGURAÇÃO OFICIAL

     Para mudar apenas a distância vertical:
     - 4 aproxima o menu do botão
     - 6 é o padrão
     - 8 afasta o menu do botão

     Não altere posição horizontal. Ela é calculada automaticamente.
  ========================================================= */
  const CONFIG = Object.freeze({
    gapVertical: 6,
    margemTela: 10,
    alturaMaximaViewport: 0.65
  });

  const state = {
    activeButton: null,
    activeDropdown: null,
    originalParent: new WeakMap(),
    originalNextSibling: new WeakMap()
  };

  /* =========================================================
     3. PORTAL GLOBAL
  ========================================================= */
  function getPortal(){
    let portal = document.getElementById("atlasOverlayPortal");

    if(!portal){
      portal = document.createElement("div");
      portal.id = "atlasOverlayPortal";
      portal.setAttribute("aria-hidden", "true");
      portal.setAttribute("inert", "");
      document.body.appendChild(portal);
    }

    return portal;
  }

  function firstVisible(selector){
    return [...document.querySelectorAll(selector)].find(element =>
      element && element.getClientRects().length > 0
    ) || document.querySelector(selector);
  }

  function rememberOrigin(dropdown){
    if(state.originalParent.has(dropdown)) return;

    state.originalParent.set(dropdown, dropdown.parentNode);
    state.originalNextSibling.set(dropdown, dropdown.nextSibling);
  }

  function moveToPortal(dropdown){
    rememberOrigin(dropdown);
    getPortal().appendChild(dropdown);
  }

  function normalizeOpenClass(dropdown, open){
    dropdown.classList.toggle("ativo", open);

    if(dropdown.classList.contains("user-dropdown")){
      dropdown.classList.toggle("show", open);
    }

    dropdown.setAttribute("aria-hidden", open ? "false" : "true");
  }

  /* =========================================================
     4. ZOOM REAL DO SISTEMA

     O layout-bdr.css usa:
       body { zoom: var(--screen-zoom); }

     getBoundingClientRect() retorna coordenadas visuais.
     style.left/style.top dentro do body usam coordenadas da escala.
     Por isso precisamos converter visual -> escala do body.
  ========================================================= */
  function getBodyZoom(){
    const body = document.body;
    if(!body) return 1;

    const computed = window.getComputedStyle(body);
    const rawZoom = computed.zoom || body.style.zoom || "1";
    const zoom = Number.parseFloat(rawZoom);

    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  }

  /* =========================================================
     5. POSICIONAMENTO OFICIAL
  ========================================================= */
  function positionDropdown(button, dropdown){
    if(!button || !dropdown) return;

    const rect = button.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const zoom = getBodyZoom();

    const gap = CONFIG.gapVertical;
    const sideMargin = CONFIG.margemTela;

    /*
      Exibe de forma invisível para medir o tamanho CSS real.
      offsetWidth/offsetHeight não incluem o zoom visual.
    */
    dropdown.style.visibility = "hidden";
    dropdown.style.display = "block";
    dropdown.style.left = "0px";
    dropdown.style.top = "0px";
    dropdown.style.right = "auto";

    const cssWidth = Math.max(
      1,
      dropdown.offsetWidth || (dropdown.matches(SELECTORS.userDropdown) ? 220 : 330)
    );

    const cssHeight = Math.max(
      1,
      Math.min(
        dropdown.scrollHeight || 300,
        (viewportHeight * CONFIG.alturaMaximaViewport) / zoom
      )
    );

    /*
      Converte o tamanho CSS para tamanho visual.
      Exemplo:
      CSS 220px com zoom 0.85 = 187px visuais.
    */
    const visualWidth = cssWidth * zoom;
    const visualHeight = cssHeight * zoom;

    /*
      Alinhamento oficial:
      a borda direita do dropdown acompanha a borda direita do botão.
    */
    let leftVisual = rect.right - visualWidth;

    /*
      Proteção contra saída da tela.
    */
    leftVisual = Math.max(
      sideMargin,
      Math.min(
        leftVisual,
        viewportWidth - visualWidth - sideMargin
      )
    );

    let topVisual = rect.bottom + gap;

    /*
      Quando não houver espaço abaixo, tenta abrir acima.
    */
    if(topVisual + visualHeight > viewportHeight - sideMargin){
      const aboveVisual = rect.top - visualHeight - gap;

      if(aboveVisual >= sideMargin){
        topVisual = aboveVisual;
      }
    }

    /*
      Conversão final:
      coordenada visual / zoom = coordenada CSS dentro do body.
    */
    dropdown.style.width = `${cssWidth}px`;
    dropdown.style.left = `${Math.round(leftVisual / zoom)}px`;
    dropdown.style.top = `${Math.round(topVisual / zoom)}px`;
    dropdown.style.right = "auto";
    dropdown.style.visibility = "visible";
  }

  /* =========================================================
     6. ABRIR E FECHAR
  ========================================================= */
  function closeActive({restoreFocus = false} = {}){

    /* Limpa qualquer animação visual do sino ao fechar */
    document.querySelector(".notif-btn")?.classList.remove("bdr-notif-animando");
    document.querySelector(".notif-badge")?.classList.remove("bdr-badge-pulse");

    const {activeButton, activeDropdown} = state;
    const portal = getPortal();

    /*
     * ACESSIBILIDADE:
     * tira o foco de qualquer botão dentro do dropdown ANTES
     * de aplicar aria-hidden/inert. Isso elimina o aviso:
     * "Blocked aria-hidden ... descendant retained focus".
     */
    try{
      const focado = document.activeElement;

      if(
        focado instanceof HTMLElement &&
        activeDropdown &&
        activeDropdown.contains(focado)
      ){
        focado.blur();
      }
    }catch(e){}

    if(activeDropdown){
      normalizeOpenClass(activeDropdown, false);

      activeDropdown.style.removeProperty("display");
      activeDropdown.style.removeProperty("visibility");
      activeDropdown.style.removeProperty("left");
      activeDropdown.style.removeProperty("top");
      activeDropdown.style.removeProperty("right");
      activeDropdown.style.removeProperty("width");
    }

    portal.setAttribute("aria-hidden", "true");
    portal.setAttribute("inert", "");

    if(activeButton){
      activeButton.setAttribute("aria-expanded", "false");

      if(restoreFocus){
        /*
         * Mantemos sem focus() automático para não voltar
         * o cursor piscando no botão do sininho.
         */
      }
    }

    state.activeButton = null;
    state.activeDropdown = null;
  }

  function openDropdown(button, dropdown){
    if(!button || !dropdown) return;

    if(state.activeDropdown === dropdown){
      closeActive();
      return;
    }

    closeActive();

    const portal = getPortal();
    portal.removeAttribute("inert");
    portal.setAttribute("aria-hidden", "false");

    moveToPortal(dropdown);
    normalizeOpenClass(dropdown, true);

    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-haspopup", "menu");

    state.activeButton = button;
    state.activeDropdown = dropdown;

    requestAnimationFrame(() => {
      positionDropdown(button, dropdown);
    });
  }

  /* =========================================================
     7. EVENTOS
  ========================================================= */
  function resolveButton(target, selector){
    return target?.closest?.(selector) || null;
  }

  function onDocumentClick(event){
    const notifButton = resolveButton(event.target, SELECTORS.notifButton);

    if(notifButton){
      event.preventDefault();
      event.stopPropagation();

      openDropdown(
        notifButton,
        firstVisible(SELECTORS.notifDropdown)
      );

      return;
    }

    const userButton = resolveButton(event.target, SELECTORS.userButton);

    if(userButton){
      event.preventDefault();
      event.stopPropagation();

      openDropdown(
        userButton,
        firstVisible(SELECTORS.userDropdown)
      );

      return;
    }

    if(state.activeDropdown && !state.activeDropdown.contains(event.target)){
      closeActive();
    }
  }

  function onKeydown(event){
    if(event.key === "Escape" && state.activeDropdown){
      event.preventDefault();
      closeActive({restoreFocus: true});
    }
  }

  function onResize(){
    if(state.activeDropdown){
      closeActive();
    }
  }

  function onScroll(event){
    if(!state.activeDropdown) return;

    /*
      Rolagem dentro do próprio dropdown deve continuar funcionando.
      Antes, qualquer scroll capturado pela janela fechava o painel,
      inclusive a roda do mouse e o arraste da barra da lista.
    */
    const origem = event?.target;
    if(
      origem &&
      origem !== window &&
      origem !== document &&
      origem !== document.documentElement &&
      origem !== document.body &&
      state.activeDropdown.contains(origem)
    ){
      return;
    }

    /* Rolagem real da página fecha o dropdown para não perder alinhamento. */
    closeActive();
  }

  /* =========================================================
     8. NORMALIZAÇÃO DO HTML
  ========================================================= */
  function normalizeMarkup(){
    document.querySelectorAll(SELECTORS.notifButton).forEach(button => {
      button.type = button.type || "button";
      button.setAttribute("aria-expanded", "false");
      button.setAttribute(
        "aria-label",
        button.getAttribute("aria-label") || "Abrir notificações"
      );
    });

    document.querySelectorAll(SELECTORS.userButton).forEach(button => {
      if(button.tagName === "BUTTON"){
        button.type = "button";
      }

      button.setAttribute(
        "role",
        button.getAttribute("role") || "button"
      );

      button.setAttribute(
        "tabindex",
        button.getAttribute("tabindex") || "0"
      );

      button.setAttribute("aria-expanded", "false");

      button.setAttribute(
        "aria-label",
        button.getAttribute("aria-label") || "Abrir menu do usuário"
      );
    });

    document
      .querySelectorAll(`${SELECTORS.notifDropdown}, ${SELECTORS.userDropdown}`)
      .forEach(dropdown => {
        dropdown.setAttribute("aria-hidden", "true");
        dropdown.setAttribute(
          "role",
          dropdown.getAttribute("role") || "menu"
        );

        dropdown.classList.remove("ativo", "show");
      });
  }

  function carregarAlertasPreventiva(){
    if(window.AtlasPreventivaAlertas || document.querySelector('script[data-atlas-preventiva-alertas]')){
      return;
    }

    const script=document.createElement("script");
    script.src="./JS/manutencao/atlasManutencaoPreventivaAlertas.js";
    script.defer=true;
    script.dataset.atlasPreventivaAlertas="true";
    document.head.appendChild(script);
  }

  function carregarAtlasPush(){
    if(window.AtlasPush || document.querySelector('script[data-atlas-push]')) return;
    const script=document.createElement("script");
    script.src="./JS/notificacoes/atlasPush.js";
    script.defer=true;
    script.dataset.atlasPush="true";
    document.head.appendChild(script);
  }


  /* =========================================================
     OWNER CORE — restaura o painel administrativo secreto do ID 1.
     O painel só é carregado para o OWNER; a autorização real continua
     sendo validada pelo próprio core e pelo banco.
  ========================================================= */
  function usuarioOwnerAtual(){
    for(const chave of ["usuario_logado", "usuarioLogado"]){
      try{
        const u=JSON.parse(localStorage.getItem(chave)||"null");
        if(Number(u?.id)===1) return u;
      }catch(_){ }
    }
    return null;
  }

  function carregarOwnerCore(){
    if(!usuarioOwnerAtual()) return;

    if(!document.querySelector('link[data-bdr-owner-core-css]')){
      const link=document.createElement("link");
      link.rel="stylesheet";
      link.href="./CSS/bdr-owner-core.css";
      link.dataset.bdrOwnerCoreCss="true";
      document.head.appendChild(link);
    }

    const prepararGatilho=()=>{
      const alvo=document.getElementById("usuarioPerfil") || firstVisible(SELECTORS.userButton);
      if(!alvo || alvo.dataset.bdrOwnerTrigger==="true") return;
      alvo.dataset.bdrOwnerTrigger="true";
      alvo.title="OWNER";
      if(alvo.id==="usuarioPerfil") alvo.textContent="OWNER";
      alvo.addEventListener("click",event=>{
        if(!usuarioOwnerAtual()) return;
        // No texto OWNER, o clique é reservado ao painel secreto e não abre
        // o dropdown normal do usuário.
        if(alvo.id==="usuarioPerfil"){
          event.preventDefault();
          event.stopPropagation();
        }
        if(typeof window.bdrCliqueSecretoOwner==="function"){
          window.bdrCliqueSecretoOwner(event);
        }
      },true);
    };

    if(typeof window.bdrCliqueSecretoOwner==="function"){
      prepararGatilho();
      return;
    }

    if(document.querySelector('script[data-bdr-owner-core]')){
      setTimeout(prepararGatilho,300);
      return;
    }

    const script=document.createElement("script");
    script.src="./JS/bdr-owner-core.js";
    script.defer=true;
    script.dataset.bdrOwnerCore="true";
    script.addEventListener("load",prepararGatilho,{once:true});
    document.head.appendChild(script);
  }

  /* =========================================================
     9. INICIALIZAÇÃO
  ========================================================= */
  function init(){
    if(document.documentElement.dataset.atlasTopbarReady === "true"){
      return;
    }

    document.documentElement.dataset.atlasTopbarReady = "true";

    normalizeMarkup();
    carregarAtlasPush();
    carregarOwnerCore();
    getPortal();
    carregarAlertasPreventiva();

    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("keydown", onKeydown);

    window.addEventListener(
      "resize",
      onResize,
      {passive: true}
    );

    window.addEventListener(
      "scroll",
      onScroll,
      {passive: true, capture: true}
    );
  }

  /* =========================================================
     10. COMPATIBILIDADE TEMPORÁRIA

     Permite que páginas antigas ainda chamem:
       toggleNotificacoes(event)
       toggleMenuUsuario(event)

     Nas páginas novas, prefira data-atlas-toggle.
  ========================================================= */
  window.toggleNotificacoes = function toggleNotificacoes(event){
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const button =
      event?.currentTarget ||
      firstVisible(SELECTORS.notifButton);

    openDropdown(
      button,
      firstVisible(SELECTORS.notifDropdown)
    );
  };

  window.toggleMenuUsuario = function toggleMenuUsuario(event){
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const button =
      event?.currentTarget ||
      firstVisible(SELECTORS.userButton);

    openDropdown(
      button,
      firstVisible(SELECTORS.userDropdown)
    );
  };

  window.AtlasTopbar = Object.freeze({
    versao: "padrao-unico",
    init,
    close: closeActive,
    closeAll: closeActive,
    refresh: normalizeMarkup,
    position: positionDropdown,
    getZoom: getBodyZoom
  });

  console.log(
    "✅ ATLAS TOPBAR carregado - padrão único de usuário e notificações"
  );

  if(document.readyState === "loading"){
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once: true}
    );
  }else{
    init();
  }
})();
