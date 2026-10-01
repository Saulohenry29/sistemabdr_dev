/* =========================================================
   ATLAS / BDR - AMBIENTE E ORIGEM
   Arquivo oficial: JS/atlasAmbienteDominio.js

   REGRA PRINCIPAL
   O Atlas usa SEMPRE a origem da página atual.

   Exemplos:
   http://127.0.0.1:5501
   https://www.sathtech.com.br
   https://bdrgestao.com.br

   Assim LOCAL, DEV e PRODUÇÃO permanecem separados
   automaticamente, sem domínio fixo neste arquivo.
========================================================= */
(function(global){
  "use strict";

  if(global.AtlasAmbienteDominio?.__loaded){
    return;
  }

  function origemAtual(){
    const origem=String(global.location?.origin || "").trim();

    if(!origem || origem==="null"){
      throw new Error(
        "Não foi possível identificar a origem atual do Atlas."
      );
    }

    return origem.replace(/\/+$/,'');
  }

  function ambienteAtual(){
    const host=String(global.location?.hostname || "")
      .trim()
      .toLowerCase();

    if(
      host==="localhost" ||
      host==="127.0.0.1" ||
      host==="::1" ||
      host==="[::1]"
    ){
      return "LOCAL";
    }

    return "PUBLICADO";
  }

  function urlPublica(caminho=""){
    const base=origemAtual();
    const relativo=String(caminho || "").replace(/^\/+/,"");

    return relativo
      ? `${base}/${relativo}`
      : base;
  }

  function urlFornecedor(token){
    const valor=String(token || "").trim();

    if(!valor){
      throw new Error("Token do fornecedor não informado.");
    }

    return urlPublica(
      `manutencaobdr-fornecedor.html?t=${encodeURIComponent(valor)}`
    );
  }

  function resumo(){
    return Object.freeze({
      ambiente:ambienteAtual(),
      origem:origemAtual(),
      host:String(global.location?.hostname || "")
    });
  }

  global.AtlasAmbienteDominio=Object.freeze({
    __loaded:true,
    origemAtual,
    ambienteAtual,
    urlPublica,
    urlFornecedor,
    resumo
  });

  console.info(
    "✅ ATLAS AMBIENTE/ORIGEM carregado",
    global.AtlasAmbienteDominio.resumo()
  );

})(window);
