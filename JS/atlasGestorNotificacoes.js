/* =========================================================
   ATLAS GESTOR DE NOTIFICAÇÕES V3.0
   Arquivo: JS/atlasGestorNotificacoes.js
   Sprint 2.6: Central oficial de destinatários

   Responsabilidade:
   - decidir quem deve receber notificações;
   - respeitar obra/setor, cargo/perfil e permissões;
   - evitar notificar o próprio solicitante no pedido.criado;
   - ser a única porta de escrita na tabela notificacoes;
   - emitir eventos para AtlasEvents / AtlasEventStore / sininho;
   - separar notificações de ação das informativas.
========================================================= */
(function(){
  "use strict";

  if(window.AtlasGestorNotificacoes && window.AtlasGestorNotificacoes.__loaded){
    console.warn("AtlasGestorNotificacoes já carregado. Ignorando duplicado.");
    return;
  }

  const Gestor = {
    __loaded:true,
    versao:"3.4-sem-autonotificacao-global"
  };


  const PERMISSOES_EXPEDICAO = [
    "RECEBER_NOTIFICACOES_EXPEDICAO",
    "RECEBER_NOTIFICACOES_MOVIMENTACOES",
    "RECEBER_NOTIFICACOES",
    "EXPEDICAO_APROVAR",
    "EXPEDICAO_SEPARAR",
    "EXPEDICAO_ENTREGAR",
    "EXPEDICAO_TRANSPORTE",
    "APROVAR_PEDIDO_ORIGEM"
  ];

  const BLOQUEIOS_EXPEDICAO = [
    "NAO_RECEBER_NOTIFICACOES_EXPEDICAO",
    "NAO_RECEBER_MOVIMENTACOES",
    "BLOQUEAR_NOTIFICACOES_EXPEDICAO"
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

  function empresaAtualId(){
    const u = usuarioAtual();
    return Number(u?.empresa_id || 17);
  }

  function texto(v){ return String(v || "").trim(); }
  function upper(v){ return texto(v).toUpperCase(); }

  function emitir(evento, payload){
    try{
      if(window.AtlasEvents && typeof window.AtlasEvents.emit === "function"){
        return window.AtlasEvents.emit(evento, payload || {});
      }
      window.dispatchEvent(new CustomEvent("atlas:" + evento, {
        detail:{ evento, payload:payload || {}, criado_em:new Date().toISOString(), origem:"AtlasGestorNotificacoes" }
      }));
      return true;
    }catch(e){
      console.warn("AtlasGestorNotificacoes: falha ao emitir evento", evento, e?.message || e);
      return false;
    }
  }

  function listaObrasLiberadas(u){
    return texto(u?.obras_liberadas)
      .split(/[;,|]/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  function permissoesUsuario(u){
    return upper(u?.permissoes);
  }

  function listaPermissoesUsuario(u){
    return texto(u?.permissoes)
      .split(",")
      .map(item => upper(item))
      .filter(Boolean);
  }

  function usuarioAceitaNotificacoes(u){
    if(!u || u.ativo === false) return false;

    return listaPermissoesUsuario(u)
      .includes("RECEBER_NOTIFICACOES");
  }


  const DETALHES_NOTIFICACAO = {
    PATRIMONIO:["NOTIF_PATRIMONIO_CRIACAO","NOTIF_PATRIMONIO_ETIQUETA","NOTIF_PATRIMONIO_MOVIMENTACAO","NOTIF_PATRIMONIO_STATUS"],
    EXPEDICAO:["NOTIF_EXPEDICAO_PEDIDOS","NOTIF_EXPEDICAO_APROVACAO","NOTIF_EXPEDICAO_SEPARACAO","NOTIF_EXPEDICAO_TRANSPORTE","NOTIF_EXPEDICAO_RECEBIMENTO"],
    ESTOQUE:["NOTIF_ESTOQUE_MOVIMENTACAO","NOTIF_ESTOQUE_BAIXO"],
    INVENTARIO:["NOTIF_INVENTARIO_ANDAMENTO","NOTIF_INVENTARIO_FINALIZADO"]
  };

  function preferenciaDoTipo(tipo){
    const t=upper(tipo);
    if(t.includes("PATRIMONIO")){
      if(t.includes("CRIAD") || t.includes("CADASTR")) return ["PATRIMONIO","NOTIF_PATRIMONIO_CRIACAO"];
      if(t.includes("ETIQUETA") || t.includes("IMPRESS")) return ["PATRIMONIO","NOTIF_PATRIMONIO_ETIQUETA"];
      if(t.includes("MOVIMENT") || t.includes("TRANSFER")) return ["PATRIMONIO","NOTIF_PATRIMONIO_MOVIMENTACAO"];
      return ["PATRIMONIO","NOTIF_PATRIMONIO_STATUS"];
    }
    if(t.includes("PEDIDO") || t.includes("EXPEDICAO") || t.includes("RETIRADA") || t.includes("RECEB") || t.includes("ROMANEIO") || t.includes("NFE")){
      if(t.includes("CRIADO") || t.includes("SOLICIT")) return ["EXPEDICAO","NOTIF_EXPEDICAO_PEDIDOS"];
      if(t.includes("APROV") || t.includes("RECUS")) return ["EXPEDICAO","NOTIF_EXPEDICAO_APROVACAO"];
      if(t.includes("SEPAR") || t.includes("ROMANEIO") || t.includes("NFE")) return ["EXPEDICAO","NOTIF_EXPEDICAO_SEPARACAO"];
      if(t.includes("TRANSITO") || t.includes("RETIRADA") || t.includes("ENVIADO")) return ["EXPEDICAO","NOTIF_EXPEDICAO_TRANSPORTE"];
      if(t.includes("RECEB") || t.includes("DIVERGEN")) return ["EXPEDICAO","NOTIF_EXPEDICAO_RECEBIMENTO"];
      return ["EXPEDICAO","NOTIF_EXPEDICAO_PEDIDOS"];
    }
    if(t.includes("INVENTARIO")) return ["INVENTARIO",t.includes("FINAL")?"NOTIF_INVENTARIO_FINALIZADO":"NOTIF_INVENTARIO_ANDAMENTO"];
    if(t.includes("ESTOQUE")) return ["ESTOQUE",t.includes("BAIXO")?"NOTIF_ESTOQUE_BAIXO":"NOTIF_ESTOQUE_MOVIMENTACAO"];
    return ["GERAL",null];
  }

  function usuarioAceitaTipoNotificacao(u,tipo){
    if(!usuarioAceitaNotificacoes(u)) return false;
    const perms=listaPermissoesUsuario(u);
    const [modulo,detalhe]=preferenciaDoTipo(tipo);
    if(modulo==="GERAL") return true;
    const configuradas=Object.values(DETALHES_NOTIFICACAO).flat().filter(p=>perms.includes(p));
    const algumModulo=["PATRIMONIO","EXPEDICAO","ESTOQUE","INVENTARIO"].some(m=>perms.includes("NOTIF_"+m));
    // Compatibilidade com usuários antigos: apenas RECEBER_NOTIFICACOES = recebe tudo.
    if(!configuradas.length && !algumModulo) return true;
    if(perms.includes("NOTIF_"+modulo)) return true;
    return detalhe ? perms.includes(detalhe) : false;
  }

  function possuiAlgumaPermissao(u, lista){
    const p = permissoesUsuario(u);
    return (lista || []).some(x => p.includes(x));
  }

  function estaBloqueadoExpedicao(u){
    return possuiAlgumaPermissao(u, BLOQUEIOS_EXPEDICAO);
  }


  function podeAprovarPedido(u){
    if(!u || u.ativo === false || estaBloqueadoExpedicao(u)) return false;
    const perfil = upper(u?.perfil || u?.cargo);
    return ["MASTER","ADMIN","GESTOR","SUPERVISOR"].includes(perfil) ||
      possuiAlgumaPermissao(u, ["EXPEDICAO_APROVAR","APROVAR_PEDIDO_ORIGEM"]);
  }



  function usuarioTemAcessoObra(u, obraId){
    if(!obraId) return false;
    const obraTxt = String(obraId);
    if(String(u?.obra_id || "") === obraTxt) return true;
    if(listaObrasLiberadas(u).includes(obraTxt)) return true;
    return false;
  }

  function usuarioGlobal(u){
    const perfil = upper(u?.perfil);
    const perms = permissoesUsuario(u);
    return perfil === "MASTER" || perms.includes("VER_TODAS_OBRAS") || perms.includes("NOTIFICACOES_GLOBAIS");
  }

  function usuarioPodeAtenderQualquerOrigem(u){
    const perms = permissoesUsuario(u);
    return usuarioGlobal(u) ||
      perms.includes("VER_ESTOQUE_OUTRAS_OBRAS") ||
      perms.includes("EXPEDICAO_SEPARAR_TODAS_OBRAS");
  }

  function mesmoSolicitante(u, pedido){
    const solicitante = upper(pedido?.solicitante || pedido?.usuario_criacao);
    const usuarioCriacaoId = pedido?.usuario_criacao_id || pedido?.usuario_id || pedido?.solicitante_id || null;

    if(usuarioCriacaoId && String(u?.id || "") === String(usuarioCriacaoId)) return true;
    if(solicitante && [upper(u?.nome), upper(u?.usuario), upper(u?.email)].includes(solicitante)) return true;
    return false;
  }

  function unicoPorId(lista){
    const mapa = new Map();
    (lista || []).forEach(u => {
      if(u && u.id != null) mapa.set(String(u.id), u);
    });
    return Array.from(mapa.values());
  }

  async function buscarUsuariosEmpresa(empresaId){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const campos = "id,nome,usuario,email,empresa_id,obra_id,perfil,cargo,ativo,permissoes,obras_liberadas";

    async function buscar(comFiltroEmpresa){
      let query = banco
        .from("usuarios_sistema")
        .select(campos)
        .eq("ativo", true);

      if(comFiltroEmpresa && empresaId){
        query = query.eq("empresa_id", empresaId);
      }

      const { data, error } = await query;
      if(error) throw error;
      return Array.isArray(data) ? data : [];
    }

    // Primeiro tenta por empresa. Se o pedido não tiver empresa_id correto
    // ou o usuário logado estiver em empresa diferente, não deixa a notificação morrer.
    let lista = await buscar(true);
    if(!lista.length){
      lista = await buscar(false);
    }

    return lista;
  }

  function filtrarResponsaveisOrigem(usuarios, pedido, origemId){
    const base = (usuarios || [])
      .filter(u => u && u.ativo !== false)
      .filter(podeAprovarPedido)
      .filter(u => usuarioAceitaTipoNotificacao(u, "PEDIDO_CRIADO"))
      .filter(u => !mesmoSolicitante(u, pedido));

    // Regra oficial Sprint 2.6.2:
    // 1) Usuários da origem/CD/setor do pedido ou com obra liberada recebem.
    // 2) MASTER/ADMIN globais com permissão explícita também recebem, mesmo sem obra_id.
    // 3) Se não houver ninguém por origem nem global com permissão, usa global operacional como fallback.
    //
    // Importante: não retornamos apenas porOrigem, porque o Saulo pode ser MASTER global
    // e receber todas as notificações de expedição sem estar vinculado ao CD.
    const porOrigem = base.filter(u => usuarioTemAcessoObra(u, origemId));

    const globaisComPermissao = base.filter(u =>
      usuarioGlobal(u) && possuiAlgumaPermissao(u, PERMISSOES_EXPEDICAO)
    );

    const combinados = unicoPorId([...porOrigem, ...globaisComPermissao]);
    if(combinados.length) return combinados;

    const globaisOperacionais = base.filter(usuarioGlobal);
    return unicoPorId(globaisOperacionais);
  }

  function filtrarDestinoSolicitante(usuarios, pedido){
    const solicitante = upper(pedido?.solicitante || pedido?.usuario_criacao);
    const solicitanteId = pedido?.usuario_criacao_id || pedido?.usuario_id || pedido?.solicitante_id || null;

    return unicoPorId((usuarios || [])
      .filter(u => u && u.ativo !== false)
      .filter(usuarioAceitaNotificacoes)
      .filter(u => {
        if(solicitanteId && String(u?.id || "") === String(solicitanteId)) return true;
        return !!solicitante && [upper(u?.nome), upper(u?.usuario), upper(u?.email)].includes(solicitante);
      })
    );
  }

  function resumoItens(itens){
    const lista = Array.isArray(itens) ? itens : [];
    if(!lista.length) return "Itens: não carregados.";

    const nomes = lista.slice(0, 6).map(i => {
      const nome = texto(
        i.patrimonio_nome ||
        i.produto_nome ||
        i.descricao ||
        i.nome ||
        i.patrimonio_codigo ||
        i.produto_id ||
        i.patrimonio_id ||
        i.id ||
        "Item"
      );
      const codigo = texto(i.patrimonio_codigo || i.codigo || "");
      const qtd = Math.max(1, Number(i.quantidade || i.quantidade_solicitada || 1));
      return (codigo && codigo !== nome ? codigo + " — " : "") + nome + " • Qtd: " + qtd;
    });

    let msg = "Itens: " + nomes.join("; ");
    if(lista.length > nomes.length){
      msg += "; +" + (lista.length - nomes.length) + " item(ns)";
    }
    return msg;
  }

  function mensagemPedidoCriado(pedido, itens){
    return "Pedido " + (pedido.codigo || "#" + pedido.id) +
      " aguardando análise. Solicitante: " + (pedido.solicitante || pedido.usuario_criacao || "-") +
      ". " + resumoItens(itens);
  }

  async function criarNotificacao({ usuario_destino_id, empresa_id, tipo, titulo, mensagem, link, pedido_id, obra_origem_id, obra_destino_id, patrimonio_id, produto_id }){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");
    if(!usuario_destino_id) return false;

    /*
     * Proteção central:
     * nenhuma rotina pode inserir notificação para usuário que
     * desmarcou RECEBER_NOTIFICACOES.
     */
    const { data: usuarioDestino, error: erroUsuarioDestino } = await banco
      .from("usuarios_sistema")
      .select("id,ativo,permissoes")
      .eq("id", usuario_destino_id)
      .maybeSingle();

    if(erroUsuarioDestino){
      console.warn(
        "AtlasGestorNotificacoes: falha ao validar preferência do destinatário.",
        erroUsuarioDestino.message || erroUsuarioDestino
      );
      return false;
    }

    if(!usuarioAceitaTipoNotificacao(usuarioDestino, tipo)){
      void 0;
      return false;
    }

    const payload = {
      empresa_id: empresa_id || empresaAtualId(),
      usuario_destino_id,
      tipo: tipo || "FLUXO",
      titulo: titulo || "Notificação",
      mensagem: mensagem || "",
      link: link === undefined ? "expedicao.html" : (link || null),
      lida: false,
      status: "NAO_LIDA",
      pedido_id: pedido_id || null,
      obra_origem_id: obra_origem_id || null,
      obra_destino_id: obra_destino_id || null,
      patrimonio_id: patrimonio_id || null,
      produto_id: produto_id || null,
      created_at: new Date().toISOString()
    };

    const { error } = await banco.from("notificacoes").insert([payload]);
    if(error) throw error;

    emitir("notificacao.criada", {
      modulo:"CORE",
      descricao:"Notificação criada pelo Atlas Gestor de Notificações.",
      notificacao:{ ...payload },
      usuario_destino_id,
      pedido_id: payload.pedido_id,
      obra_origem_id: payload.obra_origem_id,
      obra_destino_id: payload.obra_destino_id,
      tipo: payload.tipo,
      titulo: payload.titulo
    });

    return true;
  }

  function ehUsuarioAtual(u){
    const atual = usuarioAtual();
    if(!u || !atual) return false;
    if(atual.id != null && u.id != null && String(atual.id) === String(u.id)) return true;
    const identidadesAtual = [atual.nome, atual.usuario, atual.email].map(upper).filter(Boolean);
    const identidadesDestino = [u.nome, u.usuario, u.email].map(upper).filter(Boolean);
    return identidadesAtual.some(v => identidadesDestino.includes(v));
  }

  async function notificarLista(usuarios, payloadBase){
    // Regra central: quem executou a ação recebe feedback visual, nunca uma
    // notificação sobre a própria ação. Vale para todos os fluxos que usam o Gestor.
    const lista = unicoPorId(usuarios || []).filter(u => !ehUsuarioAtual(u));
    let total = 0;

    for(const u of lista){
      const ok = await criarNotificacao({
        ...payloadBase,
        usuario_destino_id: u.id,
        empresa_id: u.empresa_id || payloadBase.empresa_id || empresaAtualId()
      });
      if(ok) total++;
    }

    if(typeof window.bdrCarregarNotificacoes === "function"){
      try{ await window.bdrCarregarNotificacoes(); }catch(e){}
    }

    return total;
  }

  async function notificarPedidoCriado(pedido, itens){
    const empresaId = pedido?.empresa_id || empresaAtualId();
    const origemId = pedido?.obra_origem_id || null;
    const destinoId = pedido?.obra_destino_id || pedido?.obra_id || null;

    if(!origemId){
      return { ok:false, motivo:"Pedido sem obra de origem definida.", origemId, destinoId };
    }

    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    // A responsabilidade operacional da origem vem da relação usuario_obras.
    // Não limita por empresa: uma obra pode pertencer a empresa diferente da sessão
    // do solicitante, como no fluxo LABORATÓRIO (22) -> SATH (33).
    const { data: vinculos, error: erroVinculos } = await banco
      .from("usuario_obras")
      .select("usuario_id")
      .eq("obra_id", origemId);
    if(erroVinculos) throw erroVinculos;

    const idsOrigem = [...new Set((vinculos || [])
      .map(v => Number(v.usuario_id || 0))
      .filter(Boolean))];

    if(!idsOrigem.length){
      return { ok:false, motivo:"Nenhum usuário vinculado à obra de origem.", origemId, destinoId };
    }

    const campos = "id,nome,usuario,email,empresa_id,obra_id,perfil,cargo,ativo,permissoes,obras_liberadas";
    const { data: usuariosOrigem, error: erroUsuarios } = await banco
      .from("usuarios_sistema")
      .select(campos)
      .in("id", idsOrigem)
      .eq("ativo", true);
    if(erroUsuarios) throw erroUsuarios;

    const responsaveis = unicoPorId((usuariosOrigem || [])
      .filter(podeAprovarPedido)
      .filter(u => usuarioAceitaTipoNotificacao(u, "PEDIDO_CRIADO"))
      .filter(u => !mesmoSolicitante(u, pedido)));

    if(!responsaveis.length){
      return { ok:false, motivo:"Nenhum responsável da origem está habilitado para aprovar e receber notificações de pedidos.", origemId, destinoId };
    }

    const qtdItens = (itens || []).reduce((total, item) => {
      const qtd = Number(item?.quantidade || item?.quantidade_solicitada || 1);
      return total + (Number.isFinite(qtd) && qtd > 0 ? qtd : 1);
    }, 0);
    const solicitante = pedido?.solicitante || pedido?.usuario_criacao || "Usuário";
    const obraDestino = pedido?.obra_nome || (destinoId ? "Obra " + destinoId : "obra de destino");
    const codigo = pedido?.codigo || ("#" + pedido?.id);
    const mensagem = solicitante + " • " + obraDestino + " solicitou " + qtdItens + " item" + (qtdItens === 1 ? "" : "s") + ".\nPedido " + codigo + ".\nClique para analisar.";

    const total = await notificarLista(responsaveis, {
      empresa_id: null,
      tipo:"PEDIDO_CRIADO",
      titulo:"📦 Nova solicitação de material",
      mensagem,
      link:"atlas.html?m=expedicao&aba=solicitacoes&pedido=" + encodeURIComponent(pedido.id),
      pedido_id:pedido.id,
      obra_origem_id:origemId,
      obra_destino_id:destinoId
    });

    emitir("pedido.criado", {
      modulo:"EXPEDICAO",
      empresa_id:empresaId,
      pedido_id:pedido.id,
      obra_origem_id:origemId,
      obra_destino_id:destinoId,
      usuario_nome:solicitante,
      descricao:"Pedido criado e notificado para os aprovadores vinculados à obra de origem.",
      dados_json:{ notificacoes:total, itens:(itens || []).length }
    });

    return {
      ok:total > 0,
      notificacoes:total,
      origemId,
      destinoId,
      motivo:total > 0 ? null : "Responsáveis encontrados, mas as preferências bloquearam a notificação.",
      destinatarios:responsaveis.map(u => ({id:u.id,nome:u.nome,perfil:u.perfil,obra_id:u.obra_id}))
    };
  }

  async function notificarTransferenciaCriada(pedido, itens){
    const empresaId = pedido?.empresa_id || empresaAtualId();
    const origemId = pedido?.obra_origem_id || null;
    const destinoId = pedido?.obra_destino_id || pedido?.obra_id || null;
    // Transferências podem ocorrer entre obras vinculadas a empresas diferentes.
    // Por isso o destinatário é resolvido pela OBRA DESTINO, sem restringir
    // previamente pela empresa do usuário que criou a remessa.
    const usuarios = await buscarUsuariosEmpresa(null);

    // Transferência direta é um aviso ao destino, não uma solicitação de aprovação.
    // O executor não recebe a própria notificação.
    // Aviso operacional obrigatório da transferência: qualquer usuário ativo com
    // acesso à obra destino recebe, independentemente da preferência geral de sino.
    // O executor continua excluído para não receber a própria ação.
    const destinatarios = unicoPorId((usuarios || [])
      .filter(u => u && u.ativo !== false)
      .filter(u => usuarioTemAcessoObra(u, destinoId))
      .filter(u => !mesmoSolicitante(u, pedido)));

    const lista = Array.isArray(itens) ? itens : [];
    const pats = lista
      .filter(i => i?.patrimonio_id)
      .map(i => {
        const codigo = texto(i.patrimonio_codigo || ("PAT #" + i.patrimonio_id));
        const nome = texto(i.patrimonio_nome || "Patrimônio");
        return codigo + " — " + nome;
      });

    const visiveis = pats.slice(0, 3);
    let resumo = visiveis.join("; ");
    if(pats.length > 3) resumo += "; + " + (pats.length - 3) + " patrimônio(s)";
    if(!resumo) resumo = lista.length + " item(ns)";

    const codigoRemessa = pedido?.codigo || ("#" + pedido?.id);
    const origemNome = pedido?.obra_origem_nome || pedido?.origem_nome || "obra de origem";
    const destinoNome = pedido?.obra_nome || pedido?.obra_destino_nome || "obra destino";

    const total = await notificarLista(destinatarios, {
      empresa_id:empresaId,
      tipo:"TRANSFERENCIA_CRIADA",
      titulo:"📦 Nova transferência para " + destinoNome,
      mensagem:"Remessa " + codigoRemessa + " • Aguardando saída. " + resumo,
      link:"expedicao.html?aba=receber&pedido=" + pedido.id,
      pedido_id:pedido.id,
      obra_origem_id:origemId,
      obra_destino_id:destinoId,
      patrimonio_id:pats.length === 1 ? (lista.find(i => i?.patrimonio_id)?.patrimonio_id || null) : null
    });

    emitir("transferencia.criada", {
      modulo:"PATRIMONIO",
      empresa_id:empresaId,
      pedido_id:pedido.id,
      obra_origem_id:origemId,
      obra_destino_id:destinoId,
      descricao:"Transferência criada e destino notificado.",
      dados_json:{ notificacoes:total, patrimonios:pats.length }
    });

    return {
      ok:total > 0,
      notificacoes:total,
      destinatarios:destinatarios.map(u => ({id:u.id,nome:u.nome,perfil:u.perfil,obra_id:u.obra_id}))
    };
  }

  async function notificarTransferenciaEmTransito(pedido, itens, dadosTransporte){
    const empresaId = pedido?.empresa_id || empresaAtualId();
    const origemId = pedido?.obra_origem_id || null;
    const destinoId = pedido?.obra_destino_id || pedido?.obra_id || null;
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const motorista = texto(dadosTransporte?.motorista_nome || dadosTransporte?.motorista || "-");
    const placa = texto(dadosTransporte?.veiculo_placa || dadosTransporte?.placa || "-");
    const codigo = pedido?.codigo || ("#" + pedido?.id);
    const mensagem = "Remessa " + codigo + " chegou à fila de recebimento do destino. " +
      "Motorista: " + motorista + " • Placa: " + placa + ".";

    // Recebimento é uma tarefa da obra de destino. Usa o vínculo oficial usuario_obras,
    // evitando mandar o usuário para a aba Em trânsito sem ação de recebimento.
    const { data:vinculos, error:erroVinculos } = await banco
      .from("usuario_obras")
      .select("usuario_id")
      .eq("obra_id", destinoId);
    if(erroVinculos) throw erroVinculos;

    const idsDestino = [...new Set((vinculos || [])
      .map(v => Number(v.usuario_id || 0))
      .filter(Boolean))];

    let destinatarios = [];
    if(idsDestino.length){
      const { data:usuariosDestino, error:erroUsuarios } = await banco
        .from("usuarios_sistema")
        .select("id,nome,usuario,email,empresa_id,obra_id,perfil,cargo,ativo,permissoes,obras_liberadas")
        .in("id", idsDestino)
        .eq("ativo", true);
      if(erroUsuarios) throw erroUsuarios;
      destinatarios = unicoPorId((usuariosDestino || []).filter(usuarioAceitaNotificacoes));
    }

    const total = await notificarLista(destinatarios, {
      empresa_id:empresaId,
      tipo:"PEDIDO_A_RECEBER",
      titulo:"📥 Remessa a receber",
      mensagem,
      link:"atlas.html?m=expedicao&aba=receber&pedido=" + pedido.id,
      pedido_id:pedido.id,
      obra_origem_id:origemId,
      obra_destino_id:destinoId
    });

    emitir("transferencia.em_transito", {
      modulo:"EXPEDICAO",
      empresa_id:empresaId,
      pedido_id:pedido.id,
      obra_origem_id:origemId,
      obra_destino_id:destinoId,
      descricao:"Remessa enviada e destino notificado para recebimento.",
      dados_json:{ notificacoes:total, motorista, placa }
    });

    return {
      ok:total > 0,
      notificacoes:total,
      destinatarios:destinatarios.map(u => ({id:u.id,nome:u.nome,perfil:u.perfil,obra_id:u.obra_id}))
    };
  }

  async function notificarOwnerTransferenciaConcluida(pedido, itens, dadosRecebimento){
    const banco = db();
    if(!banco) return { ok:false, notificacoes:0 };

    const { data:owner, error } = await banco
      .from("usuarios_sistema")
      .select("id,nome,empresa_id,ativo,permissoes")
      .eq("id", 1)
      .maybeSingle();
    if(error || !owner || owner.ativo === false) return { ok:false, notificacoes:0 };

    const lista = Array.isArray(itens) ? itens : [];
    const pats = lista.filter(i => i?.patrimonio_id).map(i => texto(i.patrimonio_codigo || ("PAT #" + i.patrimonio_id)));
    let resumo = pats.slice(0,3).join(", ");
    if(pats.length > 3) resumo += " + " + (pats.length - 3) + " patrimônio(s)";

    const divergencia = !!dadosRecebimento?.divergencia;
    const codigo = pedido?.codigo || ("#" + pedido?.id);
    const total = await notificarLista([owner], {
      empresa_id:owner.empresa_id || pedido?.empresa_id || empresaAtualId(),
      tipo:"TRANSFERENCIA_CONCLUIDA",
      titulo:divergencia ? "⚠️ Transferência concluída com divergência" : "✅ Transferência concluída",
      mensagem:"Remessa " + codigo + (resumo ? " • " + resumo : "") + " • Recebida por " + texto(dadosRecebimento?.recebido_por || dadosRecebimento?.usuario || "usuário do destino") + (divergencia ? " • Com divergência." : " • Sem divergência."),
      link:"expedicao.html?aba=historico&pedido=" + pedido.id,
      pedido_id:pedido.id,
      obra_origem_id:pedido?.obra_origem_id || null,
      obra_destino_id:pedido?.obra_destino_id || pedido?.obra_id || null,
      patrimonio_id:pats.length === 1 ? (lista.find(i => i?.patrimonio_id)?.patrimonio_id || null) : null
    });

    return { ok:total > 0, notificacoes:total };
  }

  async function notificarDestinoPedido(pedido, tipo, titulo, mensagem, link){
    const empresaId = pedido?.empresa_id || empresaAtualId();
    // O solicitante pode pertencer a outra empresa da obra de origem.
    // Resolve pelo usuário exato, sem limitar a busca pela empresa da sessão/pedido.
    const usuarios = await buscarUsuariosEmpresa(null);
    const destino = filtrarDestinoSolicitante(usuarios, pedido);

    const total = await notificarLista(destino, {
      empresa_id:empresaId,
      tipo,
      titulo,
      mensagem,
      link:link === undefined ? "expedicao.html?aba=historico" : (link || null),
      pedido_id:pedido.id,
      obra_origem_id:pedido.obra_origem_id || null,
      obra_destino_id:pedido.obra_destino_id || pedido.obra_id || null
    });

    return { ok:true, notificacoes:total, destinatarios:destino.map(u => ({id:u.id,nome:u.nome,perfil:u.perfil,obra_id:u.obra_id})) };
  }



  async function notificarSeparacaoPedido(pedido, usuarioAprovador){
    const empresaId = pedido?.empresa_id || empresaAtualId();
    const origemId = pedido?.obra_origem_id || null;
    const destinoId = pedido?.obra_destino_id || pedido?.obra_id || null;
    const itens = Array.isArray(pedido?.itens_retirada) ? pedido.itens_retirada : [];

    // A tarefa de separação pertence estritamente à obra de origem.
    // A fonte de verdade é usuario_obras: ter SEPARAR_PEDIDO não autoriza
    // separar material de uma obra à qual o usuário não está vinculado.
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const { data:vinculosOrigem, error:erroVinculosOrigem } = await banco
      .from("usuario_obras")
      .select("usuario_id")
      .eq("obra_id", origemId);
    if(erroVinculosOrigem) throw erroVinculosOrigem;

    const idsOrigem = new Set((vinculosOrigem || [])
      .map(v => String(v?.usuario_id || ""))
      .filter(Boolean));

    const usuarios = await buscarUsuariosEmpresa(null);

    /*
      REGRA OFICIAL ATLAS:
      - Solicitante recebe somente o andamento do próprio pedido.
      - A tarefa operacional vai somente para quem pode separar E está
        vinculado à obra de origem em usuario_obras.
      - Perfil/cargo sozinho não concede acesso a outra obra.
    */
    let separadores = unicoPorId(
      (usuarios || [])
        .filter(u => u && u.ativo !== false)
        .filter(u => !estaBloqueadoExpedicao(u))
        .filter(u => {
          const permissaoSeparar = possuiAlgumaPermissao(u, ["EXPEDICAO_SEPARAR", "SEPARAR_PEDIDO"]);
          const recebeNotif = possuiAlgumaPermissao(u, [
            "RECEBER_NOTIFICACOES",
            "RECEBER_NOTIFICACOES_EXPEDICAO",
            "RECEBER_NOTIFICACOES_MOVIMENTACOES"
          ]);
          const vinculadoOrigem = idsOrigem.has(String(u?.id || ""));

          return permissaoSeparar && recebeNotif && vinculadoOrigem;
        })
        .filter(u => {
          const atual = usuarioAtual() || {};
          const mesmoId = atual?.id && String(u?.id || "") === String(atual.id);
          const aprovador = upper(usuarioAprovador);
          const mesmoNome = aprovador && [upper(u?.nome), upper(u?.usuario), upper(u?.email)].includes(aprovador);
          return !mesmoId && !mesmoNome;
        })
    );


    const total = await notificarLista(separadores, {
      empresa_id:empresaId,
      tipo:"PEDIDO_AGUARDANDO_SEPARACAO",
      titulo:"📦 Novo pedido para Expedição",
      mensagem:
        "Pedido " + (pedido?.codigo || "#" + pedido?.id) +
        " foi autorizado por " + (usuarioAprovador || "responsável") +
        " e aguarda preparação na obra de origem. " + resumoItens(itens),
      link:"atlas.html?m=expedicao&aba=separacao&pedido=" + encodeURIComponent(pedido?.id || ""),
      pedido_id:pedido?.id || null,
      obra_origem_id:origemId,
      obra_destino_id:destinoId
    });

    return {
      ok:total > 0,
      notificacoes:total,
      destinatarios:separadores.map(u => ({
        id:u.id,
        nome:u.nome,
        perfil:u.perfil,
        obra_id:u.obra_id
      }))
    };
  }


  /* =========================================================
     AÇÃO DE RETIRADA / TRANSPORTE
  ========================================================= */
  async function notificarRetiradaPedido(pedido, usuarioSeparacao){
    const empresaId = pedido?.empresa_id || empresaAtualId();
    const origemId = pedido?.obra_origem_id || null;
    const destinoId = pedido?.obra_destino_id || pedido?.obra_id || null;
    const usuarios = await buscarUsuariosEmpresa(empresaId);
    const executor = usuarioAtual() || {};
    const executorId = Number(executor.id || executor.usuario_id || 0);
    const executorNome = upper(
      executor.nome ||
      executor.usuario ||
      usuarioSeparacao ||
      ""
    );

    const responsaveis = unicoPorId((usuarios || [])
      .filter(u => u && u.ativo !== false)
      .filter(u => !estaBloqueadoExpedicao(u))
      .filter(u => usuarioTemAcessoObra(u, origemId))
      .filter(u => possuiAlgumaPermissao(u,[
        "EXPEDICAO_TRANSPORTE",
        "EXPEDICAO_ENTREGAR",
        "ENTREGAR_MATERIAL"
      ]))
      .filter(u => possuiAlgumaPermissao(u,[
        "RECEBER_NOTIFICACOES",
        "RECEBER_NOTIFICACOES_EXPEDICAO",
        "RECEBER_NOTIFICACOES_MOVIMENTACOES"
      ]))
      /*
       * Quem concluiu a separação já recebeu a confirmação local.
       * Não enviamos também a notificação azul para a mesma pessoa.
       */
      .filter(u => {
        const mesmoId =
          executorId > 0 &&
          Number(u.id || u.usuario_id || 0) === executorId;

        const nomeDestino = upper(u.nome || u.usuario || "");
        const mesmoNome =
          !!executorNome &&
          !!nomeDestino &&
          nomeDestino === executorNome;

        return !mesmoId && !mesmoNome;
      })
    );
    const total = await notificarLista(responsaveis,{
      empresa_id:empresaId,tipo:"PEDIDO_AGUARDANDO_RETIRADA",titulo:"🚚 Pedido pronto para transporte",
      mensagem:"Pedido " + (pedido?.codigo || "#" + pedido?.id) + " foi separado por " + (usuarioSeparacao || "almoxarifado") + ". Informe motorista, veículo e placa para colocar o pedido em trânsito.",
      link:"expedicao.html?aba=retirada",pedido_id:pedido?.id || null,obra_origem_id:origemId,obra_destino_id:destinoId
    });
    return {ok:total>0,notificacoes:total,destinatarios:responsaveis.map(u=>({id:u.id,nome:u.nome,perfil:u.perfil,obra_id:u.obra_id}))};
  }

  /* =========================================================
     AVISO INFORMATIVO PARA A OBRA DE ORIGEM
     Usado quando a origem precisa acompanhar o fluxo.
  ========================================================= */
  async function notificarOrigemPedido(pedido, tipo, titulo, mensagem, link){
    const empresaId = pedido?.empresa_id || empresaAtualId();
    const origemId = pedido?.obra_origem_id || null;
    const ehConfirmacaoRecebimento = upper(tipo).includes("RECEB");

    /*
     * Confirmação de recebimento precisa voltar para a OBRA DE ORIGEM,
     * mesmo quando origem e destino pertencem a empresas diferentes.
     * Ex.: Laboratório (empresa 17) -> SATH (empresa 20).
     * Na sessão do destino, empresaAtualId() é a empresa 20; filtrar usuários
     * por essa empresa fazia a Thayanne/origem desaparecer antes do filtro de obra.
     */
    const usuarios = await buscarUsuariosEmpresa(ehConfirmacaoRecebimento ? null : empresaId);

    const destinatarios = unicoPorId(
      (usuarios || [])
        .filter(u => u && u.ativo !== false)
        .filter(u => !estaBloqueadoExpedicao(u))
        .filter(u => usuarioAceitaTipoNotificacao(u, tipo))
        .filter(u => {
          if(ehConfirmacaoRecebimento){
            // No fechamento, avisa somente quem acompanha a obra de origem.
            // O OWNER/ID 1 já recebe o aviso de controle em rotina própria.
            return usuarioTemAcessoObra(u, origemId);
          }
          return usuarioTemAcessoObra(u, origemId) ||
            (
              usuarioGlobal(u) &&
              possuiAlgumaPermissao(u, PERMISSOES_EXPEDICAO)
            );
        })
    );

    // No recebimento entre empresas, a notificação persistente pertence à
    // empresa do REMETENTE/origem. Usar empresaAtualId() aqui gravava, por
    // exemplo, a confirmação da Thayanne (empresa 17) como empresa 20 quando
    // o Sávio confirmava o recebimento na SATH. O toast chegava em tempo real,
    // mas o sininho da origem não encontrava a notificação depois.
    const empresaNotificacao = ehConfirmacaoRecebimento
      ? (destinatarios.find(u => u?.empresa_id)?.empresa_id || empresaId)
      : empresaId;

    const total = await notificarLista(destinatarios, {
      empresa_id:empresaNotificacao,
      tipo,
      titulo,
      mensagem,
      link:link === undefined ? "expedicao.html?aba=historico" : (link || null),
      pedido_id:pedido?.id || null,
      obra_origem_id:origemId,
      obra_destino_id:pedido?.obra_destino_id || pedido?.obra_id || null
    });

    return {
      ok:total > 0,
      notificacoes:total,
      destinatarios:destinatarios.map(u => ({
        id:u.id,
        nome:u.nome,
        perfil:u.perfil,
        obra_id:u.obra_id
      }))
    };
  }

  async function diagnosticarPedidoCriado(pedido, itens){
    const empresaId = pedido?.empresa_id || empresaAtualId();
    const origemId = pedido?.obra_origem_id || null;
    const usuarios = await buscarUsuariosEmpresa(empresaId);
    const linhas = (usuarios || []).map(u => ({
      id:u.id,
      nome:u.nome,
      perfil:u.perfil,
      empresa_id:u.empresa_id,
      obra_id:u.obra_id,
      ativo:u.ativo,
      tem_permissao:possuiAlgumaPermissao(u, PERMISSOES_EXPEDICAO),
      bloqueado:estaBloqueadoExpedicao(u),
      acesso_origem:usuarioTemAcessoObra(u, origemId),
      global:usuarioGlobal(u),
      mesmo_solicitante:mesmoSolicitante(u, pedido),
      aceita_notificacao:usuarioAceitaNotificacoes(u)
    }));
    console.table(linhas);
    return linhas;
  }

  Gestor.buscarUsuariosEmpresa = buscarUsuariosEmpresa;
  Gestor.filtrarResponsaveisOrigem = filtrarResponsaveisOrigem;
  Gestor.filtrarDestinoSolicitante = filtrarDestinoSolicitante;
  Gestor.criarNotificacao = criarNotificacao;
  Gestor.notificarLista = notificarLista;
  Gestor.notificarPedidoCriado = notificarPedidoCriado;
  Gestor.notificarTransferenciaCriada = notificarTransferenciaCriada;
  Gestor.notificarTransferenciaEmTransito = notificarTransferenciaEmTransito;
  Gestor.notificarOwnerTransferenciaConcluida = notificarOwnerTransferenciaConcluida;
  Gestor.notificarDestinoPedido = notificarDestinoPedido;
  Gestor.notificarSeparacaoPedido = notificarSeparacaoPedido;
  Gestor.notificarRetiradaPedido = notificarRetiradaPedido;
  Gestor.notificarOrigemPedido = notificarOrigemPedido;
  Gestor.usuarioPodeAtenderQualquerOrigem = usuarioPodeAtenderQualquerOrigem;
  Gestor.usuarioAceitaNotificacoes = usuarioAceitaNotificacoes;
  Gestor.usuarioAceitaTipoNotificacao = usuarioAceitaTipoNotificacao;
  Gestor.usuarioTemAcessoObra = usuarioTemAcessoObra;
  Gestor.diagnosticarPedidoCriado = diagnosticarPedidoCriado;

  window.AtlasGestorNotificacoes = Gestor;

  void 0;
})();

void 0;
