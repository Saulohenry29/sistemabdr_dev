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

  // grava histórico
  await client.from("movimentacoes").insert([{
    patrimonio_id: atual.id,
    status_anterior: atual.status,
    status_novo: novoStatus,
    local_anterior: atual.localizacao,
    local_novo: novaLocal,
    responsavel: "SISTEMA"
  }]);

  // atualiza patrimônio atual
  await client
    .from("patrimonio")
    .update({
      status: novoStatus,
      localizacao: novaLocal
    })
    .eq("codigo_qr", id);

  alert("Movimentação registrada com sucesso!");
}