/* =========================================================
   BDR SININHO SAFE EMERGENCIAL
   Objetivo: destravar o sistema.
   - Não busca Supabase
   - Não abre WebSocket
   - Não faz realtime
   - Só mantém o sininho visual funcionando sem travar páginas
========================================================= */

(function(){
  "use strict";

  if(window.__BDR_SININHO_SAFE_EMERGENCIAL__){
    return;
  }

  window.__BDR_SININHO_SAFE_EMERGENCIAL__ = true;

  function esconderBadge(){
    const badge = document.getElementById("notifBadge");
    if(badge){
      badge.innerText = "0";
      badge.style.display = "none";
    }
  }

  function renderizarMensagem(){
    const lista = document.getElementById("notifLista");
    const head = document.querySelector(".notif-head");

    if(head){
      head.innerHTML = "🔕 Central de notificações";
    }

    if(lista){
      lista.innerHTML = `
        <div class="notif-empty" style="padding:14px;font-size:12px;color:#6b7280;">
          <strong>Sininho pausado temporariamente.</strong><br>
          Sistema liberado para uso normal.<br>
          Depois ajustamos as notificações sem travar as telas.
        </div>
      `;
    }

    esconderBadge();
  }

  window.toggleNotificacoes = function(event){
    if(event) event.stopPropagation();

    const dropdown = document.getElementById("notifDropdown");
    if(!dropdown) return;

    dropdown.classList.toggle("ativo");
    document.getElementById("dropdownUser")?.classList.remove("ativo");
    document.getElementById("userDropdown")?.classList.remove("show");

    renderizarMensagem();
  };

  window.bdrLimparSininho = function(){
    esconderBadge();
    renderizarMensagem();
  };

  window.bdrAbrirNotificacao = function(){
    esconderBadge();
    renderizarMensagem();
  };

  document.addEventListener("DOMContentLoaded", () => {
    esconderBadge();
    renderizarMensagem();
  });

  document.addEventListener("click", () => {
    document.getElementById("notifDropdown")?.classList.remove("ativo");
  });

  console.log("✅ BDR Sininho SAFE emergencial carregado - sem rede/realtime.");
})();
