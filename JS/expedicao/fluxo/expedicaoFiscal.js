/* =========================================================
   ATLAS EXPEDIÇÃO — FISCAL
   Responsabilidade extraída do antigo expedicaoCore.js.
   Arquivo definitivo do módulo; sem camada de patch.
========================================================= */

(function(){
  "use strict";

  /*
   * Modal simples e interno do Atlas.
   * Retorna:
   * true  = exige NF-e
   * false = não exige
   * null  = usuário cancelou
   */
  function perguntarExigeNfeAtlas(){
    return new Promise(resolve=>{
      const fundo = document.createElement("div");
      fundo.className = "modal-bg ativo";
      fundo.style.zIndex = "10000001";

      fundo.innerHTML = `
        <div class="modal" style="max-width:520px">
          <div class="modal-head">
            <span>📄 Controle fiscal do pedido</span>
            <button class="fechar-modal" id="atlasNfeCancelarX">X</button>
          </div>
          <div class="modal-body">
            <div class="info-box" style="margin-top:0">
              O almoxarifado pode iniciar a separação enquanto o administrativo prepara a nota.
            </div>

            <h3 style="margin:16px 0 8px;color:#0f172a">
              Este pedido precisa de NF-e?
            </h3>

            <div style="display:grid;gap:10px">
              <button class="btn-ok" id="atlasNfeSim" style="height:48px">
                Sim, precisa de NF-e
              </button>

              <button class="btn-blue" id="atlasNfeNao" style="height:48px">
                Não precisa de NF-e
              </button>

              <button class="btn-gray" id="atlasNfeCancelar">
                Cancelar aprovação
              </button>
            </div>
          </div>
        </div>`;

      document.body.appendChild(fundo);

      function fechar(valor){
        fundo.remove();
        resolve(valor);
      }

      fundo.querySelector("#atlasNfeSim").onclick = ()=>fechar(true);
      fundo.querySelector("#atlasNfeNao").onclick = ()=>fechar(false);
      fundo.querySelector("#atlasNfeCancelar").onclick = ()=>fechar(null);
      fundo.querySelector("#atlasNfeCancelarX").onclick = ()=>fechar(null);
    });
  }

  /*
   * CONFIRMAÇÃO LOCAL SEGURA
   * Estas funções ficam no mesmo escopo da aprovação fiscal.
   * Nunca deixam uma falha visual transformar uma operação concluída
   * em mensagem de erro.
   */
  function mostrarSucessoAprovacaoAtlas(titulo, mensagem){
    try{
      if(window.AtlasModal?.sucesso){
        window.AtlasModal.sucesso(
          titulo || "✅ Operação concluída",
          mensagem || "A operação foi realizada com sucesso."
        );
        return true;
      }

      if(typeof window.atlasToast === "function"){
        window.atlasToast(
          "✅ " + (mensagem || titulo || "Operação concluída.")
        );
        return true;
      }
    }catch(e){
      console.warn(
        "Atlas Expedição: aprovação concluída, mas a confirmação visual falhou:",
        e?.message || e
      );
    }

    return false;
  }

  function mostrarErroAprovacaoAtlas(mensagem){
    const texto = String(
      mensagem || "Não foi possível concluir a autorização."
    );

    try{
      if(window.AtlasModal?.erro){
        window.AtlasModal.erro(texto);
        return true;
      }

      if(typeof window.atlasToast === "function"){
        window.atlasToast("⚠ " + texto);
        return true;
      }
    }catch(e){
      console.error("Atlas Expedição:", texto, e);
    }

    return false;
  }

  async function salvarEscolhaNfeAtlas(pedidoId, exigeNfe){
    if(!window.AtlasFiscal?.definirExigenciaNfe){
      throw new Error("AtlasFiscal não carregado.");
    }

    let motivo = "";
    if(exigeNfe === false){
      motivo = "NF-e não exigida conforme decisão do responsável pela aprovação.";
    }

    return await window.AtlasFiscal.definirExigenciaNfe(
      pedidoId,
      exigeNfe,
      motivo
    );
  }

  /*
   * Envolve a aprovação total já existente.
   * Primeiro pergunta, depois aprova e registra a decisão fiscal.
   */
  const autorizarTodosAnterior330 = window.autorizarTodosAtlas;
  if(typeof autorizarTodosAnterior330 === "function"){
    window.autorizarTodosAtlas = async function(pedidoId){
      const exigeNfe = await perguntarExigeNfeAtlas();
      if(exigeNfe === null) return false;

      try{
        await autorizarTodosAnterior330(pedidoId);
        await salvarEscolhaNfeAtlas(pedidoId, exigeNfe);
        await window.carregarTudo?.();

        mostrarSucessoAprovacaoAtlas(
          "✅ Pedido aprovado",
          "A autorização foi realizada com sucesso. O pedido foi encaminhado para separação."
        );

        return true;
      }catch(e){
        mostrarErroAprovacaoAtlas(
          "Não foi possível concluir a autorização: " +
          (e?.message || e)
        );
        return false;
      }
    };
  }

  /*
   * Envolve a confirmação da aprovação parcial.
   */
  const confirmarParcialAnterior330 = window.confirmarAprovacaoParcialAtlas;
  if(typeof confirmarParcialAnterior330 === "function"){
    window.confirmarAprovacaoParcialAtlas = async function(pedidoId){
      const exigeNfe = await perguntarExigeNfeAtlas();
      if(exigeNfe === null) return false;

      try{
        await confirmarParcialAnterior330(pedidoId);
        await salvarEscolhaNfeAtlas(pedidoId, exigeNfe);
        await window.carregarTudo?.();

        mostrarSucessoAprovacaoAtlas(
          "✅ Aprovação parcial concluída",
          "A decisão dos itens foi registrada e o pedido foi encaminhado para a próxima etapa."
        );

        return true;
      }catch(e){
        mostrarErroAprovacaoAtlas(
          "Não foi possível concluir a aprovação parcial: " +
          (e?.message || e)
        );
        return false;
      }
    };
  }

  /*
   * Abre o formulário para registrar a nota feita no portal externo.
   */
  window.abrirRegistroNfeAtlas = function(pedidoId){
    const p = (window.pedidos || []).find(x=>Number(x.id)===Number(pedidoId));
    if(!p) return;

    document.getElementById("modalTitulo").innerText =
      "Registrar NF-e - " + (p.codigo || ("PED-" + p.id));

    document.getElementById("modalConteudo").innerHTML = `
      <div class="info-box" style="margin-top:0">
        Emita a NF-e no portal utilizado pela empresa e registre os dados abaixo.
      </div>

      <div style="display:grid;gap:10px;margin-top:14px">
        <label style="font-weight:900">
          Número da NF-e
          <input id="atlasNumeroNfe" value="${esc(p.numero_nfe || "")}" placeholder="Ex.: 12345">
        </label>

        <label style="font-weight:900">
          Série
          <input id="atlasSerieNfe" value="${esc(p.serie_nfe || "")}" placeholder="Ex.: 1">
        </label>

        <label style="font-weight:900">
          Chave de acesso
          <input id="atlasChaveNfe" value="${esc(p.chave_nfe || "")}" inputmode="numeric" maxlength="44" placeholder="44 números">
        </label>

        <button class="btn-ok" onclick="salvarRegistroNfeAtlas(${Number(p.id)})">
          Salvar NF-e e liberar quando separado
        </button>
      </div>`;

    document.getElementById("modalDetalhe").classList.add("ativo");
  };

  window.salvarRegistroNfeAtlas = async function(pedidoId){
    try{
      await window.AtlasFiscal.registrarNfe(pedidoId,{
        numero_nfe:document.getElementById("atlasNumeroNfe")?.value,
        serie_nfe:document.getElementById("atlasSerieNfe")?.value,
        chave_nfe:document.getElementById("atlasChaveNfe")?.value
      });

      fecharModalDetalhe?.();
      atlasToast("✅ NF-e registrada com sucesso.");
      await window.carregarTudo?.();
    }catch(e){
      if(window.AtlasModal?.erro){
        window.AtlasModal.erro(e?.message || String(e));
      }else{
        alert(e?.message || e);
      }
    }
  };

  /*
   * Acrescenta AGUARDANDO_NFE à lista operacional.
   */
  const renderizarPedidosAnterior330 = window.renderizarPedidos || renderizarPedidos;
  window.renderizarPedidos = renderizarPedidos = function(){
    renderizarPedidosAnterior330();

    const todos = window.pedidos || pedidos || [];
    const fiscais = todos.filter(p =>
      String(p.status || "").toUpperCase() === "AGUARDANDO_NFE"
    );

    const listaRetirada = document.getElementById("listaRetirada");
    if(listaRetirada && fiscais.length){
      const htmlFiscal = fiscais.map(p=>pedidoHTML(p)).join("");
      listaRetirada.insertAdjacentHTML("afterbegin",htmlFiscal);
    }
  };

  /*
   * Troca a ação do pedido enquanto a nota estiver pendente.
   */
  const acoesPedidoAnterior330 = window.acoesPedido || acoesPedido;
  window.acoesPedido = acoesPedido = function(p){
    const st = String(p?.status || "").toUpperCase();

    if(st === "AGUARDANDO_NFE"){
      return `
        <button class="btn-mini btn-blue" onclick="abrirRegistroNfeAtlas(${Number(p.id)})">
          📄 Registrar NF-e
        </button>`;
    }

    return acoesPedidoAnterior330(p);
  };

})();

console.info("✅ ATLAS EXPEDIÇÃO FISCAL carregada");
