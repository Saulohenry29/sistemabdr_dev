/* =========================================================
   BDR MENU PADRÃO ÚNICO FINAL
   Arquivo oficial: JS/bdr-menu-ocultar-de-verdade.js

   REGRA:
   - Usar somente este arquivo para ocultar/liberar menu.
   - Não usar bdr-menu-permissoes-hard-fix.js.
   - Não usar bdr-menu-estavel-sem-piscar.js.
   - Não cria remendo novo.
   - Esconde de verdade os botões sem permissão.
   - Não deixa espaço vazio.
   - Bloqueia acesso direto à página sem permissão.
========================================================= */

(function(){
  if(window.__BDR_MENU_PADRAO_UNICO_FINAL__) return;
  window.__BDR_MENU_PADRAO_UNICO_FINAL__ = true;

  void 0;

  const PAGINAS = {
    "dashboard.html": "DASHBOARD_VER",
    "entrada.html": "ENTRADA_VER",
    "triagem.html": "TRIAGEM_VER",
    "estoque.html": "ESTOQUE_VER",
    "patrimonio.html": "PATRIMONIO_VER",
    "expedicao.html": "EXPEDICAO_VER",
    "relatorios.html": "RELATORIOS_VER",
    "empresa.html": "EMPRESAS_VER",
    "empresas.html": "EMPRESAS_VER",
    "usuarios.html": "USUARIOS_VER",
    "prateleiras-3d.html": "ESTOQUE_VER"
  };

  const ALIAS = {
    "DASHBOARD": "DASHBOARD_VER",
    "ENTRADA": "ENTRADA_VER",
    "TRIAGEM": "TRIAGEM_VER",
    "ESTOQUE": "ESTOQUE_VER",
    "PATRIMONIO": "PATRIMONIO_VER",
    "PATRIMÔNIO": "PATRIMONIO_VER",
    "EXPEDICAO": "EXPEDICAO_VER",
    "EXPEDIÇÃO": "EXPEDICAO_VER",
    "RELATORIOS": "RELATORIOS_VER",
    "RELATÓRIOS": "RELATORIOS_VER",
    "EMPRESAS": "EMPRESAS_VER",
    "USUARIOS": "USUARIOS_VER",
    "USUÁRIOS": "USUARIOS_VER",

    "VER_VALORES": "VALORES_VER",
    "VER_TODAS_OBRAS": "TODAS_OBRAS_VER",
    "VER_PROPRIA_OBRA": "PROPRIA_OBRA_VER"
  };

  function normalizarTexto(txt){
    return String(txt || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  }

  function normalizarPermissao(p){
    const n = normalizarTexto(p);
    return ALIAS[n] || n;
  }

  function usuarioAtual(){
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        "{}"
      );
    }catch(e){
      return {};
    }
  }

  function ehOwner(u){
    return Number(u?.id) === 1 || String(u?.usuario || "").trim().toLowerCase() === "saulo";
  }

  function permissoesUsuario(u){
    return String(u?.permissoes || "")
      .split(",")
      .map(p => normalizarPermissao(p))
      .filter(Boolean);
  }

  function temPermissao(chave){
    const u = usuarioAtual();
    if(ehOwner(u)) return true;

    const ps = permissoesUsuario(u);
    return ps.includes(normalizarPermissao(chave));
  }

  function paginaAtual(){
    return (location.pathname.split("/").pop() || "dashboard.html").toLowerCase();
  }

  function detectarPermissaoDoBotao(btn){
    const dataPerm = normalizarPermissao(btn.getAttribute("data-permissao"));
    if(dataPerm) return dataPerm;

    const textoBusca = [
      btn.getAttribute("onclick"),
      btn.getAttribute("href"),
      btn.getAttribute("data-href"),
      btn.getAttribute("data-tip"),
      btn.getAttribute("title"),
      btn.textContent
    ].filter(Boolean).join(" ").toLowerCase();

    for(const pagina in PAGINAS){
      if(textoBusca.includes(pagina.toLowerCase())){
        return PAGINAS[pagina];
      }
    }

    const tip = normalizarTexto(btn.getAttribute("data-tip") || btn.title || btn.textContent || "");
    return ALIAS[tip] || "";
  }

  function prepararAntiPisca(){
    if(document.getElementById("bdr-menu-padrao-unico-css")) return;

    const style = document.createElement("style");
    style.id = "bdr-menu-padrao-unico-css";
    style.textContent = `
      .bdr-menu:not(.bdr-menu-pronto) .bdr-menu-btn{
        visibility:hidden !important;
      }

      .bdr-menu.bdr-menu-pronto .bdr-menu-btn{
        visibility:visible;
      }

      .bdr-menu-btn.bdr-menu-oculto-real{
        display:none !important;
        visibility:hidden !important;
        opacity:0 !important;
        pointer-events:none !important;
        width:0 !important;
        min-width:0 !important;
        height:0 !important;
        min-height:0 !important;
        padding:0 !important;
        margin:0 !important;
        overflow:hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  function ocultar(btn){
    if(btn.dataset.bdrMenuEstado === "0") return;

    btn.dataset.bdrMenuEstado = "0";
    btn.classList.add("bdr-menu-oculto-real");
    btn.hidden = true;
    btn.setAttribute("aria-hidden", "true");
  }

  function mostrar(btn){
    if(btn.dataset.bdrMenuEstado === "1") return;

    btn.dataset.bdrMenuEstado = "1";
    btn.classList.remove("bdr-menu-oculto-real");
    btn.hidden = false;
    btn.removeAttribute("aria-hidden");
  }

  function aplicarMenu(){
    prepararAntiPisca();

    const u = usuarioAtual();
    const ps = permissoesUsuario(u);
    const owner = ehOwner(u);

    document.querySelectorAll(".bdr-menu .bdr-menu-btn").forEach(btn => {
      const perm = detectarPermissaoDoBotao(btn);

      if(!perm){
        mostrar(btn);
        return;
      }

      const pode = owner || ps.includes(normalizarPermissao(perm));

      if(pode) mostrar(btn);
      else ocultar(btn);
    });

    document.querySelectorAll(".bdr-menu").forEach(menu => {
      menu.classList.add("bdr-menu-pronto");
    });
  }

  function bloquearPagina(){
    const pagina = paginaAtual();
    const precisa = PAGINAS[pagina];

    if(!precisa) return true;
    if(temPermissao(precisa)) return true;

    alert("Você não tem permissão para acessar esta tela.");

    if(temPermissao("DASHBOARD_VER") && pagina !== "dashboard.html"){
      location.href = "dashboard.html";
    }else{
      location.href = "login.html";
    }

    return false;
  }

  function rodar(){
    aplicarMenu();
    bloquearPagina();
  }

  window.bdrAplicarMenuPadraoUnico = rodar;
  window.bdrAplicarMenuOcultoVerdade = aplicarMenu;
  window.bdrMenuHardFixAplicar = rodar;
  window.aplicarMenuPorPermissaoBDR = aplicarMenu;

  prepararAntiPisca();

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){
      rodar();
      setTimeout(rodar, 250);
    });
  }else{
    rodar();
    setTimeout(rodar, 250);
  }

  window.addEventListener("load", function(){
    rodar();
    setTimeout(rodar, 500);
  });

  window.addEventListener("storage", function(){
    setTimeout(rodar, 100);
  });
})();
