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

  async function criarTransferenciaDireta({ patrimonio, obraDestino, observacao }){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");
    if(!patrimonio?.id) throw new Error("Patrimônio inválido para transferência.");
    if(!obraDestino?.id) throw new Error("Obra destino inválida.");

    const origemId = patrimonio.obra_id ? Number(patrimonio.obra_id) : null;
    const destinoId = Number(obraDestino.id);
    if(!origemId) throw new Error("O patrimônio não possui obra de origem válida.");
    if(origemId === destinoId) throw new Error("Origem e destino da transferência são iguais.");

    const u = usuarioAtual();
    const agora = new Date().toISOString();
    const codigo = "TR-" + agora.slice(0,10).replace(/-/g, "") + "-" + String(Date.now()).slice(-6);
    const nomeDestino = obraDestino.nome || obraDestino.codigo_obra || ("Obra " + destinoId);

    // Segurança: um patrimônio não pode participar de duas transferências ativas.
    const { data:itensAtivos, error:erroItensAtivos } = await banco
      .from("itens_retirada")
      .select("pedido_id")
      .eq("patrimonio_id", patrimonio.id)
      .neq("status", STATUS.CANCELADO);
    if(erroItensAtivos) throw erroItensAtivos;

    if(Array.isArray(itensAtivos) && itensAtivos.length){
      const pedidoIds = [...new Set(itensAtivos.map(i => i.pedido_id).filter(Boolean))];
      if(pedidoIds.length){
        const { data:pedidosAtivos, error:erroPedidosAtivos } = await banco
          .from("pedidos_retirada")
          .select("id,codigo,status")
          .in("id", pedidoIds)
          .in("status", [STATUS.AGUARDANDO_RETIRADA, STATUS.EM_TRANSITO, "AGUARDANDO_CONFERENCIA"]);
        if(erroPedidosAtivos) throw erroPedidosAtivos;
        if(Array.isArray(pedidosAtivos) && pedidosAtivos.length){
          const existente = pedidosAtivos[0];
          throw new Error("Este patrimônio já possui uma transferência ativa (" + (existente.codigo || ("#" + existente.id)) + "). Conclua ou cancele a remessa antes de criar outra.");
        }
      }
    }

    const pedidoPayload = {
      codigo,
      status:STATUS.AGUARDANDO_RETIRADA,
      solicitante:u?.nome || u?.usuario || "Usuário",
      usuario_criacao:u?.nome || u?.usuario || "Usuário",
      obra_id:destinoId,
      obra_destino_id:destinoId,
      obra_nome:nomeDestino,
      obra_origem_id:origemId,
      observacao:observacao || "Transferência direta de patrimônio."
    };

    const { data:pedido, error:erroPedido } = await banco
      .from("pedidos_retirada")
      .insert([pedidoPayload])
      .select()
      .single();
    if(erroPedido) throw erroPedido;

    const itemPayload = {
      pedido_id:pedido.id,
      patrimonio_id:patrimonio.id,
      patrimonio_codigo:patrimonio.codigo_qr || patrimonio.codigo_bem || patrimonio.etiqueta || null,
      patrimonio_nome:patrimonio.nome_bem || patrimonio.descricao || "Patrimônio",
      // A posição de separação deve ser o endereço físico do patrimônio.
      // `localizacao` identifica obra/setor e não pode virar QR END-.
      endereco_codigo:patrimonio.endereco_estoque || patrimonio.localizacao_fisica || null,
      obra_origem_id:origemId,
      obra_destino_id:destinoId,
      status:"RESERVADO",
      quantidade:1
    };

    const { data:itens, error:erroItem } = await banco
      .from("itens_retirada")
      .insert([itemPayload])
      .select();

    if(erroItem){
      try{ await banco.from("pedidos_retirada").delete().eq("id", pedido.id); }catch(e){}
      throw erroItem;
    }

    const { data:patrimonioAtualizado, error:erroStatusPatrimonio } = await banco
      .from("patrimonio")
      .update({ status:"EM_TRANSFERENCIA" })
      .eq("id", patrimonio.id)
      .select("id,status")
      .maybeSingle();
    if(erroStatusPatrimonio || !patrimonioAtualizado || String(patrimonioAtualizado.status||"").toUpperCase() !== "EM_TRANSFERENCIA"){
      try{ await banco.from("itens_retirada").delete().eq("pedido_id", pedido.id); }catch(e){}
      try{ await banco.from("pedidos_retirada").delete().eq("id", pedido.id); }catch(e){}
      throw erroStatusPatrimonio || new Error("O banco não confirmou a alteração do patrimônio para EM_TRANSFERENCIA. Verifique RLS/permissões da tabela patrimonio.");
    }

    // Guarda o estado anterior para que um cancelamento ANTES da saída consiga
    // restaurar exatamente o patrimônio, sem presumir ESTOQUE ou EM_USO.
    const { error:erroMovCriacao } = await banco.from("movimentacoes").insert([{
      patrimonio_id:patrimonio.id,
      empresa_id:patrimonio.empresa_id || obraDestino.empresa_id || null,
      obra_origem_id:origemId,
      obra_destino_id:destinoId,
      tipo:"TRANSFERENCIA_CRIADA",
      status_anterior:String(patrimonio.status || "EM_USO").toUpperCase(),
      status_novo:"EM_TRANSFERENCIA",
      observacao:"Remessa " + codigo + " - " + (observacao || "Transferência direta de patrimônio."),
      usuario:nomeUsuario(),
      data_movimentacao:agora,
      ativo:true
    }]);
    if(erroMovCriacao){
      // Não deixa nascer uma transferência sem trilha suficiente para desfazer com segurança.
      try{ await banco.from("patrimonio").update({ status:patrimonio.status || "EM_USO" }).eq("id", patrimonio.id); }catch(e){}
      try{ await banco.from("itens_retirada").delete().eq("pedido_id", pedido.id); }catch(e){}
      try{ await banco.from("pedidos_retirada").delete().eq("id", pedido.id); }catch(e){}
      throw erroMovCriacao;
    }

    await registrarHistoricoPedido({
      pedido_id:pedido.id,
      status_anterior:null,
      status_novo:STATUS.AGUARDANDO_RETIRADA,
      observacao:"Transferência direta criada por " + nomeUsuario() + ". Aguardando retirada/transporte."
    });

    try{
      await banco.from("patrimonio_movimentacoes").insert([{
        patrimonio_id:patrimonio.id,
        pedido_id:pedido.id,
        empresa_id:patrimonio.empresa_id || obraDestino.empresa_id || null,
        obra_origem_id:origemId,
        obra_destino_id:destinoId,
        status:STATUS.AGUARDANDO_RETIRADA,
        solicitado_por:nomeUsuario(),
        data_solicitacao:agora,
        observacao:observacao || "Transferência direta criada pelo módulo Patrimônio."
      }]);
    }catch(e){
      console.warn("AtlasWorkflow: remessa criada, mas o histórico patrimonial não pôde ser registrado.", e?.message || e);
    }

    let notificacaoDestino = { ok:false, notificacoes:0, destinatarios:[] };
    try{
      const gestor = gestorNotificacoes();
      if(gestor?.notificarTransferenciaCriada){
        notificacaoDestino = await gestor.notificarTransferenciaCriada(pedido, itens || []);
      }
    }catch(e){
      console.warn("AtlasWorkflow: transferência criada, mas a notificação do destino falhou.", e?.message || e);
    }

    emitirAtlas("transferencia.criada", {
      modulo:"PATRIMONIO",
      pedido_id:pedido.id,
      codigo:pedido.codigo,
      patrimonio_id:patrimonio.id,
      obra_origem_id:origemId,
      obra_destino_id:destinoId,
      status:STATUS.AGUARDANDO_RETIRADA,
      notificacoes:notificacaoDestino.notificacoes || 0
    });

    return {
      ok:true,
      pedido,
      itens:itens || [],
      codigo:pedido.codigo,
      notificacaoDestino
    };
  }

  async function cancelarTransferenciaPatrimonio(pedidoId, motivo){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const motivoLimpo = String(motivo || "").trim();
    if(motivoLimpo.length < 5){
      throw new Error("Informe o motivo do cancelamento com pelo menos 5 caracteres.");
    }

    const idPedido = Number(pedidoId);
    if(!Number.isFinite(idPedido) || idPedido <= 0){
      throw new Error("Transferência inválida.");
    }

    // Cancelamento crítico é executado atomicamente no PostgreSQL.
    // A identidade e as permissões são validadas pela sessão Supabase Auth
    // dentro da RPC; o navegador não escolhe quem está cancelando.
    const { data, error } = await banco.rpc("atlas_cancelar_transferencia", {
      p_pedido_id: idPedido,
      p_motivo: motivoLimpo
    });

    if(error) throw error;
    if(!data?.ok){
      throw new Error(data?.message || "Não foi possível cancelar a transferência.");
    }

    emitirAtlas("transferencia.cancelada", {
      modulo:"PATRIMONIO",
      pedido_id:data.pedido_id || idPedido,
      codigo:data.codigo || null,
      patrimonio_id:data.patrimonio_id || null,
      obra_origem_id:data.obra_restaurada || null,
      status_restaurado:data.status_restaurado || null,
      cancelado_por:data.cancelado_por || null,
      motivo:motivoLimpo
    });

    return {
      ok:true,
      pedido:{ id:data.pedido_id || idPedido, codigo:data.codigo || null, status:STATUS.CANCELADO },
      patrimonio_id:data.patrimonio_id || null,
      status_restaurado:data.status_restaurado || null,
      obra_restaurada:data.obra_restaurada || null,
      cancelado_por:data.cancelado_por || null,
      restauracoes:1
    };
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
            data_recusa: agora,
            reservado: false,
            estoque_reservado: false
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

    const { error: erroAtualizacaoPedido } = await banco
      .from("pedidos_retirada")
      .update({
        status: statusPedido,
        usuario_autorizacao: aprovados > 0 ? usuario : null,
        data_autorizacao: aprovados > 0 ? agora : null
      })
      .eq("id", pedidoId);
    if(erroAtualizacaoPedido) throw erroAtualizacaoPedido;

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
        .update({
          status: STATUS.EM_SEPARACAO,
          usuario_autorizacao: usuario,
          data_autorizacao: agora
        })
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
            titulo:"✅ Pedido aprovado — aguardando separação",
            mensagem:
              "Seu pedido " + (pedido.codigo || "#" + pedido.id) +
              " foi aprovado por " + usuario +
              " e agora aguarda preparação na obra de origem.",
            // Informativa (verde): o solicitante acompanha o andamento e não
            // recebe uma tarefa operacional desta etapa.
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
    await notificarSolicitantePedido(pedido, "PEDIDO_EM_SEPARACAO", "📦 Pedido em separação", "Pedido " + (pedido.codigo || "#" + pedido.id) + " entrou em separação por " + nomeUsuario() + ".", "expedicao.html?aba=historico");
    return pedido;
  }

  async function finalizarSeparacao(pedidoId){
    const atual = await buscarPedido(pedidoId);
    if(String(atual.status||"").toUpperCase()===STATUS.AGUARDANDO_RETIRADA){
      return atual;
    }

    const agoraFinalizacao = new Date().toISOString();
    const pedido = await alterarStatusPedido(pedidoId, STATUS.AGUARDANDO_RETIRADA, "Separação finalizada. Aguardando motorista/retirada.", {
      usuario_finalizacao_separacao: nomeUsuario(),
      data_finalizacao_separacao: agoraFinalizacao
    });
    await atualizarMovimentacoesPedido(pedidoId, {
      status: STATUS.AGUARDANDO_RETIRADA,
      separado_por: nomeUsuario(),
      data_separacao: agoraFinalizacao
    });
    await notificarSolicitantePedido(
      pedido,"PEDIDO_AGUARDANDO_RETIRADA","📦 Seu pedido foi separado",
      "Pedido " + (pedido.codigo || "#" + pedido.id) + " foi separado por " + nomeUsuario() + " e aguarda transporte.",null
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

    const itensEnvio = await buscarItensPedido(pedidoId);
    for(const item of itensEnvio.filter(i => i.patrimonio_id && String(i.status || "").toUpperCase() !== STATUS.RECUSADO)){
      const { error:erroPat } = await db().from("patrimonio").update({ status:"EM_TRANSITO" }).eq("id", item.patrimonio_id);
      if(erroPat) throw erroPat;
    }

    await atualizarMovimentacoesPedido(pedidoId, {
      status: STATUS.EM_TRANSITO,
      enviado_por: nomeUsuario(),
      motorista_nome: motorista,
      veiculo_placa: placa,
      veiculo_descricao: dadosTransporte?.veiculo_descricao || dadosTransporte?.veiculo || null,
      data_envio: new Date().toISOString()
    });

    // A saída é um evento do DESTINO. Não notifica quem acabou de enviar.
    // Para transferência direta isso evita o antigo comportamento em que o
    // criador/origem recebia a própria notificação de trânsito.
    const gestor = gestorNotificacoes();
    if(gestor?.notificarTransferenciaEmTransito){
      await gestor.notificarTransferenciaEmTransito(pedido, itensEnvio, dadosTransporte || {});
    }else{
      await notificarSolicitantePedido(pedido, "PEDIDO_EM_TRANSITO", "🚚 Remessa em trânsito", "Remessa " + (pedido.codigo || "#" + pedido.id) + " saiu com motorista " + motorista + ", placa " + placa + ".", "expedicao.html?aba=receber");
    }
    return pedido;
  }

  async function receberPedido(pedidoId, dadosRecebimento){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const pedidoAntes = await buscarPedido(pedidoId);
    const statusPatrimonio = String(dadosRecebimento?.status_final || "ESTOQUE").toUpperCase();

    const { data:transacao, error:erroTransacao } = await banco.rpc("atlas_receber_pedido", {
      p_pedido_id:Number(pedidoId),
      p_usuario:nomeUsuario(),
      p_divergencia:!!dadosRecebimento?.divergencia,
      p_observacao:dadosRecebimento?.observacao || null,
      p_status_patrimonio:statusPatrimonio
    });

    if(erroTransacao) throw erroTransacao;

    const pedido = await buscarPedido(pedidoId);
    const itensRecebimento = await buscarItensPedido(pedidoId);

    // A transação no PostgreSQL é a autoridade sobre estoque, patrimônio,
    // itens e status do pedido. Notificações só são disparadas após COMMIT.
    if(!transacao?.ja_processado){
      try{
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
      }catch(e){
        console.warn("AtlasWorkflow: recebimento concluído, mas a notificação da origem não pôde ser enviada.", e?.message || e);
      }

      try{
        const gestor = gestorNotificacoes();
        if(gestor?.notificarOwnerTransferenciaConcluida){
          await gestor.notificarOwnerTransferenciaConcluida(
            pedido,
            itensRecebimento,
            { ...dadosRecebimento, recebido_por:nomeUsuario() }
          );
        }
      }catch(e){
        console.warn("AtlasWorkflow: recebimento concluído, mas o controle de conclusão para o OWNER não pôde ser notificado.", e?.message || e);
      }
    }

    return {
      ...pedido,
      status_anterior:pedidoAntes.status || null,
      transacao:transacao || null
    };
  }

  AtlasWorkflow.STATUS = STATUS;
  AtlasWorkflow.buscarPedido = buscarPedido;
  AtlasWorkflow.buscarItensPedido = buscarItensPedido;
  AtlasWorkflow.registrarHistoricoPedido = registrarHistoricoPedido;
  AtlasWorkflow.criarTransferenciaDireta = criarTransferenciaDireta;
  AtlasWorkflow.cancelarTransferenciaPatrimonio = cancelarTransferenciaPatrimonio;
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

  void 0;
})();
