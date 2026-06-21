/* BDR ERP - Instalação PWA */
let bdrInstallPrompt = null;

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  bdrInstallPrompt = event;

  const btn = document.getElementById("btnInstalarApp");
  if(btn){
    btn.style.display = "inline-flex";
  }
});

async function bdrInstalarApp(){
  if(!bdrInstallPrompt){
    alert("Se o app já estiver instalado, abra pelo ícone do celular. No iPhone, use Compartilhar > Adicionar à Tela de Início.");
    return;
  }

  bdrInstallPrompt.prompt();
  await bdrInstallPrompt.userChoice;
  bdrInstallPrompt = null;
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnInstalarApp");
  if(btn){
    btn.addEventListener("click", bdrInstalarApp);
  }
});