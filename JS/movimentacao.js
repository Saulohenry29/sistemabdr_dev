/* =========================================================
   BDR ERP - MOVIMENTAÇÃO SIMPLES DE PATRIMÔNIO
   Arquivo: JS/movimentacao.js
   Atualizado com offline.
========================================================= */

async function moverPatrimonio(id, novoStatus, novaLocal) {

  const usuario = (() => {
    try{
      return JSON.parse(localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado") || "null");
    }catch(e){ return null; }
  })();

  if(typeof estaOnline === "function" && !estaOnline()){
    await salvarOffline("mover_patrimonio", "patrimonio", {
      codigo_qr:id,
      novoStatus,
      novaLocal,
      empresa_id:null,
      responsavel:usuario?.nome || "SISTEMA",
      observacao:"movimentação registrada offline",
      criado_offline_em:new Date().toISOString()
    });

    alert("📦 Sem internet. Movimentação salva no aparelho e será sincronizada quando a internet voltar.");
    return;
  }

  const { data: atual, error } = await client
    .from("patrimonio")
    .select("*")
    .eq("codigo_qr", id)
    .single();

  if (error || !atual) {
    alert("Patrimônio não encontrado");
    return;
  }

  await client.from("movimentacoes").insert([{
    patrimonio_id: atual.id,
    status_anterior: atual.status,
    status_novo: novoStatus,
    local_anterior: atual.localizacao,
    local_novo: novaLocal,
    responsavel: usuario?.nome || "SISTEMA"
  }]);

  await client
    .from("patrimonio")
    .update({
      status: novoStatus,
      localizacao: novaLocal
    })
    .eq("codigo_qr", id);

  alert("Movimentação registrada com sucesso!");
}

document.addEventListener("keydown", function(e){
  if(e.key === "Escape"){
    document.querySelectorAll(".modal-bg.ativo, .modal.ativo").forEach(m=>{
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
