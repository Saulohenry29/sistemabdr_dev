/* =========================================================
   BDR ERP - ATUALIZAÇÃO DO PWA
   - No ERP: tenta avisar no sininho.
   - No login/index: mostra barra inferior.
========================================================= */

let bdrNovoWorker = null;
let bdrAtualizando = false;

function bdrMostrarAtualizacao(){
  const badge = document.getElementById("notifBadge");
  const lista = document.getElementById("notifLista");

  if(badge && lista){
    if(document.getElementById("notifPwaUpdate")) return;

    const atual = Number(String(badge.innerText || "0").replace("+","")) || 0;
    badge.innerText = atual >= 9 ? "9+" : String(atual + 1);
    badge.style.display = "inline-flex";

    if(lista.innerText.includes("Nenhuma notificação")){
      lista.innerHTML = "";
    }

    const item = document.createElement("div");
    item.className = "notif-item update-app";
    item.id = "notifPwaUpdate";
    item.innerHTML = `
      <strong>🚀 Nova versão disponível</strong>
      <span>O sistema BDR foi atualizado.</span>
      <br>
      <button class="notif-update-btn" type="button" onclick="bdrAtualizarAgora()">Atualizar agora</button>
    `;
    lista.prepend(item);
    return;
  }

  const bar = document.getElementById("bdrUpdateBar");
  if(bar){
    bar.style.display = "flex";
  }
}

function bdrAtualizarAgora(){
  if(!bdrNovoWorker){
    location.reload();
    return;
  }

  bdrAtualizando = true;
  bdrNovoWorker.postMessage({ type:"SKIP_WAITING" });
}

async function bdrRegistrarPWA(){
  if(!("serviceWorker" in navigator)) return;

  try{
    const reg = await navigator.serviceWorker.register("./service-worker.js");

    reg.addEventListener("updatefound", () => {
      const novoWorker = reg.installing;
      if(!novoWorker) return;

      novoWorker.addEventListener("statechange", () => {
        if(novoWorker.state === "installed" && navigator.serviceWorker.controller){
          bdrNovoWorker = novoWorker;
          bdrMostrarAtualizacao();
        }
      });
    });

    document.addEventListener("visibilitychange", () => {
      if(document.visibilityState === "visible"){
        reg.update();
      }
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if(bdrAtualizando) location.reload();
    });

  }catch(e){
    console.warn("PWA não registrado:", e);
  }
}

document.addEventListener("DOMContentLoaded", bdrRegistrarPWA);
