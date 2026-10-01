/* =========================================================
   ATLAS FISCAL V1.0 - Sprint 3.3.0
   Arquivo: JS/AtlasFiscal.js

   OBJETIVO
   Controlar a decisão de NF-e sem misturar o processo fiscal
   com a separação física do almoxarifado.

   FLUXO
   • Pedido aprovado:
     pergunta se exige NF-e.

   • Se NÃO exige:
     a separação pode terminar em AGUARDANDO_RETIRADA.

   • Se exige:
     o administrativo e o almoxarifado trabalham em paralelo.
     Após a separação, o pedido fica AGUARDANDO_NFE até a nota
     ser registrada.

   • Retirada:
     é bloqueada quando a NF-e é obrigatória e ainda não foi emitida.
========================================================= */
(function(){
  "use strict";

  if(window.AtlasFiscal?.__loaded) return;

  const AtlasFiscal = {
    __loaded:true,
    versao:"1.0-sprint-3.3.0"
  };

  function db(){
    return window.client || window.supabaseClient || window.clientSupabase || globalThis.client;
  }

  function usuarioAtual(){
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        localStorage.getItem("usuarioAtual") ||
        "null"
      );
    }catch(e){ return null; }
  }

  function nomeUsuario(){
    const u = usuarioAtual();
    return u?.nome || u?.usuario || "SISTEMA";
  }

  async function buscarPedido(pedidoId){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const {data,error} = await banco
      .from("pedidos_retirada")
      .select("*")
      .eq("id",pedidoId)
      .single();

    if(error) throw error;
    return data;
  }

  /*
   * Salva a resposta dada depois da aprovação.
   *
   * exigeNfe=true  -> AGUARDANDO_NFE
   * exigeNfe=false -> NAO_EXIGIDA
   */
  async function definirExigenciaNfe(pedidoId, exigeNfe, motivoSemNfe=""){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const payload = {
      exige_nfe: !!exigeNfe,
      status_fiscal: exigeNfe ? "AGUARDANDO_NFE" : "NAO_EXIGIDA",
      motivo_sem_nfe: exigeNfe ? null : (motivoSemNfe || "NF-e não exigida neste pedido."),
      usuario_decisao_nfe: nomeUsuario(),
      data_decisao_nfe: new Date().toISOString()
    };

    const {error} = await banco
      .from("pedidos_retirada")
      .update(payload)
      .eq("id",pedidoId);

    if(error){
      if(String(error.message || "").toLowerCase().includes("column")){
        throw new Error("Execute primeiro o arquivo SQL_ATLAS_FISCAL_3_3_0.sql no Supabase.");
      }
      throw error;
    }

    return payload;
  }

  /*
   * Registra os dados principais da NF-e emitida no portal externo.
   * Nesta Sprint ainda não fazemos integração direta com a SEFAZ.
   */
  async function registrarNfe(pedidoId, dados={}){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const numero = String(dados.numero_nfe || "").trim();
    const serie = String(dados.serie_nfe || "").trim();
    const chave = String(dados.chave_nfe || "").replace(/\D/g,"");

    if(!numero) throw new Error("Informe o número da NF-e.");
    if(!serie) throw new Error("Informe a série da NF-e.");
    if(chave && chave.length !== 44){
      throw new Error("A chave da NF-e deve possuir 44 números.");
    }

    const pedido = await buscarPedido(pedidoId);

    const payload = {
      numero_nfe:numero,
      serie_nfe:serie,
      chave_nfe:chave || null,
      status_fiscal:"NFE_EMITIDA",
      usuario_registro_nfe:nomeUsuario(),
      data_registro_nfe:new Date().toISOString()
    };

    // Se a separação já terminou, a nota libera o pedido para retirada.
    if(String(pedido.status || "").toUpperCase() === "AGUARDANDO_NFE"){
      payload.status = "AGUARDANDO_RETIRADA";
    }

    const {error} = await banco
      .from("pedidos_retirada")
      .update(payload)
      .eq("id",pedidoId);

    if(error) throw error;
    return payload;
  }

  /*
   * Regra central de segurança antes de entregar ao motorista.
   */
  async function validarLiberacaoRetirada(pedidoId){
    const pedido = await buscarPedido(pedidoId);

    if(pedido.exige_nfe === true &&
       String(pedido.status_fiscal || "").toUpperCase() !== "NFE_EMITIDA"){
      throw new Error(
        "Retirada bloqueada: este pedido exige NF-e e a nota ainda não foi registrada."
      );
    }

    return {ok:true,pedido};
  }

  /*
   * Ajusta o status depois que o almoxarifado conclui a separação.
   */
  async function ajustarStatusDepoisSeparacao(pedidoId){
    const banco = db();
    const pedido = await buscarPedido(pedidoId);

    const exige = pedido.exige_nfe === true;
    const fiscalOk = String(pedido.status_fiscal || "").toUpperCase() === "NFE_EMITIDA";
    const novoStatus = exige && !fiscalOk ? "AGUARDANDO_NFE" : "AGUARDANDO_RETIRADA";

    const {error} = await banco
      .from("pedidos_retirada")
      .update({status:novoStatus})
      .eq("id",pedidoId);

    if(error) throw error;
    return novoStatus;
  }

  AtlasFiscal.buscarPedido = buscarPedido;
  AtlasFiscal.definirExigenciaNfe = definirExigenciaNfe;
  AtlasFiscal.registrarNfe = registrarNfe;
  AtlasFiscal.validarLiberacaoRetirada = validarLiberacaoRetirada;
  AtlasFiscal.ajustarStatusDepoisSeparacao = ajustarStatusDepoisSeparacao;

  window.AtlasFiscal = AtlasFiscal;

  /*
   * Integração não invasiva com a logística existente.
   * Preservamos os arquivos atuais e adicionamos a regra fiscal por cima.
   */
  function integrarLogistica(){
    if(!window.AtlasLogistica) return false;
    if(window.AtlasLogistica.__fiscalIntegrado) return true;

    const enviarOriginal = window.AtlasLogistica.enviarPedido;

    if(typeof enviarOriginal === "function"){
      window.AtlasLogistica.enviarPedido = async function(pedidoId,dadosTransporte){
        await validarLiberacaoRetirada(pedidoId);
        return await enviarOriginal.call(window.AtlasLogistica,pedidoId,dadosTransporte);
      };
    }

    window.AtlasLogistica.__fiscalIntegrado = true;
    return true;
  }

  if(!integrarLogistica()){
    window.addEventListener("load",()=>setTimeout(integrarLogistica,100));
    setTimeout(integrarLogistica,500);
  }

  void 0;
})();