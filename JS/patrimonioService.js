/* =========================================================
   BDR ERP - SERVIÇO DE PATRIMÔNIO
   Arquivo: JS/patrimonioService.js
========================================================= */

export async function moverPatrimonio(id, novoStatus, novaLocal, empresa_id) {

  const usuario = (() => {
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        "null"
      );
    }catch(e){
      return null;
    }
  })();

  const responsavel = usuario?.nome || "SISTEMA";

  if(typeof estaOnline === "function" && !estaOnline()){
    await salvarOffline("mover_patrimonio", "patrimonio", {
      codigo_qr: id,
      novoStatus,
      novaLocal,
      empresa_id,
      responsavel,
      observacao: "movimentação registrada offline",
      criado_offline_em: new Date().toISOString()
    });

    alert("📦 Sem internet. Movimentação salva no aparelho e será sincronizada quando a internet voltar.");
    return true;
  }

  const atual = await client
    .from("patrimonio")
    .select("*")
    .eq("codigo_qr", id)
    .single();

  if (atual.error || !atual.data) {
    throw new Error("Patrimônio não encontrado");
  }

  const atualizacao = await client
    .from("patrimonio")
    .update({
      status: novoStatus,
      localizacao: novaLocal
    })
    .eq("codigo_qr", id);

  if(atualizacao.error) throw atualizacao.error;

  const historico = await client
    .from("movimentacoes")
    .insert([{
      patrimonio_id: atual.data.id,
      status_anterior: atual.data.status,
      status_novo: novoStatus,
      local_anterior: atual.data.localizacao,
      local_novo: novaLocal,
      responsavel
    }]);

  if(historico.error) throw historico.error;

  const analytics = await client
    .from("analytics_patrimonio")
    .insert([{
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

  if(analytics.error) throw analytics.error;

  return true;
}

document.addEventListener("keydown", function(e){
  if(e.key === "Escape"){
    document.querySelectorAll(".modal-bg.ativo, .modal.ativo").forEach(m => {
      m.classList.remove("ativo");
    });

    const modalDetalhe = document.getElementById("modalDetalhe");
    if(modalDetalhe) modalDetalhe.classList.remove("ativo");

    const dropdown = document.getElementById("dropdownUser");
    if(dropdown) dropdown.classList.remove("ativo");

    const notif = document.getElementById("notifDropdown");
    if(notif) notif.classList.remove("ativo");
  }
});
