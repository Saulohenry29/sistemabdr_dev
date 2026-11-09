
/* =========================================================
   BDR SIENGE INSUMO - SALVAR NAS 2 BASES OFICIAIS
   Regra:
   - sienge_codigos: lista/consulta do modal
   - sienge_insumos: motor premium
========================================================= */
(function(){
  "use strict";

  function bdrNormInsumoSalvar(txt){
    return String(txt || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/ESMERILHADEIRA/g, "ESMERILADORA")
      .replace(/ESMERILHADORA/g, "ESMERILADORA")
      .replace(/ESMERILADEIRA/g, "ESMERILADORA")
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function salvarInsumoNasDuasBasesBDR(){
    const id = String(valor("codigo_id") || "").trim();
    const tipo = String(valor("tipo_atual") || window.tipoSiengeAtual || window.tipoAtual || "").toUpperCase().trim();
    const codigo = String(valor("codigo_sienge") || "").trim();
    const descricao = String(valor("descricao_sienge") || "").trim();
    const tabelaLimpa = String(valor("tabela_ref") || "").replace(/\D/g, "").trim();

    if(tipo !== "INSUMO"){
      return false;
    }

    if(!codigo || !descricao){
      alert("Preencha Código Sienge e Descrição / referência.");
      return true;
    }

    if(tabelaLimpa !== "2" && tabelaLimpa !== "3"){
      alert("Para INSUMO, selecione Tabela 2 ou Tabela 3.");
      return true;
    }

    const payloadCodigos = {
      tipo: "INSUMO",
      codigo,
      descricao,
      tabela_ref: tabelaLimpa,
      ativo: true
    };

    let respCodigos;

    if(id){
      respCodigos = await db()
        .from("sienge_codigos")
        .update(payloadCodigos)
        .eq("id", id)
        .select();
    }else{
      respCodigos = await db()
        .from("sienge_codigos")
        .upsert([payloadCodigos], {
          onConflict: "tipo,codigo,tabela_ref,descricao"
        })
        .select();

      if(respCodigos.error){
        respCodigos = await db()
          .from("sienge_codigos")
          .insert([payloadCodigos])
          .select();
      }
    }

    if(respCodigos.error){
      console.error("Erro ao salvar em sienge_codigos:", respCodigos.error);
      alert("Erro ao salvar na lista Sienge: " + respCodigos.error.message);
      return true;
    }

    const payloadMotor = {
      codigo,
      descricao,
      tabela_insumo: Number(tabelaLimpa),
      descricao_normalizada: bdrNormInsumoSalvar(descricao),
      ativo: true
    };

    let respMotor = await db()
      .from("sienge_insumos")
      .upsert([payloadMotor], {
        onConflict: "codigo,tabela_insumo,descricao"
      })
      .select();

    if(respMotor.error){
      respMotor = await db()
        .from("sienge_insumos")
        .insert([payloadMotor])
        .select();
    }

    if(respMotor.error){
      console.error("Erro ao salvar em sienge_insumos:", respMotor.error);
      alert("Salvou na lista, mas deu erro ao salvar no motor: " + respMotor.error.message);
      return true;
    }

    // Recarrega as duas listas
    const codResp = await db()
      .from("sienge_codigos")
      .select("*")
      .eq("ativo", true);

    if(!codResp.error){
      siengeCodigos = codResp.data || [];
    }

    if(typeof carregarSiengeInsumosPremium === "function"){
      window.siengeInsumos = [];
      try{ siengeInsumos = []; }catch(e){}
      await carregarSiengeInsumosPremium(true);
    }

    if(typeof renderizarCodigosSienge === "function"){
      renderizarCodigosSienge();
    }

    if(typeof limparFormularioSiengeBDR === "function"){
      limparFormularioSiengeBDR();
    }else if(typeof limparFormularioSienge === "function"){
      limparFormularioSienge();
    }

    alert("✅ Insumo salvo na lista e no motor.");
    return true;
  }

  const salvarAnteriorBDR = window.salvarCodigoSienge;

  window.salvarCodigoSienge = async function(){
    const tratouInsumo = await salvarInsumoNasDuasBasesBDR();

    if(tratouInsumo){
      return;
    }

    if(typeof salvarAnteriorBDR === "function"){
      return await salvarAnteriorBDR();
    }

    alert("Função original salvarCodigoSienge não encontrada.");
  };

  void 0;
})();
