/* =========================================================
   ATLAS MOTION V1.1
   Biblioteca visual do Atlas SaaS
   - pop: confirmação em botão
   - pulse: destaque em contador/carrinho/sininho
   - shake: erro/atenção
   - highlight: destaque temporário
========================================================= */
(function(){
  "use strict";

  if(window.AtlasMotion && window.AtlasMotion.__loaded && window.AtlasMotion.versao === "1.1") return;

  function ensureCss(){
    if(document.getElementById("atlasMotionCss")) return;
    const css = document.createElement("style");
    css.id = "atlasMotionCss";
    css.textContent = `
      @keyframes atlasMotionPop{
        0%{transform:scale(.86)}
        55%{transform:scale(1.18)}
        100%{transform:scale(1)}
      }
      @keyframes atlasMotionPulse{
        0%{transform:scale(1)}
        45%{transform:scale(1.22)}
        100%{transform:scale(1)}
      }
      @keyframes atlasMotionShake{
        0%,100%{transform:translateX(0)}
        20%{transform:translateX(-5px)}
        40%{transform:translateX(5px)}
        60%{transform:translateX(-4px)}
        80%{transform:translateX(4px)}
      }
      @keyframes atlasMotionHighlight{
        0%{box-shadow:0 0 0 0 rgba(37,99,235,.0)}
        35%{box-shadow:0 0 0 6px rgba(37,99,235,.18)}
        100%{box-shadow:0 0 0 0 rgba(37,99,235,.0)}
      }
      .atlas-motion-pop{animation:atlasMotionPop .28s ease-out!important;}
      .atlas-motion-pulse{animation:atlasMotionPulse .32s ease-out!important;}
      .atlas-motion-shake{animation:atlasMotionShake .34s ease-out!important;}
      .atlas-motion-highlight{animation:atlasMotionHighlight .9s ease-out!important;}
    `;
    document.head.appendChild(css);
  }

  function run(el, classe, tempo){
    ensureCss();
    if(!el) return;
    el.classList.remove(classe);
    void el.offsetWidth;
    el.classList.add(classe);
    setTimeout(()=>el.classList.remove(classe), tempo || 500);
  }

  function pop(el){ run(el, "atlas-motion-pop", 360); }
  function pulse(el){ run(el, "atlas-motion-pulse", 400); }
  function shake(el){ run(el, "atlas-motion-shake", 450); }
  function highlight(el){ run(el, "atlas-motion-highlight", 950); }

  window.AtlasMotion = { __loaded:true, versao:"1.1", pop, pulse, shake, highlight };
  void 0;
})();
