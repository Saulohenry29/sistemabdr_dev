// ===============================
// BDR CORE 9.0 - ERP MOVIMENTAÇÃO
// ===============================


// ===============================
// FORMATADOR DE STATUS (UI)
// ===============================
function formatarStatus(status) {

  const map = {
    ESTOQUE: "Estoque",
    OBRA: "Obra",
    MANUTENCAO: "Manutenção",
    EM_USO: "Em Uso",
    BAIXADO: "Baixado"
  };

  return map[status] || status;
}


// ===============================
// MOVIMENTAÇÃO PRINCIPAL
// ===============================
async function registrarMovimentacao({
  codigo_qr,
  novoStatus,
  novaLocalizacao = "CD",
  tipoEvento = "MOVIMENTACAO",
  observacao = ""
}) {

  try {

    // validação inicial
    if (!codigo_qr) {
      alert("Código QR inválido");
      return;
    }

    // ===============================
    // BUSCAR PATRIMÔNIO
    // ===============================
    const { data: atual, error } = await window.client
      .from("patrimonio")
      .select("*")
      .eq("codigo_qr", codigo_qr)
      .single();

    if (error || !atual) {
      console.error(error);
      alert("Patrimônio não encontrado");
      return;
    }

    // ===============================
    // CRITICIDADE AUTOMÁTICA
    // ===============================
    let criticidade = 1;

    if (novoStatus === "MANUTENCAO") criticidade = 3;
    if (novoStatus === "OBRA") criticidade = 2;
    if (novoStatus === "BAIXADO") criticidade = 3;

    // histórico (regra ERP)
    const { data: historico } = await window.client
      .from("analytics_patrimonio")
      .select("id")
      .eq("patrimonio_id", atual.id);

    if (historico && historico.length > 10) {
      criticidade = 3;
    }

    // ===============================
    // SALVAR HISTÓRICO (ANALYTICS)
    // ===============================
    const { error: errInsert } = await window.client
      .from("analytics_patrimonio")
      .insert([{
        patrimonio_id: atual.id,
        empresa_id: atual.empresa_id || null,
        localizacao_id: atual.localizacao_id || null,

        tipo_evento: tipoEvento,

        status_anterior: atual.status,
        status_novo: novoStatus,

        local_anterior: atual.localizacao,
        local_novo: novaLocalizacao,

        criticidade: criticidade,
        observacao: observacao,

        created_at: new Date().toISOString()
      }]);

    if (errInsert) {
      console.error(errInsert);
      alert("Erro ao salvar histórico");
      return;
    }

    // ===============================
    // ATUALIZAR PATRIMÔNIO
    // ===============================
    const { error: errUpdate } = await window.client
      .from("patrimonio")
      .update({
        status: novoStatus,
        localizacao: novaLocalizacao
      })
      .eq("codigo_qr", codigo_qr);

    if (errUpdate) {
      console.error(errUpdate);
      alert("Erro ao atualizar patrimônio");
      return;
    }

    alert("✔ Movimentação registrada com sucesso");

    // reload seguro (opcional)
    setTimeout(() => location.reload(), 400);

  } catch (err) {
    console.error("Erro geral:", err);
    alert("Erro inesperado na movimentação");
  }
}