(function(global){
"use strict";

/* =========================================================
   ATLAS PATRIMÔNIO — ASSISTENTE DE CADASTRO
   ---------------------------------------------------------
   Responsabilidade única:
   - reaproveitar dados de um patrimônio já conhecido;
   - preencher somente campos reutilizáveis;
   - nunca copiar identificadores únicos nem observação;
   - manter todos os campos editáveis.
========================================================= */

function el(id){ return document.getElementById(id); }

function setValor(id, valor){
  const campo = el(id);
  if(!campo || valor === null || valor === undefined || valor === "") return;
  campo.value = String(valor).toUpperCase();
}

function setValorNormal(id, valor){
  const campo = el(id);
  if(!campo || valor === null || valor === undefined || valor === "") return;
  campo.value = String(valor);
}

function formatarValor(valor){
  const n = Number(valor);
  if(!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function limparUnicos(){
  [
    "numero_serie","placa","renavam","chassi","codigo_antigo",
    "numero_nfe","quilometragem","horimetro"
  ].forEach(id => {
    const campo = el(id);
    if(campo) campo.value = "";
  });

  // Observação é sempre particular do patrimônio atual.
  const observacao = el("patrimonioObservacao");
  if(observacao) observacao.value = "";
}

function preencher(item){
  if(!item || !item.nome_bem) return false;

  const nome = el("nome_bem");
  if(nome) nome.value = String(item.nome_bem || "").toUpperCase();

  // O tipo precisa vir antes, porque ele monta Marca/Modelo/Série e campos específicos.
  const tipo = el("tipo_item");
  const tipoItem = String(item.tipo_item || "").toUpperCase();
  if(tipo && tipoItem){
    tipo.value = tipoItem;
    if(typeof global.mostrarCampos === "function") global.mostrarCampos();
  }

  if(tipoItem === "OUTRO" && item.tipo_outro) setValor("tipo_outro", item.tipo_outro);

  setValor("marca", item.marca);
  setValor("modelo", item.modelo);

  const valor = formatarValor(item.valor_bem);
  if(valor) setValorNormal("valor_bem", valor);

  if(item.estado_conservacao) setValorNormal("estado_conservacao", item.estado_conservacao);
  if(item.ncm) setValorNormal("ncm", item.ncm);

  // Campos técnicos que pertencem ao modelo, não ao exemplar individual.
  setValor("cor", item.cor);
  setValor("combustivel", item.combustivel);
  setValor("potencia", item.potencia);
  setValorNormal("ano_fabricacao", item.ano_fabricacao);
  setValorNormal("ano_modelo", item.ano_modelo);

  limparUnicos();
  global.atlasFecharAutocomplete?.("marca");
  global.atlasFecharAutocomplete?.("modelo");
  global.AtlasPatrimonioLote?.resetar?.();

  // Série é o próximo dado normalmente necessário.
  setTimeout(() => el("numero_serie")?.focus(), 30);
  return true;
}

global.AtlasPatrimonioAssistente = { preencher, limparUnicos };
console.log("✅ ATLAS PATRIMÔNIO ASSISTENTE carregado — reaproveitamento inteligente sem tabela extra");
})(window);
