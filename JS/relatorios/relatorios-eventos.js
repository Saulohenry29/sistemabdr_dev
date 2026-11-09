
window.addEventListener("load", () => {
  aplicarPermissoesRelatoriosBDR();
});
document.addEventListener("keydown", e => {
  if(e.key === "Escape") fecharConferenciaPatrimonial();
});
