function rankingObrasPatrimonio(){
  /*
    Ranking oficial:
    QUANTIDADE = número de patrimônios por obra/setor.
    VALOR = soma oficial de valorPatrimonio(p).
  */
  const mapa = {};

  patrimonioPorFiltrosTela().forEach(p => {
    const obraId = String(p.obra_id || "SEM_OBRA");
    const obraNome = nomeObraCurto(p.obra_id);

    if(!mapa[obraId]){
      mapa[obraId] = { obra_id:obraId, nome:obraNome, qtd:0, valor:0, semValor:0, itens:[] };
    }

    const v = valorPatrimonio(p);
    mapa[obraId].qtd++;
    mapa[obraId].valor += v;
    if(v <= 0) mapa[obraId].semValor++;
    mapa[obraId].itens.push(p);
  });

  return Object.values(mapa);
}

function gerarTopObrasValor(){
  const el = document.getElementById("topObrasValor");
  if(!el) return;

  const lista = rankingObrasPatrimonio()
    .filter(o => o.valor > 0)
    .sort((a,b) => b.valor - a.valor)
    .slice(0,5);

  if(lista.length === 0){
    el.innerHTML = `<div class="info-row">Nenhuma obra com valor informado.</div>`;
    return;
  }

  el.innerHTML = lista.map((o,i) => `
    <div class="info-row" onclick="mostrarItensObraRanking('${o.obra_id}','VALOR')" style="cursor:pointer;">
      <span title="${escapeHtmlBDR(o.nome)}">${i+1}. ${escapeHtmlBDR(o.nome)}</span>
      <b>${usuarioPodeVerValoresBDR() ? moedaCurta(o.valor) : "R$ •••"}</b>
    </div>
  `).join("");
}

function gerarTopObrasQuantidade(){
  const el = document.getElementById("topObrasQuantidade");
  if(!el) return;

  const lista = rankingObrasPatrimonio()
    .sort((a,b) => b.qtd - a.qtd)
    .slice(0,5);

  if(lista.length === 0){
    el.innerHTML = `<div class="info-row">Nenhum patrimônio encontrado.</div>`;
    return;
  }

  el.innerHTML = lista.map((o,i) => `
    <div class="info-row" onclick="mostrarItensObraRanking('${o.obra_id}','QTD')" style="cursor:pointer;">
      <span title="${escapeHtmlBDR(o.nome)}">${i+1}. ${escapeHtmlBDR(o.nome)}</span>
      <b>${o.qtd} item(ns)</b>
    </div>
  `).join("");
}

function mostrarItensObraRanking(obraId, modo){
  const obra = rankingObrasPatrimonio().find(o => String(o.obra_id) === String(obraId));
  if(!obra) return;

  const lista = [...obra.itens].sort((a,b) => {
    if(modo === "VALOR") return valorPatrimonio(b) - valorPatrimonio(a);
    return String(a.nome_bem || "").localeCompare(String(b.nome_bem || ""));
  });

  const titulo = modo === "VALOR"
    ? `💰 ${obra.nome} - ${usuarioPodeVerValoresBDR() ? moeda(obra.valor) : "R$ •••"} em patrimônio (${obra.qtd} item(ns))`
    : `📦 ${obra.nome} - ${obra.qtd} patrimônio(s)`;

  renderizarListaItensDashboard(lista, titulo);
}

function renderizarListaItensDashboard(lista, titulo){
  const card = document.getElementById("cardItensAlerta");
  const tbody = document.getElementById("listaItensAlerta");
  const title = document.getElementById("tituloItensAlerta");

  if(!card || !tbody || !title) return;

  title.innerText = `${titulo} (${lista.length})`;

  if(lista.length === 0){
    tbody.innerHTML = `<tr><td colspan="6">Nenhum item encontrado.</td></tr>`;
  }else{
    tbody.innerHTML = lista.map(p => `
      <tr>
        <td><b>${p.codigo_qr || "-"}</b></td>
        <td>${p.nome_bem || "-"}</td>
        <td>${p.status || "-"}</td>
        <td>${p.tipo_item || "-"}</td>
        <td>${nomeObraCurto(p.obra_id)}</td>
        <td>${usuarioPodeVerValoresBDR() ? moeda(valorPatrimonio(p)) : "R$ •••"}</td>
      </tr>
    `).join("");
  }

  card.style.display = "block";
  card.scrollIntoView({behavior:"smooth", block:"start"});
}
