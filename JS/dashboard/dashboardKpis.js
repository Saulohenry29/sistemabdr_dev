function atualizarTudo(){
  atualizarKPIs();
  gerarGraficos();
  gerarIA();
  gerarAlertas();
  gerarEstoqueNivel();
  gerarUltimasMov();
  gerarTopObrasValor();
  gerarTopObrasQuantidade();
  const elPeriodo = document.getElementById('periodoSelecionadoTexto');
  if(elPeriodo) elPeriodo.innerText = nomePeriodoAtual();
}

function atualizarKPIs(){
  const base = patrimonioPorFiltrosTela();

  const total = base.length || 1;
  const totalReal = base.length;

  const uso = base.filter(p => p.status === "EM_USO").length;
  const estoque = base.filter(p => p.status === "ESTOQUE").length;
  const manut = base.filter(p => p.status === "MANUTENCAO").length;
  const baixado = base.filter(p => p.status === "BAIXADO").length;
  const semValor = base.filter(p => valorPatrimonio(p) <= 0).length;
  const valorTotal = base.reduce((s,p) => s + valorPatrimonio(p), 0);

  document.getElementById("kpiTotal").innerText = totalReal;
  document.getElementById("kpiUso").innerText = uso;
  document.getElementById("kpiEstoque").innerText = estoque;
  document.getElementById("kpiManutencao").innerText = manut;
  document.getElementById("kpiBaixado").innerText = baixado;
  document.getElementById("kpiSemValor").innerText = semValor;
  document.getElementById("kpiValor").innerText = usuarioPodeVerValoresBDR() ? moedaCurta(valorTotal) : "R$ •••";

  document.getElementById("percUso").innerText = ((uso/total)*100).toFixed(1).replace(".",",") + "% da seleção";
  document.getElementById("percEstoque").innerText = ((estoque/total)*100).toFixed(1).replace(".",",") + "% da seleção";
  document.getElementById("percManutencao").innerText = ((manut/total)*100).toFixed(1).replace(".",",") + "% da seleção";
  document.getElementById("percBaixado").innerText = ((baixado/total)*100).toFixed(1).replace(".",",") + "% da seleção";
  document.getElementById("percSemValor").innerText = ((semValor/total)*100).toFixed(1).replace(".",",") + "% da seleção";
}

function contarPor(lista, fn){
  const obj = {};
  lista.forEach(item => {
    const k = fn(item) || "-";
    obj[k] = (obj[k] || 0) + 1;
  });
  return obj;
}

function somarPor(lista, fn, val){
  const obj = {};
  lista.forEach(item => {
    const k = fn(item) || "-";
    obj[k] = (obj[k] || 0) + Number(val(item) || 0);
  });
  return obj;
}
