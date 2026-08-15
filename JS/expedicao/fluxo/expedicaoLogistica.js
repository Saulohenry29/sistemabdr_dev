/* =========================================================
   ATLAS EXPEDIÇÃO — LOGÍSTICA
   Responsabilidade extraída do antigo expedicaoCore.js.
   Arquivo definitivo do módulo; sem camada de patch.
========================================================= */

(function(){
  "use strict";

  function usuarioAtualAtlasLog(){
    try{return JSON.parse(localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado") || "null");}
    catch(e){return null;}
  }

  function pedidoLocalLogistica(id){
    return (window.pedidos || pedidos || []).find(p => Number(p.id) === Number(id));
  }

  function stLog(p){ return String(p?.status || "").toUpperCase(); }
  function escLog(v){ return typeof esc === "function" ? esc(v) : String(v ?? "").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function nomeObraLog(id){ return typeof nomeObra === "function" ? nomeObra(id) : String(id || "-"); }
  function dataHoraBRLog(v){
    if(!v) return "-";

    try{
      let textoData = String(v).trim();

      /*
       * A coluna data_saida_cd é timestamp sem timezone.
       * Como o Atlas grava usando new Date().toISOString(), o banco pode
       * devolver UTC sem o "Z". Nesse caso adicionamos o sufixo para impedir
       * que o navegador interprete 03:37 como horário local.
       */
      const possuiFuso = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(textoData);

      if(!possuiFuso){
        textoData = textoData.replace(" ", "T") + "Z";
      }

      const data = new Date(textoData);

      if(Number.isNaN(data.getTime())){
        return String(v);
      }

      return data.toLocaleString("pt-BR", {
        timeZone:"America/Cuiaba",
        dateStyle:"short",
        timeStyle:"short"
      });
    }catch(e){
      return String(v);
    }
  }
  function pedidoCurtoLog(p){ return "PED-" + (p?.id || "-"); }

  function avisoAtlasLog(titulo, mensagem){
    if(window.AtlasModal?.sucesso){
      window.AtlasModal.sucesso(titulo || "Atlas", mensagem || "Operação concluída.");
      return;
    }
    if(typeof window.atlasToast === "function"){
      window.atlasToast("✔ " + escLog(mensagem || titulo || "Operação concluída."));
    }
  }

  function erroAtlasLog(mensagem){
    const texto = String(mensagem || "Não foi possível concluir a operação.");
    if(window.AtlasModal?.erro){
      window.AtlasModal.erro(texto);
      return;
    }
    if(typeof window.atlasToast === "function"){
      window.atlasToast("⚠ " + escLog(texto));
    }
  }

  window.reservar = async function(id){
    if(window.AtlasSeparacaoQR?.abrir){
      window.AtlasSeparacaoQR.abrir(id);
      return;
    }
    try{
      document.querySelectorAll(`button[onclick*="${id}"]`).forEach(btn => { btn.disabled = true; btn.innerText = "Concluindo..."; });
      if(window.AtlasLogistica?.finalizarSeparacao){
        console.log("📦 Atlas Logística: finalizando separação", id);
        await window.AtlasLogistica.finalizarSeparacao(id);
      }else if(window.AtlasWorkflow?.finalizarSeparacao){
        await window.AtlasWorkflow.finalizarSeparacao(id);
      }else{
        throw new Error("AtlasLogistica/AtlasWorkflow não carregado.");
      }

      fecharModalDetalhe?.();
      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      erroAtlasLog("Erro ao finalizar separação: " + (e?.message || e));
      console.error(e);
    }
  };

  window.confirmarRetiradaModal = async function(){
    const id = window.pedidoRetiradaAtual || pedidoRetiradaAtual;
    if(!id) return;

    if(!valor("retMotorista")){
      erroAtlasLog("Informe o motorista/responsável.");
      return;
    }

    const dados = {
      motorista_nome: valor("retMotorista"),
      transportadora: valor("retVeiculo"),
      veiculo_placa: valor("retPlaca"),
      observacao_transporte: valor("retObs")
    };

    try{
      if(window.AtlasLogistica?.enviarPedido){
        console.log("🚚 Atlas Logística: enviando pedido", id, dados);
        await window.AtlasLogistica.enviarPedido(id, dados);
      }else if(window.AtlasWorkflow?.enviarPedido){
        await window.AtlasWorkflow.enviarPedido(id, dados);
      }else{
        throw new Error("AtlasLogistica/AtlasWorkflow não carregado.");
      }

      fecharModalRetirada();
      avisoAtlasLog("🚚 Pedido em trânsito", "Pedido colocado em trânsito com sucesso.");
      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      erroAtlasLog("Erro ao enviar pedido: " + (e?.message || e));
      console.error(e);
    }
  };

  window.confirmarRecebimentoAtlas = async function(pedidoId){
    try{
      const p = pedidoLocalLogistica(pedidoId) || pedidoLocal(pedidoId) || { id:pedidoId };
      let dadosRecebimento = null;

      if(window.AtlasModal && typeof window.AtlasModal.recebimento === "function"){
        dadosRecebimento = await window.AtlasModal.recebimento(p);
        if(!dadosRecebimento) return;
      }else{
        erroAtlasLog("O componente AtlasModal não foi carregado. Atualize a página e tente novamente.");
        return;
      }

      if(!window.AtlasLogistica?.receberPedido){
        throw new Error("AtlasLogistica.receberPedido não carregado.");
      }

      console.log("📥 Atlas Logística: recebendo pedido", pedidoId, dadosRecebimento);
      await window.AtlasLogistica.receberPedido(pedidoId, dadosRecebimento);

      if(window.AtlasModal?.sucesso){
        window.AtlasModal.sucesso(
          dadosRecebimento.divergencia ? "⚠ Divergência registrada" : "✔ Recebimento confirmado",
          dadosRecebimento.divergencia
            ? "A origem foi notificada e o pedido ficou aguardando conferência."
            : "Patrimônio transferido para o destino e timeline registrada."
        );
      }else{
        avisoAtlasLog(
          dadosRecebimento.divergencia ? "⚠ Divergência registrada" : "✔ Recebimento confirmado",
          dadosRecebimento.divergencia
            ? "A origem foi notificada e o pedido ficou aguardando conferência."
            : "Patrimônio transferido para o destino e timeline registrada."
        );
      }

      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      erroAtlasLog("Erro ao confirmar recebimento: " + (e?.message || e));
      console.error(e);
    }
  };

  const abrirDetalheAnterior = window.abrirDetalhePedidoAtlas;
  window.abrirDetalhePedidoAtlas = function(pedidoId){
    if(typeof abrirDetalheAnterior === "function") abrirDetalheAnterior(pedidoId);

    setTimeout(() => {
      const p = pedidoLocalLogistica(pedidoId);
      const box = document.getElementById("modalConteudo");
      if(!p || !box) return;

      const st = stLog(p);
      const destinoId = p.obra_destino_id || p.obra_id;
      const u = usuarioAtualAtlasLog() || {};
      const usuarioDestino = String(u.obra_id || "") === String(destinoId || "");
      const podeReceber = st === "EM_TRANSITO" && (usuarioDestino || ["MASTER","ADMIN"].includes(String(u.perfil || "").toUpperCase()));

      let extra = "";
      if(st === "EM_TRANSITO"){
        extra += `
          <div class="info-box" style="margin-top:12px">
            <b>🚚 Em trânsito</b><br>
            Saiu em: ${escLog(dataHoraBRLog(p.data_saida_cd))}<br>
            Motorista: ${escLog(p.motorista_nome || "-")}<br>
            Veículo/Transportadora: ${escLog(p.transportadora || "-")}<br>
            Placa: ${escLog(p.veiculo_placa || "-")}<br>
            Origem: ${escLog(nomeObraLog(p.obra_origem_id))}<br>
            Destino: ${escLog(nomeObraLog(destinoId))}
          </div>`;
      }

      if(p.observacao){
        extra += `<div class="info-box" style="margin-top:12px"><b>📝 Observação do solicitante</b><br>${escLog(p.observacao)}</div>`;
      }

      if(podeReceber){
        extra += `
          <div class="atlas-modal-acoes" style="margin-top:12px">
            <button class="atlas-btn success" style="background:#15803d!important;color:#fff!important" onclick="confirmarRecebimentoAtlas(${Number(p.id)});fecharModalDetalhe()">Confirmar recebimento</button>
          </div>`;
      }

      if(extra){
        box.insertAdjacentHTML("beforeend", extra);
      }
    }, 60);
  };

})();

console.info("✅ ATLAS EXPEDIÇÃO LOGÍSTICA carregada");
