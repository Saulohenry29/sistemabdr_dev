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