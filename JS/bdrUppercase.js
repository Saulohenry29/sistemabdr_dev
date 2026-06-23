(function(){
  document.addEventListener("input", function(e){
    const el = e.target;

    if(!el || !["INPUT","TEXTAREA"].includes(el.tagName)) return;

    const ignorar = [
      "usuario","login","senha","formUsuario","formEmail","formSenha"
    ];

    if(ignorar.includes(el.id)) return;
    if(["email","password","number","date","time","file"].includes(el.type)) return;

    const pos = el.selectionStart;
    el.value = el.value.toUpperCase();
    try{ el.setSelectionRange(pos, pos); }catch(e){}
  });
})();