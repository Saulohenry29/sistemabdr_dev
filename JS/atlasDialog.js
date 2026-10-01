/* =========================================================
   ATLAS DIALOG V1.0
   Padroniza mensagens da tela sem usar o popup visual nativo.
   - alert(...) passa a abrir um modal Atlas.
   - bdrConfirmarAtlas(...) retorna Promise<boolean>.
========================================================= */
(function(){
  "use strict";

  function garantirEstrutura(){
    if(document.getElementById("atlasDialogBg")) return;

    const style = document.createElement("style");
    style.textContent = `
      .atlas-dialog-bg{position:fixed;inset:0;background:rgba(15,23,42,.62);z-index:300000;display:none;align-items:center;justify-content:center;padding:16px}
      .atlas-dialog-bg.ativo{display:flex}
      .atlas-dialog{width:min(440px,94vw);background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.34);overflow:hidden;border-left:5px solid #b91c1c}
      .atlas-dialog-head{display:flex;align-items:center;gap:10px;padding:15px 16px;border-bottom:1px solid #e5e7eb}
      .atlas-dialog-icon{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#fee2e2;color:#991b1b;font-size:19px;flex:0 0 auto}
      .atlas-dialog-title{margin:0;color:#111827;font-size:17px;font-weight:900}
      .atlas-dialog-text{padding:16px;color:#374151;line-height:1.5;font-size:14px;white-space:pre-line;max-height:55vh;overflow:auto}
      .atlas-dialog-actions{display:flex;justify-content:flex-end;gap:9px;padding:12px 16px;background:#f8fafc;border-top:1px solid #e5e7eb}
      .atlas-dialog-actions button{border:0;border-radius:11px;padding:10px 16px;font-weight:900;cursor:pointer}
      .atlas-dialog-cancel{background:#e5e7eb;color:#374151}.atlas-dialog-ok{background:#b91c1c;color:#fff}
      .atlas-dialog.success .atlas-dialog{border-left-color:#16a34a}.atlas-dialog.success .atlas-dialog-icon{background:#dcfce7;color:#166534}
      .atlas-dialog.warning .atlas-dialog{border-left-color:#f59e0b}.atlas-dialog.warning .atlas-dialog-icon{background:#fef3c7;color:#92400e}
      .atlas-dialog.info .atlas-dialog{border-left-color:#2563eb}.atlas-dialog.info .atlas-dialog-icon{background:#dbeafe;color:#1d4ed8}
    `;
    document.head.appendChild(style);

    const bg = document.createElement("div");
    bg.id = "atlasDialogBg";
    bg.className = "atlas-dialog-bg";
    bg.innerHTML = `
      <div class="atlas-dialog" role="dialog" aria-modal="true" aria-labelledby="atlasDialogTitle">
        <div class="atlas-dialog-head"><div class="atlas-dialog-icon" id="atlasDialogIcon">!</div><h3 class="atlas-dialog-title" id="atlasDialogTitle">Aviso Atlas</h3></div>
        <div class="atlas-dialog-text" id="atlasDialogText"></div>
        <div class="atlas-dialog-actions"><button class="atlas-dialog-cancel" id="atlasDialogCancel" type="button">Cancelar</button><button class="atlas-dialog-ok" id="atlasDialogOk" type="button">Entendi</button></div>
      </div>`;
    document.body.appendChild(bg);
  }

  function tipoDaMensagem(msg){
    const texto = String(msg || "").toLowerCase();
    if(texto.includes("sucesso") || texto.includes("conclu") || texto.includes("salv")) return "success";
    if(texto.includes("atenção") || texto.includes("possível") || texto.includes("offline")) return "warning";
    if(texto.includes("não tem permissão") || texto.includes("erro") || texto.includes("bloque")) return "error";
    return "info";
  }

  function abrir(opcoes){
    garantirEstrutura();
    const bg = document.getElementById("atlasDialogBg");
    const titulo = document.getElementById("atlasDialogTitle");
    const texto = document.getElementById("atlasDialogText");
    const icon = document.getElementById("atlasDialogIcon");
    const btnOk = document.getElementById("atlasDialogOk");
    const btnCancel = document.getElementById("atlasDialogCancel");
    const tipo = opcoes.tipo || tipoDaMensagem(opcoes.mensagem);

    bg.className = "atlas-dialog-bg ativo " + tipo;
    titulo.textContent = opcoes.titulo || (opcoes.confirmacao ? "Confirmação Atlas" : "Aviso Atlas");
    texto.textContent = String(opcoes.mensagem || "");
    icon.textContent = tipo === "success" ? "✓" : tipo === "warning" ? "!" : tipo === "info" ? "i" : "×";
    btnOk.textContent = opcoes.textoOk || (opcoes.confirmacao ? "Confirmar" : "Entendi");
    btnCancel.style.display = opcoes.confirmacao ? "inline-flex" : "none";

    return new Promise(resolve => {
      let finalizado = false;
      const fechar = resposta => {
        if(finalizado) return;
        finalizado = true;
        bg.className = "atlas-dialog-bg";
        btnOk.onclick = null;
        btnCancel.onclick = null;
        document.removeEventListener("keydown", teclado, true);
        resolve(resposta);
      };
      const teclado = event => {
        if(event.key === "Escape") fechar(false);
        if(event.key === "Enter"){ event.preventDefault(); fechar(true); }
      };
      btnOk.onclick = () => fechar(true);
      btnCancel.onclick = () => fechar(false);
      document.addEventListener("keydown", teclado, true);
      setTimeout(() => btnOk.focus(), 30);
    });
  }

  function documentoShell(){
    try{
      if(window.parent && window.parent !== window && window.parent.document){
        return window.parent.document;
      }
    }catch(_){}
    return document;
  }

  function mostrarFeedback(mensagem,tipo,duracao=3600){
    const doc=documentoShell();
    const slot=doc.getElementById("atlasFeedbackSlot");
    if(!slot){
      // Fora da shell, mantém o aviso Atlas já existente.
      return abrir({mensagem,tipo,confirmacao:false});
    }

    let el=doc.getElementById("atlasFeedbackGlobal");
    if(!el){
      el=doc.createElement("div");
      el.id="atlasFeedbackGlobal";
      el.className="atlas-feedback";
      el.innerHTML='<span class="atlas-feedback-icon"></span><span class="atlas-feedback-text"></span>';
      slot.appendChild(el);
    }

    const classe=tipo || tipoDaMensagem(mensagem);
    const icone=classe==="success"?"✓":classe==="error"?"×":classe==="warning"?"!":"i";
    el.className="atlas-feedback "+classe;
    el.querySelector(".atlas-feedback-icon").textContent=icone;
    el.querySelector(".atlas-feedback-text").textContent=String(mensagem||"");

    // Reinicia animação sem criar outro componente.
    void el.offsetWidth;
    el.classList.add("ativo");

    const host=(doc.defaultView || window);
    clearTimeout(host.__atlasFeedbackTimer);
    host.__atlasFeedbackTimer=setTimeout(()=>el.classList.remove("ativo"),Math.max(1200,Number(duracao)||3600));
    return Promise.resolve(true);
  }

  window.bdrAvisoAtlas = function(mensagem, titulo="Aviso Atlas", tipo, duracao=3600){
    return mostrarFeedback(mensagem,tipo || tipoDaMensagem(mensagem),duracao);
  };

  window.AtlasFeedback={
    sucesso:(mensagem,duracao)=>mostrarFeedback(mensagem,"success",duracao),
    erro:(mensagem,duracao)=>mostrarFeedback(mensagem,"error",duracao),
    aviso:(mensagem,duracao)=>mostrarFeedback(mensagem,"warning",duracao),
    info:(mensagem,duracao)=>mostrarFeedback(mensagem,"info",duracao)
  };

  window.bdrConfirmarAtlas = function(mensagem, titulo="Confirmação Atlas", textoOk="Confirmar"){
    return abrir({mensagem, titulo, tipo:"warning", confirmacao:true, textoOk});
  };

  // Compatibilidade: alertas antigos da página passam a usar o padrão Atlas.
  window.alert = function(mensagem){
    window.bdrAvisoAtlas(mensagem);
  };
})();
