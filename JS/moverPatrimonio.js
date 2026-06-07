async function moverPatrimonio(id, novoStatus, novaLocal) {

  const { data: atual, error } = await client
    .from("patrimonio")
    .select("*")
    .eq("codigo_qr", id)
    .single();

  if (error || !atual) {
    alert("Patrimônio não encontrado");
    return;
  }

  // movimentação histórica
  await client.from("movimentacoes").insert([{
    patrimonio_id: atual.id,
    empresa_id: atual.empresa_id,
    status_anterior: atual.status,
    status_novo: novoStatus,
    localizacao_anterior: atual.localizacao_id,
    localizacao_nova: novaLocal,
    responsavel: "SISTEMA"
  }]);

  // analytics (6.0)
  await client.from("analytics_patrimonio").insert([{
    patrimonio_id: atual.id,
    empresa_id: atual.empresa_id,
    localizacao_id: novaLocal,
    tipo_evento: "MOVIMENTACAO",
    status_anterior: atual.status,
    status_novo: novoStatus,
    local_anterior: atual.localizacao_id,
    local_novo: novaLocal,
    criticidade: definirCriticidade(novoStatus),
    observacao: "movimentação sistema"
  }]);

  // update principal
  await client
    .from("patrimonio")
    .update({
      status: novoStatus,
      localizacao_id: novaLocal
    })
    .eq("codigo_qr", id);

  alert("Movimentado com sucesso 🚀");
}

function definirCriticidade(status) {
  if (status === "MANUTENCAO") return 3;
  if (status === "OBRA") return 2;
  return 1;
}