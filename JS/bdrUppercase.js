(function(){
  const CAMPOS_IGNORADOS = new Set([
    "usuario","login","senha","formUsuario","formEmail","formSenha"
  ]);

  const TIPOS_IGNORADOS = new Set([
    "email","password","number","date","time","file"
  ]);

  function deveConverter(el){
    return Boolean(
      el &&
      ["INPUT","TEXTAREA"].includes(el.tagName) &&
      !CAMPOS_IGNORADOS.has(el.id) &&
      !TIPOS_IGNORADOS.has(el.type)
    );
  }

  document.addEventListener("input", function(e){
    const el = e.target;
    if(!deveConverter(el)) return;

    const inicio = el.selectionStart;
    const fim = el.selectionEnd;
    const direcao = el.selectionDirection;
    const original = el.value;
    const convertido = original.toUpperCase();

    // Não reescreve o campo quando nada mudou. Reatribuir .value a cada
    // tecla fazia alguns navegadores/handlers enviarem o cursor ao final.
    if(convertido === original) return;

    el.value = convertido;

    if(inicio == null || fim == null) return;

    const restaurarCursor = function(){
      if(document.activeElement !== el) return;
      try{
        el.setSelectionRange(inicio, fim, direcao || "none");
      }catch(_){ }
    };

    restaurarCursor();
    queueMicrotask(restaurarCursor);
  });
})();
