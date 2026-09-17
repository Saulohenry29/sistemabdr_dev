/* =========================================================
   ATLAS GESTOR DE RESERVAS V1.0
   Arquivo: JS/AtlasGestorReservas.js
   Sprint 2.8: Origem → Destino, reservas e fila

   Responsabilidade única:
   - verificar disponibilidade;
   - reservar patrimônio/produto aprovado;
   - impedir dupla promessa do mesmo patrimônio;
   - colocar pedidos concorrentes em EM_FILA;
   - liberar reserva quando pedido for cancelado/recusado;
   - promover fila quando item voltar ao estoque;
   - emitir eventos para AtlasEvents / AtlasEventStore;
   - solicitar notificações ao AtlasGestorNotificacoes.

   Regra oficial:
   - Nunca usa CD fixo.
   - Tudo trabalha com obra_origem_id → obra_destino_id.
   - Patrimônio só muda para destino no recebimento confirmado.
========================================================= */
(function(){
  "use strict";

  if(window.AtlasGestorReservas && window.AtlasGestorReservas.__loaded){
    console.warn("AtlasGestorReservas já carregado. Ignorando duplicado.");
    return;
  }

  const Gestor = {
    __loaded:true,
    versao:"1.0-sprint-2.8-reservas-fila"
  };

  const STATUS = {
    SOLICITADO:"SOLICITADO",
    PENDENTE:"PENDENTE",
    APROVADO:"APROVADO",
    APROVADO_PARCIAL:"APROVADO_PARCIAL",
    RECUSADO:"RECUSADO",
    RESERVADO:"RESERVADO",
    EM_FILA:"EM_FILA",
    AGUARDANDO_CONFIRMACAO:"AGUARDANDO_CONFIRMACAO",
    EM_SEPARACAO:"EM_SEPARACAO",
    AGUARDANDO_RETIRADA:"AGUARDANDO_RETIRADA",
    EM_TRANSITO:"EM_TRANSITO",
    RECEBIDO:"RECEBIDO",
    CANCELADO:"CANCELADO"
  };

  const STATUS_ITEM_BLOQUEANTES = [
    STATUS.APROVADO,
    STATUS.RESERVADO,
    STATUS.EM_SEPARACAO,
    STATUS.AGUARDANDO_RETIRADA,
    STATUS.EM_TRANSITO
  ];

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
    }catch(e){ return null; }
  }

  function nomeUsuario(){
    const u = usuarioAtual();
    return u?.nome || u?.usuario || "SISTEMA";
  }

  function usuarioId(){
    const u = usuarioAtual();
    return u?.id || u?.usuario_id || null;
  }

  function empresaAtualId(){
    const u = usuarioAtual();
    return Number(u?.empresa_id || 17);
  }

  function agoraISO(){ return new Date().toISOString(); }

  function normalStatus(s){
    return String(s || "").trim().toUpperCase().replace(/\s+/g,"_");
  }

  function texto(v){ return String(v ?? "").trim(); }

  function codigoPedido(pedido){
    return "PED-" + (pedido?.id || "?");
  }

  function itemDescricao(item){
    const codigo = texto(item?.patrimonio_codigo || item?.codigo || item?.produto_codigo || (item?.patrimonio_id ? "PAT-" + item.patrimonio_id : item?.produto_id ? "EST-" + item.produto_id : "ITEM-" + item?.id));
    const nome = texto(item?.patrimonio_nome || item?.produto_nome || item?.descricao || "Item");
    return codigo + (nome && nome !== codigo ? " — " + nome : "");
  }

  function emitir(evento, payload){
    try{
      if(window.AtlasEvents && typeof window.AtlasEvents.emit === "function"){
        return window.AtlasEvents.emit(evento, payload || {});
      }
      window.dispatchEvent(new CustomEvent("atlas:" + evento, {
        detail:{ evento, payload:payload || {}, criado_em:agoraISO(), origem:"AtlasGestorReservas" }
      }));
      return true;
    }catch(e){
      console.warn("AtlasGestorReservas: falha ao emitir evento", evento, e?.message || e);
      return false;
    }
  }

  async function buscarPedido(pedidoId){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");
    const { data, error } = await banco.from("pedidos_retirada").select("*").eq("id", pedidoId).single();
    if(error) throw error;
    if(!data) throw new Error("Pedido não encontrado: " + pedidoId);
    return data;
  }

  async function buscarItensPedido(pedidoId){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");
    const { data, error } = await banco.from("itens_retirada").select("*").eq("pedido_id", pedidoId).order("id", { ascending:true });
    if(error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function registrarHistorico(pedidoId, anterior, novo, obs){
    try{
      const banco = db();
      await banco.from("historico_pedidos_retirada").insert([{
        pedido_id:pedidoId,
        status_anterior:anterior || null,
        status_novo:novo || null,
        usuario:nomeUsuario(),
        observacao:obs || "",
        created_at:agoraISO()
      }]);
    }catch(e){
      console.warn("AtlasGestorReservas: histórico não gravado", e?.message || e);
    }
  }

  async function notificarDestino(pedido, tipo, titulo, mensagem, link){
    try{
      if(window.AtlasGestorNotificacoes && typeof window.AtlasGestorNotificacoes.notificarDestinoPedido === "function"){
        return await window.AtlasGestorNotificacoes.notificarDestinoPedido(pedido, tipo, titulo, mensagem, link || "atlas.html?m=expedicao&aba=historico");
      }
    }catch(e){
      console.warn("AtlasGestorReservas: falha ao notificar destino", e?.message || e);
    }
    return { ok:false, notificacoes:0 };
  }

  async function notificarOrigem(pedido, titulo, mensagem, tipo){
    try{
      if(window.AtlasGestorNotificacoes && typeof window.AtlasGestorNotificacoes.notificarPedidoCriado === "function"){
        // Reaproveita o roteamento da origem, mas com mensagem própria via notificarLista quando possível.
        const empresaId = pedido?.empresa_id || empresaAtualId();
        const origemId = pedido?.obra_origem_id || null;
        const usuarios = await window.AtlasGestorNotificacoes.buscarUsuariosEmpresa(empresaId);
        const responsaveis = window.AtlasGestorNotificacoes.filtrarResponsaveisOrigem(usuarios, pedido, origemId);
        return await window.AtlasGestorNotificacoes.notificarLista(responsaveis, {
          empresa_id:empresaId,
          tipo:tipo || "RESERVA",
          titulo,
          mensagem,
          link:"atlas.html?m=expedicao&aba=solicitacoes",
          pedido_id:pedido.id,
          obra_origem_id:pedido.obra_origem_id || null,
          obra_destino_id:pedido.obra_destino_id || pedido.obra_id || null
        });
      }
    }catch(e){
      console.warn("AtlasGestorReservas: falha ao notificar origem", e?.message || e);
    }
    return 0;
  }

  async function verificarDisponibilidadePatrimonio(item, pedidoId){
    const banco = db();
    const patId = item?.patrimonio_id;
    if(!patId) return { disponivel:false, motivo:"Item sem patrimonio_id." };

    const pat = await banco.from("patrimonio").select("id,codigo_bem,codigo_qr,etiqueta,nome_bem,status,obra_id,ativo").eq("id", patId).single();
    if(pat.error) throw pat.error;

    const statusPat = normalStatus(pat.data?.status);
    const statusBloqueiaPat = ["RESERVADO", "EM_TRANSITO", "BAIXADO", "QUEBRADO", "MANUTENCAO"].includes(statusPat);

    const outros = await banco
      .from("itens_retirada")
      .select("id,pedido_id,status,patrimonio_id")
      .eq("patrimonio_id", patId)
      .in("status", STATUS_ITEM_BLOQUEANTES)
      .neq("pedido_id", pedidoId)
      .limit(20);
    if(outros.error) throw outros.error;

    const bloqueadoPorPedido = Array.isArray(outros.data) && outros.data.length > 0;

    if(statusBloqueiaPat || bloqueadoPorPedido){
      return {
        disponivel:false,
        motivo: statusBloqueiaPat ? "Patrimônio com status " + statusPat + "." : "Patrimônio já reservado/aprovado em outro pedido.",
        patrimonio:pat.data,
        conflitos:outros.data || []
      };
    }

    return { disponivel:true, patrimonio:pat.data, conflitos:[] };
  }

  async function verificarDisponibilidadeProduto(item, pedidoId){
    const banco = db();
    const produtoId = item?.produto_id;
    if(!produtoId) return { disponivel:false, motivo:"Item sem produto_id." };

    const prod = await banco.from("estoque_produtos").select("id,codigo,descricao,produto,quantidade,qtd,status,obra_id").eq("id", produtoId).single();
    if(prod.error) throw prod.error;

    const qtdTotal = Number(prod.data?.quantidade ?? prod.data?.qtd ?? 0);
    const quantidadeSolicitada = Number(item?.quantidade || 1);

    const res = await banco
      .from("itens_retirada")
      .select("id,pedido_id,status,produto_id,quantidade")
      .eq("produto_id", produtoId)
      .in("status", STATUS_ITEM_BLOQUEANTES)
      .neq("pedido_id", pedidoId)
      .limit(1000);
    if(res.error) throw res.error;

    const reservado = (res.data || []).reduce((acc, x) => acc + Number(x.quantidade || 1), 0);
    const livre = qtdTotal - reservado;

    return {
      disponivel: livre >= quantidadeSolicitada,
      produto:prod.data,
      quantidade_total:qtdTotal,
      quantidade_reservada:reservado,
      quantidade_livre:livre,
      motivo: livre >= quantidadeSolicitada ? null : "Quantidade indisponível no momento."
    };
  }

  async function colocarItemEmFila(pedido, item, motivo){
    const banco = db();
    const obs = motivo || "O item solicitado não está disponível no momento. Pedido aguardando disponibilidade.";

    const { error } = await banco.from("itens_retirada").update({
      status:STATUS.EM_FILA,
      reservado:false,
      estoque_reservado:false,
      observacao_divergencia:null
    }).eq("id", item.id);
    if(error) throw error;

    emitir("reserva.fila", {
      modulo:"RESERVAS",
      empresa_id:pedido.empresa_id || empresaAtualId(),
      pedido_id:pedido.id,
      patrimonio_id:item.patrimonio_id || null,
      produto_id:item.produto_id || null,
      usuario_id:usuarioId(),
      usuario_nome:nomeUsuario(),
      obra_origem_id:pedido.obra_origem_id || item.obra_origem_id || null,
      obra_destino_id:pedido.obra_destino_id || pedido.obra_id || item.obra_destino_id || null,
      descricao:"Item colocado em fila aguardando disponibilidade.",
      dados_json:{ item_id:item.id, item:itemDescricao(item), motivo:obs }
    });

    await notificarDestino(
      pedido,
      "PEDIDO_EM_FILA",
      "⏳ Pedido aguardando disponibilidade",
      codigoPedido(pedido) + ": o item " + itemDescricao(item) + " não está disponível no momento. Pedido aguardando disponibilidade.",
      "atlas.html?m=expedicao&aba=historico"
    );

    return true;
  }

  async function reservarItem(pedido, item){
    const banco = db();
    const agora = agoraISO();

    const { error } = await banco.from("itens_retirada").update({
      status:STATUS.RESERVADO,
      reservado:true,
      estoque_reservado:true,
      data_reserva:agora,
      usuario_reserva:nomeUsuario()
    }).eq("id", item.id);
    if(error) throw error;

    // Sprint 3.1.4: reserva operacional não altera o status do patrimônio.
    // O patrimônio só muda no recebimento do destino.

    emitir("reserva.criada", {
      modulo:"RESERVAS",
      empresa_id:pedido.empresa_id || empresaAtualId(),
      pedido_id:pedido.id,
      patrimonio_id:item.patrimonio_id || null,
      produto_id:item.produto_id || null,
      usuario_id:usuarioId(),
      usuario_nome:nomeUsuario(),
      obra_origem_id:pedido.obra_origem_id || item.obra_origem_id || null,
      obra_destino_id:pedido.obra_destino_id || pedido.obra_id || item.obra_destino_id || null,
      descricao:"Reserva criada para item aprovado.",
      dados_json:{ item_id:item.id, item:itemDescricao(item), data_reserva:agora }
    });

    return true;
  }

  async function colocarConcorrentesEmFila(pedido, itemReservado){
    const banco = db();
    if(!itemReservado?.patrimonio_id && !itemReservado?.produto_id) return { afetados:0 };

    let query = banco.from("itens_retirada").select("*").neq("pedido_id", pedido.id).in("status", [STATUS.PENDENTE, STATUS.SOLICITADO, STATUS.APROVADO]);
    if(itemReservado.patrimonio_id) query = query.eq("patrimonio_id", itemReservado.patrimonio_id);
    else query = query.eq("produto_id", itemReservado.produto_id);

    const { data, error } = await query;
    if(error) throw error;

    const concorrentes = Array.isArray(data) ? data : [];
    let afetados = 0;

    for(const item of concorrentes){
      const pedidoConcorrente = await buscarPedido(item.pedido_id);
      await colocarItemEmFila(pedidoConcorrente, item, "Item ficou indisponível após reserva de outro pedido.");
      await recalcularStatusPedido(item.pedido_id);
      afetados++;
    }

    return { afetados };
  }

  async function recalcularStatusPedido(pedidoId){
    const banco = db();
    const pedido = await buscarPedido(pedidoId);
    const itens = await buscarItensPedido(pedidoId);
    if(!itens.length) return pedido.status;

    const stats = itens.map(i => normalStatus(i.status));
    const total = stats.length;
    const fila = stats.filter(s => s === STATUS.EM_FILA).length;
    const recusados = stats.filter(s => s === STATUS.RECUSADO).length;
    const aprovados = stats.filter(s => [STATUS.APROVADO, STATUS.RESERVADO, STATUS.EM_SEPARACAO, STATUS.AGUARDANDO_RETIRADA, STATUS.EM_TRANSITO].includes(s)).length;

    let novo = pedido.status || STATUS.SOLICITADO;
    if(fila === total) novo = STATUS.EM_FILA;
    else if(recusados === total) novo = STATUS.RECUSADO;
    else if(aprovados === total) novo = STATUS.RESERVADO;
    else if(aprovados > 0 || fila > 0 || recusados > 0) novo = STATUS.APROVADO_PARCIAL;

    if(normalStatus(pedido.status) !== novo){
      const { error } = await banco.from("pedidos_retirada").update({ status:novo }).eq("id", pedidoId);
      if(error) throw error;
      await registrarHistorico(pedidoId, pedido.status, novo, "Status recalculado pelo AtlasGestorReservas.");
    }

    return novo;
  }

  async function processarPedidoAprovado(pedidoId){
    const pedido = await buscarPedido(pedidoId);
    const itens = await buscarItensPedido(pedidoId);
    const aprovados = itens.filter(i => normalStatus(i.status) === STATUS.APROVADO);

    let reservas = 0;
    let filas = 0;
    let concorrentes = 0;

    for(const item of aprovados){
      if(item.patrimonio_id){
        const disp = await verificarDisponibilidadePatrimonio(item, pedidoId);
        if(!disp.disponivel){
          await colocarItemEmFila(pedido, item, disp.motivo);
          filas++;
          continue;
        }
        await reservarItem(pedido, item);
        reservas++;
        const c = await colocarConcorrentesEmFila(pedido, item);
        concorrentes += c.afetados || 0;
        continue;
      }

      if(item.produto_id){
        const disp = await verificarDisponibilidadeProduto(item, pedidoId);
        if(!disp.disponivel){
          await colocarItemEmFila(pedido, item, disp.motivo);
          filas++;
          continue;
        }
        await reservarItem(pedido, item);
        reservas++;
      }
    }

    const statusPedido = await recalcularStatusPedido(pedidoId);

    emitir("pedido.aprovado", {
      modulo:"EXPEDICAO",
      empresa_id:pedido.empresa_id || empresaAtualId(),
      pedido_id:pedido.id,
      usuario_id:usuarioId(),
      usuario_nome:nomeUsuario(),
      obra_origem_id:pedido.obra_origem_id || null,
      obra_destino_id:pedido.obra_destino_id || pedido.obra_id || null,
      descricao:"Pedido aprovado e reservas processadas.",
      dados_json:{ reservas, filas, concorrentes, statusPedido }
    });

    return { ok:true, reservas, filas, concorrentes, statusPedido };
  }

  async function liberarReservaPedido(pedidoId, motivo){
    const banco = db();
    const pedido = await buscarPedido(pedidoId);
    const itens = await buscarItensPedido(pedidoId);
    const reservados = itens.filter(i => i.reservado === true || normalStatus(i.status) === STATUS.APROVADO || normalStatus(i.status) === STATUS.RESERVADO);

    let liberadas = 0;
    for(const item of reservados){
      await banco.from("itens_retirada").update({
        reservado:false,
        estoque_reservado:false,
        status:STATUS.CANCELADO
      }).eq("id", item.id);

      if(item.patrimonio_id){
        await banco.from("patrimonio").update({ status:"ESTOQUE" }).eq("id", item.patrimonio_id);
        await promoverFilaPatrimonio(item.patrimonio_id, pedido);
      }

      emitir("reserva.liberada", {
        modulo:"RESERVAS",
        empresa_id:pedido.empresa_id || empresaAtualId(),
        pedido_id:pedido.id,
        patrimonio_id:item.patrimonio_id || null,
        produto_id:item.produto_id || null,
        usuario_id:usuarioId(),
        usuario_nome:nomeUsuario(),
        obra_origem_id:pedido.obra_origem_id || null,
        obra_destino_id:pedido.obra_destino_id || pedido.obra_id || null,
        descricao:"Reserva liberada.",
        dados_json:{ item_id:item.id, item:itemDescricao(item), motivo:motivo || "Reserva liberada." }
      });
      liberadas++;
    }

    await banco.from("pedidos_retirada").update({ status:STATUS.CANCELADO }).eq("id", pedidoId);
    await registrarHistorico(pedidoId, pedido.status, STATUS.CANCELADO, motivo || "Pedido cancelado e reservas liberadas.");
    return { ok:true, liberadas };
  }

  async function promoverFilaPatrimonio(patrimonioId, pedidoLiberado){
    const banco = db();
    const { data, error } = await banco
      .from("itens_retirada")
      .select("*")
      .eq("patrimonio_id", patrimonioId)
      .eq("status", STATUS.EM_FILA)
      .order("id", { ascending:true })
      .limit(1);
    if(error) throw error;

    const proximo = Array.isArray(data) && data.length ? data[0] : null;
    if(!proximo) return { ok:true, promovido:false };

    const pedido = await buscarPedido(proximo.pedido_id);
    await banco.from("pedidos_retirada").update({ status:STATUS.AGUARDANDO_CONFIRMACAO }).eq("id", pedido.id);
    await banco.from("itens_retirada").update({ status:STATUS.AGUARDANDO_CONFIRMACAO }).eq("id", proximo.id);

    emitir("reserva.promovida", {
      modulo:"RESERVAS",
      empresa_id:pedido.empresa_id || empresaAtualId(),
      pedido_id:pedido.id,
      patrimonio_id:patrimonioId,
      usuario_id:null,
      usuario_nome:"Atlas",
      obra_origem_id:pedido.obra_origem_id || null,
      obra_destino_id:pedido.obra_destino_id || pedido.obra_id || null,
      descricao:"Pedido em fila promovido para confirmação de interesse.",
      dados_json:{ pedido_liberado_id:pedidoLiberado?.id || null, item_id:proximo.id, item:itemDescricao(proximo) }
    });

    await notificarOrigem(
      pedido,
      "📦 Item disponível",
      codigoPedido(pedido) + ": existe um pedido aguardando disponibilidade para " + itemDescricao(proximo) + ". Abra o pedido para análise.",
      "RESERVA_PROMOVIDA"
    );

    return { ok:true, promovido:true, pedido_id:pedido.id, item_id:proximo.id };
  }

  async function confirmarInteresse(pedidoId, aindaQuer){
    const banco = db();
    const pedido = await buscarPedido(pedidoId);
    const novo = aindaQuer ? STATUS.SOLICITADO : STATUS.CANCELADO;
    await banco.from("pedidos_retirada").update({ status:novo }).eq("id", pedidoId);
    await banco.from("itens_retirada").update({ status:novo }).eq("pedido_id", pedidoId).eq("status", STATUS.AGUARDANDO_CONFIRMACAO);

    emitir(aindaQuer ? "pedido.aguardando_confirmacao" : "pedido.cancelado", {
      modulo:"RESERVAS",
      empresa_id:pedido.empresa_id || empresaAtualId(),
      pedido_id:pedido.id,
      usuario_id:usuarioId(),
      usuario_nome:nomeUsuario(),
      obra_origem_id:pedido.obra_origem_id || null,
      obra_destino_id:pedido.obra_destino_id || pedido.obra_id || null,
      descricao:aindaQuer ? "Solicitante confirmou interesse." : "Solicitante informou que não precisa mais.",
      dados_json:{ ainda_quer:!!aindaQuer }
    });

    await registrarHistorico(pedidoId, pedido.status, novo, aindaQuer ? "Solicitante confirmou interesse." : "Solicitante cancelou por não precisar mais.");
    return { ok:true, status:novo };
  }

  async function statusPatrimonio(patrimonioId){
    const banco = db();
    const pat = await banco.from("patrimonio").select("id,codigo_bem,codigo_qr,nome_bem,status,obra_id").eq("id", patrimonioId).single();
    const fila = await banco.from("itens_retirada").select("id,pedido_id,status").eq("patrimonio_id", patrimonioId).eq("status", STATUS.EM_FILA);
    const reservado = await banco.from("itens_retirada").select("id,pedido_id,status").eq("patrimonio_id", patrimonioId).in("status", STATUS_ITEM_BLOQUEANTES).limit(1);

    return {
      patrimonio:pat.data || null,
      reservado:!!(reservado.data && reservado.data.length),
      reserva:reservado.data?.[0] || null,
      fila:Array.isArray(fila.data) ? fila.data : []
    };
  }

  Gestor.STATUS = STATUS;
  Gestor.buscarPedido = buscarPedido;
  Gestor.buscarItensPedido = buscarItensPedido;
  Gestor.verificarDisponibilidadePatrimonio = verificarDisponibilidadePatrimonio;
  Gestor.verificarDisponibilidadeProduto = verificarDisponibilidadeProduto;
  Gestor.processarPedidoAprovado = processarPedidoAprovado;
  Gestor.recalcularStatusPedido = recalcularStatusPedido;
  Gestor.liberarReservaPedido = liberarReservaPedido;
  Gestor.promoverFilaPatrimonio = promoverFilaPatrimonio;
  Gestor.confirmarInteresse = confirmarInteresse;
  Gestor.statusPatrimonio = statusPatrimonio;

  window.AtlasGestorReservas = Gestor;

  console.log("✅ ATLAS GESTOR RESERVAS V1.0 carregado - reservas, fila e origem→destino");
})();
