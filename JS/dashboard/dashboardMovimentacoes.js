function gerarUltimasMov(){
  const tbody = document.getElementById("ultimasMov");
  tbody.innerHTML = "";

  const movs = movimentacoesPeriodo();

  if(movs.length === 0){
    tbody.innerHTML = `<tr><td colspan="6">Nenhuma movimentação encontrada no período selecionado.</td></tr>`;
    return;
  }

  movs.slice(0,5).forEach(m => {
    tbody.innerHTML += `
      <tr>
        <td>${dataBR(m.data_movimentacao)}</td>
        <td>${m.tipo || "-"}</td>
        <td>${nomePatrimonio(m.patrimonio_id)}</td>
        <td>${m.status_anterior || "-"}</td>
        <td>${m.status_novo || "-"}</td>
        <td>${m.usuario || "-"}</td>
      </tr>
    `;
  });
}
