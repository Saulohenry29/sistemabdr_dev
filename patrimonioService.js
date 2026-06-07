export async function moverPatrimonio(id, novoStatus, novaLocal, empresa_id) {

  const atual = await client
    .from("patrimonio")
    .select("*")
    .eq("codigo_qr", id)
    .single();

  if (!atual.data) throw new Error("Patrimônio não encontrado");

  // 1. Atualiza patrimônio (estado atual)
  await client
    .from("patrimonio")
    .update({
      status: novoStatus,
      localizacao: novaLocal
    })
    .eq("codigo_qr", id);

  // 2. Histórico operacional
  await client.from("movimentacoes").insert([{
    patrimonio_id: atual.data.id,
    status_anterior: atual.data.status,
    status_novo: novoStatus,
    local_anterior: atual.data.localizacao,
    local_novo: novaLocal,
    responsavel: "SISTEMA"
  }]);

  // 3. 🔥 ANALYTICS (CORAÇÃO DO ERP)
  await client.from("analytics_patrimonio").insert([{
    patrimonio_id: atual.data.id,
    empresa_id: empresa_id,
    tipo_evento: "MOVIMENTACAO",
    status_anterior: atual.data.status,
    status_novo: novoStatus,
    local_anterior: atual.data.localizacao,
    local_novo: novaLocal,
    criticidade: novoStatus === "MANUTENCAO" ? 3 : 1,
    observacao: "movimentação automática"
  }]);

  return true;
}