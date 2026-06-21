/* BDR ERP - Instalação PWA */
let bdrInstallPrompt = null;

function bdrEhIOS(){
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function bdrEhStandalone(){
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function bdrMostrarBotaoInstalar(){
  const btn = document.getElementById("btnInstalarApp") || document.getElementById("btnInstall");
  if(btn && !bdrEhStandalone()) btn.style.display = "inline-flex";
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  bdrInstallPrompt = event;
  bdrMostrarBotaoInstalar();
});

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnInstalarApp") || document.getElementById("btnInstall");
  if(!btn) return;

  if(bdrEhStandalone()){
    btn.style.display = "none";
    return;
  }

  bdrMostrarBotaoInstalar();

  btn.addEventListener("click", async () => {
    if(bdrInstallPrompt){
      bdrInstallPrompt.prompt();
      await bdrInstallPrompt.userChoice;
      bdrInstallPrompt = null;
      return;
    }

    if(bdrEhIOS()){
      alert("No iPhone: abra pelo Safari, toque em Compartilhar e escolha 'Adicionar à Tela de Início'. No Chrome do iPhone nem sempre aparece a instalação.");
      return;
    }

    alert("Use o menu do navegador e escolha 'Instalar aplicativo' ou 'Adicionar à tela inicial'.");
  });
});
