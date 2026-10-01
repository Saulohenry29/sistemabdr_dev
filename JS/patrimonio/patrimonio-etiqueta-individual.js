/* =========================================================
   ATLAS ETIQUETA INDIVIDUAL RÁPIDA V1
   Arquivo: JS/patrimonio/patrimonio-etiqueta-individual.js

   Objetivo:
   - manter o iframe vivo depois da primeira abertura;
   - enviar os dados já carregados do patrimônio;
   - não consultar patrimônio novamente no Supabase;
   - mostrar a prévia somente quando configuração + QR estiverem prontos;
   - preservar ENTER para imprimir e ESC para fechar.
========================================================= */
(function(global){
  "use strict";

  if(global.AtlasEtiquetaIndividualRapida?.__loaded) return;

  let bridgePronta = false;
  let etiquetaPronta = false;
  let carregandoFrame = false;
  let tokenAtual = 0;
  let timerFalha = null;
  let dadosPendentes = null;

  const FRAME_URL =
    "etiqueta-impressao.html?embed=1&preview=1&fast=1";

  function patrimonioAtual(){
    try{
      if(typeof patrimonioSelecionado !== "undefined"){
        return patrimonioSelecionado || null;
      }
    }catch(e){}

    return global.patrimonioSelecionado || null;
  }

  function codigoAtual(){
    const p = patrimonioAtual() || {};

    return String(
      p.codigo_qr ||
      p.codigo_antigo ||
      p.codigo_bem ||
      ""
    ).trim();
  }

  function definirEstado(pronta, texto){
    const modal = document.getElementById("modalEtiquetaBg");
    const botao = document.getElementById(
      "btnImprimirEtiquetaOficial"
    );
    const status = document.getElementById(
      "statusEtiquetaOficial"
    );

    etiquetaPronta = !!pronta;

    if(modal){
      modal.classList.toggle(
        "atlas-etiqueta-carregando",
        !pronta
      );

      modal.classList.toggle(
        "atlas-etiqueta-pronta",
        pronta
      );
    }

    if(botao){
      botao.disabled = !pronta;
      botao.textContent = pronta
        ? "🖨 Imprimir etiqueta"
        : "⏳ Preparando etiqueta...";
    }

    if(status){
      status.textContent =
        texto ||
        (pronta
          ? "Prévia pronta para impressão."
          : "Preparando configuração e QR Code...");

      status.classList.toggle("pronto", pronta);
    }
  }

  function dadosDaEtiqueta(token){
    const p = patrimonioAtual() || {};
    const codigo = codigoAtual();

    return {
      token,
      codigo,
      codigo_qr:codigo,
      item:p.nome_bem || "ITEM",
      nome_bem:p.nome_bem || "ITEM",
      local:
        p.localizacao ||
        p.obra_nome ||
        "SEM OBRA",
      localizacao:
        p.localizacao ||
        p.obra_nome ||
        "SEM OBRA",
      obra_id:p.obra_id || null,
      perfil_id:p.perfil_impressao_id || null
    };
  }

  function enviarDados(){
    if(!bridgePronta || !dadosPendentes) return;

    const frame = document.getElementById("bdrEtiquetaFrame");
    if(!frame?.contentWindow) return;

    frame.contentWindow.postMessage(
      {
        tipo:"ATLAS_ETIQUETA_ATUALIZAR",
        dados:dadosPendentes
      },
      location.origin
    );
  }

  function garantirFrame(){
    const frame = document.getElementById("bdrEtiquetaFrame");
    if(!frame) return false;

    if(bridgePronta){
      enviarDados();
      return true;
    }

    if(carregandoFrame) return true;

    carregandoFrame = true;

    frame.onload = () => {
      /*
       * O documento carregou. A confirmação oficial ainda virá por
       * ATLAS_ETIQUETA_BRIDGE_PRONTA.
       */
    };

    frame.onerror = () => {
      carregandoFrame = false;
      bridgePronta = false;
      definirEstado(false, "Falha ao carregar a prévia.");
    };

    frame.src = FRAME_URL;

    return true;
  }

  function abrir(){
    const codigo = codigoAtual();

    if(!codigo){
      if(typeof global.atlasAvisoEtiqueta === "function"){
        global.atlasAvisoEtiqueta(
          "Esse patrimônio não possui código para imprimir etiqueta."
        );
      }else{
        alert(
          "Esse patrimônio não possui código para imprimir etiqueta."
        );
      }
      return;
    }

    const modal = document.getElementById("modalEtiquetaBg");

    if(!modal){
      alert("A área de impressão não foi carregada.");
      return;
    }

    tokenAtual += 1;
    dadosPendentes = dadosDaEtiqueta(tokenAtual);

    clearTimeout(timerFalha);
    definirEstado(false, "Preparando etiqueta...");
    modal.classList.add("ativo");

    garantirFrame();
    enviarDados();

    timerFalha = setTimeout(() => {
      if(!etiquetaPronta){
        definirEstado(
          false,
          "A prévia está demorando mais que o normal."
        );
      }
    }, 8000);
  }

  function fechar(){
    tokenAtual += 1;
    dadosPendentes = null;
    etiquetaPronta = false;

    clearTimeout(timerFalha);

    document.getElementById("modalEtiquetaBg")
      ?.classList.remove(
        "ativo",
        "atlas-etiqueta-pronta",
        "atlas-etiqueta-carregando"
      );
  }

  function imprimir(){
    if(!etiquetaPronta){
      if(typeof global.atlasAvisoEtiqueta === "function"){
        global.atlasAvisoEtiqueta(
          "A etiqueta ainda está sendo preparada."
        );
      }
      return;
    }

    const frame = document.getElementById("bdrEtiquetaFrame");

    if(!frame?.contentWindow){
      alert("A prévia da etiqueta não está disponível.");
      return;
    }

    try{
      frame.contentWindow.focus();
      frame.contentWindow.postMessage(
        {tipo:"ATLAS_ETIQUETA_IMPRIMIR"},
        location.origin
      );

      setTimeout(fechar, 700);
    }catch(error){
      console.error(
        "ATLAS: falha ao imprimir etiqueta individual.",
        error
      );
      definirEstado(false, "Falha ao abrir a impressão.");
    }
  }

  global.addEventListener("message", event => {
    if(event.origin !== location.origin) return;

    const mensagem = event.data || {};

    if(mensagem.tipo === "ATLAS_ETIQUETA_BRIDGE_PRONTA"){
      bridgePronta = true;
      carregandoFrame = false;
      enviarDados();
      return;
    }

    if(mensagem.tipo === "ATLAS_ETIQUETA_PRONTA"){
      const tokenRecebido = Number(mensagem.token || 0);

      if(
        tokenRecebido &&
        tokenRecebido !== Number(tokenAtual)
      ){
        return;
      }

      clearTimeout(timerFalha);
      definirEstado(
        true,
        "Prévia pronta. Confira e clique em imprimir."
      );
      return;
    }

    if(mensagem.tipo === "ATLAS_ETIQUETA_ERRO"){
      definirEstado(
        false,
        "Não foi possível preparar a etiqueta."
      );
    }
  });

  /*
   * Substitui apenas as funções públicas da etiqueta individual.
   * Todo o restante do patrimônio permanece intacto.
   */
  global.abrirModalEtiquetaBDR = abrir;
  global.fecharModalEtiqueta = fechar;
  global.imprimirEtiquetaModalBDR = imprimir;

  document.addEventListener("keydown", event => {
    const modal = document.getElementById("modalEtiquetaBg");
    if(!modal?.classList.contains("ativo")) return;

    if(event.key === "Escape"){
      event.preventDefault();
      event.stopImmediatePropagation();
      fechar();
      return;
    }

    if(event.key === "Enter"){
      event.preventDefault();
      event.stopImmediatePropagation();

      if(etiquetaPronta){
        imprimir();
      }
    }
  }, true);

  global.AtlasEtiquetaIndividualRapida = {
    __loaded:true,
    versao:"1.0",
    abrir,
    fechar,
    imprimir,
    reiniciarFrame(){
      const frame = document.getElementById("bdrEtiquetaFrame");

      bridgePronta = false;
      carregandoFrame = false;

      if(frame){
        frame.removeAttribute("src");
      }
    }
  };

  void 0;
})(window);
