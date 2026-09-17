/* =========================================================
   ATLAS WORKFLOW V3.0 - MOTOR DE FLUXO LOGÍSTICO
   Arquivo: JS/atlasWorkflow.js
   Sprint 2.8: integrado ao AtlasGestorNotificacoes e AtlasGestorReservas
   - Workflow altera estados, histórico e movimentações
   - Gestor é a única porta para criar notificações
   - AtlasAudio toca somente conclusões locais do operador
========================================================= */
(function(){
  "use strict";

  const AtlasWorkflow = {
    versao: "3.3-transporte-por-permissao"
  };

  const STATUS = {
    SOLICITADO: "SOLICITADO",
    APROVADO: "APROVADO",
    APROVADO_PARCIAL: "APROVADO_PARCIAL",
    RECUSADO: "RECUSADO",
    EM_SEPARACAO: "EM_SEPARACAO",
    AGUARDANDO_RETIRADA: "AGUARDANDO_RETIRADA",
    EM_TRANSITO: "EM_TRANSITO",
    RECEBIDO: "RECEBIDO",
    RECEBIDO_PARCIAL: "RECEBIDO_PARCIAL",
    CANCELADO: "CANCELADO",
    EM_FILA: "EM_FILA",
    AGUARDANDO_CONFIRMACAO: "AGUARDANDO_CONFIRMACAO"
  };

  function db(){
    return window.client || window.supabaseClient || window.clientSupabase || globalThis.client;
  }

  function usuarioAtual(){
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        localStorage.getItem("usuarioAtual") ||
        "null"
      );
    }catch(e){
      return null;
    }
  }

  function nomeUsuario(){
    const u = usuarioAtual();
    return u?.nome || u?.usuario || "SISTEMA";
  }


  function gestorNotificacoes(){
    const gestor = window.AtlasGestorNotificacoes;

    if(!gestor){
      throw new Error(
        "AtlasGestorNotificacoes não está carregado. " +
        "Carregue JS/atlasGestorNotificacoes.js antes do Workflow."
      );
    }

    return gestor;
  }

  function normalizarStatus(status){
    return String(status || "").trim().toUpperCase().replace(/\s+/g, "_");
  }

  function emitirAtlas(evento, payload){
    try{
      if(window.AtlasEvents && typeof window.AtlasEvents.emit === "function"){
        return window.AtlasEvents.emit(evento, payload || {});
      }
      window.dispatchEvent(new CustomEvent("atlas:" + evento, {
        detail:{ evento, payload:payload || {}, criado_em:new Date().toISOString(), origem:"AtlasWorkflow" }
      }));
      return true;
    }catch(e){
      console.warn("AtlasWorkflow: falha ao emitir evento", evento, e?.message || e);
      return false;
    }
  }

  function perfilEhResponsavel(u){
    const perfil = String(u?.perfil || "").toUpperCase();
    const perms = String(u?.permissoes || "").toUpperCase();

    return ["MASTER", "ADMIN", "ALMOXARIFE", "ALMOXARIFADO"].includes(perfil) ||
      perms.includes("RECEBER_NOTIFICACOES") ||
      perms.includes("RECEBER_NOTIFICACOES_GESTAO") ||
      perms.includes("EXPEDICAO_APROVAR") ||
      perms.includes("EXPEDICAO_SEPARAR") ||
      perms.includes("EXPEDICAO_ENTREGAR");
  }

  function listaObrasLiberadas(u){
    return String(u?.obras_liberadas || "")
      .split(/[;,|]/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  function usuarioPertenceObra(u, obraId){
    if(!obraId) return false;
    const obraTxt = String(obraId);
    return String(u?.obra_id || "") === obraTxt ||
      listaObrasLiberadas(u).includes(obraTxt);
  }

  function usuarioEhMasterGlobal(u){
    return String(u?.perfil || "").toUpperCase() === "MASTER";
  }

  function usuarioEhMesmoSolicitante(u, pedido){
    const logadoId = usuarioIdAtual();
    const solicitante = String(pedido?.solicitante || pedido?.usuario_criacao || "").trim().toLowerCase();
    const nome = String(u?.nome || "").trim().toLowerCase();
    const usuario = String(u?.usuario || "").trim().toLowerCase();
    const email = String(u?.email || "").trim().toLowerCase();

    if(logadoId && String(u?.id || "") === String(logadoId)) return true;
    if(solicitante && (nome === solicitante || usuario === solicitante || email === solicitante)) return true;
    return false;
  }

  function filtrarUsuariosExcetoSolicitante(lista, pedido){
    return unicoPorId((lista || []).filter(u => !usuarioEhMesmoSolicitante(u, pedido)));
  }

  function unicoPorId(lista){
    const mapa = new Map();
    (lista || []).forEach(u => {
      if(u && u.id != null) mapa.set(String(u.id), u);
    });
    return Array.from(mapa.values());
  }

  async function buscarPedido(pedidoId){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const { data, error } = await banco
      .from("pedidos_retirada")
      .select("*")
      .eq("id", pedidoId)
      .single();

    if(error) throw error;
    if(!data) throw new Error("Pedido não encontrado.");
    return data;
  }

  async function buscarItensPedido(pedidoId){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const { data, error } = await banco
      .from("itens_retirada")
      .select("*")
      .eq("pedido_id", pedidoId)
      .order("id", { ascending:true });

    if(error) throw error;
    return Array.isArray(data) ? data : [];
  }


  async function registrarHistoricoPedido({ pedido_id, item_id, status_anterior, status_novo, observacao }){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const payload = {
      pedido_id,
      item_id: item_id || null,
      status_anterior: status_anterior || null,
      status_novo: status_novo || null,
      usuario: nomeUsuario(),
      observacao: observacao || "",
      created_at: new Date().toISOString()
    };

    const { error } = await banco.from("historico_pedidos_retirada").insert([payload]);
    if(error) throw error;
    return true;
  }

  async function alterarStatusPedido(pedidoId, novoStatus, observacao){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const pedido = await buscarPedido(pedidoId);
    const statusAnterior = pedido.status || null;
    const statusNovo = normalizarStatus(novoStatus);

    const { error } = await banco
      .from("pedidos_retirada")
      .update({ status: statusNovo })
      .eq("id", pedidoId);

    if(error) throw error;

    await registrarHistoricoPedido({
      pedido_id: pedidoId,
      status_anterior: statusAnterior,
      status_novo: statusNovo,
      observacao: observacao || "Status alterado para " + statusNovo
    });

    return { ...pedido, status: statusNovo, status_anterior: statusAnterior };
  }

  async function registrarMovimentacaoSolicitada(pedidoId){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const pedido = await buscarPedido(pedidoId);
    const itens = await buscarItensPedido(pedidoId);

    const patrimônios = itens.filter(i => i.patrimonio_id);
    if(!patrimônios.length) return { ok:true, criadas:0 };

    const existentes = await banco
      .from("patrimonio_movimentacoes")
      .select("id,patrimonio_id,pedido_id")
      .eq("pedido_id", pedidoId);

    const jaExiste = new Set((existentes.data || []).map(m => String(m.patrimonio_id)));

    const rows = patrimônios
      .filter(i => !jaExiste.has(String(i.patrimonio_id)))
      .map(i => ({
        patrimonio_id: i.patrimonio_id,
        pedido_id: pedidoId,
        empresa_id: pedido.empresa_id || empresaAtualId(),
        obra_origem_id: i.obra_origem_id || pedido.obra_origem_id || null,
        obra_destino_id: i.obra_destino_id || pedido.obra_destino_id || pedido.obra_id || null,
        status: STATUS.SOLICITADO,
        solicitado_por: pedido.solicitante || pedido.usuario_criacao || nomeUsuario(),
        data_solicitacao: new Date().toISOString(),
        observacao: "Movimentação criada automaticamente pelo Atlas Workflow."
      }));

    if(!rows.length) return { ok:true, criadas:0 };

    const { error } = await banco.from("patrimonio_movimentacoes").insert(rows);
    if(error) throw error;

    return { ok:true, criadas:rows.length };
  }

  async function atualizarMovimentacoesPedido(pedidoId, campos){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const { error } = await banco
      .from("patrimonio_movimentacoes")
      .update(campos)
      .eq("pedido_id", pedidoId);

    if(error) throw error;
    return true;
  }

  async function notificarOrigemPedidoCriado(pedidoId){
    const pedido = await buscarPedido(pedidoId);
    const itens = await buscarItensPedido(pedidoId);

    await registrarMovimentacaoSolicitada(pedidoId);

    const resultado = await gestorNotificacoes()
      .notificarPedidoCriado(pedido, itens);

    await registrarHistoricoPedido({
      pedido_id:pedidoId,
      status_anterior:null,
      status_novo:pedido.status || STATUS.SOLICITADO,
      observacao:resultado.ok
        ? "Pedido criado e notificação enviada para " +
          resultado.notificacoes + " aprovador(es) da origem."
        : "Pedido criado, mas nenhuma notificação foi enviada: " +
          (resultado.motivo || "sem destinatário habilitado.")
    });

    emitirAtlas("pedido.criado", {
      modulo:"EXPEDICAO",
      pedido_id:pedido.id,
      codigo:pedido.codigo || null,
      status:pedido.status || STATUS.SOLICITADO,
      obra_origem_id:pedido.obra_origem_id || null,
      obra_destino_id:pedido.obra_destino_id || pedido.obra_id || null,
      notificacoes:resultado.notificacoes || 0
    });

    return resultado;
  }

  async function notificarSolicitantePedido(pedido, tipo, titulo, mensagem, link){
    const resultado = await gestorNotificacoes()
      .notificarDestinoPedido(pedido, tipo, titulo, mensagem, link);

    return resultado.notificacoes || 0;
  }

  async function decidirItensPedido(pedidoId, decisoes){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const pedido = await buscarPedido(pedidoId);
    const itens = await buscarItensPedido(pedidoId);
    const usuario = nomeUsuario();
    const agora = new Date().toISOString();

    if(!itens.length) throw new Error("Pedido sem itens.");
    if(!Array.isArray(decisoes) || !decisoes.length) throw new Error("Nenhuma decisão enviada.");

    const mapa = new Map(decisoes.map(d => [String(d.item_id || d.id), d]));

    for(const item of itens){
      const decisao = mapa.get(String(item.id));
      if(!decisao) continue;

      const acao = String(decisao.acao || decisao.status || "").toUpperCase();

      if(["APROVAR", "APROVADO"].includes(acao)){
        const { error } = await banco
          .from("itens_retirada")
          .update({
            status: STATUS.APROVADO,
            usuario_autorizacao: usuario,
            data_autorizacao: agora,
            motivo_recusa: null,
            usuario_recusa: null,
            data_recusa: null
          })
          .eq("id", item.id);
        if(error) throw error;
      }

      if(["RECUSAR", "RECUSADO", "NEGAR"].includes(acao)){
        const motivo = decisao.motivo || decisao.motivo_recusa || "Recusado pela origem.";
        const { error } = await banco
          .from("itens_retirada")
          .update({
            status: STATUS.RECUSADO,
            motivo_recusa: motivo,
            usuario_recusa: usuario,
            data_recusa: agora
          })
          .eq("id", item.id);
        if(error) throw error;
      }
    }

    const itensAtualizados = await buscarItensPedido(pedidoId);
    const aprovados = itensAtualizados.filter(i => String(i.status).toUpperCase() === STATUS.APROVADO).length;
    const recusados = itensAtualizados.filter(i => String(i.status).toUpperCase() === STATUS.RECUSADO).length;
    const total = itensAtualizados.length;

    let statusPedido = STATUS.APROVADO_PARCIAL;
    if(aprovados === total) statusPedido = STATUS.APROVADO;
    if(recusados === total) statusPedido = STATUS.RECUSADO;

    await banco
      .from("pedidos_retirada")
      .update({ status: statusPedido })
      .eq("id", pedidoId);

    await registrarHistoricoPedido({
      pedido_id: pedidoId,
      status_anterior: pedido.status || STATUS.SOLICITADO,
      status_novo: statusPedido,
      observacao: "Decisão de itens registrada por " + usuario + ". Aprovados: " + aprovados + ", recusados: " + recusados + "."
    });

    await atualizarMovimentacoesPedido(pedidoId, {
      status: statusPedido,
      aprovado_por: usuario,
      data_aprovacao: agora
    });

    // Sprint 2.8: Reservas e fila saem do Workflow.
    // O Workflow decide a aprovação; o AtlasGestorReservas garante disponibilidade,
    // reserva o item aprovado e coloca concorrentes em EM_FILA quando necessário.
    let resultadoReservas = null;
    if(window.AtlasGestorReservas && typeof window.AtlasGestorReservas.processarPedidoAprovado === "function"){
      try{
        resultadoReservas = await window.AtlasGestorReservas.processarPedidoAprovado(pedidoId);
        if(resultadoReservas && resultadoReservas.statusPedido){
          statusPedido = resultadoReservas.statusPedido;
        }
      }catch(e){
        console.warn("AtlasWorkflow: falha no AtlasGestorReservas:", e?.message || e);
        await registrarHistoricoPedido({
          pedido_id: pedidoId,
          status_anterior: pedido.status || STATUS.SOLICITADO,
          status_novo: statusPedido,
          observacao: "Aprovação registrada, mas o Gestor de Reservas falhou: " + (e?.message || e)
        });
      }
    }

    const msgReserva = resultadoReservas
      ? " Reservas: " + (resultadoReservas.reservas || 0) + ", em fila: " + (resultadoReservas.filas || 0) + "."
      : "";

    /*
      REGRA OFICIAL ATLAS 3.1.8
      - Produto aprovado fica RESERVADO no catálogo.
      - Pedido aprovado entra imediatamente em EM_SEPARACAO.
      - Não existe mais uma etapa manual "Iniciar separação".
    */
    if(aprovados > 0 && ![STATUS.RECUSADO, STATUS.EM_FILA, STATUS.CANCELADO].includes(statusPedido)){
      const statusAntesSeparacao = statusPedido;
      statusPedido = STATUS.EM_SEPARACAO;

      const { error:erroPedidoSeparacao } = await banco
        .from("pedidos_retirada")
        .update({ status: STATUS.EM_SEPARACAO })
        .eq("id", pedidoId);
      if(erroPedidoSeparacao) throw erroPedidoSeparacao;

      const idsAprovados = itensAtualizados
        .filter(i => String(i.status || "").toUpperCase() === STATUS.APROVADO)
        .map(i => i.id);

      if(idsAprovados.length){
        const { error:erroItensReservados } = await banco
          .from("itens_retirada")
          .update({ status: "RESERVADO" })
          .in("id", idsAprovados);
        if(erroItensReservados) throw erroItensReservados;
      }

      await registrarHistoricoPedido({
        pedido_id: pedidoId,
        status_anterior: statusAntesSeparacao,
        status_novo: STATUS.EM_SEPARACAO,
        observacao: "Pedido autorizado e encaminhado automaticamente para separação por " + usuario + "."
      });

      await atualizarMovimentacoesPedido(pedidoId, {
        status: STATUS.EM_SEPARACAO,
        aprovado_por: usuario,
        data_aprovacao: agora
      });

      try{
        if(window.AtlasGestorNotificacoes?.notificarSeparacaoPedido){
          await window.AtlasGestorNotificacoes.notificarSeparacaoPedido(
            {
              ...pedido,
              status: STATUS.EM_SEPARACAO,
              itens_retirada: itensAtualizados
            },
            usuario
          );
        }
      }catch(e){
        console.warn("AtlasWorkflow: notificação da separação não enviada:", e?.message || e);
      }
    }

    const notificacaoSolicitante = statusPedido === STATUS.RECUSADO
      ? {
          tipo:"PEDIDO_RECUSADO",
          titulo:"❌ Pedido recusado",
          mensagem:
            "Pedido " + (pedido.codigo || "#" + pedido.id) +
            " foi recusado por " + usuario + "." + msgReserva,
          link:null
        }
      : statusPedido === STATUS.EM_FILA
        ? {
            tipo:"PEDIDO_EM_FILA",
            titulo:"⏳ Pedido em fila",
            mensagem:
              "Pedido " + (pedido.codigo || "#" + pedido.id) +
              " foi analisado por " + usuario +
              " e aguarda disponibilidade dos itens." + msgReserva,
            link:null
          }
        : {
            tipo:"PEDIDO_APROVADO",
            titulo:"✅ Pedido aprovado",
            mensagem:
              "Seu pedido " + (pedido.codigo || "#" + pedido.id) +
              " foi aprovado por " + usuario +
              " e encaminhado ao almoxarifado da origem para separação. " +
              "Nenhuma ação é necessária.",
            link:null
          };

    await notificarSolicitantePedido(
      { ...pedido, status: statusPedido },
      notificacaoSolicitante.tipo,
      notificacaoSolicitante.titulo,
      notificacaoSolicitante.mensagem,
      notificacaoSolicitante.link
    );

    return { ok:true, statusPedido, total, aprovados, recusados, reservas:resultadoReservas };
  }

  async function aprovarTodosItensPedido(pedidoId){
    const itens = await buscarItensPedido(pedidoId);
    return await decidirItensPedido(pedidoId, itens.map(i => ({ item_id:i.id, acao:"APROVAR" })));
  }

  async function recusarTodosItensPedido(pedidoId, motivo){
    const itens = await buscarItensPedido(pedidoId);
    return await decidirItensPedido(pedidoId, itens.map(i => ({ item_id:i.id, acao:"RECUSAR", motivo:motivo || "Recusado pela origem." })));
  }

  async function aprovarItensPedido(pedidoId, decisoes){
    return await decidirItensPedido(pedidoId, decisoes);
  }

  async function aprovarPedido(pedidoId){
    return await aprovarTodosItensPedido(pedidoId);
  }

  async function iniciarSeparacao(pedidoId){
    const pedido = await alterarStatusPedido(pedidoId, STATUS.EM_SEPARACAO, "Pedido entrou em separação.");
    await atualizarMovimentacoesPedido(pedidoId, {
      status: STATUS.EM_SEPARACAO,
      separado_por: nomeUsuario(),
      data_separacao: new Date().toISOString()
    });
    await notificarSolicitantePedido(pedido, "PEDIDO_EM_SEPARACAO", "📦 Pedido em separação", "Pedido " + (pedido.codigo || "#" + pedido.id) + " entrou em separação por " + nomeUsuario() + ".", "atlas.html?m=expedicao&aba=historico");
    return pedido;
  }

  async function finalizarSeparacao(pedidoId){
    const atual = await buscarPedido(pedidoId);
    if(String(atual.status||"").toUpperCase()===STATUS.AGUARDANDO_RETIRADA){
      return atual;
    }

    const pedido = await alterarStatusPedido(pedidoId, STATUS.AGUARDANDO_RETIRADA, "Separação finalizada. Aguardando motorista/retirada.");
    await atualizarMovimentacoesPedido(pedidoId, {
      status: STATUS.AGUARDANDO_RETIRADA,
      separado_por: nomeUsuario(),
      data_separacao: new Date().toISOString()
    });
    await notificarSolicitantePedido(
      pedido,"PEDIDO_AGUARDANDO_RETIRADA","📦 Seu pedido foi separado",
      "Pedido " + (pedido.codigo || "#" + pedido.id) + " foi separado por " + nomeUsuario() + " e aguarda transporte. Nenhuma ação é necessária.",null
    );
    try{
      if(gestorNotificacoes()?.notificarRetiradaPedido){
        await gestorNotificacoes().notificarRetiradaPedido(pedido,nomeUsuario());
      }
    }catch(e){
      console.warn("AtlasWorkflow: notificação de retirada/transporte não enviada:",e?.message || e);
    }
    return pedido;
  }

  async function enviarPedido(pedidoId, dadosTransporte){
    const pedido = await alterarStatusPedido(pedidoId, STATUS.EM_TRANSITO, "Pedido enviado.");
    const motorista = dadosTransporte?.motorista_nome || dadosTransporte?.motorista || "-";
    const placa = dadosTransporte?.veiculo_placa || dadosTransporte?.placa || "-";

    await atualizarMovimentacoesPedido(pedidoId, {
      status: STATUS.EM_TRANSITO,
      enviado_por: nomeUsuario(),
      motorista_nome: motorista,
      veiculo_placa: placa,
      veiculo_descricao: dadosTransporte?.veiculo_descricao || dadosTransporte?.veiculo || null,
      data_envio: new Date().toISOString()
    });

    await notificarSolicitantePedido(pedido, "PEDIDO_EM_TRANSITO", "🛣 Pedido em trânsito", "Pedido " + (pedido.codigo || "#" + pedido.id) + " saiu com motorista " + motorista + ", placa " + placa + ".", "atlas.html?m=expedicao&aba=transito");
    return pedido;
  }

  async function receberPedido(pedidoId, dadosRecebimento){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const pedido = await buscarPedido(pedidoId);
    const statusFinal = dadosRecebimento?.divergencia ? "RECEBIDO_COM_DIVERGENCIA" : STATUS.RECEBIDO;
    const atualizado = await alterarStatusPedido(pedidoId, statusFinal, dadosRecebimento?.observacao || "Pedido recebido.");

    await atualizarMovimentacoesPedido(pedidoId, {
      status: statusFinal,
      recebido_por: nomeUsuario(),
      conferencia_status: dadosRecebimento?.divergencia ? "COM_DIVERGENCIA" : "SEM_DIVERGENCIA",
      conferencia_observacao: dadosRecebimento?.observacao || null,
      data_recebimento: new Date().toISOString()
    });

    if(!dadosRecebimento?.divergencia){
      const itens = await buscarItensPedido(pedidoId);
      for(const item of itens.filter(i => i.patrimonio_id && String(i.status || "").toUpperCase() !== STATUS.RECUSADO)){
        await banco
          .from("patrimonio")
          .update({
            obra_id: item.obra_destino_id || pedido.obra_destino_id || pedido.obra_id || null,
            status: "EM_USO"
          })
          .eq("id", item.patrimonio_id);
      }
    }

    await gestorNotificacoes().notificarOrigemPedido(
      pedido,
      "PEDIDO_RECEBIDO",
      dadosRecebimento?.divergencia
        ? "⚠️ Pedido recebido com divergência"
        : "✅ Pedido entregue",
      "Pedido " + (pedido.codigo || "#" + pedido.id) +
        " foi recebido por " + nomeUsuario() +
        ". Conferência: " +
        (dadosRecebimento?.divergencia ? "com divergência" : "sem divergência") +
        ".",
      null
    );

    return atualizado;
  }

  AtlasWorkflow.STATUS = STATUS;
  AtlasWorkflow.buscarPedido = buscarPedido;
  AtlasWorkflow.buscarItensPedido = buscarItensPedido;
  AtlasWorkflow.registrarHistoricoPedido = registrarHistoricoPedido;
  AtlasWorkflow.registrarMovimentacaoSolicitada = registrarMovimentacaoSolicitada;
  AtlasWorkflow.alterarStatusPedido = alterarStatusPedido;
  AtlasWorkflow.notificarOrigemPedidoCriado = notificarOrigemPedidoCriado;
  AtlasWorkflow.aprovarPedido = aprovarPedido;
  AtlasWorkflow.aprovarItensPedido = aprovarItensPedido;
  AtlasWorkflow.aprovarTodosItensPedido = aprovarTodosItensPedido;
  AtlasWorkflow.recusarTodosItensPedido = recusarTodosItensPedido;
  AtlasWorkflow.decidirItensPedido = decidirItensPedido;
  AtlasWorkflow.iniciarSeparacao = iniciarSeparacao;
  AtlasWorkflow.finalizarSeparacao = finalizarSeparacao;
  AtlasWorkflow.enviarPedido = enviarPedido;
  AtlasWorkflow.receberPedido = receberPedido;

  window.AtlasWorkflow = AtlasWorkflow;

  console.log("✅ ATLAS WORKFLOW V3.3 carregado - separação avisa solicitante e transporte");
})();
