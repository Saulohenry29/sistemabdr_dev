function itensEmEstoqueGeral(){
  return patrimonioPorFiltrosTela().filter(p => p.status === "ESTOQUE");
}

function chaveAgrupamentoEstoque(p){
  /*
    Agrupa por tipo + nome + marca + modelo.
    Assim itens repetidos contam quantidade.
  */
  return [
    p.tipo_item || "",
    p.nome_bem || "",
    p.marca || "",
    p.modelo || ""
  ].join("|").toUpperCase();
}

function gruposEstoque(){
  const itens = itensEmEstoqueGeral();
  const mapa = {};

  itens.forEach(p => {
    const chave = chaveAgrupamentoEstoque(p);

    if(!mapa[chave]){
      mapa[chave] = {
        chave,
        nome_bem:p.nome_bem || "-",
        tipo_item:p.tipo_item || "-",
        marca:p.marca || "-",
        modelo:p.modelo || "-",
        obra_id:p.obra_id,
        qtd:0,
        itens:[]
      };
    }

    mapa[chave].qtd++;
    mapa[chave].itens.push(p);
  });

  return Object.values(mapa);
}

function nivelEstoqueGrupo(g){
  /*
    Regra simples:
    Baixo: 1 unidade
    Médio: 2 a 4 unidades
    Muito: 5 ou mais unidades
  */
  if(g.qtd <= 1) return "BAIXO";
  if(g.qtd <= 4) return "MEDIO";
  return "MUITO";
}

function gerarEstoqueNivel(){
  const grupos = gruposEstoque();

  const baixo = grupos.filter(g => nivelEstoqueGrupo(g) === "BAIXO").length;
  const medio = grupos.filter(g => nivelEstoqueGrupo(g) === "MEDIO").length;
  const muito = grupos.filter(g => nivelEstoqueGrupo(g) === "MUITO").length;

  document.getElementById("estoqueTotalGeral").innerText =
    itensEmEstoqueGeral().length + " item(ns)";

  document.getElementById("estoqueBaixo").innerText = baixo;
  document.getElementById("estoqueMedio").innerText = medio;
  document.getElementById("estoqueMuito").innerText = muito;
}
