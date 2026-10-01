/* =========================================================
   BDR FIX NAVEGAÇÃO FINAL
   Evita recarregar a mesma tela quando clicar em Usuários/Menu.
========================================================= */
(function(){
  function normalizarPagina(url){
    try{
      const u = new URL(url, window.location.href);
      return (u.pathname.split("/").pop() || "index.html").toLowerCase();
    }catch(e){
      return String(url || "").split("?")[0].split("#")[0].split("/").pop().toLowerCase();
    }
  }

  const irOriginal = window.ir;

  window.ir = function(pagina){
    const destino = normalizarPagina(pagina);
    const atual = normalizarPagina(window.location.href);

    if(destino && atual && destino === atual){
      if(typeof fecharUserMenu === "function") fecharUserMenu();
      if(typeof fecharNotificacoes === "function") fecharNotificacoes();
      void 0;
      return false;
    }

    if(typeof irOriginal === "function" && irOriginal !== window.ir){
      return irOriginal(pagina);
    }

    window.location.href = pagina;
  };

  document.addEventListener("click", function(e){
    const btn = e.target.closest("[onclick]");
    if(!btn) return;

    const on = btn.getAttribute("onclick") || "";
    const m = on.match(/ir\(['"]([^'"]+)['"]\)/);
    if(!m) return;

    const destino = normalizarPagina(m[1]);
    const atual = normalizarPagina(window.location.href);

    if(destino && atual && destino === atual){
      e.preventDefault();
      e.stopPropagation();
      if(typeof fecharUserMenu === "function") fecharUserMenu();
      if(typeof fecharNotificacoes === "function") fecharNotificacoes();
      void 0;
    }
  }, true);
})();