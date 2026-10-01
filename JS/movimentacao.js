/* =========================================================
   BDR ERP - MOVIMENTAÇÃO DE PATRIMÔNIO ENTRE OBRAS
   Arquivo: JS/movimentacao.js
   V10.6 - offline first + origem/destino
   Regra:
   - usuário pode enviar patrimônio da sua obra para outra obra;
   - nova obra destino fica livre;
   - lançamento novo continua controlado no patrimonio.html.
========================================================= */

function bdrMovUsuarioAtual(){
  try{
    return JSON.parse(localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado") || "null");
  }catch(e){ return null; }
}

async function bdrMovOnlineReal(){
  if(navigator.onLine === false) return false;

  if(typeof window.bdrOnline === "function"){
    try{ if(window.bdrOnline() === false) return false; }catch(e){}
  }

  if(typeof window.bdrOnlineReal === "function"){
    try{ return await window.bdrOnlineReal(); }catch(e){ return false; }
  }

  return navigator.onLine !== false;
}

function bdrMovEhOwnerOuMaster(usuario){
  const perfil = String(usuario?.perfil || "").toUpperCase();
  return Number(usuario?.id) === 1 || perfil === "MASTER" || perfil === "OWNER";
}

function bdrMovTemPermissao(usuario, permissao){
  if(!usuario) return false;
  if(bdrMovEhOwnerOuMaster(usuario)) return true;

  const alvo = String(permissao || "").toUpperCase();
  const lista = Array.isArray(usuario.permissoes)
    ? usuario.permissoes
    : String(usuario.permissoes || "").split(",");

  return lista.map(p => String(p).trim().toUpperCase()).includes(alvo);
}

async function moverPatrimonio(id, novoStatus, novaLocal){
  const usuario = bdrMovUsuarioAtual();
  const online = await bdrMovOnlineReal();

  if(!bdrMovTemPermissao(usuario, "PATRIMONIO_MOVIMENTAR")){
    alert("Você não tem permissão para movimentar patrimônio.");
    return false;
  }

  if(!online){
    if(window.BDRSync && typeof window.BDRSync.atualizar === "function"){
      await window.BDRSync.atualizar("patrimonio", { codigo_qr:id }, {
        status: novoStatus,
        localizacao: novaLocal,
        updated_at: new Date().toISOString()
      }, {
        origem:"movimentacao.js",
        acao:"MOVER_PATRIMONIO",
        responsavel:usuario?.nome || "SISTEMA",
        obra_destino_id:novaLocal || null
      });
    }else if(typeof salvarOffline === "function"){
      await salvarOffline("mover_patrimonio", "patrimonio", {
        codigo_qr:id,
        novoStatus,
        novaLocal,
        empresa_id:usuario?.empresa_id || null,
        responsavel:usuario?.nome || "SISTEMA",
        observacao:"movimentação registrada offline",
        criado_offline_em:new Date().toISOString()
      });
    }else{
      throw new Error("Nenhum mecanismo offline carregado: bdrSyncEngine.js/offlineQueue.js.");
    }

    alert("📦 Sem internet. Movimentação salva no aparelho e será sincronizada quando a internet voltar.");
    return true;
  }

  const { data: atual, error } = await client
    .from("patrimonio")
    .select("*")
    .eq("codigo_qr", id)
    .single();

  if(error || !atual){
    alert("Patrimônio não encontrado");
    return false;
  }

  await client.from("movimentacoes").insert([{
    patrimonio_id: atual.id,
    empresa_id: atual.empresa_id || usuario?.empresa_id || null,
    obra_origem_id: atual.obra_id || null,
    obra_destino_id: novaLocal || null,
    status_anterior: atual.status,
    status_novo: novoStatus,
    local_anterior: atual.localizacao || null,
    local_novo: novaLocal || null,
    responsavel: usuario?.nome || "SISTEMA",
    observacao: "Movimentação entre obras/setores"
  }]);

  await client
    .from("patrimonio")
    .update({
      status: novoStatus,
      localizacao: novaLocal,
      updated_at:new Date().toISOString()
    })
    .eq("codigo_qr", id);

  alert("Movimentação registrada com sucesso!");
  return true;
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

void 0;
