function ativarObra(){

  const obra_id =
    document.getElementById("obraSelect").value;

  const check =
    document.getElementById("checkObra").checked;

  if(!obra_id){
    alert("Selecione a obra");
    return;
  }

  if(!check){
    alert("Marque a confirmação da obra");
    return;
  }

  const obraSelecionada =
    obras.find(o => String(o.id) === String(obra_id));

  if(!obraSelecionada){
    alert("Obra não encontrada");
    return;
  }

  window.obraAtiva = obraSelecionada;

  document.getElementById("obraAtivaTexto").innerText =
    "OBRA ATIVA: " +
    obraSelecionada.nome +
    " | Código: " +
    obraSelecionada.codigo_obra;

  alert("Obra ativada com sucesso");
}