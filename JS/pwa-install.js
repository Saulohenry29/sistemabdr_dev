/* =========================================================
   BDR ERP - BOTÃO INSTALAR APLICATIVO
========================================================= */

let bdrInstallPrompt = null;

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  bdrInstallPrompt = event;

  const btn = document.getElementById("btnInstalarApp");
  if(btn){
    btn.style.display = "block";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnInstalarApp");
  if(!btn) return;

  btn.addEventListener("click", async () => {
    if(!bdrInstallPrompt){
      alert("Se o botão não abrir a instalação, use o menu do navegador e escolha 'Instalar aplicativo' ou 'Adicionar à tela inicial'.");
      return;
    }

    bdrInstallPrompt.prompt();
    await bdrInstallPrompt.userChoice;
    bdrInstallPrompt = null;
  });
});
