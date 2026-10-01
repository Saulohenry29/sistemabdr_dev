/* =========================================================
   ATLAS EVENT STORE V1.1
   Arquivo: JS/atlasEventStore.js
   Sprint 2.5.1: Persistência automática em atlas_eventos
========================================================= */
(function(){
  "use strict";

  if(window.AtlasEventStore && window.AtlasEventStore.__loaded){
    console.warn("Atlas Event Store já carregado. Ignorando duplicado.");
    return;
  }

  const AtlasEventStore = {
    __loaded:true,
    versao:"1.1",
    ligado:false,
    eventosIgnorados:new Set([
      "atlas.evento.gravado",
      "atlas.evento.erro",
      "atlas.eventstore.gravado",
      "atlas.eventstore.erro"
    ])
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
    }catch(e){ return null; }
  }

  function eventoOficial(evento){
    const e = String(evento || "").trim();
    if(!e) return false;
    if(AtlasEventStore.eventosIgnorados.has(e)) return false;
    // Eventos oficiais do Atlas seguem o padrão modulo.acao
    return e.includes(".");
  }

  function montarPayload(evento, dados){
    const u = usuarioAtual() || {};
    const d = dados || {};

    return {
      evento:String(evento),
      modulo:d.modulo || String(evento).split(".")[0]?.toUpperCase() || "CORE",
      empresa_id:d.empresa_id || u.empresa_id || null,
      pedido_id:d.pedido_id || null,
      patrimonio_id:d.patrimonio_id || null,
      produto_id:d.produto_id || null,
      usuario_id:d.usuario_id || u.id || u.usuario_id || null,
      usuario_nome:d.usuario_nome || u.nome || u.usuario || "SISTEMA",
      obra_origem_id:d.obra_origem_id || null,
      obra_destino_id:d.obra_destino_id || null,
      descricao:d.descricao || d.mensagem || d.titulo || "Evento registrado pelo Atlas.",
      dados_json:d.dados_json || d || {},
      created_at:d.created_at || new Date().toISOString()
    };
  }

  async function gravarEvento(evento, dados){
    if(!eventoOficial(evento)) return { ok:false, ignorado:true, evento };

    const banco = db();
    if(!banco || typeof banco.from !== "function"){
      console.warn("AtlasEventStore: Supabase não carregado.");
      return { ok:false, motivo:"Supabase não carregado", evento };
    }

    const payload = montarPayload(evento, dados);

    const { data, error } = await banco
      .from("atlas_eventos")
      .insert([payload])
      .select("id")
      .single();

    if(error){
      console.error("AtlasEventStore: erro ao gravar evento", error);
      try{
        window.AtlasEvents?.emit?.("atlas.eventstore.erro", { evento, erro:error.message, payload });
      }catch(e){}
      return { ok:false, error, payload };
    }

    try{
      window.dispatchEvent(new CustomEvent("atlas:eventstore:gravado", {
        detail:{ id:data?.id || null, evento, payload }
      }));
    }catch(e){}

    void 0;
    return { ok:true, id:data?.id || null, payload };
  }

  function ligarEventBus(){
    if(AtlasEventStore.ligado) return true;

    if(!window.AtlasEvents){
      console.warn("AtlasEventStore: AtlasEvents ainda não carregado.");
      return false;
    }

    if(typeof window.AtlasEvents.onAny === "function"){
      window.AtlasEvents.onAny((evento, dados) => {
        gravarEvento(evento, dados);
      });
      AtlasEventStore.ligado = true;
      void 0;
      return true;
    }

    // Fallback: escuta CustomEvent emitido pelo AtlasEvents V1.1.
    window.addEventListener("atlas:evento", function(e){
      const detail = e.detail || {};
      gravarEvento(detail.evento, detail.dados || {});
    });
    AtlasEventStore.ligado = true;
    void 0;
    return true;
  }

  AtlasEventStore.gravarEvento = gravarEvento;
  AtlasEventStore.montarPayload = montarPayload;
  AtlasEventStore.ligarEventBus = ligarEventBus;

  window.AtlasEventStore = AtlasEventStore;

  setTimeout(ligarEventBus, 50);

  void 0;
})();
