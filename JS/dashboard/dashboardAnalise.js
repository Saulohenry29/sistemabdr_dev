function gerarIA(){
  const total = filtrados.length;
  const valorTotal = filtrados.reduce((s,p) => s + valorPatrimonio(p), 0);
  const estoque = itensEmEstoqueGeral().length;
  const manut = filtrados.filter(p => p.status === "MANUTENCAO").length;
  const semValor = filtrados.filter(p => !valorPatrimonio(p)).length;
  const semSerie = filtrados.filter(p => !p.numero_serie && !p.placa).length;

  document.getElementById("analiseIA").innerHTML = `
    <div class="ai-line" onclick="mostrarItensAlerta('TODOS')">
      <span>📊</span>
      <div>Foram encontrados <b>${total}</b> patrimônio(s), com valor patrimonial de <b>${usuarioPodeVerValoresBDR() ? moedaCurta(valorTotal) : "R$ •••"}</b>. Valor patrimonial é a visão principal; quantidade fica separada para conferência.</div>
    </div>

    <div class="ai-line" onclick="mostrarItensAlerta('MANUTENCAO')">
      <span>🛠</span>
      <div><b>${manut}</b> patrimônio(s) estão em manutenção.</div>
    </div>

    <div class="ai-line" onclick="mostrarItensAlerta('ESTOQUE')">
      <span>📦</span>
      <div><b>${estoque}</b> item(ns) estão em estoque geral.</div>
    </div>

    <div class="ai-line" onclick="mostrarItensAlerta('SEM_VALOR')">
      <span>⚠️</span>
      <div><b>${semValor}</b> patrimônio(s) não possuem valor informado.</div>
    </div>

    <div class="ai-line" onclick="mostrarItensAlerta('SEM_SERIE')">
      <span>🔎</span>
      <div><b>${semSerie}</b> patrimônio(s) estão sem número de série ou placa.</div>
    </div>
  `;
}

function gerarAlertas(){
  const base = patrimonioPorFiltrosTela();
  const semValor = base.filter(p => !valorPatrimonio(p)).length;
  const semSerie = base.filter(p => !p.numero_serie && !p.placa).length;
  const manut = base.filter(p => p.status === "MANUTENCAO").length;
  const baixado = base.filter(p => p.status === "BAIXADO").length;

  document.getElementById("alertas").innerHTML = `
    <div class="alert-row" onclick="mostrarItensAlerta('SEM_VALOR')">
      <span>⚠️ Sem valor informado</span><span class="badge">${semValor}</span>
    </div>
    <div class="alert-row" onclick="mostrarItensAlerta('SEM_SERIE')">
      <span>📊 Sem número de série/placa</span><span class="badge">${semSerie}</span>
    </div>
    <div class="alert-row" onclick="mostrarItensAlerta('MANUTENCAO')">
      <span>🛠 Em manutenção</span><span class="badge">${manut}</span>
    </div>
    <div class="alert-row" onclick="mostrarItensAlerta('BAIXADO')">
      <span>🗑 Itens baixados</span><span class="badge">${baixado}</span>
    </div>
  `;
}

function mostrarItensAlerta(tipo){
  let lista = [];
  let titulo = "📋 Itens filtrados";

  if(tipo === "TODOS"){
    lista = filtrados.length ? filtrados : patrimonioPorFiltrosTela();
    titulo = "📊 Patrimônios da análise atual";
  }

  if(tipo === "ESTOQUE"){
    lista = itensEmEstoqueGeral();
    titulo = "📦 Estoque geral";
  }

  if(tipo === "ESTOQUE_BAIXO" || tipo === "ESTOQUE_MEDIO" || tipo === "ESTOQUE_MUITO"){
    const nivel = tipo.replace("ESTOQUE_", "");
    const grupos = gruposEstoque().filter(g => nivelEstoqueGrupo(g) === nivel);

    lista = grupos.flatMap(g => g.itens);

    if(nivel === "BAIXO") titulo = "🔴 Itens com estoque baixo";
    if(nivel === "MEDIO") titulo = "🟡 Itens com estoque médio";
    if(nivel === "MUITO") titulo = "🟢 Itens com estoque alto";
  }

  if(tipo === "SEM_VALOR"){
    lista = patrimonioPorFiltrosTela().filter(p => !valorPatrimonio(p));
    titulo = "⚠️ Patrimônios sem valor informado";
  }

  if(tipo === "SEM_SERIE"){
    lista = patrimonioPorFiltrosTela().filter(p => !p.numero_serie && !p.placa);
    titulo = "📊 Patrimônios sem número de série ou placa";
  }

  if(tipo === "MANUTENCAO"){
    lista = patrimonioPorFiltrosTela().filter(p => p.status === "MANUTENCAO");
    titulo = "🛠 Patrimônios em manutenção";
  }

  if(tipo === "EM_USO"){
    lista = patrimonioPorFiltrosTela().filter(p => p.status === "EM_USO");
    titulo = "✅ Patrimônios em uso";
  }

  if(tipo === "BAIXADO"){
    lista = patrimonioPorFiltrosTela().filter(p => p.status === "BAIXADO");
    titulo = "🗑 Patrimônios baixados";
  }

  if(tipo === "RISCO"){
    lista = basePatrimoniosDashboard().filter(p =>
      !valorPatrimonio(p) ||
      (!p.numero_serie && !p.placa) ||
      p.status === "MANUTENCAO"
    );
    titulo = "🚨 Patrimônios com risco operacional";
  }

  const card = document.getElementById("cardItensAlerta");
  const tbody = document.getElementById("listaItensAlerta");

  document.getElementById("tituloItensAlerta").innerText = `${titulo} (${lista.length})`;

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
