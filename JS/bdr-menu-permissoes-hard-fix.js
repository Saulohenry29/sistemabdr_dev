/* =========================================================
   BDR MENU PERMISSÕES HARD FIX V1
   - Use depois do bdrMenuPermissoes.js
   - Esconde botões do menu pelo campo usuario.permissoes
   - Bloqueia acesso direto à página sem permissão
   - Owner id=1 continua vendo tudo
========================================================= */

(function(){
  if(window.__BDR_MENU_PERMISSOES_HARD_FIX_V1__) return;
  window.__BDR_MENU_PERMISSOES_HARD_FIX_V1__ = true;

  console.log("✅ BDR MENU PERMISSÕES HARD FIX V1 carregado");

  function lerUsuario(){
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

  function normalizarPermissoes(txt){
    return String(txt || "")
      .split(",")
      .map(p => p.trim().toUpperCase())
      .filter(Boolean);
  }

  function usuarioEhOwner(u){
    return Number(u?.id) === 1 || String(u?.usuario || "").toLowerCase() === "saulo";
  }

  function temPermissao(chave){
    const u = lerUsuario();

    if(usuarioEhOwner(u)) return true;

    const permissoes = normalizarPermissoes(u.permissoes);

    // Não deixa PERFIL liberar página sozinho.
    // Quem manda é o campo permissoes salvo no banco/localStorage.
    return permissoes.includes(String(chave || "").trim().toUpperCase());
  }

  const PAGINA_PERMISSAO = {
    "dashboard.html": "DASHBOARD_VER",
    "patrimonio.html": "PATRIMONIO_VER",
    "estoque.html": "ESTOQUE_VER",
    "entrada.html": "ENTRADA_VER",
    "triagem.html": "TRIAGEM_VER",
    "expedicao.html": "EXPEDICAO_VER",
    "relatorios.html": "RELATORIOS_VER",
    "empresa.html": "EMPRESAS_VER",
    "empresas.html": "EMPRESAS_VER",
    "usuarios.html": "USUARIOS_VER",
    "prateleiras-3d.html": "ESTOQUE_VER"
  };

  function paginaAtual(){
    return (location.pathname.split("/").pop() || "dashboard.html").toLowerCase();
  }

  function aplicarMenu(){
    const u = lerUsuario();
    const permissoes = normalizarPermissoes(u.permissoes);

    document.querySelectorAll("[data-permissao]").forEach(el => {
      const chave = String(el.getAttribute("data-permissao") || "").trim().toUpperCase();

      if(!chave) return;

      const liberar = usuarioEhOwner(u) || permissoes.includes(chave);

      if(liberar){
        el.style.removeProperty("display");
        el.hidden = false;
      }else{
        el.style.setProperty("display","none","important");
        el.hidden = true;
      }
    });
  }

  function bloquearPagina(){
    const pag = paginaAtual();
    const permissao = PAGINA_PERMISSAO[pag];

    if(!permissao) return;

    if(!temPermissao(permissao)){
      alert("Você não tem permissão para acessar esta tela.");

      if(pag !== "dashboard.html" && temPermissao("DASHBOARD_VER")){
        location.href = "atlas.html?m=dashboard";
        return;
      }

      location.href = "login.html";
    }
  }

  window.bdrMenuHardFixAplicar = function(){
    aplicarMenu();
    bloquearPagina();
  };

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(window.bdrMenuHardFixAplicar, 80);
    setTimeout(window.bdrMenuHardFixAplicar, 500);
    setTimeout(window.bdrMenuHardFixAplicar, 1200);
  });

  window.addEventListener("storage", () => {
    setTimeout(window.bdrMenuHardFixAplicar, 80);
  });
})();
